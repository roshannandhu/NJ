# DEPLOYMENT.md
# Deployment, Distribution, and Maintenance

---

## 1. Deployment Model (v2 — React + FastAPI — ACTIVE TARGET)

**Method:** FastAPI process runs locally on `localhost:8000`. Serves both the React frontend (static build) and the REST API.

```
Distribution path:
  Developer → project folder → USB / Git / email → NJ India PC
  Seller → double-clicks start.bat → Chrome opens localhost:8000
```

No cloud. No internet required. No subscription. ₹0 ongoing cost.

### Setup on NJ India PC (first time)

```batch
REM 1. Install Python 3.11+ (one time)
REM 2. Install dependencies
pip install fastapi uvicorn sqlalchemy weasyprint python-multipart pillow

REM 3. Build React frontend
cd frontend
npm install
npm run build
cd ..

REM 4. Start the app
uvicorn main:app --host 127.0.0.1 --port 8000
```

### start.bat (give this to seller)

```batch
@echo off
title NJ India System
cd /d %~dp0
echo Starting NJ India System...
start "" http://localhost:8000
uvicorn main:app --host 127.0.0.1 --port 8000
```

Seller double-clicks `start.bat`. A command window opens (can be minimised). Chrome opens automatically at `localhost:8000`.

### Project Folder Structure

```
nj-india-system/
├── main.py              ← FastAPI app entry point
├── database.py          ← SQLAlchemy setup + session
├── models.py            ← All SQLAlchemy models
├── routers/
│   ├── company.py
│   ├── classes.py
│   ├── quotations.py
│   ├── warranties.py
│   └── uploads.py
├── pdf/
│   ├── quotation.py     ← WeasyPrint quotation template
│   └── warranty.py      ← WeasyPrint warranty template
├── templates/           ← Jinja2 HTML templates for PDF rendering
├── uploads/             ← Uploaded images (logo, seal, product photos)
├── nj_india.db          ← SQLite database (THE data file — back this up)
├── start.bat            ← Startup script for Windows
├── requirements.txt
└── frontend/            ← React (Vite) project
    ├── src/
    ├── dist/            ← Built static files (FastAPI serves these)
    └── package.json
```

### Updating the App

1. Developer sends new project folder (or git pull)
2. Seller stops the app (closes command window)
3. Replace project folder (keep `nj_india.db` and `uploads/` — these are the data)
4. Run `start.bat` again

### Backup

```batch
REM Back up both the database and uploaded images
copy nj_india.db  nj_backup_%date%.db
xcopy uploads\    nj_uploads_backup_%date%\  /E /I
```

---

## 2. Optional: PyInstaller .exe (Single Installer)

For a more polished experience, bundle everything into a `.exe`:

```bash
pip install pyinstaller
pyinstaller --onefile --add-data "frontend/dist;frontend/dist" \
            --add-data "templates;templates" main.py
```

Result: `dist/main.exe` — double-click to launch. No Python required on target PC. Larger file (~50–80 MB) but truly self-contained.

---

## 3. Deployment Model (v1 — Vanilla HTML — Archive)

**Method:** Single HTML file opened directly in a browser.

```
Distribution path:
  Developer → HTML file → USB / WhatsApp / Email → NJ India PC → Open in browser
```

No server. No install. No domain. No cloud.

---

## 2. Option A — File-Based Deployment (Current v1)

### Setup

1. Copy `nj-quotation-warranty-system.html` to the NJ India workstation
2. Double-click to open in browser (Chrome or Edge recommended)
3. App runs immediately — no install required

### Requirements

| Component | Requirement |
|-----------|-------------|
| Browser | Chrome 90+, Edge 90+, or Firefox 88+ |
| Internet | Only needed on first open (CDN fonts/libs cache after that) |
| Screen | 1280px+ wide recommended |
| OS | Windows 10/11, macOS 11+, or Ubuntu 20+ |

### Updating

1. Developer produces new `nj-quotation-warranty-system.html`
2. User exports data backup from current app (Settings → Security → Export Data)
3. Replace old HTML file with new one
4. Open new file → Import data backup (if localStorage key differs)
5. Test, confirm history is intact

### Offline Operation

After first browser open (CDN assets cached):
- App runs fully offline
- PDF generation works offline
- localStorage persists across browser restarts
- Fonts render from cache

**Risk:** If user clears browser cache, fonts/libraries need re-download on next open.

**Mitigation for critical offline environments:** Bundle all assets locally in the HTML file.

---

## 3. Option B — Electron Desktop App (v2)

### Why Electron

| Feature | Browser | Electron |
|---------|---------|---------|
| Native .exe installer | No | Yes |
| Native file save dialog | No | Yes |
| System tray | No | Yes |
| Auto-update | No | Yes |
| No "browser" feel | No | Yes |
| File size | ~150 KB | ~100 MB (Chromium bundled) |

### Electron Project Structure

```
nj-app/
├── package.json
├── main.js              ← Electron main process
├── preload.js           ← Secure bridge (contextBridge)
├── index.html           ← Current app (unchanged)
├── assets/
│   ├── icon.ico         ← Windows taskbar icon
│   ├── icon.icns        ← macOS icon
│   └── icon.png         ← Linux icon
└── libs/                ← Bundled jsPDF + html2canvas (offline)
    ├── jspdf.umd.min.js
    └── html2canvas.min.js
```

### main.js (Electron Entry)

```javascript
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'NJ India — Quotation & Warranty System',
    icon: path.join(__dirname, 'assets/icon.ico')
  });

  win.loadFile('index.html');
  Menu.setApplicationMenu(null); // Remove default menu
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

### Building the Installer

```bash
# Install dependencies
npm install electron electron-builder --save-dev

# Build Windows installer
npx electron-builder --win

# Build macOS
npx electron-builder --mac

# Output:
# dist/NJ India Setup 1.0.0.exe    ← Windows installer
# dist/NJ India-1.0.0.dmg          ← macOS disk image
```

### electron-builder config (package.json)

```json
{
  "name": "nj-india-system",
  "version": "1.0.0",
  "description": "NJ India Quotation & Warranty Management System",
  "main": "main.js",
  "build": {
    "appId": "in.njindia.quotation-system",
    "productName": "NJ India System",
    "win": {
      "target": "nsis",
      "icon": "assets/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    }
  }
}
```

### Distribution

1. Build .exe on developer machine
2. Send to NJ India via WhatsApp, email, or USB
3. NJ India runs installer → App installs like any Windows program
4. Creates desktop shortcut
5. Data stored in `%APPDATA%\nj-india-system\` (Electron's userData path)

---

## 4. Data Persistence Across Updates

### Problem
When a new version is deployed, the user's localStorage data must survive.

### Solution: Versioned Storage Key

```javascript
// Current key:
const STORAGE_KEY = 'nj_app_data_v2';

// If schema changes in v3:
const STORAGE_KEY = 'nj_app_data_v3';

// Migration function:
function migrateIfNeeded() {
  const oldData = localStorage.getItem('nj_app_data_v2');
  if (oldData && !localStorage.getItem('nj_app_data_v3')) {
    const parsed = JSON.parse(oldData);
    // Apply any schema changes here
    // e.g., add new fields with defaults
    const migrated = { ...DEFAULT_DATA, ...parsed };
    localStorage.setItem('nj_app_data_v3', JSON.stringify(migrated));
    localStorage.removeItem('nj_app_data_v2');
  }
}
```

### Backup Before Update (Recommended Workflow)

Always advise users to export before updating:
1. Settings → Security → Export Data
2. Install new version
3. If any data issue → Import from backup

---

## 5. Environment Setup for Development

### Prerequisites

```bash
# No server required for v1 development
# Just open the HTML file in a browser

# For Electron development:
npm install -g electron
```

### Development Workflow

```bash
# v1 (browser):
# Open nj-quotation-warranty-system.html in Chrome
# Edit file in VS Code / any editor
# Ctrl+R to reload browser

# v2 (Electron):
npm install
npm start   # Opens Electron window with hot-reload if set up
```

### Recommended Browser for Development

**Chrome** with DevTools:
- Application → Local Storage → inspect `nj_app_data_v2`
- Console for JavaScript errors
- Network tab for CDN load verification

---

## 6. Versioning Convention

```
v{major}.{minor}.{patch}

v1.0.0  → Initial release (May 2026)
v1.1.0  → Tools quick-add, warranty bugs fixed
v1.2.0  → Image upload support
v2.0.0  → Electron wrapper
v3.0.0  → Multi-device (cloud backend)
```

### Changelog Location

Maintain a `CHANGELOG.md` in the project root:

```markdown
## v1.1.0 (2026-05-27)
- Fixed: Warranty generation qid undefined bug
- Fixed: Next Warranty button JSON serialisation
- Added: Tools quick-add section on home page
- Added: Progress bar for multi-warranty flow
- Added: Warranty status badge in quotation history
- Added: Seller name validation in warranty form
```

---

## 7. Monitoring & Maintenance

Since there's no server, traditional monitoring doesn't apply. Instead:

| Item | How to Monitor |
|------|---------------|
| Data integrity | User reports + periodic JSON export review |
| Storage usage | Settings → Security → data summary count |
| App version | Check file modification date or embed version in UI footer |
| PDF generation issues | User reports specific quotation ID |

### Maintenance Schedule

| Task | Frequency |
|------|----------|
| Data export/backup | Weekly (advise user) |
| Price updates | As needed (via Settings) |
| Warranty text updates | As needed (via Settings) |
| App updates | When bugs found or features requested |
| localStorage cleanup | If approaching 4 MB limit |
