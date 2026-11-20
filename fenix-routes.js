// --- fenix-routes.js — Dedicated Express routes for Fenix Standalone ---
//
// Extracts strictly the /api/fenix/* routes from MLMVPN's server.js.
// Connects fenix-session directly to xray-runner, health-check, and system-proxy.
// Does NOT include any routes or logic for other engines, VPN always-on, or TUN.

'use strict';

const express = require('express');
const fx = require('./fenix');
const fenixSessionModule = require('./fenix-session');
const xrayRunner = require('./xray-runner');
const healthCheck = require('./health-check');
const systemProxy = require('./system-proxy');

function createFenixRouter(eventEmitter) {
    const router = express.Router();

    const broadcast = (event, data) => {
        if (eventEmitter && typeof eventEmitter.emit === 'function') {
            eventEmitter.emit(event, data);
        }
    };

    let fenixPing = { running: false };
    let fenixLive = null;
    let proxyWanted = false;

    function getSession() {
        if (fenixLive) return fenixLive;

        fenixLive = fenixSessionModule.create({
            start: async (uri, options) => {
                const res = await xrayRunner.start(uri);
                if (options && options.useSystemProxy) {
                    proxyWanted = true;
                    await systemProxy.enable();
                } else {
                    proxyWanted = false;
                }
                return res;
            },
            stop: async () => {
                if (proxyWanted) {
                    await systemProxy.disable();
                    proxyWanted = false;
                }
                return await xrayRunner.stop();
            },
            verify: async () => {
                return await healthCheck.verify(xrayRunner.SOCKS_PORT, { timeoutMs: 10000 });
            },
            liveUri: () => xrayRunner.getCurrentUri(),
            running: () => xrayRunner.isRunning(),
            proxyIntent: () => proxyWanted,
            remember: () => {}, // Standalone note: alwaysOnReplay out of scope
            emit: (st) => {
                broadcast('fenix-state', { session: st });
            },
        });

        return fenixLive;
    }

    const fenixHandle = (fn) => async (req, res) => {
        try {
            const result = await fn(req.body || {}, req);
            res.json(Object.assign({ ok: true }, result));
        } catch (e) {
            const status = e.code === 'CHALLENGE' ? 409 : 400;
            res.status(status).json({
                error: e.message || 'Error occurred',
                code: e.code || null,
                host: e.host || null,
            });
        }
    };

    const fenixCountry = (v) => (/^[A-Z]{2}$/.test(String(v || '')) ? String(v) : 'fastest');
    const fenixAccount = (v) => (/^[0-9a-f]{10}$/.test(String(v || '')) ? String(v) : null);

    // GET /api/fenix — Status and current session info
    router.get('/api/fenix', fenixHandle(async () => {
        const session = getSession().check();
        const ports = xrayRunner.getPorts();
        const currentProxy = await systemProxy.readCurrentProxy();
        const out = Object.assign({
            ping: fenixPing,
            session,
            ports,
        }, fx.status());

        out.route = {
            tun: false,
            tunWanted: false,
            sysProxy: !!currentProxy.enabled,
        };
        return out;
    }));

    // POST /api/fenix/signin — Firefox Account sign in
    router.post('/api/fenix/signin', fenixHandle(async (b) => {
        return await fx.signIn(b.email, b.password);
    }));

    // POST /api/fenix/code — 2FA or email confirmation code verification
    router.post('/api/fenix/code', fenixHandle(async (b) => {
        await fx.verifyCode(b.code);
        return {};
    }));

    // POST /api/fenix/cancel — Cancel pending sign in
    router.post('/api/fenix/cancel', fenixHandle(async () => {
        return { cancelled: fx.cancelSignIn() };
    }));

    // POST /api/fenix/challenge — Handle Fastly browser challenge
    router.post('/api/fenix/challenge', fenixHandle(async (b) => {
        return await fx.challenge({ host: String(b.host || ''), purpose: String(b.purpose || '') });
    }));

    // POST /api/fenix/signout — Remove account
    router.post('/api/fenix/signout', fenixHandle(async (b) => {
        return { removed: fx.signOut(String(b.id || '')) };
    }));

    // POST /api/fenix/quota — Refresh 50GB allowance
    router.post('/api/fenix/quota', fenixHandle(async (b) => {
        return { accounts: await fx.refreshQuotas({ force: !!b.force }) };
    }));

    // POST /api/fenix/servers — Fetch Mozilla's server list & run pings
    router.post('/api/fenix/servers', fenixHandle(async (b) => {
        const list = await fx.servers();
        if (!fenixPing.running && list.length) {
            fenixPing = { running: true };
            fx.pingAll(list).catch(() => {}).finally(() => {
                fenixPing = { running: false };
                broadcast('fenix-state', fx.status());
            });
        }
        return { servers: list, ping: fenixPing };
    }));

    // POST /api/fenix/connect — Connect to a country/server
    router.post('/api/fenix/connect', fenixHandle(async (b) => {
        const session = await getSession().connect({
            country: fenixCountry(b.country),
            accountId: fenixAccount(b.accountId),
        });
        return { session };
    }));

    // POST /api/fenix/stop — Disconnect active session
    router.post('/api/fenix/stop', fenixHandle(async () => {
        const session = await getSession().disconnect();
        return { session };
    }));

    // Proxy toggle routes (compatible with public/components/fenix.js)
    router.post('/api/v2ray/sysproxy', fenixHandle(async (b) => {
        const enable = !!b.enable;
        if (enable) {
            proxyWanted = true;
            await systemProxy.enable();
        } else {
            proxyWanted = false;
            await systemProxy.disable();
        }
        return { ok: true, enabled: enable };
    }));

    router.post('/api/v2ray/tun', fenixHandle(async () => {
        return { ok: false, error: 'TUN mode is disabled in this standalone stage' };
    }));

    return router;
}

module.exports = {
    createFenixRouter,
};
