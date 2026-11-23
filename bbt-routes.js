// --- bbt-routes.js — Dedicated Express routes for BABA Tunnel (BBT) ---
//
// Standalone routing implementation for BABA Tunnel.
// Connects bbt-session directly to xray-runner, health-check, and system-proxy.
// Includes strict input validation on all route parameters.

'use strict';

const express = require('express');
const fx = require('./bbt-core');
const bbtSessionModule = require('./bbt-session');
const xrayRunner = require('./xray-runner');
const healthCheck = require('./health-check');
const systemProxy = require('./system-proxy');
const killSwitch = require('./kill-switch');
const trafficMonitor = require('./traffic-monitor');
const tunManager = require('./tun-manager');

const ALLOWED_CHALLENGE_HOSTS = new Set([
    '',
    'api.accounts.firefox.com',
    'accounts.firefox.com',
    'oauth.accounts.firefox.com',
    'vpn.mozilla.org',
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_REGEX = /^\d{6,8}$/;
const HEX_ID_REGEX = /^[0-9a-fA-F]{10,64}$/;
const COUNTRY_REGEX = /^[A-Z]{2}$/;

function createBbtRouter(eventEmitter) {
    const router = express.Router();

    const broadcast = (event, data) => {
        if (eventEmitter && typeof eventEmitter.emit === 'function') {
            eventEmitter.emit(event, data);
            // Also emit legacy event for full backward compatibility
            if (event === 'bbt-state') eventEmitter.emit('fenix-state', data);
        }
    };

    let bbtPing = { running: false };
    let bbtLive = null;
    let proxyWanted = false;

    function getSession() {
        if (bbtLive) return bbtLive;

        bbtLive = bbtSessionModule.create({
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
                if (tunManager.isRunning()) {
                    await tunManager.stop();
                }
                if (proxyWanted) {
                    await systemProxy.disable();
                    proxyWanted = false;
                }
                const res = await xrayRunner.stop();
                if (killSwitch.getStatus().enabled) {
                    await killSwitch.engage('vpn_stopped');
                }
                return res;
            },
            verify: async () => {
                return await healthCheck.verify(xrayRunner.SOCKS_PORT, { timeoutMs: 10000 });
            },
            liveUri: () => xrayRunner.getCurrentUri(),
            running: () => xrayRunner.isRunning(),
            proxyIntent: () => proxyWanted,
            remember: () => {}, // Standalone note: alwaysOnReplay out of scope
            emit: (st) => {
                const phase = st ? st.phase : 'off';
                killSwitch.onSessionState(phase).then(() => {
                    broadcast('bbt-state', {
                        session: st,
                        killSwitch: killSwitch.getStatus(),
                    });
                }).catch(() => {});
            },
        });

        return bbtLive;
    }

    const bbtHandle = (fn) => async (req, res) => {
        try {
            const result = await fn(req.body || {}, req);
            res.json(Object.assign({ ok: true }, result));
        } catch (e) {
            const status = e.code === 'CHALLENGE' ? 409
                : e.code === 'INVALID_INPUT' ? 400
                : 400;
            res.status(status).json({
                error: fx.sanitizeLog(e.message || 'Error occurred'),
                code: e.code || null,
                host: e.host ? fx.sanitizeLog(e.host) : null,
            });
        }
    };

    // GET /api/bbt (and /api/fenix) — Status and current session info
    router.get(['/api/bbt', '/api/fenix'], bbtHandle(async () => {
        const session = getSession().check();
        const ports = xrayRunner.getPorts();
        const currentProxy = await systemProxy.readCurrentProxy();
        const out = Object.assign({
            ping: bbtPing,
            session,
            ports,
            killSwitch: killSwitch.getStatus(),
            autoReconnect: getSession().getAutoReconnect(),
        }, fx.status());

        out.route = {
            tun: tunManager.isRunning(),
            tunWanted: tunManager.isRunning(),
            sysProxy: !!currentProxy.enabled,
        };
        return out;
    }));

    // POST /api/bbt/signin — Firefox Account sign in
    router.post(['/api/bbt/signin', '/api/fenix/signin'], bbtHandle(async (b) => {
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

    // POST /api/bbt/code — 2FA or email confirmation code verification
    router.post(['/api/bbt/code', '/api/fenix/code'], bbtHandle(async (b) => {
        const code = String(b.code || '').trim();
        if (!CODE_REGEX.test(code)) {
            const err = new Error('کد تأیید باید ۶ یا ۸ رقم عددی باشد.');
            err.code = 'INVALID_INPUT';
            throw err;
        }
        await fx.verifyCode(code);
        return {};
    }));

    // POST /api/bbt/cancel — Cancel pending sign in
    router.post(['/api/bbt/cancel', '/api/fenix/cancel'], bbtHandle(async () => {
        return { cancelled: fx.cancelSignIn() };
    }));

    // POST /api/bbt/challenge — Handle Fastly browser challenge
    router.post(['/api/bbt/challenge', '/api/fenix/challenge'], bbtHandle(async (b) => {
        const host = String(b.host || '').trim().toLowerCase();
        const purpose = String(b.purpose || '').trim().slice(0, 64);
        if (!ALLOWED_CHALLENGE_HOSTS.has(host)) {
            const err = new Error(`هاست چالش نامعتبر است: ${host}`);
            err.code = 'INVALID_INPUT';
            throw err;
        }
        return await fx.challenge({ host, purpose });
    }));

    // POST /api/bbt/signout — Remove account
    router.post(['/api/bbt/signout', '/api/fenix/signout'], bbtHandle(async (b) => {
        const id = String(b.id || '').trim();
        if (!HEX_ID_REGEX.test(id)) {
            const err = new Error('شناسه حساب نامعتبر است.');
            err.code = 'INVALID_INPUT';
            throw err;
        }
        return { removed: fx.signOut(id) };
    }));

    // POST /api/bbt/quota — Refresh 50GB allowance
    router.post(['/api/bbt/quota', '/api/fenix/quota'], bbtHandle(async (b) => {
        const force = Boolean(b && b.force);
        return { accounts: await fx.refreshQuotas({ force }) };
    }));

    // POST /api/bbt/servers — Fetch Mozilla's server list & run pings
    router.post(['/api/bbt/servers', '/api/fenix/servers'], bbtHandle(async (b) => {
        const force = Boolean(b && b.force);
        const list = await fx.servers(force);
        if (!bbtPing.running && list.length) {
            bbtPing = { running: true };
            fx.pingAll(list).catch(() => {}).finally(() => {
                bbtPing = { running: false };
                broadcast('bbt-state', Object.assign({ ping: bbtPing }, fx.status()));
            });
        }
        return { servers: list, ping: bbtPing };
    }));

    // POST /api/bbt/ping — Force re-measure pings for all servers
    router.post(['/api/bbt/ping', '/api/fenix/ping'], bbtHandle(async () => {
        let list = await fx.servers();
        if (!list || !list.length) {
            list = await fx.servers(true);
        }
        if (!list || !list.length) throw new (fx.BbtError || fx.FenixError)('لیست سرورها در دسترس نیست.', 'NO_SERVERS');
        if (bbtPing.running) return { ping: bbtPing, status: 'already_running' };
        bbtPing = { running: true };
        fx.pingAll(list).catch(() => {}).finally(() => {
            bbtPing = { running: false };
            broadcast('bbt-state', Object.assign({ ping: bbtPing }, fx.status()));
        });
        return { ping: bbtPing, status: 'started' };
    }));

    // GET /api/bbt/killswitch — Get current kill switch status
    router.get(['/api/bbt/killswitch', '/api/fenix/killswitch'], bbtHandle(async () => {
        return killSwitch.getStatus();
    }));

    // POST /api/bbt/killswitch — Toggle kill switch
    router.post(['/api/bbt/killswitch', '/api/fenix/killswitch'], bbtHandle(async (b) => {
        const enabled = Boolean(b && b.enabled);
        const session = getSession().check();
        const currentPhase = session ? session.phase : 'off';
        const status = await killSwitch.setSetting(enabled, currentPhase);
        broadcast('bbt-state', { killSwitch: status });
        return status;
    }));

    // GET /api/bbt/autoreconnect — Get auto-reconnect setting
    router.get(['/api/bbt/autoreconnect', '/api/fenix/autoreconnect'], bbtHandle(async () => {
        return { enabled: getSession().getAutoReconnect() };
    }));

    // POST /api/bbt/autoreconnect — Toggle auto-reconnect
    router.post(['/api/bbt/autoreconnect', '/api/fenix/autoreconnect'], bbtHandle(async (b) => {
        const enabled = Boolean(b && b.enabled);
        const val = getSession().setAutoReconnect(enabled);
        broadcast('bbt-state', { autoReconnect: val });
        return { enabled: val };
    }));

    // GET /api/traffic (and /api/bbt/traffic, /api/fenix/traffic) — Live traffic stats
    router.get(['/api/traffic', '/api/bbt/traffic', '/api/fenix/traffic'], bbtHandle(async () => {
        return await trafficMonitor.getStats();
    }));

    // POST /api/bbt/connect — Connect to a country/server
    router.post(['/api/bbt/connect', '/api/fenix/connect'], bbtHandle(async (b) => {
        trafficMonitor.resetSession();
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

    // POST /api/bbt/stop — Disconnect active session
    router.post(['/api/bbt/stop', '/api/fenix/stop'], bbtHandle(async () => {
        trafficMonitor.resetSession();
        if (tunManager.isRunning()) {
            await tunManager.stop();
        }
        const session = await getSession().disconnect();
        return { session };
    }));

    // Proxy toggle routes (compatible with frontend)
    router.post('/api/v2ray/sysproxy', bbtHandle(async (b) => {
        const enable = Boolean(b && b.enable);
        if (enable) {
            // Disable TUN if system proxy is explicitly requested
            if (tunManager.isRunning()) {
                await tunManager.stop();
            }
            proxyWanted = true;
            await systemProxy.enable();
        } else {
            proxyWanted = false;
            await systemProxy.disable();
        }
        return { ok: true, enabled: enable };
    }));

    router.post('/api/v2ray/tun', bbtHandle(async (b) => {
        const enable = Boolean(b && (b.enabled || b.enable));
        if (enable) {
            // When true TUN is activated, disable sysproxy because TUN directly captures all packets
            if (proxyWanted) {
                proxyWanted = false;
                await systemProxy.disable().catch(() => {});
            }

            // Exclude active server IPs from TUN routing table to eliminate any possibility of loopback
            const serverIps = [];
            try {
                const s = getSession().check();
                if (s && s.target && Array.isArray(s.target.paths)) {
                    serverIps.push(...s.target.paths);
                }
                if (s && s.server && s.server.host) {
                    const lookedUp = await fx.lookup(s.server.host).catch(() => []);
                    if (Array.isArray(lookedUp)) serverIps.push(...lookedUp);
                }
            } catch (_) {}

            const res = await tunManager.start({
                socksPort: xrayRunner.SOCKS_PORT,
                serverIps,
            });
            return Object.assign({ ok: true, enabled: true, tun: true, sysProxy: false }, res);
        } else {
            await tunManager.stop();
            return { ok: true, enabled: false, tun: false, sysProxy: false };
        }
    }));

    return router;
}

const createFenixRouter = createBbtRouter;

module.exports = {
    createBbtRouter,
    createFenixRouter,
    ALLOWED_CHALLENGE_HOSTS,
};
