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
