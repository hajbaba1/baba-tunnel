// --- main.js — Electron Entry Point for BABA Tunnel (BBT) ---
//
// Launches local server, recovers previous proxy state if needed,
// opens single-window UI, and handles clean teardown.

'use strict';

const electron = require('electron');
const app = typeof electron === 'object' && electron ? electron.app : null;
const BrowserWindow = typeof electron === 'object' && electron ? electron.BrowserWindow : null;
const shell = typeof electron === 'object' && electron ? electron.shell : null;
const fs = require('fs');
const path = require('path');
const { startServer } = require('./server');
const systemProxy = require('./system-proxy');
const xrayRunner = require('./xray-runner');
const tunManager = require('./tun-manager');
const fx = require('./bbt-core');
const elevationStartup = require('./elevation-startup');

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
    const iconPath = path.join(__dirname, 'build', 'icon.png');
    mainWindow = new BrowserWindow({
        width: 385,
        height: 680,
        minWidth: 350,
        minHeight: 580,
        maxWidth: 450,
        maxHeight: 800,
        useContentSize: true,
        resizable: true,
        backgroundColor: '#111215',
        autoHideMenuBar: true,
        title: 'BABA Tunnel',
        icon: (typeof fs === 'object' && fs.existsSync && fs.existsSync(iconPath)) ? iconPath : undefined,
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
    // Check and recover from any prior abnormal termination (system proxy & TUN firewall)
    await systemProxy.recoverFromCrash();
    try { tunManager.recoverFromCrash(); } catch (_) {}

    // Cache admin privilege detection and synchronize elevated Windows auto-start task when packaged
    elevationStartup.isRunningAsAdminSync();
    if (app && app.isPackaged) {
        const savedPrefs = fx.getPrefs();
        elevationStartup.syncAutoStartOnBoot({
            desiredEnabled: savedPrefs.autoStart !== false,
            isPackaged: true,
        }).catch(() => {});
    }

    // Start local server on dynamic or default port
    const { server, port } = await startServer(0);
    serverInstance = server;

    await createWindow(port);
}

let shouldBoot = true;
if (app && app.isPackaged) {
    if (elevationStartup.relaunchElevatedIfNeeded({ isPackaged: true })) {
        shouldBoot = false;
        app.exit(0);
    }
}

if (shouldBoot && app && typeof app.requestSingleInstanceLock === 'function') {
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
        shouldBoot = false;
        app.quit();
    } else {
        app.on('second-instance', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.show();
                mainWindow.focus();
            }
        });
    }
}

if (shouldBoot && app && app.whenReady) {
    app.whenReady().then(init).catch((err) => {
        console.error('[BABA Tunnel] Initialization error:', err);
        app.quit();
    });

    app.on('window-all-closed', async () => {
        // Teardown TUN, xray, and system proxy before quitting
        try {
            await tunManager.stop();
        } catch (e) {}
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
            await tunManager.stop();
        } catch (e) {}
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
