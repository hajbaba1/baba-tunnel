# گزارش جامع بررسی و رفع نشت WebRTC در حالت «تونل کامل سیستم» (TUN)

**تاریخ:** ۲۳ نوامبر ۲۰۲۶  
**محیط اجرا:** Windows x64 | Node.js v24.21.0 | Electron 34.5.8 | sing-box 1.14.3 | Wintun 0.14.1

---

## ۱. خلاصه و ریشه‌یابی قطعی نشت (گام ۱ و ۲)

بر اساس مقایسه مستقیم و بدون حدسِ کد مخزن `bbt-standalone` در برابر مخزن مرجع `mlmvpn_windows`:

### ۱.۱. تشخیص گام ۱ — وضعیت اولیه در `bbt-standalone`:
در پروژه `bbt-standalone`، ماژول `tun-manager.js` و باینری‌های `sing-box.exe` و `wintun.dll` **اصلاً وجود نداشتند**.
گزینهٔ سوم رابط کاربری با عنوان «تونل کامل سیستم» صرفاً به روت زیر هدایت می‌شد:

```javascript
// bbt-routes.js (قبل از اصلاح)
router.post('/api/v2ray/tun', bbtHandle(async (b) => {
    proxyWanted = true;
    await systemProxy.enable();
    return { ok: true, enabled: true, tun: false, sysProxy: true };
}));
```

**علت قطعی نشت WebRTC:**
حالت «تونل کامل» در واقعیت اصلاً یک کارت شبکه مجازی (TUN) نمی‌ساخت؛ بلکه دقیقاً همان پروکسی رجیستری ویندوز (WinINet HTTP/SOCKS Proxy) را فعال می‌کرد.
مرورگرهای مدرن (گوگل کروم، مایکروسافت اج، موزیلا فایرفاکس) درخواست‌های وب را به پروکسی می‌فرستند، اما پروتکل **WebRTC برای ارسال بسته‌های STUN/TURN (که بر بستر UDP است) پروکسی‌های HTTP/WinINet سیستم را دور می‌زند** و بسته‌های UDP را مستقیماً از کارت شبکه فیزیکی واقعی (Wi-Fi یا LAN) ارسال می‌کند. در نتیجه، سایت‌هایی مانند `ipleak.net` آی‌پی واقعی IPv4 و IPv6 کاربر را بدون کوچک‌ترین مانعی کشف می‌کردند.

---

### ۱.۲. بررسی گام ۲ — معماری ضد نشت در مخزن مرجع `mlmvpn_windows`:
در مخزن مرجع `mlmvpn_windows`، حالت TUN با استفاده از موتور `sing-box` و درایور کرنل `wintun.dll` پیاده شده است:

1. **تسخیر کامل مسیر پیش‌فرض (`auto_route: true`):**
   ```javascript
   // نقل‌قول مستقیم از mlmvpn_windows/tun-manager.js خط ۱۱۷۳:
   auto_route: true,
   ```
   این گزینه مسیر پیش‌فرض `0.0.0.0/0` و `::/0` را روی کارت شبکه مجازی قرار می‌دهد.

2. **مسدودسازی فیلترینگ WFP برای جلوگیری از خروج بسته‌ها (`strict_route: true`):**
   ```javascript
   // نقل‌قول مستقیم از mlmvpn_windows/tun-manager.js خط ۱۱۷۶:
   // Blocks traffic that tries to escape the tunnel via another interface. This is
   // the difference between "mostly tunnelled" and "no leaks".
   strict_route: true,
   ```
   ویندوز از طریق Windows Filtering Platform به هیچ برنامه‌ای (از جمله WebRTC در کروم) اجازه نمی‌دهد بسته‌ای را خارج از آداپتور TUN بفرستد.

3. **آدرس‌دهی و مهار IPv6 (علت نشت اصلی در خطوط دوگانه‌سوز):**
   ```javascript
   // نقل‌قول مستقیم از mlmvpn_windows/tun-manager.js خط ۲۹ و ۳۶:
   const TUN_ADDRESS6 = 'fdfe:dcba:9876::1/126';
   const tunAddresses = (options) => (options && options.ipv4Only ? [TUN_ADDRESS] : [TUN_ADDRESS, TUN_ADDRESS6]);
   ```
   و در قوانین روتینگ:
   ```javascript
   // نقل‌قول مستقیم از mlmvpn_windows/tun-manager.js خط ۱۳۷۲:
   // Backstop for IPv6. The adapter now captures v6 (see TUN_ADDRESS6), so
   // these packets reach us instead of escaping — but the SOCKS engine behind
   // this cannot carry them. Reject rather than forward...
   { ip_version: 6, action: 'reject' },
   ```
   و استراتژی DNS:
   ```javascript
   // نقل‌قول مستقیم از mlmvpn_windows/tun-manager.js خط ۱۱۴۶:
   strategy: 'ipv4_only',
   ```
   علاوه بر این در لایه فایروال ویندوز (`gt-guard.js` خط ۶۵۵):
   ```powershell
   New-NetFirewallRule -DisplayName "*-ipv6-out" -Direction Outbound -RemoteAddress 2000::/3 -Action Block -Profile Any
   ```
   تمامی بسته‌های IPv6 به ۲000::/3 مسدود می‌شوند تا WebRTC نتواند هیچ کاندیدای آی‌پی محلی یا اینترنتی IPv6 تولید کند.

4. **مهار ترافیک UDP و WebRTC STUN:**
   ```javascript
   // نقل‌قول مستقیم از mlmvpn_windows/tun-manager.js خط ۱۳۶۵:
   ...(!supportsUdp ? [{ network: 'udp', action: 'reject', method: 'default' }] : []),
   ```
   از آنجا که هسته SOCKS پروکسی در فاز ارتباط با سرور موزیلا بر بستر TCP/HTTP CONNECT است، بسته‌های سرگردان UDP (شامل درخواست‌های STUN مربوط به WebRTC) به جای درز کردن به شبکه فیزیکی، در داخل اینترفیس TUN بلافاصله `reject` می‌شوند؛ لذا مرورگر درجا متوقف شده و به هیچ وجه آی‌پی واقعی را نشت نمی‌دهد.

---

## ۲. پیاده‌سازی و اصلاحات انجام‌شده در `bbt-standalone` (گام ۳)

### ۲.۱. ایجاد ماژول مستقل `tun-manager.js`
ماژول اختصاصی [`tun-manager.js`](file:///c:/Users/1224/Desktop/New%20folder/fenix-standalone/tun-manager.js) با الگوبرداری از ساختار استاندارد sing-box اضافه شد:
- **پیکربندی اینباند TUN:**
  ```javascript
  inbounds: [{
      type: 'tun',
      tag: 'tun-in',
      interface_name: 'BBTTUN',
      address: ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'],
      mtu: 1420,
      auto_route: true,
      strict_route: true,
      stack: 'system',
  }]
  ```
- **مهار و انزوای فرآیندها:**
  خارج کردن پردازه‌های `xray.exe`, `node.exe`, `electron.exe` از تونل با قاعده `{ process_name: [...], outbound: 'direct' }` برای جلوگیری از ایجاد حلقه (Loopback).
- **مسدودسازی نشت WebRTC و UDP:**
  قاعده `{ network: 'udp', action: 'reject', method: 'default' }`.
- **مسدودسازی نشت IPv6:**
  قاعده `{ ip_version: 6, action: 'reject' }` در sing-box به همراه اعمال قانون فایروال ویندوز `BBT-Tunnel-IPv6-Block` برای رنج `2000::/3`.
- **استراتژی DNS:**
  تنظیم `strategy: 'ipv4_only'` به همراه Detour روی پورت ساکس `10808` برای ممانعت از کشف رکورد‌های AAAA و نشت DNS.

### ۲.۲. ادغام با Kill Switch در صورت سقوط TUN:
اگر فرآیند `sing-box` به هر دلیلی سقوط کند (`crash` یا بسته شدن غیرمنتظره):
```javascript
proc.on('exit', (code, signal) => {
    if (!isStopping) {
        // Unexpected drop / crash: engage fail-closed kill switch
        killSwitch.engage('tun_crash');
    }
});
```
کیل‌سوئیچ بلافاصله فعال شده و مانع از بازگشت خودکار ترافیک به اینترنت مستقیم و لو رفتن آی‌پی می‌شود.

### ۲.۳. انتقال باینری‌های لازم:
فایل‌های `sing-box.exe` و `wintun.dll` در مسیر `fenix-standalone/core/` قرار گرفتند.

---

## ۳. نتایج آزمون‌های خودکار (گام ۴)

مجموعه تست اختصاصی [`tests/tun-leak-prevention.test.js`](file:///c:/Users/1224/Desktop/New%20folder/fenix-standalone/tests/tun-leak-prevention.test.js) ایجاد شد که موارد زیر را به طور کامل اعتبارسنجی می‌کند:
1. صحت کامل ساختار کانفیگ sing-box و حضور کلید‌های حیاتی `auto_route: true`, `strict_route: true`
2. وجود قواعد مسدودسازی نشت `ip_version: 6 → reject` و `network: udp → reject`
3. سیاست `strategy: 'ipv4_only'` در بخش DNS
4. حضور فایل‌های باینری `sing-box.exe` و `wintun.dll` در پوشه core
5. کارکرد صحیح بازیابی پس از کرش (`recoverFromCrash`)

**خروجی اجرای تست‌ها (`npm test`):**
```
✔ tun-leak-prevention: sing-box anti-leak config structure (1.01ms)
✔ tun-leak-prevention: sing-box and wintun binaries exist in core (1.01ms)
✔ tun-leak-prevention: state file and crash recovery tracking (2129ms)
...
ℹ tests 42
ℹ pass 42
ℹ fail 0
```
تمام **۴۲ تست از ۴۲ تست** پروژه با موفقیت کامل پاس شدند.

---

## ۴. دستورالعمل تست دستی نشت روی ویندوز (برای کاربر)

برای اطمینان ۱۰۰٪ از عدم نشت آی‌پی توسط WebRTC، مراحل زیر را روی ویندوز انجام دهید:

1. **اجرای برنامه با دسترسی ادمین:**
   - آیکون **BABA Tunnel** را با راست‌کلیک و انتخاب گزینه **Run as Administrator** باز کنید (ایجاد کارت شبکه Wintun و قوانین WFP نیاز به دسترسی Administrator دارد).
2. **تنظیم حالت پوشش روی «تونل کامل»:**
   - در رابط کاربری، در بخش پوشش ترافیک گزینه **«تونل کامل»** (یا Tunnel) را انتخاب کنید.
3. **اتصال به VPN:**
   - دکمه اتصال را بزنید تا وضعیت به «متصل شد» تغییر کند و پیام «تونل کامل و ضد نشت فعال شد» در گزارش ظاهر شود.
4. **بررسی سایت ipleak.net:**
   - مرورگر خود (Chrome, Edge یا Firefox) را باز کنید.
   - وارد سایت [https://ipleak.net](https://ipleak.net) شوید.
   - بخش **Your IP Address**: باید آی‌پی کشور خروجی سرور موزیلا را نشان دهد.
   - بخش **WebRTC detection**:
     - باید وضعیت `No leak detected` یا آی‌پی سرور VPN را نشان دهد.
     - **نباید** هیچ آی‌پی از ایران، آی‌پی محلی (Local IP) یا آی‌پی سرویس‌دهنده اینترنت واقعی شما (شاتل، همراه اول، ایرانسل، مخابرات و...) در این بخش دیده شود.
   - بخش **IPv6**:
     - باید عبارت `No IPv6 address detected` را نشان دهد (نشت IPv6 کاملاً مسدود است).
