@echo off
setlocal
set "root_dir=%~dp0"
set "backend_dir=%root_dir%backend"
set "python_cmd="

where py >nul 2>nul && set "python_cmd=py -3"
if not defined python_cmd (
	where python >nul 2>nul && set "python_cmd=python"
)

if not defined python_cmd (
	echo Python 3 not found. Please install Python 3 and try again.
	exit /b 1
)

echo Starting EasySorting...
%python_cmd% -c "import fastapi, sqlalchemy, pandas, openpyxl, xlrd, aiofiles, multipart" >nul 2>nul
if errorlevel 1 (
	echo Installing backend dependencies...
	%python_cmd% -m pip install -r "%backend_dir%\requirements.txt"
	if errorlevel 1 exit /b 1
)

start "EasySorting" cmd /k "cd /d ""%backend_dir%"" && %python_cmd% -m uvicorn main:app --host 127.0.0.1 --port 8000"
timeout /t 3 /nobreak > nul
start "" "http://127.0.0.1:8000"
echo Done. Close this window to keep the server running.
endlocal
