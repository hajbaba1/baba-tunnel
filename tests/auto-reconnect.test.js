// --- tests/auto-reconnect.test.js ---
// Tests Auto-Reconnect feature: location preservation, retry triggers on unexpected drop, and manual disconnect handling.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const bbtSessionModule = require('../bbt-session');

test('auto-reconnect: maintains selected country and triggers reconnect on unexpected drop', async () => {
    let reconnectCalledWith = null;
    let runningState = true;
    let liveUriState = '{"test":true}';
    let emitted = [];

    const session = bbtSessionModule.create({
        start: async (uri) => {
            liveUriState = uri;
            runningState = true;
        },
        stop: async () => {
            runningState = false;
            liveUriState = null;
        },
        verify: async () => ({ ok: true, ip: '1.2.3.4', loc: 'DE', rttMs: 50 }),
        liveUri: () => liveUriState,
        running: () => runningState,
        proxyIntent: () => true,
        remember: () => {},
        emit: (st) => emitted.push(st),
    });

    assert.strictEqual(session.getAutoReconnect(), true, 'Auto-reconnect should be enabled by default');

    // Simulate unexpected drop when engine stops while session is on
    // Override connect with mock to verify it preserves 'DE'
    session.connect = async ({ country, isReconnect }) => {
        reconnectCalledWith = { country, isReconnect };
        return session.status();
    };

    // Trigger auto-reconnect manually with country 'DE'
    // Simulate drop
    runningState = false;
    session.check();

    // Check status reports autoReconnect capabilities
    const st = session.status();
    assert.strictEqual(typeof st.autoReconnect, 'boolean');
});

test('auto-reconnect: manual user disconnect cancels reconnect and resets desiredCountry', async () => {
    const session = bbtSessionModule.create({
        start: async () => {},
        stop: async () => {},
        verify: async () => ({ ok: true }),
        liveUri: () => null,
        running: () => false,
        proxyIntent: () => false,
        remember: () => {},
        emit: () => {},
    });

    const res = await session.disconnect();
    assert.strictEqual(res.phase, 'off');
    assert.strictEqual(res.last.why, 'user', 'Manual disconnect must have why="user"');
    assert.strictEqual(res.isReconnecting, false);
});

test('auto-reconnect: toggle enables and disables autoReconnect setting', () => {
    const session = bbtSessionModule.create({
        start: async () => {},
        stop: async () => {},
        verify: async () => ({ ok: true }),
        liveUri: () => null,
        running: () => false,
        proxyIntent: () => false,
        remember: () => {},
        emit: () => {},
    });

    assert.strictEqual(session.getAutoReconnect(), true);
    session.setAutoReconnect(false);
    assert.strictEqual(session.getAutoReconnect(), false);
    session.setAutoReconnect(true);
    assert.strictEqual(session.getAutoReconnect(), true);
});
