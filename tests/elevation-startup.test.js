// --- tests/elevation-startup.test.js ---
// Unit tests for Administrator elevation detection, self-elevation guard,
// and Windows Task Scheduler startup registration logic.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const elevationStartup = require('../elevation-startup');

test('elevation-startup: resolves current user safely', () => {
    const user = elevationStartup.resolveCurrentUser({
        env: { USERDOMAIN: 'MYPC', USERNAME: 'alirza' },
        userInfo: { username: 'alirza' },
    });
    assert.strictEqual(user, 'MYPC\\alirza');

    const alreadyQualified = elevationStartup.resolveCurrentUser({
        env: { USERDOMAIN: 'MYPC' },
        userInfo: { username: 'CORP\\alirza' },
    });
    assert.strictEqual(alreadyQualified, 'CORP\\alirza');
});

test('elevation-startup: prioritizes PORTABLE_EXECUTABLE_FILE over ephemeral temp execPath', () => {
    const portablePath = elevationStartup.resolveExecutablePath({
        env: { PORTABLE_EXECUTABLE_FILE: 'C:\\Users\\1224\\Desktop\\BABA Tunnel 1.0.2.exe' },
        execPath: 'C:\\Users\\1224\\AppData\\Local\\Temp\\2x9abc\\BABA Tunnel.exe',
        isPackaged: true,
    });
    assert.strictEqual(portablePath, path.resolve('C:\\Users\\1224\\Desktop\\BABA Tunnel 1.0.2.exe'));

    const installedPath = elevationStartup.resolveExecutablePath({
        env: {},
        execPath: 'C:\\Users\\1224\\AppData\\Local\\Programs\\baba-tunnel\\BABA Tunnel.exe',
        isPackaged: true,
    });
    assert.strictEqual(installedPath, path.resolve('C:\\Users\\1224\\AppData\\Local\\Programs\\baba-tunnel\\BABA Tunnel.exe'));

    const devPath = elevationStartup.resolveExecutablePath({
        env: {},
        execPath: 'C:\\project\\node_modules\\electron\\dist\\electron.exe',
        isPackaged: false,
    });
    assert.strictEqual(devPath, null);
});

test('elevation-startup: generates valid HighestAvailable XML with escaping and laptop battery support', () => {
    const xml = elevationStartup.buildTaskXml({
        userId: 'PC\\User&Test',
        command: 'C:\\Program Files\\BABA & Tunnel\\BABA Tunnel.exe',
        argumentsStr: '--autostart',
        workingDir: 'C:\\Program Files\\BABA & Tunnel',
    });

    assert.ok(xml.includes('<RunLevel>HighestAvailable</RunLevel>'));
    assert.ok(xml.includes('<LogonType>InteractiveToken</LogonType>'));
    assert.ok(xml.includes('<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>'));
    assert.ok(xml.includes('<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>'));
    assert.ok(xml.includes('<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>'));
    assert.ok(xml.includes('<Command>C:\\Program Files\\BABA &amp; Tunnel\\BABA Tunnel.exe</Command>'));
    assert.ok(xml.includes('<UserId>PC\\User&amp;Test</UserId>'));
    assert.ok(xml.includes('<Arguments>--autostart</Arguments>'));

    const parsed = elevationStartup.parseTaskQueryXml(xml);
    assert.strictEqual(parsed.exists, true);
    assert.strictEqual(parsed.enabled, true);
    assert.strictEqual(parsed.highestAvailable, true);
    assert.strictEqual(parsed.command, 'C:\\Program Files\\BABA & Tunnel\\BABA Tunnel.exe');
    assert.strictEqual(parsed.argumentsStr, '--autostart');
});

test('elevation-startup: detects admin integrity level cleanly from whoami output', () => {
    elevationStartup._reset();
    try {
        elevationStartup._setRunner({
            execFileSyncFn: () => 'Mandatory Label\\Medium Mandatory Level   Label   S-1-16-8192',
        });
        assert.strictEqual(elevationStartup.isRunningAsAdminSync(true), false);

        elevationStartup._setRunner({
            execFileSyncFn: () => 'Mandatory Label\\High Mandatory Level     Label   S-1-16-12288',
        });
        assert.strictEqual(elevationStartup.isRunningAsAdminSync(true), true);
    } finally {
        elevationStartup._reset();
    }
});

test('elevation-startup: relaunchElevatedIfNeeded respects guards and spawns RunAs when un-elevated in packaged mode', () => {
    elevationStartup._reset();
    let spawnedCalls = [];
    try {
        elevationStartup._setRunner({
            execFileSyncFn: () => 'Mandatory Label\\Medium Mandatory Level   Label   S-1-16-8192',
            spawnFn: (file, args, opts) => {
                spawnedCalls.push({ file, args, opts });
                return { unref: () => {} };
            },
        });

        // 1. Skips in dev mode
        assert.strictEqual(elevationStartup.relaunchElevatedIfNeeded({
            isPackaged: false,
            argv: ['electron.exe', '.'],
            execPath: 'electron.exe',
        }), false);
        assert.strictEqual(spawnedCalls.length, 0);

        // 2. Skips if already retried
        assert.strictEqual(elevationStartup.relaunchElevatedIfNeeded({
            isPackaged: true,
            argv: ['BABA Tunnel.exe', '--elevated-retry'],
            execPath: 'C:\\App\\BABA Tunnel.exe',
        }), false);
        assert.strictEqual(spawnedCalls.length, 0);

        // 3. Relaunches when packaged + un-elevated
        const didRelaunch = elevationStartup.relaunchElevatedIfNeeded({
            isPackaged: true,
            argv: ['BABA Tunnel.exe'],
            env: { PORTABLE_EXECUTABLE_FILE: 'C:\\Desktop\\BABA Tunnel 1.0.2.exe' },
            execPath: 'C:\\Temp\\BABA Tunnel.exe',
        });
        assert.strictEqual(didRelaunch, true);
        assert.strictEqual(spawnedCalls.length, 1);
        assert.strictEqual(spawnedCalls[0].file, 'powershell.exe');
        const encodedCmd = spawnedCalls[0].args[spawnedCalls[0].args.length - 1];
        const decoded = Buffer.from(encodedCmd, 'base64').toString('utf16le');
        assert.ok(decoded.includes("C:\\Desktop\\BABA Tunnel 1.0.2.exe"));
        assert.ok(decoded.includes('-Verb RunAs'));
        assert.ok(decoded.includes('--elevated-retry'));
    } finally {
        elevationStartup._reset();
    }
});

test('elevation-startup: registers, verifies, updates changed paths, and removes Task Scheduler entry cleanly', async () => {
    elevationStartup._reset();
    const calls = [];
    let storedTaskXml = null;

    try {
        elevationStartup._setRunner({
            execFileSyncFn: () => 'Mandatory Label\\High Mandatory Level   Label   S-1-16-12288',
            execFileAsync: async (file, args) => {
                calls.push({ file, args: [...args] });
                if (file === 'schtasks.exe' && args[0] === '/Query') {
                    if (!storedTaskXml) {
                        return { err: new Error('ERROR: The system cannot find the file specified.'), stdout: '', stderr: 'ERROR: The system cannot find the file specified.' };
                    }
                    return { err: null, stdout: storedTaskXml, stderr: '' };
                }
                if (file === 'schtasks.exe' && args[0] === '/Create') {
                    const xmlIdx = args.indexOf('/XML');
                    const xmlPath = args[xmlIdx + 1];
                    const fs = require('fs');
                    storedTaskXml = fs.readFileSync(xmlPath, 'utf16le').replace(/^\uFEFF/, '');
                    return { err: null, stdout: 'SUCCESS', stderr: '' };
                }
                if (file === 'schtasks.exe' && args[0] === '/Delete') {
                    storedTaskXml = null;
                    return { err: null, stdout: 'SUCCESS', stderr: '' };
                }
                return { err: null, stdout: '', stderr: '' };
            },
        });

        const envV1 = { USERDOMAIN: 'PC', USERNAME: 'user', PORTABLE_EXECUTABLE_FILE: 'C:\\Desk\\BABA Tunnel 1.0.1.exe' };
        const st1 = await elevationStartup.syncAutoStartOnBoot({ desiredEnabled: true, isPackaged: true, env: envV1 });
        assert.strictEqual(st1.active, true);
        assert.strictEqual(st1.highestAvailable, true);
        assert.strictEqual(st1.matchesCurrentExe, true);
        assert.strictEqual(calls.filter(c => c.args[0] === '/Create').length, 1);

        // Second sync with same path does NOT call /Create again
        await elevationStartup.syncAutoStartOnBoot({ desiredEnabled: true, isPackaged: true, env: envV1 });
        assert.strictEqual(calls.filter(c => c.args[0] === '/Create').length, 1);

        // Sync after user upgrades/moves executable to 1.0.2 automatically updates the task path
        const envV2 = { USERDOMAIN: 'PC', USERNAME: 'user', PORTABLE_EXECUTABLE_FILE: 'C:\\Desk\\BABA Tunnel 1.0.2.exe' };
        const st2 = await elevationStartup.syncAutoStartOnBoot({ desiredEnabled: true, isPackaged: true, env: envV2 });
        assert.strictEqual(st2.active, true);
        assert.strictEqual(st2.matchesCurrentExe, true);
        assert.strictEqual(calls.filter(c => c.args[0] === '/Create').length, 2);

        // Disable removes task cleanly
        const stOff = await elevationStartup.setAutoStart(false, { env: envV2, isPackaged: true });
        assert.strictEqual(stOff.active, false);
        assert.strictEqual(storedTaskXml, null);
    } finally {
        elevationStartup._reset();
    }
});
