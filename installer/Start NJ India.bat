@echo off
title NJ India System  (keep this window open while using the app)

REM Store the database and uploaded images in a per-user folder that is SEPARATE
REM from the program folder, so reinstalling never deletes the seller's data.
set "NJ_DATA_DIR=%LOCALAPPDATA%\NJ India Data"

REM This .bat lives in {install}\app ; the bundled Python is in {install}\python
cd /d "%~dp0"
"%~dp0..\python\python.exe" run_app.py

echo.
echo The NJ India server has stopped. You can close this window.
pause >nul
