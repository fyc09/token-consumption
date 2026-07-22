# Token Consumption — Build & Test Guide

## Quick start (development)

```bash
npm install        # one-time
npm run dev        # launches Electron with HMR
```

## Production build

```bash
npm run build      # builds to out/ (main + preload + renderer)
```

## Packaging as .exe

**Option A — `electron-builder` (preferred when network is available):**
```bash
npm run package    # produces release/*.exe via NSIS installer
```

**Option B — portable build (works offline, no installer):**
```bash
node scripts/portable.js
# produces release/win-unpacked/ containing electron.exe + the app
# Run: release\win-unpacked\electron\electron.exe
# Or:   release\win-unpacked\Token Consumption.bat
```

## Test data layer

```bash
npx tsx scripts/test_data.ts
```

Expected output: counts of pi + opencode messages, daily aggregate, top 3 models.

## Known issues

- `npm install` may need `--legacy-peer-deps` if @babel/parser version conflicts
  on first install. The package.json `postinstall` hook (`electron-builder install-app-deps`)
  rebuilds `better-sqlite3` for Electron.
- `electron-builder` requires downloading Electron binaries from github.com.
  In offline environments, use Option B (portable build) instead.
- `better-sqlite3` is a native module. After `npm install` completes, the
  `postinstall` hook runs `electron-builder install-app-deps` which rebuilds
  it for Electron's Node ABI. If you ever run into ABI mismatches:
  ```bash
  npm rebuild better-sqlite3
  ```
