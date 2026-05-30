@echo off
title NJ India System — Backend
cd /d %~dp0

echo Starting NJ India backend...

if not exist ".venv\Scripts\uvicorn.exe" (
    echo.
    echo [ERROR] Virtual environment not found.
    echo Run this once to set up:
    echo   py -m venv .venv
    echo   .venv\Scripts\pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

call .venv\Scripts\activate.bat
echo Backend starting on http://127.0.0.1:8000
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:8000
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
