# گزارش ساخت نصب‌کنندهٔ ویندوز (مرحله ۷ — Electron Builder)
## پروژهٔ مستقل Fenix VPN Standalone

**تاریخ ساخت:** شنبه، ۳۰ آبان ۱۴۰۵ (21 نوامبر 2026)  
**نسخهٔ نرم‌افزار:** 1.0.0  
**ابزار ساخت:** `electron-builder` نسخهٔ 26.18.0  
**اهداف خروجی:** نصاب معمولی NSIS و نسخهٔ تک‌فایلی Portable برای معماری x64 ویندوز  

---

## ۱. مشخصات فایل‌های تولیدشده در پوشهٔ `dist/`

| نام فایل | فرمت | اندازه (بایت) | حجم تخمینی | مسیر مطلق روی سیستم |
| :--- | :--- | :--- | :--- | :--- |
| **Fenix VPN Setup 1.0.0.exe** | نصاب NSIS | ۸۹,۸۵۴,۳۰۰ بایت | ~ ۸۵٫۶۹ مگابایت | `c:\Users\1224\Desktop\New folder\fenix-standalone\dist\Fenix VPN Setup 1.0.0.exe` |
| **Fenix VPN 1.0.0.exe** | پرتابل (تک‌فایل) | ۸۲,۵۸۴,۴۶۴ بایت | ~ ۷۸٫۷۶ مگابایت | `c:\Users\1224\Desktop\New folder\fenix-standalone\dist\Fenix VPN 1.0.0.exe` |
| **Fenix VPN.exe** (در win-unpacked) | باینری پوشه‌ای | ۱۹۰,۵۵۷,۱۸۴ بایت | ~ ۱۸۱ مگابایت | `c:\Users\1224\Desktop\New folder\fenix-standalone\dist\win-unpacked\Fenix VPN.exe` |

---

## ۲. خروجی خام فرآیند ساخت (`npm run dist`)

```text
> fenix-vpn@1.0.0 dist
> electron-builder --win

  • electron-builder  version=26.18.0 os=10.0.26200
  • loaded configuration  file=package.json ("build" field)
  • executing @electron/rebuild  electronVersion=34.5.8 arch=x64 buildFromSource=false workspaceRoot=C:\Users\1224\Desktop\New folder\fenix-standalone projectDir=./ appDir=./
  • installing native dependencies  arch=x64
  • completed installing native dependencies
  • packaging       platform=win32 arch=x64 electron=34.5.8 appOutDir=dist\win-unpacked
  • downloaded      label=electron progress=100%
  • downloaded electron zip extracted successfully  output=C:\Users\1224\Desktop\New folder\fenix-standalone\dist\win-unpacked
  • searching for node modules  pm=npm searchDir=C:\Users\1224\Desktop\New folder\fenix-standalone
  • duplicate dependency references  dependencies=["http-errors@2.0.1","on-finished@2.4.2","qs@6.16.2","http-errors@2.0.1","iconv-lite@0.4.24","type-is@1.6.18","on-finished@2.4.2","get-intrinsic@1.3.0","call-bind-apply-helpers@1.0.2","call-bind-apply-helpers@1.0.2","es-object-atoms@1.1.2","call-bound@1.0.4","get-intrinsic@1.3.0","side-channel-map@1.0.1","http-errors@2.0.1","on-finished@2.4.2","send@0.19.2","mime-types@2.1.35"]
  • updating asar integrity executable resource  executablePath=dist\win-unpacked\Fenix VPN.exe
  • no code signing certificate configured, signing is skipped  path=dist\win-unpacked\Fenix VPN.exe
  • building        target=nsis file=dist\Fenix VPN Setup 1.0.0.exe archs=x64 oneClick=false perMachine=false
  • no code signing certificate configured, signing is skipped  path=C:\Users\1224\AppData\Local\Temp\t-LQKYgH\elevate-staging-1\resources\elevate.exe
  • no code signing certificate configured, signing is skipped  path=dist\Fenix VPN Setup 1.0.0.__uninstaller.exe
  • no code signing certificate configured, signing is skipped  path=dist\Fenix VPN Setup 1.0.0.exe
  • building block map  blockMapFile=dist\Fenix VPN Setup 1.0.0.exe.blockmap
  • building        target=portable file=dist\Fenix VPN 1.0.0.exe archs=x64
  • no code signing certificate configured, signing is skipped  path=C:\Users\1224\AppData\Local\Temp\t-LQKYgH\elevate-staging-4\resources\elevate.exe
  • no code signing certificate configured, signing is skipped  path=dist\Fenix VPN 1.0.0.exe
```

---

## ۳. نتیجهٔ آزمون اجرای فایل باینری تولیدشده

باینری تولیدشدهٔ نهایی در محیط کامپایل‌شده اجرا و فرآیندهای آن با پاورشل استخراج شد:
```text
FENIX_PROCS_COUNT: 4
PID: 7980, MainWindowHandle: 1837842, Title: ''
PID: 15912, MainWindowHandle: 0, Title: ''
PID: 21784, MainWindowHandle: 0, Title: ''
PID: 21856, MainWindowHandle: 0, Title: ''
LISTENING: 127.0.0.1:7862 PID: 7980
```
- **وضعیت اجرای باینری:** موفقیت‌آمیز (`MainWindowHandle: 1837842`).
- **وضعیت آزمون نصب خودکار NSIS:** در محیط‌های شل غیرتعاملی خودکار، ویزارد گرافیکی ویندوز نیازمند کلیک کاربر است؛ بنابراین اجرای گرافیکی کامل ویزارد نصاب در حالت تعاملی **«باید بررسی شود»** (توسط کاربر روی دسکتاپ).

---

## ۴. انطباق قانونی پروانه (License & Notices)

طبق الزامات بند ۳ پروانهٔ انتساب MLMVPN:
- فایل‌های [LICENSE](file:///c:/Users/1224/Desktop/New%20folder/fenix-standalone/dist/win-unpacked/LICENSE) و [THIRD_PARTY_NOTICES.md](file:///c:/Users/1224/Desktop/New%20folder/fenix-standalone/dist/win-unpacked/THIRD_PARTY_NOTICES.md) با فیلد `extraFiles` مستقیماً داخل ریشهٔ فایل نصبی در کنار فایل اجرایی گنجانده شدند.
- صفحهٔ «درباره» داخل نرم‌افزار نیز اطلاعات کامل انتساب و نویسنده را نمایش می‌دهد.

---

## ۵. عدم گنجاندن `core/xray.exe` و نحوهٔ مدیریت آن

- باینری `core/xray.exe` به دلیل عدم ردیابی در مخزن گیت و حجم فایل، عمداً داخل `app.asar` یا بستهٔ نصبی پیش‌فرض قرار نگرفته است.
- در عوض، ماژول `xray-runner.js` طوری به‌روزرسانی شد که مسیر را در اولویت‌های زیر جستجو کند:
  1. مسیر تعریف‌شده در متغیر محیطی `FENIX_XRAY_PATH`
  2. پوشهٔ محلی برنامه: `core/xray.exe`
  3. پوشهٔ کاربری سیستم: `%APPDATA%\fenix-vpn\core\xray.exe`
- اگر فایل یافت نشود، پنجره به شکل دوستانه و شفاف خطای راهنما را نشان می‌دهد.

---

## ۶. امضای کد (Code Signing) و هشدار SmartScreen

- **چرا امضا نشد؟** دریافت گواهی تجاری امضای کد (EV/OV Code Signing) مستلزم پرداخت هزینهٔ سالانه (چند صد دلار) و تأیید هویت رسمی حقوقی است. بسته‌های تست اولیه بدون گواهی ساخته می‌شوند.
- **توضیح برای کاربر:** در سیستم‌های ویندوز ۱۰ و ۱۱، ویندوز دفندر اسمارت‌اسکرین به فایل‌های بدون گواهی یا با شهرت ناشناخته هشدار **Windows protected your PC** می‌دهد. این یک رفتار کاملاً استاندارد امنیتی مایکروسافت برای برنامه‌های ناشناس است و نشانهٔ آسیب‌پذیری نیست.
- برای اجرای برنامه کافی است کاربر روی **More info** و سپس دکمهٔ **Run anyway** کلیک کند.
