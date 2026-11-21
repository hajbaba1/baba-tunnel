// --- «FENIX» — the window (fenix.js and fenix-session.js are the server's half) ---
//
// Firefox's own VPN with the user's own Firefox account, on the engine page every other connection
// window uses (ui/page-kit.css › Engine page — the anatomy of سایفون and وایرگارد): an inset glass
// sidebar, a stage with the one power button and the live chart, the choices as cards under it, and
// each choice's paragraphs in a section of its own. No native <select> anywhere: the country is the
// page's own searchable list with real flags, everything else is a row.
//
// The connection itself lives in the server (fenix-session.js). This window asks it to connect or
// stop, draws what it reports, and applies the path the user chose — پروکسی کل سیستم, تونل کامل or
// فقط پورت محلی — through the same /api/v2ray routes every Xray window uses. Closing or reloading the
// window changes nothing about the connection, and the pass is renewed whether or not it is open.
//
// Renders into #ls-fenix. Talks to /api/fenix/*, /api/v2ray/tun and /api/v2ray/sysproxy.

(function () {
    'use strict';

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    /** Persian digits, and ٫ for the decimal mark: a Latin dot beside Persian digits reads as a full stop. */
    const fa = (n) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]).replace(/(\d|[۰-۹])\.(?=\d|[۰-۹])/g, '$1٫');
    const $ = (id) => document.getElementById(id);

    // ── What the page offers ───────────────────────────────────────────────

    const SECS = [
        { id: 'connect', label: 'اتصال', icon: 'ph-fill ph-power', tint: 'var(--mv-green)' },
        { id: 'accounts', label: 'حساب‌ها', icon: 'ph-fill ph-user-circle', tint: 'var(--mv-indigo)' },
        { id: 'region', label: 'کشور خروج', icon: 'ph-fill ph-flag-banner', tint: 'var(--mv-pink, #FF2D55)' },
        { id: 'coverage', label: 'پوشش', icon: 'ph-fill ph-globe-hemisphere-east', tint: 'var(--mv-orange)' },
        { id: 'guide', label: 'راهنما', icon: 'ph-fill ph-question', tint: 'var(--mv-gray)' },
        { id: 'log', label: 'گزارش', icon: 'ph-fill ph-terminal-window', tint: 'var(--mv-gray)' },
        { id: 'about', label: 'درباره', icon: 'ph-fill ph-info', tint: 'var(--mv-accent)' },
    ];
    const SEC_TITLE = { connect: 'اتصال', accounts: 'حساب‌ها', region: 'کشور خروج', coverage: 'پوشش', guide: 'راهنما', log: 'گزارش', about: 'درباره' };

    /**
     * How much of the machine FENIX covers. The same three words سایفون and تور use, because it is
     * the same choice: one connection, carried three ways — decided before connecting, changeable after.
     */
    const COVERAGE = [
        { id: 'proxy', title: 'فقط پورت محلی', short: 'ویندوز دست نمی‌خورد؛ فقط برنامه‌ای که خودتان تنظیم کنید', icon: 'ph-plugs-connected' },
        { id: 'system', title: 'پروکسی کل سیستم', short: 'مرورگرها و برنامه‌هایی که پروکسی ویندوز را می‌خوانند', icon: 'ph-browsers' },
        { id: 'tunnel', title: 'تونل کامل سیستم', short: 'همهٔ برنامه‌ها، بدون تنظیم کردن هیچ‌کدام', icon: 'ph-globe-hemisphere-east' },
    ];

    /** The connect, in the order the server walks it (fenix-session.js), and the path last. */
    const STEPS = [
        { id: 'server', label: 'پیدا کردن سرور' },
        { id: 'pass', label: 'گرفتن پاس از موزیلا' },
        { id: 'tunnel', label: 'راه‌اندازی موتور' },
        { id: 'check', label: 'آزمایش عبور داده' },
        { id: 'route', label: 'تنظیم مسیر ترافیک' },
    ];

    // ── State ──────────────────────────────────────────────────────────────

    const st = {
        data: null,            // the last GET /api/fenix
        loadErr: '',
        sec: 'connect',
        busy: '',              // the one request in flight that is not a connect: web | signin | code | cancel | challenge | ping | quota | signout
        connecting: false,     // our own connect request is open
        stopping: false,
        routing: false,        // the chosen path is being put in place
        attempt: 0,
        err: '', errCode: '',  // the last action's failure
        tunError: '',
        note: '',              // a one-off sentence for the accounts section
        adding: false,         // the sign-in form is open beside existing accounts
        challenge: false,      // Mozilla asked for its browser check
        challengeHost: '',     // which of Mozilla's sites asked: its own page is the one opened
        retry: '',             // what to run again once the check is passed
        form: { email: '', pass: '', code: '' },
        ccOpen: false, ccQuery: '',
        serversAsked: false, quotaAskedAt: 0,
        log: [],
    };

    const PREF = 'fenix_prefs';
    const store = () => window.PersistentStorage || localStorage;
    /** The choices for the next connect. An older build kept `route` («proxy» meant Windows' proxy). */
    function prefs() {
        let p = {};
        try { p = JSON.parse(store().getItem(PREF) || '{}') || {}; } catch (e) { p = {}; }
        const coverage = ['proxy', 'system', 'tunnel'].includes(p.coverage) ? p.coverage
            : p.route === 'tunnel' ? 'tunnel' : 'system';
        return { country: /^[A-Z]{2}$/.test(p.country || '') ? p.country : 'fastest', account: /^[0-9a-f]{10}$/.test(p.account || '') ? p.account : '', coverage };
    }
    function setPrefs(patch) {
        try { store().setItem(PREF, JSON.stringify(Object.assign({}, prefs(), patch))); } catch (e) { /* this session only */ }
    }

    const D = () => st.data || {};
    /** The account the next connect uses: the one picked here while it is signed in, else the first signed-in one. */
    function activeAccountId() {
        const ins = (D().accounts || []).filter((a) => !a.signedOut);
        const want = prefs().account;
        return (ins.find((a) => a.id === want) || ins[0] || {}).id || '';
    }
    const session = () => (st.data && st.data.session) || { phase: 'off' };
    const accounts = () => (D().accounts || []);
    const signedIn = () => accounts().filter((a) => !a.signedOut);

    /** Connected as far as the server is concerned (a renewal restarting the engine still counts). */
    const isOn = () => { const p = session().phase; return p === 'on' || p === 'renewing'; };
    /** Something is moving: the power button means «cancel», and the poll speeds up. */
    const isBusy = () => {
        const s = session();
        return st.connecting || st.stopping || st.routing || s.phase === 'connecting' || s.phase === 'stopping' || (s.phase === 'on' && !s.live);
    };

    // ── Small helpers ──────────────────────────────────────────────────────

    let REGION_NAMES = null;
    function countryName(cc) {
        const code = String(cc || '').toUpperCase();
        if (!code) return '';
        try {
            REGION_NAMES = REGION_NAMES || new Intl.DisplayNames(['fa'], { type: 'region' });
            const n = REGION_NAMES.of(code);
            if (n && n !== code) return n;
        } catch (e) { /* no Intl data: the code itself is the honest answer */ }
        return code;
    }
    /**
     * A flag as a bundled SVG, never as an emoji: Windows has no glyphs for regional-indicator pairs,
     * so an emoji flag renders as two boxed letters (fronts.js › flag). The code sits behind the
     * image, so a country with no file still reads as «PT» rather than as a hole.
     */
    function flag(cc, w = 19) {
        const h = Math.round(w * 0.72);
        if (!cc) return `<span class="mv-flag is-none" style="width:${w}px;height:${h}px"></span>`;
        const code = String(cc).toLowerCase();
        return `<span class="mv-flag" style="width:${w}px;height:${h}px">${esc(String(cc).toUpperCase())}<img src="/assets/flags/${esc(code)}.svg" alt="" onerror="this.remove()"></span>`;
    }
    /** «سریع‌ترین» has no country, so it gets a mark of its own in the flag's place. */
    const fastMark = (w = 19) => `<span class="fnx-fast" style="width:${w}px;height:${Math.round(w * 0.72)}px"><i class="ph-fill ph-lightning"></i></span>`;
    const gb = (b) => (b == null ? '—' : fa((b / 1073741824).toFixed(b >= 10 * 1073741824 ? 0 : 1)));
    const ms = (v) => `${fa(v)} میلی‌ثانیه`;
    function ago(t) {
        if (!t) return '';
        const m = Math.max(0, Math.round((Date.now() - t) / 60000));
        if (m < 1) return 'همین حالا';
        if (m < 60) return `${fa(m)} دقیقه پیش`;
        const h = Math.round(m / 60);
        return h < 48 ? `${fa(h)} ساعت پیش` : `${fa(Math.round(h / 24))} روز پیش`;
    }
    /** How long something has been going: «۵ دقیقه», «۲ ساعت». */
    function dur(t) {
        const m = Math.max(0, Math.round((Date.now() - t) / 60000));
        if (m < 1) return 'تازه وصل شد';
        if (m < 60) return `${fa(m)} دقیقه`;
        const h = Math.floor(m / 60);
        return h < 48 ? `${fa(h)} ساعت${m % 60 ? ` و ${fa(m % 60)} دقیقه` : ''}` : `${fa(Math.round(h / 24))} روز`;
    }
    /** «۱۲ آبان»: the refill date in the Persian calendar, as the phone shows it. */
    function faDate(unixS) {
        try { return new Date(unixS * 1000).toLocaleDateString('fa-IR', { day: 'numeric', month: 'long' }); } catch (e) { return ''; }
    }
    const email = (e) => `<bdi class="fnx-email" dir="ltr">${esc(e || '—')}</bdi>`;
    const spin = () => '<i class="mv-spin-ring" aria-hidden="true"></i>';

    async function api(p, body) {
        const headers = { 'x-fenix-token': window.__FENIX_TOKEN__ || '' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const r = await fetch('/api/' + p, {
            method: body !== undefined ? 'POST' : 'GET',
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.error) {
            const e = new Error(d.error || `برنامه جواب نداد (کد ${fa(r.status)}).`);
            e.code = d.code || null;
            e.host = d.host || null;
            throw e;
        }
        return d;
    }

    function log(line) {
        const t = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        st.log.push(`${t}  ${line}`);
        if (st.log.length > 300) st.log = st.log.slice(-300);
        if (st.sec === 'log') renderLog();
    }

    // ── The page ───────────────────────────────────────────────────────────

    const CSS = `
<style id="fnx-css">
  .fnx-wrap { height:100%; min-height:0; }
  /* The kit gives forms and sections display:flex, which beats the hidden attribute on its own. */
  .fnx-wrap [hidden] { display:none !important; }
  .fnx-wrap .fnx-log {
    margin:0; width:100%; min-height:220px; max-height:none; overflow:auto;
    font-family:var(--mv-font-mono); font-size:11.5px; line-height:1.8;
    white-space:pre-wrap; word-break:break-word; color:var(--mv-label-2);
  }
  .fnx-wrap .fnx-fast {
    flex:none; display:inline-grid; place-items:center; border-radius:3px; font-size:10px; color:#FFFFFF;
    background:linear-gradient(180deg, color-mix(in srgb, var(--mv-orange) 84%, #FFFFFF), color-mix(in srgb, var(--mv-orange) 88%, #000));
  }
  .fnx-wrap .fnx-email {
    font-family:var(--mv-font-tech); font-weight:600; unicode-bidi:isolate;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%;
  }
  .fnx-wrap .mv-eng-pick-text b .fnx-email, .fnx-wrap .mv-form-label .fnx-email { display:inline-block; vertical-align:bottom; }
  /* One account: its address and state on the first line, the month's allowance as a bar under it. */
  .fnx-wrap .fnx-acct { display:flex; flex-direction:column; gap:7px; padding:12px 14px; }
  .fnx-wrap .fnx-acct + .fnx-acct { box-shadow:inset 0 var(--mv-hl) 0 var(--mv-group-sep); }
  .fnx-wrap .fnx-acct-top { display:flex; align-items:center; gap:8px; min-width:0; }
  .fnx-wrap .fnx-acct-top > .fnx-email { flex:0 1 auto; font-size:13px; }
  .fnx-wrap .fnx-acct-top > .fnx-acct-end { margin-inline-start:auto; display:flex; align-items:center; gap:6px; flex:none; }
  .fnx-wrap .fnx-acct small { font-size:11.5px; line-height:1.75; color:var(--mv-label-2); }
  .fnx-wrap .fnx-acct small.is-dim { color:var(--mv-label-3); }
  .fnx-wrap .fnx-bar { height:6px; border-radius:3px; overflow:hidden; background:color-mix(in srgb, var(--mv-label) 13%, transparent); }
  .fnx-wrap .fnx-bar > i { display:block; height:100%; border-radius:3px; background:var(--mv-green); transition:width .3s ease; }
  .fnx-wrap .fnx-bar.is-low > i { background:var(--mv-orange); }
  /* The live connection, as facts: a label column and a value column. */
  .fnx-wrap .fnx-kv { display:grid; grid-template-columns:auto minmax(0, 1fr); gap:7px 14px; padding:2px 6px 4px; font-size:12px; align-items:center; }
  .fnx-wrap .fnx-kv > dt { margin:0; color:var(--mv-label-2); white-space:nowrap; }
  .fnx-wrap .fnx-kv > dd { margin:0; min-width:0; display:flex; align-items:center; gap:6px; font-weight:600; color:var(--mv-label); }
  .fnx-wrap .fnx-kv > dd > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .fnx-wrap .fnx-kv > dd.is-warn { color:var(--mv-orange-ink); }
  .fnx-wrap .fnx-kv code { font-family:var(--mv-font-tech); font-size:11.5px; font-weight:500; color:var(--mv-label-2); }
  /* The sign-in form: fields stacked, the action under them, as a macOS sheet lays them out. */
  .fnx-wrap .fnx-form { display:flex; flex-direction:column; gap:12px; padding:14px; container-type:inline-size; }
  .fnx-wrap .fnx-fields { display:grid; grid-template-columns:minmax(0, 1fr); gap:12px; }
  @container (min-width: 620px) { .fnx-wrap .fnx-fields { grid-template-columns:minmax(0, 1fr) minmax(0, 1fr); } }
  .fnx-wrap .fnx-fld.is-code { max-width:300px; }
  .fnx-wrap .fnx-fld { display:flex; flex-direction:column; gap:6px; }
  .fnx-wrap .fnx-fld > span { font-size:12px; font-weight:600; color:var(--mv-label-2); }
  .fnx-wrap .fnx-fld > .mv-field { height:32px; font-size:13.5px; }
  .fnx-wrap .fnx-fld > .mv-field[dir="ltr"] { text-align:left; }
  .fnx-wrap .fnx-code { letter-spacing:.32em; text-align:center !important; font-size:18px !important; height:40px !important; font-family:var(--mv-font-tech); }
  .fnx-wrap .fnx-act { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .fnx-wrap .fnx-act > .mv-btn--primary { min-width:96px; }
  .fnx-wrap .fnx-sent { font-size:12.5px; line-height:1.9; color:var(--mv-label-2); }
  .fnx-wrap .fnx-sent b { color:var(--mv-label); }
  .fnx-wrap .fnx-callout-act { margin-top:8px; display:flex; gap:8px; flex-wrap:wrap; }
  /* The country measurement: one button, or its progress, over the list. */
  .fnx-wrap .fnx-sweep { display:flex; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap; }
  .fnx-wrap .fnx-sweep > small { font-size:11.5px; color:var(--mv-label-2); }
  .fnx-wrap .mv-eng-cc-row .fnx-ms { margin-inline-start:auto; font-size:11px; font-weight:620; font-variant-numeric:tabular-nums; white-space:nowrap; color:var(--mv-label-2); }
  .fnx-wrap .mv-eng-cc-row .fnx-ms.is-good { color:var(--mv-green-ink, var(--mv-green)); }
  .fnx-wrap .mv-eng-cc-row .fnx-ms.is-bad { color:var(--mv-label-3); font-weight:500; }
  .fnx-wrap .mv-eng-cc-row > .fnx-ms + i { margin-inline-start:7px; }
  /* In its own section the country list uses the width: rows flow into columns instead of one row
     stretched across a maximised window with the name at one edge and the time at the other. */
  .fnx-wrap .mv-eng-sec[data-sec="region"] .mv-eng-cc-rows { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:4px 8px; }
  .fnx-wrap .mv-eng-sec[data-sec="region"] .mv-eng-cc-rows > .mv-eng-cc-row[data-cc="fastest"],
  .fnx-wrap .mv-eng-sec[data-sec="region"] .mv-eng-cc-rows > .mv-eng-cc-empty { grid-column:1 / -1; }
  .fnx-wrap .fnx-guide { font-size:12.5px; line-height:1.95; color:var(--mv-label); }
  .fnx-wrap .fnx-guide h4 { margin:14px 0 6px; font-size:12.5px; font-weight:700; }
  .fnx-wrap .fnx-guide h4:first-child { margin-top:0; }
  .fnx-wrap .fnx-guide p { margin:0 0 8px; color:var(--mv-label-2); }
  .fnx-wrap .fnx-guide ol, .fnx-wrap .fnx-guide ul { margin:0 0 8px; padding-inline-start:1.35em; color:var(--mv-label-2); }
  .fnx-wrap .fnx-guide ol { list-style:persian; }
  .fnx-wrap .fnx-guide ul { list-style:disc; }
  .fnx-wrap .fnx-guide li { margin:3px 0; }
  .fnx-wrap .fnx-guide b { color:var(--mv-label); }
</style>`;

    function template() {
        return CSS + `
<div id="fnx-wrap" dir="rtl" class="fnx-wrap mv-split">
  <aside class="mv-side" aria-label="بخش‌های FENIX">
    <div class="mv-side-top"></div>
    <div class="mv-eng-ident" id="fnx-ident"></div>
    <nav class="mv-side-list">
      <div class="mv-side-group">
        ${SECS.map((x) => `
        <button type="button" class="mv-side-item" data-sec="${x.id}">
          <span class="mv-side-tile" style="--tint:${x.tint}"><i class="${x.icon}"></i></span><span>${esc(x.label)}</span>
        </button>`).join('')}
      </div>
    </nav>
  </aside>

  <section class="mv-pane">
    <header class="mv-pane-bar">
      <div class="mv-pane-nav" role="group" aria-label="پیمایش بخش‌ها">
        <button type="button" id="fnx-back" aria-label="بخش قبلی" title="بخش قبلی" disabled><i class="ph-bold ph-caret-right"></i></button>
      </div>
      <h1 class="mv-pane-title" id="fnx-title">اتصال</h1>
      <div class="mv-eng-bar-action" id="fnx-bar-action"></div>
    </header>

    <div class="mv-pane-scroll custom-scrollbar">

      <div class="mv-eng-sec is-on" data-sec="connect">
        <div class="mv-eng-stage" id="fnx-stage" style="--tint:var(--mv-orange)"></div>
        <div class="mv-route-chips"></div>
        <div class="mv-eng-flow" id="fnx-steps-sec" style="display:none"><div class="mv-steps" id="fnx-steps"></div></div>
        <div class="mv-form mv-eng-adv" id="fnx-home-callout" hidden><div class="mv-form-section is-wide"><div class="mv-form-group"></div></div></div>
        <div class="mv-form mv-eng-adv" id="fnx-home-signin" hidden>
          <div class="mv-form-section is-wide">
            <div class="mv-form-header">ورود با حساب فایرفاکس</div>
            <div class="mv-form-group" id="fnx-home-form"></div>
            <div class="mv-form-footer">رمز شما به این برنامه نمی‌رسد: ورود در صفحهٔ خود موزیلا انجام می‌شود و برنامه فقط توکن حساب را برمی‌دارد، رمزشده روی همین کامپیوتر. حساب فایرفاکس ندارید؟ در همان صفحه رایگان بسازید.</div>
          </div>
        </div>
        <div class="mv-eng-grid" id="fnx-cards"></div>
        <div class="mv-form mv-eng-adv">
          <div class="mv-form-section is-wide">
            <div class="mv-form-header">تنظیمات پیشرفته</div>
            <div class="mv-form-group" id="fnx-adv"></div>
            <div class="mv-form-footer">انتخاب اشتباه بین این دو پورت یعنی «هیچ دیتایی رد نمی‌شود»: پورت SOCKS به برنامه‌ای که HTTP حرف می‌زند جواب نمی‌دهد.</div>
          </div>
        </div>
      </div>

      <div class="mv-eng-sec" data-sec="accounts"><div class="mv-form" id="fnx-accounts"></div></div>

      <div class="mv-eng-sec" data-sec="region">
        <div class="mv-form">
          <div class="mv-form-section">
            <div class="mv-form-header">کشور خروج</div>
            <div class="mv-form-group"><div class="mv-form-row is-stack"><div id="fnx-region"></div></div></div>
            <div class="mv-form-footer">موزیلا در هر کشور یک سرور روی شبکهٔ Fastly دارد. عدد کنار هر کشور زمان یک دست‌دادن کامل TLS با همان سرور از اینترنت شماست — نه پینگ — و «سریع‌ترین» از روی همین سنجش انتخاب می‌شود؛ اگر سنجش قدیمی باشد، هنگام اتصال تازه می‌شود. جایی که خروج واقعی کشور دیگری بوده، کنارش نوشته شده.</div>
          </div>
        </div>
      </div>

      <div class="mv-eng-sec" data-sec="coverage">
        <div class="mv-form">
          <div class="mv-form-section">
            <div class="mv-form-header">پوشش</div>
            <div class="mv-form-group" id="fnx-coverage" role="radiogroup"></div>
            <div class="mv-form-footer" id="fnx-coverage-note"></div>
          </div>
        </div>
      </div>

      <div class="mv-eng-sec" data-sec="guide"><div class="mv-form" id="fnx-guide"></div></div>

      <div class="mv-eng-sec" data-sec="log">
        <div class="mv-form">
          <div class="mv-form-section is-wide">
            <div class="mv-form-header">گزارش</div>
            <div class="mv-form-group"><div class="mv-form-row is-stack"><pre class="fnx-log" id="fnx-log"></pre></div></div>
            <div class="mv-form-footer">کارهایی که این پنجره انجام داد، به ترتیب. گزارش خود موتور Xray در «کنسول» است.</div>
          </div>
        </div>
      </div>

      <div class="mv-eng-sec" data-sec="about"><div class="mv-form" id="fnx-about"></div></div>

    </div>

    <div class="mv-eng-foot" id="fnx-foot"></div>
  </section>
</div>`;
    }

    /** Show one section, and keep the sidebar, the title and the buttons in step. */
    function goSec(sec) {
        const wrap = $('fnx-wrap');
        if (!wrap) return;
        st.sec = SECS.some((x) => x.id === sec) ? sec : 'connect';
        wrap.querySelectorAll('.mv-eng-sec').forEach((n) => n.classList.toggle('is-on', n.getAttribute('data-sec') === st.sec));
        wrap.querySelectorAll('.mv-side-item[data-sec]').forEach((b) => b.classList.toggle('active', b.getAttribute('data-sec') === st.sec));
        // Home carries no bar (engine-page rule): its band stays, the window's drag bar lies over it.
        const pane = wrap.querySelector('.mv-pane');
        if (pane) pane.classList.toggle('is-home', st.sec === 'connect');
        const title = $('fnx-title');
        if (title) title.textContent = SEC_TITLE[st.sec] || '';
        const back = $('fnx-back');
        if (back) back.disabled = st.sec === 'connect';
        const scroll = wrap.querySelector('.mv-pane-scroll');
        if (scroll) scroll.scrollTop = 0;
        // The accounts page reads every account's allowance again, as the phone does — once a minute at most.
        if (st.sec === 'accounts' && signedIn().length && Date.now() - st.quotaAskedAt > 60000 && !st.busy) refreshQuotas(false);
        paint();
    }

    // ── What is true right now: one place decides the page's words ─────────

    function view() {
        const d = st.data, s = session();
        const n = (D().servers || []).length;
        const out = { tone: 'off', head: 'وی‌پی‌ان فایرفاکس، با حساب خودتان.', line: '' };
        out.line = `سرورهای خود موزیلا${n ? ` در ${fa(n)} کشور` : ''}، روی شبکهٔ Fastly. حساب رایگان فایرفاکس ماهانه ۵۰ گیگابایت دارد.`;
        if (!d) {
            out.head = st.loadErr ? 'برنامه جواب نداد' : 'در حال خواندن…';
            out.line = st.loadErr ? esc(st.loadErr) : '';
            out.tone = st.loadErr ? 'bad' : 'off';
            return out;
        }
        if (st.stopping || s.phase === 'stopping') {
            return { tone: 'busy', head: 'در حال قطع اتصال…', line: 'تونل و پراکسی ویندوز برگردانده می‌شوند؛ چند لحظه صبر کنید.' };
        }
        if (st.connecting || s.phase === 'connecting') {
            const step = STEPS.find((x) => x.id === s.step);
            const bits = [];
            if (step) bits.push(step.label);
            if (s.server) bits.push(`${flag(s.server.country, 16)} ${esc(countryName(s.server.country))}`);
            if (s.account && signedIn().length > 1) bits.push(email(s.account.email));
            return { tone: 'busy', head: 'در حال اتصال', line: (bits.join(' — ') || 'آماده‌سازی…') + ' <b>برای لغو دوباره همین دکمه را بزنید.</b>' };
        }
        if (st.routing) {
            return { tone: 'busy', head: 'وصل شد — مسیر ترافیک در حال تنظیم', line: 'تا وقتی تمام نشده، ترافیک سیستم هنوز از FENIX رد نمی‌شود.' };
        }
        if (s.phase === 'on' && !s.live) {
            return { tone: 'busy', head: 'موتور در حال راه‌اندازی دوباره…', line: 'یک تنظیم تازه اعمال شد و موتور Xray دوباره بالا می‌آید؛ چند ثانیه.' };
        }
        if (isOn()) {
            const exit = s.exit && s.exit.loc ? s.exit.loc : (s.server && s.server.country);
            const r = D().route || {};
            const port = (D().ports || {}).http;
            const head = `وصل است — ${flag(exit, 20)} ${esc(countryName(exit))}`;
            if (st.tunError) return { tone: 'busy', head: 'وصل است، ولی تونل روشن نشد', line: esc(st.tunError) + ' — تا وقتی تونل روشن نشود هیچ برنامه‌ای خودبه‌خود از FENIX رد نمی‌شود.' };
            let line = r.tun ? 'همهٔ برنامه‌های ویندوز از FENIX رد می‌شوند.'
                : r.sysProxy ? 'پروکسی کل سیستم روشن است — مرورگرها و برنامه‌هایی که پروکسی ویندوز را می‌خوانند از FENIX رد می‌شوند.'
                    : `فقط پورت محلی — تا برنامه‌ای را رویش تنظیم نکنید، ترافیکی از آن رد نمی‌شود.${port ? ` <code dir="ltr">127.0.0.1:${esc(port)}</code>` : ''}`;
            if (st.switchErr) line += `<br><small>کشور عوض نشد (${esc(st.switchErr)}) — اتصال قبلی برقرار ماند.</small>`;
            if (s.phase === 'renewing') line += '<br><small>پاس موزیلا در حال تمدید است؛ اتصال‌ها یک لحظه تازه می‌شوند.</small>';
            else if (s.renewError) line += `<br><small>تمدید پاس هنوز انجام نشده (${esc(s.renewError)}) — برنامه تا پایان پاس فعلی دوباره امتحان می‌کند.</small>`;
            return { tone: 'on', head, line };
        }
        if (D().pending) {
            return { tone: 'off', head: 'یک قدم مانده: کد ایمیل', line: `موزیلا یک کد ۶ رقمی به ${email(D().pending.email)} فرستاد. ${accounts().length ? 'در بخش «حساب‌ها»' : 'همین پایین'} واردش کنید.` };
        }
        if (!accounts().length) {
            return { tone: 'off', head: 'اول با حساب فایرفاکس وارد شوید', line: 'FENIX با حساب فایرفاکس خودتان کار می‌کند — رایگان، ماهانه ۵۰ گیگابایت. همین پایین «ورود با صفحهٔ موزیلا» را بزنید.' };
        }
        if (!signedIn().length) {
            return { tone: 'bad', head: 'حساب‌ها نیاز به ورود دوباره دارند', line: 'موزیلا همهٔ حساب‌های این کامپیوتر را خارج کرده است. در بخش «حساب‌ها» دوباره وارد شوید.' };
        }
        if (st.err && st.errFrom === 'connect') return { tone: 'bad', head: 'وصل نشد', line: esc(st.err) };
        if (st.err && st.errFrom === 'stop') return { tone: 'bad', head: 'قطع اتصال کامل نشد', line: esc(st.err) };
        const last = s.last;
        if (last && Date.now() - last.at < 10 * 60000) {
            if (last.why === 'expired' && last.code === 'QUOTA') return { tone: 'bad', head: 'حجم این ماهِ حساب تمام شد', line: esc(last.error) + ' اتصال قطع شد تا اینترنت شما پشت آن بسته نماند.' };
            if (last.why === 'expired') return { tone: 'bad', head: 'اتصال تمام شد', line: 'پاس موزیلا تمدید نشد و به پایان رسید؛ اتصال قطع شد تا اینترنت شما پشت آن بسته نماند. دوباره وصل شوید.' + (last.error ? `<br><small>${esc(last.error)}</small>` : '') };
            if (last.why === 'failed' && last.error) return { tone: 'bad', head: 'وصل نشد', line: esc(last.error) };
            if (last.why === 'replaced') out.line = 'اتصال دیگری جای FENIX را روی موتور گرفت، پس FENIX کنار رفت.';
            if (last.why === 'stopped') out.line = 'موتور Xray از جای دیگری خاموش شد، پس اتصال FENIX تمام شد.';
        }
        return out;
    }

    // ── The stage ──────────────────────────────────────────────────────────

    /**
     * The headline, the one button, the sentence and the live chart. The button is BUILT ONCE and
     * then updated: replacing it restarts the ring's animation, which is the stutter the engine
     * pages had while connecting (fronts.js › renderStage).
     */
    function renderStage() {
        const host = $('fnx-stage');
        if (!host) return;
        if (host.dataset.built !== '1') {
            host.innerHTML = `
      <div class="mv-eng-stage-text"><h1 data-part="head"></h1><p data-part="line"></p></div>
      <div class="mv-eng-power-wrap"><button type="button" class="mv-eng-power" data-part="power"><i data-part="glyph"></i></button></div>
      <div class="mv-eng-stage-side"><div class="mv-eng-live" data-part="live"></div></div>`;
            host.dataset.built = '1';
            host.querySelector('[data-part="power"]').onclick = () => toggle();
        }
        const v = view();
        const part = (n) => host.querySelector(`[data-part="${n}"]`);
        if (host._head !== v.head) { part('head').innerHTML = v.head; host._head = v.head; }
        if (host._line !== v.line) { part('line').innerHTML = v.line; host._line = v.line; }
        const busy = isBusy();
        const btn = part('power');
        const want = 'mv-eng-power' + (v.tone === 'on' ? ' is-on' : v.tone === 'busy' || busy ? ' is-busy' : v.tone === 'bad' ? ' is-bad' : '');
        if (btn.className !== want) btn.className = want;
        // Enabled while it is trying — that press is «cancel». Disabled only with nothing to connect with.
        btn.disabled = !st.data || st.stopping || session().phase === 'stopping' || (!isOn() && !busy && !signedIn().length);
        const label = st.stopping ? 'در حال قطع…' : isOn() && !busy ? 'قطع' : busy ? 'لغو' : 'اتصال';
        btn.setAttribute('aria-label', label);
        btn.title = !signedIn().length && !isOn() && !busy ? 'اول با حساب فایرفاکس وارد شوید' : label;
        const gl = part('glyph');
        const glyph = busy ? 'mv-spin-ring' : isOn() ? 'ph-fill ph-power' : 'ph-bold ph-power';
        if (gl.className !== glyph) gl.className = glyph;
        const live = part('live');
        if (live && window.MVEngineLive) window.MVEngineLive.mount(live);
    }

    /** The run, as one line between the stage and the cards — only while it walks. */
    function renderSteps() {
        const sec = $('fnx-steps-sec'), host = $('fnx-steps');
        if (!sec || !host) return;
        const s = session();
        const walking = st.connecting || s.phase === 'connecting' || st.routing;
        sec.style.display = walking ? 'flex' : 'none';
        if (!walking) return;
        const at = st.routing ? STEPS.length - 1 : Math.max(0, STEPS.findIndex((x) => x.id === s.step));
        host.innerHTML = STEPS.map((x, i) => {
            const done = i < at, active = i === at;
            const cls = done ? 'is-done' : active ? 'is-active' : '';
            const mark = done ? '<i class="ph-bold ph-check"></i>' : active ? `<i>${spin()}</i>` : `<i>${fa(i + 1)}</i>`;
            const note = active && x.id === 'server' && s.country === 'fastest' ? ' <small>— سریع‌ترین، از روی سنجش تازه</small>'
                : active && x.id === 'check' ? ' <small>— یک درخواست واقعی از داخل تونل</small>' : '';
            return `<div class="mv-step ${cls}">${mark}<span>${esc(x.label)}${note}</span></div>`;
        }).join('');
    }

    // ── The cards ──────────────────────────────────────────────────────────

    const pick = (attr, value, on, title, hint, disabled, extra = '') => `
        <button type="button" class="mv-eng-pick${on ? ' is-on' : ''}" data-${attr}="${esc(value)}" role="radio" aria-checked="${on}"${disabled ? ' disabled' : ''}>
          <i class="${on ? 'ph-fill ph-check-circle' : 'ph ph-circle'}"></i>
          <span class="mv-eng-pick-text"><b>${title}</b><small>${hint}</small></span>${extra}
        </button>`;

    /** What an account's allowance says, in one line. */
    function quotaHint(a) {
        if (a.signedOut) return 'نیاز به ورود دوباره';
        const q = a.quota;
        if (a.exhausted) return q && q.reset ? `حجم این ماه تمام شده — پر می‌شود ${faDate(q.reset)}` : 'حجم این ماه تمام شده';
        if (q && q.remaining != null) return `باقی‌مانده ${gb(q.remaining)}${q.limit ? ` از ${gb(q.limit)}` : ''} گیگابایت`;
        return 'حجم با اولین اتصال خوانده می‌شود';
    }

    function renderCards() {
        const host = $('fnx-cards');
        if (!host) return;
        const p = prefs(), s = session(), d = D();
        const busy = isBusy() || !!st.busy;
        const cards = [];

        // ── the live connection, when there is one ──
        if (isOn()) {
            const exit = s.exit && s.exit.loc;
            const srv = s.server && s.server.country;
            const left = s.renewAt ? Math.max(0, Math.round((s.renewAt * 1000 - Date.now()) / 60000)) : null;
            cards.push(`
      <div class="mv-eng-card2" style="--tint:var(--mv-green)">
        <div class="mv-eng-card2-head" style="cursor:default">
          <span class="mv-eng-glyph"><i class="ph-fill ph-activity"></i></span><h3>اتصال زنده</h3>
          <span class="mv-eng-card2-end">${s.connectedAt ? esc(dur(s.connectedAt)) : ''}</span>
        </div>
        <div class="mv-eng-card2-body">
          <dl class="fnx-kv">
            <dt>خروج</dt><dd>${exit ? `${flag(exit, 16)}<span>${esc(countryName(exit))}</span>${s.exit.ip ? `<code dir="ltr">${esc(s.exit.ip)}</code>` : ''}` : '<span>—</span>'}</dd>
            <dt>سرور</dt><dd title="${esc(s.server ? s.server.host : '')}">${srv ? `${flag(srv, 16)}<span>${esc(countryName(srv))}${exit && exit !== srv ? ' — خروج از کشور دیگر' : ''}</span>` : '<span>—</span>'}</dd>
            ${s.account ? `<dt>حساب</dt><dd>${email(s.account.email)}</dd>` : ''}
            <dt>پاس موزیلا</dt><dd class="${s.renewError ? 'is-warn' : ''}"><span>${s.phase === 'renewing' ? 'در حال تمدید…' : s.renewError ? 'تمدید نشد — دوباره امتحان می‌شود' : left != null ? `تمدید خودکار، ${left < 1 ? 'تا لحظاتی دیگر' : `${fa(left)} دقیقهٔ دیگر`}` : '—'}</span></dd>
            <dt>پروتکل</dt><dd><span><bdi dir="ltr">${s.http1 ? 'HTTP/1.1' : 'HTTP/2'}</bdi> · فقط <bdi dir="ltr">TCP</bdi></span></dd>
          </dl>
        </div>
        <div class="mv-eng-card2-foot">پاس هر حدود یک ساعت عوض می‌شود و برنامه پیش از تمام شدنش پاس تازه می‌گیرد — پنجره بسته هم باشد.</div>
      </div>`);
        }

        // ── the country ──
        const cur = p.country;
        cards.push(`
      <div class="mv-eng-card2" style="--tint:var(--mv-pink, #FF2D55)">
        <button type="button" class="mv-eng-card2-head" data-go="region">
          <span class="mv-eng-glyph"><i class="ph-fill ph-flag-banner"></i></span><h3>کشور خروج</h3>
          <span class="mv-eng-card2-end">${cur === 'fastest' ? fastMark(16) : flag(cur, 16)}${esc(cur === 'fastest' ? 'سریع‌ترین' : countryName(cur))}<i class="ph-bold ph-caret-left"></i></span>
        </button>
        <div class="mv-eng-card2-body" id="fnx-cc-card"></div>
        <div class="mv-eng-card2-foot">${countryFoot()}</div>
      </div>`);

        // ── coverage ──
        const shown = shownCoverage();
        cards.push(`
      <div class="mv-eng-card2" style="--tint:var(--mv-orange)">
        <button type="button" class="mv-eng-card2-head" data-go="coverage">
          <span class="mv-eng-glyph"><i class="ph-fill ph-globe-hemisphere-east"></i></span><h3>حالت اتصال</h3>
          <span class="mv-eng-card2-end"><i class="ph-bold ph-caret-left"></i></span>
        </button>
        <div class="mv-eng-card2-body" role="radiogroup">
          ${COVERAGE.map((c) => pick('coverage', c.id, shown === c.id, esc(c.title), esc(c.short), busy)).join('')}
        </div>
      </div>`);

        // ── the account ──
        const all = accounts(), ins = signedIn();
        const left = ins.reduce((sum, a) => sum + ((a.quota && a.quota.remaining) || 0), 0);
        const total = ins.reduce((sum, a) => sum + ((a.quota && a.quota.limit) || 0), 0);
        const shownAccts = ins.slice(0, 3);
        cards.push(`
      <div class="mv-eng-card2" style="--tint:var(--mv-indigo)">
        <button type="button" class="mv-eng-card2-head" data-go="accounts">
          <span class="mv-eng-glyph"><i class="ph-fill ph-user-circle"></i></span><h3>حساب</h3>
          <span class="mv-eng-card2-end">${all.length ? `${fa(all.length)} حساب${total ? ` · ${gb(left)} از ${gb(total)} گیگ` : ''}` : 'لازم است'}<i class="ph-bold ph-caret-left"></i></span>
        </button>
        ${ins.length ? `<div class="mv-eng-card2-body" role="radiogroup">
          ${shownAccts.map((a) => pick('acct', a.id, activeAccountId() === a.id, email(a.email), esc(quotaHint(a)), busy || ins.length < 2)).join('')}
        </div>` : ''}
        <div class="mv-eng-card2-foot">${!all.length ? 'FENIX بدون حساب فایرفاکس وصل نمی‌شود — حساب رایگان است.'
            : ins.length > shownAccts.length ? `${fa(ins.length - shownAccts.length)} حساب دیگر در بخش «حساب‌ها».`
                : ins.length < all.length ? 'حسابی که خارج شده، در بخش «حساب‌ها» دوباره وارد می‌شود.'
                    : 'اتصال فقط با حسابی که انتخاب شده انجام می‌شود.'}</div>
      </div>`);

        host.innerHTML = cards.join('');
        host.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => goSec(b.getAttribute('data-go')); });
        host.querySelectorAll('[data-coverage]').forEach((b) => { b.onclick = () => setCoverage(b.getAttribute('data-coverage')); });
        host.querySelectorAll('[data-acct]').forEach((b) => { b.onclick = () => chooseAccount(b.getAttribute('data-acct')); });
        renderCountry($('fnx-cc-card'), false);
    }

    function countryFoot() {
        const p = prefs(), s = session();
        if (isOn() && s.server) {
            const asked = s.country || 'fastest';
            if (asked !== p.country) return 'انتخاب تازه از اتصال بعدی اعمال می‌شود — <button type="button" class="mv-link" data-reconnect="1">همین حالا با آن وصل شو</button>';
            return asked === 'fastest' ? 'سریع‌ترین سروری که از اینترنت شما جواب داد.' : 'کشوری که هم‌اکنون از آن خارج می‌شوید.';
        }
        return 'سرعت هر کشور را بخش «کشور خروج» از همین اینترنت می‌سنجد.';
    }

    /** The path the page shows: what is TRUE while connected, the choice for next time otherwise. */
    function shownCoverage() {
        const r = D().route;
        if (isOn() && r && session().live && !st.routing) return r.tun || r.tunWanted ? 'tunnel' : r.sysProxy ? 'system' : 'proxy';
        return prefs().coverage;
    }

    /** Advanced: the two local ports, and where to go next. Facts, with a button to copy them. */
    function renderAdvanced() {
        const host = $('fnx-adv');
        if (!host) return;
        const ports = D().ports || {};
        const kv = (label, hint, value) => `
        <div class="mv-form-row">
          <span class="mv-form-label">${esc(label)}<small>${hint}</small></span>
          <span class="mv-form-control"><span class="mv-eng-kv"><code dir="ltr">${esc(value)}</code>
            <button type="button" class="mv-eng-copy" data-copy="${esc(value)}" title="کپی"><i class="ph-bold ph-copy"></i></button></span></span>
        </div>`;
        const rows = [];
        if (ports.socks) rows.push(kv('پروکسی SOCKS5', 'برای برنامه‌هایی که SOCKS می‌فهمند — و «حل نام از طریق پروکسی» را روشن کنید', `127.0.0.1:${ports.socks}`));
        if (ports.http) rows.push(kv('پروکسی HTTP', 'هر جا فقط یک فیلد «پروکسی» هست — و تنظیمات خود ویندوز', `127.0.0.1:${ports.http}`));
        rows.push(`
        <button type="button" class="mv-form-row is-link" data-go="log">
          <span class="mv-form-label">گزارش<small>کارهایی که این پنجره انجام داد</small></span>
          <span class="mv-form-value">${st.log.length ? fa(st.log.length) + ' خط' : '—'}</span>
        </button>
        <button type="button" class="mv-form-row is-link" data-apps="1">
          <span class="mv-form-label">برنامه‌های عبوری از تونل<small>در تنظیمات › تونل و برنامه‌ها انتخاب می‌شود</small></span>
        </button>`);
        host.innerHTML = rows.join('');
        wireCopy(host);
        host.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => goSec(b.getAttribute('data-go')); });
        host.querySelectorAll('[data-apps]').forEach((b) => {
            b.onclick = () => {
                if (window.MV && MV.wm) MV.wm.open('settings');
                if (typeof window.switchSettingsTab === 'function') setTimeout(() => window.switchSettingsTab('tunnel'), 60);
            };
        });
    }

    function wireCopy(host) {
        host.querySelectorAll('[data-copy]').forEach((b) => {
            b.onclick = () => {
                try { navigator.clipboard.writeText(b.getAttribute('data-copy')); } catch (e) { /* no clipboard here */ }
                const i = b.querySelector('i');
                if (i) { i.className = 'ph-bold ph-check'; setTimeout(() => { i.className = 'ph-bold ph-copy'; }, 1200); }
            };
        });
    }

    // ── The country picker: this page's own control, not the operating system's menu ──

    /** Measured first (fastest on top), then not measured yet, then the ones that did not answer. */
    function serverList() {
        const list = (D().servers || []).slice();
        const rank = (x) => (x.ms > 0 ? 0 : x.ms == null ? 1 : 2);
        return list.sort((a, b) => rank(a) - rank(b) || (a.ms > 0 && b.ms > 0 ? a.ms - b.ms : 0) || countryName(a.country).localeCompare(countryName(b.country), 'fa'));
    }

    function renderCountry(host, expanded) {
        if (!host) return;
        const p = prefs();
        const list = serverList();
        const seen = D().exitSeen || {};
        const open = expanded || st.ccOpen;
        const q = (st.ccQuery || '').trim().toLowerCase();
        const locked = !!st.connecting;

        const rowFor = (code, item) => {
            const on = (code || 'fastest') === p.country;
            const name = code ? countryName(code) : 'سریع‌ترین';
            const exitTo = code && seen[code] && seen[code] !== code ? seen[code] : '';
            const sub = code ? [exitTo ? `خروج از ${countryName(exitTo)}` : '', code].filter(Boolean).join(' · ') : 'کمترین تأخیر از اینترنت شما — هنگام اتصال دوباره سنجیده می‌شود';
            const m = !code ? '' : item.ms > 0 ? `<span class="fnx-ms${item.ms < 450 ? ' is-good' : ''}">${ms(item.ms)}</span>`
                : item.ms === -1 ? '<span class="fnx-ms is-bad">جواب نداد</span>' : '';
            return `
        <button type="button" class="mv-eng-cc-row${on ? ' is-on' : ''}" data-cc="${esc(code || 'fastest')}" role="radio" aria-checked="${on}"${locked ? ' disabled' : ''}>
          ${code ? flag(code) : fastMark()}
          <span class="mv-eng-cc-text"><b>${esc(name)}</b><small>${esc(sub)}</small></span>
          ${m}${on ? '<i class="ph-fill ph-check-circle"></i>' : ''}
        </button>`;
        };
        const matches = list.filter((r) => !q || r.country.toLowerCase().includes(q) || countryName(r.country).toLowerCase().includes(q));
        const cur = p.country === 'fastest' ? '' : p.country;
        const curItem = list.find((x) => x.country === cur);

        host.innerHTML = `
      ${expanded ? '' : `
      <button type="button" class="mv-eng-cc-cur" data-cc-toggle="1" aria-expanded="${open}"${locked ? ' disabled' : ''}>
        ${cur ? flag(cur) : fastMark()}
        <span class="mv-eng-cc-text"><b>${esc(cur ? countryName(cur) : 'سریع‌ترین')}</b>
          <small>${esc(cur ? (curItem && curItem.ms > 0 ? ms(curItem.ms) : cur) : 'هر کجا که سریع‌تر جواب دهد')}</small></span>
        <i class="ph-bold ${open ? 'ph-caret-up' : 'ph-caret-down'}"></i>
      </button>`}
      <div class="mv-eng-cc-list"${open ? '' : ' hidden'}>
        ${list.length > 7 ? `
        <label class="mv-eng-cc-search"><i class="ph ph-magnifying-glass"></i>
          <input type="search" placeholder="جست‌وجوی کشور…" spellcheck="false" value="${esc(st.ccQuery)}" data-cc-search aria-label="جست‌وجوی کشور"></label>` : ''}
        <div class="mv-eng-cc-rows" role="radiogroup">
          ${rowFor('', null)}
          ${matches.map((r) => rowFor(r.country, r)).join('')}
          ${!list.length ? `<div class="mv-eng-cc-empty">${D().ping && D().ping.running ? 'در حال گرفتن فهرست سرورها…' : 'فهرست سرورهای موزیلا هنوز گرفته نشده — «سنجش سرورها» را بزنید.'}</div>` : ''}
          ${list.length && !matches.length && q ? '<div class="mv-eng-cc-empty">کشوری با این نام در فهرست موزیلا نیست.</div>' : ''}
        </div>
      </div>`;

        const toggle = host.querySelector('[data-cc-toggle]');
        if (toggle) toggle.onclick = () => { st.ccOpen = !st.ccOpen; paint(); };
        host.querySelectorAll('[data-cc]').forEach((b) => {
            b.onclick = () => {
                setPrefs({ country: b.getAttribute('data-cc') });
                st.ccOpen = false;
                st.ccQuery = '';
                paint();
            };
        });
        const search = host.querySelector('[data-cc-search]');
        if (search) {
            search.oninput = () => {
                st.ccQuery = search.value;
                renderCountry(host, expanded);
                const again = host.querySelector('[data-cc-search]');
                if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
            };
        }
        const rc = host.closest('.mv-eng-card2');
        const re = rc && rc.querySelector('[data-reconnect]');
        if (re) re.onclick = () => connect();
    }

    /** The country section: the whole list, and the measurement that orders it. */
    function renderRegionSec() {
        const host = $('fnx-region');
        if (!host) return;
        const d = D();
        const running = !!(d.ping && d.ping.running) || st.busy === 'ping';
        const top = document.createElement('div');
        top.className = 'fnx-sweep';
        top.innerHTML = `<button type="button" class="mv-btn" data-ping="1"${running ? ' disabled' : ''}>${running ? spin() + ' در حال سنجش سرورها…' : '<i class="ph-bold ph-gauge"></i> سنجش سرورها'}</button>
          <small>${running ? 'هر سرور با یک دست‌دادن TLS از همین اینترنت سنجیده می‌شود.' : d.pingsAt ? `آخرین سنجش ${esc(ago(d.pingsAt))}` : 'هنوز سنجیده نشده.'}</small>`;
        const listHost = document.createElement('div');
        host.innerHTML = '';
        host.appendChild(top);
        host.appendChild(listHost);
        renderCountry(listHost, true);
        top.querySelector('[data-ping]').onclick = () => ping();
    }

    // ── Coverage ───────────────────────────────────────────────────────────

    function renderCoverage() {
        const host = $('fnx-coverage');
        if (!host) return;
        const shown = shownCoverage();
        const busy = isBusy();
        host.innerHTML = COVERAGE.map((c) => {
            const on = shown === c.id;
            return `
        <button type="button" class="mv-form-row is-action" data-coverage="${c.id}" role="radio" aria-checked="${on}"${busy ? ' disabled' : ''}>
          <span class="mv-row-mark${on ? ' is-on' : ''}"><i class="${on ? 'ph-fill ph-check-circle' : 'ph ph-circle'}"></i></span>
          <span class="mv-form-label">${esc(c.title)}<small>${esc(c.short)}</small></span>
          <i class="ph-bold ${c.icon} mv-row-end"></i>
        </button>`;
        }).join('');
        host.querySelectorAll('[data-coverage]').forEach((b) => { b.onclick = () => setCoverage(b.getAttribute('data-coverage')); });
        const note = $('fnx-coverage-note');
        if (!note) return;
        const ports = D().ports || {};
        const base = shown === 'system'
            ? `پروکسی ویندوز روی <code dir="ltr">127.0.0.1:${esc(ports.http || '')}</code> گذاشته می‌شود — مرورگرها و هر برنامه‌ای که پروکسی ویندوز را می‌خواند، بدون هیچ تنظیمی. برنامه‌هایی که پروکسی ویندوز را نمی‌خوانند رد نمی‌شوند؛ برای آن‌ها «تونل کامل سیستم».`
            : shown === 'tunnel'
                ? 'همهٔ برنامه‌های ویندوز از تونل رد می‌شوند و نیازی به تنظیم هیچ برنامه‌ای نیست. سرورهای موزیلا فقط TCP می‌برند، پس QUIC عمداً <b>رد</b> می‌شود تا مرورگر فوراً به TCP برگردد، و نام سایت‌ها از داخل خود تونل حل می‌شود — نه بیرون آن.'
                : `فقط برنامه‌هایی که خودتان تنظیم می‌کنید؛ مرورگر و ویندوز دست‌نخورده می‌مانند. <b>SOCKS5</b> روی <code dir="ltr">127.0.0.1:${esc(ports.socks || '')}</code> و <b>HTTP</b> روی <code dir="ltr">127.0.0.1:${esc(ports.http || '')}</code>. هر جا فقط یک فیلد «پروکسی» هست همان HTTP است.`;
        note.innerHTML = base + (isOn() ? ' <b>روی اتصال باز هم عوض می‌شود.</b>' : '');
    }

    // ── Accounts ───────────────────────────────────────────────────────────

    /**
     * Mozilla's browser check, wherever it was asked for: the form has its own copy of this, so the
     * home page and the accounts list carry it only when the form is not on screen.
     */
    function challengeHtml() {
        // Refused on the way to an account: signing in on Mozilla's own page IS the way through there.
        const signIn = ['signin', 'code', 'web'].includes(st.retry);
        const text = signIn
            ? 'موزیلا برای ورود یک بررسی مرورگر می‌خواهد. صفحهٔ ورود خود موزیلا در یک پنجره باز می‌شود: همان‌جا با حساب فایرفاکس‌تان وارد شوید — حساب خودش این‌جا اضافه می‌شود و پنجره بسته می‌شود.'
            : 'موزیلا پیش از ادامه یک بررسی مرورگر می‌خواهد. صفحهٔ خود موزیلا در یک پنجره باز می‌شود؛ بررسی‌اش معمولاً چند ثانیه‌ای خودش رد می‌شود، بعد توکن حساب از همان صفحه تازه می‌شود و پنجره خودش بسته می‌شود (اگر نشد، ببندیدش) و همان کار دوباره امتحان می‌شود.';
        return `<div class="mv-form-row mv-callout is-warn"><i class="ph-fill ph-shield-check"></i><div>
            ${text}
            <div class="fnx-callout-act"><button type="button" class="mv-btn mv-btn--sm" data-fn="challenge"${st.busy ? ' disabled' : ''}>${st.busy === 'challenge' ? spin() + ' صفحهٔ موزیلا باز است…' : signIn ? 'ورود در صفحهٔ موزیلا' : 'باز کردن صفحهٔ موزیلا'}</button></div></div></div>`;
    }
    function wireChallenge(host) {
        if (host) host.querySelectorAll('[data-fn="challenge"]').forEach((b) => { b.onclick = () => act('challenge'); });
    }

    /** The home page's copy of the check, for a connect (or a refresh) that ran into it. */
    function renderHomeCallout() {
        const sec = $('fnx-home-callout');
        if (!sec) return;
        const want = st.challenge && accounts().length > 0;
        sec.hidden = !want;
        if (!want) return;
        const g = sec.querySelector('.mv-form-group');
        const html = challengeHtml();
        if (g._html !== html) { g.innerHTML = html; g._html = html; wireChallenge(g); }
    }

    /**
     * The accounts section. Three slots, built once: the sign-in form (drawn by renderForm, which keeps
     * its fields across repaints — taking a focused field out of the page, even for a moment, takes
     * the caret with it), the list and the account choice, which are redrawn freely.
     */
    function renderAccounts() {
        const host = $('fnx-accounts');
        if (!host) return;
        if (!host.querySelector('[data-part="form-sec"]')) {
            host.innerHTML = `
          <div class="mv-form-section" data-part="form-sec" hidden>
            <div class="mv-form-header" data-part="form-title"></div>
            <div class="mv-form-group" data-part="form"></div>
            <div class="mv-form-footer">رمز شما به این برنامه نمی‌رسد: ورود در صفحهٔ خود موزیلا انجام می‌شود و برنامه فقط توکن حساب را برمی‌دارد، رمزشده روی همین کامپیوتر. حساب ندارید؟ در همان صفحه رایگان بسازید.</div>
          </div>
          <div class="mv-form-section" data-part="list-sec" hidden>
            <div class="mv-form-header">حساب‌های فایرفاکس</div>
            <div class="mv-form-group" data-part="list"></div>
            <div class="mv-form-footer" data-part="list-note"></div>
          </div>
          <div class="mv-form-section" data-part="act-sec" hidden>
            <div class="mv-form-header">کارها</div>
            <div class="mv-form-group" data-part="act"></div>
            <div class="mv-form-footer">حساب از همین کامپیوتر پاک می‌شود، نه از موزیلا؛ با دوباره وارد شدن برمی‌گردد.</div>
          </div>
          <div class="mv-form-section" data-part="pick-sec" hidden>
            <div class="mv-form-header">اتصال با کدام حساب</div>
            <div class="mv-form-group" role="radiogroup" data-part="pick"></div>
            <div class="mv-form-footer">اتصال فقط با همین حساب انجام می‌شود. اگر حجم این ماهش تمام شود، تا روزی که موزیلا پرش کند با آن وصل نمی‌شود.</div>
          </div>`;
        }
        const part = (n) => host.querySelector(`[data-part="${n}"]`);
        const all = accounts(), s = session(), p = prefs(), d = D();
        const formWanted = !all.length || st.adding || !!d.pending;

        // A hidden section must not count as a column (page-kit counts the non-wide sections), so
        // every hidden one is marked wide as well — otherwise one visible module sits beside an
        // empty column.
        const show = (name, on) => { const el = part(name); el.hidden = !on; el.classList.toggle('is-wide', !on); };
        show('form-sec', formWanted);
        part('form-title').textContent = all.length ? 'افزودن حساب فایرفاکس' : 'ورود با حساب فایرفاکس';
        if (formWanted) renderForm(part('form'));

        show('list-sec', all.length > 0);
        show('act-sec', all.length > 0);
        if (all.length) {
            const rows = all.map((a) => {
                const inUse = isOn() && s.account && s.account.id === a.id;
                const q = a.quota;
                const pct = q && q.limit ? Math.max(0, Math.min(100, Math.round((q.remaining / q.limit) * 100))) : null;
                const badge = a.signedOut ? '<span class="mv-pill is-bad">نیاز به ورود دوباره</span>'
                    : a.exhausted ? '<span class="mv-pill is-warn">حجم تمام شده</span>'
                        : inUse ? '<span class="mv-pill is-ok"><i class="mv-lampdot"></i>در حال استفاده</span>' : '';
                const refill = q && q.reset && q.reset * 1000 > Date.now() ? q.reset : 0;
                const days = refill ? Math.max(0, Math.ceil((refill * 1000 - Date.now()) / 86400000)) : 0;
                return `
          <div class="fnx-acct">
            <div class="fnx-acct-top">${email(a.email)}${badge}
              <span class="fnx-acct-end">
                ${a.signedOut ? `<button type="button" class="mv-btn mv-btn--sm" data-relogin="${esc(a.id)}">ورود دوباره</button>` : ''}
                <button type="button" class="mv-btn mv-btn--sm mv-btn--danger" data-remove="${esc(a.id)}"${st.busy ? ' disabled' : ''}>حذف</button>
              </span>
            </div>
            ${pct != null && !a.signedOut ? `<div class="fnx-bar${a.exhausted || pct < 10 ? ' is-low' : ''}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="باقی‌ماندهٔ حجم"><i style="width:${pct}%"></i></div>` : ''}
            <small>${esc(quotaHint(a))}${!a.signedOut && !a.exhausted && refill ? ` — پر می‌شود ${esc(faDate(refill))}${days ? ` (${fa(days)} روز دیگر)` : ''}` : ''}</small>
            ${q && q.at ? `<small class="is-dim">آخرین بررسی ${esc(ago(q.at))}</small>` : ''}
          </div>`;
            }).join('');
            const quotaBusy = st.busy === 'quota';
            part('list').innerHTML = (st.challenge && !formWanted ? challengeHtml() : '') + rows;
            part('act').innerHTML = `
            <button type="button" class="mv-form-row is-action" data-add="1"${formWanted || st.busy ? ' disabled' : ''}>
              <span class="mv-row-mark"><i class="ph-bold ph-user-plus"></i></span>
              <span class="mv-form-label">${st.busy === 'web' ? 'صفحهٔ موزیلا باز است…' : 'افزودن حساب دیگر'}<small>ورود با یک حساب فایرفاکس دیگر، در صفحهٔ خود موزیلا</small></span>
            </button>
            <button type="button" class="mv-form-row is-action" data-quota="1"${st.busy || !signedIn().length ? ' disabled' : ''} aria-busy="${quotaBusy}">
              <span class="mv-row-mark">${quotaBusy ? spin() : '<i class="ph-bold ph-arrows-clockwise"></i>'}</span>
              <span class="mv-form-label">${quotaBusy ? 'در حال بررسی حجم‌ها…' : 'بررسی دوبارهٔ حجم‌ها'}<small>باقی‌ماندهٔ هر حساب از خود موزیلا پرسیده می‌شود</small></span>
            </button>`;
            part('list-note').textContent = st.note || 'باقی‌ماندهٔ حجم هر حساب از خود موزیلا خوانده می‌شود؛ حسابی که حجمش تمام شده تا روز پر شدنش وصل نمی‌شود.';
        }

        const ins = signedIn();
        show('pick-sec', ins.length > 1);
        if (ins.length) {
            const row = (value, title, hint) => {
                const on = activeAccountId() === value;
                return `
            <button type="button" class="mv-form-row is-action" data-acct="${esc(value)}" role="radio" aria-checked="${on}"${isBusy() ? ' disabled' : ''}>
              <span class="mv-row-mark${on ? ' is-on' : ''}"><i class="${on ? 'ph-fill ph-check-circle' : 'ph ph-circle'}"></i></span>
              <span class="mv-form-label">${title}<small>${hint}</small></span>
            </button>`;
            };
            part('pick').innerHTML = ins.map((a) => row(a.id, email(a.email), esc(quotaHint(a)))).join('');
        }

        wireChallenge(part('list'));
        // Accounts are added on Mozilla's own page (Android 1.2.43): Mozilla turns the app's own
        // sign-in away at its door, and its page carries the e-mailed code and the browser check itself.
        part('act').querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => act('web'); });
        part('act').querySelectorAll('[data-quota]').forEach((b) => { b.onclick = () => refreshQuotas(true); });
        part('pick').querySelectorAll('[data-acct]').forEach((b) => { b.onclick = () => chooseAccount(b.getAttribute('data-acct')); });
        part('list').querySelectorAll('[data-remove]').forEach((b) => { b.onclick = () => removeAccount(b.getAttribute('data-remove')); });
        // Signing in again on Mozilla's page with the same e-mail puts fresh tokens on the same account.
        part('list').querySelectorAll('[data-relogin]').forEach((b) => { b.onclick = () => act('web'); });
    }

    /**
     * The sign-in form — e-mail and password, then Mozilla's e-mailed code — drawn ONCE per step and
     * then left alone. The old window rebuilt it on every status poll, so a password typed while a
     * poll landed was wiped; the values live in `st.form` now, and only the buttons' state is touched.
     */
    function renderForm(host) {
        if (!host) return;
        const d = D();
        const mode = d.pending ? 'code' : 'signin';
        const key = mode + '|' + (d.pending ? d.pending.email : '') + '|' + (st.challenge ? 'c' : '') + '|' + (accounts().length ? 'a' : '');
        if (host.dataset.key !== key) {
            host.dataset.key = key;
            host.innerHTML = (mode === 'code' ? `
          <div class="fnx-form">
            <div class="fnx-sent">موزیلا یک کد ${fa(6)} رقمی به ${email(d.pending.email)} فرستاد. کد را از ایمیل بردارید و همین‌جا بزنید.</div>
            <label class="fnx-fld is-code"><span>کد ایمیل</span>
              <input class="mv-field fnx-code" data-f="code" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="8" spellcheck="false" placeholder="••••••"></label>
            <div class="fnx-act">
              <button type="button" class="mv-btn mv-btn--primary" data-fn="code"></button>
              <button type="button" class="mv-btn mv-btn--plain" data-fn="cancel">ایمیل دیگری / شروع دوباره</button>
            </div>
            <div class="fnx-sent" data-part="ferr"></div>
          </div>` : `
          <div class="fnx-form">
            <div class="fnx-sent">ورود در صفحهٔ خود موزیلا انجام می‌شود: پنجرهٔ موزیلا باز می‌شود و با ایمیل و رمز حساب فایرفاکس وارد می‌شوید — کد ایمیل و بررسی مرورگر، اگر لازم شد، هم همان‌جاست. حساب خودش این‌جا اضافه می‌شود و پنجره بسته می‌شود.</div>
            <div class="fnx-act">
              <button type="button" class="mv-btn mv-btn--primary" data-fn="web"></button>
              ${accounts().length ? '<button type="button" class="mv-btn mv-btn--plain" data-fn="close">انصراف</button>' : ''}
            </div>
            <div class="fnx-sent" data-part="ferr"></div>
          </div>`) + (st.challenge ? challengeHtml() : '');
            host.querySelectorAll('[data-f]').forEach((inp) => {
                const k = inp.getAttribute('data-f');
                inp.value = st.form[k] || '';
                inp.oninput = () => { st.form[k] = inp.value; };
                inp.onkeydown = (e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    if (k === 'email') { const n = host.querySelector('[data-f="pass"]'); if (n && !n.value) { n.focus(); return; } }
                    act(mode === 'code' ? 'code' : 'signin');
                };
            });
            host.querySelectorAll('[data-fn]').forEach((b) => { b.onclick = () => act(b.getAttribute('data-fn')); });
        }
        // Only the moving parts, every paint.
        const busy = st.busy;
        const set = (fn, idle, working) => {
            const b = host.querySelector(`[data-fn="${fn}"]`);
            if (!b) return;
            const html = busy === fn ? spin() + ' ' + working : idle;
            if (b.innerHTML !== html) b.innerHTML = html;
            b.disabled = !!busy;
        };
        set('web', 'ورود با صفحهٔ موزیلا', 'پنجرهٔ موزیلا باز است…');
        set('signin', 'ورود', 'در حال ورود…');
        set('code', 'تأیید', 'در حال تأیید…');
        set('challenge', 'باز کردن صفحهٔ موزیلا', 'صفحهٔ موزیلا باز است…');
        const cancel = host.querySelector('[data-fn="cancel"]');
        if (cancel) cancel.disabled = !!busy;
        host.querySelectorAll('[data-f]').forEach((inp) => { inp.disabled = !!busy; });
        const fe = host.querySelector('[data-part="ferr"]');
        const msg = st.err && ['web', 'signin', 'code', 'cancel', 'challenge'].includes(st.errFrom) ? st.err : '';
        if (fe) { fe.textContent = msg; fe.style.color = msg ? 'var(--mv-red-ink)' : ''; fe.hidden = !msg; }
    }

    function focusForm() {
        setTimeout(() => {
            const wrap = $('fnx-wrap');
            const sec = wrap && wrap.querySelector('.mv-eng-sec.is-on');
            const inp = sec && (sec.querySelector('[data-f="code"]') || sec.querySelector('[data-fn="web"]'));
            if (inp) inp.focus();
        }, 30);
    }

    /** On the home page, the form shows itself only while there is no account at all. */
    function renderHomeForm() {
        const sec = $('fnx-home-signin');
        if (!sec) return;
        const want = !!st.data && !accounts().length;
        sec.hidden = !want;
        if (want) renderForm($('fnx-home-form'));
    }

    // ── The guide ──────────────────────────────────────────────────────────

    function renderGuide() {
        const host = $('fnx-guide');
        if (!host || host.dataset.built === '1') return;
        host.dataset.built = '1';
        const sec = (title, body) => `
          <div class="mv-form-section">
            <div class="mv-form-header">${title}</div>
            <div class="mv-form-group"><div class="mv-form-row is-stack"><div class="fnx-guide">${body}</div></div></div>
          </div>`;
        host.innerHTML = sec('FENIX چیست', `
<p>همان وی‌پی‌انی است که داخل خود فایرفاکس هست: سرورهای موزیلا روی شبکهٔ <b>Fastly</b>، یکی در هر کشور. اتصال از دید شبکه یک ارتباط معمولی HTTPS به Fastly است.</p>
<p>برنامه آن را روی هستهٔ Xray خودش اجرا می‌کند، پس همان پوشش‌هایی را دارد که بقیهٔ اتصال‌ها: پروکسی کل سیستم، تونل کامل، یا فقط پورت محلی.</p>`)
            + sec('حساب', `
<ol>
  <li>یک حساب فایرفاکس لازم است — رایگان؛ در همان صفحهٔ ورود موزیلا هم ساخته می‌شود.</li>
  <li>در بخش «حساب‌ها» دکمهٔ «ورود با صفحهٔ موزیلا» را بزنید. صفحهٔ خود موزیلا در یک پنجره باز می‌شود؛ ایمیل و رمز را همان‌جا می‌زنید و کد ۶ رقمی ایمیل را هم، اگر خواست.</li>
  <li>گاهی موزیلا پیش از ادامه یک <b>بررسی مرورگر</b> می‌خواهد؛ آن هم در همان صفحه است و مثل هر مرورگری انجامش می‌دهید. وقتی وارد شدید، حساب خودش این‌جا اضافه می‌شود و پنجره بسته می‌شود.</li>
</ol>
<p>رمز شما به این برنامه نمی‌رسد: فقط در صفحهٔ خود موزیلا زده می‌شود. برنامه توکن‌های حساب را برمی‌دارد و روی همین کامپیوتر با رمزنگاری ویندوز نگه می‌دارد.</p>`)
            + sec('حجم و پاس', `
<p>هر حساب رایگان ماهانه <b>۵۰ گیگابایت</b> دارد. وقتی حجم حساب تمام شود، تا روزی که موزیلا پرش کند با آن وصل نمی‌شود — باقی‌مانده و روز پر شدن در بخش «حساب‌ها» دیده می‌شود.</p>
<p>موزیلا برای هر اتصال یک «پاس» کوتاه‌عمر — حدود یک ساعت — می‌دهد. برنامه پیش از تمام شدنش پاس تازه می‌گیرد، پنجره بسته هم باشد؛ اتصال‌ها در آن لحظه یک بار تازه می‌شوند.</p>`)
            + sec('محدودیت‌ها', `
<ul>
  <li>فقط <bdi dir="ltr">TCP</bdi>: سرورهای موزیلا UDP نمی‌برند، پس QUIC و تماس‌های صوتیِ مبتنی بر UDP از این مسیر کار نمی‌کنند — مرورگر خودش به TCP برمی‌گردد.</li>
  <li>اگر اتصال برقرار شد ولی داده‌ای رد نشد، کشور دیگری را امتحان کنید؛ روی بعضی اینترنت‌ها یکی دو کشور زودتر جواب می‌دهند.</li>
</ul>`);
    }

    function renderAbout() {
        const host = $('fnx-about');
        if (!host) return;
        host.innerHTML = `
          <div class="mv-form-section is-wide">
            <div class="mv-form-header">درباره برنامه</div>
            <div class="mv-form-group" style="padding:16px 18px; font-size:13px; line-height:1.9;">
              <p style="font-weight:700; font-size:14.5px; margin:0 0 8px; color:var(--mv-label);">Fenix Standalone VPN v1.0.0</p>
              <p style="margin:0 0 10px; color:var(--mv-label-2);">
                Based on MLMVPN for Windows<br>
                <a href="https://github.com/mlmvpn/mlmvpn_windows" target="_blank" style="color:var(--mv-accent); text-decoration:underline; font-family:var(--mv-font-tech);">https://github.com/mlmvpn/mlmvpn_windows</a>
              </p>
              <p style="margin:0 0 10px; color:var(--mv-label-2);">
                Original Copyright &copy; 2026 Ehsan (MLMVPN). All rights reserved.<br>
                Licensed under the MLMVPN Attribution License 1.0.
              </p>
              <div style="margin-top:14px; padding-top:10px; border-top:1px solid var(--mv-sep); color:var(--mv-label-3); font-size:12px;">
                این کلاینت مستقل بر پایهٔ پروژهٔ MLMVPN توسعه یافته و از پروتکل Fastly MASQUE موزیلا و هستهٔ Xray-core بهره می‌برد.
              </div>
            </div>
          </div>`;
    }

    function renderLog() {
        const pre = $('fnx-log');
        if (!pre) return;
        pre.textContent = st.log.length ? st.log.join('\n') : 'هنوز چیزی ثبت نشده.';
        pre.scrollTop = pre.scrollHeight;
    }

    // ── The sidebar card, the bar button, the strip ────────────────────────

    function identIcon() {
        const app = window.MV && MV.apps && MV.apps.get && MV.apps.get('fenix');
        if (app && MV.apps.iconHTML) { try { return MV.apps.iconHTML(app, 54); } catch (e) { /* the glyph below */ } }
        return '<span class="mv-side-tile" style="--tint:var(--mv-orange)"><i class="ph-fill ph-fire"></i></span>';
    }
    function tone() { const v = view(); return isBusy() ? 'busy' : v.tone; }
    const dot = (t) => `<i class="mv-eng-dot${t === 'on' ? ' is-on' : t === 'busy' ? ' is-busy' : t === 'bad' ? ' is-bad' : ''}"></i>`;

    function renderIdent() {
        const host = $('fnx-ident');
        if (!host) return;
        const t = tone();
        const word = t === 'on' ? 'وصل است' : t === 'busy' ? 'در حال کار' : t === 'bad' ? 'مشکل دارد' : 'خاموش';
        const html = `${identIcon()}<b>FENIX</b><small>${dot(t)}${esc(word)}</small>`;
        if (host._html !== html) { host.innerHTML = html; host._html = html; }
    }

    function renderBarAction() {
        const host = $('fnx-bar-action');
        if (!host) return;
        if (st.sec === 'connect') { host.innerHTML = ''; return; }
        const busy = isBusy();
        const on = isOn() && !busy;
        host.innerHTML = `<button type="button" class="mv-btn${on || busy ? '' : ' mv-btn--primary'}"${st.stopping || (!on && !busy && !signedIn().length) ? ' disabled' : ''}>${st.stopping ? 'در حال قطع…' : on ? 'قطع' : busy ? 'لغو' : 'اتصال'}</button>`;
        host.firstElementChild.onclick = () => toggle();
    }

    function renderFoot() {
        const host = $('fnx-foot');
        if (!host) return;
        const t = tone(), s = session(), r = D().route || {};
        const word = st.stopping ? 'در حال قطع…' : st.connecting || s.phase === 'connecting' ? 'در حال اتصال'
            : t === 'on' ? (r.tun ? 'وصل — تونل کامل سیستم' : r.sysProxy ? 'وصل — پروکسی کل سیستم' : 'وصل — فقط پورت محلی')
                : t === 'busy' ? 'در حال کار' : t === 'bad' ? 'مشکل دارد' : signedIn().length ? 'آمادهٔ اتصال' : 'حساب لازم است';
        const exit = s.exit && s.exit.loc;
        const end = isOn() && exit ? `خروج از ${flag(exit, 17)} ${esc(countryName(exit))}` : '';
        host.innerHTML = `${dot(t)}<span>${esc(word)}</span><span class="mv-eng-foot-end">${end}</span>`;
    }

    /** A field the user is typing in. A list redrawn under it would take the caret (and the half-typed search) away. */
    function typingIn(id) {
        const host = $(id), ae = document.activeElement;
        return !!(host && ae && ae.tagName === 'INPUT' && host.contains(ae));
    }

    function paint() {
        if (!$('fnx-wrap')) return;
        renderIdent(); renderBarAction(); renderFoot();
        if (st.sec === 'connect') {
            renderStage(); renderSteps(); renderHomeCallout(); renderHomeForm();
            if (!typingIn('fnx-cards')) renderCards();
            renderAdvanced();
        }
        else if (st.sec === 'accounts') renderAccounts();
        else if (st.sec === 'region') { if (!typingIn('fnx-region')) renderRegionSec(); }
        else if (st.sec === 'coverage') renderCoverage();
        else if (st.sec === 'guide') renderGuide();
        else if (st.sec === 'log') renderLog();
        else if (st.sec === 'about') renderAbout();
        if (typeof window.routeChipsPaint === 'function') window.routeChipsPaint();
    }

    // ── Talking to the server ──────────────────────────────────────────────

    let fetching = false, lastFetch = 0;
    const shown = () => { const r = $('ls-fenix'); return !!(r && r.style.display !== 'none' && r.offsetParent !== null); };

    async function refresh(full) {
        if (fetching && !full) return;
        fetching = true;
        lastFetch = Date.now();
        try {
            // `lite` while nobody is looking: the path needs a registry read the lamp does not.
            st.data = await api('fenix' + (full || shown() ? '' : '?lite=1'));
            st.loadErr = '';
            const s = session();
            if (isOn() && s.live) st.err = '';
            if (!isOn()) st.tunError = '';
            // No list yet: Mozilla's is public, so it is fetched on first sight, not after a sign-in.
            if (!(st.data.servers || []).length && !st.serversAsked) {
                st.serversAsked = true;
                api('fenix/servers', {}).catch(() => {});
            }
        } catch (e) {
            if (!st.data) st.loadErr = e.message;
        } finally { fetching = false; }
        paint();
    }

    /** Faster while something moves, slower while the window is closed (the lamp still reads it). */
    function due() {
        const s = session();
        const moving = isBusy() || !!st.busy || s.phase === 'renewing' || !!(st.data && st.data.ping && st.data.ping.running);
        const every = moving ? 1000 : shown() ? 4000 : 8000;
        return Date.now() - lastFetch >= every;
    }

    // ── Actions ────────────────────────────────────────────────────────────

    function fail(e, from) {
        st.err = e.message;
        st.errFrom = from;
        st.errCode = e.code || '';
        if (e.code === 'CHALLENGE') {
            // The token grant after a sign-in on Mozilla's page was sent to Guardian's or the
            // accounts' check: the same button opens the page again, and closing it finishes the sign-in.
            if (from === 'web') st.err = 'موزیلا پیش از دادن توکن حساب یک بررسی مرورگر خواست. دکمه را دوباره بزنید و بررسی را در صفحهٔ موزیلا رد کنید؛ پنجره بعدش بسته می‌شود (اگر نشد، ببندیدش) و ورود خودش کامل می‌شود.';
            else {
                st.challenge = true;
                // A check refused again keeps what it was for.
                if (from !== 'challenge') st.retry = from;
            }
            st.challengeHost = e.host || st.challengeHost || '';
        }
        if (e.code === 'REFUSED_AGAIN') {
            // Even Mozilla's own page was turned away: the window does not come back by itself; the
            // reason stays where the person was looking (the connect's headline when it was for a connect).
            st.challenge = false;
            if (st.retry === 'connect' || st.retry === 'quota') st.errFrom = 'connect';
            st.retry = ''; st.challengeHost = '';
        }
        // «افزودن حساب دیگر» runs with the form off screen: its reason goes under the list as well.
        if (from === 'web') st.note = st.err;
        log('✗ ' + (e.code === 'CHALLENGE' ? 'موزیلا بررسی مرورگر خواست' + (e.host ? ` (${e.host})` : '') + '.' : e.message));
    }

    async function act(what) {
        if (st.busy) return;
        st.err = ''; st.errFrom = '';
        try {
            if (what === 'close') { st.adding = false; st.form.pass = ''; paint(); return; }
            if (what === 'web') {
                // Mozilla's own sign-in page: the account signed in to there is added by itself.
                st.busy = 'web'; paint();
                log('— ورود در صفحهٔ موزیلا');
                const r = await api('fenix/challenge', { host: st.challengeHost || '', purpose: 'signin' });
                st.challenge = false; st.retry = ''; st.challengeHost = '';
                if (r.signedIn) { st.busy = ''; signedInDone(r.signedIn); }
                else log('پنجرهٔ موزیلا بی ورود بسته شد.');
            } else if (what === 'signin') {
                const em = String(st.form.email || '').trim(), pw = String(st.form.pass || '');
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) throw Object.assign(new Error('ایمیل حساب فایرفاکس را درست وارد کنید.'), { code: 'INPUT' });
                if (!pw) throw Object.assign(new Error('رمز حساب را وارد کنید.'), { code: 'INPUT' });
                st.busy = 'signin'; paint();
                log(`— ورود با ${em}`);
                const r = await api('fenix/signin', { email: em, password: pw });
                st.form.pass = '';
                st.challenge = false;
                if (r.needCode) { log('موزیلا کد ایمیل خواست.'); st.busy = ''; await refresh(); focusForm(); return; }
                signedInDone(em);
            } else if (what === 'code') {
                const c = String(st.form.code || '').trim();
                if (!c) throw Object.assign(new Error('کد ۶ رقمی ایمیل را وارد کنید.'), { code: 'INPUT' });
                st.busy = 'code'; paint();
                await api('fenix/code', { code: c });
                st.form.code = '';
                st.challenge = false;
                signedInDone(D().pending ? D().pending.email : st.form.email);
            } else if (what === 'cancel') {
                st.busy = 'cancel'; paint();
                await api('fenix/cancel', {});
                st.form.code = ''; st.form.pass = '';
                log('ورود نیمه‌کاره کنار گذاشته شد.');
            } else if (what === 'challenge') {
                const again = st.retry;
                st.busy = 'challenge'; paint();
                log('صفحهٔ بررسی موزیلا باز شد.');
                const r = await api('fenix/challenge', { host: st.challengeHost || '', purpose: again || '' });
                st.challenge = false; st.retry = ''; st.challengeHost = '';
                st.busy = '';
                // An account signed in to on that page is added, whatever the check was for — and a
                // sign-in it was for needs nothing more.
                if (r.signedIn) {
                    st.form.pass = ''; st.form.code = '';
                    signedInDone(r.signedIn);
                    if (again === 'connect') { connect(); return; }
                } else if (again === 'connect' || again === 'quota') {
                    log('صفحهٔ موزیلا بسته شد — دوباره امتحان می‌شود.');
                    if (again === 'connect') { connect(); return; }
                    await refreshQuotas(true); return;
                } else log('صفحهٔ موزیلا بسته شد.');
            }
        } catch (e) { fail(e, what); }
        st.busy = '';
        await refresh();
    }

    function signedInDone(em) {
        log(`✅ حساب ${em} اضافه شد.`);
        st.adding = false;
        st.note = 'حساب اضافه شد. حجم ماهانه‌اش با اولین اتصال خوانده می‌شود.';
        if (typeof window.toast === 'function') window.toast('حساب فایرفاکس اضافه شد');
        // A first account on the home page: the server list follows, so «سریع‌ترین» has something to rank.
        api('fenix/servers', {}).catch(() => {});
    }

    async function refreshQuotas(force) {
        if (st.busy) return;
        st.busy = 'quota'; st.quotaAskedAt = Date.now(); st.note = '';
        paint();
        try {
            const r = await api('fenix/quota', { force: !!force });
            const bad = (r.accounts || []).filter((x) => !x.ok);
            if (bad.length) st.note = bad.map((x) => x.error).join(' — ');
        } catch (e) { fail(e, 'quota'); st.note = e.message; }
        st.busy = '';
        await refresh();
    }

    async function removeAccount(id) {
        const a = accounts().find((x) => x.id === id);
        if (!a) return;
        const inUse = isOn() && session().account && session().account.id === id;
        const ok = await window.uiModal.confirm({
            title: 'حذف این حساب؟',
            message: `حساب ${a.email} از این کامپیوتر پاک می‌شود (خود حساب فایرفاکس سر جایش می‌ماند).` + (inUse ? '\n\nهمین حساب الان اتصال را حمل می‌کند؛ با حذفش، اتصال در تمدید بعدیِ پاس — حداکثر حدود یک ساعت دیگر — قطع می‌شود.' : ''),
            confirmLabel: 'حذف', cancelLabel: 'انصراف', danger: true,
        });
        if (!ok) return;
        st.busy = 'signout'; paint();
        try {
            await api('fenix/signout', { id });
            if (prefs().account === id) setPrefs({ account: '' });
            log(`حساب ${a.email} حذف شد.`);
        } catch (e) { fail(e, 'signout'); }
        st.busy = '';
        await refresh();
    }

    function chooseAccount(id) {
        setPrefs({ account: id || '' });
        const s = session();
        st.note = isOn() && s.accountId !== id ? 'حساب تازه از اتصال بعدی اعمال می‌شود.' : '';
        paint();
    }

    async function ping() {
        if (st.busy) return;
        st.busy = 'ping'; paint();
        try { await api('fenix/servers', { force: true }); log('سنجش سرورها شروع شد.'); }
        catch (e) { fail(e, 'ping'); }
        st.busy = '';
        await refresh();
    }

    /** The power button: connect, cancel the attempt in progress, or disconnect. */
    function toggle() {
        if (st.stopping) return;
        if (isBusy() || isOn()) return stop();
        return connect();
    }

    /** Connect — also while connected, which replaces the live config with the newly chosen one. */
    async function connect() {
        if (!signedIn().length) { goSec('accounts'); return; }
        const p = prefs();
        const my = ++st.attempt;
        st.connecting = true; st.err = ''; st.errFrom = ''; st.tunError = ''; st.challenge = false; st.switchErr = '';
        const acct = accounts().find((a) => a.id === activeAccountId());
        log(`— اتصال: ${p.country === 'fastest' ? 'سریع‌ترین' : countryName(p.country)}، ${acct ? acct.email : '—'}، ${COVERAGE.find((c) => c.id === p.coverage).title}`);
        paint();
        let r;
        try {
            r = await api('fenix/connect', { country: p.country, accountId: activeAccountId() || null });
        } catch (e) {
            if (my !== st.attempt) return;
            st.connecting = false;
            fail(e, 'connect');
            await refresh();
            // A change of country that failed while connected: the old connection is still up (the
            // server kept it), so the reason goes under the «connected» headline, not in its place.
            if (isOn()) { st.switchErr = e.message; paint(); return; }
            // A refused connect the assistant can do better with than this line: it can race every
            // engine and name one that is open. «No account», «quota» and the browser check are not that.
            if (!['NO_ACCOUNT', 'SIGNED_OUT', 'QUOTA', 'CHALLENGE', 'BUSY'].includes(e.code) && window.MVAssistant && typeof window.MVAssistant.trouble === 'function') {
                try { window.MVAssistant.trouble({ kind: 'engine-failed', detail: 'FENIX', source: 'fenix', raw: e.message }); } catch (e2) { /* the hero says it */ }
            }
            return;
        }
        if (my !== st.attempt || !r.session || r.session.cancelled) return;
        st.data = Object.assign({}, st.data, { session: r.session });
        const ses = r.session;
        log(`✅ وصل شد — خروج از ${countryName(ses.exit && ses.exit.loc) || '؟'}${ses.exit && ses.exit.ip ? ' (' + ses.exit.ip + ')' : ''}${ses.http1 ? ' — HTTP/1.1' : ''}`);
        // The chosen path is PART of connecting, not a second decision afterwards (fronts.js).
        st.routing = true;
        await refresh(true);
        if (my !== st.attempt) return;
        await applyCoverage(p.coverage);
        if (my !== st.attempt) return;
        st.routing = false;
        st.connecting = false;
        await refresh();
    }

    async function stop() {
        st.attempt++;
        st.stopping = true; st.connecting = false; st.routing = false; st.switchErr = '';
        paint();
        try { await api('fenix/stop', {}); log('— قطع شد'); }
        catch (e) { fail(e, 'stop'); }
        st.stopping = false;
        st.tunError = '';
        await refresh();
    }

    /** Put exactly one path in charge — the proxy and the tunnel are alternatives, never layers. */
    async function applyCoverage(kind) {
        const r = D().route || {};
        try {
            if (kind === 'tunnel') {
                if (!(r.tun && !r.sysProxy)) {
                    await api('v2ray/sysproxy', { enable: false }).catch(() => {});
                    await api('v2ray/tun', { enabled: true, source: 'fenix' });
                }
                log('تونل کامل سیستم روشن شد.');
            } else if (kind === 'system') {
                // The server takes the tunnel down itself when the proxy is chosen.
                if (!r.sysProxy || r.tunWanted) await api('v2ray/sysproxy', { enable: true });
                log('پروکسی کل سیستم روشن شد.');
            } else {
                if (r.tunWanted) await api('v2ray/tun', { enabled: false });
                if (r.sysProxy) await api('v2ray/sysproxy', { enable: false });
                log('فقط پورت محلی — ویندوز دست نخورد.');
            }
            st.tunError = '';
            if (typeof window.refreshSystemProxy === 'function') { try { window.refreshSystemProxy(); } catch (e) { /* another panel */ } }
            return true;
        } catch (e) {
            // The choice did not take; the page must not go on claiming it did.
            st.tunError = e.message;
            log('✗ ' + e.message);
            return false;
        }
    }

    async function setCoverage(kind) {
        if (isBusy() || st.busy) return;
        setPrefs({ coverage: kind });
        if (!(isOn() && session().live)) { paint(); return; }
        st.routing = true; paint();
        await applyCoverage(kind);
        st.routing = false;
        await refresh();
    }

    // ── Wiring ─────────────────────────────────────────────────────────────

    /** Which app owns the home-screen lamp — and the V2Ray lamp's exclusion (shell/apps.js). */
    window.MVProbe = window.MVProbe || {};
    window.MVProbe.fenix = () => { const s = session(); return s.phase === 'renewing' || (s.phase === 'on' && !!s.live); };
    window.MVProbe.owns = window.MVProbe.owns || {};
    window.MVProbe.owns.fenix = () => { const s = session(); return (s.phase === 'on' || s.phase === 'renewing') && !!s.live; };

    let built = false;
    function build() {
        const root = $('ls-fenix');
        if (!root || built) return;
        built = true;
        root.innerHTML = template();
        const wrap = $('fnx-wrap');
        wrap.querySelectorAll('.mv-side-item[data-sec]').forEach((b) => { b.onclick = () => goSec(b.getAttribute('data-sec')); });
        $('fnx-back').onclick = () => goSec('connect');
        goSec('connect');
    }

    window.initFenixModule = () => {
        build();
        refresh();
        (window.mvEvery || setInterval)(() => { if (!fetching && due()) refresh(); }, 1000);
    };
    /** apps.js calls this when the window is shown, so a hidden page repaints at once. */
    window.fenixOpen = () => { build(); refresh(); };
})();
