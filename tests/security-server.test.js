// --- tests/security-server.test.js ---
// Tests security hardening: Host validation, token authentication, input validation, and log sanitization.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { createApp, startServer } = require('../server');
const fenix = require('../fenix');

function httpRequest({ port, path, method = 'GET', headers = {}, body = null }) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const reqHeaders = Object.assign({}, headers);
        if (payload) {
            reqHeaders['Content-Type'] = 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path,
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

test('security-server: Host and Origin rejection (DNS rebinding & CSRF protection)', async () => {
    const { server, port, sessionToken } = await startServer(0);

    try {
        // 1. Invalid Host header
        const resHost = await httpRequest({
            port,
            path: '/api/fenix',
            headers: {
                'Host': 'attacker-rebind.com',
                'x-fenix-token': sessionToken,
            },
        });
        assert.strictEqual(resHost.status, 403, 'Must reject untrusted Host header with 403');
        assert.ok(resHost.data.includes('DNS rebinding'));

        // 2. Untrusted external Origin
        const resOrigin = await httpRequest({
            port,
            path: '/api/fenix',
            headers: {
                'Host': `127.0.0.1:${port}`,
                'Origin': 'http://malicious-website.com',
                'x-fenix-token': sessionToken,
            },
        });
        assert.strictEqual(resOrigin.status, 403, 'Must reject external Origin with 403');

        // 3. Missing session token
        const resNoToken = await httpRequest({
            port,
            path: '/api/fenix',
            headers: {
                'Host': `127.0.0.1:${port}`,
            },
        });
        assert.strictEqual(resNoToken.status, 403, 'Must reject request with missing token with 403');

        // 4. Correct local Host and Token
        const resValid = await httpRequest({
            port,
            path: '/api/fenix',
            headers: {
                'Host': `127.0.0.1:${port}`,
                'x-fenix-token': sessionToken,
            },
        });
        assert.strictEqual(resValid.status, 200, 'Valid local request with token must succeed with 200');
        assert.strictEqual(resValid.json.ok, true);
    } finally {
        server.close();
    }
});

test('security-routes: strict input validation on /api/fenix/*', async () => {
    const { server, port, sessionToken } = await startServer(0);

    try {
        const authHeaders = {
            'Host': `127.0.0.1:${port}`,
            'x-fenix-token': sessionToken,
        };

        // 1. Signin with invalid email
        const resBadEmail = await httpRequest({
            port,
            path: '/api/fenix/signin',
            method: 'POST',
            headers: authHeaders,
            body: { email: 'not-an-email', password: 'secretpassword123' },
        });
        assert.strictEqual(resBadEmail.status, 400);
        assert.strictEqual(resBadEmail.json.code, 'INVALID_INPUT');

        // 2. Verify code with non-numeric code
        const resBadCode = await httpRequest({
            port,
            path: '/api/fenix/code',
            method: 'POST',
            headers: authHeaders,
            body: { code: 'abcdef' },
        });
        assert.strictEqual(resBadCode.status, 400);
        assert.strictEqual(resBadCode.json.code, 'INVALID_INPUT');

        // 3. Challenge with untrusted host
        const resBadChallenge = await httpRequest({
            port,
            path: '/api/fenix/challenge',
            method: 'POST',
            headers: authHeaders,
            body: { host: 'evil-phishing-host.com' },
        });
        assert.strictEqual(resBadChallenge.status, 400);
        assert.strictEqual(resBadChallenge.json.code, 'INVALID_INPUT');
    } finally {
        server.close();
    }
});

test('security-routes: error responses from signin/code/connect do not leak secrets', async () => {
    const { server, port, sessionToken } = await startServer(0);

    try {
        const authHeaders = {
            'Host': `127.0.0.1:${port}`,
            'x-fenix-token': sessionToken,
        };

        const secretPassword = 'SUPER_SECRET_PLAINTEXT_PASSWORD_999!';
        const secretBearer = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.SECRET_TOKEN_XYZ';

        // 1. /api/fenix/signin with invalid email containing secret
        const resSignin = await httpRequest({
            port,
            path: '/api/fenix/signin',
            method: 'POST',
            headers: authHeaders,
            body: { email: `invalid-email-with-${secretBearer}`, password: secretPassword },
        });
        assert.ok(resSignin.status >= 400);
        assert.strictEqual(resSignin.data.includes(secretPassword), false, 'Error response must not leak secretPassword');
        assert.strictEqual(resSignin.data.includes('SECRET_TOKEN_XYZ'), false, 'Error response must not leak JWT token');

        // 2. /api/fenix/code with secret payload in code field
        const resCode = await httpRequest({
            port,
            path: '/api/fenix/code',
            method: 'POST',
            headers: authHeaders,
            body: { code: `code_leak_${secretPassword}` },
        });
        assert.ok(resCode.status >= 400);
        assert.strictEqual(resCode.data.includes(secretPassword), false, 'Error response must not leak secretPassword');

        // 3. /api/fenix/connect with malformed country containing token
        const resConnect = await httpRequest({
            port,
            path: '/api/fenix/connect',
            method: 'POST',
            headers: authHeaders,
            body: { country: `TOKEN_${secretPassword}`, accountId: 'bad_id' },
        });
        assert.ok(resConnect.status >= 200); // Handled gracefully or errored
        assert.strictEqual(resConnect.data.includes(secretPassword), false, 'Connect response must not leak secret');
    } finally {
        server.close();
    }
});

test('security-sanitization: sanitizeLog removes passwords, tokens, emails, and auth headers', () => {
    const rawLog = 'User user.name+test@example.com signed in with password="MySecretPassword123!" code=123456 Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c and Proxy-Authorization: Bearer secret-token-xyz';

    const sanitized = fenix.sanitizeLog(rawLog);

    // Verify redactions
    assert.strictEqual(sanitized.includes('user.name+test@example.com'), false, 'Email must be redacted');
    assert.ok(sanitized.includes('[REDACTED_EMAIL]'));

    assert.strictEqual(sanitized.includes('MySecretPassword123!'), false, 'Password must be redacted');
    assert.strictEqual(sanitized.includes('123456'), false, 'Code must be redacted');

    assert.strictEqual(sanitized.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), false, 'JWT must be redacted');
    assert.strictEqual(sanitized.includes('secret-token-xyz'), false, 'Bearer token must be redacted');

    assert.ok(sanitized.includes('Bearer [REDACTED]'));
    assert.ok(sanitized.includes('Authorization: Bearer [REDACTED]'));
    assert.ok(sanitized.includes('Proxy-Authorization: Bearer [REDACTED]'));
});
