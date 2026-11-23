// --- tests/health-check-session.test.js ---
// Tests health-check probe failure modes and bbt-session state machine without external network.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const healthCheck = require('../health-check');
const bbtSessionModule = require('../bbt-session');

test('health-check: verify returns failure when local SOCKS port is not listening', async () => {
    // Pick an inactive high port on localhost
    const inactivePort = 59123;
    const res = await healthCheck.verify(inactivePort, { timeoutMs: 500 });

    assert.ok(res, 'Response object must exist');
    assert.strictEqual(res.ok, false, 'Probe must return ok=false on closed port');
    assert.ok(res.error, 'Must report error details');
});

test('bbt-session: state machine initialization and check()', () => {
    let emitted = [];
    const session = bbtSessionModule.create({
        start: async () => {},
        stop: async () => {},
        verify: async () => ({ ok: true }),
        liveUri: () => null,
        running: () => false,
        proxyIntent: () => false,
        remember: () => {},
        emit: (st) => emitted.push(st),
    });

    assert.ok(session, 'Session instance created');
    const st = session.check();
    assert.strictEqual(st.phase, 'off', 'Initial phase must be off');
    assert.strictEqual(st.live, false);
});

test('bbt-session: disconnect on already stopped session', async () => {
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
    assert.ok(res);
    assert.strictEqual(res.phase, 'off');
});
