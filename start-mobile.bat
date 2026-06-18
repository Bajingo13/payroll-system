@echo off
title Astreablue Mobile App
color 1F
echo ================================================
echo   Astreablue HRIS - Mobile App (Expo)
echo ================================================
echo.
echo STEP 1: On your Tecno phone, go to:
echo   Settings ^> Developer Options ^> Wireless Debugging
echo   Enable it and note the PORT NUMBER shown.
echo.
set /p PORT="Enter the Wireless Debugging port number: "
echo.

set ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe

echo Connecting to phone at 192.168.68.121:%PORT%...
"%ADB%" connect 192.168.68.121:%PORT%
if errorlevel 1 (
    echo Connection failed. Make sure Wireless Debugging is ON.
    pause
    exit /b 1
)

echo.
echo Setting up port forwarding...
"%ADB%" -s 192.168.68.121:%PORT% reverse tcp:8081 tcp:8083
"%ADB%" -s 192.168.68.121:%PORT% reverse tcp:19000 tcp:19000
"%ADB%" -s 192.168.68.121:%PORT% reverse tcp:19001 tcp:19001

echo.
echo Starting Expo Metro bundler on port 8083...
cd /d "%~dp0mobile"
set ANDROID_SERIAL=192.168.68.121:%PORT%
npx expo start --port 8083 --android
pause
