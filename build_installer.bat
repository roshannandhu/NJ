@echo off
setlocal enabledelayedexpansion
title NJ India - Build Installer

REM ===========================================================================
REM  NJ India System - one-shot installer builder
REM
REM  Run this on a DEVELOPER machine that has:
REM    - Node.js (npm)
REM    - Python 3.12 (for running pip; the embeddable runtime is downloaded)
REM    - Internet access (to download the embeddable Python + pip + packages)
REM    - Inno Setup 6  (iscc.exe on PATH)   https://jrsoftware.org/isdl.php
REM
REM  The PCs you SEND the installer to need none of the above - everything is
REM  bundled. Output: dist_build\Output\NJ India Setup.exe
REM ===========================================================================

set "ROOT=%~dp0"
set "BUILD=%ROOT%dist_build"
set "PYVER=3.12.7"
set "PYEMBED=python-%PYVER%-embed-amd64"

echo.
echo ========== [1/5] Building frontend + share helper ==========
cd /d "%ROOT%frontend" || goto :err
call npm install || goto :err
set "VITE_API_URL=http://18.61.159.169:8000"
call npm run build || goto :err

REM Compile the native Windows Share helper (ShareHelper.exe) with the in-box
REM .NET Framework C# compiler against the OS WinRT metadata. No SDK required.
cd /d "%ROOT%" || goto :err
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%backend\share_helper\build.ps1" || goto :err

echo.
echo ========== [2/5] Staging app folder ==========
cd /d "%ROOT%" || goto :err
if exist "%BUILD%" rmdir /s /q "%BUILD%"
mkdir "%BUILD%\app" || goto :err

REM Copy backend code
xcopy /e /i /y "%ROOT%backend\*" "%BUILD%\app\" >nul || goto :err

REM Strip dev-only / runtime files that must NOT ship
if exist "%BUILD%\app\.venv"       rmdir /s /q "%BUILD%\app\.venv"
if exist "%BUILD%\app\uploads"     rmdir /s /q "%BUILD%\app\uploads"
if exist "%BUILD%\app\backups"     rmdir /s /q "%BUILD%\app\backups"
if exist "%BUILD%\app\nj_india.db" del /q "%BUILD%\app\nj_india.db"
for /d /r "%BUILD%\app" %%d in (__pycache__) do if exist "%%d" rmdir /s /q "%%d"

REM Built frontend served by the backend (main.py prefers app\dist)
xcopy /e /i /y "%ROOT%frontend\dist\*" "%BUILD%\app\dist\" >nul || goto :err

REM Production launcher
copy /y "%ROOT%installer\Start NJ India.bat" "%BUILD%\app\Start NJ India.bat" >nul || goto :err

REM Application icon for the window
copy /y "%ROOT%installer\app.ico" "%BUILD%\app\app.ico" >nul || goto :err

echo.
echo ========== [3/5] Preparing embedded Python ==========
cd /d "%BUILD%" || goto :err
if not exist "%PYEMBED%.zip" (
  echo Downloading %PYEMBED%.zip ...
  powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/%PYVER%/%PYEMBED%.zip' -OutFile '%PYEMBED%.zip'" || goto :err
)
if exist "python" rmdir /s /q "python"
powershell -NoProfile -Command "Expand-Archive -Force '%PYEMBED%.zip' 'python'" || goto :err

REM Enable 'import site' so pip works inside embedded Python
powershell -NoProfile -Command "(Get-Content 'python\python312._pth') -replace '#import site','import site' | Set-Content 'python\python312._pth'" || goto :err

if not exist "get-pip.py" (
  echo Downloading get-pip.py ...
  powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile 'get-pip.py'" || goto :err
)
mkdir "python\Lib\site-packages" 2>nul
"python\python.exe" get-pip.py --no-warn-script-location || goto :err
REM setuptools+wheel are needed to build pywebview's pure-python deps (proxy_tools)
"python\python.exe" -m pip install --no-warn-script-location setuptools wheel || goto :err
"python\python.exe" -m pip install --no-warn-script-location --no-build-isolation -r "%ROOT%backend\requirements.txt" || goto :err

echo.
echo ========== [4/5] Building installer (Inno Setup) ==========
cd /d "%ROOT%" || goto :err

REM Locate iscc.exe: PATH first, then the common Inno Setup 6 install folders.
set "ISCC="
for %%I in (iscc.exe) do if not defined ISCC if exist "%%~$PATH:I" set "ISCC=%%~$PATH:I"
if not defined ISCC if exist "E:\Inno Setup 6\ISCC.exe"                    set "ISCC=E:\Inno Setup 6\ISCC.exe"
if not defined ISCC if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"   set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not defined ISCC if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe"        set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"

if not defined ISCC (
  echo.
  echo [WARN] iscc.exe not found ^(checked PATH and Inno Setup 6 folders^).
  echo        Install Inno Setup 6 from https://jrsoftware.org/isdl.php, or
  echo        open installer.iss in Inno Setup and click Build^>Compile.
  goto :done
)

echo Using Inno Setup compiler: "%ISCC%"
"%ISCC%" "%ROOT%installer.iss" || goto :err

echo.
echo ========== [5/5] Code signing ==========
REM ── Default to the bundled self-signed certificate ──────────────────────────
REM installer\nj_india_codesign.pfx is a self-signed cert (publisher: NJ India
REM Trading, valid until 2029-07-06).  It makes Windows show the company name
REM instead of "Unknown Publisher" and is safe to use for WhatsApp/USB sharing.
REM
REM For web downloads, upgrade to a commercial OV/EV cert (DigiCert, Sectigo):
REM   set SIGN_CERT_PATH=C:\path\to\commercial_cert.pfx
REM   set SIGN_CERT_PASSWORD=yourpassword
REM   build_installer.bat
REM
REM signtool.exe ships with the Windows SDK; signing is skipped if not found.
if not defined SIGN_CERT_PATH (
  if exist "%ROOT%installer\nj_india_codesign.pfx" (
    set "SIGN_CERT_PATH=%ROOT%installer\nj_india_codesign.pfx"
    set "SIGN_CERT_PASSWORD=NJIndiaSign2024"
  )
)

if defined SIGN_CERT_PATH (
  REM Locate signtool.exe
  set "SIGNTOOL="
  for %%I in (signtool.exe) do if not defined SIGNTOOL if exist "%%~$PATH:I" set "SIGNTOOL=%%~$PATH:I"
  for /r "%ProgramFiles(x86)%\Windows Kits\10\bin" %%I in (signtool.exe) do if not defined SIGNTOOL set "SIGNTOOL=%%I"
  for /r "%ProgramFiles%\Windows Kits\10\bin"      %%I in (signtool.exe) do if not defined SIGNTOOL set "SIGNTOOL=%%I"

  if defined SIGNTOOL (
    echo Signing with: %SIGN_CERT_PATH%
    "%SIGNTOOL%" sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 ^
      /f "%SIGN_CERT_PATH%" /p "%SIGN_CERT_PASSWORD%" ^
      "%BUILD%\Output\NJ India Setup.exe"
    if errorlevel 1 (
      echo WARNING: Signing failed. Installer is UNSIGNED.
    ) else (
      echo Installer signed successfully.
    )
  ) else (
    echo NOTE: signtool.exe not found. Using PowerShell to sign with self-signed cert.
    powershell -NoProfile -Command "$cert=Get-PfxCertificate -FilePath '%SIGN_CERT_PATH%' -Password (ConvertTo-SecureString '%SIGN_CERT_PASSWORD%' -AsPlainText -Force); $r=Set-AuthenticodeSignature -FilePath '%BUILD%\Output\NJ India Setup.exe' -Certificate $cert -TimestampServer 'http://timestamp.digicert.com' -HashAlgorithm SHA256; Write-Host 'Sign:' $r.Status $r.StatusMessage"
  )
) else (
  echo NOTE: No certificate found. Installer is UNSIGNED.
)

echo.
echo ========== Done ==========
echo Installer created: %BUILD%\Output\NJ India Setup.exe
goto :done

:err
echo.
echo *** BUILD FAILED - see the error above. ***
exit /b 1

:done
echo.
exit /b 0
