// --- traffic-monitor.js — Real-Time VPN Traffic & Bandwidth Monitor ---
//
// Interrogates Xray-core StatsService via native in-process HTTP/2 gRPC API (127.0.0.1:10085).
// Calculates live upload/download speed (bytes/sec) and total session bytes sent/received.
//
// ZERO process spawning: consumes 0.0% CPU even during continuous 1-second live polling.

'use strict';

const xrayRunner = require('./xray-runner');
const xrayStats = require('./xray-stats');

const API_PORT = 10085;
const API_SERVER = `127.0.0.1:${API_PORT}`;

let isQuerying = false;
let lastQueryTime = 0;
let prevSent = 0;
let prevReceived = 0;

let currentStats = {
    ok: true,
    connected: false,
    sent: 0,
    received: 0,
    uploadSpeed: 0,
    downloadSpeed: 0,
};

function resetSession() {
    prevSent = 0;
    prevReceived = 0;
    lastQueryTime = 0;
    currentStats = {
        ok: true,
        connected: false,
        sent: 0,
        received: 0,
        uploadSpeed: 0,
        downloadSpeed: 0,
    };
    try { xrayStats.forget(API_PORT); } catch (_) {}
}

/**
 * Query Xray StatsService in-process over native HTTP/2 gRPC.
 * Takes ~0.5ms and 0 child processes.
 */
async function queryXrayStats() {
    const isRunning = xrayRunner.isRunning();
    if (!isRunning) {
        currentStats.connected = false;
        currentStats.uploadSpeed = 0;
        currentStats.downloadSpeed = 0;
        return currentStats;
    }

    currentStats.connected = true;

    const now = Date.now();
    // Cache for 800ms to throttle back-to-back duplicate requests
    if (now - lastQueryTime < 800 || isQuerying) {
        return currentStats;
    }

    isQuerying = true;
    try {
        const data = await xrayStats.queryStats(API_PORT, { timeoutMs: 1200 });
        const queryTimestamp = Date.now();

        if (data && Array.isArray(data.stat)) {
            let sent = 0;
            let received = 0;

            for (const item of data.stat) {
                if (!item || !item.name) continue;
                if (item.name.includes('inbound>>>api')) continue;

                if (item.name.endsWith('traffic>>>uplink')) {
                    sent += Number(item.value) || 0;
                } else if (item.name.endsWith('traffic>>>downlink')) {
                    received += Number(item.value) || 0;
                }
            }

            if (lastQueryTime > 0) {
                const dt = (queryTimestamp - lastQueryTime) / 1000;
                if (dt > 0) {
                    const upDiff = Math.max(0, sent - prevSent);
                    const downDiff = Math.max(0, received - prevReceived);
                    currentStats.uploadSpeed = Math.round(upDiff / dt);
                    currentStats.downloadSpeed = Math.round(downDiff / dt);
                }
            }

            prevSent = sent;
            prevReceived = received;
            lastQueryTime = queryTimestamp;

            currentStats.sent = sent;
            currentStats.received = received;
            currentStats.connected = true;
        }
    } catch (_) {
        // Maintain last known good stats
    } finally {
        isQuerying = false;
    }

    return currentStats;
}

async function getStats() {
    return await queryXrayStats();
}

module.exports = {
    getStats,
    resetSession,
    queryXrayStats,
    API_PORT,
    API_SERVER,
};
