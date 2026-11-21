// --- tests/system-proxy.test.js ---
// Tests Windows system proxy state tracking, persistence, and crash recovery.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const systemProxy = require('../system-proxy');

test('system-proxy: backup file location and state persistence', async () => {
    const backupFile = systemProxy.getBackupFile();
    assert.ok(backupFile, 'Backup file path must be defined');
    assert.ok(backupFile.includes('previous-proxy-state.json'));

    // Clean up if left over
    if (fs.existsSync(backupFile)) fs.unlinkSync(backupFile);

    const dummyData = {
        state: { enabled: false, server: '127.0.0.1:10808', override: '<local>' },
        timestamp: Date.now(),
    };

    fs.writeFileSync(backupFile, JSON.stringify(dummyData), 'utf8');
    assert.ok(fs.existsSync(backupFile), 'Backup file should exist after writing');

    const readBack = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    assert.strictEqual(readBack.state.server, '127.0.0.1:10808');

    // Clean up
    fs.unlinkSync(backupFile);
    assert.strictEqual(fs.existsSync(backupFile), false);
});

test('system-proxy: crash recovery restores previous state if file exists on startup', async () => {
    const backupFile = systemProxy.getBackupFile();

    // 1. Simulate an abnormal crash by writing state file directly
    const crashedState = {
        state: { enabled: false, server: '', override: '<local>' },
        timestamp: Date.now() - 10000,
    };
    fs.writeFileSync(backupFile, JSON.stringify(crashedState), 'utf8');
    assert.ok(fs.existsSync(backupFile), 'State file must exist before recovery');

    // 2. Call crash recovery
    const recovered = systemProxy.recoverFromCrash();
    assert.strictEqual(recovered, true, 'recoverFromCrash should return true when file is recovered');

    // 3. State file must be cleaned up
    assert.strictEqual(fs.existsSync(backupFile), false, 'State file must be deleted after recovery');

    // 4. Calling recovery again when no file exists returns false
    const recoveredAgain = systemProxy.recoverFromCrash();
    assert.strictEqual(recoveredAgain, false);
});
