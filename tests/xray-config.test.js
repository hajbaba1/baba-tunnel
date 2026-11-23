// --- tests/xray-config.test.js ---
// Validates Xray configuration generation, local-only binding, and structural integrity.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const bbt = require('../bbt-core');
const fenix = bbt;
const xrayRunner = require('../xray-runner');

test('xray-config: structure and local binding from fixed inputs', () => {
    const srv = { host: 'de-fra-wg-001.vpn.mozilla.org', port: 443, cc: 'DE' };
    const addresses = ['151.101.1.1', '151.101.65.1'];
    const token = 'sample-jwt-bearer-pass';

    const cfg = bbt.config(srv, addresses, token);

    // Verify inbounds
    assert.ok(Array.isArray(cfg.inbounds), 'inbounds must be an array');
    assert.strictEqual(cfg.inbounds.length >= 2, true, 'At least two inbounds configured (SOCKS and HTTP)');

    const socksIn = cfg.inbounds.find((i) => i.tag === 'socks-in');
    assert.ok(socksIn, 'Must include socks-in inbound');
    assert.strictEqual(socksIn.port, 10808, 'SOCKS port must be 10808');

    const httpIn = cfg.inbounds.find((i) => i.tag === 'http-in');
    assert.ok(httpIn, 'Must include http-in inbound');
    assert.strictEqual(httpIn.port, 10809, 'HTTP port must be 10809');

    for (const inbound of cfg.inbounds) {
        assert.strictEqual(inbound.listen, '127.0.0.1', 'Inbound must strictly listen on 127.0.0.1');
        assert.notStrictEqual(inbound.listen, '0.0.0.0', 'Inbound must NEVER listen on 0.0.0.0');
    }

    // Verify outbounds
    assert.ok(Array.isArray(cfg.outbounds), 'outbounds must be an array');
    const bbtOutbound = cfg.outbounds.find((o) => o.tag === 'bbt-0' || o.tag === 'fenix-0');
    assert.ok(bbtOutbound, 'Must include bbt-0 outbound');
    assert.strictEqual(bbtOutbound.protocol, 'http', 'Must use HTTP CONNECT proxy protocol');
    assert.strictEqual(
        bbtOutbound.settings.headers['Proxy-Authorization'],
        'Bearer ' + token,
        'Outbound must pass bearer token in Proxy-Authorization header'
    );

    // Verify DNS over HTTPS through tunnel
    assert.ok(cfg.dns, 'DNS config must exist');
    assert.ok(Array.isArray(cfg.dns.servers), 'DNS servers array must exist');
    assert.ok(cfg.dns.servers.some((s) => s.startsWith('https://')), 'Must use DoH servers');

    // JSON serialization test: no 0.0.0.0 anywhere
    const jsonStr = JSON.stringify(cfg);
    assert.strictEqual(jsonStr.includes('0.0.0.0'), false, 'Config must not contain 0.0.0.0');
});

test('xray-runner: ports are strictly local loopback', () => {
    const ports = xrayRunner.getPorts();
    assert.strictEqual(ports.socks, 10808);
    assert.strictEqual(ports.http, 10809);
    assert.strictEqual(xrayRunner.SOCKS_PORT, 10808);
    assert.strictEqual(xrayRunner.HTTP_PORT, 10809);
});
