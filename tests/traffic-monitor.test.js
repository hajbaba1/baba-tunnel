// --- tests/traffic-monitor.test.js ---
// Tests real-time traffic statistics reporting and /api/traffic endpoint.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { startServer } = require('../server');
const trafficMonitor = require('../traffic-monitor');

function httpRequest({ port, path, headers = {} }) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path,
            method: 'GET',
            headers,
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(data); } catch (e) {}
                resolve({ status: res.statusCode, data, json });
            });
        });

        req.on('error', reject);
        req.end();
    });
}

test('traffic-monitor: initial disconnected state returns valid structure', async () => {
    trafficMonitor.resetSession();
    const stats = await trafficMonitor.getStats();

    assert.ok(stats, 'Stats must exist');
    assert.strictEqual(stats.ok, true);
    assert.strictEqual(stats.connected, false);
    assert.strictEqual(typeof stats.sent, 'number');
    assert.strictEqual(typeof stats.received, 'number');
    assert.strictEqual(typeof stats.uploadSpeed, 'number');
    assert.strictEqual(typeof stats.downloadSpeed, 'number');
});

test('traffic-monitor: /api/traffic and /api/bbt/traffic are accessible on local server', async () => {
    const { server, port } = await startServer(0);

    try {
        // 1. /api/traffic direct GET
        const resTraffic = await httpRequest({
            port,
            path: '/api/traffic',
            headers: { 'Host': `127.0.0.1:${port}` },
        });

        assert.strictEqual(resTraffic.status, 200);
        assert.strictEqual(resTraffic.json.ok, true);
        assert.strictEqual(typeof resTraffic.json.sent, 'number');
        assert.strictEqual(typeof resTraffic.json.received, 'number');

        // 2. /api/bbt/traffic
        const resBbtTraffic = await httpRequest({
            port,
            path: '/api/bbt/traffic',
            headers: { 'Host': `127.0.0.1:${port}` },
        });

        assert.strictEqual(resBbtTraffic.status, 200);
        assert.strictEqual(resBbtTraffic.json.ok, true);
    } finally {
        server.close();
    }
});
