# Building the NJ India Windows Installer

This produces a single **`NJ India Setup.exe`** you can send to anyone. The
target PC needs **nothing pre-installed** (no Python, no Node, no internet) —
the app runs fully offline.

## One-time setup on YOUR (build) machine

You need these installed once:

1. **Node.js** — https://nodejs.org (LTS)
2. **Python 3.12** — https://python.org (only used to run pip during the build)
3. **Inno Setup 6** — https://jrsoftware.org/isdl.php
   - During install, or afterwards, make sure `iscc.exe` is on your PATH.
4. **Internet access** (the build downloads the embeddable Python + packages).

## Build

Double-click **`build_installer.bat`** in the project root (or run it from a
terminal). It will:

1. Build the React frontend (`npm run build`).
2. Stage the backend + built frontend into `dist_build\app`.
3. Download a self-contained (embeddable) Python and install the backend
   dependencies into it under `dist_build\python`.
4. Compile the installer with Inno Setup.

When it finishes, the installer is at:

```
dist_build\Output\NJ India Setup.exe
```

If `iscc.exe` isn't on your PATH, the script stops after step 3 — just open
`installer.iss` in Inno Setup and click **Build → Compile**.

## What the installed app does

- Installs to `C:\Program Files\NJ India`.
- Adds a **Desktop** and **Start-menu** shortcut: *NJ India System*.
- Clicking it opens a small black window (the local server) and launches the
  app in the browser at `http://127.0.0.1:8000`. Closing the window quits.
- **Data** (database + uploaded images) is stored in
  `%LOCALAPPDATA%\NJ India` — writable and safe.
- **Backups** go to `Documents\NJ India Backups` (auto + manual).
- Uninstalling leaves the data and backups in place, so reinstalling keeps
  everything.

## Optional: custom icon

Put a 256×256 `app.ico` at `installer\app.ico`, then uncomment the
`SetupIconFile` / `IconFilename` lines in `installer.iss` and add
`IconFilename: "{app}\app\app.ico"` to the `[Icons]` entries.
