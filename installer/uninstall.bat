@echo off
REM NJ India Trading — uninstaller (per-user, no admin).
REM Removes the program, shortcuts and the Add/Remove-Programs entry.
REM Your DATA (%LOCALAPPDATA%\NJ India Data) and BACKUPS (Documents\NJ India
REM Backups) are intentionally kept so nothing is ever lost.

set "INSTALL=%LOCALAPPDATA%\NJ India"

echo Closing NJ India System if it is running...
taskkill /f /im pythonw.exe >nul 2>nul

echo Removing shortcuts...
del /q "%USERPROFILE%\Desktop\NJ India System.lnk" 2>nul
del /q "%USERPROFILE%\OneDrive\Desktop\NJ India System.lnk" 2>nul
del /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\NJ India System.lnk" 2>nul

echo Removing Add/Remove Programs entry...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\NJIndiaTrading" /f >nul 2>nul

echo Removing program files...
cd /d "%TEMP%"
rd /s /q "%INSTALL%" 2>nul

echo.
echo NJ India System has been uninstalled. Your data and backups were kept.
timeout /t 3 /nobreak >nul
