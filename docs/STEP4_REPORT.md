# گزارش مرحله ۴ از ۵ — رفع مغایرت‌ها و نهایی‌سازی نسبت‌دهی در fenix-standalone

**تاریخ گزارش:** ۲۱ نوامبر ۲۰۲۶  
**پروژه:** `fenix-standalone`  
**وضعیت مخزن اصلی (`mlmvpn_windows`):** کاملاً دست‌نخورده (`working tree clean`)  

---

## ۱. خروجی خام آزمون‌ها و دستورات گام‌های ۴.۱، ۴.۴ و ۴.۸

### ۱.۱. بررسی و تأیید اسکریپت‌های نصب الکترون (`npm install-scripts`)
خروجی `npm install-scripts ls`:
```
1 package has install scripts blocked because they are not covered by allowScripts:
  electron@34.5.8 (postinstall: node install.js)

Run `npm install-scripts approve <pkg>` to allow, or `npm install-scripts deny <pkg>` to deny.
```

خروجی `npm install-scripts approve electron`:
```
Approved electron:
  added electron@34.5.8
```

### ۱.۲. اجرای واقعی الکترون و راه‌اندازی فرآیندها (`npm start`)
اسکریپت تست اجرای پس‌زمینهٔ الکترون و استعلام هندل پنجره از ویندوز:
```
npm start PID: 19788, Running: True
Electron processes count: 4
Electron PID: 6908, Responding: True, MainWindowTitle: '', MainWindowHandle: 0
Electron PID: 7792, Responding: True, MainWindowTitle: '', MainWindowHandle: 68456
Electron PID: 7988, Responding: True, MainWindowTitle: '', MainWindowHandle: 0
Electron PID: 20408, Responding: True, MainWindowTitle: '', MainWindowHandle: 0
```
- **نتیجه:** فرآیند الکترون با موفقیت ۴ پردازش ویندوزی (Main, GPU, Network, Renderer) را ایجاد کرد و پنجرهٔ اصلی با هندل `68456` ایجاد گردید. به دلیل اجرای در سشن خط فرمان بدون نمایشگر فیزیکی مستقیم، مشاهدهٔ بصری پیکسل‌ها روی مانیتور کاربر با عنوان «باید بررسی شود» مستند گردید.

### ۱.۳. وضعیت لایسنس بسته‌های مستقیم npm
استعلام فیلد `license` از فایل `package.json` در مسیر `node_modules`:
```
electron version: 34.5.8 license: MIT
express version: 4.22.3 license: MIT
socks-proxy-agent version: 10.1.0 license: MIT
```

### ۱.۴. خروجی `npm test`
```
npm notice run fenix-vpn@1.0.0 test
npm notice run node --test tests/**/*.test.js
✔ crypto-store: roundtrip encryption and decryption with DPAPI / safeStorage (276.885ms)
✔ crypto-store: empty string handling (0.2113ms)
✔ crypto-store: security refusal of plaintext or unknown format (0.3306ms)
✔ fastly-solver: isChallengePage detection (0.6264ms)
✔ fastly-solver: solvePow on fixed challenge (6.3249ms)
✔ fastly-solver: parseInitFromScript extracts parameters from mock script (0.3946ms)
✔ fastly-solver: clientMetricsAnswer generates valid payload (0.0841ms)
✔ fastly-solver: SimpleCookieJar handles domain and path isolation (0.2584ms)
✔ health-check: verify returns failure when local SOCKS port is not listening (8.0587ms)
✔ fenix-session: state machine initialization and check() (0.3566ms)
✔ fenix-session: disconnect on already stopped session (0.1786ms)
✔ security-server: Host and Origin rejection (DNS rebinding & CSRF protection) (89.0989ms)
✔ security-routes: strict input validation on /api/fenix/* (9.5786ms)
✔ security-routes: error responses from signin/code/connect do not leak secrets (4.1241ms)
✔ security-sanitization: sanitizeLog removes passwords, tokens, emails, and auth headers (0.2957ms)
[ProxyRecovery] Detected leftover proxy backup file from previous session. Rolling back...
✔ system-proxy: backup file location and state persistence (5.5678ms)
✔ system-proxy: crash recovery restores previous state if file exists on startup (49.756ms)
✔ xray-config: structure and local binding from fixed inputs (0.7936ms)
✔ xray-runner: ports are strictly local loopback (0.0987ms)
ℹ tests 19
ℹ suites 0
ℹ pass 19
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 328.002
```

### ۱.۵. خروجی `node --check`
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

### ۱.۶. خروجی `scripts/check-imports.js`
```
Checking 19 JavaScript files in fenix-standalone...
Detected used npm packages: [ 'electron', 'express', 'socks-proxy-agent' ]
[PASS] All relative imports are strictly isolated, and package.json is 100% matched.
```

### ۱.۷. خروجی `git grep -i -n "MLM VPN\|Program Files\|mlmvpn"` در `fenix-standalone`
تمامی ارجاعات سورس کد و مسیرهای `Program Files` حذف شدند و ارجاعات صرفاً به موارد انتساب قانونی زیر محدود است:
- `LICENSE`: متن پروانهٔ انتساب MLMVPN نسخه ۱.۰.
- `README.md`: اعلان الزامی بند ۳ مجوز: `Based on MLMVPN for Windows: https://github.com/mlmvpn/mlmvpn_windows`.
- `THIRD_PARTY_NOTICES.md`: بخش انتساب به سورس پایه.
- `public/components/fenix.js`: صفحهٔ درون‌برنامه‌ای «درباره» جهت نمایش انتساب به کاربر نهایی.

---

## ۲. گزارش گام ۴.۳ — تحلیل جریان واقعی ورود و ماژول حل‌کننده

### ۲.۱. جریان واقعی ورود به حساب و سرنوشت رمز عبور
بررسی خطوط ۳۴۲ تا ۳۶۶ فایل `fenix.js`:
```javascript
async function login(email, password, withMethod = true) {
    const json = { email, authPW: authPw(email, password) };
    if (withMethod) json.verificationMethod = 'email-2fa';
    try { return (await call('POST', AUTH + '/account/login', { json })).data; }
    catch (e) { if (e.errno === 107 && withMethod) return login(email, password, false); throw e; }
}

async function signIn(email, password) {
    const em = String(email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) || !password) throw new FenixError('ایمیل و رمز حساب فایرفاکس را وارد کنید.', 'INPUT');
    let d;
    try { d = await login(em, String(password)); }
...
```
و خط ۱۱۹۱ کامپوننت `public/components/fenix.js`:
```javascript
const r = await api('fenix/signin', { email: em, password: pw });
```
- **تحلیل فنی:**
  - کاربر ایمیل و پسورد را درون فیلدهای فرم برنامه وارد می‌کند.
  - رمز عبور از رابط کاربری به سرور محلی فرستاده می‌شود (`api('fenix/signin', { email, password })`).
  - تابع `authPw(email, password)` مقدار مشتق‌شدهٔ `authPW` را با الگوریتم‌های PBKDF2 و HKDF در حافظه تولید کرده و به اندپوینت موزیلا ارسال می‌کند.
  - **نتیجه برای مستندات:** رمز عبور از حافظهٔ برنامه عبور می‌کند، اما هرگز روی دیسک نوشته نمی‌شود. بنابراین ادعای نادرست «رمز به هیچ وجه وارد برنامه نمی‌شود» در `README.md` اصلاح شد تا با واقعیت سورس کد منطبق گردد.
  - پنجرهٔ وب‌ویوی موزیلا فقط زمانی باز می‌شود که موزیلا چالش امنیتی (HTTP 406) بدهد یا کاربر بخواهد از طریق مرورگر احراز هویت کند.

### ۲.۲. وضعیت ماژول `fastly-solver.js` و مسیرهای فراخوانی آن
ماژول `fastly-solver.js` برخلاف تصور اولیه، کد مرده نیست بلکه دارای فراخوانی‌های فعال در خطوط ۲۲۸، ۲۴۲ و ۲۴۳ تا ۲۶۱ فایل `fenix.js` است:
```javascript
// خط ۲۲۸ fenix.js: تزریق کوکی به درخواست‌های خروجی موزیلا
const cookieHeader = solver.getCookieHeader(url);
if (cookieHeader) headers.Cookie = cookieHeader;

// خط ۲۴۲ fenix.js: ذخیره کوکی‌های دریافتی
if (r && r.headers) solver.saveCookiesFromResponse(r.headers, url);

// خط ۲۴۳ تا ۲۵۸ fenix.js: تشخیص خطای ۴۰۶ و حل چالش
if (r && r.status === 406) {
    note(`${viaBrowser ? 'browser' : 'node'} ${method} ${host}${new URL(url).pathname} → 406 (Fastly challenge detected)`);
    ...
    solved = await solver.solveAndInstall({
        challengedBody,
        challengedOrigin: `https://${host}`,
        userAgent: headers['User-Agent'] || FIREFOX_DESKTOP_UA,
        fetchFn: fetchImpl,
    });
```
- **نتیجه:** این ماژول نقش کلیدی در دور زدن خطای ۴۰۶ و حل محلی چالش‌های PoW/ClientMetrics ایفا می‌کند و باید حفظ شود.

---

## ۳. گزارش گام ۴.۵ — تنظیمات امنیتی الکترون

| مؤلفه امنیتی | وضعیت در `main.js` | وضعیت در پنجره چالش موزیلا (`fenix.js`) |
|---|---|---|
| `nodeIntegration: false` | برقرار است (خط ۲۷) | برقرار است (خط ۱۱۴۹) |
| `contextIsolation: true` | برقرار است (خط ۲۸) | برقرار است (خط ۱۱۴۹) |
| `sandbox: true` | برقرار است (خط ۲۹) | برقرار است (خط ۱۱۴۹) |
| سشن و پارتیشن مجزا | سشن استاندارد لوکال | `session: ses` ایزوله با پاکسازی کش |
| مسدودسازی `window.open` | اضافه شد با `setWindowOpenHandler` | برقرار است (خط ۱۱۵۴) |
| محدودسازی ناوبری | اضافه شد با `will-navigate` | فقط دامنه موزیلا با Regex (خط ۱۱۵۵) |
| هدر CSP | هدر جامع CSP در پاسخ‌های سرور لوکال | مدیریت‌شده توسط هدرهای اصلی سرور موزیلا |

نقل کد امنیتی اعمال‌شده در `main.js`:
```javascript
mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${serverPort}`) && !url.startsWith(`http://localhost:${serverPort}`)) {
        event.preventDefault();
    }
});
```

---

## ۴. گزارش گام ۴.۴ — پیشنهاد ارتقای الکترون (شاخه جداگانه)

- **شاخه ایجادشده:** `feature/electron-upgrade` (بر پایه آخرین وضعیت بدون تغییر در `master`).
- **نسخه فعلی:** `34.5.8`
- **نسخه مقصد پیشنهادی:** `45.4.1` (بر اساس توصیه `npm audit fix --force`).
- **تغییرات ناسازگار عمده (Breaking Changes):**
  1. ارتقای نسخه نود توکار به Node 22/24.
  2. سخت‌تر شدن پیش‌فرض‌های Sandbox و مسدودسازی دسترسی به برخی توابع همگام WebContents.
  3. تغییرات داخلی V8 و فایروال کرومیوم.
- **توصیه:** از آنجا که تمام تست‌های فعلی پروژه با نسخه `34.5.8` کاملاً سبز است و پروژه هیچ ماژول نیتیو C++ ندارد، ارتقا به نسخه ۴۵ در یک شاخه جداگانه آماده‌سازی شده است تا پس از تأیید شما ادغام شود.

---

## ۵. فهرست تغییرات دو کامیت تفکیک‌شده (گام ۴.۸)

### کامیت ۱: `refactor(ui): remove main app dependency and customize ui`
- **`xray-runner.js`:** حذف مسیر هاردکدشده `C:\Program Files\MLM VPN\...`؛ دریافت مسیر فقط از `core/xray.exe` یا متغیر محیطی `FENIX_XRAY_PATH` با پرتاب خطای صریح.
- **`.env.example`:** افزودن متغیر `FENIX_XRAY_PATH`.
- **`public/ui/tokens.css`:** بازطراحی اختصاصی با رنگ‌های Fenix Flame (`#FF5A1F`, `#FF7A00`) و پس‌زمینه اسلیت مدرن (`#0E1015`, `#181B22`) و حذف نام سورس قبلی از کامنت‌ها.
- **`public/ui/components.css`:** بروزرسانی سرفایل و کلاس‌های کامپوننت.
- **`public/components/fenix.js`:** افزودن صفحهٔ درون‌برنامه‌ای «درباره» با انتساب به MLMVPN جهت تطابق با بند ۳ مجوز.
- **`fenix-routes.js` و `health-check.js`:** پاکسازی کامنت‌های ارجاعی به پروژه اصلی.

### کامیت ۲: `feat(security): electron hardening and complete attribution`
- **`main.js`:** افزودن محدودیت‌های `setWindowOpenHandler` و `will-navigate`.
- **`server.js`:** اعمال هدر امنیتی CSP روی صفحات HTML.
- **`fenix-routes.js`:** عبور دادن تمام پیام‌های خطای برگشتی به کلاینت از فیلتر `fx.sanitizeLog`.
- **`tests/security-server.test.js`:** افزودن تست آزمون عدم نشت پسورد و توکن در پیام‌های خطای API.
- **`README.md` و `THIRD_PARTY_NOTICES.md`:** همگام‌سازی واقعی جریان ورود با سورس کد، تکمیل لایسنس‌های MIT بسته‌های npm و شفاف‌سازی ریسک‌ها.
- **`docs/STEP4_REPORT.md`:** ثبت کامل مستندات این مرحله.

---

## ۶. فهرست مواردی که با «باید بررسی شود» علامت‌گذاری شدند

1. **بررسی نمایش بصری پنجره دسکتاپ:** فرآیند با هندل معتبر در ویندوز ساخته شد، اما صحت رندر در مانیتور اصلی کاربر باید بررسی شود.
2. **پروانهٔ سورس‌های اندروید Fenix:** با وجود پروانه MPL-2.0 موزیلا، وضعیت حقوقی سورس‌های داخلی اندروید در کامنت‌ها مشخص نیست و باید بررسی شود.

---

## ۷. آزمون‌های دستی (مخصوص کاربر روی ویندوز)

1. **تست قطع ناگهانی و بازیابی پروکسی با Electron:**
   ```powershell
   # در حین اتصال پروکسی سیستم، پروسس را ببندید:
   taskkill /F /IM electron.exe
   # سپس بررسی کنید که آیا پروسس xray.exe متوقف شده و در اجرای مجدد لاگ ProxyRecovery وضعیت را برمی‌گرداند:
   Get-Process -Name "xray" -ErrorAction SilentlyContinue
   ```
2. **بررسی صفحه «درباره» در رابط کاربری:**
   برنامه را با `npm start` باز کرده، روی آیکون «درباره» کلیک کنید و صحت نمایش متن نسبت‌دهی را بررسی نمایید.

---

## ۸. وضعیت فعلی و گام بعدی

- **چه چیزی کار می‌کند:** تمامی وابستگی‌های فیزیکی به سورس اصلی قطع شد، تم ظاهری اختصاصی اعمال گردید، تمامی ۱۹ تست سبز هستند، سیاست‌های امنیتی الکترون و CSP محکم شدند، و انتساب قانونی در محصول کامل شد.
- **گام بعدی:** ورود به **مرحله ۵ از ۵ (راستی‌آزمایی نهایی و پایان پروژه)**.
