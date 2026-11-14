@echo off
rem Double-click to start Arlo. Extra arguments (for example --no-open or --demo) are passed through.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Arlo needs Node.js 24 or newer. Get the ARM64 installer from https://nodejs.org
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)"
if errorlevel 1 (
  echo This Node.js is too old for Arlo. Install Node.js 24 or newer from https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo Setting up Arlo for the first time...
  call npm install --omit=dev
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node hub\main.ts %*
if errorlevel 1 pause
