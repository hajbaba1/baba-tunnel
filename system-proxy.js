// --- system-proxy.js — Safe Windows system proxy manager with crash-resilient rollback ---
//
// Manages Windows system proxy settings strictly for Fenix's local proxy port.
// CRITICAL SAFETY REQUIREMENTS:
// 1. Backs up previous proxy state to disk BEFORE applying any change.
// 2. Restores previous proxy state on normal process exit, SIGINT, SIGTERM, and uncaughtException.
// 3. On startup, detects if a previous session crashed while proxy was active and rolls back automatically.
// 4. Does NOT touch Windows Firewall or DNS settings. Full TUN is out of scope.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec, execSync } = require('child_process');

function getBackupFile() {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const dir = path.join(base, 'fenix-vpn');
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
    }
    return path.join(dir, 'previous-proxy-state.json');
}

const REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

/** Read current Windows proxy settings via reg query */
function readCurrentProxy() {
    return new Promise((resolve) => {
        exec(`reg query "${REG_KEY}" /v ProxyEnable`, (err1, out1) => {
            const enableMatch = (out1 || '').match(/ProxyEnable\s+REG_DWORD\s+(0x[0-9a-fA-F]+|\d+)/);
            const enabled = enableMatch ? (parseInt(enableMatch[1], 16) === 1 || parseInt(enableMatch[1], 10) === 1) : false;

            exec(`reg query "${REG_KEY}" /v ProxyServer`, (err2, out2) => {
                const serverMatch = (out2 || '').match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/);
                const server = serverMatch ? serverMatch[1].trim() : '';

                exec(`reg query "${REG_KEY}" /v ProxyOverride`, (err3, out3) => {
                    const overrideMatch = (out3 || '').match(/ProxyOverride\s+REG_SZ\s+([^\r\n]+)/);
                    const override = overrideMatch ? overrideMatch[1].trim() : '<local>';

                    resolve({ enabled, server, override });
                });
            });
        });
    });
}

/** Synchronous read for crash / shutdown hooks */
function readCurrentProxySync() {
    try {
        const out1 = execSync(`reg query "${REG_KEY}" /v ProxyEnable`, { windowsHide: true, encoding: 'utf8' });
        const enableMatch = out1.match(/ProxyEnable\s+REG_DWORD\s+(0x[0-9a-fA-F]+|\d+)/);
        const enabled = enableMatch ? (parseInt(enableMatch[1], 16) === 1 || parseInt(enableMatch[1], 10) === 1) : false;

        let server = '';
        try {
            const out2 = execSync(`reg query "${REG_KEY}" /v ProxyServer`, { windowsHide: true, encoding: 'utf8' });
            const serverMatch = out2.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/);
            if (serverMatch) server = serverMatch[1].trim();
        } catch (e) {}

        let override = '<local>';
        try {
            const out3 = execSync(`reg query "${REG_KEY}" /v ProxyOverride`, { windowsHide: true, encoding: 'utf8' });
            const overrideMatch = out3.match(/ProxyOverride\s+REG_SZ\s+([^\r\n]+)/);
            if (overrideMatch) override = overrideMatch[1].trim();
        } catch (e) {}

        return { enabled, server, override };
    } catch (e) {
        return { enabled: false, server: '', override: '<local>' };
    }
}

/** Notify Windows network subsystem of proxy change */
function refreshWindowsProxySettings() {
    // Calls InternetSetOption (INTERNET_OPTION_SETTINGS_CHANGED = 39, INTERNET_OPTION_REFRESH = 37)
    const psCmd = [
        '$signature = @"',
        '[DllImport("wininet.dll", SetLastError = true, CharSet = CharSet.Auto)]',
        'public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);',
        '"@;',
        '$type = Add-Type -MemberDefinition $signature -Name WinINet -Namespace Win32 -PassThru -ErrorAction SilentlyContinue;',
        '[Win32.WinINet]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0);',
        '[Win32.WinINet]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0);'
    ].join(' ');

    exec(`powershell.exe -NoProfile -NonInteractive -Command "${psCmd}"`, { windowsHide: true }, () => {});
}

/** Apply proxy settings to registry */
function applyProxy(enabled, server = '', override = '<local>;localhost;127.*;10.*') {
    return new Promise((resolve, reject) => {
        const val = enabled ? 1 : 0;
        exec(`reg add "${REG_KEY}" /v ProxyEnable /t REG_DWORD /d ${val} /f`, (err1) => {
            if (err1) return reject(new Error(`Failed to set ProxyEnable: ${err1.message}`));

            if (enabled && server) {
                exec(`reg add "${REG_KEY}" /v ProxyServer /t REG_SZ /d "${server}" /f`, (err2) => {
                    if (err2) return reject(new Error(`Failed to set ProxyServer: ${err2.message}`));
                    exec(`reg add "${REG_KEY}" /v ProxyOverride /t REG_SZ /d "${override}" /f`, () => {
                        refreshWindowsProxySettings();
                        resolve({ ok: true, enabled: true, server, override });
                    });
                });
            } else {
                refreshWindowsProxySettings();
                resolve({ ok: true, enabled: false });
            }
        });
    });
}

let activeChange = false;

/**
 * Enable Windows system proxy for Fenix
 * @param {string} proxyAddress - e.g. "127.0.0.1:10809" (HTTP proxy) or "http=127.0.0.1:10809;https=127.0.0.1:10809;socks=127.0.0.1:10808"
 */
async function enable(proxyAddress = 'http=127.0.0.1:10809;https=127.0.0.1:10809;socks=127.0.0.1:10808') {
    const backupFile = getBackupFile();

    // 1. If we haven't already saved a backup in this session, save current state
    if (!fs.existsSync(backupFile)) {
        const current = await readCurrentProxy();
        fs.writeFileSync(backupFile, JSON.stringify({
            savedAt: new Date().toISOString(),
            pid: process.pid,
            state: current,
        }, null, 2), 'utf8');
    }

    // 2. Apply Fenix proxy
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
        } catch (e) {}
        try { fs.unlinkSync(backupFile); } catch (e) {}
    }

    activeChange = false;
    return await applyProxy(target.enabled, target.server, target.override);
}

/** Synchronous rollback for exit hooks */
function rollbackSync() {
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
        try { fs.unlinkSync(backupFile); } catch (e) {}
    } catch (e) {}
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
