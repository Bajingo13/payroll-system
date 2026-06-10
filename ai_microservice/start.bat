@echo off
echo Starting Payroll AI Microservice on port 5001...
cd /d "%~dp0"

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo Python not found. Please install Python 3.10+.
    pause
    exit /b 1
)

if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)

call .venv\Scripts\activate.bat

echo Installing dependencies...
pip install -r requirements.txt --quiet

echo.
echo AI Microservice running at http://localhost:5001
echo Press Ctrl+C to stop.
echo.
python app.py
