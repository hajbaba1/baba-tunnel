// --- Fastly WAF Challenge Solver for Node.js / Electron ---
//
// Ports the Fastly Bot / WAF Challenge Solver from FoxyVPN (com.vauth.foxyvpn.data.FastlyChallengeSolver)
// to Node.js / Electron. Automatically solves Fastly's JavaScript challenges (PoW, PAT, clientmetrics)
// when Mozilla endpoints (accounts.firefox.com, api.accounts.firefox.com, oauth.accounts.firefox.com,
// vpn.mozilla.org) return HTTP 406, acquires Fastly clearance cookies, and injects them into outgoing
// requests and Electron browser sessions.

'use strict';

const crypto = require('crypto');

const POW_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CHALLENGE_PREFIX_REGEX = /\/_fs-ch-[A-Za-z0-9]+/;
const MAX_POST_BACK_ROUNDS = 8;
const HTML_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

const TARGET_HOSTS = [
    'api.accounts.firefox.com',
    'accounts.firefox.com',
    'oauth.accounts.firefox.com',
    'vpn.mozilla.org',
];

const FIREFOX_DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:158.0) Gecko/20100101 Firefox/158.0';
const DEFAULT_UA = FIREFOX_DESKTOP_UA;
const BROWSER_UA = FIREFOX_DESKTOP_UA;

class SimpleCookieJar {
    constructor() {
        this.cookies = new Map(); // key: domain:name:path -> cookie object
    }

    setCookie(cookieStr, requestUrl) {
        if (!cookieStr || typeof cookieStr !== 'string') return;
        const u = new URL(requestUrl);
        const parts = cookieStr.split(';').map((p) => p.trim());
        if (!parts.length || !parts[0]) return;
        const eqIdx = parts[0].indexOf('=');
        if (eqIdx === -1) return;
        const name = parts[0].slice(0, eqIdx).trim();
        const value = parts[0].slice(eqIdx + 1).trim();
        if (!name) return;

        let domain = u.hostname.toLowerCase();
        let path = '/';
        let secure = u.protocol === 'https:';
        let httpOnly = false;
        let expires = null;

        for (let i = 1; i < parts.length; i++) {
            const p = parts[i];
            const pEq = p.indexOf('=');
            const attrName = (pEq === -1 ? p : p.slice(0, pEq)).trim().toLowerCase();
            const attrVal = pEq === -1 ? '' : p.slice(pEq + 1).trim();
            if (attrName === 'domain') {
                domain = attrVal.replace(/^\./, '').toLowerCase();
            } else if (attrName === 'path') {
                path = attrVal || '/';
            } else if (attrName === 'secure') {
                secure = true;
            } else if (attrName === 'httponly') {
                httpOnly = true;
            } else if (attrName === 'expires') {
                const d = new Date(attrVal);
                if (!isNaN(d.getTime())) expires = d.getTime();
            } else if (attrName === 'max-age') {
                const maxAge = parseInt(attrVal, 10);
                if (!isNaN(maxAge)) expires = Date.now() + maxAge * 1000;
            }
        }

        const key = `${domain}:${name}:${path}`;
        this.cookies.set(key, { name, value, domain, path, secure, httpOnly, expires });
    }

    saveFromHeaders(headers, requestUrl) {
        if (!headers) return;
        let setCookies = [];
        if (typeof headers.getSetCookie === 'function') {
            setCookies = headers.getSetCookie();
        } else if (typeof headers.raw === 'function') {
            const raw = headers.raw();
            setCookies = raw['set-cookie'] || [];
        } else if (typeof headers.get === 'function') {
            const sc = headers.get('set-cookie');
            if (sc) setCookies = [sc];
        }
        for (const str of setCookies) {
            this.setCookie(str, requestUrl);
        }
    }

    getCookieHeader(url) {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        const now = Date.now();
        const cookieMap = new Map(); // name -> value (deduplicated by name)
        for (const [key, c] of this.cookies.entries()) {
            if (c.expires && c.expires < now) {
                this.cookies.delete(key);
                continue;
            }
            const d = c.domain.toLowerCase();
            if (host === d || host.endsWith('.' + d)) {
                cookieMap.set(c.name, c.value);
            }
        }
        const matched = [];
        for (const [name, val] of cookieMap.entries()) {
            matched.push(`${name}=${val}`);
        }
        return matched.join('; ');
    }

    snapshotAll() {
        const now = Date.now();
        const list = [];
        for (const [key, c] of this.cookies.entries()) {
            if (c.expires && c.expires < now) {
                this.cookies.delete(key);
                continue;
            }
            list.push({ ...c });
        }
        return list;
    }

    addCookie(cookie) {
        const key = `${cookie.domain}:${cookie.name}:${cookie.path}`;
        this.cookies.set(key, { ...cookie });
    }

    installChallengeCookies(sourceJar) {
        const list = sourceJar.snapshotAll();
        if (!list.length) return false;

        for (const c of list) {
            const hostClean = c.domain.replace(/^\./, '').toLowerCase();

            // 1. Save to origin domain
            this.addCookie({ ...c, domain: hostClean });

            // 2. If it belongs to firefox.com, save as wildcard domain cookie
            if (hostClean.endsWith('firefox.com')) {
                this.addCookie({ ...c, domain: 'firefox.com' });
            }

            // 3. Replicate clearance cookies across all Mozilla target hosts
            for (const targetHost of TARGET_HOSTS) {
                if (hostClean.endsWith('firefox.com') && targetHost.endsWith('firefox.com')) {
                    this.addCookie({ ...c, domain: targetHost });
                } else if (hostClean.endsWith('mozilla.org') && targetHost.endsWith('mozilla.org')) {
                    this.addCookie({ ...c, domain: targetHost });
                }
            }
        }
        return true;
    }

    async loadFromElectronSession(ses) {
        if (!ses || !ses.cookies || typeof ses.cookies.get !== 'function') return;
        try {
            const cookies = await ses.cookies.get({});
            for (const c of cookies) {
                const domain = (c.domain || '').replace(/^\./, '').toLowerCase();
                const path = c.path || '/';
                const key = `${domain}:${c.name}:${path}`;
                this.cookies.set(key, {
                    name: c.name,
                    value: c.value,
                    domain: c.domain || domain,
                    path: path,
                    secure: c.secure !== false,
                    httpOnly: !!c.httpOnly,
                    expires: c.expirationDate ? c.expirationDate * 1000 : null,
                });
            }
        } catch (e) {}
    }

    async syncToElectronSession(ses) {
        if (!ses || !ses.cookies || typeof ses.cookies.set !== 'function') return;
        const list = this.snapshotAll();
        for (const c of list) {
            try {
                const url = `https://${c.domain.replace(/^\./, '')}${c.path}`;
                await ses.cookies.set({
                    url,
                    name: c.name,
                    value: c.value,
                    domain: c.domain.startsWith('.') ? c.domain : undefined,
                    path: c.path,
                    secure: c.secure,
                    httpOnly: c.httpOnly,
                    expirationDate: c.expires ? Math.floor(c.expires / 1000) : undefined,
                });
            } catch (e) {
                // Ignore individual cookie sync errors
            }
        }
    }
}

const globalJar = new SimpleCookieJar();

function baseOrigin(prefixUrl) {
    const idx = prefixUrl.indexOf('/_fs-ch-');
    return idx > 0 ? prefixUrl.substring(0, idx) : prefixUrl;
}

function isChallengePage(text) {
    if (!text || typeof text !== 'string') return false;
    if (text.length < 1 || text.length > 2000000) return false;
    if (!CHALLENGE_PREFIX_REGEX.test(text)) return false;
    const lower = text.toLowerCase();
    return lower.includes('client challenge') || lower.includes('script.js') || lower.includes('fst-post-back');
}

function solvePow(base, targetHex) {
    if (!base || !targetHex) return null;
    const target = Buffer.from(targetHex, 'hex');
    if (target.length !== 32) return null;
    for (let i = 0; i < POW_ALPHABET.length; i++) {
        const a = POW_ALPHABET[i];
        for (let j = 0; j < POW_ALPHABET.length; j++) {
            const suffix = a + POW_ALPHABET[j];
            const hash = crypto.createHash('sha256').update(base + suffix, 'utf8').digest();
            if (hash.equals(target)) return suffix;
        }
    }
    return null;
}

function parseInitFromScript(script, prefix = '') {
    let pos = 0;
    const candidates = [];
    while (true) {
        const initIdx = script.indexOf('init(', pos);
        if (initIdx === -1) break;
        pos = initIdx + 5;
        while (pos < script.length && /\s/.test(script[pos])) pos++;
        if (script[pos] !== '[') continue;
        let depth = 0;
        let endBracket = -1;
        let inString = false;
        let quoteChar = '';
        let escaped = false;
        for (let i = pos; i < script.length; i++) {
            const ch = script[i];
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (inString) {
                if (ch === quoteChar) inString = false;
                continue;
            }
            if (ch === '"' || ch === "'") {
                inString = true;
                quoteChar = ch;
                continue;
            }
            if (ch === '[') depth++;
            else if (ch === ']') {
                depth--;
                if (depth === 0) {
                    endBracket = i;
                    break;
                }
            }
        }
        if (endBracket === -1) continue;
        const arrStr = script.substring(pos, endBracket + 1);
        const after = script.slice(endBracket + 1);
        const tokenMatch = after.match(/^\s*,\s*["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/);
        if (!tokenMatch) continue;
        try {
            const challenges = JSON.parse(arrStr);
            const token = tokenMatch[1];
            const scriptPrefix = tokenMatch[2] || '';
            if (Array.isArray(challenges) && challenges.length > 0 && challenges.length <= 16 && token) {
                if (challenges.every((c) => c && typeof c.ty === 'string')) {
                    candidates.push({ challenges, token, scriptPrefix });
                }
            }
        } catch (e) {}
    }
    if (!candidates.length) {
        throw new Error('Could not read Fastly challenge from script');
    }
    for (let i = candidates.length - 1; i >= 0; i--) {
        const c = candidates[i];
        if (!prefix || !c.scriptPrefix || c.scriptPrefix === prefix) {
            return { challenges: c.challenges, token: c.token };
        }
    }
    return { challenges: candidates[candidates.length - 1].challenges, token: candidates[candidates.length - 1].token };
}

function clientMetricsAnswer() {
    return {
        ty: 'clientmetrics',
        webdriver: false,
        bot_detection_result: {
            bot_detected: false,
            bot_kind: null,
        },
        browser_metrics: {
            client_data: '{}',
            error_trace: null,
        },
        detector_results: {},
        v: 2,
    };
}

async function fetchPat(fetchFn, prefixUrl, token, userAgent) {
    const patUrl = `${prefixUrl}/pat?token=${encodeURIComponent(token)}`;
    const origin = baseOrigin(prefixUrl);
    const headers = {
        Accept: 'text/plain',
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
        Origin: origin,
    };
    const res = await fetchFn(patUrl, {
        method: 'POST',
        headers,
        body: '',
    });
    if (res.status === 400 || res.status === 401) return '';
    if (!res.ok) throw new Error(`PAT request returned HTTP ${res.status}`);
    const text = await res.text();
    let json = {};
    try { json = JSON.parse(text); } catch (e) { throw new Error(`Could not parse PAT response: ${e.message}`); }
    const auth = json && json.auth ? String(json.auth) : '';
    if (!auth) throw new Error('Empty PAT auth token');
    return auth;
}

async function answerChallenge(fetchFn, prefixUrl, token, challenge, userAgent) {
    const ty = challenge.ty;
    const data = challenge.data || {};
    if (ty === 'pow') {
        const base = data.base || '';
        const hash = data.hash || '';
        const answer = solvePow(base, hash);
        if (!answer) throw new Error(`No proof-of-work solution found for base ${base}`);
        return {
            ty: 'pow',
            base,
            answer,
            hmac: data.hmac || '',
            expires: data.expires || '',
        };
    }
    if (ty === 'pat') {
        const auth = await fetchPat(fetchFn, prefixUrl, token, userAgent);
        return {
            ty: 'pat',
            auth,
        };
    }
    if (ty === 'clientmetrics') {
        return clientMetricsAnswer();
    }
    if (ty === 'captcha') {
        throw new Error('Firefox Accounts requires a CAPTCHA. Sign in again to continue.');
    }
    throw new Error(`Unsupported Fastly challenge type: ${ty}`);
}

async function fetchText(fetchFn, url, { accept = HTML_ACCEPT, userAgent = DEFAULT_UA, allowChallenge = false, jar = null } = {}) {
    const headers = {
        Accept: accept,
        'User-Agent': userAgent,
    };
    if (jar) {
        const cookies = jar.getCookieHeader(url);
        if (cookies) headers.Cookie = cookies;
    }
    const res = await fetchFn(url, { method: 'GET', headers });
    if (jar) {
        jar.saveFromHeaders(res.headers, url);
    }
    const text = await res.text();
    if (!res.ok && !(allowChallenge && isChallengePage(text))) {
        throw new Error(`Challenge page returned HTTP ${res.status}`);
    }
    return text;
}

async function solveChallengePage(page, base, userAgent, fetchFn, solverJar) {
    const pageUrl = `${base}/`;
    const prefixMatch = page.match(CHALLENGE_PREFIX_REGEX);
    if (!prefixMatch) {
        throw new Error(`Challenge asset prefix not found on ${base}`);
    }
    const prefix = prefixMatch[0];
    const prefixUrl = base + prefix;

    const script = await fetchText(fetchFn, `${prefixUrl}/script.js?reload=true`, { userAgent, jar: solverJar });
    let { challenges, token } = parseInitFromScript(script, prefix);

    for (let round = 0; round < MAX_POST_BACK_ROUNDS; round++) {
        const answers = [];
        for (let i = 0; i < challenges.length; i++) {
            const ans = await answerChallenge(fetchFn, prefixUrl, token, challenges[i], userAgent);
            answers.push(ans);
        }

        const postBody = JSON.stringify({ token, data: answers });
        const postHeaders = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': userAgent,
            Origin: baseOrigin(prefixUrl),
        };
        const cookies = solverJar.getCookieHeader(`${prefixUrl}/fst-post-back`);
        if (cookies) postHeaders.Cookie = cookies;

        const res = await fetchFn(`${prefixUrl}/fst-post-back`, {
            method: 'POST',
            headers: postHeaders,
            body: postBody,
        });

        solverJar.saveFromHeaders(res.headers, `${prefixUrl}/fst-post-back`);

        if (!res.ok) {
            throw new Error(`Challenge post-back returned HTTP ${res.status}`);
        }

        const text = await res.text();
        let body = {};
        try { body = JSON.parse(text); } catch (e) { body = {}; }

        if (body.status === 'success') {
            const verificationPage = await fetchText(fetchFn, pageUrl, { userAgent, allowChallenge: true, jar: solverJar });
            if (isChallengePage(verificationPage)) {
                throw new Error('Challenge cookie not accepted on this exit IP');
            }
            globalJar.installChallengeCookies(solverJar);
            return true;
        }

        const nextChallenges = body.ch;
        const nextToken = body.tok;
        if (!Array.isArray(nextChallenges) || !nextChallenges.length || !nextToken) {
            throw new Error('Unexpected challenge post-back response format');
        }
        challenges = nextChallenges;
        token = nextToken;
    }

    throw new Error(`Fastly challenge did not complete within ${MAX_POST_BACK_ROUNDS} rounds`);
}

async function solveChallengeOnHost(base, userAgent, fetchFn) {
    const solverJar = new SimpleCookieJar();
    const pageUrl = `${base}/`;
    let page;
    try {
        page = await fetchText(fetchFn, pageUrl, { userAgent, allowChallenge: true, jar: solverJar });
    } catch (e) {
        return false;
    }
    if (!isChallengePage(page)) {
        return false;
    }
    await solveChallengePage(page, base, userAgent, fetchFn, solverJar);
    return true;
}

let solveMutex = Promise.resolve();

async function solveAndInstall({ challengedBody = null, challengedOrigin = null, userAgent = DEFAULT_UA, fetchFn = fetch } = {}) {
    // Serialized execution to avoid concurrent solves
    const currentMutex = solveMutex;
    let release;
    solveMutex = new Promise((resolve) => { release = resolve; });

    try {
        await currentMutex;

        const originUrl = new URL(challengedOrigin || 'https://api.accounts.firefox.com');
        const host = originUrl.hostname.toLowerCase();
        const base = `https://${host}`;

        // 1. If we already have a challenged HTML page, solve it directly
        if (challengedBody && isChallengePage(challengedBody)) {
            const solverJar = new SimpleCookieJar();
            await solveChallengePage(challengedBody, base, userAgent, fetchFn, solverJar);
            return true;
        }

        // 2. Otherwise probe potential challenge hosts
        const bases = [
            base,
            'https://accounts.firefox.com',
            'https://api.accounts.firefox.com',
            'https://vpn.mozilla.org',
        ].filter((v, i, a) => a.indexOf(v) === i);

        const uas = [userAgent, BROWSER_UA].filter((v, i, a) => a.indexOf(v) === i);

        let lastError = null;
        for (const candidateBase of bases) {
            for (const candidateUA of uas) {
                try {
                    const ok = await solveChallengeOnHost(candidateBase, candidateUA, fetchFn);
                    if (ok) return true;
                } catch (e) {
                    lastError = e;
                }
            }
        }

        if (lastError) throw lastError;
        return false;
    } finally {
        release();
    }
}

module.exports = {
    SimpleCookieJar,
    globalJar,
    isChallengePage,
    solvePow,
    parseInitFromScript,
    clientMetricsAnswer,
    solveAndInstall,
    solveChallengeOnHost,
    solveChallengePage,
    getCookieHeader: (url) => globalJar.getCookieHeader(url),
    saveCookiesFromResponse: (headers, url) => globalJar.saveFromHeaders(headers, url),
    syncToElectronSession: (ses) => globalJar.syncToElectronSession(ses),
    loadFromElectronSession: (ses) => globalJar.loadFromElectronSession(ses),
};
