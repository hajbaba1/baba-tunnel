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

## Key Features
- **Mozilla FxA & Guardian API Integration:** Direct account authorization and automated pass renewal.
- **Fastly Challenge Solver:** Local solving of Fastly proof-of-work bot challenges.
- **Safe System Proxy Management:** Windows Internet Settings toggled with automatic state preservation on disk and recovery after abnormal shutdowns.
- **Zero Kernel TUN Dependency:** Completely decoupled from TAP/TUN drivers and DNS mutators in this stage.
