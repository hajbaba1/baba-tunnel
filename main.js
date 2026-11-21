// --- main.js — Electron Entry Point for Fenix Standalone ---
//
// Launches local server, recovers previous proxy state if needed,
// opens single-window UI, and handles clean teardown.

'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { startServer } = require('./server');
const systemProxy = require('./system-proxy');
const xrayRunner = require('./xray-runner');

let mainWindow = null;
let serverInstance = null;

async function createWindow(serverPort) {
    mainWindow = new BrowserWindow({
        width: 1020,
        height: 700,
        minWidth: 780,
        minHeight: 560,
        backgroundColor: '#141518',
        autoHideMenuBar: true,
        title: 'Fenix VPN',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });

    // Security Hardening: Block external navigation and popups
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith(`http://127.0.0.1:${serverPort}`) && !url.startsWith(`http://localhost:${serverPort}`)) {
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

app.whenReady().then(init).catch((err) => {
    console.error('[Fenix Standalone] Initialization error:', err);
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
