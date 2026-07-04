@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0.."

set "PORT=3000"
set "URL=http://localhost:%PORT%/"

:MENU
cls
echo ============================================
echo   Bangumi Anime Manager Launcher
echo ============================================
echo.
echo   Project: %CD%
echo.
echo   1. Check environment and resources
echo   2. Start app
echo   3. Stop app
echo   4. Open web page
echo   5. Node.js install guide
echo   0. Exit
echo.
choice /C 123450 /N /M "Choose: "
if errorlevel 6 goto END
if errorlevel 5 goto GUIDE
if errorlevel 4 goto OPENPAGE
if errorlevel 3 goto STOPAPP
if errorlevel 2 goto STARTAPP
if errorlevel 1 goto CHECK
goto MENU

:FINDPID
set "APP_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set "APP_PID=%%P"
)
exit /b

:CHECK
cls
echo Environment check
echo.
where node.exe >nul 2>nul
if errorlevel 1 (
  echo [MISSING] Node.js was not found in PATH.
) else (
  for /f "delims=" %%V in ('node --version') do echo [OK] Node.js %%V
)

if exist "server.js" (echo [OK] server.js) else (echo [MISSING] server.js)
if exist "public\index.html" (echo [OK] public\index.html) else (echo [MISSING] public\index.html)
if exist "public\app.js" (echo [OK] public\app.js) else (echo [MISSING] public\app.js)
if exist "data\anime.json" (echo [OK] data\anime.json) else (echo [INFO] data\anime.json will be created on first start.)
if exist "outputs\anime.xlsx" (echo [OK] outputs\anime.xlsx) else (echo [INFO] outputs\anime.xlsx will be created on start.)

call :FINDPID
if defined APP_PID (
  echo [RUNNING] Port %PORT% is listening. PID: !APP_PID!
) else (
  echo [STOPPED] No service is listening on port %PORT%.
)
echo.
pause
goto MENU

:STARTAPP
cls
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Choose option 5 for install guide.
  echo.
  pause
  goto MENU
)

call :FINDPID
if defined APP_PID (
  echo App is already running at %URL%
  echo PID: !APP_PID!
  echo.
  pause
  goto MENU
)

echo Starting app...
start "Bangumi Anime Manager" /B node "%CD%\server.js"
timeout /t 2 /nobreak >nul
call :FINDPID
if defined APP_PID (
  echo Started successfully: %URL%
  echo PID: !APP_PID!
) else (
  echo Start command was sent, but port %PORT% is not listening yet.
  echo Try running: npm.cmd start
)
echo.
pause
goto MENU

:STOPAPP
cls
call :FINDPID
if not defined APP_PID (
  echo App is not running.
  echo.
  pause
  goto MENU
)
echo Stopping PID !APP_PID! ...
taskkill /PID !APP_PID! /F >nul 2>nul
echo Stopped.
echo.
pause
goto MENU

:OPENPAGE
call :FINDPID
if not defined APP_PID (
  where node.exe >nul 2>nul
  if not errorlevel 1 (
    start "Bangumi Anime Manager" /B node "%CD%\server.js"
    timeout /t 2 /nobreak >nul
  )
)
start "" "%URL%"
goto MENU

:GUIDE
cls
echo Node.js install guide
echo.
echo 1. Install Node.js 20 or newer.
echo 2. Recommended download page: https://nodejs.org/
echo 3. During install, keep "Add to PATH" enabled.
echo 4. Reopen this launcher and choose option 1 to check again.
echo.
choice /C YN /N /M "Open Node.js download page? (Y/N): "
if errorlevel 2 goto MENU
start "" "https://nodejs.org/"
goto MENU

:END
endlocal
exit /b 0
