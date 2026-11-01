@echo off
chcp 65001 >nul
title Warehouse SOP Server
cd /d "%~dp0"
set SOP_OPEN_BROWSER=1
node server\index.js
if errorlevel 1 pause
