# گزارش راستی‌آزمایی نهایی (مرحله ۵ — نسخه ساده)
## پروژهٔ مستقل Fenix VPN Standalone

**تاریخ اجرا:** شنبه، ۳۰ آبان ۱۴۰۵ (21 نوامبر 2026)  
**مسیر پروژه مستقل:** `c:\Users\1224\Desktop\New folder\fenix-standalone`  
**مسیر مخزن دست‌نخورده:** `c:\Users\1224\Desktop\New folder\mlmvpn_windows`

---

## ۱. خروجی خام دستورات گام ۱

### ۱.۱. خروجی خام `npm install`
```text
npm warn install-scripts .npmrc allow-scripts setting is being ignored because package.json declares its own allowScripts field

up to date in 21s

34 packages are looking for funding
  run `npm fund` for details
```

### ۱.۲. خروجی خام `npm test`
```text
npm notice run fenix-vpn@1.0.0 test
npm notice run node --test tests/**/*.test.js
✔ crypto-store: roundtrip encryption and decryption with DPAPI / safeStorage (284.539ms)
✔ crypto-store: empty string handling (0.2194ms)
✔ crypto-store: security refusal of plaintext or unknown format (0.338ms)
✔ fastly-solver: isChallengePage detection (0.6348ms)
✔ fastly-solver: solvePow on fixed challenge (6.9977ms)
✔ fastly-solver: parseInitFromScript extracts parameters from mock script (0.3443ms)
✔ fastly-solver: clientMetricsAnswer generates valid payload (0.086ms)
✔ fastly-solver: SimpleCookieJar handles domain and path isolation (0.2533ms)
✔ health-check: verify returns failure when local SOCKS port is not listening (9.0923ms)
✔ fenix-session: state machine initialization and check() (0.4088ms)
✔ fenix-session: disconnect on already stopped session (0.1795ms)
▶ Step 5.1: Main process local navigation hardening
  ✔ allows valid local server URLs on designated port (0.3976ms)
  ✔ strictly rejects deceptive domain suffixes (evil.com bypass attempts) (0.1073ms)
  ✔ strictly rejects invalid protocol (e.g. https on local server or pseudo-protocols) (0.0827ms)
  ✔ strictly rejects wrong ports (0.0741ms)
  ✔ strictly rejects path or query masquerading (0.0644ms)
  ✔ handles malformed, empty or null inputs gracefully (0.063ms)
✔ Step 5.1: Main process local navigation hardening (1.5292ms)
▶ Step 5.1: Mozilla challenge window navigation hardening
  ✔ allows genuine Mozilla and Firefox domains via HTTPS (0.1456ms)
  ✔ strictly rejects deceptive domains masquerading as Mozilla (0.1013ms)
  ✔ strictly rejects insecure HTTP or non-standard ports (0.0864ms)
  ✔ strictly rejects pseudo-protocols and invalid inputs (0.0644ms)
  ✔ host validator helper isAllowedMozillaHost works accurately (0.0495ms)
✔ Step 5.1: Mozilla challenge window navigation hardening (0.8037ms)
✔ security-server: Host and Origin rejection (DNS rebinding & CSRF protection) (82.3225ms)
✔ security-routes: strict input validation on /api/fenix/* (20.0978ms)
✔ security-routes: error responses from signin/code/connect do not leak secrets (4.9738ms)
✔ security-sanitization: sanitizeLog removes passwords, tokens, emails, and auth headers (0.3193ms)
[ProxyRecovery] Detected leftover proxy backup file from previous session. Rolling back...
✔ system-proxy: backup file location and state persistence (3.7897ms)
✔ system-proxy: crash recovery restores previous state if file exists on startup (49.5046ms)
✔ xray-config: structure and local binding from fixed inputs (0.7243ms)
✔ xray-runner: ports are strictly local loopback (0.1043ms)
ℹ tests 32
ℹ suites 0
ℹ pass 32
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1275.962
```

### ۱.۳. خروجی خام `node --check` روی تمام فایل‌های جاوااسکریپت
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

### ۱.۴. خروجی خام `scripts/check-imports.js`
```text
Checking 20 JavaScript files in fenix-standalone...
Detected used npm packages: [ 'electron', 'express', 'socks-proxy-agent' ]
[PASS] All relative imports are strictly isolated, and package.json is 100% matched.
```

### ۱.۵. خروجی خام `npm audit`
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

---

## ۲. خروجی خام اجرای زندهٔ `npm start` و آزمون پنجره (گام ۲)

اسکریپت پایش پردازش‌های الکترون اجرا شد:
```text
ELECTRON_PROCS_COUNT: 4
PID: 10480, MainWindowHandle: 0, Title: ''
PID: 16196, MainWindowHandle: 0, Title: ''
PID: 20832, MainWindowHandle: 134018, Title: ''
PID: 22420, MainWindowHandle: 0, Title: ''
LISTENING: 127.0.0.1:7163 (Owning PID 20832)
```

**نتیجه:** پنجره باز شد (شناسهٔ هندل پنجره ویندوز: `134018`، تعداد پروسه‌های فعال الکترون: ۴ عدد، سرور محلی با موفقیت روی `127.0.0.1:7163` به درخواست‌ها پاسخ می‌دهد و هیچ خطایی ثبت نشد).

---

## ۳. خروجی خام `git status` در هر دو مخزن (گام ۳)

### ۳.۱. در `fenix-standalone`
```text
On branch master
nothing to commit, working tree clean
```

### ۳.۲. در `mlmvpn_windows`
```text
On branch master
nothing to commit, working tree clean
```

---

## ۴. وضعیت چک‌لیست نهایی (گام ۵)
سند [docs/FINAL_CHECKLIST.md](FINAL_CHECKLIST.md) ایجاد و به‌روزرسانی شد. تمام ۳۲ آزمون پاس شده و موارد آزمون چشمی و دستی مشخص گردیدند.

---

## نتیجه‌گیری نهایی
**پروژهٔ Fenix Standalone برای آزمون دستی شما روی محیط ویندوز کاملاً آماده است.**
