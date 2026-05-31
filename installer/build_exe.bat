@echo off
setlocal
title NJ India - Build single .exe setup

REM ===========================================================================
REM  Builds ONE self-installing file: "NJ India Setup.exe"
REM  Uses only built-in Windows tools (IExpress + makecab). No admin needed.
REM  Requires dist_build\ to be staged (app\ + python\) by build_installer.bat.
REM ===========================================================================

set "HERE=%~dp0"
set "ROOT=%HERE%.."
set "BUILD=%ROOT%\dist_build"
set "STAGE=%BUILD%\sfx_stage"
set "TARGET=%ROOT%\NJ India Setup.exe"

if not exist "%BUILD%\app\main.py"        ( echo [ERROR] dist_build\app not staged. Run build_installer.bat first. & pause & exit /b 1 )
if not exist "%BUILD%\python\python.exe"  ( echo [ERROR] dist_build\python not staged. Run build_installer.bat first. & pause & exit /b 1 )

echo.
echo ===== [1/4] Building payload.zip =====
if exist "%STAGE%" rmdir /s /q "%STAGE%"
mkdir "%STAGE%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Compress-Archive -Force -CompressionLevel Optimal -Path '%BUILD%\app','%BUILD%\python','%BUILD%\Start NJ India.bat','%BUILD%\README - How to run.txt' -DestinationPath '%STAGE%\payload.zip'" || ( echo [ERROR] zip failed & pause & exit /b 1 )
copy /y "%HERE%install.bat" "%STAGE%\install.bat" >nul

echo.
echo ===== [2/4] Generating IExpress config =====
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "(Get-Content '%HERE%nj_setup.sed.template' -Raw).Replace('@@TARGET@@','%TARGET%').Replace('@@STAGE@@','%STAGE%') | Set-Content -Encoding ascii '%STAGE%\nj_setup.sed'" || ( echo [ERROR] sed gen failed & pause & exit /b 1 )

echo.
echo ===== [3/4] Compiling NJ India Setup.exe (IExpress) =====
if exist "%TARGET%" del /q "%TARGET%"
iexpress /N /Q "%STAGE%\nj_setup.sed"

echo.
echo ===== [4/4] Result =====
if exist "%TARGET%" (
  echo Created: "%TARGET%"
  rmdir /s /q "%STAGE%"
) else (
  echo [ERROR] Setup.exe was not produced. See messages above.
  pause & exit /b 1
)
echo.
echo Done.
pause
exit /b 0
