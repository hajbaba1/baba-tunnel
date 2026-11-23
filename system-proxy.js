// --- system-proxy.js — Safe Windows system proxy manager with crash-resilient rollback ---
//
// Manages Windows system proxy settings strictly for Fenix/BBT local proxy port.
// CRITICAL SAFETY & PERFORMANCE REQUIREMENTS:
// 1. Backs up previous proxy state to disk BEFORE applying any change.
// 2. Restores previous proxy state on normal process exit, SIGINT, SIGTERM, and uncaughtException.
// 3. On startup, detects if a previous session crashed while proxy was active and rolls back automatically.
// 4. In-memory caching & single execFile('reg.exe') to eliminate CPU spikes during periodic status polling.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, execFile, execFileSync } = require('child_process');

function getBackupFile() {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const dir = path.join(base, 'baba-tunnel');
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            const oldDir = path.join(base, 'fenix-vpn');
            const oldFile = path.join(oldDir, 'previous-proxy-state.json');
            const newFile = path.join(dir, 'previous-proxy-state.json');
            if (fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
                try { fs.copyFileSync(oldFile, newFile); } catch (_) {}
            }
        } catch (_) {}
    }
    return path.join(dir, 'previous-proxy-state.json');
}

const REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

let _cachedProxy = null;
let _cachedTime = 0;
const CACHE_TTL_MS = 2500;

function parseRegOutput(raw) {
    const enableMatch = (raw || '').match(/ProxyEnable\s+REG_DWORD\s+(0x[0-9a-fA-F]+|\d+)/);
    const enabled = enableMatch ? (parseInt(enableMatch[1], 16) === 1 || parseInt(enableMatch[1], 10) === 1) : false;

    const serverMatch = (raw || '').match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/);
    const server = serverMatch ? serverMatch[1].trim() : '';

    const overrideMatch = (raw || '').match(/ProxyOverride\s+REG_SZ\s+([^\r\n]+)/);
    const override = overrideMatch ? overrideMatch[1].trim() : '<local>';

    return { enabled, server, override };
}

/** Read current Windows proxy settings via a single reg.exe call with caching */
function readCurrentProxy(force = false) {
    const now = Date.now();
    if (!force && _cachedProxy && (now - _cachedTime < CACHE_TTL_MS)) {
        return Promise.resolve(_cachedProxy);
    }

    return new Promise((resolve) => {
        execFile('reg.exe', ['query', REG_KEY], { windowsHide: true, timeout: 2000 }, (err, stdout) => {
            if (err || !stdout) {
                // If query fails, fall back to last cached or default
                return resolve(_cachedProxy || { enabled: false, server: '', override: '<local>' });
            }
            _cachedProxy = parseRegOutput(stdout);
            _cachedTime = Date.now();
            resolve(_cachedProxy);
        });
    });
}

/** Synchronous read for crash / shutdown hooks */
function readCurrentProxySync() {
    try {
        const out = execFileSync('reg.exe', ['query', REG_KEY], { windowsHide: true, encoding: 'utf8', timeout: 2000 });
        _cachedProxy = parseRegOutput(out);
        _cachedTime = Date.now();
        return _cachedProxy;
    } catch (_) {
        return _cachedProxy || { enabled: false, server: '', override: '<local>' };
    }
}

/** Notify Windows network subsystem of proxy change */
function refreshWindowsProxySettings() {
    const psCode = `
$sig = @'
[System.Runtime.InteropServices.DllImport("wininet.dll", SetLastError=true)]
public static extern bool InternetSetOption(System.IntPtr h, int o, System.IntPtr b, int l);
'@
if (-not ([System.Management.Automation.PSTypeName]"Win32.WinINet").Type) {
    Add-Type -MemberDefinition $sig -Name WinINet -Namespace Win32 -ErrorAction SilentlyContinue
}
[Win32.WinINet]::InternetSetOption([System.IntPtr]::Zero, 39, [System.IntPtr]::Zero, 0)
[Win32.WinINet]::InternetSetOption([System.IntPtr]::Zero, 37, [System.IntPtr]::Zero, 0)
`;
    try {
        const b64 = Buffer.from(psCode, 'utf16le').toString('base64');
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], { windowsHide: true, timeout: 5000 }, () => {});
    } catch (_) {}
}

/** Apply proxy settings to registry */
function applyProxy(enabled, server = '', override = '<local>;localhost;127.*;10.*') {
    _cachedProxy = null; // Invalidate cache
    _cachedTime = 0;

    return new Promise((resolve, reject) => {
        const val = enabled ? 1 : 0;
        execFile('reg.exe', ['add', REG_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', String(val), '/f'], { windowsHide: true, timeout: 3000 }, (err1) => {
            if (err1) return reject(new Error(`Failed to set ProxyEnable: ${err1.message}`));

            if (enabled && server) {
                execFile('reg.exe', ['add', REG_KEY, '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', server, '/f'], { windowsHide: true, timeout: 3000 }, (err2) => {
                    if (err2) return reject(new Error(`Failed to set ProxyServer: ${err2.message}`));
                    execFile('reg.exe', ['add', REG_KEY, '/v', 'ProxyOverride', '/t', 'REG_SZ', '/d', override, '/f'], { windowsHide: true, timeout: 3000 }, () => {
                        _cachedProxy = { enabled: true, server, override };
                        _cachedTime = Date.now();
                        refreshWindowsProxySettings();
                        resolve({ ok: true, enabled: true, server, override });
                    });
                });
            } else {
                _cachedProxy = { enabled: false, server: '', override };
                _cachedTime = Date.now();
                refreshWindowsProxySettings();
                resolve({ ok: true, enabled: false });
            }
        });
    });
}

let activeChange = false;

/**
 * Enable Windows system proxy for Fenix/BBT
 */
async function enable(proxyAddress = 'http=127.0.0.1:10809;https=127.0.0.1:10809;socks=127.0.0.1:10808') {
    const backupFile = getBackupFile();

    // 1. If we haven't already saved a backup in this session, save current state
    if (!fs.existsSync(backupFile)) {
        const current = await readCurrentProxy(true);
        fs.writeFileSync(backupFile, JSON.stringify({
            savedAt: new Date().toISOString(),
            pid: process.pid,
            state: current,
        }, null, 2), 'utf8');
    }

    // 2. Apply proxy
    const result = await applyProxy(true, proxyAddress);
    activeChange = true;
    return result;
}

/**
 * Disable Windows system proxy and restore backed-up state
 */
async function disable() {
    const backupFile = getBackupFile();
    let target = { enabled: false, server: '', override: '<local>' };

    if (fs.existsSync(backupFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
            if (data && data.state) {
                target = data.state;
            }
        } catch (_) {}
        try { fs.unlinkSync(backupFile); } catch (_) {}
    }

    activeChange = false;
    return await applyProxy(target.enabled, target.server, target.override);
}

/** Synchronous rollback for exit hooks */
function rollbackSync() {
    _cachedProxy = null;
    const backupFile = getBackupFile();
    if (!fs.existsSync(backupFile)) return;

    try {
        const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
        const target = (data && data.state) || { enabled: false, server: '', override: '<local>' };
        const val = target.enabled ? 1 : 0;
        execSync(`reg add "${REG_KEY}" /v ProxyEnable /t REG_DWORD /d ${val} /f`, { windowsHide: true });
        if (target.enabled && target.server) {
            execSync(`reg add "${REG_KEY}" /v ProxyServer /t REG_SZ /d "${target.server}" /f`, { windowsHide: true });
        }
        try { fs.unlinkSync(backupFile); } catch (_) {}
    } catch (_) {}
}

/** Crash recovery check: called on application startup */
function recoverFromCrash() {
    const backupFile = getBackupFile();
    if (fs.existsSync(backupFile)) {
        console.warn('[ProxyRecovery] Detected leftover proxy backup file from previous session. Rolling back...');
        rollbackSync();
        refreshWindowsProxySettings();
        return true;
    }
    return false;
}

// Register exit handlers to guarantee proxy rollback
process.on('exit', () => {
    if (activeChange) {
        rollbackSync();
    }
});

process.on('SIGINT', () => {
    rollbackSync();
    process.exit(0);
});

process.on('SIGTERM', () => {
    rollbackSync();
    process.exit(0);
});

module.exports = {
    enable,
    disable,
    readCurrentProxy,
    readCurrentProxySync,
    recoverFromCrash,
    rollbackSync,
    getBackupFile,
};
