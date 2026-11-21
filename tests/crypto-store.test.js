// --- tests/crypto-store.test.js ---
// Tests DPAPI / safeStorage credential protection and error handling.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const cryptoStore = require('../crypto-store');

test('crypto-store: roundtrip encryption and decryption with DPAPI / safeStorage', async () => {
    const secret = 'sample-secret-jwt-token-1234567890';
    const protectedVal = await cryptoStore.protectAsync(secret);

    assert.ok(protectedVal, 'Protected value should not be empty');
    assert.notStrictEqual(protectedVal, secret, 'Protected value must not match plaintext');
    assert.ok(
        protectedVal.startsWith('dpapi:') || protectedVal.startsWith('safestorage:'),
        'Must use dpapi: or safestorage: prefix'
    );
    assert.strictEqual(cryptoStore.isProtected(protectedVal), true);

    const decrypted = await cryptoStore.unprotectAsync(protectedVal);
    assert.strictEqual(decrypted, secret, 'Decrypted value must match original plaintext');
});

test('crypto-store: empty string handling', async () => {
    assert.strictEqual(await cryptoStore.protectAsync(''), '');
    assert.strictEqual(await cryptoStore.protectAsync(null), '');
    assert.strictEqual(await cryptoStore.protectAsync(undefined), '');
    assert.strictEqual(await cryptoStore.unprotectAsync(''), '');
});

test('crypto-store: security refusal of plaintext or unknown format', async () => {
    // Must reject legacy or plaintext formats
    await assert.rejects(
        async () => {
            await cryptoStore.unprotectAsync('plain:dGVzdA==');
        },
        /Refusing legacy or insecure plaintext/
    );

    await assert.rejects(
        async () => {
            await cryptoStore.unprotectAsync('raw-unprotected-string');
        },
        /Unrecognized or insecure credential format/
    );
});
