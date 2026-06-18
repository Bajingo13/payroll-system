@echo off
echo Starting Payroll AI Microservice on port 5001...
cd /d "%~dp0"

set "PYTHON_EXE=python"

if exist ".venv\Scripts\python.exe" (
    set "PYTHON_EXE=.venv\Scripts\python.exe"
) else if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
) else if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
)

"%PYTHON_EXE%" --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python not found. Please install Python 3.10+ or disable the Microsoft Store Python alias.
    pause
    exit /b 1
)

if not exist ".venv" (
    echo Creating virtual environment...
    "%PYTHON_EXE%" -m venv .venv
    set "PYTHON_EXE=.venv\Scripts\python.exe"
)

call .venv\Scripts\activate.bat

echo Installing dependencies...
python -m pip install -r requirements.txt --quiet

echo.
echo AI Microservice running at http://localhost:5001
echo Press Ctrl+C to stop.
echo.
python app.py
