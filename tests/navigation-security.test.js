// --- tests/navigation-security.test.js ---
// Tests strict URL navigation hardening in main.js and bbt-core.js (Step 5.1).

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { isAllowedNavigationUrl } = require('../main');
const { isAllowedMozillaUrl, isAllowedMozillaHost } = require('../bbt-core');

test('Step 5.1: Main process local navigation hardening', async (t) => {
    const port = 3000;

    await t.test('allows valid local server URLs on designated port', () => {
        assert.strictEqual(isAllowedNavigationUrl(`http://127.0.0.1:${port}`, port), true);
        assert.strictEqual(isAllowedNavigationUrl(`http://127.0.0.1:${port}/`, port), true);
        assert.strictEqual(isAllowedNavigationUrl(`http://127.0.0.1:${port}/index.html`, port), true);
        assert.strictEqual(isAllowedNavigationUrl(`http://localhost:${port}`, port), true);
        assert.strictEqual(isAllowedNavigationUrl(`http://localhost:${port}/api/fenix/status`, port), true);
    });

    await t.test('strictly rejects deceptive domain suffixes (evil.com bypass attempts)', () => {
        // Attack: tricking startsWith(`http://127.0.0.1:${port}`)
        assert.strictEqual(isAllowedNavigationUrl(`http://127.0.0.1:${port}.evil.com`, port), false);
        assert.strictEqual(isAllowedNavigationUrl(`http://127.0.0.1:${port}evil.com`, port), false);
        assert.strictEqual(isAllowedNavigationUrl(`http://127.0.0.1:${port}0.evil.com`, port), false);
        assert.strictEqual(isAllowedNavigationUrl(`http://localhost:${port}.evil.com`, port), false);
        assert.strictEqual(isAllowedNavigationUrl(`http://localhost:${port}evil.com`, port), false);
    });

    await t.test('strictly rejects invalid protocol (e.g. https on local server or pseudo-protocols)', () => {
        assert.strictEqual(isAllowedNavigationUrl(`https://127.0.0.1:${port}`, port), false);
        assert.strictEqual(isAllowedNavigationUrl(`https://localhost:${port}`, port), false);
        assert.strictEqual(isAllowedNavigationUrl('javascript:alert(1)', port), false);
        assert.strictEqual(isAllowedNavigationUrl('data:text/html,evil', port), false);
        assert.strictEqual(isAllowedNavigationUrl('file:///C:/Windows/win.ini', port), false);
    });

    await t.test('strictly rejects wrong ports', () => {
        assert.strictEqual(isAllowedNavigationUrl('http://127.0.0.1:3001', port), false);
        assert.strictEqual(isAllowedNavigationUrl('http://127.0.0.1:80', port), false);
        assert.strictEqual(isAllowedNavigationUrl('http://localhost:8080', port), false);
    });

    await t.test('strictly rejects path or query masquerading', () => {
        assert.strictEqual(isAllowedNavigationUrl(`http://evil.com/127.0.0.1:${port}`, port), false);
        assert.strictEqual(isAllowedNavigationUrl(`http://127.0.0.1.evil.com:${port}`, port), false);
    });

    await t.test('handles malformed, empty or null inputs gracefully', () => {
        assert.strictEqual(isAllowedNavigationUrl('', port), false);
        assert.strictEqual(isAllowedNavigationUrl(null, port), false);
        assert.strictEqual(isAllowedNavigationUrl(undefined, port), false);
        assert.strictEqual(isAllowedNavigationUrl('not-a-url', port), false);
    });
});

test('Step 5.1: Mozilla challenge window navigation hardening', async (t) => {
    await t.test('allows genuine Mozilla and Firefox domains via HTTPS', () => {
        assert.strictEqual(isAllowedMozillaUrl('https://accounts.firefox.com'), true);
        assert.strictEqual(isAllowedMozillaUrl('https://accounts.firefox.com/settings'), true);
        assert.strictEqual(isAllowedMozillaUrl('https://vpn.mozilla.org'), true);
        assert.strictEqual(isAllowedMozillaUrl('https://vpn.mozilla.org/oauth/check'), true);
        assert.strictEqual(isAllowedMozillaUrl('https://mozilla.org'), true);
        assert.strictEqual(isAllowedMozillaUrl('https://mozilla.com'), true);
        assert.strictEqual(isAllowedMozillaUrl('https://api.accounts.firefox.com/v1/auth'), true);
    });

    await t.test('strictly rejects deceptive domains masquerading as Mozilla', () => {
        // Prefix deception (would match includes('firefox.com'))
        assert.strictEqual(isAllowedMozillaUrl('https://evil-firefox.com'), false);
        assert.strictEqual(isAllowedMozillaUrl('https://evilfirefox.com'), false);
        assert.strictEqual(isAllowedMozillaUrl('https://fake-mozilla.org'), false);
        assert.strictEqual(isAllowedMozillaUrl('https://evilmozilla.com'), false);

        // Subdomain hijack / suffix deception
        assert.strictEqual(isAllowedMozillaUrl('https://firefox.com.evil.com'), false);
        assert.strictEqual(isAllowedMozillaUrl('https://accounts.firefox.com.attacker.net'), false);
        assert.strictEqual(isAllowedMozillaUrl('https://mozilla.org.evil.com'), false);
    });

    await t.test('strictly rejects insecure HTTP or non-standard ports', () => {
        assert.strictEqual(isAllowedMozillaUrl('http://accounts.firefox.com'), false);
        assert.strictEqual(isAllowedMozillaUrl('http://mozilla.org'), false);
        assert.strictEqual(isAllowedMozillaUrl('https://accounts.firefox.com:8443'), false);
    });

    await t.test('strictly rejects pseudo-protocols and invalid inputs', () => {
        assert.strictEqual(isAllowedMozillaUrl('javascript:alert(1)'), false);
        assert.strictEqual(isAllowedMozillaUrl('data:text/html,evil'), false);
        assert.strictEqual(isAllowedMozillaUrl(''), false);
        assert.strictEqual(isAllowedMozillaUrl(null), false);
        assert.strictEqual(isAllowedMozillaUrl(undefined), false);
    });

    await t.test('host validator helper isAllowedMozillaHost works accurately', () => {
        assert.strictEqual(isAllowedMozillaHost('accounts.firefox.com'), true);
        assert.strictEqual(isAllowedMozillaHost('firefox.com'), true);
        assert.strictEqual(isAllowedMozillaHost('vpn.mozilla.org'), true);
        assert.strictEqual(isAllowedMozillaHost('mozilla.com'), true);
        assert.strictEqual(isAllowedMozillaHost('evil-firefox.com'), false);
        assert.strictEqual(isAllowedMozillaHost('firefox.com.evil.com'), false);
        assert.strictEqual(isAllowedMozillaHost('evilmozilla.org'), false);
        assert.strictEqual(isAllowedMozillaHost(''), false);
        assert.strictEqual(isAllowedMozillaHost(null), false);
    });
});
