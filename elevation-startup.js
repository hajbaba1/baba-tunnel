// --- elevation-startup.js — Administrator Elevation & Windows Task Scheduler Auto-Start ---
//
// 1. Detects whether the current Windows process holds elevated Administrator privileges.
// 2. Provides a clean self-elevation relaunch fallback if launched un-elevated in packaged mode.
// 3. Registers / verifies / removes a Windows Task Scheduler logon task with RunLevel=HighestAvailable
//    so BABA Tunnel starts automatically at Windows logon WITH Administrator rights and ZERO UAC prompt,
//    handling both NSIS-installed executables and Portable executables (via PORTABLE_EXECUTABLE_FILE).
// 4. Caches process elevation & startup status in memory so periodic UI polls incur 0% CPU overhead.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync, spawn } = require('child_process');

const TASK_NAME = 'BABA Tunnel AutoStart';

let _isAdminCache = null;
let _cachedTaskState = null;

// Dependency injection hooks for deterministic unit testing
let _execFileAsync = (file, args, opts) => new Promise((resolve) => {
    execFile(file, args, Object.assign({ windowsHide: true, timeout: 8000 }, opts || {}), (err, stdout, stderr) => {
        resolve({ err: err || null, stdout: stdout || '', stderr: stderr || '' });
    });
});
let _execFileSync = (file, args, opts) => execFileSync(file, args, opts);
let _spawn = (file, args, opts) => spawn(file, args, opts);

function escapeXml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function unescapeXml(str) {
    return String(str == null ? '' : str)
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');
}

/**
 * Resolve DOMAIN\Username for Task Scheduler LogonTrigger & Principal.
 */
function resolveCurrentUser({ env = process.env, userInfo = null } = {}) {
    let username = '';
    try {
        const info = userInfo || os.userInfo();
        if (info && info.username) username = String(info.username).trim();
    } catch (_) {}
    if (!username && env && env.USERNAME) {
        username = String(env.USERNAME).trim();
    }
    const domain = env && env.USERDOMAIN ? String(env.USERDOMAIN).trim() : '';
    if (!username) return '';
    if (domain && !username.includes('\\')) {
        return `${domain}\\${username}`;
    }
    return username;
}

/**
 * Resolve permanent target executable path.
 * Prioritizes PORTABLE_EXECUTABLE_FILE so Portable builds never point Task Scheduler
 * at an ephemeral %TEMP% unpacked binary.
 */
function resolveExecutablePath({ env = process.env, execPath = process.execPath, isPackaged = false } = {}) {
    const portable = env && env.PORTABLE_EXECUTABLE_FILE ? String(env.PORTABLE_EXECUTABLE_FILE).trim() : '';
    if (portable && /\.exe$/i.test(portable)) {
        return path.resolve(portable);
    }
    if (isPackaged && execPath && /\.exe$/i.test(String(execPath))) {
        return path.resolve(String(execPath));
    }
    return null;
}

/**
 * Check whether the current Electron app is packaged.
 */
function detectPackaged() {
    try {
        const electron = require('electron');
        if (electron && electron.app && typeof electron.app.isPackaged === 'boolean') {
            return electron.app.isPackaged;
        }
    } catch (_) {}
    return !!(process.env && process.env.PORTABLE_EXECUTABLE_FILE);
}

/**
 * Synchronously detect whether current process is running elevated as Administrator.
 * Cached for process lifetime (elevation never changes mid-process on Windows).
 */
function isRunningAsAdminSync(force = false) {
    if (!force && _isAdminCache !== null) return _isAdminCache;

    if (process.platform !== 'win32') {
        _isAdminCache = typeof process.getuid === 'function' ? process.getuid() === 0 : false;
        return _isAdminCache;
    }

    try {
        const out = _execFileSync('whoami.exe', ['/groups'], {
            windowsHide: true,
            encoding: 'utf8',
            timeout: 3000,
        });
        // Mandatory Integrity Level: High = S-1-16-12288, System = S-1-16-16384
        if (/\bS-1-16-(12288|16384)\b/.test(out)) {
            _isAdminCache = true;
            return true;
        }
        // Fallback when UAC is disabled or integrity label differs: Administrators group S-1-5-32-544 Enabled
        if (/\bS-1-5-32-544\b/.test(out) && !/\bS-1-5-32-544\b[^\r\n]*deny/i.test(out)) {
            _isAdminCache = true;
            return true;
        }
        _isAdminCache = false;
        return false;
    } catch (_) {
        try {
            const psOut = _execFileSync('powershell.exe', [
                '-NoProfile', '-NonInteractive', '-Command',
                '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'
            ], { windowsHide: true, encoding: 'utf8', timeout: 4000 });
            _isAdminCache = /^true$/i.test(String(psOut || '').trim());
            return _isAdminCache;
        } catch (__) {
            _isAdminCache = false;
            return false;
        }
    }
}

async function isRunningAsAdmin(force = false) {
    return isRunningAsAdminSync(force);
}

/**
 * Build Windows Task Scheduler 1.2 XML for elevated interactive startup at user logon.
 */
function buildTaskXml({ userId, command, argumentsStr = '--autostart', workingDir = '', description = 'BABA Tunnel Auto-Start (Administrator)' }) {
    const safeUser = escapeXml(userId);
    const safeCmd = escapeXml(command);
    const safeArgs = escapeXml(argumentsStr);
    const safeWorkDir = escapeXml(workingDir || path.dirname(command));
    const safeDesc = escapeXml(description);

    return [
        '<?xml version="1.0" encoding="UTF-16"?>',
        '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
        '  <RegistrationInfo>',
        `    <Description>${safeDesc}</Description>`,
        '  </RegistrationInfo>',
        '  <Triggers>',
        '    <LogonTrigger>',
        '      <Enabled>true</Enabled>',
        safeUser ? `      <UserId>${safeUser}</UserId>` : '',
        '      <Delay>PT3S</Delay>',
        '    </LogonTrigger>',
        '  </Triggers>',
        '  <Principals>',
        '    <Principal id="Author">',
        safeUser ? `      <UserId>${safeUser}</UserId>` : '',
        '      <LogonType>InteractiveToken</LogonType>',
        '      <RunLevel>HighestAvailable</RunLevel>',
        '    </Principal>',
        '  </Principals>',
        '  <Settings>',
        '    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>',
        '    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>',
        '    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>',
        '    <AllowHardTerminate>false</AllowHardTerminate>',
        '    <StartWhenAvailable>true</StartWhenAvailable>',
        '    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>',
        '    <IdleSettings>',
        '      <StopOnIdleEnd>false</StopOnIdleEnd>',
        '      <RestartOnIdle>false</RestartOnIdle>',
        '    </IdleSettings>',
        '    <AllowStartOnDemand>true</AllowStartOnDemand>',
        '    <Enabled>true</Enabled>',
        '    <Hidden>false</Hidden>',
        '    <RunOnlyIfIdle>false</RunOnlyIfIdle>',
        '    <WakeToRun>false</WakeToRun>',
        '    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>',
        '    <Priority>7</Priority>',
        '  </Settings>',
        '  <Actions Context="Author">',
        '    <Exec>',
        `      <Command>${safeCmd}</Command>`,
        safeArgs ? `      <Arguments>${safeArgs}</Arguments>` : '',
        safeWorkDir ? `      <WorkingDirectory>${safeWorkDir}</WorkingDirectory>` : '',
        '    </Exec>',
        '  </Actions>',
        '</Task>',
    ].filter(Boolean).join('\r\n');
}

/**
 * Parse XML output returned by `schtasks /Query /TN ... /XML`.
 */
function parseTaskQueryXml(xmlText) {
    if (!xmlText || typeof xmlText !== 'string') {
        return { exists: false, enabled: false, highestAvailable: false, command: '', argumentsStr: '' };
    }
    const clean = xmlText.replace(/\u0000/g, '').trim();
    if (!/<Task[\s>]/i.test(clean)) {
        return { exists: false, enabled: false, highestAvailable: false, command: '', argumentsStr: '' };
    }

    const extractTag = (tag) => {
        const m = clean.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
        return m ? unescapeXml(m[1].trim()) : '';
    };

    const settingsBlock = (clean.match(/<Settings>([\s\S]*?)<\/Settings>/i) || ['', ''])[1];
    const enabledMatch = settingsBlock.match(/<Enabled>(true|false)<\/Enabled>/i);
    const enabled = enabledMatch ? enabledMatch[1].toLowerCase() === 'true' : true;

    const runLevel = extractTag('RunLevel');
    const command = extractTag('Command').replace(/^"|"$/g, '');
    const argumentsStr = extractTag('Arguments');

    return {
        exists: true,
        enabled,
        highestAvailable: /^HighestAvailable$/i.test(runLevel),
        command,
        argumentsStr,
    };
}

/**
 * Query live status of the Windows Scheduled Task.
 */
async function queryAutoStartTask({ env = process.env, execPath = process.execPath, isPackaged = detectPackaged() } = {}) {
    const targetExe = resolveExecutablePath({ env, execPath, isPackaged });
    const supported = process.platform === 'win32';
    const isAdmin = isRunningAsAdminSync();

    if (!supported) {
        const res = {
            supported: false,
            active: false,
            matchesCurrentExe: false,
            highestAvailable: false,
            isAdmin,
            taskName: TASK_NAME,
            executablePath: targetExe || '',
            registeredCommand: '',
        };
        _cachedTaskState = res;
        return res;
    }

    const { err, stdout } = await _execFileAsync('schtasks.exe', ['/Query', '/TN', TASK_NAME, '/XML']);
    if (err || !stdout) {
        const res = {
            supported: true,
            active: false,
            matchesCurrentExe: false,
            highestAvailable: false,
            isAdmin,
            taskName: TASK_NAME,
            executablePath: targetExe || '',
            registeredCommand: '',
        };
        _cachedTaskState = res;
        return res;
    }

    const parsed = parseTaskQueryXml(stdout);
    const normalizedReg = parsed.command ? path.resolve(parsed.command).toLowerCase() : '';
    const normalizedCur = targetExe ? path.resolve(targetExe).toLowerCase() : '';
    const matchesCurrentExe = !!(parsed.exists && normalizedReg && normalizedCur && normalizedReg === normalizedCur);

    const res = {
        supported: true,
        active: !!(parsed.exists && parsed.enabled),
        matchesCurrentExe,
        highestAvailable: parsed.highestAvailable,
        isAdmin,
        taskName: TASK_NAME,
        executablePath: targetExe || '',
        registeredCommand: parsed.command || '',
    };
    _cachedTaskState = res;
    return res;
}

/**
 * Fast synchronous status accessor (returns cached Scheduled Task status without spawning processes).
 */
function getCachedStatus() {
    if (_cachedTaskState) {
        return Object.assign({}, _cachedTaskState, { isAdmin: isRunningAsAdminSync() });
    }
    return {
        supported: process.platform === 'win32',
        active: false,
        matchesCurrentExe: false,
        highestAvailable: false,
        isAdmin: isRunningAsAdminSync(),
        taskName: TASK_NAME,
        executablePath: resolveExecutablePath({ isPackaged: detectPackaged() }) || '',
        registeredCommand: '',
    };
}

/**
 * Enable or disable Windows startup auto-run with Administrator privileges via Task Scheduler.
 */
async function setAutoStart(enabled, { env = process.env, execPath = process.execPath, isPackaged = detectPackaged(), executableOverride = null } = {}) {
    if (process.platform !== 'win32') {
        throw new Error('قابلیت اجرای خودکار با دسترسی ادمین فقط در ویندوز پشتیبانی می‌شود.');
    }

    const wants = Boolean(enabled);
    const targetExe = executableOverride || resolveExecutablePath({ env, execPath, isPackaged });

    if (!wants) {
        const { err, stderr, stdout } = await _execFileAsync('schtasks.exe', ['/Delete', '/TN', TASK_NAME, '/F']);
        const combined = `${stderr || ''} ${stdout || ''} ${(err && err.message) || ''}`;
        if (err && !/cannot find|does not exist|فایل|یافت نشد/i.test(combined)) {
            if (/access is denied|دسترسی/i.test(combined)) {
                throw new Error('برای حذف اجرای خودکار، برنامه باید با دسترسی ادمین اجرا شده باشد.');
            }
            throw new Error(`خطا در غیرفعال‌سازی اجرای خودکار: ${combined.trim()}`);
        }
        return await queryAutoStartTask({ env, execPath, isPackaged });
    }

    if (!targetExe) {
        throw new Error('ثبت اجرای خودکار در ویندوز فقط در نسخهٔ نصب‌شده یا پورتابل (exe) امکان‌پذیر است.');
    }

    const userId = resolveCurrentUser({ env });
    if (!userId) {
        throw new Error('نام کاربری ویندوز برای ثبت اجرای خودکار شناسایی نشد.');
    }

    const xml = buildTaskXml({
        userId,
        command: targetExe,
        argumentsStr: '--autostart',
        workingDir: path.dirname(targetExe),
    });

    const tmpXml = path.join(os.tmpdir(), `bbt-autostart-${process.pid}-${Date.now()}.xml`);
    try {
        // UTF-16LE with BOM satisfies Windows Task Scheduler XML encoding requirement cleanly even for Unicode paths
        fs.writeFileSync(tmpXml, '\uFEFF' + xml, 'utf16le');
        const { err, stderr, stdout } = await _execFileAsync('schtasks.exe', ['/Create', '/TN', TASK_NAME, '/XML', tmpXml, '/F']);
        if (err) {
            const detail = `${stderr || ''} ${stdout || ''} ${err.message || ''}`.trim();
            if (/access is denied/i.test(detail)) {
                throw new Error('برای فعال‌سازی اجرای خودکار با دسترسی ادمین، برنامه باید با دسترسی Administrator اجرا شود.');
            }
            throw new Error(`خطا در ثبت اجرای خودکار ویندوز: ${detail}`);
        }
    } finally {
        try {
            if (fs.existsSync(tmpXml)) fs.unlinkSync(tmpXml);
        } catch (_) {}
    }

    return await queryAutoStartTask({ env, execPath, isPackaged });
}

/**
 * Synchronize Scheduled Task state on application boot when running packaged & elevated.
 * Ensures upgrades or moved portable binaries keep startup pointing to the right .exe.
 */
async function syncAutoStartOnBoot({ desiredEnabled = true, isPackaged = detectPackaged(), env = process.env, execPath = process.execPath } = {}) {
    if (process.platform !== 'win32' || !isPackaged) {
        return getCachedStatus();
    }

    const current = await queryAutoStartTask({ env, execPath, isPackaged });
    if (!isRunningAsAdminSync()) {
        return current;
    }

    if (desiredEnabled) {
        const needsUpdate = !current.active || !current.highestAvailable || !current.matchesCurrentExe;
        if (needsUpdate && current.executablePath) {
            return await setAutoStart(true, { env, execPath, isPackaged });
        }
    }
    return current;
}

/**
 * Fallback runtime elevation guard in Electron main process.
 * Returns true if an elevated child process was spawned and the caller should exit immediately.
 */
function relaunchElevatedIfNeeded({ isPackaged = detectPackaged(), argv = process.argv, env = process.env, execPath = process.execPath } = {}) {
    if (process.platform !== 'win32') return false;
    if (!isPackaged) return false;
    if (argv.includes('--no-elevate') || argv.includes('--elevated-retry')) return false;
    if (isRunningAsAdminSync()) return false;

    const targetExe = resolveExecutablePath({ env, execPath, isPackaged });
    if (!targetExe) return false;

    const forwardedArgs = argv.slice(1).filter((a) => a && a !== '.' && a !== '--elevated-retry');
    forwardedArgs.push('--elevated-retry');

    const psSingleQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const argListExpr = forwardedArgs.map(psSingleQuote).join(', ');
    const cmd = `Start-Process -FilePath ${psSingleQuote(targetExe)} -ArgumentList @(${argListExpr}) -Verb RunAs`;
    const encoded = Buffer.from(cmd, 'utf16le').toString('base64');

    try {
        const child = _spawn('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded,
        ], {
            detached: true,
            windowsHide: true,
            stdio: 'ignore',
        });
        if (child && typeof child.unref === 'function') child.unref();
        return true;
    } catch (_) {
        return false;
    }
}

module.exports = {
    TASK_NAME,
    escapeXml,
    unescapeXml,
    resolveCurrentUser,
    resolveExecutablePath,
    isRunningAsAdminSync,
    isRunningAsAdmin,
    buildTaskXml,
    parseTaskQueryXml,
    queryAutoStartTask,
    getCachedStatus,
    setAutoStart,
    syncAutoStartOnBoot,
    relaunchElevatedIfNeeded,
    _setRunner: ({ execFileAsync, execFileSyncFn, spawnFn } = {}) => {
        if (execFileAsync) _execFileAsync = execFileAsync;
        if (execFileSyncFn) _execFileSync = execFileSyncFn;
        if (spawnFn) _spawn = spawnFn;
    },
    _reset: () => {
        _isAdminCache = null;
        _cachedTaskState = null;
        _execFileAsync = (file, args, opts) => new Promise((resolve) => {
            execFile(file, args, Object.assign({ windowsHide: true, timeout: 8000 }, opts || {}), (err, stdout, stderr) => {
                resolve({ err: err || null, stdout: stdout || '', stderr: stderr || '' });
            });
        });
        _execFileSync = (file, args, opts) => execFileSync(file, args, opts);
        _spawn = (file, args, opts) => spawn(file, args, opts);
    },
};
