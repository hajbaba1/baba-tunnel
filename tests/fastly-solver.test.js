// --- tests/fastly-solver.test.js ---
// Tests Fastly Bot Challenge Solver on fixed deterministic test vectors.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const solver = require('../fastly-solver');

test('fastly-solver: isChallengePage detection', () => {
    const normalHtml = '<!DOCTYPE html><html><body><h1>Sign in</h1></body></html>';
    const challengeHtml = '<!DOCTYPE html><html><head><script src="/_fs-ch-a1b2c3d4/script.js"></script></head><body>Client Challenge</body></html>';

    assert.strictEqual(solver.isChallengePage(normalHtml), false);
    assert.strictEqual(solver.isChallengePage(challengeHtml), true);
    assert.strictEqual(solver.isChallengePage(''), false);
    assert.strictEqual(solver.isChallengePage(null), false);
});

test('fastly-solver: solvePow on fixed challenge', () => {
    const base = 'fastly-seed-prefix-9876';
    const expectedSuffix = 'Xy';
    const targetHex = crypto.createHash('sha256').update(base + expectedSuffix, 'utf8').digest('hex');

    const solution = solver.solvePow(base, targetHex);
    assert.strictEqual(solution, expectedSuffix, 'solvePow must find the exact 2-character suffix matching target hash');
});

test('fastly-solver: parseInitFromScript extracts parameters from mock script', () => {
    const mockScript = `
        window.addEventListener("load", function() {
            init([{"ty":"pow","base":"b123","target":"abc"},{"ty":"clientmetrics"}], "token_xyz_456", "pref");
        });
    `;

    const parsed = solver.parseInitFromScript(mockScript);
    assert.ok(parsed, 'Parsed init config should not be null');
    assert.strictEqual(parsed.token, 'token_xyz_456');
    assert.strictEqual(parsed.challenges.length, 2);
    assert.strictEqual(parsed.challenges[0].ty, 'pow');
    assert.strictEqual(parsed.challenges[1].ty, 'clientmetrics');
});

test('fastly-solver: clientMetricsAnswer generates valid payload', () => {
    const metrics = solver.clientMetricsAnswer();

    assert.ok(metrics, 'Metrics object must exist');
    assert.strictEqual(metrics.ty, 'clientmetrics');
    assert.strictEqual(metrics.webdriver, false);
    assert.strictEqual(metrics.bot_detection_result.bot_detected, false);
});

test('fastly-solver: SimpleCookieJar handles domain and path isolation', () => {
    const jar = new solver.SimpleCookieJar();
    jar.setCookie('fs_clearance=cleared123; Domain=firefox.com; Path=/', 'https://accounts.firefox.com');

    const header = jar.getCookieHeader('https://api.accounts.firefox.com/v1/auth');
    assert.ok(header.includes('fs_clearance=cleared123'), 'Subdomain should inherit parent domain cookie');

    const googleHeader = jar.getCookieHeader('https://www.google.com');
    assert.strictEqual(googleHeader, '', 'Unrelated domain must not receive cookie');
});
