# NJ India — Build Reference

EC2 backend: `http://18.61.159.169:8000`

---

## Android APK

### One-time setup (already done)
- Capacitor installed, Android platform added
- `.env.production` sets `VITE_API_URL` to EC2
- `AndroidManifest.xml` allows HTTP to EC2 IP
- Android Studio has the project at `frontend/android/`

### Every release — rebuild APK

```bash


APK output:
```
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

### Install on phone

**Option A — USB cable** (phone must have USB Debugging on):
```bash
adb install frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

**Option B — copy the APK file** to phone via WhatsApp/cable, open it.
Phone needs: Settings → Install unknown apps → allow.

### If EC2 IP changes
Edit these two files:
- `frontend/.env.production` → update `VITE_API_URL`
- `frontend/android/app/src/main/res/xml/network_security_config.xml` → update `<domain>`

Then rebuild (steps above).

---

## Windows Laptop Installer (.exe)

### One-time requirements
| Tool | Where |
|------|-------|
| Node.js | nodejs.org |
| Python 3.12 | python.org |
| Inno Setup 6 | jrsoftware.org/isdl.php |
| Windows SDK (for signtool) | optional, for code signing |

### Every release — build installer

```bat
build_installer.bat
```

That's it. The script does all 5 steps automatically:
1. Builds the React frontend (`npm run build` with EC2 URL)
2. Stages backend + frontend into `dist_build/app/`
3. Downloads embedded Python 3.12 + installs pip packages
4. Runs Inno Setup → produces `dist_build/Output/NJ India Setup.exe`
5. Signs with the bundled self-signed cert (`installer/nj_india_codesign.pfx`)

### Output
```
dist_build/Output/NJ India Setup.exe
```
Send this file to any Windows PC. It installs silently with no admin/UAC prompt.
The target PC needs nothing else — Python and all dependencies are bundled inside.

### If EC2 IP changes
Edit line 27 in `build_installer.bat`:
```bat
set "VITE_API_URL=http://NEW.IP.HERE:8000"
```

### Code signing notes
- **Self-signed cert** (current): Windows shows "NJ India Trading" as publisher.
  SmartScreen may warn on first run — user clicks "More info → Run anyway".
- **Commercial cert** (OV/EV from DigiCert/Sectigo): eliminates SmartScreen warning entirely.
  To use: `set SIGN_CERT_PATH=C:\path\to\cert.pfx` and `set SIGN_CERT_PASSWORD=yourpassword` before running `build_installer.bat`.

---

## What NOT to commit to git
```
frontend/.env.production      # contains EC2 IP — fine to commit for this project
frontend/android/             # generated, safe to regenerate with `npx cap add android`
dist_build/                   # build output
```
