@echo off
setlocal
title Orbit hub
cd /d "%~dp0"

rem Orbit runs on Node.js. If it is missing, open the download page and stop here.
where node >nul 2>nul
if errorlevel 1 (
  echo Orbit needs Node.js, which is not installed yet.
  echo Opening the download page. Install the LTS version, then double-click Start Orbit again.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

rem Fetch or update the hub's parts. Quick when nothing has changed.
echo Getting Orbit ready...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  echo Setting up Orbit failed. Check your internet connection and try again.
  pause
  exit /b 1
)

rem Tells the hub this script will restart it after an update.
set ORBIT_SUPERVISED=1

:run
node src\main.js %*

rem Exit code 75 means the hub just installed an update: fetch anything new and start it again.
if errorlevel 75 (
  echo.
  echo Orbit was updated. Starting the new version...
  call npm install --no-audit --no-fund --loglevel=error
  goto run
)

echo.
echo The Orbit hub has stopped. Press any key to close this window.
pause >nul
