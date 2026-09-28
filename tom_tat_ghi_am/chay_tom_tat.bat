@echo off
chcp 65001 >nul
setlocal
title Tom tat file ghi am / cuoc hop (Viet - Anh - Nga)
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo ============================================================
echo   TOM TAT FILE GHI AM / CUOC HOP  (tieng Viet, Anh, Nga)
echo   Cach dung: KEO THA file ghi am (hoac thu muc) vao file nay
echo ============================================================
echo.

rem --- Tim Python THAT (tranh ban "gia" cua Microsoft Store) ---
set "PY="
python --version >nul 2>nul && set "PY=python"
if not defined PY py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY (
  echo [LOI] Chua cai Python. Vao https://www.python.org/downloads/
  echo cai dat va NHO tick "Add python.exe to PATH".
  echo.
  pause
  exit /b 1
)

rem --- Chi cai thu vien khi chua co (khong can mang o cac lan sau) ---
%PY% -c "import faster_whisper, anthropic" >nul 2>nul
if errorlevel 1 (
  echo Dang cai thu vien lan dau (khoang 200MB, vui long doi^)...
  %PY% -m pip install --quiet --disable-pip-version-check -r requirements.txt
  if errorlevel 1 (
    echo [LOI] Khong cai duoc thu vien. Kiem tra ket noi mang roi chay lai.
    pause
    exit /b 1
  )
)

rem --- API key Claude: hoi 1 lan, luu vao anthropic_api_key.txt ---
if not defined ANTHROPIC_API_KEY if not exist "anthropic_api_key.txt" (
  echo Chua co API key Claude. Co key thi tom tat day du ^(quyet dinh, viec can lam...^).
  echo Lay key tai https://console.anthropic.com  - Bo trong + Enter = tom tat don gian offline.
  set /p "KEY=Dan API key: "
)
if defined KEY (
  >"anthropic_api_key.txt" echo %KEY%
  echo Da luu key vao anthropic_api_key.txt
)
echo.

set "FILE="
if "%~1"=="" set /p "FILE=Keo tha file ghi am vao day roi Enter: "
if "%~1"=="" if not defined FILE (
  echo [LOI] Chua chon file nao.
  pause
  exit /b 1
)

if defined FILE (
  %PY% tom_tat_ghi_am.py %FILE%
) else (
  %PY% tom_tat_ghi_am.py %*
)
if errorlevel 1 (
  echo.
  echo ============================================================
  echo   [LOI] Co file xu ly khong thanh cong - xem thong bao o tren.
  echo ============================================================
) else (
  echo.
  echo ============================================================
  echo   XONG! Ket qua trong thu muc "ket_qua_tom_tat":
  echo     *_tom_tat.md   ban tom tat
  echo     *_van_ban.txt  van ban day du co moc thoi gian
  echo     *_phu_de.srt   phu de
  echo ============================================================
  start "" "ket_qua_tom_tat" 2>nul
)
echo.
pause
