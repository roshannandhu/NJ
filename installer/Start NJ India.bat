@echo off
title NJ India System  (keep this window open while using the app)

REM Store the database and uploaded images in a per-user writable folder so the
REM app works even though it is installed in the read-only Program Files folder.
set "NJ_DATA_DIR=%LOCALAPPDATA%\NJ India"

REM This .bat lives in {install}\app ; the bundled Python is in {install}\python
cd /d "%~dp0"
"%~dp0..\python\python.exe" run_app.py

echo.
echo The NJ India server has stopped. You can close this window.
pause >nul
