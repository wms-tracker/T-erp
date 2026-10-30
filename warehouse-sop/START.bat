@echo off
chcp 65001 >nul
title Warehouse SOP Server
cd /d "%~dp0"
echo Starting Warehouse SOP Management System...
node server\index.js
pause
