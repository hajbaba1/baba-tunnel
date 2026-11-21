# گزارش مرحله ۳ از ۵ — اعتبارسنجی و سخت‌سازی fenix-standalone

**تاریخ گزارش:** ۲۱ نوامبر ۲۰۲۶  
**مخزن کاری:** `fenix-standalone`  
**وضعیت مخزن اصلی (`mlmvpn_windows`):** کاملاً دست‌نخورده (`working tree clean`)  

---

## ۱. خروجی خام آزمون‌های گام ۳.۱

### ۱.۱. خروجی `npm install`
```
up to date, audited 146 packages in 2s

34 packages are looking for funding
  run `npm fund` for details

2 high severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
npm warn install-scripts 1 package had install scripts blocked because they are not covered by allowScripts:
npm warn install-scripts   electron@34.5.8 (postinstall: node install.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
```

### ۱.۲. خروجی `npm ls --depth=0`
```
fenix-vpn@1.0.0 C:\Users\1224\Desktop\New folder\fenix-standalone
+-- electron@34.5.8
+-- express@4.22.3
`-- socks-proxy-agent@10.1.0
```

### ۱.۳. خروجی `npm audit`
```
# npm audit report

electron  <=42.11.15 || 43.0.0-alpha.1 - 43.0.0-beta.8
Severity: high
Electron has ASAR Integrity Bypass via resource modification - https://github.com/advisories/GHSA-vmqv-hx8q-j7mg
Electron: AppleScript injection in app.moveToApplicationsFolder on macOS - https://github.com/advisories/GHSA-5rqw-r77c-jp79
Electron: Service worker can spoof executeJavaScript IPC replies - https://github.com/advisories/GHSA-xj5x-m3f3-5x3h
Electron: Incorrect origin passed to permission request handler for iframe requests - https://github.com/advisories/GHSA-r5p7-gp4j-qhrx
Electron: Out-of-bounds read in second-instance IPC on macOS and Linux - https://github.com/advisories/GHSA-3c8v-cfp5-9885
Electron: nodeIntegrationInWorker not correctly scoped in shared renderer processes - https://github.com/advisories/GHSA-xwr5-m59h-vwqr
Electron: Use-after-free in offscreen child window paint callback - https://github.com/advisories/GHSA-532v-xpq5-8h95
Electron: Registry key path injection in app.setAsDefaultProtocolClient on Windows - https://github.com/advisories/GHSA-mwmh-mq4g-g6gr
Electron: Use-after-free in download save dialog callback - https://github.com/advisories/GHSA-9w97-2464-8783
Electron: Use-after-free in WebContents fullscreen, pointer-lock, and keyboard-lock permission callbacks - https://github.com/advisories/GHSA-8337-3p73-46f4
Electron: Use-after-free in PowerMonitor on Windows and macOS - https://github.com/advisories/GHSA-jjp3-mq3x-295m
Electron: Unquoted executable path in app.setLoginItemSettings on Windows - https://github.com/advisories/GHSA-jfqx-fxh3-c62j
Electron: HTTP Response Header Injection in custom protocol handlers and webRequest - https://github.com/advisories/GHSA-4p4r-m79c-wq3v
Electron: USB device selection not validated against filtered device list - https://github.com/advisories/GHSA-9899-m83m-qhpj
Electron: Use-after-free in offscreen shared texture release() callback - https://github.com/advisories/GHSA-8x5q-pvf5-64mp
Electron: Crash in clipboard.readImage() on malformed clipboard image data - https://github.com/advisories/GHSA-f37v-82c4-4x64
Electron: Named window.open targets not scoped to the opener's browsing context - https://github.com/advisories/GHSA-f3pv-wv63-48x8
Electron: Renderer command-line switch injection via undocumented commandLineSwitches webPreference - https://github.com/advisories/GHSA-9wfr-w7mm-pc7f
Electron: Parent process code-sign check is spoofable - https://github.com/advisories/GHSA-jm7p-cc5g-qwxx
Electron: Custom protocol with supportFetchAPI but not corsEnabled allows cross-origin reads - https://github.com/advisories/GHSA-v3j7-r9gq-3gjw
Electron: Extension tab APIs operate across session boundaries - https://github.com/advisories/GHSA-m55f-7gqj-fr98
Electron: shell.openPath path validation bypass via embedded null byte - https://github.com/advisories/GHSA-5c9j-mhmv-5xgx
Electron: Context isolation bypass via Function.prototype.bind hijack - https://github.com/advisories/GHSA-h7rp-cf8h-j98x
Electron: Cross-origin iframe can position native autofill popup - https://github.com/advisories/GHSA-x8rc-wpg4-grpf
Electron: Permission Check Handler Receives Main Frame Origin Instead of Requesting Iframe Origin - https://github.com/advisories/GHSA-9pf5-hg6p-4pwp
Electron: Off-screen rendering trusts GPU-supplied geometry over shared-memory size - https://github.com/advisories/GHSA-pfmc-3mgc-p6fp
Electron: HTTP redirect followed into local file loader - https://github.com/advisories/GHSA-v64r-4m7r-3mvq
Electron: window.open features string controls some window options considered privileged - https://github.com/advisories/GHSA-v93f-fgjr-hjrj
Electron: Sandboxed iframe can bypass the allow-popups restriction via the OpenURL navigation path - https://github.com/advisories/GHSA-9f4c-93c8-jc8g
Electron: Sandboxed iframes can launch external protocol handlers - https://github.com/advisories/GHSA-p2rr-rvmm-c5fp
Electron: DevTools embedder handler executes arbitrary files via shell open - https://github.com/advisories/GHSA-f2r8-jv7c-xqmp
Electron: contextBridge object copy honors prototype setters - https://github.com/advisories/GHSA-ff2p-hmqr-hxm4
Electron: DevTools JavaScript Injection via Unsanitized Dock State Parameter - https://github.com/advisories/GHSA-4f78-qhmw-8j8m
Electron drops inherited HTML sandbox restrictions for popups opened through OpenURLFromTab - https://github.com/advisories/GHSA-hq2x-r82h-9wj4
Electron: Windows opened from a sandboxed top-level document do not inherit its sandbox restrictions - https://github.com/advisories/GHSA-gr2m-v5gq-v685
Electron: File and HTTP protocol handlers allow cross-origin reads without corsEnabled - https://github.com/advisories/GHSA-j84w-jfhq-vhvj
Electron: Local race condition in Squirrel.Mac update installation on macOS - https://github.com/advisories/GHSA-vv43-5jgx-7qv8
Electron: <webview> can enable Node.js integration in Web Workers despite embedder restrictions - https://github.com/advisories/GHSA-9qh4-3jw8-366w
Electron: HID and USB permission checks can be attributed to the wrong origin - https://github.com/advisories/GHSA-fw47-9c62-h3vw
Electron: SameSite cookie restrictions are not applied to windows opened from links - https://github.com/advisories/GHSA-2p8c-gr87-2676
Electron: Pointer lock permission requests can be attributed to the wrong frame - https://github.com/advisories/GHSA-x562-297c-g43g
Electron: Extension tabs.query returns tab URLs and titles without the tabs permission - https://github.com/advisories/GHSA-98mx-cjp9-gchm
Electron: Frame subscription trusts GPU-supplied frame geometry - https://github.com/advisories/GHSA-3qxv-5xgr-q7w9
Electron: Off-screen rendering on macOS trusts GPU-supplied frame geometry - https://github.com/advisories/GHSA-h3v5-h239-pg29
Electron: openExternal permission requests can be attributed to the wrong origin - https://github.com/advisories/GHSA-997q-gvvc-jwmx
Electron: Mitigation for compromised eMudhra intermediate certificates - https://github.com/advisories/GHSA-jr5w-w6x2-84p9
Depends on vulnerable versions of extract-zip
fix available via `npm audit fix --force`
Will install electron@45.4.1, which is a breaking change
node_modules/electron

extract-zip  *
Severity: high
extract-zip unvalidated symlink path traversal - https://github.com/advisories/GHSA-jmr9-qjv8-65gv
extract-zip allows arbitrary file writes through symlink archive entries - https://github.com/advisories/GHSA-7pqw-9j4j-h8q3
fix available via `npm audit fix --force`
Will install electron@45.4.1, which is a breaking change
node_modules/extract-zip

2 high severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force
```

### ۱.۴. خروجی `node --check` روی همه فایل‌ها
```
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\crypto-store.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\fastly-solver.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\fenix-routes.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\fenix-session.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\fenix.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\health-check.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\main.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\server.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\system-proxy.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\xray-runner.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\public\components\fenix.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\scripts\check-imports.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\scripts\verify-isolation.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\tests\crypto-store.test.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\tests\fastly-solver.test.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\tests\health-check-session.test.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\tests\security-server.test.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\tests\system-proxy.test.js
SYNTAX_OK: C:\Users\1224\Desktop\New folder\fenix-standalone\tests\xray-config.test.js
```

### ۱.۵. خروجی `scripts/check-imports.js`
```
Checking 19 JavaScript files in fenix-standalone...
Detected used npm packages: [ 'electron', 'express', 'socks-proxy-agent' ]
[PASS] All relative imports are strictly isolated, and package.json is 100% matched.
```

### ۱.۶. خروجی `git grep -i -n "mlm"` در `fenix-standalone`
```
LICENSE:1:MLMVPN ATTRIBUTION LICENSE
LICENSE:4:Copyright (c) 2026 Ehsan (MLMVPN). All rights reserved.
LICENSE:7:it — including commercially — provided you credit MLMVPN as required by Section 3.
LICENSE:14:   "The Software" means the MLMVPN for Windows source code in this repository,
LICENSE:42:   MLMVPN, in all three of the following places that apply to what you ship:
LICENSE:48:           Based on MLMVPN for Windows
LICENSE:49:           https://github.com/mlmvpn/mlmvpn_windows
LICENSE:61:       or a download page, name MLMVPN there as the origin, with a link to
LICENSE:62:       https://github.com/mlmvpn/mlmvpn_windows
LICENSE:64:   You may add your own name and branding alongside MLMVPN's. You may not
LICENSE:74:   (b) You may not use the name "MLMVPN", the MLMVPN logo, or the names of its
LICENSE:76:       MLMVPN produced, reviewed, sponsored or supports it. Section 3 requires
LICENSE:112:   This licence covers only the code authored by MLMVPN. The engines this
LICENSE:120:پروانهٔ انتساب MLMVPN — نسخهٔ ۱.۰
LICENSE:124:حق نشر © ۲۰۲۶ احسان (MLMVPN). همهٔ حقوق محفوظ است.
LICENSE:127:منتشرش کنید — حتی تجاری — به شرط آن‌که طبق بند ۳ نام MLMVPN را ذکر کنید.
LICENSE:135:   بر محصول شما صدق می‌کند، نام MLMVPN را بیاورید:
LICENSE:140:            Based on MLMVPN for Windows
LICENSE:141:            https://github.com/mlmvpn/mlmvpn_windows
LICENSE:149:      صفحهٔ دانلود: MLMVPN را به‌عنوان منبع، همراه با لینک، نام ببرید.
LICENSE:151:   نام و برند خودتان را می‌توانید کنار نام MLMVPN بگذارید؛ جایگزینش نکنید، و کار
LICENSE:156:   ب) استفاده از نام یا نشان MLMVPN برای تأیید یا تبلیغ محصول شما، یا به‌گونه‌ای
LICENSE:173:   این پروانه فقط کدِ نوشتهٔ MLMVPN را پوشش می‌دهد. موتورهایی که این برنامه آن‌ها
README.md:6:Based on MLMVPN for Windows:  
README.md:7:https://github.com/mlmvpn/mlmvpn_windows
README.md:9:Original Copyright (c) 2026 Ehsan (MLMVPN). Licensed under the MLMVPN Attribution License 1.0 (see [LICENSE](LICENSE)).
README.md:14:> **IMPORTANT:** In the original MLMVPN repository, executing `node server.js` directly altered firewall rules and system DNS settings. In this standalone repository, all firewall and DNS mutations have been eliminated. Only local SOCKS/HTTP ports and safe Windows proxy settings (with automated state backup and rollback) are utilized.
docs/STEP2_REPORT.md:11:در این مرحله، تمام مؤلفه‌ها و منطق هدایت‌کنندهٔ پروتکل Fenix از مخزن اصلی `mlmvpn_windows` بدون هرگونه تغییر در مخزن اصلی استخراج شد و در یک مخزن گیت کاملاً مستقل به آدرس `fenix-standalone` مستقر گردید. معماری بر پایهٔ Node.js و Electron حفظ شده و تمامی بخش‌های وابسته به پوستهٔ چندپنجره‌ای دسکتاپ MLMVPN، قوانین فایروال و دستکاری‌های DNS به طور کامل حذف گردیدند.
docs/STEP2_REPORT.md:21:- مسیر ذخیره‌سازی داده‌ها از `~/.mlmvpn` به مسیر استاندارد سیستم‌عامل در AppData تحت پوشهٔ `fenix-vpn` تغییر یافت.
docs/STEP2_REPORT.md:70:- **پوسته UI مستقل (`public/index.html`):** کلیه وابستگی‌های پوسته چندپنجره‌ای MLMVPN (نظیر داک، منوبار، شبیه‌ساز macOS، `apps.js` و `packs.js`) حذف شدند. کامپوننت Fenix مستقیماً درون یک صفحه استاندارد و واکنش‌گرا قرار گرفت.
docs/STEP2_REPORT.md:76:1. **`LICENSE`:** مجوز اختصاصی MLMVPN Attribution License 1.0 بدون تغییر کپی شد.
docs/STEP2_REPORT.md:77:2. **`README.md`:** حاوی انتساب رسمی «Based on MLMVPN for Windows» همراه با لینک ریپازیتوری، و هشدار عدم اجرای اسکریپت‌های مخرب شبکه مخزن اصلی.
fenix-routes.js:3:// Extracts strictly the /api/fenix/* routes from MLMVPN's server.js.
health-check.js:3:// Replaces exit-proxies.verify from MLMVPN with a minimal, focused verification probe.
public/ui/components.css:2:   MLMVPN components — every new piece of UI is built from these.
public/ui/tokens.css:2:   MLMVPN design tokens — the single source of the app's look.
xray-runner.js:4:// Does not include any logic for VLESS/VMess, reality, shadowsocks, gRPC or other MLMVPN engines.
xray-runner.js:37:    // 4. Default install path on Windows (if user has MLM VPN installed)
xray-runner.js:38:    const installed = 'C:\\Program Files\\MLM VPN\\resources\\app.asar.unpacked\\core\\xray.exe';
```

### ۱.۷. خروجی `git grep -i -n "github-tunnel\|\.mlmvpn"` در `fenix-standalone`
```
docs/STEP2_REPORT.md:20:- در `fenix.js` ارجاع به ماژول ذخیره‌سازی کلیدها در خط ۱۲ به صورت `require('./github-tunnel/gt-crypto')` بود که در پروژه جدید با ماژول اختصاصی `crypto-store.js` جایگزین شد.
docs/STEP2_REPORT.md:21:- مسیر ذخیره‌سازی داده‌ها از `~/.mlmvpn` به مسیر استاندارد سیستم‌عامل در AppData تحت پوشهٔ `fenix-vpn` تغییر یافت.
docs/STEP2_REPORT.md:55:   - *دلیل انتخاب:* ماژول اصلی `github-tunnel/gt-crypto.js` بخش‌های زائد مربوط به گیت‌هاب داشت. این ماژول بازنویسی شد تا در محیط Electron از `safeStorage` (رمزنگاری مبتنی بر DPAPI ویندوز) و در محیط شل/تست از توابع بومی DPAPI پاورشل (`ConvertTo-SecureString` / `ConvertFrom-SecureString`) استفاده کند.
```
*(هیچ ارجاعی در سورس کد یا کدهای اجرایی وجود ندارد و فقط در گزارش قبلی برای مستندسازی سوابق ذکر شده است).*

### ۱.۸. وضعیت گیت در هر دو مخزن
**در `fenix-standalone`:**
```
On branch master
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   .gitignore
	modified:   README.md
	modified:   THIRD_PARTY_NOTICES.md
	modified:   crypto-store.js
	modified:   fenix-routes.js
	modified:   fenix.js
	modified:   package.json
	modified:   public/components/fenix.js
	modified:   server.js

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/STEP3_REPORT.md
	scripts/check-imports.js
	tests/
```

**در مخزن اصلی `mlmvpn_windows`:**
```
On branch master
nothing to commit, working tree clean
```

---

## ۲. گزارش گام ۳.۲ — رفع مغایرت‌ها

### ۲.۱. شماره خطوط واقعی مسیرهای `/api/fenix/*` در مخزن اصلی و دلیل مغایرت
خروجی دستور `git grep -n "/api/fenix" server.js` در مخزن `mlmvpn_windows`:
```
server.js:7507:            must(await selfPost('/api/fenix/connect', { country: rec.fenix.country, accountId: rec.fenix.accountId }), 'FENIX');
server.js:8210:app.get('/api/fenix', fenixHandle(async () => {
server.js:8217:app.post('/api/fenix/signin', fenixHandle(async (b) => require('./fenix').signIn(b.email, b.password)));
server.js:8218:app.post('/api/fenix/code', fenixHandle(async (b) => { await require('./fenix').verifyCode(b.code); return {}; }));
server.js:8219:app.post('/api/fenix/cancel', fenixHandle(async () => ({ cancelled: require('./fenix').cancelSignIn() })));
server.js:8221:app.post('/api/fenix/challenge', fenixHandle(async (b) => require('./fenix').challenge({ host: String(b.host || ''), purpose: String(b.purpose || '') })));
server.js:8222:app.post('/api/fenix/signout', fenixHandle(async (b) => ({ removed: require('./fenix').signOut(String(b.id || '')) })));
server.js:8223:app.post('/api/fenix/quota', fenixHandle(async (b) => ({ accounts: await require('./fenix').refreshQuotas({ force: !!b.force }) })));
server.js:8224:app.post('/api/fenix/servers', fenixHandle(async (b) => {
server.js:8234:app.post('/api/fenix/connect', fenixHandle(async (b) => ({ session: await fenixSession().connect({ country: fenixCountry(b.country), accountId: fenixAccount(b.accountId) }) })));
server.js:8235:app.post('/api/fenix/stop', fenixHandle(async () => ({ session: await fenixSession().disconnect() })));
```
- **تحلیل مغایرت:** تابع اصلی `fenixSession()` در خط **۸۱۸۶** و روت‌های مربوطه در خطوط **۸۲۱۰ تا ۸۲۳۵** تعریف شده‌اند. بنابراین شماره خطوط گزارش کشف (۸۱۷۵ تا ۸۲۳۵) دقیق و کاملاً منطبق بر سورس کد بوده است.
- **علت عدد نادرست در گزارش مرحله ۲ (۶۹۰ تا ۸۱۵):** در زمان گزارش‌گیری مرحله ۲، خروجی بخش اسکنر Cloudflare در `server.js` (خطوط ۶۹۰ تا ۸۱۵ مربوط به `currentScanId` و `scanState`) به اشتباه تایپ شده بود. سورس کپی‌شده دقیقاً همان روت‌های خطوط ۸۲۱۰ تا ۸۲۳۵ است.

### ۲.۲. وضعیت `acorn` و `axios`
- با اجرای `git grep -n "acorn" -- "*.js"` در مخزن اصلی و مخزن جدید، مشخص شد که بستهٔ `acorn` در **هیچ فایل جاوااسکریپتی** فراخوانی نشده و صرفاً یک وابستگی بدون استفاده در `package.json` اصلی بود.
- فایل `fastly-solver.js` فقط از ماژول داخلی `crypto` نودجی‌اس استفاده می‌کند.
- بستهٔ `axios` در بخش‌های پنل‌های Cloudflare، ساب‌لینک‌ها و `systemcheck.js` در برنامهٔ اصلی استفاده می‌شد و `fenix.js` تمام درخواست‌های HTTP/HTTPS خود را با ماژول‌های بومی `https` و `http` انجام می‌دهد.
- **نتیجه:** هیچ‌کدام از این دو بسته مورد نیاز Fenix نبودند و هر دو از `package.json` حذف شدند.

### ۲.۳. نقل قول مستقیم خطوط ۷۲ و ۸۶ فایل `network-settings.js`
متن دقیق سورس کد در خطوط ۷۰ تا ۸۷:
```javascript
70: // «وارپ» was read as «ماسک». OpenVPN builds its own adapter and takes it as --tun-mtu.
71: const MTU_METHODS = ['masque', 'wireguard', 'gool', 'warpEngine', 'quick', 'sni', 'v2ray', 'gst',
72:     'psiphon', 'tor', 'lantern', 'geph', 'urnetwork', 'github', 'openvpn', 'outline', 'flux', 'fenix', 'amnezia', 'mae'];
73: const MTU_ENGINES = MTU_METHODS;
74: 
75: /**
76:  * What each method wraps round a packet on the wire, measured by the Android build on a 1500 line
77:  * (MtuProbe.OVERHEAD). The methods not listed end every connection on this machine and re-open it
78:  * through a local proxy — Android's LOCAL_TERMINATION — so their adapter MTU never reaches the
79:  * network, 1500 is simply best, and there is nothing to measure.
80:  */
81: // warpEngine («وارپ» — not `warp`, which is 1.2.2's old one-value-for-all key, migrated below): the same WireGuard framing as «وایرگارد» (one encapsulation, 60). openvpn: DERIVED, not yet
82: // measured on a wire like the others — 20 IPv4 + 20 TCP + 2 length + 1 opcode + 3 peer-id + 4 packet-id
83: // + 16 GCM tag = 66 (the VPN Gate profiles are TCP + AES-GCM).
84: const MTU_OVERHEAD = Object.freeze({ masque: 196, wireguard: 60, gool: 280, warpEngine: 60, openvpn: 66 });
85: // Every SOCKS engine under the tunnel ends the connection on this machine and re-opens it.
86: const LOCAL_TERMINATION = Object.freeze(['quick', 'sni', 'v2ray', 'gst', 'psiphon', 'tor', 'lantern', 'geph', 'urnetwork', 'github', 'outline', 'flux', 'fenix', 'amnezia', 'mae']);
```
- **تفسیر بر پایه متن سورس:**
  - خط ۷۲: `fenix` در آرایهٔ `MTU_METHODS` قرار دارد (روش‌هایی که در تنظیمات می‌توان برای آن‌ها MTU کارت شبکه تعریف کرد).
  - خط ۸۶: `fenix` عضوی از `LOCAL_TERMINATION` است. طبق توضیح کامنت خطوط ۷۶ تا ۷۹ و خط ۸۵، موتورهایی که در این آرایه هستند، اتصال را روی همین کامپیوتر پایان داده و آن را مجدداً از طریق یک پروکسی محلی (Local Loopback / SOCKS) باز می‌کنند. بنابراین ترافیک آن‌ها مستقیماً به کارت شبکه اصلی ارسال نمی‌شود و نیازی به سنجش اورهد MTU روی سیم ندارند.

### ۲.۴. نقل قول مستقیم کامنت‌های مبدأ کد در `fenix.js` و `fenix-session.js`
**از فایل `fenix.js` (خطوط ۱ تا ۱۰):**
```
// --- «FENIX» — Firefox's built-in VPN (Mozilla's Fastly MASQUE proxies), on Windows ---
//
// Android 1.2.41 › engines/fenix. The Firefox Accounts sign-in (onepw: PBKDF2 + HKDF, Hawk) is ported
// from FoxyVPN (https://github.com/vauth/foxyvpn, MIT — Copyright (c) 2026 Vauth), itself a port of
// firefox-vpn-client. Changed, as on the phone: Fastly's browser check is NOT imitated — on HTTP 406
// Mozilla's own page opens in an Electron window (the page of the site that asked), the user passes
// the check as anyone would, and from then on that site's calls are made by that window's browser.
// Accounts are signed in to on Mozilla's own page in the same window (Android 1.2.43): the page's
// verified session is taken for the token grant, and the password never passes through the app.
```

**از فایل `fenix-session.js` (خطوط ۱۳ تا ۱۷):**
```
// The connect walks Android's ladder (engines/fenix › FenixEngine.connect): a server that answers a
// real TLS handshake, the chosen account's fresh pass, the config over HTTP/2 or HTTP/1.1 (whichever
// carried data last time first), and a real request through it. One account per connection — the
// renewal keeps the same one, and a used-up allowance ends the connection with the reason, never a
// quiet move to another account.
```

---

## ۳. گزارش گام ۳.۳ — سخت‌سازی امنیتی

1. **محدودسازی لوکال سرور:** در `server.js` لیسنر به صراحت به آدرس `127.0.0.1` محدود شد و هرگونه امکان اتصال از روی کارت شبکه فیزیکی یا `0.0.0.0` مسدود گردید.
2. **محافظت در برابر DNS Rebinding و سرقت توکن (CSRF):**
   - در هر شروع سرور یک توکن تصادفی کریپتوگرافیک ۲۴ بایتی (`crypto.randomBytes(24).toString('hex')`) ساخته شده و به صفحه تزریق می‌شود.
   - تمام درخواست‌های روت‌های `/api/*` ملزم به ارائهٔ هدر `x-fenix-token` تطبیق‌یافته هستند.
   - هدرهای `Host` بررسی شده و در صورت عدم تطابق با `127.0.0.1` یا `localhost` رد می‌شوند.
   - هدر `Origin` و `Referer` در صورت وجود، اعتبارسنجی شده و مبدأهای خارجی مسدود (۴۰۳) می‌شوند.
3. **اعتبارسنجی ورودی‌ها و محدودیت حجم بدنه:**
   - بدنه درخواست‌های JSON به سقف ۶۴ کیلوبایت محدود شد (`express.json({ limit: '64kb' })`).
   - در تمام روت‌ها (`/api/fenix/signin`, `/api/fenix/code`, `/api/fenix/challenge`, `/api/fenix/signout`, `/api/fenix/connect`, `/api/v2ray/sysproxy`) الگوهای Regex برای ایمیل، کد ۶ تا ۸ رقمی، شناسه هگز و هاست‌های مجاز چالش اعمال شد.
4. **ایزولاسیون کامل پورت‌های محلی Xray:**
   - در خروجی `fenix.config()` و فایل کانفیگ Xray، تمام Inboundها با `listen: "127.0.0.1"` مقید شده‌اند و عبارت `0.0.0.0` در کل کانفیگ وجود ندارد.
5. **سخت‌سازی `crypto-store.js`:**
   - اگر رمزنگاری با DPAPI یا `safeStorage` موفقیت‌آمیز نباشد، خطا پرتاب می‌شود (`Refusing to store unencrypted credentials`) و برنامه هرگز توکن را به صورت متن خام یا Base64 ذخیره نمی‌کند.
6. **پاک‌سازی و فیلتر لاگ‌ها (`sanitizeLog`):**
   - تابع `sanitizeLog` اضافه شد که ایمیل‌ها، پسوردها، کدهای تأیید، توکن‌های JWT، کلیدهای دسترسی و هدرهای `Proxy-Authorization` و `Authorization` را با برچسب‌های `[REDACTED]` ماسک می‌کند.
7. **جستجوی الگوهای راز در مخزن:**
   - خروجی جستجوی `git grep -i -E "(api[_-]?key|bearer |password\s*=|auth[_-]?token)"`:
   ```
   fenix.js:async function call(method, url, { json = null, bearer = null, session = null } = {}) {
   fenix.js:    if (bearer) headers.Authorization = 'Bearer ' + bearer;
   fenix.js:                if (bearer) nodeHeaders.Authorization = 'Bearer ' + bearer;
   fenix.js:        settings: { servers: [{ address, port: srv.port }], headers: { 'Proxy-Authorization': 'Bearer ' + token } },
   ```
   هیچ کلید، رمز یا توکن ثابتی در کدها وجود ندارد.

---

## ۴. گزارش گام ۳.۴ — آزمون‌های واحد با `node:test`

خروجی خام دستور `npm test`:
```
npm notice run fenix-vpn@1.0.0 test
npm notice run node --test tests/**/*.test.js
✔ crypto-store: roundtrip encryption and decryption with DPAPI / safeStorage (298.9485ms)
✔ crypto-store: empty string handling (0.2208ms)
✔ crypto-store: security refusal of plaintext or unknown format (0.3335ms)
✔ fastly-solver: isChallengePage detection (0.6672ms)
✔ fastly-solver: solvePow on fixed challenge (7.3879ms)
✔ fastly-solver: parseInitFromScript extracts parameters from mock script (0.4043ms)
✔ fastly-solver: clientMetricsAnswer generates valid payload (0.0891ms)
✔ fastly-solver: SimpleCookieJar handles domain and path isolation (0.4201ms)
✔ health-check: verify returns failure when local SOCKS port is not listening (8.5292ms)
✔ fenix-session: state machine initialization and check() (0.3813ms)
✔ fenix-session: disconnect on already stopped session (0.1723ms)
✔ security-server: Host and Origin rejection (DNS rebinding & CSRF protection) (91.3085ms)
✔ security-routes: strict input validation on /api/fenix/* (13.5148ms)
✔ security-sanitization: sanitizeLog removes passwords, tokens, emails, and auth headers (0.4519ms)
[ProxyRecovery] Detected leftover proxy backup file from previous session. Rolling back...
✔ system-proxy: backup file location and state persistence (4.7739ms)
✔ system-proxy: crash recovery restores previous state if file exists on startup (52.6285ms)
✔ xray-config: structure and local binding from fixed inputs (0.7392ms)
✔ xray-runner: ports are strictly local loopback (0.1162ms)
ℹ tests 18
ℹ suites 0
ℹ pass 18
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 349.7665
```

---

## ۵. فهرست تغییرات فایل‌ها

1. **`crypto-store.js`:**
   - حذف کامل لایهٔ ناامن Base64 fallback.
   - اضافه شدن پرتاب صریح خطا در صورت عدم دسترسی به DPAPI یا `safeStorage`.
   - عدم پذیرش توکن‌های غیراستاندارد یا متنی در زمان بازگشایی (`unprotectAsync`).
2. **`fenix.js`:**
   - اضافه شدن تابع `sanitizeLog` برای ماسک کردن عبارات حساس پیش از ثبت در فایل لاگ.
   - اصلاح کامنت مسیر لاگ از `~/.mlmvpn` به `%APPDATA%/fenix-vpn`.
   - خروجی دادن `sanitizeLog` در `module.exports`.
3. **`server.js`:**
   - محدودسازی صریح لیسنر به `127.0.0.1`.
   - تولید توکن تصادفی نشست و اعمال اعتبارسنجی هدر `Host`، `Origin`، `Referer` و `x-fenix-token`.
   - محدود کردن سقف بدنهٔ JSON به ۶۴ کیلوبایت.
   - تزریق پویای توکن به `public/index.html`.
4. **`fenix-routes.js`:**
   - اضافه شدن اعتبارسنجی دقیق برای تمام پارامترهای ورودی روت‌ها با عبارات باقاعده.
   - ایمن‌سازی روت حل چالش با فهرست سفید هاست‌های مجاز موزیلا.
5. **`public/components/fenix.js`:**
   - ارسال خودکار توکن نشست در هدر `x-fenix-token` برای تمام درخواست‌های `api()`.
6. **`.gitignore`:**
   - اضافه شدن پوشش جامع برای `*.tmp`, `*.log.*`, `accounts.json*`, `.env`, `core/*.exe`, `core/*.dat`.
7. **`README.md` و `THIRD_PARTY_NOTICES.md`:**
   - اضافه شدن بخش «ریسک‌ها و محدودیت‌ها» با لحن واقع‌گرایانه.
   - شفاف‌سازی ارجاعات کد به نسخهٔ اندروید و FoxyVPN.
8. **فایل‌های جدید تست و اسکریپت:**
   - `scripts/check-imports.js`: بررسی دوطرفهٔ عدم خروج requireها و تطابق با `package.json`.
   - ۶ فایل تست جامع در پوشهٔ `tests/` با مجموع ۱۸ تست واحد.

---

## ۶. فهرست مواردی که با «باید بررسی شود» علامت‌گذاری شدند

1. **مجوز کد کلاینت اندروید:** کامنت‌های کد به `Android 1.2.41 › engines/fenix` و کلاینت موزیلا اشاره دارند. هرچند کلاینت اصلی موزیلا تحت MPL-2.0 است، اما نحوهٔ انتشار یا لایسنس مستقل بخش اندروید ذکر نشده است و **باید بررسی شود**.
2. **بررسی پشتیبانی از حساب موزیلا با احراز هویت دومرحله‌ای سخت‌افزاری (WebAuthn/FIDO2):** کلاینت فعلی فرمت TOTP/کد ایمیل را می‌پذیرد؛ کارکرد با کلیدهای امنیتی فیزیکی **باید بررسی شود**.

---

## ۷. آزمون‌های دستی (مخصوص کاربر روی ویندوز)

آزمون‌های زیر به دلیل نیاز به تعامل با کاربر، حساب واقعی موزیلا یا بستن پروسس در ویندوز، تنها توسط شما قابل انجام است:
1. **تست بازگردانی پروکسی پس از کرش (TaskKill):**
   - برنامه را با `npm start` یا `npm run preview` اجرا کنید و اتصال را روی «پروکسی کل سیستم» قرار دهید.
   - با تسک‌منیجر یا دستور `taskkill /F /IM node.exe` برنامه را ناگهانی ببندید.
   - مشاهده کنید که پروکسی موقتاً فعال مانده است؛ سپس برنامه را دوباره باز کنید و بررسی کنید که لاگ `[ProxyRecovery]` ثبت شده و وضعیت پروکسی ویندوز به حالت اولیه بازمی‌گردد.
2. **ورود با یک حساب تست موزیلا:**
   - فرم لاگین را با یک ایمیل تست فایرفاکس امتحان کرده و دریافت کد و حل چالش احتمالی Fastly را مشاهده نمایید.

---

## ۸. وضعیت فعلی و گام بعدی

- **چه چیزی هم‌اکنون کار می‌کند:**
  - پروژه کاملاً مستقل، سخت‌سازی‌شده در برابر نشت داده و حملات DNS Rebinding/CSRF، با ۱۸ تست واحد سبز، بدون وابستگی‌های اضافه یا کدهای حدسی.
  - مخزن اصلی `mlmvpn_windows` کاملاً پاک و بدون تغییر است.
- **گام بعدی پیشنهادی:**  
  دریافت تأییدیهٔ شما برای ورود به مرحلهٔ ۴ (مجوزها، نسبت‌دهی نهایی و هماهنگی برندینگ) یا مرحلهٔ ۵ (بسته‌بندی و راستی‌آزمایی نهایی).
