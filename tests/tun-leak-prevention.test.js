// --- tests/tun-leak-prevention.test.js ---
// Tests the TUN Anti-Leak architecture: sing-box config, strict_route, IPv6 containment,
// WebRTC UDP rejection, and Windows route/interface inspection helpers.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const tunManager = require('../tun-manager');

test('tun-leak-prevention: sing-box anti-leak config structure', () => {
    const cfg = tunManager.buildTunConfig({ socksPort: 10808, interfaceName: 'BBTTUN' });

    // 1. Inbound validation
    assert.ok(Array.isArray(cfg.inbounds), 'inbounds must be an array');
    const tunIn = cfg.inbounds.find((i) => i.type === 'tun');
    assert.ok(tunIn, 'Must contain a TUN inbound');

    assert.strictEqual(tunIn.interface_name, 'BBTTUN');
    assert.strictEqual(tunIn.auto_route, true, 'auto_route must be true to capture default route');
    assert.strictEqual(tunIn.strict_route, true, 'strict_route must be true to block WebRTC/app escape via WFP');

    // Must claim IPv6 address to prevent IPv6 bypass on dual-stack connections
    assert.ok(Array.isArray(tunIn.address), 'address must be an array');
    assert.ok(tunIn.address.some((a) => a.includes(':')), 'Must claim an IPv6 ULA address');

    // 2. Outbounds validation
    const socksOut = cfg.outbounds.find((o) => o.type === 'socks');
    assert.ok(socksOut, 'Must contain SOCKS outbound');
    assert.strictEqual(socksOut.server_port, 10808);

    // 3. Route rules anti-leak shields
    assert.ok(Array.isArray(cfg.route.rules), 'route rules must be an array');

    // WebRTC & IPv6 Leak Shields:
    const ipv6Rule = cfg.route.rules.find((r) => r.ip_version === 6);
    assert.ok(ipv6Rule, 'Must contain rule for ip_version: 6');
    assert.strictEqual(ipv6Rule.action, 'reject', 'IPv6 must be strictly rejected inside tunnel to stop IPv6 leaks');

    const udpRule = cfg.route.rules.find((r) => r.network === 'udp');
    assert.ok(udpRule, 'Must contain rule for network: udp');
    assert.strictEqual(udpRule.action, 'reject', 'UDP must be rejected when SOCKS backend cannot carry UDP (stops WebRTC UDP leak)');

    // Process loopback prevention
    const procRule = cfg.route.rules.find((r) => Array.isArray(r.process_name) && r.process_name.includes('xray.exe'));
    assert.ok(procRule, 'xray.exe must be excluded from tunnel');
    assert.strictEqual(procRule.outbound, 'direct');

    // 4. DNS anti-leak: must enforce ipv4_only
    assert.strictEqual(cfg.dns.strategy, 'ipv4_only', 'DNS strategy must be ipv4_only to stop dual-stack WebRTC leakage');
    assert.strictEqual(cfg.dns.final, 'remote');
});

test('tun-leak-prevention: sing-box and wintun binaries exist in core', () => {
    const { exe, wintun } = tunManager.getBinPaths();
    assert.ok(fs.existsSync(exe), 'sing-box.exe must exist in core');
    assert.ok(fs.existsSync(wintun), 'wintun.dll must exist in core');
    assert.doesNotThrow(() => tunManager.checkPrerequisites());
});

test('tun-leak-prevention: state file and crash recovery tracking', () => {
    const stateFile = tunManager.getIpv6StateFile();
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);

    // Simulate leftover state from a crashed session
    fs.writeFileSync(stateFile, JSON.stringify({ blockedAt: new Date().toISOString() }), 'utf8');
    assert.ok(fs.existsSync(stateFile));

    const recovered = tunManager.recoverFromCrash();
    assert.strictEqual(recovered, true, 'recoverFromCrash must report true when cleaning up stale state');
    assert.strictEqual(fs.existsSync(stateFile), false, 'State file must be cleaned up');
});
