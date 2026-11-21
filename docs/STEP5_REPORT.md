# گزارش نهایی مرحله ۵ — راستی‌آزمایی نهایی، سخت‌سازی ناوبری و چک‌لیست تحویل
## پروژهٔ مستقل Fenix VPN Standalone

**تاریخ گزارش:** شنبه، ۳۰ آبان ۱۴۰۵ (21 نوامبر 2026)  
**موقعیت مخزن مستقل:** `c:\Users\1224\Desktop\New folder\fenix-standalone`  
**وضعیت مخزن اصلی (`mlmvpn_windows`):** کاملاً دست‌نخورده و بدون کوچک‌ترین تغییر (`working tree clean`)  
**هدف مرحله ۵:** رفع آسیب‌پذیری ناوبری URL بر پایهٔ تفکیک `new URL(url)`، ارائهٔ مستندات کامل، ثبت خروجی خام کلیهٔ دستورات راستی‌آزمایی، تدوین چک‌لیست نهایی موارد نیازمند بررسی (`docs/FINAL_CHECKLIST.md`) و جمع‌بندی طرح بسته‌بندی آتی بدون آغاز بسته‌بندی.

---

## ۱. گام ۵.۱ — سخت‌سازی ناوبری و آزمون رد آدرس‌های فریبنده

### ۱.۱. تغییرات در `main.js`
در فرآیند اصلی الکترون (`main.js`)، اعتبارسنجی ناوبری پنجرهٔ اصلی پیش‌تر با پیشوند متنی `startsWith` انجام می‌شد که امکان دور زدن آن با دامنه‌های فریبنده نظیر `http://127.0.0.1:3000.evil.com` وجود داشت. این سازوکار با تابع مستقل `isAllowedNavigationUrl` جایگزین شد که از شیء استاندارد `new URL()` استفاده می‌کند:
- بررسی دقیق `protocol === 'http:'`
- بررسی دقیق `hostname === '127.0.0.1' || hostname === 'localhost'`
- بررسی مستقل و دقیق شماره پورت: `port === serverPort`
- کلیهٔ درخواست‌های باز کردن پنجرهٔ جدید با `setWindowOpenHandler` رد (`action: 'deny'`) می‌شوند.

### ۱.۲. تغییرات در پنجرهٔ چالش `fenix.js`
در تابع `checkWindow` و `checkPage` در `fenix.js`:
- متغیر `MOZ_PAGE` و تابع `isAllowedMozillaUrl` با تفکیک `new URL()` بازنویسی شدند.
- پروتکل حتماً باید `https:` باشد.
- پورت حتماً باید پورت استاندارد ۴۴۳ (یا خالی در URL) باشد.
- هاست باید دقیقاً با دامنه‌های مجاز موزیلا (`firefox.com`، `mozilla.org`، `mozilla.com`) برابر باشد یا به پسوند دامنهٔ معتبر ختم شود (`.firefox.com` و غیره).
- دامنه‌های فریبنده‌ای نظیر `evil-firefox.com`، `firefox.com.evil.com` و `accounts.firefox.com.attacker.com` به طور قطعی رد می‌شوند.

### ۱.۳. آزمون‌های امنیتی جدید (`tests/navigation-security.test.js`)
یک فایل تست جامع با استفاده از کتابخانهٔ رسمی `node:test` و `node:assert` نوشته شد و به مجموعه آزمون‌ها افزوده گردید که شامل ۱۱ تست جزئی در ۲ گروه اصلی است:
- آزمون مجاز بودن آدرس‌های محلی معتبر روی پورت اختصاصی
- آزمون رد دامنه‌های فریبنده با پسوند ساختگی (`PORT.evil.com`, `PORTevil.com`, `PORT0.evil.com`)
- آزمون رد پروتکل‌های غیراستاندارد (`https`، `javascript:`، `data:`، `file:`)
- آزمون رد پورت‌های نامعتبر یا مغایر
- آزمون پذیرش دامنه‌های رسمی موزیلا در بستر HTTPS
- آزمون رد دامنه‌های فریبنده با پیشوند یا پسوند جعلی موزیلا (`evil-firefox.com`, `firefox.com.evil.com`, `fake-mozilla.org`)
- آزمون رد پروتکل ناامن HTTP در ارتباط با موزیلا یا پورت‌های غیرمجاز

---

## ۲. گام ۵.۲ — نمایش کامل مدارک و مستندات

### ۲.۱. متن کامل هدر CSP اعمال‌شده در `server.js` (خط ۷۵)
```javascript
res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self' http://127.0.0.1:* http://localhost:*;");
```

### ۲.۲. خروجی خام `git log --oneline -10` در `fenix-standalone`
```text
8f775e8 feat(security): electron hardening and complete attribution
535fb8b refactor(ui): remove main app dependency and customize ui
72bebc7 feat(security): harden fenix-standalone and add test suite (phase 3)
3bb257f feat(fenix): initial extraction of fenix standalone project (phase 2)
```

### ۲.۳. خروجی خام `git status` در `fenix-standalone` (پیش از ثبت کامیت ۵)
```text
On branch master
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   fenix.js
	modified:   main.js

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/FINAL_CHECKLIST.md
	tests/navigation-security.test.js

no changes added to commit (use "git add" and/or "git commit -a")
```

### ۲.۴. محتوای کامل `THIRD_PARTY_NOTICES.md`
```markdown
# Third-Party Software Notices and Attribution

This project incorporates or interfaces with the following open-source works.

## 1. FoxyVPN
- Copyright (c) 2026 Vauth
- License: MIT License (SPDX: MIT)
- Repository: https://github.com/vauth/foxyvpn
- Description: Firefox Accounts authentication (onepw PBKDF2/HKDF) ported from FoxyVPN (itself ported from firefox-vpn-client).

## 2. MLMVPN Android / Mozilla MASQUE
- Origin: References to Android 1.2.41 (engines/fenix) and Mozilla VPN client protocol flows.
- Upstream License: Mozilla Public License 2.0 (SPDX: MPL-2.0).
- Specific license of auxiliary Android snippets: «باید بررسی شود».

## 3. Xray-core
- Copyright: XTLS Community
- License: Mozilla Public License 2.0 (SPDX: MPL-2.0)
- Repository: https://github.com/XTLS/Xray-core

## 4. Phosphor Icons
- Copyright (c) 2020 Phosphor Icons
- License: MIT License (SPDX: MIT)
- Repository: https://github.com/phosphor-icons/core

## 5. Direct NPM Dependencies
The licenses of all direct runtime and dev dependencies read directly from their respective `package.json`:
- `electron` (v34.5.8): MIT License (SPDX: MIT)
- `express` (v4.22.3): MIT License (SPDX: MIT)
- `socks-proxy-agent` (v10.1.0): MIT License (SPDX: MIT)

---

## ریسک‌ها و محدودیت‌ها (Risks and Limitations)
- اتصال به زیرساخت آزمایشی/رایگان موزیلا و Fastly بدون قرارداد یا توافق رسمی برقرار می‌شود.
- برنامه از Client ID رسمی موزیلا (`5882386c6d801776`) استفاده می‌کند.
- حل‌کنندهٔ `fastly-solver.js` برای پاسخگویی به چالش‌های ربات‌سنجی طراحی شده و ممکن است با تغییرات بالادستی مسدود شود.
```

### ۲.۵. دیف واقعی قبل/بعد `xray-runner.js` برای حذف مسیر هاردکدشده
دیف ثبت‌شده در تاریخچهٔ کامیت `535fb8b`:
```diff
diff --git a/xray-runner.js b/xray-runner.js
index 3edf23f..c0c54e3 100644
--- a/xray-runner.js
+++ b/xray-runner.js
@@ -1,7 +1,7 @@
 // --- xray-runner.js — Minimal Xray runner for Fenix Standalone ---
 //
 // Manages the lifecycle of the Xray-core binary strictly for Fenix's Fastly MASQUE tunnel.
-// Does not include any logic for VLESS/VMess, reality, shadowsocks, gRPC or other MLMVPN engines.
+// Does not include any logic for VLESS/VMess, reality, shadowsocks, gRPC or other extraneous engines.
 // Spawns xray.exe with the JSON config generated by fenix.config() and verifies port readiness.
 
 'use strict';
@@ -19,14 +19,16 @@ let xrayProcess = null;
 let currentUri = null;
 let currentConfigPath = null;
 
-/** Locate xray.exe binary */
+/** Locate xray.exe binary strictly from core/ or FENIX_XRAY_PATH */
 function getBinaryPath() {
     // 1. Environment variable override
-    if (process.env.XRAY_PATH && fs.existsSync(process.env.XRAY_PATH)) {
-        return process.env.XRAY_PATH;
+    const envPath = process.env.FENIX_XRAY_PATH || process.env.XRAY_PATH;
+    if (envPath) {
+        if (fs.existsSync(envPath)) return envPath;
+        throw new Error(`Configured Xray binary not found at FENIX_XRAY_PATH: "${envPath}"`);
     }
 
-    // 2. Local core/ directory
+    // 2. Local core/ directory inside project
     const local = path.join(__dirname, 'core', 'xray.exe');
     if (fs.existsSync(local)) return local;
 
@@ -34,11 +36,7 @@ function getBinaryPath() {
     const cwdCore = path.join(process.cwd(), 'core', 'xray.exe');
     if (fs.existsSync(cwdCore)) return cwdCore;
 
-    // 4. Default install path on Windows (if user has MLM VPN installed)
-    const installed = 'C:\\Program Files\\MLM VPN\\resources\\app.asar.unpacked\\core\\xray.exe';
-    if (fs.existsSync(installed)) return installed;
-
-    return 'xray.exe';
+    throw new Error('xray.exe binary was not found. Please place xray.exe in "core/xray.exe" or configure FENIX_XRAY_PATH in .env (see docs/BUILD.md).');
 }
```

### ۲.۶. محتوای متنی صفحهٔ «دربارهٔ» در رابط کاربری (`public/components/fenix.js`)
عیناً از خطوط ۱۰۴۴ تا ۱۰۶۱ فایل `public/components/fenix.js`:
```html
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
</div>
```

---

## ۳. گام ۵.۳ — راستی‌آزمایی نهایی و خروجی خام دستورات

### ۳.۱. خروجی خام `npm install`
```text
npm warn install-scripts .npmrc allow-scripts setting is being ignored because package.json declares its own allowScripts field

up to date, audited 146 packages in 2s

34 packages are looking for funding
  run `npm fund` for details

2 high severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
```

### ۳.۲. خروجی خام `npm test`
```text
npm notice run fenix-vpn@1.0.0 test
npm notice run node --test tests/**/*.test.js
✔ crypto-store: roundtrip encryption and decryption with DPAPI / safeStorage (310.4292ms)
✔ crypto-store: empty string handling (0.2142ms)
✔ crypto-store: security refusal of plaintext or unknown format (0.3242ms)
✔ fastly-solver: isChallengePage detection (0.695ms)
✔ fastly-solver: solvePow on fixed challenge (10.9779ms)
✔ fastly-solver: parseInitFromScript extracts parameters from mock script (0.6369ms)
✔ fastly-solver: clientMetricsAnswer generates valid payload (0.1685ms)
✔ fastly-solver: SimpleCookieJar handles domain and path isolation (0.6948ms)
✔ health-check: verify returns failure when local SOCKS port is not listening (9.3251ms)
✔ fenix-session: state machine initialization and check() (0.3855ms)
✔ fenix-session: disconnect on already stopped session (0.1773ms)
▶ Step 5.1: Main process local navigation hardening
  ✔ allows valid local server URLs on designated port (0.4461ms)
  ✔ strictly rejects deceptive domain suffixes (evil.com bypass attempts) (0.1301ms)
  ✔ strictly rejects invalid protocol (e.g. https on local server or pseudo-protocols) (0.1309ms)
  ✔ strictly rejects wrong ports (0.0889ms)
  ✔ strictly rejects path or query masquerading (0.0765ms)
  ✔ handles malformed, empty or null inputs gracefully (0.1233ms)
✔ Step 5.1: Main process local navigation hardening (1.9179ms)
▶ Step 5.1: Mozilla challenge window navigation hardening
  ✔ allows genuine Mozilla and Firefox domains via HTTPS (0.2068ms)
  ✔ strictly rejects deceptive domains masquerading as Mozilla (0.1335ms)
  ✔ strictly rejects insecure HTTP or non-standard ports (0.1059ms)
  ✔ strictly rejects pseudo-protocols and invalid inputs (0.0781ms)
  ✔ host validator helper isAllowedMozillaHost works accurately (0.061ms)
✔ Step 5.1: Mozilla challenge window navigation hardening (1.0389ms)
✔ security-server: Host and Origin rejection (DNS rebinding & CSRF protection) (95.8536ms)
✔ security-routes: strict input validation on /api/fenix/* (9.7226ms)
✔ security-routes: error responses from signin/code/connect do not leak secrets (4.5522ms)
✔ security-sanitization: sanitizeLog removes passwords, tokens, emails, and auth headers (0.4655ms)
[ProxyRecovery] Detected leftover proxy backup file from previous session. Rolling back...
✔ system-proxy: backup file location and state persistence (4.5859ms)
✔ system-proxy: crash recovery restores previous state if file exists on startup (57.2589ms)
✔ xray-config: structure and local binding from fixed inputs (1.0496ms)
✔ xray-runner: ports are strictly local loopback (0.1054ms)
ℹ tests 32
ℹ suites 0
ℹ pass 32
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 366.2551
```

### ۳.۳. خروجی خام `node --check` روی تک‌تک فایل‌های جاوااسکریپت پروژه
```text
OK: crypto-store.js
OK: fastly-solver.js
OK: fenix-routes.js
OK: fenix-session.js
OK: fenix.js
OK: health-check.js
OK: main.js
OK: server.js
OK: system-proxy.js
OK: xray-runner.js
OK: fenix.js
OK: check-imports.js
OK: verify-isolation.js
OK: crypto-store.test.js
OK: fastly-solver.test.js
OK: health-check-session.test.js
OK: navigation-security.test.js
OK: security-server.test.js
OK: system-proxy.test.js
OK: xray-config.test.js
```
*نتیجه: تمام ۲۰ فایل جاوااسکریپت پروژه سینتکس معتبر دارند.*

### ۳.۴. خروجی خام `node scripts/check-imports.js`
```text
Checking 20 JavaScript files in fenix-standalone...
Detected used npm packages: [ 'electron', 'express', 'socks-proxy-agent' ]
[PASS] All relative imports are strictly isolated, and package.json is 100% matched.
```

### ۳.۵. خروجی خام `npm audit`
```text
npm warn install-scripts .npmrc allow-scripts setting is being ignored because package.json declares its own allowScripts field
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
Electron: contextBridge object copy honors prototype提醒 - https://github.com/advisories/GHSA-ff2p-hmqr-hxm4
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

### ۳.۶. خروجی خام `git grep -i -n -E "mlm|program files|github-tunnel"` در `fenix-standalone`
(به تفکیک فایل‌های کد اجرایی):
```text
public/components/fenix.js:1050:                Based on MLMVPN for Windows<br>
public/components/fenix.js:1051:                <a href="https://github.com/mlmvpn/mlmvpn_windows" target="_blank" style="color:var(--mv-accent); text-decoration:underline; font-family:var(--mv-font-tech);">https://github.com/mlmvpn/mlmvpn_windows</a>
public/components/fenix.js:1054:                Original Copyright &copy; 2026 Ehsan (MLMVPN). All rights reserved.<br>
public/components/fenix.js:1055:                Licensed under the MLMVPN Attribution License 1.0.
public/components/fenix.js:1058:                این کلاینت مستقل بر پایهٔ پروژهٔ MLMVPN توسعه یافته و از پروتکل Fastly MASQUE موزیلا و هستهٔ Xray-core بهره می‌برد.
```
*توضیح: هیچ ارجاعی به مسیرهای `Program Files` یا ماژول‌های `github-tunnel` یا کدهای اجرایی MLMVPN باقی نمانده است. تنها ارجاعات مجاز در دیالوگ قانونی «درباره»، `LICENSE` و `README.md` (بند ۳ پروانه) وجود دارد.*

### ۳.۷. خروجی خام `git status` در مخزن اصلی `mlmvpn_windows`
```text
On branch master
nothing to commit, working tree clean
```
*توضیح: مخزن اصلی کاملاً دست‌نخورده باقی مانده است.*

---

## ۴. گام ۵.۴ — جمع‌بندی قابلیت‌های کارآمد و طرح بسته‌بندی

### ۴.۱. جمع‌بندی قابلیت‌های اثبات‌شده و کارآمد در Fenix Standalone
1. **استقلال کامل کد:** حذف کلیهٔ کدهای غیرمرتبط MLMVPN (شامل VLESS، VMess، Reality، پنل‌ها، شبیه‌ساز macOS و دستکاری فایروال و DNS).
2. **پروتکل Fenix MASQUE:** احراز هویت توکن، رمزنگاری PBKDF2/HKDF مبتنی بر FoxyVPN، اتصال به هاست‌های موزیلا و رفع چالش Fastly با `fastly-solver.js`.
3. **موتور اجرای اختصاصی Xray:** اجرای ایمن `xray.exe` تنها از پوشهٔ محلی پروژه `core/` یا متغیر `FENIX_XRAY_PATH` با پورت‌های محلی Loopback.
4. **رابط کاربری مدرن شعله (Flame Theme):** طراحی اختصاصی راست‌به‌چپ (RTL)، توکن‌های رنگی و اجزای مستقل، به همراه صفحهٔ رسمی «درباره».
5. **امنیت سخت‌گیرانه:** بایند انحصاری به `127.0.0.1`، اعتبارسنجی Host و Origin، تولید توکن نشست پویا، اعتبارسنجی پارامترهای ورودی، پاکسازی اطلاعات هویتی و توکن‌ها از لاگ‌ها (`sanitizeLog`)، و سخت‌سازی ناوبری URL با `new URL()`.
6. **پراکسی ایمن و بازیابی خودکار:** مدیریت پراکسی سیستمی بدون تخریب تنظیمات کاربر و بازیابی قطعی پس از کرش یا خروج ناگهانی.

### ۴.۲. وضعیت آزمون‌های دستی («باید بررسی شود»)
مطابق سند جامع `docs/FINAL_CHECKLIST.md`، سه مورد کلیدی زیر باید در بررسی نهایی مد نظر قرار گیرند:
1. **مجوز کدهای کمکی اندروید ۱.۲.۴۱ موزیلا:** باید بررسی شود (از نظر انطباق پروانهٔ MPL-2.0 موزیلا قبل از عرضه تجاری).
2. **رندر چشمی پنجرهٔ الکترون:** باید بررسی شود (توسط تست چشمی کاربر روی مانیتور جهت ارزیابی تایپوگرافی فارسی و المان‌های بصری).
3. **ارتقای الکترون به شاخهٔ جداگانه:** در شاخهٔ `feature/electron-upgrade` پیاده‌سازی شده و آماده تصمیم‌گیری برای ادغام با `master` است.

### ۴.۳. پیشنهاد گام‌های بعدی برای بسته‌بندی نصب‌کننده (بدون شروع بسته‌بندی)
برای تبدیل پروژه به یک فایل نصبی مستقل ویندوز (`.exe` یا `.msi`) در فازهای بعدی، مسیر فنی زیر پیشنهاد می‌شود:
1. **ابزار بسته‌بندی:** استفاده از `electron-builder` به عنوان پایدارترین و انعطاف‌پذیرترین ابزار برای الکترون ویندوز.
2. **پیکربندی `build` در `package.json`:**
   - تعیین `appId`: مانند `com.fenix.vpn`
   - تنظیم `extraFiles`: کپی کردن باینری اختصاصی `core/xray.exe` به عنوان فایل باینری خارجی بدون پکیج شدن در asar (`app.asar.unpacked/core/xray.exe`).
   - تنظیم `nsis`: ساخت نصاب یکپارچه (One-Click Installer یا Custom Wizard) با پشتیبانی از نصب در AppData بدون نیاز به دسترسی ادمین (per-machine: false).
3. **امضای دیجیتال (Code Signing):** تنظیم گواهی‌نامهٔ معتبر دیجیتال جهت جلوگیری از نمایش اخطار Windows SmartScreen.
4. **پایش و سلامت خودکار سرویس‌ها:** قرار دادن اسکریپت Teardown در هنگام آن‌اینستال جهت اطمینان از پاک شدن پراکسی و متوقف شدن پروسه‌های پس‌زمینه.
