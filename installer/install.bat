@echo off
REM Runs inside the NJ India Setup.exe (IExpress) from its temp extract folder.
REM Installs to a per-user folder — no admin / no UAC needed.

set "INSTALL=%LOCALAPPDATA%\NJ India"

echo.
echo   Installing NJ India System, please wait...
echo.

if exist "%INSTALL%" rmdir /s /q "%INSTALL%"
mkdir "%INSTALL%" 2>nul

REM Fast extract: bsdtar (built into Win10/11) handles .zip; PowerShell fallback.
tar -xf "%~dp0payload.zip" -C "%INSTALL%" 2>nul
if errorlevel 1 powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Force '%~dp0payload.zip' '%INSTALL%'"

REM Desktop + Start-menu shortcuts launch the app DIRECTLY via pythonw.exe so it
REM opens as a native window with NO console window and no .bat flash. The NJ
REM icon (app.ico) is used for both shortcuts.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$w = New-Object -ComObject WScript.Shell;" ^
  "$root = Join-Path $env:LOCALAPPDATA 'NJ India';" ^
  "$icon = Join-Path $root 'app.ico';" ^
  "foreach ($p in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {" ^
  "  $l = $w.CreateShortcut((Join-Path $p 'NJ India System.lnk'));" ^
  "  $l.TargetPath = (Join-Path $root 'python\pythonw.exe');" ^
  "  $l.Arguments = 'run_app.py';" ^
  "  $l.WorkingDirectory = (Join-Path $root 'app');" ^
  "  $l.IconLocation = $icon;" ^
  "  $l.Save() }"

REM Register in Windows "Add or remove programs" (per-user, no admin).
set "UKEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\NJIndiaTrading"
reg add "%UKEY%" /v DisplayName /t REG_SZ /d "NJ India Trading" /f >nul
reg add "%UKEY%" /v DisplayVersion /t REG_SZ /d "1.0" /f >nul
reg add "%UKEY%" /v Publisher /t REG_SZ /d "NJ India Trading" /f >nul
reg add "%UKEY%" /v DisplayIcon /t REG_SZ /d "%INSTALL%\app.ico" /f >nul
reg add "%UKEY%" /v InstallLocation /t REG_SZ /d "%INSTALL%" /f >nul
reg add "%UKEY%" /v UninstallString /t REG_SZ /d "\"%INSTALL%\uninstall.bat\"" /f >nul
reg add "%UKEY%" /v NoModify /t REG_DWORD /d 1 /f >nul
reg add "%UKEY%" /v NoRepair /t REG_DWORD /d 1 /f >nul

REM Launch the app now (native window, no console).
start "" "%INSTALL%\python\pythonw.exe" "%INSTALL%\app\run_app.py"
