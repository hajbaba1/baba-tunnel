# گزارش بازطراحی کامل رابط کاربری (مرحله ۶ — پنجرهٔ جمع‌وجور کارتی)
## پروژهٔ مستقل Fenix VPN Standalone

**تاریخ بازطراحی:** شنبه، ۳۰ آبان ۱۴۰۵ (21 نوامبر 2026)  
**سبک طراحی:** کارت فشرده و مدرن (مشابه ویندزکرایب / کلاینت‌های مینیمال مدرن)  
**پالت رنگ:** آبسیدین تیره (`#111215`) و شعله‌های پرتقالی/آتشی (`#FF5500` / `#FF3D00`)  
**محیط اجرایی:** Electron 34.5.8 بر بستر Node.js ۲۴  

---

## ۱. فهرست فایل‌های تغییریافته

| مسیر فایل | نوع تغییر | توضیحات |
| :--- | :--- | :--- |
| `main.js` | ویرایش | تغییر اندازه پنجره به ابعاد استاندارد کارت فشرده (`380px × 640px`) |
| `public/index.html` | ویرایش | اتصال شیوه جدید `fenix-card.css` و سبک‌سازی ساختار لودینگ |
| `public/ui/fenix-card.css` | فایل جدید | استایل اختصاصی RTL، دکمهٔ دایره‌ای با انیمیشن درخشش، کشوی تنظیمات، سوئیچ سه‌حالته |
| `public/components/fenix.js` | بازنویسی کامل | ساختار تمیز کامپوننت تک‌کارتی با منوی کشویی (Drawer) و کشوی انتخاب سرور (Sheet) |

> **نکتهٔ مهم:** منطق سمت سرور (`fenix.js`، `fenix-session.js`، `fenix-routes.js`، توابع رمزنگاری و تست‌ها) کاملاً دست‌نخورده باقی ماندند.

---

## ۲. ساختار چیدمان و عناصر بصری (Layout & Architecture)

### ۲.۱. بالای پنجره (Header & Topbar)
- **نشان تجاری:** آیکون شعلهٔ اختصاصی Fenix به همراه عنوان برجسته.
- **وضعیت اتصال (Status Pill):** نشان‌گر بیضی کوچک با نقطهٔ رنگی وضعیت:
  - *خاموش:* خاکستری کم‌رنگ
  - *در حال اتصال:* پرتقالی با انیمیشن تپش (Pulsing)
  - *متصل:* سبز فسفری با هالهٔ درخشان
- **دکمهٔ منو (☰):** دسترسی سریع به کشوی تنظیمات، حساب‌ها، پورت‌ها، لاگ و درباره.

### ۲.۲. دکمهٔ بزرگ روشن/خاموش (Central Power Stage)
- دکمهٔ دایره‌ای ۱۰۴ پیکسلی با پس‌زمینهٔ گرادیان تیره و حاشیه نوری.
- در حالت اتصال: هالهٔ چرخان و نورافشان با رنگ گرم شعله.
- در حالت متصل: درخشش کامل با گرادیان پرتقالی آتشین و متن «شما متصل هستید».
- در زیر دکمه: متن وضعیت فارسی پویا («برای اتصال کلیک کنید»، «در حال برقراری اتصال…»، «خروج از بریتانیا»).

### ۲.۳. ردیف کشور و سرور (Server Row & Sheet)
- ردیف فشرده شامل: پرچم رسمی کشور، نام فارسی («بریتانیا»، «آلمان»، یا «سریع‌ترین سرور»)، پینگ به میلی‌ثانیه با نشانگر کیفیت (سبز/زرد/قرمز) و فلش رو به پایین.
- با کلیک روی ردیف، کشوی شناور با فیلد جستجوی زنده باز می‌شود که فهرست تمامی سرورهای موزیلا همراه با پینگ و پرچم را نشان می‌دهد.

### ۲.۴. ردیف حساب کاربری (Account Row)
- نمایش آیکون کاربر و ایمیل مخفی‌شده جهت حفظ حریم خصوصی: مثلاً `ali***@gmail.com`.
- در صورت عدم ورود: دکمهٔ برجستهٔ «ورود به موزیلا» که مستقیماً پنجرهٔ لاگین فایرفاکس را فرامی‌خواند.

### ۲.۵. سوئیچ سه‌حالته عبور ترافیک (Segmented Mode Switch)
- کنترل جمع‌وجور سه‌حالته به جای کارت‌های بزرگ قدیمی:
  - `فقط پورت` (پورت‌های لوکال SOCKS5/HTTP بدون دستکاری سیستم)
  - `پروکسی ویندوز` (تنظیم پروکسی ویندوز با قابلیت بازگردانی خودکار)
  - `تونل کامل` (هدایت کامل ترافیک)

### ۲.۶. نوار سهمیه ترافیک موزیلا (Footer Quota Bar)
- نوار پیشرفت باریک به همراه مقدار عددی سهمیه (مثلاً «۵۰ گیگابایت ماهانه» یا «۴۸٫۲ گیگابایت باقی‌مانده»).
- دکمهٔ کوچک تازه‌سازی سهمیه با آیکون چرخان.

### ۲.۷. کشوی کناری تنظیمات و درباره (Slide-Over Drawer)
- باز شدن روان با انیمیشن کشویی از راست، شامل ۴ تب:
  1. **حساب‌ها:** مدیریت حساب‌های متصل، سهمیه و دکمهٔ خروج.
  2. **پورت‌ها:** نمایش آدرس `127.0.0.1:10808` و `127.0.0.1:10809` و وضعیت موتور `core/xray.exe`.
  3. **گزارش (Log):** کنسول متنی رویدادهای زنده با تایم‌استمپ فارسی.
  4. **درباره:** حفظ کامل انتساب قانونی بند ۳ پروانه به MLMVPN و لینک سورس.

---

## ۳. نتایج آزمون‌ها و اعتبارسنجی زنده

### ۳.۱. نتیجه آزمون خودکار (`npm test`)
```text
✔ crypto-store: roundtrip encryption and decryption with DPAPI / safeStorage (382.8129ms)
✔ crypto-store: empty string handling (0.2935ms)
✔ crypto-store: security refusal of plaintext or unknown format (0.3545ms)
✔ fastly-solver: isChallengePage detection (0.6026ms)
✔ fastly-solver: solvePow on fixed challenge (10.6551ms)
✔ fastly-solver: parseInitFromScript extracts parameters from mock script (0.8394ms)
✔ fastly-solver: clientMetricsAnswer generates valid payload (0.2445ms)
✔ fastly-solver: SimpleCookieJar handles domain and path isolation (0.5402ms)
✔ health-check: verify returns failure when local SOCKS port is not listening (16.6919ms)
✔ fenix-session: state machine initialization and check() (0.5767ms)
✔ fenix-session: disconnect on already stopped session (0.2591ms)
✔ Step 5.1: Main process local navigation hardening (2.1036ms)
✔ Step 5.1: Mozilla challenge window navigation hardening (1.322ms)
✔ security-server: Host and Origin rejection (DNS rebinding & CSRF protection) (102.3071ms)
✔ security-routes: strict input validation on /api/fenix/* (11.8325ms)
✔ security-routes: error responses from signin/code/connect do not leak secrets (13403.3871ms)
✔ security-sanitization: sanitizeLog removes passwords, tokens, emails, and auth headers (1.1969ms)
✔ system-proxy: backup file location and state persistence (5.533ms)
✔ system-proxy: crash recovery restores previous state if file exists on startup (80.7295ms)
✔ xray-config: structure and local binding from fixed inputs (1.5923ms)
✔ xray-runner: ports are strictly local loopback (0.2726ms)
ℹ tests 32
ℹ suites 0
ℹ pass 32
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 13784.8084
```
*هر ۳۲ آزمون با موفقیت کامل پاس شدند.*

### ۳.۲. نتیجه آزمون زندهٔ پنجره با ابعاد جدید (`npm start`)
```text
ELECTRON_PROCS_COUNT: 4
PID: 15500, MainWindowHandle: 264076, Title: ''
PID: 16556, MainWindowHandle: 0, Title: ''
PID: 17752, MainWindowHandle: 0, Title: ''
PID: 22216, MainWindowHandle: 0, Title: ''
LISTENING: 127.0.0.1:4856 PID: 15500
```
*پنجره با شناسهٔ معتبر `264076` و ابعاد فشرده ۳۸۰ در ۶۴۰ پیکسل باز شد و سرور لوکال روی پورت پویا پاسخگو است.*

---

## نتیجه‌گیری
بازطراحی رابط کاربری به فرمت کارت فشرده و مدرن مطابق تمامی الگوهای خواسته‌شده با موفقیت به پایان رسید. پروژه کاملاً آمادهٔ آزمون چشمی شما روی ویندوز است.
