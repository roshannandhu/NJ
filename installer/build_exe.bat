@echo off
setlocal
title NJ India - Build single .exe setup

REM ===========================================================================
REM  Builds ONE self-installing file: "NJ India Setup.exe"
REM  Uses only built-in Windows tools (IExpress + makecab). No admin needed.
REM  Requires dist_build\ to be staged (app\ + python\) by build_installer.bat.
REM  NOTE: IExpress cannot handle spaces in the staging path, so we stage in
REM  E:\njbuild (adjust DRIVE-letter staging if E: is unavailable).
REM ===========================================================================

set "HERE=%~dp0"
set "ROOT=%HERE%.."
set "BUILD=%ROOT%\dist_build"
set "STAGE=E:\njbuild"
set "TGT=%STAGE%\NJ_India_Setup.exe"

if not exist "%BUILD%\app\main.py"        ( echo [ERROR] dist_build\app not staged. Run build_installer.bat first. & pause & exit /b 1 )
if not exist "%BUILD%\python\python.exe"  ( echo [ERROR] dist_build\python not staged. Run build_installer.bat first. & pause & exit /b 1 )

echo.
echo ===== [1/3] Staging payload (app + python + launcher + icon + uninstaller) =====
if not exist "%STAGE%" mkdir "%STAGE%"
del /q "%STAGE%\*" 2>nul
copy /y "%HERE%app.ico" "%BUILD%\app.ico" >nul
copy /y "%HERE%uninstall.bat" "%BUILD%\uninstall.bat" >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Compress-Archive -Force -CompressionLevel Optimal -Path '%BUILD%\app','%BUILD%\python','%BUILD%\app.ico','%BUILD%\uninstall.bat' -DestinationPath '%STAGE%\payload.zip'" || ( echo [ERROR] zip failed & exit /b 1 )
copy /y "%HERE%install.bat" "%STAGE%\install.bat" >nul

echo.
echo ===== [2/3] Generating IExpress config + compiling =====
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "(Get-Content '%HERE%nj_setup.sed.template' -Raw).Replace('@@TARGET@@','%TGT%').Replace('@@STAGE@@','%STAGE%') | Set-Content -Encoding ascii '%STAGE%\nj_setup.sed'"
if exist "%TGT%" del /q "%TGT%"
iexpress /N /Q "%STAGE%\nj_setup.sed"

REM iexpress can return before it has finished writing the .exe — wait for it.
set "WAITS=0"
:waitloop
if exist "%TGT%" goto :built
set /a WAITS+=1
if %WAITS% gtr 120 goto :notbuilt
ping -n 2 127.0.0.1 >nul
goto :waitloop
:built

echo.
echo ===== [3/3] Result =====
if exist "%TGT%" ( copy /y "%TGT%" "%ROOT%\NJ India Setup.exe" >nul & echo Created "%ROOT%\NJ India Setup.exe" ) else ( goto :notbuilt )
echo Done.
exit /b 0

:notbuilt
echo [ERROR] Setup.exe not produced
exit /b 1
echo Done.
exit /b 0
