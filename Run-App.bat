@echo off
setlocal
for /f "usebackq tokens=* delims=" %%i in (`wsl wslpath "%~dp0"`) do set WSL_DIR=%%i
wsl -e bash -lc "fuser -k 5175/tcp 8000/tcp" >nul 2>&1
wsl -e bash -lc "cd '%WSL_DIR%modern-app' && npm run dev:full"
timeout /t 4 >nul
start "" http://localhost:5175
endlocal
