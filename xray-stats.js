// --- xray-stats.js — High-Efficiency In-Process gRPC Stats Client for Xray ---
//
// Eliminates the massive CPU drain of spawning `xray.exe api statsquery` as a child
// process every second. Communicates directly with Xray's StatsService over native HTTP/2
// using Node.js built-in `http2` module and a single persistent connection.
//
// ZERO process spawns, ZERO antivirus overhead, ZERO Go runtime startup cost.

'use strict';

const http2 = require('http2');

const sessions = new Map(); // port -> ClientHttp2Session

function session(port) {
    const old = sessions.get(port);
    if (old && !old.closed && !old.destroyed) return old;
    const s = http2.connect(`http://127.0.0.1:${port}`);
    s.on('error', () => { /* broken session is replaced on the next query */ });
    s.on('close', () => { if (sessions.get(port) === s) sessions.delete(port); });
    try { s.unref(); } catch (_) {}
    sessions.set(port, s);
    return s;
}

// ── Protobuf minimal varint codec ─────────────────────────────────────────────

function varint(n) {
    const out = [];
    let v = BigInt(n);
    do {
        let b = Number(v & 0x7fn);
        v >>= 7n;
        if (v > 0n) b |= 0x80;
        out.push(b);
    } while (v > 0n);
    return Buffer.from(out);
}

function encodeRequest(pattern, reset) {
    const parts = [];
    const p = Buffer.from(String(pattern || ''), 'utf8');
    if (p.length) parts.push(Buffer.from([0x0a]), varint(p.length), p);
    if (reset) parts.push(Buffer.from([0x10, 0x01]));
    return Buffer.concat(parts);
}

function readVarint(buf, pos) {
    let result = 0n;
    let shift = 0n;
    for (;;) {
        if (pos >= buf.length) throw new Error('truncated varint');
        const b = buf[pos++];
        result |= BigInt(b & 0x7f) << shift;
        if (!(b & 0x80)) break;
        shift += 7n;
    }
    return [result, pos];
}

function walk(buf, onField) {
    let pos = 0;
    while (pos < buf.length) {
        let key;
        [key, pos] = readVarint(buf, pos);
        const field = Number(key >> 3n);
        const wire = Number(key & 7n);
        if (wire === 0) {
            let v; [v, pos] = readVarint(buf, pos);
            onField(field, wire, v);
        } else if (wire === 2) {
            let len; [len, pos] = readVarint(buf, pos);
            const end = pos + Number(len);
            onField(field, wire, buf.subarray(pos, end));
            pos = end;
        } else if (wire === 1) { pos += 8; }
        else if (wire === 5) { pos += 4; }
        else throw new Error('unsupported wire type ' + wire);
    }
}

function decodeResponse(buf) {
    const stat = [];
    walk(buf, (f, w, v) => {
        if (f !== 1 || w !== 2) return;
        const s = { name: '', value: '0' };
        walk(v, (sf, sw, sv) => {
            if (sf === 1 && sw === 2) s.name = sv.toString('utf8');
            else if (sf === 2 && sw === 0) s.value = BigInt.asIntN(64, sv).toString();
        });
        stat.push(s);
    });
    return { stat };
}

function frame(msg) {
    const head = Buffer.alloc(5);
    head.writeUInt8(0, 0);
    head.writeUInt32BE(msg.length, 1);
    return Buffer.concat([head, msg]);
}

/**
 * QueryStats on 127.0.0.1:<port> via in-process HTTP/2 gRPC.
 * Resolves `{ stat: [...] }`, or null if unreachable.
 */
function queryStats(port = 10085, { pattern = '', reset = false, timeoutMs = 1500 } = {}) {
    return new Promise((resolve) => {
        let done = false;
        const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
        const timer = setTimeout(() => { try { req && req.close(); } catch (_) {} finish(null); }, timeoutMs);
        let req = null;
        try {
            req = session(port).request({
                ':method': 'POST',
                ':path': '/xray.app.stats.command.StatsService/QueryStats',
                'content-type': 'application/grpc',
                te: 'trailers',
            });
        } catch (_) { return finish(null); }
        const chunks = [];
        let grpcStatus = null;
        req.on('response', (h) => { if (h['grpc-status'] !== undefined) grpcStatus = String(h['grpc-status']); });
        req.on('trailers', (h) => { if (h['grpc-status'] !== undefined) grpcStatus = String(h['grpc-status']); });
        req.on('data', (c) => chunks.push(c));
        req.on('error', () => finish(null));
        req.on('end', () => {
            if (grpcStatus !== null && grpcStatus !== '0') return finish(null);
            const body = Buffer.concat(chunks);
            if (body.length < 5) return finish({ stat: [] });
            try {
                const len = body.readUInt32BE(1);
                finish(decodeResponse(body.subarray(5, 5 + len)));
            } catch (_) { finish(null); }
        });
        req.end(frame(encodeRequest(pattern, reset)));
    });
}

function forget(port = 10085) {
    const s = sessions.get(port);
    sessions.delete(port);
    if (s) { try { s.close(); } catch (_) {} }
}

module.exports = {
    queryStats,
    forget,
    _internal: { encodeRequest, decodeResponse, frame },
};
