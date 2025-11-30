@echo off
setlocal
set "WSL_PATH='/mnt/d/coding projects/Y-maze-randomizer/modern-app'"
start "Y-maze servers" wsl -e bash -lc "cd %WSL_PATH% && npm run dev:full"
timeout /t 4 >nul
start "" http://localhost:5175
endlocal
