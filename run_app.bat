@echo off
setlocal
cd /d "%~dp0"

echo [INFO] Installing Python dependencies...
py -3 -m pip install -r requirements.txt
if errorlevel 1 exit /b 1

echo [INFO] Downloading Java libs (if needed)...
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\stronghold_generator\setup_libs.ps1"
if errorlevel 1 exit /b 1

echo [INFO] Building Java generator...
call "tools\stronghold_generator\build.bat"
if errorlevel 1 exit /b 1

echo [INFO] Starting Flask app at http://127.0.0.1:8000
py -3 app.py
