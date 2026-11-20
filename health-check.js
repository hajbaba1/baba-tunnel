// --- health-check.js — Clean SOCKS proxy health checker for Fenix Standalone ---
//
// Replaces exit-proxies.verify from MLMVPN with a minimal, focused verification probe.
// Performs an HTTP trace through 127.0.0.1:10808 (Xray's SOCKS port) to confirm outbound connectivity.

'use strict';

const http = require('http');

let SocksProxyAgent = null;
try {
    SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent;
} catch (e) {
    SocksProxyAgent = null;
}

/**
 * Verify connectivity through the local SOCKS proxy
 * @param {number} socksPort - Local SOCKS5 port (default 10808)
 * @param {object} options - Timeout and target options
 * @returns {Promise<{ ok: boolean, ip?: string, loc?: string, rttMs?: number, error?: string }>}
 */
async function verify(socksPort = 10808, { timeoutMs = 8000 } = {}) {
    const t0 = Date.now();

    // 1. If socks-proxy-agent is available, use standard HTTP request
    if (SocksProxyAgent) {
        return new Promise((resolve) => {
            const agent = new SocksProxyAgent(`socks5h://127.0.0.1:${socksPort}`);
            const req = http.get('http://www.cloudflare.com/cdn-cgi/trace', {
                agent,
                timeout: timeoutMs,
                headers: { 'User-Agent': 'curl/8.4.0' },
            }, (res) => {
                let data = '';
                res.on('data', (c) => { data += c.toString('utf8'); });
                res.on('end', () => {
                    const rttMs = Date.now() - t0;
                    if (res.statusCode >= 200 && res.statusCode < 400 && data.includes('ip=')) {
                        const ipMatch = data.match(/ip=([^\n]+)/);
                        const locMatch = data.match(/loc=([^\n]+)/);
                        return resolve({
                            ok: true,
                            ip: ipMatch ? ipMatch[1].trim() : null,
                            loc: locMatch ? locMatch[1].trim() : null,
                            rttMs,
                        });
                    }
                    resolve({ ok: false, error: `Unexpected HTTP status ${res.statusCode}` });
                });
            });

            req.on('timeout', () => { req.destroy(new Error('Verification timeout')); });
            req.on('error', (err) => resolve({ ok: false, error: err.message }));
        });
    }

    // 2. Minimal raw SOCKS5 + HTTP/1.1 implementation (zero npm dependency fallback)
    return new Promise((resolve) => {
        const net = require('net');
        const s = new net.Socket();
        s.setTimeout(timeoutMs);

        s.on('timeout', () => {
            s.destroy();
            resolve({ ok: false, error: 'Socket timeout' });
        });

        s.on('error', (err) => {
            s.destroy();
            resolve({ ok: false, error: err.message });
        });

        s.connect(socksPort, '127.0.0.1', () => {
            // SOCKS5 greeting: VER=5, NMETHODS=1, METHOD=0 (No Auth)
            s.write(Buffer.from([0x05, 0x01, 0x00]));
        });

        let stage = 0;
        let responseBuffer = Buffer.alloc(0);

        s.on('data', (chunk) => {
            if (stage === 0) {
                // Greeting response: 05 00
                if (chunk.length >= 2 && chunk[0] === 0x05 && chunk[1] === 0x00) {
                    stage = 1;
                    // SOCKS5 CONNECT to www.cloudflare.com:80
                    // 05 01 00 03 <len> <domain> <port_hi> <port_lo>
                    const targetDomain = 'www.cloudflare.com';
                    const domainBuf = Buffer.from(targetDomain, 'utf8');
                    const reqBuf = Buffer.concat([
                        Buffer.from([0x05, 0x01, 0x00, 0x03, domainBuf.length]),
                        domainBuf,
                        Buffer.from([0x00, 0x50]), // port 80
                    ]);
                    s.write(reqBuf);
                } else {
                    s.destroy();
                    resolve({ ok: false, error: 'SOCKS5 greeting failed' });
                }
            } else if (stage === 1) {
                // Connect response: 05 00 ...
                if (chunk.length >= 2 && chunk[1] === 0x00) {
                    stage = 2;
                    // Send plain HTTP GET
                    const httpReq = 'GET /cdn-cgi/trace HTTP/1.1\r\nHost: www.cloudflare.com\r\nUser-Agent: curl/8.4.0\r\nConnection: close\r\n\r\n';
                    s.write(httpReq);
                } else {
                    s.destroy();
                    resolve({ ok: false, error: `SOCKS5 connect refused: status ${chunk[1]}` });
                }
            } else if (stage === 2) {
                responseBuffer = Buffer.concat([responseBuffer, chunk]);
            }
        });

        s.on('close', () => {
            if (stage === 2) {
                const text = responseBuffer.toString('utf8');
                const rttMs = Date.now() - t0;
                if (text.includes('ip=')) {
                    const ipMatch = text.match(/ip=([^\n]+)/);
                    const locMatch = text.match(/loc=([^\n]+)/);
                    return resolve({
                        ok: true,
                        ip: ipMatch ? ipMatch[1].trim() : null,
                        loc: locMatch ? locMatch[1].trim() : null,
                        rttMs,
                    });
                }
            }
            resolve({ ok: false, error: 'No response from verification endpoint' });
        });
    });
}

module.exports = {
    verify,
};
