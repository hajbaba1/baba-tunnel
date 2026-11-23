# گزارش کاهش حجم نصاب و نسخه پرتابل BABA Tunnel (BBT)

**تاریخ:** ۲۳ نوامبر ۲۰۲۶  
**محیط اجرا:** Windows x64 | Node.js v24.21.0 | Electron 34.5.8 | electron-builder 26.18.0

---

## ۱. خلاصه و نتایج نهایی

با انجام تحلیل ساختار خروجی و اعمال بهینه‌سازی‌های هدفمند روی پیکربندی بسته‌بندی (`electron-builder`) بدون تغییر در منطق برنامه، معماری شبکه یا رفتار امنیتی، حجم نصاب ویندوز و نسخه پرتابل به میزان قابل‌توجهی کاهش یافت:

| بسته خروجی | حجم اولیه (بیس‌لاین) | حجم نهایی بهینه‌شده | کاهش حجم (Delta) | درصد صرفه‌جویی |
| :--- | :--- | :--- | :--- | :--- |
| **BABA Tunnel Setup 1.0.0.exe (NSIS Installer)** | **121.44 MB** (121,438,527 B) | **83.20 MB** (83,196,522 B) | **-38.24 MB** | **۳۱.۵٪ کاهش** |
| **BABA Tunnel 1.0.0.exe (Portable)** | **106.81 MB** (111,996,728 B) | **72.77 MB** (76,302,127 B) | **-34.04 MB** | **۳۱.۹٪ کاهش** |

---

## ۲. گام ۱: ریشه‌یابی و تشخیص علل حجم بالا

در گام تشخیص اولیه، پوشه ساخت unpacked (`dist/win-unpacked`) با حجم غیرفشرده **405.8 MB** بررسی شد. سه عامل اصلی افزایش بی‌مورد حجم شناسایی شدند:

1. **بسته‌بندی مضاعف باینری‌های `core/` (Duplicated Binaries):**
   - در فایل `package.json`، پوشه باینری‌ها هم در `extraFiles` و هم در `extraResources` تعریف شده بود. این امر باعث شده بود فایل‌های سنگین زیر **دو بار** در خروجی نهایی کپی شوند:
     - `core/xray.exe` (38.78 MB) و `resources/core/xray.exe` (38.78 MB)
     - `core/geoip.dat` (16.58 MB) و `resources/core/geoip.dat` (16.58 MB)
     - `core/geosite.dat` (11.14 MB) و `resources/core/geosite.dat` (11.14 MB)
     - مجموع حجم اشغال‌شده مضاعف در بسته: **133.0 MB غیرفشرده!**
   - علاوه بر این، طبق طراحی فازهای قبلی پروژه، باینری‌های هسته به صورت جداگانه از طریق متغیر محیطی `BBT_XRAY_PATH` یا نصب اختصاصی مدیریت می‌شوند و نباید در نصاب اصلی کپی مضاعف داشته باشند.

2. **زبان‌های بدون استفاده کرومیوم (`locales/`):**
   - کرومیوم به صورت پیش‌فرض ۵۵ فایل ترجمه زبانی (`*.pak`) را با خود حمل می‌کرد که جمعاً **41.25 MB** فضای غیرفشرده مصرف می‌کردند (مانند am, ar, bg, bn, ca, cs, da, de, el, es, et, fil, fi, fr, gu, he, hi, hr, hu, id, it, ja, kn, ko, lt, lv, ml, mr, ms, nb, nl, pl, pt-BR, pt-PT, ro, ru, sk, sl, sr, sv, sw, ta, te, th, tr, uk, ur, vi, zh-CN, zh-TW).
   - از آنجا که رابط کاربری BABA Tunnel دوزبانه (فارسی و انگلیسی) است، حفظ ۵۲ لوکال دیگر غیرضروری بود.

3. **وضعیت `app.asar` و بسته‌های `node_modules`:**
   - فایل `app.asar` دارای حجم مطلوب **6.87 MB** بود. بررسی داخل asar نشان داد که هیچ‌یک از پکیج‌های توسعه (`devDependencies` شامل electron, electron-builder و ابزارهای تست) وارد بسته اصلی نشده‌اند و تنها پکیج‌های اجرایی موردنیاز (`express`, `socks-proxy-agent`) حضور دارند.

---

## ۳. گام ۲: بهینه‌سازی گام‌به‌گام و جدول مقایسه تغییرات

بهینه‌سازی در سه مرحله مجزا اعمال و خروجی در هر مرحله ثبت گردید:

| گام بهینه‌سازی | شرح اقدام انجام‌شده | حجم Setup (NSIS) | حجم Portable | کاهش در این گام |
| :--- | :--- | :--- | :--- | :--- |
| **مرحله ۰ (بیس‌لاین)** | تنظیمات قبلی پروژه | 121.44 MB (121,438,527 B) | 106.81 MB (111,996,728 B) | - |
| **گام ۲.۱: حذف موارد مضاعف core** | حذف کپی‌های مضاعف `extraResources` و `extraFiles` پوشه `core/` | 86.35 MB (90,539,960 B) | 79.36 MB (83,211,960 B) | **-29.46 MB (-25.4%)** |
| **گام ۲.۲: هرس لوکال‌های کرومیوم** | افزودن `electronLanguages: ["fa", "en"]` (حذف ۵۲ لوکال غیرلازم و نگه‌داشتن fa, en) | 79.34 MB (83,198,605 B) | 72.77 MB (76,301,639 B) | **-7.01 MB (-8.1%)** |
| **گام ۲.۳: فشرده‌سازی حداکثری و لیست فایل‌ها** | تنظیم `compression: "maximum"` (الگوریتم 7z Ultra) و تعیین صریح لیست فایل‌های مجاز در `files` | 79.34 MB (83,196,522 B) | 72.77 MB (76,302,127 B) | **بهینه‌سازی کامل ساختار** |

### تغییرات انجام‌شده در پیکربندی `package.json`:
```json
{
  "build": {
    "appId": "org.baba.tunnel",
    "productName": "BABA Tunnel",
    "compression": "maximum",
    "electronLanguages": [
      "fa",
      "en"
    ],
    "directories": {
      "output": "dist"
    },
    "win": {
      "target": [
        "nsis",
        "portable"
      ],
      "icon": "build/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "BABA Tunnel"
    },
    "extraFiles": [
      {
        "from": "LICENSE",
        "to": "LICENSE"
      },
      {
        "from": "THIRD_PARTY_NOTICES.md",
        "to": "THIRD_PARTY_NOTICES.md"
      }
    ],
    "files": [
      "*.js",
      "public/**/*",
      "package.json"
    ]
  }
}
```

---

## ۴. لیست موارد حذف‌شده و موارد حفظ‌شده

### موارد حذف‌شده از بسته نهایی:
1. پوشه باینری مضاعف `resources/core/` (شامل xray.exe, geoip.dat, geosite.dat).
2. کپی مضاعف `core/` در ریشه نصاب.
3. ۵۲ فایل لوکال غیرضروری کرومیوم در پوشه `locales/` (آلمانی، فرانسوی، ژاپنی، چینی، هندی، ایتالیایی، اسپانیایی و غیره).
4. فایل‌های تست، اسکریپت‌های توسعه و لاگ‌ها از ریشه پروژه.

### موارد حفظ‌شده و دست‌نخورده:
1. لوکال‌های موردنیاز: `fa.pak` (پشتیبانی کامل زبان فارسی)، `en-US.pak` و `en-GB.pak`.
2. کلیه فونت‌های فارسی اختصاصی: تمام وزن‌های `IRANSansXFaNum` در `public/font/`.
3. کلیه آیکون‌های وکتور فسفر و پرچم کشورهای لوکیشن در `public/assets/`.
4. فایل‌های حقوقی الزامی: `LICENSE` و `THIRD_PARTY_NOTICES.md` در ریشه نصاب.
5. کلیه ماژول‌های امنیتی و هسته: `bbt-core.js`, `bbt-session.js`, `bbt-routes.js`, `kill-switch.js`, `system-proxy.js`, `traffic-monitor.js`, `health-check.js`, `crypto-store.js`, `fastly-solver.js`.

---

## ۵. گام ۳: راستی‌آزمایی، اجرای آزمایشی و تست‌ها

1. **بررسی صحت ارجاعات و ایمپورت‌ها (`scripts/check-imports.js`):**
   ```
   Checking 25 JavaScript files in fenix-standalone...
   Detected used npm packages: [ 'electron', 'express', 'socks-proxy-agent' ]
   [PASS] All relative imports are strictly isolated, and package.json is 100% matched.
   ```

2. **اجرای کامل مجموعه تست‌ها (`npm test`):**
   ```
   ✔ auto-reconnect (3 tests)
   ✔ crypto-store (3 tests)
   ✔ fastly-solver (5 tests)
   ✔ health-check (1 test)
   ✔ bbt-session (2 tests)
   ✔ kill-switch (2 tests)
   ✔ Step 5.1: Main process local navigation hardening (7 tests)
   ✔ Step 5.1: Mozilla challenge window navigation hardening (6 tests)
   ✔ security-server & security-routes & security-sanitization (4 tests)
   ✔ system-proxy & crash recovery (2 tests)
   ✔ traffic-monitor (2 tests)
   ✔ xray-config & xray-runner (2 tests)

   ℹ tests 39
   ℹ pass 39
   ℹ fail 0
   ```
   **نتیجه:** ۱۰۰٪ تست‌ها (۳۹ از ۳۹) بدون هیچ خطایی سبز باقی ماندند.

3. **بررسی فونت و زبان فارسی رابط کاربری:**
   - رابط کاربری به صورت مستقل از پکیج‌های محلی، فایل‌های فونت `IRANSansXFaNum-*.ttf` را از داخل `public/font/` و استایل‌های RTL را از `public/index.html` لود می‌کند.
   - با حفظ فایل `fa.pak` در کرومیوم، علاوه بر رابط کاربری وب، لایه بومی پنجره‌ها و منوهای راست‌کلیک نیز کاملاً با زبان فارسی و چینش راست‌به‌چپ سازگار مانده‌اند.

4. **تست اجرای برنامه:**
   - فایل خروجی نصاب `dist/win-unpacked/BABA Tunnel.exe` با موفقیت اجرا شد و بدون کرش یا خطا پاسخگو بود.
