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

REM Desktop + Start-menu shortcuts pointing at the launcher.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$w = New-Object -ComObject WScript.Shell;" ^
  "$root = Join-Path $env:LOCALAPPDATA 'NJ India';" ^
  "foreach ($p in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {" ^
  "  $l = $w.CreateShortcut((Join-Path $p 'NJ India System.lnk'));" ^
  "  $l.TargetPath = (Join-Path $root 'Start NJ India.bat');" ^
  "  $l.WorkingDirectory = $root;" ^
  "  $l.IconLocation = (Join-Path $root 'python\python.exe');" ^
  "  $l.Save() }"

echo.
echo   Installed. Starting NJ India System...
echo.

start "" "%INSTALL%\Start NJ India.bat"
