// --- «FENIX» — Firefox's built-in VPN (Mozilla's Fastly MASQUE proxies), on Windows ---
//
// Android 1.2.41 › engines/fenix. The Firefox Accounts sign-in (onepw: PBKDF2 + HKDF, Hawk) is ported
// from FoxyVPN (https://github.com/vauth/foxyvpn, MIT — Copyright (c) 2026 Vauth), itself a port of
// firefox-vpn-client. Changed, as on the phone: Fastly's browser check is NOT imitated — on HTTP 406
// Mozilla's own page opens in an Electron window (the page of the site that asked), the user passes
// the check as anyone would, and from then on that site's calls are made by that window's browser.
// Accounts are signed in to on Mozilla's own page in the same window (Android 1.2.43): the page's
// verified session is taken for the token grant, and the password never passes through the app.
//
// Control plane (direct — measured reachable from Iran on 2026-10-03): the account's OAuth token
// (VPN scope) → Guardian's short-lived «proxy pass» (a JWT, ~1 h) and the monthly allowance (50 GB
// free); the server list from Mozilla's public Remote Settings (one Fastly server per country).
// Data plane: Xray's HTTP proxy client — TLS to Fastly with HTTP/2, every connection a CONNECT on one
// shared session, the pass as `Proxy-Authorization: Bearer`. TCP only: QUIC refused at once, other
// UDP dropped (never sent around the proxy); lookups that reach the engine are answered over DoH
// through the tunnel. The live connection and its pass renewal are fenix-session.js's.
// The password is never stored: only the derived authPW is sent; tokens are DPAPI-sealed.
//
// One account carries a connection: the one the user chose, or the first signed-in one. The app never
// moves a connection to another account by itself — an account whose monthly allowance is used up
// says so, and stays unused until Mozilla refills it.

'use strict';

const fs = require('fs');
const os = require('os');
const tls = require('tls');
const dns = require('dns');
const path = require('path');
const crypto = require('crypto');
const solver = require('./fastly-solver');

function getStorageDir() {
    const base = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
    const dir = path.join(base, 'fenix-vpn');
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
    }
    return dir;
}
const FILE = path.join(getStorageDir(), 'fenix.json');
let AUTH = 'https://api.accounts.firefox.com/v1';
/** Mozilla's OAuth server: its `/token` is the token endpoint accounts.firefox.com/.well-known/openid-configuration names. */
let OAUTH = 'https://oauth.accounts.firefox.com/v1';
const GUARDIAN = 'https://vpn.mozilla.org/api/v1/fpn';
const LIST_URL = 'https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/vpn-serverlist/records';
const CLIENT_ID = '5882386c6d801776';                       // Mozilla VPN's own client id
const SCOPE = 'profile https://identity.mozilla.com/apps/vpn';
const PROTOCOL = 'identity.mozilla.com/picl/v1/';
const UA = 'MozillaVPN/2.35.0 (sys:linux; iap:true)';
const FIREFOX_DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:158.0) Gecko/20100101 Firefox/158.0';
const WEBCHANNEL_LOGIN_URL = 'https://accounts.firefox.com/?context=fx_desktop_v3&service=sync&action=email';
const GRANT_BODY = { client_id: CLIENT_ID, grant_type: 'fxa-credentials', scope: SCOPE, access_type: 'offline' };
/** Mozilla's own page for each site's browser check: the accounts' (where an account is signed in to as well) and Guardian's. */
const CHECK_PAGES = { 'firefox.com': 'https://accounts.firefox.com/', 'mozilla.org': 'https://vpn.mozilla.org/' };
const now = () => Math.floor(Date.now() / 1000);

/** Below this an account counts as used up: its last few hundred MB are not worth a connect (Android). */
const MIN_LEFT_BYTES = 200 * 1024 * 1024;
/** A used-up reading younger than this is believed without asking Guardian again. */
const QUOTA_STALE_MS = 6 * 3600 * 1000;
/** One account is asked for its numbers at most this often outside a connect. */
const QUOTA_GAP_MS = 60 * 1000;
/** «سریع‌ترین» trusts a measurement this young; an older one is taken again first. */
const PINGS_FRESH_MS = 30 * 60 * 1000;

// ── onepw (FenixAuth) ──────────────────────────────────────────────────────────

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
function hkdf(ikm, info, length) {
    const prk = hmac(Buffer.alloc(32), ikm);
    let prev = Buffer.alloc(0), out = Buffer.alloc(0);
    for (let i = 1; out.length < length; i++) { prev = hmac(prk, Buffer.concat([prev, Buffer.from(info, 'utf8'), Buffer.from([i])])); out = Buffer.concat([out, prev]); }
    return out.subarray(0, length);
}
function authPw(email, password) {
    const quick = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), Buffer.from(`${PROTOCOL}quickStretch:${email}`, 'utf8'), 1000, 32, 'sha256');
    return hkdf(quick, `${PROTOCOL}authPW`, 32).toString('hex');
}
function hawkCredentials(sessionHex) {
    const x = hkdf(Buffer.from(sessionHex, 'hex'), `${PROTOCOL}sessionToken`, 64);
    return { id: x.subarray(0, 32).toString('hex'), key: x.subarray(32, 64) };
}
function hawkHeader(method, url, id, key, body, ts = now(), nonce = crypto.randomBytes(6).toString('base64url')) {
    const u = new URL(url);
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    const hash = body && body.length ? crypto.createHash('sha256').update('hawk.1.payload\napplication/json\n').update(body).update('\n').digest('base64') : '';
    const normalized = `hawk.1.header\n${ts}\n${nonce}\n${method.toUpperCase()}\n${u.pathname}${u.search}\n${u.hostname}\n${port}\n${hash}\n\n`;
    const mac = hmac(key, normalized).toString('base64');
    return `Hawk id="${id}", ts="${ts}", nonce="${nonce}", mac="${mac}"` + (hash ? `, hash="${hash}"` : '');
}

// ── state (tokens sealed) ─────────────────────────────────────────────────────

// Every key the file can hold. load() keeps what it does not know as well, so a field added later is
// never dropped by an older writer on its way through.
// `checked`: by site (firefox.com, mozilla.org), when its browser check was last put to the person in
// the app's window — from then on that site's calls go by that window's browser (see call()).
const EMPTY = () => ({ accounts: [], servers: null, serversAt: 0, pings: {}, checked: {}, exitSeen: {}, http1: false });
function load() {
    try {
        const s = Object.assign(EMPTY(), JSON.parse(fs.readFileSync(FILE, 'utf8')) || {});
        if (!Array.isArray(s.accounts)) s.accounts = [];
        if (!s.pings || typeof s.pings !== 'object') s.pings = {};
        if (!s.checked || typeof s.checked !== 'object') s.checked = {};
        if (!s.exitSeen || typeof s.exitSeen !== 'object') s.exitSeen = {};
        return s;
    } catch (e) { return EMPTY(); }
}
function save(s) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(s, null, 2)); fs.renameSync(FILE + '.tmp', FILE); return s; }
/**
 * %APPDATA%/fenix-vpn/fenix.log: which of Mozilla's endpoints answered what, and through whom (Node, the
 * browser, Mozilla's page) — the record a «it asks for the check again» report is read from. Hosts,
 * paths and status codes only: never a token, a session or an e-mail. Kept under 256 KB.
 */
const LOG_FILE = path.join(path.dirname(FILE), 'fenix.log');

/**
 * Sanitizes any log line or error message to guarantee credentials and tokens never leak.
 */
function sanitizeLog(text) {
    if (!text) return '';
    let str = String(text);
    // Redact Bearer tokens (e.g. Bearer xyz -> Bearer [REDACTED])
    str = str.replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]');
    // Redact Proxy-Authorization and Authorization if not using Bearer
    str = str.replace(/(Proxy-Authorization\s*:\s*)(?!Bearer\b)\S+/gi, '$1[REDACTED]');
    str = str.replace(/(Authorization\s*:\s*)(?!Bearer\b)\S+/gi, '$1[REDACTED]');
    // Redact JWT tokens
    str = str.replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_JWT]');
    // Redact emails
    str = str.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
    // Redact password, code, token, authPW key-values
    str = str.replace(/(["']?(?:password|passwd|code|secret|authPW|token)["']?\s*[:=]\s*)["']?[^"'\s,]+["']?/gi, '$1"[REDACTED]"');
    return str;
}

function note(line) {
    try {
        try { if (fs.statSync(LOG_FILE).size > 256 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + '.1'); } catch (e) { /* first line */ }
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${sanitizeLog(line)}\n`);
    } catch (e) { /* a diary, never a failure */ }
}
/** Change one account in the file, if it is still there. */
function updateAccount(id, fn) {
    const s = load();
    const a = s.accounts.find((x) => x.id === id);
    if (!a) return null;
    fn(a);
    save(s);
    return a;
}
const crypt = () => require('./crypto-store');

class FenixError extends Error { constructor(msg, code, extra) { super(msg); this.code = code; Object.assign(this, extra || {}); } }

/** `firefox.com` or `mozilla.org` for their hosts: Fastly's check and its pass are per site (Android › FenixHttp.siteOf). */
function siteOf(host) {
    const h = String(host || '').toLowerCase();
    if (h === 'firefox.com' || h.endsWith('.firefox.com')) return 'firefox.com';
    if (h === 'mozilla.org' || h.endsWith('.mozilla.org')) return 'mozilla.org';
    return h;
}
/** `p`, or a TimeoutError once `ms` have gone by. */
function timed(p, ms) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), ms);
        Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
}

// ── the browser Mozilla's check is passed in ──────────────────────────────────
//
// Fastly turns Node away at its edge for the sign-in and the token calls, tunnel or none — measured
// 2026-11-04 from Iran with the sockets bound to the Wi-Fi card: /account/login and /oauth/token 406
// with no body, while /account/status, Guardian and the server list answered. And the pass a person
// earns on Mozilla's page is held to the browser that earned it: its cookies, copied into Node's own
// requests, carried nothing (2026-11-04: the page opened, the user signed in there, the retry was
// refused again). So once a site's check has been put to the person in the app's window, that site's
// calls are made BY that window's browser — the same Electron session, its cookies, its own name
// (Android sends OkHttp in the WebView's name; here the browser itself is at hand). Nothing is ever
// passed for the person: a call refused again asks them again.

/** The window's browser profile: cookies (Fastly's pass among them) on disk, the page's storage wiped around each window. */
const PARTITION = 'persist:fenix';
const inElectron = () => !!(process.versions && process.versions.electron) && process.type === 'browser';
let browser = null;   // { ses, ready }
function browserSession() {
    if (browser) return browser;
    if (!inElectron()) return null;
    const ses = require('electron').session.fromPartition(PARTITION);
    // Direct, like Node's calls: the check is passed from the address the calls then come from,
    // whatever Windows proxy an engine has put up.
    const ready = ses.setProxy({ mode: 'direct' }).catch(() => {});
    // Report as desktop Firefox 158.0 with Persian language preference.
    try { ses.setUserAgent(FIREFOX_DESKTOP_UA, 'fa-IR,fa,en-US,en'); } catch (e) { /* its own languages */ }
    browser = { ses, ready };
    return browser;
}
const browserFetchReal = async (url, o) => { const b = browserSession(); await b.ready; return b.ses.fetch(url, o); };
let browserFetch = browserFetchReal;
let browserStandIn = false;   // tests: a stand-in browser outside Electron
const canBrowse = () => browserStandIn || inElectron();

let fetchImpl = (u, o) => fetch(u, o);
async function call(method, url, { json = null, bearer = null, session = null } = {}) {
    const body = json ? Buffer.from(JSON.stringify(json), 'utf8') : null;
    const host = new URL(url).hostname;
    // A site whose check was put to the person in the app's window: its calls go by that browser.
    const viaBrowser = canBrowse() && !!load().checked[siteOf(host)];
    const headers = viaBrowser ? {} : { 'User-Agent': UA, 'Accept': '*/*', 'Accept-Encoding': 'identity' };
    if (!viaBrowser && (url.includes('/oauth/') || url.includes('/v1/token') || url.includes('/account/') || url.includes('/session/'))) {
        headers['User-Agent'] = FIREFOX_DESKTOP_UA;
        headers['Accept'] = 'application/json;q=0.9,*/*;q=0.2';
        headers['Accept-Language'] = 'en-US, en';
        headers['Cache-Control'] = 'no-cache';
        headers['Pragma'] = 'no-cache';
        headers['Sec-Fetch-Dest'] = 'empty';
        headers['Sec-Fetch-Mode'] = 'no-cors';
        headers['Sec-Fetch-Site'] = 'none';
        headers['Priority'] = 'u=4';
    }

    if (json) headers['Content-Type'] = 'application/json';
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    if (session) { const h = hawkCredentials(session); headers.Authorization = hawkHeader(method, url, h.id, h.key, body); }
    const cookieHeader = solver.getCookieHeader(url);
    if (cookieHeader) headers.Cookie = cookieHeader;
    let r;
    const execFetch = (u, o) => (viaBrowser ? browserFetch(u, Object.assign({ credentials: 'include' }, o)) : fetchImpl(u, o));
    // A request that never got an answer is the network's, and says so in Persian — not «fetch failed».
    try {
        r = await execFetch(url, { method, headers, body: body || (method === 'POST' ? Buffer.alloc(0) : undefined), signal: AbortSignal.timeout(40000) });
    } catch (e) {
        note(`${viaBrowser ? 'browser' : 'node'} ${method} ${host}${new URL(url).pathname} → no answer (${(e && e.name) || 'error'})`);
        throw new FenixError(e && (e.name === 'TimeoutError' || e.name === 'AbortError')
            ? 'موزیلا در زمان معمول جواب نداد — کمی بعد دوباره امتحان کنید.'
            : 'به سرورهای موزیلا نرسید — اتصال اینترنت را بررسی کنید.', 'OFFLINE');
    }
    note(`${viaBrowser ? 'browser' : 'node'} ${method} ${host}${new URL(url).pathname} → ${r.status}`);
    if (r && r.headers) solver.saveCookiesFromResponse(r.headers, url);
    if (r && r.status === 406) {
        note(`${viaBrowser ? 'browser' : 'node'} ${method} ${host}${new URL(url).pathname} → 406 (Fastly challenge detected)`);
        const b = browserSession();
        if (b && b.ses) {
            await solver.loadFromElectronSession(b.ses).catch(() => {});
        }

        const challengedBody = await r.text().catch(() => '');
        let solved = false;
        try {
            solved = await solver.solveAndInstall({
                challengedBody,
                challengedOrigin: `https://${host}`,
                userAgent: headers['User-Agent'] || FIREFOX_DESKTOP_UA,
                fetchFn: fetchImpl,
            });
        } catch (solveErr) {
            note(`Fastly challenge solver error: ${solveErr.message}`);
        }
        if (solved) {
            note(`Fastly challenge solved! Retrying ${method} ${host}${new URL(url).pathname}`);
            if (b && b.ses) {
                await solver.syncToElectronSession(b.ses).catch(() => {});
            }
            const newCookie = solver.getCookieHeader(url);
            if (newCookie) headers.Cookie = newCookie;
            if (session) {
                const h = hawkCredentials(session);
                headers.Authorization = hawkHeader(method, url, h.id, h.key, body);
            }
            try {
                r = await execFetch(url, { method, headers, body: body || (method === 'POST' ? Buffer.alloc(0) : undefined), signal: AbortSignal.timeout(40000) });
                if (r && r.headers) solver.saveCookiesFromResponse(r.headers, url);
            } catch (retryErr) {}
        }
        // If still 406 in Electron when browserFetch was refused: try via Node fetchImpl with full Firefox headers
        if (r && r.status === 406 && canBrowse() && viaBrowser && inElectron()) {
            try {
                note(`Retrying 406 via Node fetchImpl for ${host}${new URL(url).pathname}`);
                const nodeHeaders = {
                    'User-Agent': FIREFOX_DESKTOP_UA,
                    'Accept': 'application/json;q=0.9,*/*;q=0.2',
                    'Accept-Encoding': 'identity',
                    'Accept-Language': 'en-US, en',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'no-cors',
                    'Sec-Fetch-Site': 'none',
                    'Priority': 'u=4',
                };
                if (json) nodeHeaders['Content-Type'] = 'application/json';
                if (bearer) nodeHeaders.Authorization = 'Bearer ' + bearer;
                if (session) {
                    const h = hawkCredentials(session);
                    nodeHeaders.Authorization = hawkHeader(method, url, h.id, h.key, body);
                }
                const cHeader = solver.getCookieHeader(url);
                if (cHeader) nodeHeaders.Cookie = cHeader;
                const rNode = await fetchImpl(url, { method, headers: nodeHeaders, body: body || (method === 'POST' ? Buffer.alloc(0) : undefined), signal: AbortSignal.timeout(40000) });
                if (rNode && rNode.status !== 406) {
                    r = rNode;
                    if (r.headers) solver.saveCookiesFromResponse(r.headers, url);
                }
            } catch (nErr) {}
        }
        // If still 406 and not viaBrowser but canBrowse, try via Electron browser session
        if (r && r.status === 406 && canBrowse() && !viaBrowser && inElectron()) {
            try {
                if (b && b.ses) await solver.syncToElectronSession(b.ses).catch(() => {});
                note(`Retrying 406 via Electron browser fetch for ${host}${new URL(url).pathname}`);
                const rBrowser = await browserFetch(url, { method, headers, body: body || (method === 'POST' ? Buffer.alloc(0) : undefined), signal: AbortSignal.timeout(40000) });
                if (rBrowser && rBrowser.status !== 406) {
                    r = rBrowser;
                    if (r.headers) solver.saveCookiesFromResponse(r.headers, url);
                }
            } catch (bErr) {}
        }
        note(`${viaBrowser ? 'browser' : 'node'} final ${method} ${host}${new URL(url).pathname} → ${r.status}`);
        return answerOf(r.status, r.status === 406 ? '' : await r.text(), host, r.headers);
    }
    return answerOf(r.status, await r.text(), host, r.headers);
}
/** One of Mozilla's answers, read the same way whoever made the call (Node, the browser, Mozilla's page). */
function answerOf(status, text, host, headers) {
    // `host`: the site that asked for its check (Firefox Accounts or Guardian) — its page is the one opened.
    if (status === 406) throw new FenixError('موزیلا اول یک بررسی مرورگر می‌خواهد.', 'CHALLENGE', { host });
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = {}; }
    // Mozilla's own sentence is English; it is kept as `detail` for the log, not shown as the reason.
    if (status >= 400) throw new FenixError(`موزیلا این درخواست را نپذیرفت (کد ${status}).`, 'API', { status, errno: data.errno, detail: data.message || '', retryAfter: headers.get('retry-after') });
    return { data, headers };
}

// ── accounts ──────────────────────────────────────────────────────────────────

// { email, session, verified } between the password and the e-mail code — or, with `web`, a session
// taken from Mozilla's own page whose token grant is still to come (a check stood in its way).
let pending = null;
async function login(email, password, withMethod = true) {
    const json = { email, authPW: authPw(email, password) };
    if (withMethod) json.verificationMethod = 'email-2fa';
    try { return (await call('POST', AUTH + '/account/login', { json })).data; }
    catch (e) { if (e.errno === 107 && withMethod) return login(email, password, false); throw e; }
}

/** Email + password. Resolves { needCode } — Mozilla usually sends a 6-digit code by e-mail. */
async function signIn(email, password) {
    const em = String(email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) || !password) throw new FenixError('ایمیل و رمز حساب فایرفاکس را وارد کنید.', 'INPUT');
    { const s = load(); if (s.refusedAt) { delete s.refusedAt; save(s); } }
    let d;
    try { d = await login(em, String(password)); }
    catch (e) {
        if (e.errno === 102) throw new FenixError('حساب فایرفاکسی با این ایمیل نیست.', 'WRONG');
        if (e.errno === 103) throw new FenixError('ایمیل یا رمز حساب فایرفاکس درست نیست.', 'WRONG');
        if (e.errno === 114 || e.status === 429) throw new FenixError('موزیلا موقتاً ورود را محدود کرده — کمی بعد دوباره امتحان کنید.', 'RATE');
        throw e;
    }
    pending = { email: em, session: d.sessionToken, verified: d.verified !== false };
    if (d.verified === false) return { needCode: true };
    await complete();
    return { needCode: false };
}
async function verifyCode(code) {
    const p = pending;
    if (!p || p.web) throw new FenixError('اول ایمیل و رمز را بزنید.', 'STATE');
    // A code Mozilla already took — the token step after it was what failed — is not sent again.
    if (!p.verified) {
        const c = String(code || '').replace(/[\s-]/g, '').replace(/[۰-۹]/g, (x) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(x)));
        if (!/^\d{4,8}$/.test(c)) throw new FenixError('کد ۶ رقمی ایمیل را وارد کنید.', 'CODE');
        try { await call('POST', AUTH + '/session/verify_code', { session: p.session, json: { code: c } }); }
        catch (e) { if (e.status === 400) throw new FenixError('کد درست نیست یا منقضی شده.', 'CODE'); throw e; }
        p.verified = true;
    }
    await complete();
}
/** Back out of the e-mail code step: the half-made session is forgotten, nothing is saved. */
function cancelSignIn() { pending = null; return true; }

async function isSessionVerified(session) {
    try {
        const { data } = await call('GET', AUTH + '/recovery_email/status', { session });
        return !!(data && data.verified);
    } catch (e) { return false; }
}

async function waitSessionConfirmed(session, maxWaitMs = 2000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        if (await isSessionVerified(session)) return true;
        await new Promise((r) => setTimeout(r, 600));
    }
    return false;
}

async function destroySession(session) {
    try { await call('POST', AUTH + '/session/destroy', { session, json: {} }); }
    catch (e) { /* best-effort */ }
}

async function exchangeSessionWithOAuthCode(session) {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');
    const state = crypto.randomBytes(16).toString('base64url');
    const { data: authData } = await call('POST', AUTH + '/oauth/authorization', {
        session,
        json: {
            client_id: CLIENT_ID,
            response_type: 'code',
            scope: SCOPE,
            state,
            access_type: 'offline',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
        },
    });
    const code = authData && authData.code;
    if (!code || authData.state !== state) {
        throw new FenixError('موزیلا کد ورود را نداد — یک بار دیگر وارد شوید.', 'API');
    }
    const { data } = await call('POST', OAUTH + '/token', {
        json: {
            client_id: CLIENT_ID,
            grant_type: 'authorization_code',
            code,
            code_verifier: verifier,
        },
    });
    return data;
}

/**
 * An account signed in to on Mozilla's own page in the check window (Android › signInWithSession):
 * the page keeps its verified session, and that session is all the token grant needs — the password
 * never passes through the app. Held as pending until the grant is through, so a grant Mozilla sends
 * to its check is finished once the check is behind us. Resolves the e-mail.
 */
async function signInWithSession(email, session) {
    const em = String(email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) || !/^[0-9a-f]{64}$/i.test(String(session || ''))) {
        throw new FenixError('صفحهٔ موزیلا حساب را کامل تحویل نداد — یک بار دیگر وارد شوید.', 'STATE');
    }
    { const s = load(); if (s.refusedAt) { delete s.refusedAt; save(s); } }
    pending = { email: em, session: String(session).toLowerCase(), verified: true, web: true };
    try { await complete(); }
    catch (e) {
        // A session the page had not yet confirmed with the e-mailed code (Mozilla's errno 138).
        if (e.errno === 138) { pending = null; throw new FenixError(UNVERIFIED_MSG, 'UNVERIFIED'); }
        throw e;
    }
    return em;
}
/** The token grant for a signed-in session (Hawk-signed with it): an access token and a refresh token for the VPN scope. */
async function complete() {
    const p = pending;
    if (!p) throw new FenixError('اول ایمیل و رمز را بزنید.', 'STATE');
    if (!p.verified) {
        const ok = await waitSessionConfirmed(p.session, 2000);
        if (ok) p.verified = true;
    }
    const b = browserSession();
    if (b && b.ses) {
        await solver.loadFromElectronSession(b.ses).catch(() => {});
    }
    let tokenData = null;
    let originalChallenge = null;
    try {
        const res = await call('POST', AUTH + '/oauth/token', { session: p.session, json: GRANT_BODY });
        tokenData = res.data;
    } catch (e) {
        if (e.code === 'CHALLENGE') originalChallenge = e;
        // In real world, Fastly/Mozilla returns 406 on /oauth/token. Try PKCE code exchange fallback:
        try {
            tokenData = await exchangeSessionWithOAuthCode(p.session);
        } catch (pkceErr) {
            if (originalChallenge) throw originalChallenge;
            throw pkceErr;
        }
    }
    if (!tokenData || !tokenData.access_token) {
        if (originalChallenge) throw originalChallenge;
        throw new FenixError('موزیلا توکن حساب را نداد — یک بار دیگر وارد شوید.', 'API');
    }
    destroySession(p.session);
    return saveGrant(p, tokenData);
}
/** Keep what a grant for pending sign-in `p` gave (the account, its tokens sealed), whoever made the call. Resolves the account id. */
async function saveGrant(p, data) {
    if (!data || !data.access_token) throw new FenixError('موزیلا توکن حساب را نداد — یک بار دیگر وارد شوید.', 'API');
    const s = load();
    if (s.refusedAt) delete s.refusedAt;
    const id = crypto.createHash('sha1').update(p.email.toLowerCase()).digest('hex').slice(0, 10);
    const sealed = await crypt().protectAsync(JSON.stringify({ access: data.access_token, refresh: data.refresh_token || null }));
    const before = s.accounts.find((a) => a.id === id);
    s.accounts = s.accounts.filter((a) => a.id !== id).concat([{
        id, email: p.email, sealed, expiresAt: now() + (Number(data.expires_in) || 86400), signedOut: false,
        addedAt: (before && before.addedAt) || Date.now(),
        // Signing in again keeps what is known about the account's allowance.
        quota: (before && before.quota) || null,
    }]);
    save(s);
    needPage.delete(id);
    if (pending === p) pending = null;
    try { await guardian('POST', '/activate', await accessToken(id)); } catch (e) { /* activated already, or later */ }
    return id;
}

async function tokens(acct) { try { return JSON.parse(await crypt().unprotectAsync(acct.sealed)); } catch (e) { return null; } }

// ── the refresh ───────────────────────────────────────────────────────────────
//
// «مدام میره برای تایید موزیلا و برمیگرده» (7 Nov 2026): the account's day-long access token had run
// out, so every connect began with a refresh — and the one endpoint it went to, the auth server's
// /v1/oauth/token, answers Node with Fastly's bare 406, and on 6 Nov refused even a browser that had
// passed the check (Android). The check window then opened on that API host's own root, which is a
// blank 406 with no check on it: nothing to pass, the same refusal after it, the window back again.
// Now: the refresh asks the token endpoint Mozilla's OpenID configuration names first, then the auth
// server's; both refused by Fastly, it waits for Mozilla's own page (pageWork), whose calls to the same
// servers Fastly lets through — the page's own sign-in goes there too. An account is signed out only
// when Mozilla says its token is no good, never because a check stood in the way.

const refreshBody = (refresh) => ({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: refresh, scope: SCOPE });
/** Where a refresh is asked, in order: Node / the checked browser — the OpenID token endpoint first (Android, 7 Nov). */
const REFRESH_URLS = () => [OAUTH + '/token', AUTH + '/oauth/token'];
/**
 * …and from Mozilla's page: the auth server only — the server that page's own code talks to. The
 * OAuth host is not even sent from there: the page's own rules stop the browser before it leaves
 * («Failed to fetch», every time, 7 Nov 2026), so asking it only turned Mozilla's real answer into a
 * false «no network».
 */
const PAGE_REFRESH_URLS = () => [AUTH + '/oauth/token'];
/** Mozilla saying the refresh token is no good — 401/403, or 400 with errno 108 (invalid token) / 110 (invalid authentication token). */
const signedOutBy = (e) => !!e && (e.status === 401 || e.status === 403 || (e.status === 400 && (e.errno === 108 || e.errno === 110)));
/** Accounts whose refresh Fastly refused from here: made by Mozilla's page the next time it is open. */
const needPage = new Set();
/** Due for a refresh: the access token ends within ten minutes. */
const dueForRefresh = (a) => !!a && !a.signedOut && !(a.expiresAt - 600 > now());

/** Seal a refresh's answer into account `id`. Resolves the new access token. */
async function keepTokens(id, d, oldRefresh) {
    if (!d || !d.access_token) throw new FenixError('موزیلا توکن تازه نداد.', 'API');
    const sealed = await crypt().protectAsync(JSON.stringify({ access: d.access_token, refresh: d.refresh_token || oldRefresh }));
    updateAccount(id, (a) => { a.sealed = sealed; a.expiresAt = now() + (Number(d.expires_in) || 86400); a.signedOut = false; });
    needPage.delete(id);
    // Mozilla gave a token again: the hold on its window is over.
    { const s = load(); if (s.refusedAt) { delete s.refusedAt; save(s); } }
    return d.access_token;
}
function markSignedOut(id) {
    needPage.delete(id);
    updateAccount(id, (a) => { a.signedOut = true; });
    return new FenixError('موزیلا این حساب را خارج کرد — دوباره وارد شوید.', 'SIGNED_OUT');
}

/** A valid access token, refreshed when it is about to expire; a refresh Mozilla refuses outright signs the account out. */
async function accessToken(id, force = false) {
    const s = load();
    const a = s.accounts.find((x) => x.id === id);
    if (!a || a.signedOut) throw new FenixError('این حساب خارج شده — دوباره وارد شوید.', 'SIGNED_OUT');
    const t = await tokens(a);
    if (!t) throw new FenixError('توکن‌های این حساب روی این کامپیوتر باز نشد — یک بار خارج و دوباره وارد شوید.', 'SEAL');
    if (!force && a.expiresAt - 120 > now()) return t.access;
    if (!t.refresh) { a.signedOut = true; save(s); throw new FenixError('حساب نیاز به ورود دوباره دارد.', 'SIGNED_OUT'); }
    let checkWanted = null, last = null;
    for (const url of REFRESH_URLS()) {
        try { return await keepTokens(id, (await call('POST', url, { json: refreshBody(t.refresh) })).data, t.refresh); }
        catch (e) {
            if (signedOutBy(e)) throw markSignedOut(id);
            if (e.code === 'CHALLENGE') checkWanted = e; else last = e;
        }
    }
    // Fastly stood in the way: Mozilla's own page makes this refresh once the window is open (pageWork) —
    // unless even the page was turned away lately: then the answer is that, not the window again and again.
    if (checkWanted && Date.now() - (Number(load().refusedAt) || 0) < REFUSED_HOLD_MS) throw new FenixError(REFUSED_AGAIN_MSG, 'REFUSED_AGAIN');
    if (checkWanted) { needPage.add(id); throw new FenixError(checkWanted.message, 'CHALLENGE', { host: 'accounts.firefox.com' }); }
    throw last;
}

// ── Guardian ──────────────────────────────────────────────────────────────────

async function guardian(method, p, access) {
    try { return await call(method, GUARDIAN + p, { bearer: access }); }
    catch (e) {
        if (e.status === 451) {
            try {
                note(`Guardian returned 451, retrying with doubled-slash bypass for ${p}`);
                return await call(method, 'https://vpn.mozilla.org//api/v1/fpn' + p, { bearer: access });
            } catch (retryErr) { e = retryErr; }
        }
        if (e.status === 401 || e.status === 403) throw new FenixError('موزیلا توکن این حساب را نپذیرفت.', 'REJECTED');
        if (e.status === 429) throw new FenixError('حجم رایگان این ماهِ این حساب تمام شده است.', 'QUOTA');
        if (e.status === 451) throw new FenixError('موزیلا اینترنت منطقه شما را محدود کرده است (کد ۴۵۱).', 'REGION_BLOCKED');
        throw e;
    }
}
function claims(jwt) {
    try { const o = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')); return { iat: o.iat || o.nbf || null, exp: o.exp || null }; } catch (e) { return {}; }
}
/** Write what Guardian said about an account's allowance, keeping a figure a reply left out. */
function noteQuota(id, q) {
    updateAccount(id, (a) => {
        const old = a.quota || {};
        a.quota = {
            limit: q.unlimited ? null : (q.limit != null ? q.limit : (old.limit != null ? old.limit : null)),
            remaining: q.unlimited ? null : (q.remaining != null ? q.remaining : (old.remaining != null ? old.remaining : null)),
            reset: q.reset != null ? q.reset : (old.reset != null ? old.reset : null),
            unlimited: !!(q.unlimited || old.unlimited),
            at: Date.now(),
        };
        a.signedOut = false;
    });
}
/** A fresh proxy pass for account `id`: { token, issuedAt, expiresAt, quota: {limit, remaining, reset} }. */
async function pass(id) {
    let res;
    try {
        try { res = await guardian('GET', '/token', await accessToken(id)); }
        catch (e) {
            // A revoked access token is refreshed once and Guardian asked again (Android › fetchPass).
            if (e.code !== 'REJECTED') throw e;
            res = await guardian('GET', '/token', await accessToken(id, true));
        }
    } catch (e) {
        // «Used up» is a fact about the account worth keeping: the window shows it, and a connect does not ask again until the refill.
        if (e.code === 'QUOTA') noteQuota(id, { remaining: 0 });
        throw e;
    }
    const { data, headers } = res;
    if (!data.token) throw new FenixError('موزیلا پاس پراکسی نداد.', 'API');
    const c = claims(data.token);
    const t = now();
    // The phone's clock at receipt times the renewal, not the JWT's own times (they can be skewed).
    const expiresAt = c.iat && c.exp && c.exp > c.iat ? t + (c.exp - c.iat) : (Number(data.expires_at) > t ? Number(data.expires_at) : t + 3600);
    const num = (h) => {
        const v = headers && headers.get ? headers.get(h) : (headers && (headers[h.toLowerCase()] || headers[h]));
        if (v == null || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };
    const getH = (h) => (headers && headers.get ? headers.get(h) : (headers && (headers[h.toLowerCase()] || headers[h])));
    const isUnlimited = String(getH('X-Quota-Unlimited') || '').trim().toLowerCase() === 'true';
    const quota = {
        limit: isUnlimited ? null : num('X-Quota-Limit'),
        remaining: isUnlimited ? null : num('X-Quota-Remaining'),
        reset: num('X-Quota-Reset'),
        unlimited: isUnlimited,
    };
    if (isUnlimited || quota.limit != null || quota.remaining != null) noteQuota(id, quota);
    return { token: data.token, issuedAt: t, expiresAt, quota };
}

/** Known to be used up until its refill — and the reading is recent enough to believe. */
function exhausted(a, nowMs = Date.now()) {
    const q = a && a.quota;
    if (!q) return false;
    if (q.unlimited) return false;
    if (q.remaining == null || q.remaining >= MIN_LEFT_BYTES) return false;
    // A refill date already behind us means the month has turned.
    return !(q.reset && q.reset * 1000 <= nowMs);
}

/**
 * The account a connection uses, and a fresh pass for it: the one asked for, or the first signed-in
 * one. Exactly that account — when its allowance is used up the answer is QUOTA, never another
 * account in its place. Resolves { account:{id,email}, pass }.
 */
async function pickAccount({ accountId = null } = {}) {
    const s = load();
    const a = accountId ? s.accounts.find((x) => x.id === accountId) : s.accounts.find((x) => !x.signedOut);
    if (!a) {
        if (accountId) throw new FenixError('حسابی که برای اتصال انتخاب شده دیگر در برنامه نیست — حساب دیگری انتخاب کنید.', 'NO_ACCOUNT');
        throw new FenixError(s.accounts.length ? 'حساب‌ها نیاز به ورود دوباره دارند.' : 'اول با حساب فایرفاکس وارد شوید.', s.accounts.length ? 'SIGNED_OUT' : 'NO_ACCOUNT');
    }
    if (a.signedOut) throw new FenixError('این حساب خارج شده — در بخش «حساب‌ها» دوباره وارد شوید.', 'SIGNED_OUT');
    const quotaErr = () => new FenixError(a.quota && a.quota.reset && a.quota.reset * 1000 > Date.now()
        ? `حجم رایگان این ماهِ این حساب تمام شده است؛ موزیلا ${new Date(a.quota.reset * 1000).toLocaleDateString('fa-IR', { day: 'numeric', month: 'long' })} دوباره پرش می‌کند.`
        : 'حجم رایگان این ماهِ این حساب تمام شده است.', 'QUOTA');
    // Known to be used up, and the reading is recent: not even asked.
    if (exhausted(a) && Date.now() - ((a.quota && a.quota.at) || 0) < QUOTA_STALE_MS) throw quotaErr();
    const p = await pass(a.id);
    if (p.quota.remaining != null && p.quota.remaining < MIN_LEFT_BYTES) { noteQuota(a.id, p.quota); throw quotaErr(); }
    return { account: { id: a.id, email: a.email }, pass: p };
}

const quotaAsked = new Map();
/** Every signed-in account's numbers, read again (Android › refreshAll). Only the figures are kept. */
async function refreshQuotas({ force = false } = {}) {
    const out = [];
    for (const a of load().accounts) {
        if (a.signedOut) continue;
        if (!force && Date.now() - (quotaAsked.get(a.id) || 0) < QUOTA_GAP_MS) continue;
        quotaAsked.set(a.id, Date.now());
        try { await pass(a.id); out.push({ id: a.id, ok: true }); }
        catch (e) {
            if (e.code === 'CHALLENGE' || e.code === 'OFFLINE') throw e;
            out.push({ id: a.id, ok: false, error: e.message, code: e.code || null });
        }
    }
    return out;
}

// ── servers ───────────────────────────────────────────────────────────────────

function parseServers(json) {
    const out = new Map();
    for (const rec of (json && json.data) || []) {
        const c = rec.country || rec;
        const code = String(c.code || '').toUpperCase();
        if (!code || /anycast/i.test(c.name || '')) continue;
        for (const city of c.cities || []) {
            const s = (city.servers || []).find((x) => !x.quarantined && x.hostname && x.port > 0 && x.port < 65536);
            if (s && !out.has(code)) { out.set(code, { country: code, name: c.name || code, host: s.hostname, port: s.port }); break; }
        }
    }
    return [...out.values()];
}
async function servers(force = false) {
    const s = load();
    if (!force && s.servers && s.servers.length && Date.now() - s.serversAt < 12 * 3600 * 1000) return s.servers;
    try {
        const { data } = await call('GET', LIST_URL);
        const list = parseServers(data);
        if (list.length) { s.servers = list; s.serversAt = Date.now(); save(s); return list; }
    } catch (e) { /* the cache */ }
    return s.servers || [];
}
/** A full TLS handshake with the server — at one of its addresses, when given: proof it answers from here, and its cost. */
function handshakeMs(srv, timeoutMs = 4000, address = null) {
    return new Promise((resolve) => {
        const t0 = Date.now();
        const sock = tls.connect({ host: address || srv.host, port: srv.port, servername: srv.host, ALPNProtocols: ['h2'] });
        const done = (v) => { clearTimeout(t); try { sock.destroy(); } catch (e) { /* closed */ } resolve(v); };
        const t = setTimeout(() => done(null), timeoutMs);
        sock.once('secureConnect', () => done(Date.now() - t0));
        sock.once('error', () => done(null));
    });
}
const lookupAll = (host) => new Promise((r) => dns.lookup(host, { all: true, family: 4 }, (e, a) => r(e ? [] : a.map((x) => x.address))));
let net = { ping: handshakeMs, lookup: lookupAll };

async function pingAll(list, ping = net.ping) {
    const res = {};
    let i = 0;
    const worker = async () => { while (i < list.length) { const s = list[i++]; res[s.country] = (await ping(s)) ?? -1; } };
    await Promise.all(Array.from({ length: 6 }, worker));
    const st = load(); st.pings = Object.assign({}, st.pings, res, { at: Date.now() }); save(st);
    return res;
}

/**
 * Where to connect, as on the phone: up to three servers for the choice — the one asked for, or the
 * fastest measured from here (measured now when the last measurement is old) — each tried with a real
 * TLS handshake at its own addresses. The first address that answers is the path; the next one of the
 * same server, when there is one, waits behind it in the balancer. Resolves { server, paths } or null.
 */
async function findTarget(country = 'fastest') {
    const list = await servers();
    if (!list.length) throw new FenixError('فهرست سرورهای موزیلا گرفته نشد — اتصال اینترنت را بررسی کنید.', 'NO_SERVERS');
    let cands;
    if (country && country !== 'fastest') {
        cands = list.filter((x) => x.country === country);
        if (!cands.length) throw new FenixError('موزیلا در کشوری که انتخاب شده دیگر سروری ندارد — کشور دیگری انتخاب کنید.', 'NO_SERVER');
    } else {
        let s = load();
        const measured = () => list.some((x) => s.pings[x.country] > 0);
        if (!(s.pings.at > Date.now() - PINGS_FRESH_MS) || !measured()) { await pingAll(list); s = load(); }
        const p = s.pings;
        cands = list.filter((x) => p[x.country] > 0).sort((a, b) => p[a.country] - p[b.country]);
    }
    for (const srv of cands.slice(0, 3)) {
        const addrs = await net.lookup(srv.host);
        for (let k = 0; k < addrs.length; k++) {
            if ((await net.ping(srv, 4000, addrs[k])) == null) continue;
            // The standby is an address not yet tried — the ones before this one just failed.
            const standby = addrs[k + 1];
            return { server: srv, paths: standby ? [addrs[k], standby] : [addrs[k]] };
        }
    }
    return null;
}

// ── the config ────────────────────────────────────────────────────────────────

/**
 * One FENIX outbound. `http1`: HTTP/1.1 instead of HTTP/2 — a new TLS connection per stream, only the
 * fallback for a network that breaks HTTP/2 (Android › FenixConfig).
 */
function outbound(tag, srv, address, token, http1 = false) {
    return {
        tag, protocol: 'http',
        settings: { servers: [{ address, port: srv.port }], headers: { 'Proxy-Authorization': 'Bearer ' + token } },
        streamSettings: { network: 'tcp', security: 'tls', tlsSettings: { serverName: srv.host, alpn: [http1 ? 'http/1.1' : 'h2'], fingerprint: 'chrome' }, sockopt: { tcpKeepAliveIdle: 30, tcpKeepAliveInterval: 15 } },
    };
}
/**
 * The tunnel for the app's Xray: the server reached by one or two literal addresses behind a
 * balancer, TCP only — QUIC refused at once, other UDP dropped, the block page failed fast, LAN direct.
 *
 * Lookups that reach the engine (the full tunnel sends the machine's DNS here) are answered by Xray
 * itself over DoH THROUGH the tunnel, as on the phone: the proxy carries TCP only, so a plain UDP
 * query has no way out — and must not take one around it.
 */
function config(srv, addresses, token, { http1 = false } = {}) {
    const used = [...new Set(addresses)].slice(0, 2);
    const obs = used.map((a, i) => outbound('fenix-' + i, srv, a, token, http1));
    const to = used.length > 1 ? { balancerTag: 'fenix' } : { outboundTag: 'fenix-0' };
    return {
        log: { loglevel: 'warning' },
        inbounds: [{ tag: 'socks-in', port: 10808, listen: '127.0.0.1', protocol: 'socks', settings: { udp: true }, sniffing: { enabled: true, destOverride: ['http', 'tls'] } }],
        outbounds: [...obs, { tag: 'direct', protocol: 'freedom' }, { tag: 'dns-out', protocol: 'dns' }, { tag: 'blocked', protocol: 'blackhole' }],
        dns: { tag: 'fenix-dns', servers: ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query'], queryStrategy: 'UseIPv4' },
        ...(used.length > 1 ? { observatory: { subjectSelector: ['fenix-'], probeUrl: 'https://www.gstatic.com/generate_204', probeInterval: '1m' } } : {}),
        routing: {
            domainStrategy: 'AsIs',
            ...(used.length > 1 ? { balancers: [{ tag: 'fenix', selector: ['fenix-'], fallbackTag: 'fenix-0', strategy: { type: 'leastPing' } }] } : {}),
            rules: [
                { type: 'field', port: '53', outboundTag: 'dns-out' },
                Object.assign({ type: 'field', inboundTag: ['fenix-dns'] }, to),
                { type: 'field', ip: ['10.10.34.0/24'], outboundTag: 'blocked' },
                { type: 'field', ip: ['geoip:private'], outboundTag: 'direct' },
                { type: 'field', network: 'udp', outboundTag: 'blocked' },
                Object.assign({ type: 'field', network: 'tcp' }, to),
            ],
        },
    };
}

/**
 * Everything a connect needs, for (account, country | 'fastest'): the server and the paths to it (or
 * the ones given in `target`, for a renewal on the same server), the account with a fresh pass, and
 * the config. `onStep('server' | 'pass')` reports where it is.
 * Resolves { server, paths, account, token, pass:{issuedAt, expiresAt, quota}, http1, config }.
 */
async function prepare({ accountId = null, country = 'fastest', target = null, http1 = null, onStep = () => {} } = {}) {
    const s = load();
    if (!s.accounts.length) throw new FenixError('اول با حساب فایرفاکس وارد شوید.', 'NO_ACCOUNT');
    let tgt = target;
    if (!tgt) {
        onStep('server');
        tgt = await findTarget(country);
        if (!tgt) {
            throw new FenixError(country && country !== 'fastest'
                ? 'سرور موزیلا در این کشور از اینترنت شما جواب نداد — کشور دیگری را امتحان کنید.'
                : 'هیچ‌کدام از سرورهای موزیلا از اینترنت شما جواب ندادند.', 'SERVER_DOWN');
        }
    }
    onStep('pass');
    const { account, pass: p } = await pickAccount({ accountId });
    const h1 = http1 == null ? !!load().http1 : !!http1;
    return {
        server: tgt.server, paths: tgt.paths, account, token: p.token,
        pass: { issuedAt: p.issuedAt, expiresAt: p.expiresAt, quota: p.quota },
        http1: h1, config: config(tgt.server, tgt.paths, p.token, { http1: h1 }),
    };
}

/** The shape (HTTP/2 or HTTP/1.1) that carried data last time is tried first next time. */
function setHttp1(v) { const s = load(); if (!!s.http1 !== !!v) { s.http1 = !!v; save(s); } }
/** Where a country's server really came out (Cloudflare's trace), for the country list. */
function noteExit(country, loc) {
    if (!/^[A-Z]{2}$/.test(String(country || '')) || !/^[A-Z]{2}$/.test(String(loc || ''))) return;
    const s = load();
    if (s.exitSeen[country] === loc) return;
    s.exitSeen[country] = loc;
    save(s);
}

// ── the check window ──────────────────────────────────────────────────────────

/** Only Mozilla's own pages open in the check window. */
let MOZ_PAGE = /^https:\/\/([a-z0-9-]+\.)*(firefox\.com|mozilla\.(org|com))(\/|$)/i;
let customMozPage = null;

/** Strict Mozilla host validator checking exact domain or true subdomain suffix */
function isAllowedMozillaHost(host) {
    if (!host || typeof host !== 'string') return false;
    const h = host.toLowerCase().trim();
    const allowedDomains = ['firefox.com', 'mozilla.org', 'mozilla.com'];
    return allowedDomains.some((d) => h === d || h.endsWith('.' + d));
}

/** Strict Mozilla URL validator checking protocol, port, and hostname */
function isAllowedMozillaUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    if (customMozPage && typeof customMozPage.test === 'function') {
        return customMozPage.test(rawUrl);
    }
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'https:') return false;
        if (parsed.port && parsed.port !== '443') return false;
        return isAllowedMozillaHost(parsed.hostname);
    } catch {
        return false;
    }
}

/** Firefox Accounts' own site: the origin Mozilla's page calls its servers from. */
let ACCOUNTS_PAGE = /^https:\/\/accounts\.firefox\.com(\/|$)/i;
/**
 * Where a site's check is passed: the site's own page (Android › FenixAuth.checkPageHost), never an
 * API host's root. `https://api.accounts.firefox.com/` answers a browser with a blank 406 (the phone,
 * 6 Nov 2026): a window opened there showed nothing to pass, the call after it was refused again and
 * the window came back — «مدام میره برای تایید موزیلا و برمیگرده» (7 Nov). accounts.firefox.com
 * serves Fastly's real check.
 */
const checkPage = (host) => {
    const h = String(host || '').toLowerCase();
    // A Mozilla host of no known site (the server list's): its own page, as on the phone.
    return CHECK_PAGES[siteOf(h)] || (h && isAllowedMozillaHost(h) ? `https://${h}/` : CHECK_PAGES['firefox.com']);
};
/** What a page keeps besides cookies — wiped before and after each window, so no Mozilla session stays on disk. */
const PAGE_STORAGE = ['localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage', 'filesystem'];
/**
 * Read on the window's page every second, as JSON: its title (Fastly's check page is «Client
 * Challenge») and the verified session of the account Mozilla's page is signed in to — under the keys
 * Mozilla's own code keeps it (Android › FenixScreen.READ_SESSION_JS). A session still waiting for its
 * e-mailed code is marked unverified and is not taken.
 */
const WEBCHANNEL_HOOK_JS = `(function() {
  if (window.__foxyChannelHooked) return;
  window.__foxyChannelHooked = true;
  var onChannel = function(e) {
    var d = e.detail;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
    if (d && d.message) {
      var cmd = d.message.command;
      var data = d.message.data || {};
      var msgId = d.message.messageId;
      var id = d.id || 'account_updates';
      var reply = function(replyData) {
        var detail = { id: id, message: { messageId: msgId, command: cmd, data: replyData } };
        window.dispatchEvent(new CustomEvent('WebChannelMessageToContent', { detail: detail }));
        document.dispatchEvent(new CustomEvent('WebChannelMessageToContent', { detail: detail }));
      };
      if (cmd === 'fxaccounts:fxa_status') {
        reply({ capabilities: {}, signedInUser: null });
      } else if (cmd === 'fxaccounts:can_link_account') {
        reply({ ok: true });
      } else if (cmd === 'fxaccounts:login' || cmd === 'fxaccounts:oauth_login') {
        var isVer = (data.verified === true || data.sessionVerified === true);
        var tok = (data.sessionToken || data.token || '').trim();
        if (/^[0-9a-f]{64}$/i.test(tok)) {
          window.__fxaSessionToken = tok;
          window.__fxaSessionVerified = isVer;
        }
        if (data.email) window.__fxaEmail = data.email;
        if (msgId) reply({ ok: true });
      } else if (cmd === 'fxaccounts:verified' || cmd === 'fxaccounts:email_verified') {
        window.__fxaSessionVerified = true;
        if (msgId) reply({ ok: true });
      } else if (msgId) {
        reply({ ok: true });
      }
    }
  };
  window.addEventListener('WebChannelMessageToChrome', onChannel);
  document.addEventListener('WebChannelMessageToChrome', onChannel);
})();`;

const READ_PAGE_JS = `(function(){var o={t:String(document.title||''),e:'',s:''};try{
var a=JSON.parse(localStorage.getItem('__fxa_storage.accounts')||'{}')||{};
var u=JSON.parse(localStorage.getItem('__fxa_storage.currentAccountUid')||'null');
var x=(u&&a[u])||null;
if(!x){for(var k in a){if(a[k]&&a[k].sessionToken){x=a[k];break;}}}
if(x&&x.sessionToken&&x.verified!==false&&x.sessionVerified!==false){o.e=String(x.email||'');o.s=String(x.sessionToken);}
if(!o.s&&window.__fxaSessionToken&&window.__fxaSessionVerified===true){o.s=String(window.__fxaSessionToken);}
if(!o.e&&window.__fxaEmail&&o.s){o.e=String(window.__fxaEmail);}
}catch(e){}return JSON.stringify(o);})()`;

let checkOpen = null;   // the one check window at a time: { win, done }

// ── what Mozilla's page makes itself ──────────────────────────────────────────
//
// The token calls Fastly refuses from Node (always) and from a checked browser calling from no page
// at all (the phone on 6 Nov, here on 7 Nov) are the very calls Mozilla's own site makes all day: its
// sign-in page talks to api.accounts.firefox.com from accounts.firefox.com, and that works in this same
// window. So once the page is open and past its check, what waits for it is made BY the page: a
// `fetch` in the page, from its own origin, in its browser's own name — nothing about the request is set
// that the page would not set itself (no User-Agent, no Origin: the browser writes those). The window is
// on screen; the check is the person's to pass, never passed for them.

/** Runs `js` in the window's page and resolves what it returns (tests put a stand-in page here). */
let pageRun = (wc, js) => wc.executeJavaScript(js, true);

/** One call made by Mozilla's page in the window; its answer read as call() reads one. */
async function pageCall(wc, method, url, { json = null, session = null } = {}) {
    const text = json ? JSON.stringify(json) : '';
    const headers = {};
    if (json) headers['Content-Type'] = 'application/json';
    if (session) { const h = hawkCredentials(session); headers.Authorization = hawkHeader(method, url, h.id, h.key, Buffer.from(text, 'utf8')); }
    const init = Object.assign({ method, headers, cache: 'no-store' }, json ? { body: text } : {});
    const js = `(async function(){try{var r=await fetch(${JSON.stringify(url)},${JSON.stringify(init)});` +
        'var t=await r.text();return JSON.stringify({s:r.status,t:t.slice(0,262144),ra:r.headers.get(\'retry-after\')});}' +
        'catch(e){return JSON.stringify({s:-1,t:String((e&&e.message)||e)});}})()';
    let o;
    try { o = JSON.parse(await timed(pageRun(wc, js), 45000)); } catch (e) { o = { s: -1, t: String((e && e.message) || e) }; }
    const where = new URL(url);
    note(`page ${method} ${where.hostname}${where.pathname} → ${o && o.s > 0 ? o.s : 'no answer (' + String((o && o.t) || '').slice(0, 80) + ')'}`);
    if (!(o && o.s > 0)) throw new FenixError('صفحهٔ موزیلا به سرور خودش نرسید — اتصال اینترنت را بررسی کنید.', 'OFFLINE', { detail: String((o && o.t) || '') });
    return answerOf(o.s, o.t, where.hostname, { get: (k) => (String(k).toLowerCase() === 'retry-after' ? (o.ra || null) : null) });
}

/** Anything waiting for Mozilla's page: a page sign-in's grant, a refresh refused elsewhere, an access token near its end. */
function pageHasWork() {
    if (pending && pending.web) return true;
    if (needPage.size) return true;
    return load().accounts.some(dueForRefresh);
}

const UNVERIFIED_MSG = 'ورود هنوز با کد ایمیل موزیلا تأیید نشده بود — یک بار دیگر وارد شوید و کد ایمیل را هم همان‌جا بزنید.';
const REFUSED_AGAIN_MSG = 'موزیلا صدور توکن حساب را برای این برنامه بسته است (پاسخ ۴۰۶، حتی وقتی خود صفحهٔ موزیلا درخواست را می‌فرستد). حساب شما سالم است و از برنامه خارج نشده؛ این تصمیم سرور موزیلاست و با عوض کردن اینترنت یا وی‌پی‌ان حل نمی‌شود. فنیکس هر چند ساعت یک بار بی‌صدا دوباره امتحان می‌کند و اگر موزیلا باز کرد، خودش کار می‌کند.';
/** After Mozilla's own page was turned away, the window is not opened again for this long (the quiet tries go on). */
const REFUSED_HOLD_MS = 6 * 3600 * 1000;

/**
 * What waits for Mozilla's page, made by it: a page sign-in's token grant (`pending.web`), then a
 * refresh for every account whose refresh was refused elsewhere or whose access token ends soon.
 * Resolves { signedIn, refreshed: [ids], refused: FenixError|null, error: FenixError|null }.
 */
async function pageWork(wc) {
    const out = { signedIn: null, refreshed: [], refused: null, error: null };
    const p = pending;
    if (p && p.web) {
        try { await saveGrant(p, (await pageCall(wc, 'POST', AUTH + '/oauth/token', { session: p.session, json: GRANT_BODY })).data); out.signedIn = p.email; }
        catch (e) {
            if (e.errno === 138) { if (pending === p) pending = null; out.error = new FenixError(UNVERIFIED_MSG, 'UNVERIFIED'); }
            else if (e.code === 'CHALLENGE' || e.status === 406) {
                // If pageCall returned 406, try complete() with PKCE code exchange fallback
                try {
                    await complete();
                    out.signedIn = p.email;
                } catch (pkceErr) {
                    if (pkceErr.code === 'CHALLENGE') out.refused = pkceErr;
                    else out.error = pkceErr;
                }
            }
            else out.error = e;
        }
    }
    const ids = new Set([...needPage, ...load().accounts.filter(dueForRefresh).map((a) => a.id)]);
    for (const id of ids) {
        const a = load().accounts.find((x) => x.id === id);
        const t = a && !a.signedOut ? await tokens(a) : null;
        if (!t || !t.refresh) { needPage.delete(id); continue; }
        let last = null, refused = null;
        for (const url of PAGE_REFRESH_URLS()) {
            try {
                await keepTokens(id, (await pageCall(wc, 'POST', url, { json: refreshBody(t.refresh) })).data, t.refresh);
                out.refreshed.push(id);
                last = null; refused = null;
                break;
            } catch (e) {
                if (signedOutBy(e)) { markSignedOut(id); last = null; refused = null; break; }
                if (e.code === 'CHALLENGE') refused = e;
                last = e;
            }
        }
        // Mozilla's own refusal is the answer, whatever came after it: never «no network» in its place.
        if (refused) {
            out.refused = refused;
            // For the record only: does the page reach Mozilla's server AT ALL, or is it just the token
            // call that is turned away? (The account-status call is the one Mozilla's e-mail page makes.)
            try { await pageCall(wc, 'POST', AUTH + '/account/status', { json: { email: a.email } }); } catch (e) { /* written to fenix.log */ }
        } else if (last && !out.error) out.error = last;
    }
    return out;
}

/**
 * Mozilla's own page in a window of the app, for the person to pass Fastly's browser check on — never
 * imitated, never passed for them. `host` is the one that asked; the window opens on its SITE's page
 * (checkPage). `purpose` 'signin' opens the accounts' sign-in page instead, where signing in is the way
 * through — unless a sign-in made there already waits for its token: then that site's page.
 *
 * On accounts.firefox.com, once the page is open and past its check, what waits for it is made by the
 * page itself (pageWork): an account signed in to there gets its token grant, a refresh that waited is
 * made, and the window closes. A check page that has made way for the site's own closes the window too
 * (not a sign-in page — there the account is what the person came for); otherwise the person closes it.
 * From then on that site's other calls go by this window's browser. Resolves { signedIn: email } or
 * { closed: true, refreshed: n }; REFUSED_AGAIN when even Mozilla's page was turned away — said once,
 * plainly, instead of the window coming back for ever.
 */
async function challenge({ host = '', purpose = '' } = {}) {
    if (checkOpen) {
        try { if (checkOpen.win && !checkOpen.win.isDestroyed()) checkOpen.win.focus(); } catch (e) { /* closing */ }
        return checkOpen.done;
    }
    const b = browserSession();
    if (!b) throw new FenixError('بررسی مرورگر فقط در خود برنامه باز می‌شود.', 'NO_ELECTRON');
    const grantWaits = !!(pending && pending.web && host);
    const signIn = (purpose === 'signin' || purpose === 'code') && !grantWaits;
    if (signIn) {
        const s = load();
        if (s.refusedAt) {
            delete s.refusedAt;
            save(s);
        }
    }
    const page = signIn ? WEBCHANNEL_LOGIN_URL : checkPage(host);
    note(`window ${page} (asked by ${host || '-'}, ${signIn ? 'sign-in' : 'check'}${pageHasWork() ? ', page work waiting' : ''})`);
    const me = { win: null, done: null };
    checkOpen = me;
    me.done = (async () => {
        try {
            await b.ready;
            await solver.syncToElectronSession(b.ses).catch(() => {});
            // A clean page: a Mozilla session left from before is not taken for this one.
            await b.ses.clearStorageData({ storages: PAGE_STORAGE }).catch(() => {});
            const r = await checkWindow(me, b.ses, page, signIn);
            const s = load();
            s.checked = Object.assign({}, s.checked, { [siteOf(new URL(page).hostname)]: Date.now() });
            delete s.cookies;   // the old way — cookies copied into Node's calls — carried nothing
            save(s);
            // The session read from the page does not stay on disk.
            await b.ses.clearStorageData({ storages: PAGE_STORAGE }).catch(() => {});
            note(`window closed: ${r.signedIn ? 'signed in' : r.found ? 'account found' : 'no account'}, refreshed ${r.refreshed.length}${r.refused ? ', refused by the page too' : ''}${r.error ? ', ' + r.error.code : ''}`);
            return await settle(r);
        } finally { if (checkOpen === me) checkOpen = null; }
    })();
    return me.done;
}

/** What a closed check window comes to: { found, signedIn, refreshed, refused, error } → the answer. */
async function settle(r) {
    if (r.signedIn) return { signedIn: r.signedIn, refreshed: r.refreshed.length };
    if (r.error && r.error.code === 'UNVERIFIED') throw r.error;
    // An account signed in to on the page whose grant the page did not get to make: made here instead.
    if (r.found) {
        try {
            return { signedIn: await signInWithSession(r.found.email, r.found.session) };
        } catch (e) {
            if (e.code === 'CHALLENGE') r.refused = e;
            else throw e;
        }
    }
    // A page sign-in whose token grant Mozilla sent to its check, never made by the page: made here.
    if (pending && pending.web) {
        const em = pending.email;
        try {
            await complete();
            return { signedIn: em };
        } catch (e) {
            if (e.code === 'CHALLENGE') r.refused = e;
            else throw e;
        }
    }
    // Even Mozilla's own page was turned away: saying so beats opening the window again and again.
    if (r.refused) {
        if (!r.found && !(pending && pending.web)) {
            const s = load();
            s.refusedAt = Date.now();
            save(s);
        }
        throw new FenixError(REFUSED_AGAIN_MSG, 'REFUSED_AGAIN');
    }
    // The page could not make what waited for it at all (no answer from its own server): not a check.
    if (r.error && !r.refreshed.length) throw r.error;
    return { closed: true, refreshed: r.refreshed.length };
}

const isSession = (email, session) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || '').trim()) && /^[0-9a-f]{64}$/i.test(String(session || ''));

/** The window itself. Resolves { found, signedIn, refreshed, refused, error } (see settle). */
function checkWindow(me, ses, page, signIn, { show = true } = {}) {
    const { BrowserWindow } = require('electron');
    return new Promise((resolve) => {
        const parent = BrowserWindow.getFocusedWindow();
        const w = new BrowserWindow({
            width: 520, height: 760, title: signIn ? 'ورود به حساب فایرفاکس' : 'بررسی موزیلا', autoHideMenuBar: true, show,
            ...(parent ? { parent } : {}),
            webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false, sandbox: true },
        });
        me.win = w;
        const wc = w.webContents;
        // Only Mozilla's own pages, nothing else opens in this window.
        wc.setWindowOpenHandler(() => ({ action: 'deny' }));
        const onlyMozilla = (e, url) => {
            if (!isAllowedMozillaUrl(url)) {
                e.preventDefault();
            }
        };
        wc.on('will-navigate', onlyMozilla);
        wc.on('will-redirect', onlyMozilla);
        w.on('page-title-updated', (e) => e.preventDefault());
        wc.on('did-finish-load', () => { wc.executeJavaScript(WEBCHANNEL_HOOK_JS).catch(() => {}); });
        const r = { found: null, signedIn: null, refreshed: [], refused: null, error: null };
        let sawCheck = false, closing = false, looking = false, worked = false;
        const close = (ms) => { if (closing) return; closing = true; setTimeout(() => { if (!w.isDestroyed()) w.close(); }, ms); };
        const work = async () => {
            worked = true;
            const d = await pageWork(wc).catch((e) => ({ signedIn: null, refreshed: [], refused: null, error: e }));
            if (d.signedIn) r.signedIn = d.signedIn;
            r.refreshed.push(...d.refreshed);
            r.refused = d.refused || r.refused;
            r.error = d.error || r.error;
        };
        // Mozilla's single-page app moves between steps without new page loads, so the page is looked
        // at every second rather than on page events (Android does the same).
        const tick = setInterval(async () => {
            if (closing || looking || w.isDestroyed()) return;
            looking = true;
            wc.executeJavaScript(WEBCHANNEL_HOOK_JS).catch(() => {});
            try {
                let o = null;
                try { o = JSON.parse(await timed(wc.executeJavaScript(READ_PAGE_JS), 3000)); } catch (e) { o = null; }
                if (!o || closing || w.isDestroyed()) return;
                // Fastly's check page is told by its title: nothing is done on it but waiting for the person.
                if (/challenge/i.test(o.t)) { sawCheck = true; return; }
                const onAccounts = ACCOUNTS_PAGE.test(wc.getURL());
                if (o.s && o.e) {
                    const currentUrl = String(wc.getURL() || '');
                    // If the page is on a code entry / confirmation / verify step, DO NOT close the window!
                    if (/verify|confirm|enter_code|enter-code|two_factor/i.test(currentUrl)) {
                        return;
                    }
                    const isVer = await isSessionVerified(o.s);
                    if (!isVer) {
                        return; // Session still waiting for user to enter code in browser
                    }
                    r.found = { email: o.e, session: o.s };
                    // The grant, made by the page the account was signed in to.
                    if (onAccounts && isSession(o.e, o.s)) {
                        const session = String(o.s).toLowerCase();
                        if (!(pending && pending.web && pending.session === session)) pending = { email: String(o.e).trim(), session, verified: true, web: true };
                        await work();
                    }
                    close(0);
                    return;
                }
                const loaded = !wc.isLoadingMainFrame();
                if (!signIn && onAccounts && loaded && !worked && pageHasWork()) {
                    await work();
                    close(600);
                    return;
                }
                // The check page has made way for the site's own, loaded to the end: the check is behind us.
                if (sawCheck && !signIn && loaded) close(800);
            } finally { looking = false; }
        }, 1000);
        const cap = setTimeout(() => close(0), 15 * 60 * 1000);
        w.on('closed', () => { clearInterval(tick); clearTimeout(cap); resolve(r); });
        w.loadURL(page).catch(() => { /* the browser's own error page; the person closes it */ });
    });
}

function signOut(id) { const s = load(); s.accounts = s.accounts.filter((a) => a.id !== id); save(s); return true; }

function status() {
    const s = load();
    const nowMs = Date.now();
    return {
        accounts: s.accounts.map((a) => ({
            id: a.id, email: a.email, signedOut: !!a.signedOut, quota: a.quota || null,
            addedAt: a.addedAt || 0, exhausted: exhausted(a, nowMs),
        })),
        servers: (s.servers || []).map((x) => ({ country: x.country, name: x.name, ms: s.pings[x.country] ?? null })),
        pingsAt: Number(s.pings.at) || 0,
        serversAt: s.serversAt || 0,
        exitSeen: s.exitSeen,
        // The e-mail the code went to, so a reopened window lands on the code step, not the form. A
        // session taken from Mozilla's page has no code step.
        pending: pending && !pending.web ? { email: pending.email } : null,
        minLeft: MIN_LEFT_BYTES,
    };
}

module.exports = {
    authPw, hkdf, hawkCredentials, hawkHeader, claims, parseServers, config, outbound, exhausted, siteOf,
    signIn, verifyCode, cancelSignIn, signInWithSession, accessToken, pass, pickAccount, refreshQuotas, servers, pingAll, handshakeMs,
    findTarget, prepare, setHttp1, noteExit, challenge, signOut, status, FenixError, FILE, MIN_LEFT_BYTES, READ_PAGE_JS,
    checkPage, settle, pageWork, pageHasWork, checkWindow, REFRESH_URLS, PAGE_REFRESH_URLS, LOG_FILE, sanitizeLog,
    solver, WEBCHANNEL_HOOK_JS, WEBCHANNEL_LOGIN_URL,
    isAllowedMozillaUrl, isAllowedMozillaHost,
    _setFetch: (f) => { fetchImpl = f; }, _setNet: (n) => { net = Object.assign({ ping: handshakeMs, lookup: lookupAll }, n || {}); },
    _setBrowser: (f) => { browserFetch = f || browserFetchReal; browserStandIn = !!f; },
    // Tests: a stand-in for Mozilla's page (the script it is handed), and a stand-in Mozilla on loopback.
    _setPage: (f) => { pageRun = f || ((wc, js) => wc.executeJavaScript(js, true)); },
    _setHosts: (h) => {
        if (h.auth) AUTH = h.auth;
        if (h.oauth) OAUTH = h.oauth;
        if (h.accounts) {
            CHECK_PAGES['firefox.com'] = h.accounts;
            const base = h.accounts.replace(/\/$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            ACCOUNTS_PAGE = new RegExp('^' + base + '(/|$)', 'i');
        }
        if (h.mozPage) {
            MOZ_PAGE = h.mozPage;
            customMozPage = h.mozPage;
        }
    },
    _pending: () => pending,
    _needPage: () => [...needPage],
    _reset: () => { pending = null; quotaAsked.clear(); needPage.clear(); },
};
