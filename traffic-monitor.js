// --- traffic-monitor.js — Real-Time VPN Traffic & Bandwidth Monitor ---
//
// Interrogates Xray-core StatsService via local API loopback (127.0.0.1:10085).
// Calculates live upload/download speed (bytes/sec) and total session bytes sent/received.

'use strict';

const { execFile } = require('child_process');
const xrayRunner = require('./xray-runner');

const API_SERVER = '127.0.0.1:10085';

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
}

/**
 * Query Xray API statsquery synchronously or from recent cache
 */
function queryXrayStats() {
    return new Promise((resolve) => {
        const isRunning = xrayRunner.isRunning();
        if (!isRunning) {
            currentStats.connected = false;
            currentStats.uploadSpeed = 0;
            currentStats.downloadSpeed = 0;
            return resolve(currentStats);
        }

        currentStats.connected = true;

        const now = Date.now();
        // Return cache if query was made in the last 1500ms to avoid process thrashing
        if (now - lastQueryTime < 1500 || isQuerying) {
            return resolve(currentStats);
        }

        let bin;
        try {
            bin = xrayRunner.getBinaryPath();
        } catch (e) {
            return resolve(currentStats);
        }

        isQuerying = true;
        execFile(bin, ['api', 'statsquery', `--server=${API_SERVER}`], {
            timeout: 1500,
            windowsHide: true,
            env: Object.assign({}, process.env, { GOMAXPROCS: '1' }),
        }, (err, stdout) => {
            isQuerying = false;
            const queryTimestamp = Date.now();

            if (err || !stdout) {
                return resolve(currentStats);
            }

            try {
                const data = JSON.parse(stdout);
                let sent = 0;
                let received = 0;

                if (Array.isArray(data.stat)) {
                    for (const item of data.stat) {
                        if (!item || !item.name) continue;
                        if (item.name.includes('inbound>>>api')) continue;

                        if (item.name.endsWith('traffic>>>uplink')) {
                            sent += Number(item.value) || 0;
                        } else if (item.name.endsWith('traffic>>>downlink')) {
                            received += Number(item.value) || 0;
                        }
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
            } catch (parseErr) {
                // Ignore parse errors, maintain last known good stats
            }

            resolve(currentStats);
        });
    });
}

async function getStats() {
    return await queryXrayStats();
}

module.exports = {
    getStats,
    resetSession,
    queryXrayStats,
    API_SERVER,
};
