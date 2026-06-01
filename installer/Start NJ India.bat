@echo off
REM Manual launcher (the Desktop shortcut is the normal way to start the app).
REM Opens the app as a native window via pythonw.exe (no console).
set "NJ_DATA_DIR=%LOCALAPPDATA%\NJ India Data"
cd /d "%~dp0app"
start "" "%~dp0python\pythonw.exe" run_app.py
