// --- fenix-routes.js — Dedicated Express routes for Fenix Standalone ---
//
// Extracts strictly the /api/fenix/* routes from MLMVPN's server.js.
// Connects fenix-session directly to xray-runner, health-check, and system-proxy.
// Includes strict input validation on all route parameters.

'use strict';

const express = require('express');
const fx = require('./fenix');
const fenixSessionModule = require('./fenix-session');
const xrayRunner = require('./xray-runner');
const healthCheck = require('./health-check');
const systemProxy = require('./system-proxy');

const ALLOWED_CHALLENGE_HOSTS = new Set([
    'api.accounts.firefox.com',
    'accounts.firefox.com',
    'oauth.accounts.firefox.com',
    'vpn.mozilla.org',
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_REGEX = /^\d{6,8}$/;
const HEX_ID_REGEX = /^[0-9a-fA-F]{10,64}$/;
const COUNTRY_REGEX = /^[A-Z]{2}$/;

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
            const status = e.code === 'CHALLENGE' ? 409
                : e.code === 'INVALID_INPUT' ? 400
                : 400;
            res.status(status).json({
                error: e.message || 'Error occurred',
                code: e.code || null,
                host: e.host || null,
            });
        }
    };

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
        const email = String(b.email || '').trim();
        const password = String(b.password || '');
        if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
            const err = new Error('ایمیل وارد شده نامعتبر است.');
            err.code = 'INVALID_INPUT';
            throw err;
        }
        if (!password || password.length > 256) {
            const err = new Error('رمز عبور الزامی است.');
            err.code = 'INVALID_INPUT';
            throw err;
        }
        return await fx.signIn(email, password);
    }));

    // POST /api/fenix/code — 2FA or email confirmation code verification
    router.post('/api/fenix/code', fenixHandle(async (b) => {
        const code = String(b.code || '').trim();
        if (!CODE_REGEX.test(code)) {
            const err = new Error('کد تأیید باید ۶ یا ۸ رقم عددی باشد.');
            err.code = 'INVALID_INPUT';
            throw err;
        }
        await fx.verifyCode(code);
        return {};
    }));

    // POST /api/fenix/cancel — Cancel pending sign in
    router.post('/api/fenix/cancel', fenixHandle(async () => {
        return { cancelled: fx.cancelSignIn() };
    }));

    // POST /api/fenix/challenge — Handle Fastly browser challenge
    router.post('/api/fenix/challenge', fenixHandle(async (b) => {
        const host = String(b.host || '').trim().toLowerCase();
        const purpose = String(b.purpose || '').trim().slice(0, 64);
        if (!ALLOWED_CHALLENGE_HOSTS.has(host)) {
            const err = new Error(`هاست چالش نامعتبر است: ${host}`);
            err.code = 'INVALID_INPUT';
            throw err;
        }
        return await fx.challenge({ host, purpose });
    }));

    // POST /api/fenix/signout — Remove account
    router.post('/api/fenix/signout', fenixHandle(async (b) => {
        const id = String(b.id || '').trim();
        if (!HEX_ID_REGEX.test(id)) {
            const err = new Error('شناسه حساب نامعتبر است.');
            err.code = 'INVALID_INPUT';
            throw err;
        }
        return { removed: fx.signOut(id) };
    }));

    // POST /api/fenix/quota — Refresh 50GB allowance
    router.post('/api/fenix/quota', fenixHandle(async (b) => {
        const force = Boolean(b && b.force);
        return { accounts: await fx.refreshQuotas({ force }) };
    }));

    // POST /api/fenix/servers — Fetch Mozilla's server list & run pings
    router.post('/api/fenix/servers', fenixHandle(async (b) => {
        const force = Boolean(b && b.force);
        const list = await fx.servers(force);
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
        let country = String(b.country || '').trim().toUpperCase();
        if (country !== 'FASTEST' && !COUNTRY_REGEX.test(country)) {
            country = 'fastest';
        } else if (country === 'FASTEST') {
            country = 'fastest';
        }

        let accountId = b.accountId ? String(b.accountId).trim() : null;
        if (accountId && !HEX_ID_REGEX.test(accountId)) {
            accountId = null;
        }

        const session = await getSession().connect({
            country,
            accountId,
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
        const enable = Boolean(b && b.enable);
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
        const err = new Error('TUN mode is disabled in this standalone stage');
        err.code = 'TUN_DISABLED';
        throw err;
    }));

    return router;
}

module.exports = {
    createFenixRouter,
    ALLOWED_CHALLENGE_HOSTS,
};
