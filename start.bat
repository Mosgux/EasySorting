<<<<<<< HEAD
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
=======
@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"
set "VENV=%ROOT%backend\venv"
set "PYTHON_CMD="

where py >nul 2>nul
if not errorlevel 1 (
    py -3 --version >nul 2>nul
    if not errorlevel 1 set "PYTHON_CMD=py -3"
)

if not defined PYTHON_CMD (
    where python >nul 2>nul
    if not errorlevel 1 set "PYTHON_CMD=python"
)

if not defined PYTHON_CMD (
    echo ERROR: Python 3 not found.
    echo Please install Python 3 from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)

if not exist "%VENV%\Scripts\activate.bat" (
    echo First run: setting up virtual environment...
    %PYTHON_CMD% -m venv "%VENV%"
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo Installing dependencies, please wait...
    "%VENV%\Scripts\pip.exe" install -r "%ROOT%backend\requirements.txt"
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies.
        pause
        exit /b 1
    )
    echo Setup complete.
)

set PYTHONUTF8=1
call "%VENV%\Scripts\activate.bat"

echo Starting EasySorting at http://127.0.0.1:8000
echo Close this window to stop the server.
echo.

start /b cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:8000"

cd /d "%ROOT%backend"
uvicorn main:app --host 127.0.0.1 --port 8000

pause

endlocal
>>>>>>> 07702bbb06948cb56d461e0e836acfb933b6b9d6
