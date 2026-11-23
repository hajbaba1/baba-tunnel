# گزارش جامع ریبرندینگ پروژه: BABA Tunnel (BBT)

**تاریخ اجرا:** ۲۳ نوامبر ۲۰۲۶  
**نام قبلی:** Fenix VPN / Fenix Standalone  
**نام جدید:** BABA Tunnel (مخفف: BBT)  
**مجوز:** BABA tunnel ATTRIBUTION LICENCE 1.0 (بر پایهٔ MLMVPN Attribution License 1.0)  
**طراحی و توسعه:** Hajbaba  

---

## ۱. خلاصه و اهداف پروژه

پروژه به صورت کامل از عنوان موقت «Fenix VPN» به برند اختصاصی **BABA Tunnel (BBT)** تغییر نام یافت.  
طبق اصول طراحی و شروط تعیین‌شده:
1. هیچ‌گونه تغییر در منطق ارتباط، پروتکل Fastly MASQUE موزیلا، هستهٔ Xray-core، معماری امنیت، ایزولاسیون شبکه و سیستم بازگشت پروکسی ویندوز داده نشد.
2. تمام ۳۷ تست خودکار واحد و یکپارچگی (`npm test`) با موفقیت ۱۰۰٪ پاس شدند.
3. فایل مجوز ارائه‌شده توسط کاربر (`LICENSE_BABA tunnel.md`) بدون هیچ تغییری در متن حقوقی به ریشهٔ پروژه تحت نام `LICENSE` منتقل شد.
4. آرم و لوگوی پیش‌فرض قبلی حذف و تصویر رسمی ارائه‌شده توسط کاربر در تمامی بخش‌ها (آیکون ویندوز، نصب‌کننده NSIS، نسخه پرتابل و رابط کاربری درون برنامه) جایگزین گردید.
5. سازگاری رو به عقب (Backwards Compatibility) به صورت کامل حفظ شده تا هیچ اسکریپت تست، توکن یا مسیر ذخیره‌سازی قدیمی مختل نشود.

---

## ۲. جدول تغییر نام فایل‌ها (File Renaming via git mv)

فایل‌های هسته با حفظ تاریخچهٔ گیت به نام‌های جدید استاندارد تغییر نام یافتند:

| فایل قبلی | فایل جدید | توضیحات |
| :--- | :--- | :--- |
| `fenix.js` | `bbt-core.js` | هستهٔ ارتباطات، توابع اتصال موزیلا، پیکربندی Xray و مدیریت کلیدها |
| `fenix-session.js` | `bbt-session.js` | ماشین وضعیت اتصال، مدیریت تمدید پس و تایمر سلامت |
| `fenix-routes.js` | `bbt-routes.js` | روتر اکسپرس و نقاط پایانی API محلی برنامه |
| `public/components/fenix.js` | `public/components/bbt.js` | ماژول کلاینت و رندرینگ رابط کاربری کارت جمع‌وجور |

---

## ۳. جایگزینی لوگو و دارایی‌های بصری (Branding Assets)

تصویر ارسالی کاربر با نام کاربری Hajbaba پردازش شد و خروجی‌های استاندارد زیر ساخته شدند:
- **`build/icon.ico`**: فایل چندکیفیتی آیکون ویندوز (شامل اندازه‌های ۱۶، ۲۴، ۳۲، ۴۸، ۶۴، ۱۲۸ و ۲۵۶ پیکسل) جهت استفاده به عنوان آیکون برنامه، فایل اجرایی و نصاب NSIS.
- **`build/icon.png`**: تصویر باکیفیت بالا جهت پردازش بسته‌بندی Electron-builder.
- **`public/assets/logo.png`**: تصویر بهینه‌شده با ابعاد مربعی و گوشه‌های نرم که در نوار بالای برنامه (Topbar) در کنار نام «BABA TUNNEL» نمایش می‌یابد.

---

## ۴. جدول تبدیل متغیرها، کلاس‌ها، روت‌ها و مسیرهای سیستم

| بخش | مقدار / نام قبلی | مقدار / نام جدید | وضعیت سازگاری رو به عقب |
| :--- | :--- | :--- | :--- |
| **نام بسته** | `fenix-vpn` | `baba-tunnel` | `package.json` به‌روز شد |
| **عنوان محصول** | `Fenix VPN` | `BABA Tunnel` | در پنجره الکترون، NSIS و منوی ویندوز |
| **شناسه برنامه (appId)** | `org.fenix.vpn.standalone` | `org.baba.tunnel` | اختصاصی |
| **کلاس خطا** | `FenixError` | `BbtError` | `FenixError = BbtError` پشتیبانی می‌شود |
| **تأیید URI** | `isFenixUri` | `isBbtUri` | `isFenixUri = isBbtUri` با پشتیبانی از هر دو برچسب |
| **روتر API** | `createFenixRouter` | `createBbtRouter` | `createFenixRouter = createBbtRouter` |
| **مسیرهای API** | `/api/fenix/*` | `/api/bbt/*` | تمام روت‌ها روی آرایه `['/api/bbt/*', '/api/fenix/*']` ثبت شدند |
| **هدر امنیت توکن** | `x-fenix-token` | `x-bbt-token` | سرور هر دو هدر `x-bbt-token` و `x-fenix-token` را می‌پذیرد |
| **توکن در کلاینت** | `window.__FENIX_TOKEN__` | `window.__BBT_TOKEN__` | هر دو متغیر سراسری مقداردهی می‌شوند |
| **تابع راه‌انداز UI** | `window.initFenixModule` | `window.initBbtModule` | `window.initFenixModule = window.initBbtModule` |
| **المان ریشه UI** | `#ls-fenix` | `#ls-bbt` | جستجو به صورت `$('ls-bbt') \|\| $('ls-fenix')` انجام می‌شود |
| **تنظیمات مرورگر** | `fenix_prefs` | `bbt_prefs` | انتقال خودکار تنظیمات از `fenix_prefs` به `bbt_prefs` |
| **برچسب‌های Xray** | `fenix-0`, `fenix-1`, `fenix-dns` | `bbt-0`, `bbt-1`, `bbt-dns` | الگوهای اعتبارسنجی هر دو را پوشش می‌دهند |
| **مسیر داده کاربر** | `%APPDATA%\fenix-vpn\` | `%APPDATA%\baba-tunnel\` | انتقال خودکار فایل‌های کانفیگ، کش، لاگ و باینری هسته |
| **متغیرهای محیطی** | `FENIX_XRAY_PATH`<br>`FENIX_SOCKS_PORT`<br>`FENIX_HTTP_PORT` | `BBT_XRAY_PATH`<br>`BBT_SOCKS_PORT`<br>`BBT_HTTP_PORT` | متغیرهای جدید اولویت دارند؛ متغیرهای قبلی به عنوان Fallback فعالند |

---

## ۵. کامنت‌های فنی و تاریخی دست‌نخورده (Preserved References)

طبق دستورالعمل، مراجع زیر که مربوط به ساختار پروتکل بالادستی موزیلا و اندروید هستند بدون تغییر باقی ماندند:
1. ارجاعات پروتکل MASQUE و Android 1.2.41 در کامنت‌های `bbt-core.js` و `THIRD_PARTY_NOTICES.md` (شامل `engines/fenix`, `FenixAuth.checkPageHost`, `FenixConfig`, `FenixScreen.READ_SESSION_JS`, `onepw (FenixAuth)`).
2. ارجاع تاریخی مجوز در بخش درباره و فایل‌های اطلاع‌رسانی شخص ثالث.
3. روت‌های سازگاری `/api/fenix/*` برای جلوگیری از هرگونه شکست ارتباطی.

---

## ۶. نتایج اعتبارسنجی و تست‌ها

### الف) اعتبارسنجی ایزولاسیون و واردات وابستگی‌ها
```text
> node scripts/check-imports.js
Checking 23 JavaScript files in fenix-standalone...
Detected used npm packages: [ 'electron', 'express', 'socks-proxy-agent' ]
[PASS] All relative imports are strictly isolated, and package.json is 100% matched.

> node scripts/verify-isolation.js
Analyzing 23 JavaScript files in fenix-standalone...
[SUCCESS] All require() calls are strictly isolated within fenix-standalone.
```

### ب) اجرای تمام تست‌های خودکار (`npm test`)
```text
> npm test
✔ auto-reconnect: maintains selected country and triggers reconnect on unexpected drop (2.3ms)
✔ auto-reconnect: manual user disconnect cancels reconnect and resets desiredCountry (0.3ms)
✔ auto-reconnect: toggle enables and disables autoReconnect setting (0.2ms)
✔ crypto-store: roundtrip encryption and decryption with DPAPI / safeStorage (406.8ms)
✔ crypto-store: empty string handling (0.3ms)
✔ crypto-store: security refusal of plaintext or unknown format (0.4ms)
✔ fastly-solver: isChallengePage detection (1.6ms)
✔ fastly-solver: solvePow on fixed challenge (11.6ms)
✔ fastly-solver: parseInitFromScript extracts parameters from mock script (0.7ms)
✔ fastly-solver: clientMetricsAnswer generates valid payload (0.2ms)
✔ fastly-solver: SimpleCookieJar handles domain and path isolation (0.5ms)
✔ health-check: verify returns failure when local SOCKS port is not listening (11.7ms)
✔ bbt-session: state machine initialization and check() (0.4ms)
✔ bbt-session: disconnect on already stopped session (0.2ms)
✔ kill-switch: setting persistence and initial state (5.3ms)
✔ kill-switch: engages blackhole when enabled and VPN is off / disconnected (302.8ms)
✔ Step 5.1: Main process local navigation hardening (1.8ms)
✔ Step 5.1: Mozilla challenge window navigation hardening (1.4ms)
✔ security-server: Host and Origin rejection (DNS rebinding & CSRF protection) (186.5ms)
✔ security-routes: strict input validation on /api/fenix/* (13.3ms)
✔ security-routes: error responses from signin/code/connect do not leak secrets (983.7ms)
✔ security-sanitization: sanitizeLog removes passwords, tokens, emails, and auth headers (0.4ms)
✔ system-proxy: backup file location and state persistence (4.8ms)
✔ system-proxy: crash recovery restores previous state if file exists on startup (56.8ms)
✔ xray-config: structure and local binding from fixed inputs (0.8ms)
✔ xray-runner: ports are strictly local loopback (0.1ms)
ℹ tests 37
ℹ suites 0
ℹ pass 37
ℹ fail 0
```

---

## ۷. نتیجه‌گیری

عملیات ریبرندینگ با موفقیت ۱۰۰٪ و بدون حتی یک خطای عملکردی یا رگرسیون امنیتی انجام شد. پروژه اکنون با نام اختصاصی **BABA Tunnel**، نشان بصری و آیکون جدید Hajbaba، و لایسنس جدید کاملاً آمادهٔ استفاده و انتشار است.
