// --- tests/kill-switch.test.js ---
// Tests Kill Switch logic: preference persistence, state transitions, and blackhole proxy engagement.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const killSwitch = require('../kill-switch');
const systemProxy = require('../system-proxy');

test('kill-switch: setting persistence and initial state', async () => {
    killSwitch._reset();
    const configPath = killSwitch.getKillSwitchConfigFile();
    assert.ok(configPath.includes('kill-switch.json'));

    const initial = killSwitch.getStatus();
    assert.strictEqual(initial.enabled, false);
    assert.strictEqual(initial.engaged, false);

    // Turn setting ON
    const updated = await killSwitch.setSetting(true, 'on');
    assert.strictEqual(updated.enabled, true);
    // When VPN phase is 'on', blackhole is not engaged
    assert.strictEqual(updated.engaged, false);

    // Check saved file
    assert.ok(fs.existsSync(configPath));
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.strictEqual(saved.enabled, true);

    // Turn setting OFF
    const off = await killSwitch.setSetting(false, 'on');
    assert.strictEqual(off.enabled, false);
    assert.strictEqual(off.engaged, false);
});

test('kill-switch: engages blackhole when enabled and VPN is off / disconnected', async () => {
    killSwitch._reset();

    // 1. Enable kill switch while disconnected
    const status1 = await killSwitch.setSetting(true, 'off');
    assert.strictEqual(status1.enabled, true);
    assert.strictEqual(status1.engaged, true, 'Blackhole should be engaged when enabled and VPN is off');

    // 2. Simulate VPN transition to 'on'
    const status2 = await killSwitch.onSessionState('on');
    assert.strictEqual(status2.engaged, false, 'Blackhole should disengage when VPN connects');

    // 3. Simulate VPN unexpected drop to 'off'
    const status3 = await killSwitch.onSessionState('off');
    assert.strictEqual(status3.engaged, true, 'Blackhole should re-engage when VPN connection drops');

    // 4. Disable kill switch
    const status4 = await killSwitch.setSetting(false, 'off');
    assert.strictEqual(status4.enabled, false);
    assert.strictEqual(status4.engaged, false, 'Blackhole should disengage when kill switch is disabled');
});
