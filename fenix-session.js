// --- «FENIX» — the live connection, kept by the server (Electron's main process) ---
//
// The window used to own it: it asked for a pass, started the config, and set a timer to renew the
// pass before it ran out. Three things went wrong because of that:
//   · the timer restarted the engine with FENIX's config about 45 minutes later even when the user
//     had connected something else since — the other connection was silently replaced;
//   · the restart asked for `useSystemProxy:false`, which switched Windows' proxy off under a user
//     who had chosen «پروکسی کل سیستم» — connected, and nothing loading;
//   · a reloaded window forgot the whole connection, and the pass then ran out unrenewed.
// Here the server owns it. Whether the live config is still FENIX's is asked of the engine itself,
// every time, and a renewal keeps the Windows proxy exactly as the user left it.
//
// The connect walks Android's ladder (engines/fenix › FenixEngine.connect): a server that answers a
// real TLS handshake, the chosen account's fresh pass, the config over HTTP/2 or HTTP/1.1 (whichever
// carried data last time first), and a real request through it. One account per connection — the
// renewal keeps the same one, and a used-up allowance ends the connection with the reason, never a
// quiet move to another account.
//
// Everything the engine is asked to do arrives as a dependency (server.js wires the real ones), so
// the whole lifecycle — cancel, renewal, takeover, expiry — is tested against stand-ins.

'use strict';

const fx = require('./fenix');

const TICK_MS = 20 * 1000;   // how often the live connection is looked at; wall-clock, so sleep cannot fool it
const RETRY_S = 60;          // a renewal that failed is tried again this soon, until the pass ends
const MIN_LEAD_S = 120;      // never renew later than this before the pass ends
const STILL_DOWN_MS = 15 * 1000;   // an engine gone this long under a live connection has ended it

/** The config FENIX builds: Xray's JSON with FENIX's own first outbound. */
function isFenixUri(uri) {
    return typeof uri === 'string' && uri.trim().startsWith('{') && /"tag"\s*:\s*"fenix-0"/.test(uri);
}

/** When to fetch the next pass: three quarters of the way through this one, and never too late. */
function renewAtFor(p, nowS) {
    const issued = Number(p.issuedAt) || nowS;
    const life = Math.max(0, Number(p.expiresAt) - issued);
    return Math.max(nowS + 30, Math.min(issued + Math.floor(life * 0.75), Number(p.expiresAt) - MIN_LEAD_S));
}

let names = null;
function countryName(cc) {
    try { names = names || new Intl.DisplayNames(['fa'], { type: 'region' }); const n = names.of(cc); return n && n !== cc ? n : cc; } catch (e) { return cc; }
}

function create(deps) {
    const d = Object.assign({
        start: async () => {},                    // (uri, { useSystemProxy }) — the app's one Xray path
        stop: async () => {},                     // the whole of «disconnect V2Ray»: tunnel, engine, proxy
        verify: async () => ({ ok: false }),      // a real request through the engine: { ok, ip, loc, rttMs }
        liveUri: () => null,                      // the config the engine was last started with (xray-manager › getCurrentUri)
        running: () => false,                     // whether that engine's process is up
        proxyIntent: () => false,                 // whether the Windows proxy is meant to be on right now
        remember: () => {},                       // ({ country, accountId }) for «VPN همیشه روشن»
        emit: () => {},
        now: () => Date.now(),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        tickMs: TICK_MS,
    }, deps || {});

    let s = null;          // the session (see status()), or null
    let last = null;       // how the last one ended, for the window: { at, why, error, code }
    let attempt = 0;       // bumped by every connect and stop: an older attempt sees it and stands down
    let inflight = null;   // an engine start in progress — a stop waits for it rather than racing it
    let timer = null;
    let renewing = false;
    let stopping = null;   // the stop in progress: a second caller waits for it instead of stopping twice
    let downSince = 0;     // when the engine was first seen not running under this connection

    const ours = (uri) => !!(uri && d.liveUri() === uri);
    const carrying = (uri) => ours(uri) && !!d.running();
    function stopNow() {
        if (!stopping) stopping = Promise.resolve().then(() => d.stop()).finally(() => { stopping = null; });
        return stopping;
    }

    const nowS = () => Math.floor(d.now() / 1000);
    const emit = () => { try { d.emit(status()); } catch (e) { /* no page listening */ } };

    function status() {
        const uri = s && s.uri;
        return {
            phase: s ? s.phase : 'off',            // off | connecting | on | renewing | stopping
            step: (s && s.step) || '',             // server | pass | tunnel | check  (while connecting)
            live: carrying(uri),                   // the engine is carrying THIS connection's config now
            country: s ? s.country : null,         // what was asked: 'fastest' or a code
            accountId: s ? s.accountId : null,     // what was asked; null = the first signed-in account
            server: s && s.server ? { country: s.server.country, host: s.server.host } : null,
            account: s && s.account ? { id: s.account.id, email: s.account.email } : null,
            exit: (s && s.exit) || null,
            http1: !!(s && s.http1),
            quota: (s && s.quota) || null,
            expiresAt: (s && s.expiresAt) || 0,
            renewAt: (s && s.renewAt) || 0,
            renewedAt: (s && s.renewedAt) || 0,
            renewError: (s && s.renewError) || '',
            connectedAt: (s && s.connectedAt) || 0,
            last,
        };
    }

    function stopTimer() { if (timer) clearInterval(timer); timer = null; }
    function startTimer() {
        stopTimer();
        timer = setInterval(() => { tick().catch(() => {}); }, d.tickMs);
        if (timer.unref) timer.unref();
    }

    async function startEngine(uri, useSystemProxy) {
        inflight = Promise.resolve(d.start(uri, { useSystemProxy: !!useSystemProxy }));
        try { await inflight; } finally { inflight = null; }
    }

    /** Connect. Resolves the status, or { cancelled:true } when a stop overtook it; throws a FenixError. */
    async function connect({ country = 'fastest', accountId = null } = {}) {
        if (s && (s.phase === 'connecting' || s.phase === 'stopping')) throw new fx.FenixError('یک اتصال در جریان است — صبر کنید یا لغو کنید.', 'BUSY');
        // A change of country while connected: the connection that is up stays this session's until the
        // new config replaces it on the engine.
        const prev = s && (s.phase === 'on' || s.phase === 'renewing') && s.uri ? s : null;
        const my = ++attempt;
        stopTimer();
        s = { phase: 'connecting', step: 'server', country: country || 'fastest', accountId: accountId || null, startedAt: d.now() };
        last = null;
        emit();
        const alive = () => my === attempt;
        const onStep = (step) => { if (alive() && s) { s.step = step; emit(); } };
        let startedUri = null;
        // Whatever this attempt started is its own to stop — never a config someone else put up since.
        const cleanUp = async () => { if (ours(startedUri)) { try { await stopNow(); } catch (e) { /* reported by the caller */ } } };
        try {
            const prep = await fx.prepare({ accountId, country, onStep });
            if (!alive()) { await cleanUp(); return { cancelled: true }; }
            const target = { server: prep.server, paths: prep.paths };
            Object.assign(s, { server: prep.server, account: prep.account });
            for (const h1 of [prep.http1, !prep.http1]) {
                onStep('tunnel');
                const cfg = h1 === prep.http1 ? prep.config : fx.config(prep.server, prep.paths, prep.token, { http1: h1 });
                const uri = JSON.stringify(cfg);
                // The Windows proxy as it is ONLY when this replaces a running config (a change of
                // country, say): from a stopped engine the intent is whatever an old session left.
                // The window applies the chosen coverage once data has gone through.
                await startEngine(uri, d.running() && d.proxyIntent());
                startedUri = uri;
                if (!alive()) { await cleanUp(); return { cancelled: true }; }
                onStep('check');
                let v = null;
                for (let i = 0; i < 3; i++) {
                    v = await d.verify();
                    if (!alive()) { await cleanUp(); return { cancelled: true }; }
                    if (v && v.ok) break;
                    if (i < 2) await d.sleep(2500);
                    if (!alive()) { await cleanUp(); return { cancelled: true }; }
                }
                if (!(v && v.ok)) continue;
                try { fx.setHttp1(h1); if (v.loc) fx.noteExit(prep.server.country, v.loc); } catch (e) { /* bookkeeping only */ }
                Object.assign(s, {
                    phase: 'on', step: '', uri, http1: h1, target,
                    // The renewal keeps this very account, whatever was asked.
                    accountId: prep.account.id,
                    exit: { ip: v.ip || '', loc: v.loc || '', ms: Number(v.rttMs) || null },
                    quota: prep.pass.quota || null,
                    expiresAt: prep.pass.expiresAt, renewAt: renewAtFor(prep.pass, nowS()),
                    connectedAt: d.now(), renewedAt: 0, renewError: '',
                });
                try { d.remember({ country: s.country, accountId: s.accountId }); } catch (e) { /* nothing kept */ }
                downSince = 0;
                startTimer();
                emit();
                return status();
            }
            throw new fx.FenixError(`سرور ${countryName(s && s.server ? s.server.country : '')} وصل شد ولی داده‌ای رد نکرد — کشور دیگری را امتحان کنید.`, 'NO_DATA');
        } catch (e) {
            if (!alive()) return { cancelled: true };
            // The change failed before its config reached the engine: the old connection is still
            // carrying traffic, so it is looked after (and renewed) as before — not orphaned.
            if (!startedUri && prev && ours(prev.uri)) {
                prev.phase = 'on';
                s = prev;
                startTimer();
                last = { at: d.now(), why: 'switch-failed', error: e.message, code: e.code || null };
                emit();
                throw e;
            }
            await cleanUp();
            s = null;
            last = { at: d.now(), why: 'failed', error: e.message, code: e.code || null };
            emit();
            throw e;
        }
    }

    /** End the connection, or the attempt in progress. Only FENIX's own config is ever stopped. */
    async function disconnect() {
        attempt++;
        stopTimer();
        const had = s;
        s = { phase: 'stopping', step: '', country: had ? had.country : null, accountId: had ? had.accountId : null };
        emit();
        if (inflight) { try { await inflight; } catch (e) { /* it failed on its own */ } }
        const uri = d.liveUri();
        try {
            // A crashed engine counts too: its tunnel and proxy must still come down.
            if ((had && had.uri && uri === had.uri) || isFenixUri(uri)) await stopNow();
        } finally {
            s = null;
            last = { at: d.now(), why: 'user' };
            emit();
        }
        return status();
    }

    /**
     * Is the connection still there? Another config on the engine ends it at once; an engine that is
     * not running ends it only after STILL_DOWN_MS, because a settings change or the tunnel switch
     * restarts the same config and the process is briefly gone in between.
     */
    function check() {
        if (!s || s.phase !== 'on' || renewing) return status();
        const uri = d.liveUri();
        let why = null;
        if (uri !== s.uri) why = uri ? 'replaced' : 'stopped';
        else if (!d.running()) {
            if (!downSince) downSince = d.now();
            if (d.now() - downSince >= STILL_DOWN_MS) why = 'stopped';
        } else downSince = 0;
        if (why) {
            // Over: say so, and renew nothing — a renewal now would put FENIX back over whatever replaced it.
            last = { at: d.now(), why };
            s = null;
            downSince = 0;
            stopTimer();
            emit();
        }
        return status();
    }

    async function tick() {
        check();
        if (!s || s.phase !== 'on' || renewing || !d.running()) return;
        if (nowS() < s.renewAt) return;
        await renew();
    }

    /** A new pass on the same server, the same paths and the same account. */
    async function renew() {
        const my = attempt;
        const cur = s;
        renewing = true;
        cur.phase = 'renewing';
        emit();
        let restarted = false;
        try {
            const prep = await fx.prepare({ accountId: cur.accountId, country: cur.server.country, target: cur.target, http1: cur.http1 });
            // The user moved on while Guardian was asked: nothing of theirs is touched.
            if (my !== attempt || s !== cur || !ours(cur.uri)) return;
            const uri = JSON.stringify(prep.config);
            restarted = true;
            await startEngine(uri, d.proxyIntent());
            if (my !== attempt || s !== cur) return;   // a stop came during the restart and handled it
            Object.assign(cur, {
                uri, account: prep.account, quota: prep.pass.quota || cur.quota,
                expiresAt: prep.pass.expiresAt, renewAt: renewAtFor(prep.pass, nowS()),
                renewedAt: d.now(), renewError: '',
            });
            try { d.remember({ country: cur.country, accountId: cur.accountId }); } catch (e) { /* nothing kept */ }
        } catch (e) {
            if (my !== attempt || s !== cur) return;
            cur.renewError = e.message;
            if (restarted) {
                // The new config did not come up, and the old engine went down on the way. The old pass
                // still has a quarter of its life: put it back rather than leave the tunnel over nothing.
                try { await startEngine(cur.uri, d.proxyIntent()); }
                catch (e2) {
                    try { await stopNow(); } catch (e3) { /* the reason below says enough */ }
                    last = { at: d.now(), why: 'failed', error: e2.message, code: e2.code || null };
                    s = null;
                    stopTimer();
                    return;
                }
                if (my !== attempt || s !== cur) return;
            }
            const t = nowS();
            if (t >= cur.expiresAt) {
                // The pass is over and no new one came: nothing passes through it any more, and under the
                // full tunnel the whole machine would sit offline behind it. End it, and say why.
                try { if (ours(cur.uri)) await stopNow(); } catch (e2) { /* the reason below says enough */ }
                last = { at: d.now(), why: 'expired', error: e.message, code: e.code || null };
                s = null;
                stopTimer();
            } else {
                cur.renewAt = Math.min(t + RETRY_S, cur.expiresAt);
            }
        } finally {
            renewing = false;
            if (s === cur && cur.phase === 'renewing') cur.phase = 'on';
            emit();
        }
    }

    return { connect, disconnect, status, check, tick, owns: () => !!(s && carrying(s.uri)) };
}

module.exports = { create, isFenixUri, renewAtFor, TICK_MS, RETRY_S, STILL_DOWN_MS };
