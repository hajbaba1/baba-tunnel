# Building and Running Fenix Standalone

## 1. Prerequisites
- Node.js >= 20
- npm
- Windows 10/11 x64

## 2. External Binaries (core/)
External binaries are intentionally excluded from git repository tracking.

| Binary | Source | License | Required Location |
|---|---|---|---|
| `xray.exe` | XTLS/Xray-core official releases | MPL-2.0 | `core/xray.exe` |

To populate `core/`:
1. Create folder `core/` in the project root.
2. Download `Xray-windows-64.zip` from official Xray-core GitHub releases.
3. Extract `xray.exe` into `core/`.

## 3. Installation
```bash
npm install
```

## 4. Execution
To launch the Electron application:
```bash
npm start
```

To run only the local web server and preview the interface:
```bash
npm run preview
```
## 5. Building Windows Installers (electron-builder)
To compile the standalone Windows installer (`.exe`) and portable single-file binary:
```bash
npm run dist
```
The output binaries will be created in `dist/`:
- **NSIS Installer:** `dist/Fenix VPN Setup 1.0.0.exe`
- **Portable Binary:** `dist/Fenix VPN 1.0.0.exe`
- **Unpacked Folder:** `dist/win-unpacked/`
