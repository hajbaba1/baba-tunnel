// --- tests/prefs-persistence.test.js ---
// Tests durable backend persistence of selected country (location), tunnel/coverage mode,
// autoReconnect, and autoStart across dynamic server restarts without touching user AppData.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const { startServer } = require('../server');
const bbt = require('../bbt-core');
const elevationStartup = require('../elevation-startup');

function httpRequest({ port, reqPath, method = 'GET', headers = {}, body = null }) {
    return new Promise((resolve, reject) => {
        const payload = body !== undefined && body !== null ? JSON.stringify(body) : null;
        const reqHeaders = Object.assign({}, headers);
        if (payload) {
            reqHeaders['Content-Type'] = 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: reqPath,
            method,
            headers: reqHeaders,
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
        if (payload) req.write(payload);
        req.end();
    });
}

test('prefs-persistence: country and coverage survive across server restarts and random ports', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbt-prefs-test-'));
    const prevStorageEnv = process.env.BBT_STORAGE_DIR;
    process.env.BBT_STORAGE_DIR = tmpDir;

    try {
        // Default values cleanly populated
        const initial = bbt.getPrefs();
        assert.strictEqual(initial.country, 'fastest');
        assert.strictEqual(initial.coverage, 'system');
        assert.strictEqual(initial.autoReconnect, true);
        assert.strictEqual(initial.autoStart, true);

        // Session 1 (ephemeral port A)
        const s1 = await startServer(0);
        try {
            const auth1 = { Host: `127.0.0.1:${s1.port}`, 'x-bbt-token': s1.sessionToken };

            // Select United States + Full System Tunnel ("tunnel")
            const postRes = await httpRequest({
                port: s1.port,
                reqPath: '/api/bbt/prefs',
                method: 'POST',
                headers: auth1,
                body: { country: 'us', coverage: 'tunnel' },
            });
            assert.strictEqual(postRes.status, 200);
            assert.strictEqual(postRes.json.prefs.country, 'US');
            assert.strictEqual(postRes.json.prefs.coverage, 'tunnel');

            // Reject invalid country or invalid coverage strictly
            const badCountry = await httpRequest({
                port: s1.port,
                reqPath: '/api/bbt/prefs',
                method: 'POST',
                headers: auth1,
                body: { country: 'INVALID_123' },
            });
            assert.strictEqual(badCountry.status, 400);
            assert.strictEqual(badCountry.json.code, 'INVALID_INPUT');

            const badCoverage = await httpRequest({
                port: s1.port,
                reqPath: '/api/bbt/prefs',
                method: 'POST',
                headers: auth1,
                body: { coverage: 'wireguard' },
            });
            assert.strictEqual(badCoverage.status, 400);
            assert.strictEqual(badCoverage.json.code, 'INVALID_INPUT');

            // Toggle autoReconnect to false
            const arRes = await httpRequest({
                port: s1.port,
                reqPath: '/api/bbt/autoreconnect',
                method: 'POST',
                headers: auth1,
                body: { enabled: false },
            });
            assert.strictEqual(arRes.status, 200);
            assert.strictEqual(arRes.json.enabled, false);
        } finally {
            s1.server.close();
        }

        // Session 2 (new ephemeral port B simulating full Windows/app restart)
        const s2 = await startServer(0);
        try {
            assert.notStrictEqual(s2.port, s1.port);
            const auth2 = { Host: `127.0.0.1:${s2.port}`, 'x-bbt-token': s2.sessionToken };

            const getState = await httpRequest({
                port: s2.port,
                reqPath: '/api/bbt',
                headers: auth2,
            });
            assert.strictEqual(getState.status, 200);
            assert.strictEqual(getState.json.prefs.country, 'US', 'Selected country must persist across restarts');
            assert.strictEqual(getState.json.prefs.coverage, 'tunnel', 'Selected tunnel mode must persist across restarts');
            assert.strictEqual(getState.json.prefs.autoReconnect, false, 'autoReconnect toggle must persist across restarts');
            assert.strictEqual(getState.json.autoReconnect, false, 'Session instance must hydrate persisted autoReconnect');
            assert.strictEqual(typeof getState.json.isAdmin, 'boolean');

            const getIndex = await httpRequest({
                port: s2.port,
                reqPath: '/',
                headers: { Host: `127.0.0.1:${s2.port}` },
            });
            assert.strictEqual(getIndex.status, 200);
            assert.ok(getIndex.data.includes('"country":"US"'), 'Initial HTML payload must inject persisted country');
            assert.ok(getIndex.data.includes('"coverage":"tunnel"'), 'Initial HTML payload must inject persisted coverage');
        } finally {
            s2.server.close();
        }
    } finally {
        if (prevStorageEnv === undefined) delete process.env.BBT_STORAGE_DIR;
        else process.env.BBT_STORAGE_DIR = prevStorageEnv;
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('prefs-persistence: /api/bbt/autostart route coordinates Task Scheduler and bbt.json', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbt-autostart-route-'));
    const prevStorageEnv = process.env.BBT_STORAGE_DIR;
    const prevPortableEnv = process.env.PORTABLE_EXECUTABLE_FILE;
    process.env.BBT_STORAGE_DIR = tmpDir;
    process.env.PORTABLE_EXECUTABLE_FILE = 'C:\\Desktop\\BABA Tunnel 1.0.2.exe';
    elevationStartup._reset();

    let createdXml = null;
    elevationStartup._setRunner({
        execFileSyncFn: () => 'Mandatory Label\\High Mandatory Level   Label   S-1-16-12288',
        execFileAsync: async (file, args) => {
            if (args[0] === '/Query') {
                return createdXml
                    ? { err: null, stdout: createdXml, stderr: '' }
                    : { err: new Error('not found'), stdout: '', stderr: 'not found' };
            }
            if (args[0] === '/Create') {
                const xmlPath = args[args.indexOf('/XML') + 1];
                createdXml = fs.readFileSync(xmlPath, 'utf16le').replace(/^\uFEFF/, '');
                return { err: null, stdout: 'SUCCESS', stderr: '' };
            }
            if (args[0] === '/Delete') {
                createdXml = null;
                return { err: null, stdout: 'SUCCESS', stderr: '' };
            }
            return { err: null, stdout: '', stderr: '' };
        },
    });

    const srv = await startServer(0);
    try {
        const auth = { Host: `127.0.0.1:${srv.port}`, 'x-bbt-token': srv.sessionToken };

        const enableRes = await httpRequest({
            port: srv.port,
            reqPath: '/api/bbt/autostart',
            method: 'POST',
            headers: auth,
            body: { enabled: true },
        });
        assert.strictEqual(enableRes.status, 200);
        assert.strictEqual(enableRes.json.enabled, true);
        assert.strictEqual(enableRes.json.active, true);
        assert.strictEqual(enableRes.json.highestAvailable, true);
        assert.ok(createdXml.includes('BABA Tunnel 1.0.2.exe'));

        const disableRes = await httpRequest({
            port: srv.port,
            reqPath: '/api/bbt/autostart',
            method: 'POST',
            headers: auth,
            body: { enabled: false },
        });
        assert.strictEqual(disableRes.status, 200);
        assert.strictEqual(disableRes.json.enabled, false);
        assert.strictEqual(disableRes.json.active, false);
        assert.strictEqual(createdXml, null);
        assert.strictEqual(bbt.getPrefs().autoStart, false);
    } finally {
        srv.server.close();
        elevationStartup._reset();
        if (prevStorageEnv === undefined) delete process.env.BBT_STORAGE_DIR;
        else process.env.BBT_STORAGE_DIR = prevStorageEnv;
        if (prevPortableEnv === undefined) delete process.env.PORTABLE_EXECUTABLE_FILE;
        else process.env.PORTABLE_EXECUTABLE_FILE = prevPortableEnv;
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});
