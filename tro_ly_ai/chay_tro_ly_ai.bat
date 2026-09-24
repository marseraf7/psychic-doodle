@echo off
chcp 65001 >nul
setlocal
title Tro ly AI local - quan ly du lieu laptop
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

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

rem --- Thu vien tuy chon: pypdf de doc PDF, numpy de tim theo nghia nhanh hon ---
%PY% -c "import pypdf" >nul 2>nul
if errorlevel 1 (
  echo Dang cai pypdf lan dau - de doc noi dung PDF...
  %PY% -m pip install --quiet --disable-pip-version-check pypdf
)
%PY% -c "import numpy" >nul 2>nul
if errorlevel 1 (
  echo Dang cai numpy lan dau - de tim theo nghia nhanh hon...
  %PY% -m pip install --quiet --disable-pip-version-check numpy
)

:menu
echo.
echo ============================================================
echo   TRO LY AI LOCAL - du lieu KHONG roi khoi may
echo ============================================================
echo   1. Quet / cap nhat chi muc  - lan dau hoi lau
echo   2. Tim file
echo   3. Tro chuyen, hoi dap voi tai lieu
echo   4. Mo giao dien web
echo   5. Thong ke dung luong
echo   6. Tim file trung lap
echo   7. Sap xep Downloads - CHAY THU, khong di chuyen gi
echo   8. Sap xep Downloads - LAM THAT, co the hoan tac
echo   9. Hoan tac lan sap xep gan nhat
echo   K. Kiem tra Ollama / mo hinh AI
echo   T. Tai mo hinh AI  - can mang, khoang 5GB
echo   0. Thoat
echo ============================================================
set "CHON="
set /p "CHON=Chon: "
if "%CHON%"=="1" %PY% tro_ly_ai.py quet
if "%CHON%"=="2" goto tim
if "%CHON%"=="3" %PY% tro_ly_ai.py chat
if "%CHON%"=="4" %PY% tro_ly_ai.py giao-dien
if "%CHON%"=="5" %PY% tro_ly_ai.py thong-ke
if "%CHON%"=="6" %PY% tro_ly_ai.py trung-lap --xuat du_lieu\trung_lap.csv
if "%CHON%"=="7" %PY% tro_ly_ai.py sap-xep
if "%CHON%"=="8" %PY% tro_ly_ai.py sap-xep --thuc-hien
if "%CHON%"=="9" %PY% tro_ly_ai.py hoan-tac
if /i "%CHON%"=="K" %PY% tro_ly_ai.py kiem-tra
if /i "%CHON%"=="T" goto tai
if "%CHON%"=="0" exit /b 0
goto menu

:tim
set "Q="
set /p "Q=Tu khoa - go khong dau cung duoc: "
if defined Q %PY% tro_ly_ai.py tim "%Q%"
goto menu

:tai
where ollama >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Ollama. Vao https://ollama.com/download cai dat, mo Ollama roi chon lai.
  goto menu
)
echo Tai mo hinh tro chuyen qwen2.5:7b - may yeu/RAM 8GB nen dung qwen2.5:3b, xem HUONG_DAN.md
ollama pull qwen2.5:7b
echo Tai mo hinh tim theo nghia bge-m3...
ollama pull bge-m3
echo Xong. Chon 1 de quet lai - se tao them vector tim theo nghia.
goto menu
