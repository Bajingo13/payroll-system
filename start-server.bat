@echo off
title Astreablue Backend Server
color 1F
echo ================================================
echo   Astreablue HRIS - Backend Server
echo ================================================
echo.
cd /d "%~dp0"
echo Starting backend server on port 12687...
echo.
node server.js
pause
