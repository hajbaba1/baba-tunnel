# Third-Party Notices and Licenses

This project incorporates, interfaces with, or derives components from several open-source and third-party works.

## 1. FoxyVPN
- Origin: [FoxyVPN](https://github.com/vauth/foxyvpn)
- Copyright: (c) 2026 Vauth
- License: MIT License
- Usage: The Firefox Accounts authentication logic (onepw: PBKDF2 + HKDF, Hawk) is ported from FoxyVPN (itself a port of firefox-vpn-client).

## 2. Mozilla VPN / Android MASQUE Transport
- Origin & Code References:
  - In `fenix.js`: `Android 1.2.41 › engines/fenix` and `Android 1.2.43` (accounts signed in on Mozilla page).
  - In `fenix-session.js`: `The connect walks Android's ladder (engines/fenix › FenixEngine.connect)`.
- License Status:
  - Mozilla VPN client source code is licensed under the Mozilla Public License 2.0 (MPL-2.0).
  - The precise provenance and licensing of internal Android modules referenced in comments is unverified: **باید بررسی شود**.

## 3. Xray-core
- Origin: [XTLS/Xray-core](https://github.com/XTLS/Xray-core)
- License: Mozilla Public License Version 2.0 (MPL-2.0)
- Usage: Standalone executable proxy backend driving HTTP CONNECT tunnels with TLS/H2.

## 4. Phosphor Icons
- Origin: [phosphor-icons](https://phosphoricons.com)
- License: MIT License

---

## ریسک‌ها و محدودیت‌ها (Risks and Limitations)
- **استفاده بدون توافق‌نامهٔ تجاری/رسمی:** این نرم‌افزار بدون عقد قرارداد رسمی با بنیاد موزیلا یا شرکت Fastly به اندپوینت‌های FxA و Guardian متصل می‌شود.
- **استفاده از شناسه کلاینت رسمی موزیلا:** برنامه با Client ID عمومی موزیلا (`5882386c6d801776`) اقدام به تبادل توکن می‌نماید.
- **مکانیسم حل چالش امنیتی:** ماژول `fastly-solver.js` وظیفه حل چالش‌های PoW و Bot Detection فستلی را دارد.
- **پایداری سرویس:** هرگونه مداخلهٔ امنیتی یا تغییر در سطح سرورهای بالادستی ممکن است اتصال را مسدود ساخته یا سهمیه را باطل کند.
