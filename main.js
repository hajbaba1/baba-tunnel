// --- main.js — Electron Entry Point for BABA Tunnel (BBT) ---
//
// Launches local server, recovers previous proxy state if needed,
// opens single-window UI, and handles clean teardown.

'use strict';

const electron = require('electron');
const app = typeof electron === 'object' && electron ? electron.app : null;
const BrowserWindow = typeof electron === 'object' && electron ? electron.BrowserWindow : null;
const shell = typeof electron === 'object' && electron ? electron.shell : null;
const path = require('path');
const { startServer } = require('./server');
const systemProxy = require('./system-proxy');
const xrayRunner = require('./xray-runner');

let mainWindow = null;
let serverInstance = null;

/**
 * Strict navigation check using URL parser.
 * Compares protocol, hostname, and port independently against allowed local server values.
 */
function isAllowedNavigationUrl(rawUrl, serverPort) {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'http:') return false;
        if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') return false;
        const port = parsed.port ? parseInt(parsed.port, 10) : 80;
        if (port !== Number(serverPort)) return false;
        return true;
    } catch {
        return false;
    }
}

async function createWindow(serverPort) {
    mainWindow = new BrowserWindow({
        width: 380,
        height: 640,
        minWidth: 350,
        minHeight: 580,
        maxWidth: 440,
        maxHeight: 750,
        resizable: true,
        backgroundColor: '#121316',
        autoHideMenuBar: true,
        title: 'BABA Tunnel',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });

    // Security Hardening: Safely open external https links in user's default browser, block internal popups
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const parsed = new URL(url);
            if (parsed.protocol === 'https:' && shell) {
                shell.openExternal(url);
            }
        } catch (e) {}
        return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!isAllowedNavigationUrl(url, serverPort)) {
            event.preventDefault();
        }
    });

    await mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

async function init() {
    // Check and recover from any prior abnormal termination
    await systemProxy.recoverFromCrash();

    // Start local server on dynamic or default port
    const { server, port } = await startServer(0);
    serverInstance = server;

    await createWindow(port);
}

if (app && app.whenReady) {
    app.whenReady().then(init).catch((err) => {
        console.error('[BABA Tunnel] Initialization error:', err);
        app.quit();
    });

    app.on('window-all-closed', async () => {
        // Teardown xray and system proxy before quitting
        try {
            await systemProxy.disable();
            await xrayRunner.stop();
        } catch (e) {
            // ignore during exit
        }

        if (serverInstance) {
            serverInstance.close();
        }

        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('before-quit', async () => {
        try {
            await systemProxy.disable();
            await xrayRunner.stop();
        } catch (e) {}
    });
}

module.exports = {
    isAllowedNavigationUrl,
    createWindow,
    init,
};
