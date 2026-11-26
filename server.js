// --- server.js — Minimal Hardened Local Server for BABA Tunnel (BBT) ---
//
// Serves static assets from public/ and mounts bbt-routes.js.
// Strictly isolated to 127.0.0.1 with Host, Origin, and per-session token validation.

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { EventEmitter } = require('events');
const fx = require('./bbt-core');
const { createBbtRouter, createFenixRouter } = require('./bbt-routes');

function createApp(sessionToken = crypto.randomBytes(24).toString('hex')) {
    const app = express();
    const eventEmitter = new EventEmitter();

    // 1. Strict request body size limit
    app.use(express.json({ limit: '64kb' }));

    // 2. Security middleware: Host, Origin, and Session Token validation
    app.use('/api', (req, res, next) => {
        const host = req.headers.host || '';
        // Host must be 127.0.0.1 or localhost (with any port)
        if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(host)) {
            return res.status(403).json({
                ok: false,
                error: 'Forbidden: Invalid Host header (DNS rebinding protection)',
            });
        }

        // Origin or Referer (if present) must be from 127.0.0.1 or localhost
        const origin = req.headers.origin || '';
        if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) {
            return res.status(403).json({
                ok: false,
                error: 'Forbidden: Cross-origin request rejected',
            });
        }

        const referer = req.headers.referer || '';
        if (referer && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/.*)?$/i.test(referer)) {
            return res.status(403).json({
                ok: false,
                error: 'Forbidden: Untrusted referer',
            });
        }

        // Allow read-only traffic endpoint for live stats widget
        if (req.path === '/traffic' || req.path === '/bbt/traffic' || req.path === '/fenix/traffic') {
            return next();
        }

        // Token check: require x-bbt-token or x-fenix-token header or ?token= query parameter
        const clientToken = req.headers['x-bbt-token'] || req.headers['x-fenix-token'] || req.query.token;
        if (!clientToken || clientToken !== sessionToken) {
            return res.status(403).json({
                ok: false,
                error: 'Forbidden: Invalid or missing session token',
            });
        }

        next();
    });

    // 3. Mount BABA Tunnel (BBT) API routes
    app.use(createBbtRouter ? createBbtRouter(eventEmitter) : createFenixRouter(eventEmitter));

    // 4. Serve index.html with injected session token and saved persistent preferences
    const indexPath = path.join(__dirname, 'public', 'index.html');
    app.get(['/', '/index.html'], (req, res) => {
        try {
            let html = fs.readFileSync(indexPath, 'utf8');
            const initialPrefs = fx.getPrefs();
            const tokenScript = `<script>window.__BBT_TOKEN__ = ${JSON.stringify(sessionToken)}; window.__FENIX_TOKEN__ = window.__BBT_TOKEN__; window.__BBT_INITIAL_PREFS__ = ${JSON.stringify(initialPrefs)};</script>`;
            html = html.replace('</head>', `${tokenScript}\n</head>`);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self' http://127.0.0.1:* http://localhost:*;");
            res.send(html);
        } catch (e) {
            res.status(500).send('Failed to load application template');
        }
    });

    // 5. Static assets
    app.use(express.static(path.join(__dirname, 'public')));

    // 6. SPA fallback
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/')) {
            return next();
        }
        res.redirect('/');
    });

    return { app, eventEmitter, sessionToken };
}

function startServer(port = 3000, token = null) {
    const sessionToken = token || crypto.randomBytes(24).toString('hex');
    const { app, eventEmitter } = createApp(sessionToken);
    const server = http.createServer(app);

    return new Promise((resolve, reject) => {
        // Enforce binding strictly to 127.0.0.1 (never 0.0.0.0)
        server.listen(port, '127.0.0.1', () => {
            const actualPort = server.address().port;
            resolve({ server, port: actualPort, eventEmitter, sessionToken });
        });
        server.on('error', reject);
    });
}

if (require.main === module) {
    const portArg = process.argv.find((a) => a.startsWith('--port='));
    const initialPort = portArg ? parseInt(portArg.split('=')[1], 10) : 3000;

    startServer(initialPort).then(({ port, sessionToken }) => {
        console.log(`[BABA Tunnel] Hardened local server running at http://127.0.0.1:${port}`);
        console.log(`[BABA Tunnel] Session token generated`);
    }).catch((err) => {
        console.error('[BABA Tunnel] Failed to start server:', err.message);
        process.exit(1);
    });
}

module.exports = {
    createApp,
    startServer,
};
