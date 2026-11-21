# Fenix Standalone VPN

Fenix Standalone is a standalone, lightweight Electron and Node.js VPN client driving Mozilla VPN / Fastly MASQUE endpoints through an Xray-core proxy pipeline.

## Attribution Notice
Based on MLMVPN for Windows:  
https://github.com/mlmvpn/mlmvpn_windows

Original Copyright (c) 2026 Ehsan (MLMVPN). Licensed under the MLMVPN Attribution License 1.0 (see [LICENSE](LICENSE)).

---

## Warning & Usage Guidelines
> **IMPORTANT:** In the original MLMVPN repository, executing `node server.js` directly altered firewall rules and system DNS settings. In this standalone repository, all firewall and DNS mutations have been eliminated. Only local SOCKS/HTTP ports and safe Windows proxy settings (with automated state backup and rollback) are utilized.
> 
> To preview the UI safely:
> ```bash
> npm run preview
> ```
> Or run the full desktop client:
> ```bash
> npm start
> ```

---

## Architecture & Authentication Flow
- **Authentication:** Users input email and password into the in-app client form. The application computes the derived `authPW` in memory via PBKDF2/HKDF and transmits it over TLS to Mozilla's FxA endpoint. The plaintext password is never stored on disk; granted tokens are protected using Windows DPAPI / Electron `safeStorage`.
- **Fastly Challenge Solver:** When Mozilla endpoints return HTTP 406 challenges, `fastly-solver.js` executes proof-of-work challenges locally. If interactive verification is required, an isolated Electron window loads Mozilla's challenge page directly.
- **Safe Proxy Management:** Windows Internet Settings are toggled with automated state backup on disk and recovery after abnormal shutdowns.
- **Port Isolation:** SOCKS (10808) and HTTP (10809) inbounds listen strictly on `127.0.0.1`.

---

## ریسک‌ها و محدودیت‌ها (Risks and Limitations)
این برنامه با اهداف تحقیقاتی و دسترسی به اطلاعات آزاد طراحی شده است:
1. **استفاده از زیرساخت شخص ثالث بدون توافق‌نامهٔ رسمی:** اتصال به سرورهای موزیلا (Mozilla Guardian) و شبکهٔ لبهٔ Fastly بدون قرارداد رسمی انجام می‌گیرد.
2. **احراز هویت با شناسهٔ کلاینت موزیلا:** برنامه برای تبادل توکن از Client ID رسمی موزیلا (`5882386c6d801776`) استفاده می‌کند.
3. **حل خودکار چالش‌های امنیتی:** از ماژول محلی `fastly-solver.js` برای دور زدن چالش‌های ربات‌سنجی Fastly استفاده می‌شود.
4. **پایداری سرویس:** در هر زمان ممکن است به‌واسطهٔ تغییرات امنیتی بالادستی سرورهای موزیلا یا فستلی، دسترسی مسدود یا متوقف گردد.

---

## نصب و اجرای فایل نصبی در ویندوز (Windows Installer & SmartScreen)

### فایل‌های تولیدشده در پوشهٔ `dist/`
- **نصب‌کنندهٔ رسمی ویندوز (NSIS Installer):** `dist/Fenix VPN Setup 1.0.0.exe` (~85.7 MB)
- **نسخهٔ پرتابل بدون نیاز به نصب (Portable):** `dist/Fenix VPN 1.0.0.exe` (~78.7 MB)

### هشدار ویندوز اسمارت‌اسکرین (Windows SmartScreen Notice)
> **نکته برای کاربران تست ویندوز:**  
> فایل‌های نصبی تولیدشده فاقد گواهی تجاری امضای کد (Code Signing Certificate) هستند؛ زیرا این گواهی‌ها سالانه نیازمند خرید رسمی شرکتی هستند. در نتیجه، هنگام اولین اجرای فایل نصبی یا پرتابل، ویندوز ممکن است پنجرهٔ آبی‌رنگ **Windows protected your PC** را نمایش دهد.  
> **این هشدار کاملاً طبیعی است و نشانهٔ نقص فنی یا بدافزار نیست.**  
> برای ادامه:
> 1. روی **More info** (اطلاعات بیشتر) کلیک کنید.
> 2. دکمهٔ **Run anyway** (در هر صورت اجرا شود) را بزنید.

### تأمین باینری `xray.exe` (هستهٔ ارتباط)
به دلیل حجم بالا و عدم قرارگیری باینری‌های اجرایی در گیت، فایل `xray.exe` در فایل نصبی asar بسته‌بندی نشده است. کاربر برای اولین اتصال کافی است فایل `xray.exe` را در یکی از مسیرهای زیر قرار دهد:
- پوشهٔ `core/xray.exe` در محل نصب برنامه
- پوشهٔ کاربری `%APPDATA%\fenix-vpn\core\xray.exe`
- یا تعریف متغیر محیطی `FENIX_XRAY_PATH` در فایل `.env` یا ویندوز.
