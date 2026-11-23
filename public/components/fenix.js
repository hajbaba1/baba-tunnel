// --- Fenix Standalone VPN — Compact Card Interface ---
//
// Modern compact single-card layout (inspired by sleek modern VPN clients).
// Interacts with /api/fenix/* and /api/v2ray/* backend endpoints.

(function () {
    'use strict';

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fa = (n) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]).replace(/(\d|[۰-۹])\.(?=\d|[۰-۹])/g, '$1٫');
    const $ = (id) => document.getElementById(id);

    let REGION_NAMES = null;
    function countryName(cc) {
        const code = String(cc || '').toUpperCase();
        if (!code) return '';
        try {
            REGION_NAMES = REGION_NAMES || new Intl.DisplayNames(['fa'], { type: 'region' });
            const n = REGION_NAMES.of(code);
            if (n && n !== code) return n;
        } catch (e) {}
        return code;
    }

    function flag(cc, w = 20) {
        const h = Math.round(w * 0.72);
        if (!cc || cc === 'fastest') {
            return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${w}px;height:${h}px;border-radius:3px;background:linear-gradient(135deg,#FF7700,#FF3D00);color:#fff;font-size:11px;"><i class="ph-fill ph-lightning"></i></span>`;
        }
        const code = String(cc).toLowerCase();
        return `<span style="display:inline-flex;width:${w}px;height:${h}px;border-radius:3px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.3);position:relative;background:#333;"><img src="/assets/flags/${esc(code)}.svg" alt="${esc(code)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.remove()"></span>`;
    }

    function obscureEmail(em) {
        if (!em || typeof em !== 'string') return '';
        const parts = em.split('@');
        if (parts.length !== 2) return em;
        const name = parts[0];
        const domain = parts[1];
        const visible = name.length <= 3 ? name[0] + '**' : name.slice(0, 3) + '***';
        return `${visible}@${domain}`;
    }

    const gb = (b) => (b == null ? '—' : fa((b / 1073741824).toFixed(b >= 10 * 1073741824 ? 0 : 1)));
    const ms = (v) => `${fa(v)} میلی‌ثانیه`;

    function quotaBytes(q) {
        if (!q) return null;
        if (typeof q === 'number') return q;
        if (typeof q === 'object') {
            if (q.unlimited) return 'unlimited';
            if (q.remaining != null) return q.remaining;
            if (q.limit != null) return q.limit;
        }
        return null;
    }

    function formatQuota(q) {
        const bytes = quotaBytes(q);
        if (bytes === 'unlimited') return 'نامحدود';
        if (bytes == null) return '—';
        return `${gb(bytes)} گیگابایت`;
    }

    // ── State ──────────────────────────────────────────────────────────────
    const st = {
        data: null,            // last GET /api/fenix response
        busy: '',              // in-flight action: 'connect' | 'stop' | 'web' | 'challenge' | 'quota' | 'signout'
        connecting: false,
        stopping: false,
        routing: false,
        err: '',
        challenge: false,
        challengeHost: '',
        retry: '',
        serverSearch: '',
        serverSheetOpen: false,
        drawerOpen: false,
        drawerTab: 'accounts', // 'accounts' | 'advanced' | 'log' | 'about'
        pinging: false,
        log: [],
    };

    const PREF = 'fenix_prefs';
    const store = () => window.PersistentStorage || localStorage;
    function prefs() {
        let p = {};
        try { p = JSON.parse(store().getItem(PREF) || '{}') || {}; } catch (e) { p = {}; }
        const coverage = ['proxy', 'system', 'tunnel'].includes(p.coverage) ? p.coverage : 'system';
        return {
            country: /^[A-Z]{2}$/.test(p.country || '') ? p.country : 'fastest',
            account: /^[0-9a-f]{10}$/.test(p.account || '') ? p.account : '',
            coverage,
        };
    }
    function setPrefs(patch) {
        try { store().setItem(PREF, JSON.stringify(Object.assign({}, prefs(), patch))); } catch (e) {}
    }

    const D = () => st.data || {};
    const session = () => D().session || {};
    const isOn = () => session().phase === 'on';
    const isConnecting = () => st.connecting || session().phase === 'connecting' || session().phase === 'renewing';
    const accounts = () => (D().accounts || []).filter((a) => !a.signedOut);
    const activeAccount = () => {
        const accs = accounts();
        const want = prefs().account;
        return accs.find((a) => a.id === want) || accs[0] || null;
    };

    // ── API Communication ──────────────────────────────────────────────────
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
            const e = new Error(d.error || `خطا در برقراری ارتباط (کد ${fa(r.status)}).`);
            e.code = d.code || null;
            e.host = d.host || null;
            throw e;
        }
        return d;
    }

    function log(line) {
        const t = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        st.log.push(`${t}  ${line}`);
        if (st.log.length > 200) st.log.shift();
        renderLog();
    }

    // ── Actions ────────────────────────────────────────────────────────────
    async function refresh(force) {
        try {
            const d = await api('fenix');
            st.data = d;
            // auto-trigger server fetch on first load
            if (!st.data.servers && !st.busy) {
                api('fenix/servers', { force: true }).catch(() => {});
            }
            paint();
        } catch (e) {
            st.err = e.message;
            paint();
        }
    }

    async function toggleConnect() {
        if (st.busy) return;
        if (isOn() || isConnecting()) {
            await stop();
        } else {
            await connect();
        }
    }

    async function connect() {
        const acc = activeAccount();
        if (!acc) {
            openDrawer('accounts');
            log('برای اتصال، ابتدا وارد حساب فایرفاکس خود شوید.');
            return;
        }

        const p = prefs();
        st.busy = 'connect';
        st.connecting = true;
        st.err = '';
        st.challenge = false;
        log(`— اتصال: ${p.country === 'fastest' ? 'سریع‌ترین' : countryName(p.country)} (${obscureEmail(acc.email)})`);
        paint();

        try {
            const r = await api('fenix/connect', { country: p.country, accountId: acc.id });
            st.data = Object.assign({}, st.data, { session: r.session });
            const ses = r.session;
            log(`✅ متصل شد — خروج از ${countryName(ses.exit && ses.exit.loc) || countryName(p.country)}`);
            st.routing = true;
            paint();
            await applyCoverage(p.coverage);
            st.routing = false;
        } catch (e) {
            st.err = e.message;
            if (e.code === 'CHALLENGE') {
                st.challenge = true;
                st.challengeHost = e.host || '';
                log('موزیلا بررسی مرورگر خواست.');
            } else {
                log(`✗ خطا در اتصال: ${e.message}`);
            }
        } finally {
            st.busy = '';
            st.connecting = false;
            await refresh();
        }
    }

    async function stop() {
        st.busy = 'stop';
        st.stopping = true;
        paint();
        log('— قطع اتصال…');
        try {
            await api('fenix/stop', {});
            log('قطع شد.');
        } catch (e) {
            log(`✗ خطا در قطع اتصال: ${e.message}`);
        } finally {
            st.busy = '';
            st.stopping = false;
            await refresh();
        }
    }

    async function applyCoverage(kind) {
        try {
            if (kind === 'tunnel') {
                await api('v2ray/sysproxy', { enable: false }).catch(() => {});
                await api('v2ray/tun', { enabled: true });
                log('تونل کامل سیستم فعال شد.');
            } else if (kind === 'system') {
                await api('v2ray/tun', { enabled: false }).catch(() => {});
                await api('v2ray/sysproxy', { enable: true });
                log('پروکسی سیستم فعال شد.');
            } else {
                await api('v2ray/tun', { enabled: false }).catch(() => {});
                await api('v2ray/sysproxy', { enable: false }).catch(() => {});
                log('حالت فقط پورت محلی فعال شد.');
            }
        } catch (e) {
            log(`✗ خطا در تنظیم پروکسی: ${e.message}`);
        }
    }

    async function setCoverage(kind) {
        if (st.busy) return;
        setPrefs({ coverage: kind });
        paint();
        if (isOn()) {
            st.routing = true;
            paint();
            await applyCoverage(kind);
            st.routing = false;
            await refresh();
        }
    }

    async function selectCountry(cc) {
        setPrefs({ country: cc });
        closeServerSheet();
        log(`کشور انتخاب شد: ${cc === 'fastest' ? 'سریع‌ترین' : countryName(cc)}`);
        paint();
        if (isOn()) {
            await connect();
        }
    }

    async function webSignIn() {
        st.busy = 'web';
        st.err = '';
        paint();
        log('— ورود در صفحهٔ موزیلا…');
        try {
            const r = await api('fenix/challenge', { host: st.challengeHost || '', purpose: 'signin' });
            st.challenge = false;
            st.challengeHost = '';
            if (r.signedIn) {
                log(`✅ حساب ${obscureEmail(r.signedIn)} اضافه شد.`);
                await refresh();
            } else {
                log('پنجرهٔ موزیلا بدون ورود بسته شد.');
            }
        } catch (e) {
            st.err = e.message;
            log(`✗ خطا در ورود: ${e.message}`);
        } finally {
            st.busy = '';
            paint();
        }
    }

    async function signOutAccount(id) {
        if (!confirm('آیا از خروج این حساب مطمئن هستید؟')) return;
        try {
            await api('fenix/signout', { id });
            log('حساب حذف شد.');
            await refresh();
        } catch (e) {
            alert(e.message);
        }
    }

    async function refreshQuota() {
        const btn = $('fnx-refresh-quota');
        if (btn) btn.classList.add('is-spinning');
        try {
            await api('fenix/quota', { force: true });
            log('سهمیه تازه شد.');
            await refresh();
        } catch (e) {
            log(`✗ خطا در دریافت سهمیه: ${e.message}`);
        } finally {
            if (btn) btn.classList.remove('is-spinning');
        }
    }

    async function pingAllServers() {
        if (st.pinging) return;
        st.pinging = true;
        const btn = $('fnx-ping-all-btn');
        const iconBtn = $('fnx-quick-ping-btn');
        if (btn) {
            btn.classList.add('is-measuring');
            btn.innerHTML = `<i class="ph-bold ph-spinner"></i> در حال پینگ…`;
        }
        if (iconBtn) iconBtn.classList.add('is-spinning');
        log('— سنجش پینگ و کیفیت اتصال به تمام سرورها…');

        // Reset visible pings immediately so user gets real-time measurement feedback
        if (st.data && st.data.pings) {
            st.data.pings = {};
        }
        renderServerList();

        try {
            await api('fenix/ping');
            // Poll for completion up to 20 seconds
            for (let i = 0; i < 20; i++) {
                await new Promise((r) => setTimeout(r, 1000));
                const d = await api('fenix');
                st.data = d;
                renderServerList();
                renderServerRow();
                if (!d.ping || !d.ping.running) break;
            }
            log('✅ نتیجه سنجش پینگ تمام سرورها دریافت شد.');
            if (window.toast) window.toast('پینگ سرورها به‌روزرسانی شد.');
        } catch (e) {
            log(`✗ خطا در سنجش پینگ: ${e.message}`);
        } finally {
            st.pinging = false;
            if (btn) {
                btn.classList.remove('is-measuring');
                btn.innerHTML = `<i class="ph-bold ph-lightning"></i> تست پینگ سرورها`;
            }
            if (iconBtn) iconBtn.classList.remove('is-spinning');
            renderServerList();
            renderServerRow();
        }
    }

    async function toggleKillSwitch(enabled) {
        if (st.busy) return;
        st.busy = 'killswitch';
        try {
            const res = await api('fenix/killswitch', { enabled });
            if (st.data) st.data.killSwitch = res;
            setPrefs({ killSwitch: !!enabled });
            log(enabled ? '🛡️ قابلیت کیل‌سوئیچ فعال شد (محافظت در برابر نشت IP).' : 'سپر کیل‌سوئیچ غیرفعال شد.');
            paint();
            if (window.toast) window.toast(enabled ? 'کیل‌سوئیچ فعال شد.' : 'کیل‌سوئیچ غیرفعال شد.');
        } catch (e) {
            log(`✗ خطا در تغییر وضعیت کیل‌سوئیچ: ${e.message}`);
        } finally {
            st.busy = '';
            paint();
        }
    }

    async function toggleAutoReconnect(enabled) {
        try {
            await api('fenix/autoreconnect', { enabled });
            log(enabled ? '🔄 اتصال مجدد خودکار فعال شد.' : 'اتصال مجدد خودکار غیرفعال شد.');
            await refresh();
        } catch (e) {
            log(`✗ خطا در تغییر وضعیت اتصال مجدد: ${e.message}`);
        }
    }

    // ── Sheet & Drawer Toggles ─────────────────────────────────────────────
    function openServerSheet() {
        st.serverSheetOpen = true;
        st.serverSearch = '';
        const sheet = $('fnx-server-sheet');
        if (sheet) {
            sheet.hidden = false;
            sheet.style.display = 'flex';
            renderServerList();
            const input = $('fnx-server-search');
            if (input) { input.value = ''; input.focus(); }
        }
    }

    function closeServerSheet() {
        st.serverSheetOpen = false;
        const sheet = $('fnx-server-sheet');
        if (sheet) {
            sheet.hidden = true;
            sheet.style.display = 'none';
        }
    }

    function openDrawer(tab = 'accounts') {
        st.drawerOpen = true;
        st.drawerTab = tab;
        const drawer = $('fnx-drawer');
        if (drawer) {
            drawer.hidden = false;
            drawer.style.display = 'flex';
            switchDrawerTab(tab);
        }
    }

    function closeDrawer() {
        st.drawerOpen = false;
        const drawer = $('fnx-drawer');
        if (drawer) {
            drawer.hidden = true;
            drawer.style.display = 'none';
        }
    }

    function switchDrawerTab(tab) {
        st.drawerTab = tab;
        document.querySelectorAll('.fnx-dtab').forEach((b) => {
            b.classList.toggle('is-active', b.getAttribute('data-dtab') === tab);
        });
        document.querySelectorAll('.fnx-dpane').forEach((p) => {
            p.classList.toggle('is-active', p.id === `fnx-dpane-${tab}`);
        });
        if (tab === 'accounts') renderDrawerAccounts();
        if (tab === 'log') renderLog();
    }

    // ── Rendering ──────────────────────────────────────────────────────────
    function paint() {
        renderTopBar();
        renderPowerButton();
        renderBanner();
        renderKillSwitchBanner();
        renderServerRow();
        renderAccountRow();
        renderModeSwitch();
        renderFooter();
    }

    function renderKillSwitchBanner() {
        const banner = $('fnx-ks-banner');
        const ks = st.data && st.data.killSwitch;
        const engaged = !!(ks && ks.engaged && !isOn());
        if (banner) {
            banner.hidden = !engaged;
            banner.style.display = engaged ? 'flex' : 'none';
        }
        const toggle = $('fnx-ks-toggle');
        if (toggle && ks) {
            toggle.checked = !!ks.enabled;
        }
        const autoToggle = $('fnx-autoreconnect-toggle');
        if (autoToggle) {
            autoToggle.checked = (session().autoReconnect !== undefined) ? !!session().autoReconnect : true;
        }
    }

    function renderTopBar() {
        const pill = $('fnx-status-pill');
        if (!pill) return;

        pill.className = 'fnx-status-pill';
        const ses = session();
        if (ses.step === 'reconnect' || ses.reconnectAttempts > 0) {
            pill.classList.add('is-busy');
            pill.innerHTML = `<span class="fnx-status-dot"></span> تلاش مجدد (${fa(ses.reconnectAttempts || 1)})…`;
        } else if (isConnecting() || st.routing) {
            pill.classList.add('is-busy');
            pill.innerHTML = '<span class="fnx-status-dot"></span> در حال اتصال…';
        } else if (isOn()) {
            pill.classList.add('is-on');
            pill.innerHTML = '<span class="fnx-status-dot"></span> متصل';
        } else {
            pill.innerHTML = '<span class="fnx-status-dot"></span> خاموش';
        }
    }

    function renderPowerButton() {
        const btn = $('fnx-power-btn');
        const wrap = $('fnx-power-wrap');
        const title = $('fnx-power-title');
        const sub = $('fnx-power-sub');
        if (!btn) return;

        btn.className = 'fnx-power-btn';
        if (wrap) wrap.className = 'fnx-power-btn-wrap';

        const ses = session();
        if (ses.step === 'reconnect' || ses.reconnectAttempts > 0) {
            btn.classList.add('is-busy');
            if (wrap) wrap.classList.add('is-busy');
            const target = ses.country || prefs().country;
            const cnt = ses.reconnectAttempts || 1;
            if (title) title.textContent = `تلاش مجدد برای اتصال (${fa(cnt)})…`;
            if (sub) sub.textContent = `${countryName(target)} — برای لغو کلیک کنید`;
        } else if (isConnecting() || st.routing) {
            btn.classList.add('is-busy');
            if (wrap) wrap.classList.add('is-busy');
            if (title) title.textContent = st.routing ? 'در حال تنظیم مسیر…' : 'در حال برقراری اتصال…';
            if (sub) sub.textContent = 'برای لغو کلیک کنید';
        } else if (isOn()) {
            btn.classList.add('is-on');
            const exit = (ses.exit && ses.exit.loc) || prefs().country;
            if (title) title.textContent = 'شما متصل هستید';
            if (sub) sub.textContent = `خروج از ${countryName(exit) || exit} — برای قطع کلیک کنید`;
        } else {
            btn.classList.add('is-off');
            if (title) title.textContent = 'برای اتصال کلیک کنید';
            if (sub) sub.textContent = 'FENIX Standalone VPN';
        }
    }

    function renderBanner() {
        const banner = $('fnx-alert-banner');
        const text = $('fnx-alert-text');
        const btn = $('fnx-alert-btn');
        if (!banner) return;

        if (st.challenge) {
            banner.hidden = false;
            banner.className = 'fnx-alert-banner is-warn';
            if (text) text.textContent = 'موزیلا برای ادامه، تأیید مرورگر می‌خواهد.';
            if (btn) {
                btn.hidden = false;
                btn.textContent = 'باز کردن صفحه موزیلا';
                btn.onclick = () => webSignIn();
            }
        } else if (st.err) {
            banner.hidden = false;
            banner.className = 'fnx-alert-banner';
            if (text) text.textContent = st.err;
            if (btn) {
                btn.hidden = false;
                btn.textContent = 'بستن';
                btn.onclick = () => { st.err = ''; paint(); };
            }
        } else {
            banner.hidden = true;
        }
    }

    function renderServerRow() {
        const flagHost = $('fnx-server-flag');
        const nameHost = $('fnx-server-name');
        const pingHost = $('fnx-server-ping');
        const p = prefs();
        const cc = p.country;

        if (flagHost) flagHost.innerHTML = flag(cc, 22);
        if (nameHost) nameHost.textContent = cc === 'fastest' ? 'سریع‌ترین (انتخاب خودکار)' : countryName(cc);

        if (pingHost) {
            const pings = D().pings || {};
            const srvs = D().servers || [];
            let val = pings[cc];
            if (val == null) {
                const found = srvs.find((s) => s.country === cc);
                if (found && found.ms != null) val = found.ms;
            }
            if (val != null && val > 0) {
                const dotClass = val < 180 ? 'is-good' : val < 320 ? 'is-mid' : 'is-slow';
                pingHost.innerHTML = `<span class="fnx-ping-dot ${dotClass}"></span> ${fa(val)} ms`;
            } else if (val === -1) {
                pingHost.innerHTML = `<span class="fnx-ping-dot is-slow"></span> خطای پینگ`;
            } else {
                pingHost.innerHTML = '—';
            }
        }
    }

    function renderAccountRow() {
        const valHost = $('fnx-account-val');
        const actHost = $('fnx-account-act');
        const acc = activeAccount();

        if (acc) {
            if (valHost) valHost.textContent = obscureEmail(acc.email);
            if (actHost) {
                actHost.innerHTML = `<button type="button" class="fnx-btn-secondary" style="font-size:11px;padding:3px 8px;">مدیریت</button>`;
                actHost.onclick = (e) => { e.stopPropagation(); openDrawer('accounts'); };
            }
        } else {
            if (valHost) valHost.textContent = 'حسابی متصل نیست';
            if (actHost) {
                actHost.innerHTML = `<button type="button" class="fnx-alert-btn" style="padding:4px 10px;">ورود به موزیلا</button>`;
                actHost.onclick = (e) => { e.stopPropagation(); webSignIn(); };
            }
        }
    }

    function renderModeSwitch() {
        const cur = prefs().coverage;
        document.querySelectorAll('.fnx-seg-btn').forEach((b) => {
            b.classList.toggle('is-active', b.getAttribute('data-coverage') === cur);
        });
    }

    function renderFooter() {
        const val = $('fnx-quota-val');
        const fill = $('fnx-quota-fill');
        const acc = activeAccount();

        const qb = acc ? quotaBytes(acc.quota) : null;
        if (acc && qb !== null) {
            if (qb === 'unlimited') {
                if (val) val.textContent = 'سهمیه نامحدود';
                if (fill) fill.style.width = '100%';
            } else {
                const total = (acc.quota && acc.quota.limit) || (50 * 1073741824);
                const percent = Math.max(0, Math.min(100, (qb / total) * 100));
                if (val) val.textContent = `${gb(qb)} گیگابایت باقی‌مانده`;
                if (fill) fill.style.width = `${percent}%`;
            }
        } else {
            if (val) val.textContent = acc ? '۵۰ گیگابایت ماهانه' : '۵۰ گیگابایت ماهانه با حساب فایرفاکس';
            if (fill) fill.style.width = '100%';
        }
    }

    function renderServerList() {
        const host = $('fnx-server-list');
        if (!host) return;

        const current = prefs().country;
        const query = (st.serverSearch || '').trim().toLowerCase();
        const srvs = D().servers || [];
        const pings = D().pings || {};

        let itemsHtml = `
          <div class="fnx-server-item ${current === 'fastest' ? 'is-selected' : ''}" data-cc="fastest">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:17px;border-radius:3px;background:var(--fnx-flame-grad);color:#fff;font-size:12px;"><i class="ph-fill ph-lightning"></i></span>
            <div class="fnx-server-name">سریع‌ترین سرور (انتخاب خودکار)</div>
            <span class="fnx-ping-pill">پیشنهادی</span>
          </div>`;

        srvs.forEach((s) => {
            const cc = s.country;
            const name = countryName(cc);
            if (query && !name.toLowerCase().includes(query) && !cc.toLowerCase().includes(query)) return;
            const pingVal = (pings[cc] != null) ? pings[cc] : (s.ms != null ? s.ms : null);
            let pingDot = '';
            let pingText = '—';
            if (st.pinging) {
                pingText = '<i class="ph-bold ph-spinner is-spinning" style="font-size:12px;"></i>';
            } else if (pingVal != null && pingVal > 0) {
                pingDot = pingVal < 180 ? 'is-good' : pingVal < 320 ? 'is-mid' : 'is-slow';
                pingText = `${fa(pingVal)} ms`;
            } else if (pingVal === -1) {
                pingDot = 'is-slow';
                pingText = 'تایم‌اوت';
            }

            itemsHtml += `
              <div class="fnx-server-item ${current === cc ? 'is-selected' : ''}" data-cc="${esc(cc)}">
                ${flag(cc, 24)}
                <div class="fnx-server-name">${esc(name)}</div>
                <span class="fnx-ping-pill">
                  ${pingDot ? `<span class="fnx-ping-dot ${pingDot}"></span>` : ''}
                  ${pingText}
                </span>
              </div>`;
        });

        host.innerHTML = itemsHtml;
        host.querySelectorAll('.fnx-server-item').forEach((item) => {
            item.onclick = () => selectCountry(item.getAttribute('data-cc'));
        });
    }

    function renderDrawerAccounts() {
        const host = $('fnx-accounts-content');
        if (!host) return;

        const accs = accounts();
        let html = '';

        if (accs.length > 0) {
            html += `<div class="fnx-sub-title">حساب‌های متصل:</div>`;
            accs.forEach((a) => {
                html += `
                  <div class="fnx-sub-card">
                    <div class="fnx-sub-line">
                      <span>ایمیل:</span>
                      <strong>${obscureEmail(a.email)}</strong>
                    </div>
                    <div class="fnx-sub-line">
                      <span>سهمیه باقی‌مانده:</span>
                      <strong>${formatQuota(a.quota)}</strong>
                    </div>
                    <div style="margin-top:10px;display:flex;justify-content:flex-end;">
                      <button type="button" class="fnx-btn-danger" data-signout="${esc(a.id)}">خروج از حساب</button>
                    </div>
                  </div>`;
            });
        } else {
            html += `
              <div class="fnx-sub-card" style="text-align:center;padding:18px;">
                <p style="font-size:12.5px;color:var(--fnx-text-2);margin-bottom:12px;">هنوز هیچ حسابی متصل نشده است.</p>
                <p style="font-size:11.5px;color:var(--fnx-text-3);margin-bottom:14px;">برای دریافت ۵۰ گیگابایت سهمیهٔ ماهانه، با حساب فایرفاکس خود وارد شوید.</p>
              </div>`;
        }

        html += `
          <button type="button" class="fnx-btn-primary" id="fnx-add-account-btn" style="margin-top:8px;">
            <i class="ph-bold ph-plus"></i> ورود با حساب فایرفاکس
          </button>`;

        host.innerHTML = html;
        host.querySelectorAll('[data-signout]').forEach((btn) => {
            btn.onclick = () => signOutAccount(btn.getAttribute('data-signout'));
        });
        const addBtn = $('fnx-add-account-btn');
        if (addBtn) addBtn.onclick = () => { closeDrawer(); webSignIn(); };
    }

    function renderLog() {
        const box = $('fnx-drawer-log');
        if (!box) return;
        box.textContent = st.log.length ? st.log.join('\n') : 'هنوز گزارشی ثبت نشده است.';
        box.scrollTop = box.scrollHeight;
    }

    // ── Template Construction ──────────────────────────────────────────────
    function template() {
        return `
<div class="fnx-app">
  <!-- Top Bar -->
  <header class="fnx-topbar">
    <div class="fnx-brand">
      <div class="fnx-brand-flame"><i class="ph-fill ph-fire"></i></div>
      <div class="fnx-brand-name">FENIX</div>
    </div>
    <div class="fnx-topbar-actions">
      <div class="fnx-status-pill" id="fnx-status-pill">
        <span class="fnx-status-dot"></span> خاموش
      </div>
      <button type="button" class="fnx-btn-icon" id="fnx-menu-btn" title="منو و تنظیمات" aria-label="منو">
        <i class="ph-bold ph-list"></i>
      </button>
    </div>
  </header>

  <!-- Body -->
  <main class="fnx-body">
    <!-- Power Section -->
    <div class="fnx-power-stage">
      <div class="fnx-power-btn-wrap" id="fnx-power-wrap">
        <div class="fnx-power-ring"></div>
        <button type="button" class="fnx-power-btn is-off" id="fnx-power-btn" aria-label="دکمه اتصال">
          <i class="ph-fill ph-power"></i>
        </button>
      </div>
      <div class="fnx-power-status">
        <div class="fnx-power-title" id="fnx-power-title">برای اتصال کلیک کنید</div>
        <div class="fnx-power-sub" id="fnx-power-sub">FENIX Standalone VPN</div>
      </div>
    </div>

    <!-- Kill Switch Engaged Alert Banner -->
    <div class="fnx-ks-banner" id="fnx-ks-banner" hidden>
      <i class="ph-fill ph-shield-warning"></i>
      <div class="fnx-ks-text">
        <strong>سپر کیل‌سوئیچ فعال است:</strong> اینترنت جهت جلوگیری از نشت IP مسدود شد.
      </div>
      <button type="button" class="fnx-ks-action" id="fnx-ks-quick-disable">غیرفعال‌سازی</button>
    </div>

    <!-- Alert / Challenge Banner -->
    <div class="fnx-alert-banner" id="fnx-alert-banner" hidden>
      <i class="ph-fill ph-warning-circle"></i>
      <div class="fnx-alert-text" id="fnx-alert-text"></div>
      <button type="button" class="fnx-alert-btn" id="fnx-alert-btn" hidden></button>
    </div>

    <!-- Server Row -->
    <div class="fnx-card" id="fnx-server-card">
      <div class="fnx-card-icon" id="fnx-server-flag">
        ${flag('fastest', 22)}
      </div>
      <div class="fnx-card-center">
        <div class="fnx-card-label">کشور خروج</div>
        <div class="fnx-card-value" id="fnx-server-name">سریع‌ترین (انتخاب خودکار)</div>
      </div>
      <div class="fnx-card-trailing">
        <span class="fnx-ping-pill" id="fnx-server-ping">—</span>
        <i class="ph-bold ph-caret-down fnx-caret-icon"></i>
      </div>
    </div>

    <!-- Account Row -->
    <div class="fnx-card" id="fnx-account-card">
      <div class="fnx-card-icon">
        <i class="ph-fill ph-user-circle" style="font-size:22px;color:var(--fnx-flame-1)"></i>
      </div>
      <div class="fnx-card-center">
        <div class="fnx-card-label">حساب فایرفاکس</div>
        <div class="fnx-card-value" id="fnx-account-val">حسابی متصل نیست</div>
      </div>
      <div class="fnx-card-trailing" id="fnx-account-act">
        <button type="button" class="fnx-alert-btn">ورود</button>
      </div>
    </div>

    <!-- Mode Selector -->
    <div class="fnx-mode-card">
      <div class="fnx-mode-header">حالت عبور ترافیک:</div>
      <div class="fnx-seg-switch" role="radiogroup">
        <button type="button" class="fnx-seg-btn" data-coverage="proxy">فقط پورت</button>
        <button type="button" class="fnx-seg-btn is-active" data-coverage="system">پروکسی ویندوز</button>
        <button type="button" class="fnx-seg-btn" data-coverage="tunnel">تونل کامل</button>
      </div>
    </div>
  </main>

  <!-- Footer Quota Bar -->
  <footer class="fnx-footer">
    <div class="fnx-quota-row">
      <span class="fnx-quota-title">سهمیه ترافیک موزیلا:</span>
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="fnx-quota-val" id="fnx-quota-val">۵۰ گیگابایت ماهانه</span>
        <button type="button" class="fnx-btn-icon" id="fnx-refresh-quota" style="width:20px;height:20px;font-size:12px;" title="تازه کردن سهمیه">
          <i class="ph-bold ph-arrows-clockwise"></i>
        </button>
      </div>
    </div>
    <div class="fnx-progress-track">
      <div class="fnx-progress-fill" id="fnx-quota-fill" style="width:100%;"></div>
    </div>
    <div style="text-align:center; font-size:10.5px; color:var(--fnx-text-3); margin-top:2px;">
      طراحی و توسعه : <strong style="color:var(--fnx-flame-1); font-weight:600;">Hajbaba</strong>
    </div>
  </footer>

  <!-- Server Selection Sheet -->
  <div class="fnx-sheet" id="fnx-server-sheet" hidden>
    <div class="fnx-sheet-top">
      <div class="fnx-sheet-title">انتخاب کشور خروج</div>
      <div style="display:flex;align-items:center;gap:6px;">
        <button type="button" class="fnx-btn-icon" id="fnx-quick-ping-btn" title="تست پینگ همه سرورها" aria-label="تست پینگ">
          <i class="ph-bold ph-lightning"></i>
        </button>
        <button type="button" class="fnx-btn-icon" id="fnx-close-server-sheet"><i class="ph-bold ph-x"></i></button>
      </div>
    </div>
    <div class="fnx-search-wrap">
      <i class="ph-bold ph-magnifying-glass" style="color:var(--fnx-text-3);"></i>
      <input type="text" class="fnx-search-input" id="fnx-server-search" placeholder="جستجوی نام یا کد کشور…" />
    </div>
    <div class="fnx-ping-bar">
      <div class="fnx-ping-info">
        <i class="ph-bold ph-activity" style="color:var(--fnx-flame-1)"></i>
        <span id="fnx-ping-meta">تأخیر و پینگ سرورها</span>
      </div>
      <button type="button" class="fnx-ping-action-btn" id="fnx-ping-all-btn">
        <i class="ph-bold ph-lightning"></i> تست پینگ سرورها
      </button>
    </div>
    <div class="fnx-server-list custom-scrollbar" id="fnx-server-list"></div>
  </div>

  <!-- Settings & Drawer Panel -->
  <div class="fnx-drawer-overlay" id="fnx-drawer" hidden>
    <div class="fnx-drawer-panel">
      <div class="fnx-drawer-head">
        <div class="fnx-drawer-title"><i class="ph-fill ph-gear" style="color:var(--fnx-flame-1)"></i> تنظیمات و درباره</div>
        <button type="button" class="fnx-btn-icon" id="fnx-close-drawer"><i class="ph-bold ph-x"></i></button>
      </div>
      <div class="fnx-drawer-tabs">
        <button type="button" class="fnx-dtab is-active" data-dtab="accounts">حساب‌ها</button>
        <button type="button" class="fnx-dtab" data-dtab="advanced">تنظیمات</button>
        <button type="button" class="fnx-dtab" data-dtab="log">گزارش</button>
        <button type="button" class="fnx-dtab" data-dtab="about">درباره</button>
      </div>
      <div class="fnx-drawer-body custom-scrollbar">
        <!-- Accounts Pane -->
        <div class="fnx-dpane is-active" id="fnx-dpane-accounts">
          <div id="fnx-accounts-content"></div>
        </div>

        <!-- Advanced Settings Pane -->
        <div class="fnx-dpane" id="fnx-dpane-advanced">
          <!-- Kill Switch Card -->
          <div class="fnx-sub-card">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <div>
                <div class="fnx-sub-title" style="margin-bottom:3px;display:flex;align-items:center;gap:6px;">
                  <i class="ph-fill ph-shield-check" style="color:var(--fnx-flame-1);font-size:16px;"></i>
                  کیل‌سوئیچ (Kill Switch)
                </div>
                <div style="font-size:11.5px;color:var(--fnx-text-2);line-height:1.5;">
                  مسدودسازی نشت اینترنت هنگام قطع اتصال وی‌پی‌ان
                </div>
              </div>
              <label class="fnx-switch">
                <input type="checkbox" id="fnx-ks-toggle" />
                <span class="fnx-slider"></span>
              </label>
            </div>
            <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.05);font-size:11px;color:var(--fnx-text-3);line-height:1.5;">
              در صورت قطع ناگهانی ارتباط یا خاموش بودن وی‌پی‌ان، ترافیک مستقیم اینترنت مسدود می‌ماند تا آی‌پی واقعی شما نشت نکند.
            </div>
          </div>

          <!-- Auto-Reconnect Card -->
          <div class="fnx-sub-card">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <div>
                <div class="fnx-sub-title" style="margin-bottom:3px;display:flex;align-items:center;gap:6px;">
                  <i class="ph-fill ph-arrows-clockwise" style="color:var(--fnx-flame-1);font-size:16px;"></i>
                  اتصال مجدد خودکار (Auto-Reconnect)
                </div>
                <div style="font-size:11.5px;color:var(--fnx-text-2);line-height:1.5;">
                  تلاش مداوم برای اتصال مجدد با لوکیشن انتخابی در صورت قطعی
                </div>
              </div>
              <label class="fnx-switch">
                <input type="checkbox" id="fnx-autoreconnect-toggle" checked />
                <span class="fnx-slider"></span>
              </label>
            </div>
            <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.05);font-size:11px;color:var(--fnx-text-3);line-height:1.5;">
              در صورت قطع اینترنت یا افت اتصال، برنامه بلافاصله تلاش مجدد می‌کند و لوکیشن سرور انتخابی تغییر نخواهد کرد.
            </div>
          </div>

          <div class="fnx-sub-card">
            <div class="fnx-sub-title">پورت‌های محلی Xray:</div>
            <div class="fnx-sub-line">
              <span>پروکسی SOCKS5:</span>
              <code>127.0.0.1:10808</code>
            </div>
            <div class="fnx-sub-line">
              <span>پروکسی HTTP:</span>
              <code>127.0.0.1:10809</code>
            </div>
            <div class="fnx-sub-line">
              <span>باینری موتور:</span>
              <strong style="color:var(--fnx-success)">core/xray.exe</strong>
            </div>
          </div>
          <div class="fnx-sub-card">
            <div class="fnx-sub-title">بازیابی اضطراری:</div>
            <p style="font-size:11.5px;color:var(--fnx-text-2);line-height:1.6;">
              در صورت خروج ناگهانی یا کرش، سیستم به طور خودکار تنظیمات پروکسی قبلی ویندوز را از فایل پشتیبان بازیابی می‌کند.
            </p>
          </div>
        </div>

        <!-- Logs Pane -->
        <div class="fnx-dpane" id="fnx-dpane-log">
          <div class="fnx-log-console custom-scrollbar" id="fnx-drawer-log"></div>
        </div>

        <!-- About Pane -->
        <div class="fnx-dpane" id="fnx-dpane-about">
          <div class="fnx-sub-card" style="line-height:1.8;font-size:12px;">
            <p style="font-weight:700; font-size:14px; margin-bottom:2px; color:var(--fnx-text-1);">Fenix Standalone VPN v1.0.0</p>
            <p style="font-size:12px; color:var(--fnx-flame-1); font-weight:600; margin-bottom:10px;">طراحی و توسعه : Hajbaba</p>
            <p style="margin-bottom:8px; color:var(--fnx-text-2);">
              Based on MLMVPN for Windows<br>
              <a href="https://github.com/mlmvpn/mlmvpn_windows" target="_blank" style="color:var(--fnx-flame-1); text-decoration:underline;">https://github.com/mlmvpn/mlmvpn_windows</a>
            </p>
            <p style="margin-bottom:8px; color:var(--fnx-text-2);">
              Original Copyright &copy; 2026 Ehsan (MLMVPN). All rights reserved.<br>
              Licensed under the MLMVPN Attribution License 1.0.
            </p>
            <div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.06); color:var(--fnx-text-3); font-size:11px;">
              این کلاینت مستقل بر پایهٔ پروژهٔ MLMVPN توسعه یافته و از پروتکل Fastly MASQUE موزیلا و هستهٔ Xray-core بهره می‌برد.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
    }

    // ── Setup Event Listeners ──────────────────────────────────────────────
    function bindEvents() {
        // Power button
        const powerBtn = $('fnx-power-btn');
        if (powerBtn) powerBtn.onclick = () => toggleConnect();

        // Server row click -> open sheet
        const serverCard = $('fnx-server-card');
        if (serverCard) serverCard.onclick = () => openServerSheet();

        // Server sheet close
        const closeSheetBtn = $('fnx-close-server-sheet');
        if (closeSheetBtn) closeSheetBtn.onclick = () => closeServerSheet();

        // Server search filter
        const searchInput = $('fnx-server-search');
        if (searchInput) {
            searchInput.oninput = (e) => {
                st.serverSearch = e.target.value;
                renderServerList();
            };
        }

        // Account row click -> open accounts in drawer
        const accountCard = $('fnx-account-card');
        if (accountCard) {
            accountCard.onclick = () => {
                if (activeAccount()) openDrawer('accounts');
                else webSignIn();
            };
        }

        // Mode segmented buttons
        document.querySelectorAll('.fnx-seg-btn').forEach((b) => {
            b.onclick = () => setCoverage(b.getAttribute('data-coverage'));
        });

        // Refresh quota button
        const quotaRefreshBtn = $('fnx-refresh-quota');
        if (quotaRefreshBtn) quotaRefreshBtn.onclick = () => refreshQuota();

        // Menu button -> open drawer
        const menuBtn = $('fnx-menu-btn');
        if (menuBtn) menuBtn.onclick = () => openDrawer('accounts');

        // Kill Switch toggle
        const ksToggle = $('fnx-ks-toggle');
        if (ksToggle) {
            ksToggle.onchange = (e) => toggleKillSwitch(e.target.checked);
        }

        // Auto-reconnect toggle
        const autoReconnectToggle = $('fnx-autoreconnect-toggle');
        if (autoReconnectToggle) {
            autoReconnectToggle.onchange = (e) => toggleAutoReconnect(e.target.checked);
        }

        // Kill Switch quick disable button
        const ksQuickDisable = $('fnx-ks-quick-disable');
        if (ksQuickDisable) {
            ksQuickDisable.onclick = () => toggleKillSwitch(false);
        }

        // Ping buttons
        const pingAllBtn = $('fnx-ping-all-btn');
        if (pingAllBtn) pingAllBtn.onclick = () => pingAllServers();

        const quickPingBtn = $('fnx-quick-ping-btn');
        if (quickPingBtn) quickPingBtn.onclick = () => pingAllServers();

        // Drawer close button
        const closeDrawerBtn = $('fnx-close-drawer');
        if (closeDrawerBtn) closeDrawerBtn.onclick = () => closeDrawer();

        // Close drawer on backdrop overlay click
        const drawer = $('fnx-drawer');
        if (drawer) {
            drawer.onclick = (e) => {
                if (e.target === drawer) closeDrawer();
            };
        }

        // Close server sheet on backdrop overlay click
        const sheet = $('fnx-server-sheet');
        if (sheet) {
            sheet.onclick = (e) => {
                if (e.target === sheet) closeServerSheet();
            };
        }

        // Escape key to close any open sheet or drawer
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeDrawer();
                closeServerSheet();
            }
        });

        // Drawer tabs
        document.querySelectorAll('.fnx-dtab').forEach((b) => {
            b.onclick = () => switchDrawerTab(b.getAttribute('data-dtab'));
        });
    }

    let built = false;
    function build() {
        const root = $('ls-fenix');
        if (!root || built) return;
        built = true;
        root.innerHTML = template();
        bindEvents();
    }

    window.initFenixModule = () => {
        build();
        refresh();
        setInterval(() => { refresh(); }, 2000);
    };
})();
