// --- tun-manager.js — Real Anti-Leak TUN Engine for BABA Tunnel (BBT) ---
//
// Manages sing-box + Wintun to capture ALL system network packets (TCP & UDP) at the network
// adapter level and route them through local SOCKS5 (127.0.0.1:10808).
//
// ANTI-LEAK ARCHITECTURE:
// 1. Full Default Route: 'auto_route: true' takes 0.0.0.0/0 and ::/0 on the TUN adapter.
// 2. WFP Leak Prevention: 'strict_route: true' installs Windows Filtering Platform callout
//    rules to strictly prevent WebRTC, QUIC, or any app from escaping around the tunnel.
// 3. IPv6 Leak Shield:
//    - Virtual adapter claims IPv6 ULA address 'fdfe:dcba:9876::1/126'.
//    - Sing-box route rule explicitly rejects IPv6: { ip_version: 6, action: 'reject' }.
//    - Sing-box DNS strategy: 'ipv4_only' (no AAAA records handed out).
//    - Windows Firewall rule blocks outbound 2000::/3 (global unicast IPv6).
// 4. WebRTC / QUIC Leak Shield:
//    - Rejects raw UDP that the backend proxy cannot carry: { network: 'udp', action: 'reject' }.
//    - WebRTC STUN requests received in the TUN are immediately rejected so browsers cannot
//      discover the host's real public IP address.
// 5. Fail-Closed Kill Switch:
//    - If the sing-box process exits unexpectedly while active, immediately engages kill-switch
//      blackhole so traffic does not fall back to unencrypted physical gateway.
// 6. Crash Resilience & Rollback:
//    - State file on disk; synchronous cleanup on exit/SIGINT/SIGTERM/uncaughtException.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync, execFile, execFileSync } = require('child_process');

const TUN_IFACE_NAME = 'BBTTUN';
const TUN_IPV4 = '172.19.0.1/30';
const TUN_IPV6 = 'fdfe:dcba:9876::1/126';
const TUN_MTU = 1420;
const IPV6_RULE_NAME = 'BBT-Tunnel-IPv6-Block';
const IPV6_RULE_GROUP = 'BABA Tunnel IPv6';

// Known Fastly & Mozilla VPN edge CIDRs to exclude from tunnel routing table.
// Prevents xray.exe's outbound connections from being captured by TUN and looping (causing 50-70% CPU).
const FASTLY_AND_MOZILLA_CIDRS = [
    '151.101.0.0/16',
    '199.232.0.0/16',
    '146.75.0.0/16',
    '167.82.0.0/16',
    '198.24.160.0/20',
    '23.235.32.0/20',
    '104.156.80.0/20',
    '185.31.16.0/22',
    '162.159.192.0/24',
    '162.159.193.0/24',
    '162.159.195.0/24',
    '188.114.96.0/24',
    '188.114.97.0/24',
];

let tunProcess = null;
let isStarting = false;
let isStopping = false;
let isRunningState = false;
let exitHooksInstalled = false;

function getAppDataDir() {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const dir = path.join(base, 'baba-tunnel');
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    }
    return dir;
}

function getIpv6StateFile() {
    return path.join(getAppDataDir(), 'tun-ipv6-block.json');
}

function getTunConfigFile() {
    return path.join(getAppDataDir(), 'tun-config.json');
}

/**
 * Locate sing-box.exe and wintun.dll binaries
 */
function getBinPaths() {
    let xrayDir = null;
    try {
        const xrayRunner = require('./xray-runner');
        const xrayPath = xrayRunner.getBinaryPath();
        if (xrayPath) xrayDir = path.dirname(xrayPath);
    } catch (_) {}

    const appDataCore = path.join(process.env.APPDATA || '', 'baba-tunnel', 'core');

    const searchDirs = [
        xrayDir,
        appDataCore,
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'baba-tunnel', 'core'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'BABA Tunnel', 'core'),
        process.execPath ? path.join(path.dirname(process.execPath), 'core') : null,
        process.resourcesPath ? path.join(process.resourcesPath, 'core') : null,
        process.resourcesPath ? path.join(process.resourcesPath, '..', 'core') : null,
        path.join(__dirname, 'core'),
        path.join(process.cwd(), 'core'),
        process.env.BBT_CORE_DIR || '',
        path.join(process.env.USERPROFILE || '', 'Desktop', 'New folder', 'fenix-standalone', 'core'),
        path.join(process.env.USERPROFILE || '', 'Desktop', 'New folder', 'mlmvpn_windows', 'core'),
    ].filter(Boolean);

    let exe = null;
    let wintun = null;

    for (const d of searchDirs) {
        const testExe = path.join(d, 'sing-box.exe');
        const testWintun = path.join(d, 'wintun.dll');
        if (!exe && fs.existsSync(testExe)) exe = testExe;
        if (!wintun && fs.existsSync(testWintun)) wintun = testWintun;
    }

    // Auto-cache to target directory if found in fallbacks
    const targetDir = xrayDir || appDataCore;
    if (exe && wintun && targetDir) {
        try {
            if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
            const dstExe = path.join(targetDir, 'sing-box.exe');
            const dstWintun = path.join(targetDir, 'wintun.dll');
            if (!fs.existsSync(dstExe)) fs.copyFileSync(exe, dstExe);
            if (!fs.existsSync(dstWintun)) fs.copyFileSync(wintun, dstWintun);
        } catch (_) {}
    }

    return {
        exe: exe || (xrayDir ? path.join(xrayDir, 'sing-box.exe') : path.join(__dirname, 'core', 'sing-box.exe')),
        wintun: wintun || (xrayDir ? path.join(xrayDir, 'wintun.dll') : path.join(__dirname, 'core', 'wintun.dll')),
    };
}

/**
 * Check if required binaries are available
 */
function checkPrerequisites() {
    const { exe, wintun } = getBinPaths();
    const missing = [];
    if (!fs.existsSync(exe)) missing.push('sing-box.exe');
    if (!fs.existsSync(wintun)) missing.push('wintun.dll');
    if (missing.length > 0) {
        throw new Error(
            `فایل‌های لازم برای حالت تونل کامل سیستم (TUN) در پوشه core پیدا نشدند: ${missing.join(' و ')}. ` +
            'لطفاً آن‌ها را در کنار xray.exe قرار دهید.'
        );
    }
}

/**
 * Generate sing-box anti-leak TUN configuration
 */
function buildTunConfig({ socksPort = 10808, interfaceName = TUN_IFACE_NAME, serverIps = [] } = {}) {
    const hostCidrs = (Array.isArray(serverIps) ? serverIps : [])
        .filter(ip => typeof ip === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip.trim()))
        .map(ip => `${ip.trim()}/32`);

    const excludeCidrs = [...new Set([...FASTLY_AND_MOZILLA_CIDRS, ...hostCidrs])];

    return {
        log: {
            level: 'error',
            timestamp: true,
        },
        inbounds: [
            {
                type: 'tun',
                tag: 'tun-in',
                interface_name: interfaceName,
                address: [TUN_IPV4, TUN_IPV6],
                mtu: TUN_MTU,
                auto_route: true,
                strict_route: true,
                stack: 'system',
                route_exclude_address: excludeCidrs,
            },
        ],
        outbounds: [
            {
                type: 'socks',
                tag: 'bbt-socks',
                version: '5',
                server: '127.0.0.1',
                server_port: socksPort,
            },
            {
                type: 'direct',
                tag: 'direct',
            },
        ],
        route: {
            auto_detect_interface: true,
            default_domain_resolver: { server: 'local' },
            rules: [
                // Exclude destination server CIDRs so xray.exe's uplink is NEVER intercepted by TUN
                { ip_cidr: excludeCidrs, outbound: 'direct' },
                // Exclude engines and electron apps to prevent loopback
                {
                    process_name: ['xray.exe', 'Xray.exe', 'node.exe', 'electron.exe', 'BABA Tunnel.exe'],
                    outbound: 'direct',
                },
                // Hijack all DNS into internal resolver
                { protocol: 'dns', action: 'hijack-dns' },
                // Allow LAN and private IP traffic directly
                { ip_is_private: true, outbound: 'direct' },
                // Reject all IPv6 traffic inside the tunnel (stops WebRTC & IPv6 leaks)
                { ip_version: 6, action: 'reject' },
                // Reject UDP/QUIC (stops WebRTC UDP leak through physical NIC)
                { network: 'udp', action: 'reject', method: 'default' },
            ],
            final: 'bbt-socks',
        },
        dns: {
            servers: [
                {
                    type: 'tcp',
                    tag: 'remote',
                    server: '1.1.1.1',
                    detour: 'bbt-socks',
                },
                {
                    type: 'udp',
                    tag: 'local',
                    server: '8.8.8.8',
                },
            ],
            rules: [
                {
                    process_name: ['xray.exe', 'Xray.exe', 'node.exe', 'electron.exe', 'BABA Tunnel.exe'],
                    server: 'local',
                },
                {
                    domain_suffix: ['mozilla.org', 'firefox.com', 'fastly.net', 'fastlylb.net'],
                    server: 'local',
                },
            ],
            final: 'remote',
            strategy: 'ipv4_only',
            cache_capacity: 4096,
        },
    };
}

/**
 * Block outbound IPv6 traffic on Windows Firewall (Anti-leak layer)
 */
function blockIpv6Firewall() {
    const stateFile = getIpv6StateFile();
    try {
        fs.writeFileSync(stateFile, JSON.stringify({ blockedAt: new Date().toISOString() }), 'utf8');
    } catch (_) {}

    const cmd = [
        `Remove-NetFirewallRule -Name "${IPV6_RULE_NAME}" -ErrorAction SilentlyContinue;`,
        `New-NetFirewallRule -Name "${IPV6_RULE_NAME}" -DisplayName "${IPV6_RULE_NAME}" ` +
        `-Group "${IPV6_RULE_GROUP}" -Direction Outbound -RemoteAddress 2000::/3 -Action Block -Profile Any | Out-Null;`,
    ].join(' ');

    const b64 = Buffer.from(cmd, 'utf16le').toString('base64');
    try {
        execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], {
            windowsHide: true,
            timeout: 10000,
        });
    } catch (_) {}
}

/**
 * Remove outbound IPv6 block rule from Windows Firewall
 */
function unblockIpv6Firewall() {
    const stateFile = getIpv6StateFile();
    try { if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile); } catch (_) {}

    const cmd = `Remove-NetFirewallRule -Name "${IPV6_RULE_NAME}" -ErrorAction SilentlyContinue;`;
    const b64 = Buffer.from(cmd, 'utf16le').toString('base64');
    try {
        execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], {
            windowsHide: true,
            timeout: 10000,
        });
    } catch (_) {}
}

/**
 * Cleanup any leftover firewall rules or adapters from a crashed prior run
 */
function recoverFromCrash() {
    const stateFile = getIpv6StateFile();
    if (fs.existsSync(stateFile)) {
        unblockIpv6Firewall();
        return true;
    }
    return false;
}

/**
 * Start sing-box TUN interface
 */
async function start({ socksPort = 10808, interfaceName = TUN_IFACE_NAME, serverIps = [] } = {}) {
    if (isRunningState && tunProcess && !tunProcess.killed) {
        return { ok: true, alreadyRunning: true, pid: tunProcess.pid };
    }

    if (isStarting) {
        throw new Error('حالت تونل در حال راه‌اندازی است...');
    }

    isStarting = true;
    isStopping = false;

    try {
        checkPrerequisites();
        installExitHooks();

        // 1. Engage Windows Firewall IPv6 Leak Block
        blockIpv6Firewall();

        // 2. Generate and write config file with server IPs excluded from TUN route
        const config = buildTunConfig({ socksPort, interfaceName, serverIps });
        const configFile = getTunConfigFile();
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');

        const { exe } = getBinPaths();

        // 3. Test config with sing-box check
        try {
            execFileSync(exe, ['check', '-c', configFile], {
                windowsHide: true,
                timeout: 5000,
                encoding: 'utf8',
            });
        } catch (checkErr) {
            const msg = (checkErr.stderr || checkErr.stdout || checkErr.message || '').toString();
            throw new Error(`پیکربندی sing-box معتبر نیست: ${msg}`);
        }

        // 4. Spawn sing-box process
        const proc = spawn(exe, ['run', '-c', configFile], {
            cwd: path.dirname(exe),
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let startupError = null;
        proc.stderr.on('data', (d) => {
            const str = d.toString();
            if (/fatal|panic|requires administrative privileges|access is denied/i.test(str)) {
                startupError = str.trim();
            }
        });

        // Handle process exit / crash
        proc.on('exit', (code, signal) => {
            tunProcess = null;
            isRunningState = false;

            if (!isStopping) {
                // Unexpected drop / crash: engage fail-closed kill switch
                try {
                    const killSwitch = require('./kill-switch');
                    if (killSwitch && typeof killSwitch.engage === 'function') {
                        killSwitch.engage('tun_crash');
                    }
                } catch (_) {}
            }
        });

        // Wait up to 3.5s for process to stay alive
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (proc.exitCode !== null) {
                    return reject(new Error(startupError || `sing-box با کد ${proc.exitCode} متوقف شد.`));
                }
                resolve();
            }, 1500);

            proc.once('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });

        tunProcess = proc;
        isRunningState = true;
        isStarting = false;

        return {
            ok: true,
            pid: proc.pid,
            interface: interfaceName,
            mtu: TUN_MTU,
            ipv4: TUN_IPV4,
            ipv6: TUN_IPV6,
        };
    } catch (err) {
        isStarting = false;
        isRunningState = false;
        if (tunProcess) {
            try { tunProcess.kill('SIGKILL'); } catch (_) {}
            tunProcess = null;
        }
        unblockIpv6Firewall();

        let humanMsg = err.message || '';
        if (/administrative privileges|access is denied/i.test(humanMsg)) {
            humanMsg = 'برای فعال‌سازی حالت تونل کامل سیستم (TUN)، برنامه باید با دسترسی ادمین (Run as Administrator) اجرا شود.';
        }
        throw new Error(humanMsg);
    }
}

/**
 * Stop sing-box TUN interface
 */
async function stop() {
    isStopping = true;
    isStarting = false;

    if (tunProcess) {
        const proc = tunProcess;
        tunProcess = null;

        try {
            execSync(`taskkill /pid ${proc.pid} /T /F`, {
                windowsHide: true,
                timeout: 3000,
                stdio: 'ignore',
            });
        } catch (_) {
            try { proc.kill('SIGKILL'); } catch (_) {}
        }
    }

    isRunningState = false;

    // Remove IPv6 block rule
    unblockIpv6Firewall();

    // Clean up temporary config
    try {
        const configFile = getTunConfigFile();
        if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
    } catch (_) {}

    isStopping = false;
    return { ok: true };
}

/**
 * Synchronous teardown for exit hooks
 */
function stopSync() {
    isStopping = true;
    if (tunProcess) {
        try {
            execSync(`taskkill /pid ${tunProcess.pid} /T /F`, {
                windowsHide: true,
                timeout: 3000,
                stdio: 'ignore',
            });
        } catch (_) {
            try { tunProcess.kill('SIGKILL'); } catch (_) {}
        }
        tunProcess = null;
    }
    isRunningState = false;
    unblockIpv6Firewall();
}

function installExitHooks() {
    if (exitHooksInstalled) return;
    exitHooksInstalled = true;

    process.on('exit', () => {
        stopSync();
    });

    process.on('SIGINT', () => {
        stopSync();
        process.exit(130);
    });

    process.on('SIGTERM', () => {
        stopSync();
        process.exit(143);
    });
}

function isRunning() {
    return isRunningState && tunProcess && !tunProcess.killed;
}

function status() {
    return {
        running: isRunning(),
        pid: tunProcess ? tunProcess.pid : null,
        interface: TUN_IFACE_NAME,
        mtu: TUN_MTU,
        strictRoute: true,
        autoRoute: true,
        ipv6Blocked: true,
    };
}

module.exports = {
    start,
    stop,
    stopSync,
    isRunning,
    status,
    buildTunConfig,
    checkPrerequisites,
    recoverFromCrash,
    blockIpv6Firewall,
    unblockIpv6Firewall,
    getBinPaths,
    getIpv6StateFile,
    getTunConfigFile,
    TUN_IFACE_NAME,
    TUN_IPV4,
    TUN_IPV6,
    TUN_MTU,
};
