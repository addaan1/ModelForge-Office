@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "LLM_PROVIDER=auto"
set "OLLAMA_MODEL=gemma3:4b"
set "WHISPER_MODEL=base"
set "WHISPER_LANGUAGE=id"
set "OLLAMA_TAGS_TIMEOUT=4"
set "OLLAMA_CHAT_TIMEOUT=240"
set "BACKEND_HOST=127.0.0.1"
set "BACKEND_PORT=7860"
set "FRONTEND_PORT=8000"
set "PYTHON_CMD="
set "OLLAMA_EXE="
set "SERVER_VENV=%~dp0server\.venv"
set "SERVER_PY=%SERVER_VENV%\Scripts\python.exe"
set "LOG_DIR=%~dp0logs"
set "BACKEND_RUNNER=%LOG_DIR%\start_backend.cmd"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>nul
echo [%date% %time%] run_windows.bat started > "%LOG_DIR%\backend.log"

py -3 --version >nul 2>nul
if not errorlevel 1 set "PYTHON_CMD=py -3"

if not defined PYTHON_CMD (
  python --version >nul 2>nul
  if not errorlevel 1 set "PYTHON_CMD=python"
)

if not defined PYTHON_CMD (
  echo.
  echo Python tidak bisa dijalankan dari batch ini.
  echo Install Python 3 atau nonaktifkan Windows Store Python alias, lalu coba lagi.
  echo.
  pause
  exit /b 1
)

echo.
echo [1/5] Menyiapkan backend environment...
if not exist "%SERVER_PY%" (
  echo Membuat virtual environment server...
  %PYTHON_CMD% -m venv "%SERVER_VENV%"
  if errorlevel 1 (
    echo Gagal membuat server\.venv. Cek instalasi Python.
    pause
    exit /b 1
  )
)

"%SERVER_PY%" -m pip show fastapi uvicorn >nul 2>nul
if errorlevel 1 (
  echo Menginstall dependency backend dari server\requirements.txt...
  "%SERVER_PY%" -m pip install -r "%~dp0server\requirements.txt"
  if errorlevel 1 (
    echo Gagal install dependency backend. Cek internet atau logs.
    pause
    exit /b 1
  )
)

echo Mengecek import backend...
pushd "%~dp0server" >nul
"%SERVER_PY%" -c "import fastapi, uvicorn, httpx, pydantic; import main" > "%LOG_DIR%\backend_preflight.log" 2>&1
set "PREFLIGHT_ERROR=%ERRORLEVEL%"
popd >nul
if not "%PREFLIGHT_ERROR%"=="0" (
  echo Backend preflight gagal. Detail:
  type "%LOG_DIR%\backend_preflight.log"
  pause
  exit /b 1
)

echo [2/5] Membersihkan port lama...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%BACKEND_PORT%" ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>nul
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%FRONTEND_PORT%" ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>nul

for /d %%F in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*") do (
  for /d %%B in ("%%~fF\ffmpeg-*\bin") do set "PATH=%%~fB;!PATH!"
)

if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if not defined OLLAMA_EXE if exist "%ProgramFiles%\Ollama\ollama.exe" set "OLLAMA_EXE=%ProgramFiles%\Ollama\ollama.exe"
if not defined OLLAMA_EXE (
  for /f "delims=" %%O in ('where ollama 2^>nul') do if not defined OLLAMA_EXE set "OLLAMA_EXE=%%O"
)

echo [3/5] Menyalakan Ollama jika tersedia...
if defined OLLAMA_EXE (
  start "Kaggle War Room - Ollama" /min "%OLLAMA_EXE%" serve
  timeout /t 2 /nobreak >nul
  "%OLLAMA_EXE%" show "%OLLAMA_MODEL%" >nul 2>nul
  if errorlevel 1 (
    echo Model %OLLAMA_MODEL% belum ada di Ollama. Mengunduh model agar chat memakai LLM sungguhan...
    echo Ini bisa lama pada run pertama.
    "%OLLAMA_EXE%" pull "%OLLAMA_MODEL%"
    if errorlevel 1 (
      echo Gagal pull %OLLAMA_MODEL%. Backend tetap jalan, tetapi chat akan fallback local-rule sampai model tersedia.
    )
  )
) else (
  echo Ollama tidak ditemukan di lokasi default. Backend tetap jalan, tapi chat bisa fallback local-rule.
)

echo [4/5] Menyalakan backend FastAPI...
(
  echo @echo off
  echo cd /d "%~dp0server"
  echo set "LLM_PROVIDER=%LLM_PROVIDER%"
  echo set "OLLAMA_MODEL=%OLLAMA_MODEL%"
  echo set "WHISPER_MODEL=%WHISPER_MODEL%"
  echo set "WHISPER_LANGUAGE=%WHISPER_LANGUAGE%"
  echo set "OLLAMA_TAGS_TIMEOUT=%OLLAMA_TAGS_TIMEOUT%"
  echo set "OLLAMA_CHAT_TIMEOUT=%OLLAMA_CHAT_TIMEOUT%"
  echo set "KWR_DATA_ROOT=%~dp0data"
  echo echo [%%date%% %%time%%] backend process starting ^>^> "%LOG_DIR%\backend.log"
  echo "%SERVER_PY%" -m uvicorn main:app --host %BACKEND_HOST% --port %BACKEND_PORT% ^>^> "%LOG_DIR%\backend.log" 2^>^&1
  echo echo [%%date%% %%time%%] backend process exited with %%ERRORLEVEL%% ^>^> "%LOG_DIR%\backend.log"
) > "%BACKEND_RUNNER%"
start "Kaggle War Room - Backend" /min "%COMSPEC%" /c call "%BACKEND_RUNNER%"

echo Menunggu backend siap...
set "BACKEND_READY=0"
for /l %%I in (1,1,20) do (
  powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://%BACKEND_HOST%:%BACKEND_PORT%/api/health' -TimeoutSec 2; if ($r.status -eq 'ok') { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 (
    set "BACKEND_READY=1"
    goto backend_ready
  )
  timeout /t 1 /nobreak >nul
)

:backend_ready
if "%BACKEND_READY%"=="1" (
  echo Backend siap: http://%BACKEND_HOST%:%BACKEND_PORT%/api/health
) else (
  echo Backend belum siap. Lihat logs\backend.log untuk error detail.
  if exist "%LOG_DIR%\backend.log" (
    echo.
    echo ===== logs\backend.log =====
    type "%LOG_DIR%\backend.log"
    echo ===== end backend.log =====
  ) else (
    echo logs\backend.log tidak berhasil dibuat. Backend process tidak sempat start.
  )
)

echo [5/5] Menyalakan frontend...
echo.
echo Frontend: http://127.0.0.1:%FRONTEND_PORT%
echo Backend:  http://%BACKEND_HOST%:%BACKEND_PORT%
echo Chat:     http://%BACKEND_HOST%:%BACKEND_PORT%/api/chat
echo LLM:      Ollama auto, model %OLLAMA_MODEL%
echo Data:     data\competitions\YOUR-SLUG\raw
echo Logs:     logs\backend.log
echo.
"%SERVER_PY%" -m http.server %FRONTEND_PORT% --bind 127.0.0.1
