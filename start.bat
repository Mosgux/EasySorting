@echo off
setlocal
set "root_dir=%~dp0"

echo Starting EasySorting...
start "Backend" cmd /k "cd /d ""%root_dir%backend"" && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 2 /nobreak > nul
start "Frontend" cmd /k "cd /d ""%root_dir%frontend"" && npm run dev"
timeout /t 4 /nobreak > nul
start "" "http://localhost:5173"
echo Done. Close this window to keep the servers running.
endlocal
