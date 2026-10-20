@echo off
chcp 65001 >nul
title Yellow Team Sports Day 2569 - Server
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages, first run only...
  call npm install || goto :fail
)
echo Building web app...
call npm run build || goto :fail
node server-dist\index.mjs
goto :eof
:fail
echo.
echo Start failed - see the error above.
pause
