// --- server.js — Minimal Local Server for Fenix Standalone ---
//
// Serves static assets from public/ and mounts fenix-routes.js.
// Strictly isolated to Fenix: no other engines, no system firewall/DNS mutations.
//
// WARNING: To preview the UI, use Electron or run preview:
// npm start or node server.js --port=3000

'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { EventEmitter } = require('events');
const { createFenixRouter } = require('./fenix-routes');

function createApp() {
    const app = express();
    const eventEmitter = new EventEmitter();

    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(createFenixRouter(eventEmitter));

    // Fallback route for SPA
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/')) {
            return next();
        }
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    return { app, eventEmitter };
}

function startServer(port = 3000) {
    const { app, eventEmitter } = createApp();
    const server = http.createServer(app);

    return new Promise((resolve, reject) => {
        server.listen(port, '127.0.0.1', () => {
            const actualPort = server.address().port;
            resolve({ server, port: actualPort, eventEmitter });
        });
        server.on('error', reject);
    });
}

if (require.main === module) {
    const portArg = process.argv.find((a) => a.startsWith('--port='));
    const initialPort = portArg ? parseInt(portArg.split('=')[1], 10) : 3000;

    startServer(initialPort).then(({ port }) => {
        console.log(`[Fenix Standalone] Local server running at http://127.0.0.1:${port}`);
    }).catch((err) => {
        console.error('[Fenix Standalone] Failed to start server:', err.message);
        process.exit(1);
    });
}

module.exports = {
    createApp,
    startServer,
};
