// --- kill-switch.js — VPN Kill Switch (Leak Protection) for Fenix Standalone ---
//
// Prevents unencrypted traffic leaks when the VPN connection drops or is inactive.
// When enabled:
// - If VPN is connected ('on'): traffic routes securely through Fenix Xray (127.0.0.1:10809).
// - If VPN is disconnected or drops ('off', 'stopping', 'failed'): routes to blackhole (127.0.0.1:1).
// - When disabled: restores normal Windows proxy / direct connection.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const systemProxy = require('./system-proxy');

function getKillSwitchConfigFile() {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const dir = path.join(base, 'fenix-vpn');
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
    }
    return path.join(dir, 'kill-switch.json');
}

const BLACKHOLE_PROXY = '127.0.0.1:1';

let isEnabled = false;
let isEngaged = false; // true when blackhole is actively blocking traffic

// Load initial setting from disk
try {
    const file = getKillSwitchConfigFile();
    if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        isEnabled = !!(data && data.enabled);
    }
} catch (e) {}

function saveSetting(enabled) {
    isEnabled = !!enabled;
    try {
        fs.writeFileSync(getKillSwitchConfigFile(), JSON.stringify({
            enabled: isEnabled,
            updatedAt: new Date().toISOString(),
        }, null, 2), 'utf8');
    } catch (e) {}
}

async function engage(reason = 'vpn_inactive') {
    if (isEngaged) return { ok: true, engaged: true };
    try {
        await systemProxy.enable(BLACKHOLE_PROXY);
        isEngaged = true;
        return { ok: true, engaged: true, reason };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

async function disengage() {
    if (!isEngaged) return { ok: true, engaged: false };
    try {
        await systemProxy.disable();
        isEngaged = false;
        return { ok: true, engaged: false };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/**
 * Handle connection phase transitions from fenix-session
 * @param {string} phase - 'off' | 'connecting' | 'on' | 'renewing' | 'stopping'
 */
async function onSessionState(phase) {
    if (!isEnabled) {
        if (isEngaged) {
            await disengage();
        }
        return getStatus();
    }

    if (phase === 'on') {
        // VPN is connected: disengage blackhole block so VPN proxy routes traffic
        if (isEngaged) {
            isEngaged = false;
        }
    } else if (phase === 'off' || phase === 'stopping') {
        // Connection lost or disconnected while Kill Switch is armed
        await engage('vpn_disconnected');
    }
    return getStatus();
}

/**
 * Update Kill Switch user preference
 * @param {boolean} enabled 
 * @param {string} currentPhase - current session phase ('on' | 'off')
 */
async function setSetting(enabled, currentPhase = 'off') {
    saveSetting(enabled);
    if (enabled) {
        if (currentPhase !== 'on') {
            await engage('kill_switch_enabled');
        }
    } else {
        if (isEngaged) {
            await disengage();
        }
    }
    return getStatus();
}

function getStatus() {
    return {
        enabled: isEnabled,
        engaged: isEngaged,
    };
}

module.exports = {
    getStatus,
    setSetting,
    engage,
    disengage,
    onSessionState,
    getKillSwitchConfigFile,
    BLACKHOLE_PROXY,
    _reset: () => { isEnabled = false; isEngaged = false; },
};
