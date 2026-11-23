// --- crypto-store.js — Windows DPAPI credential protection for BABA Tunnel (BBT) ---
//
// Secures tokens at rest using Windows DPAPI (Data Protection API) scoped to the current user.
// Uses Electron's native `safeStorage` when running in Electron, and falls back to PowerShell
// DPAPI (ConvertTo-SecureString / ConvertFrom-SecureString) in pure Node/CLI environments.
//
// SECURITY REQUIREMENT:
// If secure encryption is not available, protectAsync MUST throw an error and NEVER
// store credentials in plaintext or base64 plaintext.

'use strict';

const { spawn } = require('child_process');

const DPAPI_PREFIX = 'dpapi:';
const SAFE_PREFIX = 'safestorage:';

let electron = null;
try {
    electron = require('electron');
} catch (e) {
    electron = null;
}

function getSafeStorage() {
    if (electron && electron.safeStorage && typeof electron.safeStorage.isEncryptionAvailable === 'function') {
        if (electron.safeStorage.isEncryptionAvailable()) {
            return electron.safeStorage;
        }
    }
    return null;
}

function psAsync(script, stdinText) {
    return new Promise((resolve, reject) => {
        const child = spawn('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy', 'Bypass',
            '-Command', script,
        ], {
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
        child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });

        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) resolve(stdout);
            else reject(new Error(`PowerShell DPAPI failed (exit ${code}): ${stderr}`));
        });

        if (stdinText !== undefined && stdinText !== null) {
            child.stdin.write(String(stdinText), 'utf8');
        }
        child.stdin.end();
    });
}

const UNPROTECT_CMD = [
    '$raw = [Console]::In.ReadToEnd().Trim();',
    'if (-not $raw) { exit 1 };',
    '$sec = ConvertTo-SecureString -String $raw;',
    '$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec);',
    'try { [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }'
].join(' ');

async function protectAsync(plain) {
    if (plain === null || plain === undefined || plain === '') return '';
    const str = String(plain);

    // 1. Try Electron safeStorage
    const ss = getSafeStorage();
    if (ss) {
        try {
            const buf = ss.encryptString(str);
            return SAFE_PREFIX + buf.toString('base64');
        } catch (err) {
            // fallback to PowerShell DPAPI
        }
    }

    // 2. PowerShell DPAPI fallback
    try {
        const out = await psAsync(
            '$p = [Console]::In.ReadToEnd(); ' +
            '$p = $p -replace "\\r?\\n$", ""; ' +
            'ConvertTo-SecureString -String $p -AsPlainText -Force | ConvertFrom-SecureString',
            str
        );
        const hex = (out || '').trim();
        if (/^[0-9a-fA-F]{16,}$/.test(hex)) {
            return DPAPI_PREFIX + hex;
        }
    } catch (e) {
        // DPAPI failed
    }

    // MANDATORY SECURITY REQUIREMENT:
    // Throw error if hardware/OS secure encryption is unavailable. Never write plaintext.
    throw new Error('Secure storage unavailable: encryption via safeStorage and Windows DPAPI failed. Refusing to store unencrypted credentials.');
}

async function unprotectAsync(stored) {
    if (!stored) return '';
    const s = String(stored);

    // 1. Electron safeStorage
    if (s.startsWith(SAFE_PREFIX)) {
        const ss = getSafeStorage();
        if (ss) {
            try {
                const buf = Buffer.from(s.slice(SAFE_PREFIX.length), 'base64');
                return ss.decryptString(buf);
            } catch (err) {
                throw new Error('Failed to decrypt safeStorage credential');
            }
        }
        throw new Error('safeStorage encryption unavailable for decryption');
    }

    // 2. Windows DPAPI (PowerShell)
    if (s.startsWith(DPAPI_PREFIX)) {
        try {
            const hex = s.slice(DPAPI_PREFIX.length);
            const out = await psAsync(UNPROTECT_CMD, hex);
            return (out || '').replace(/\r?\n$/, '');
        } catch (e) {
            throw new Error(`Failed to decrypt DPAPI credential: ${e.message}`);
        }
    }

    // Refuse plaintext tokens
    if (s.startsWith('plain:')) {
        throw new Error('Refusing legacy or insecure plaintext credential format');
    }

    throw new Error('Unrecognized or insecure credential format');
}

function isProtected(stored) {
    return typeof stored === 'string' && (stored.startsWith(DPAPI_PREFIX) || stored.startsWith(SAFE_PREFIX));
}

module.exports = {
    protectAsync,
    unprotectAsync,
    isProtected,
};
