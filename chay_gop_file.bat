@echo off
chcp 65001 >nul
setlocal
title Cong cu gop file 3A/3B + 3C/3D + PL7/PL8
cd /d "%~dp0"
rem In tieng Viet khong loi tren moi may
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo ============================================================
echo   GOP: 3A/3B  +  3C/3D  +  PL7/PL8
echo   (tu phan loai file trong thu muc donvi theo sheet)
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

rem --- Chi cai openpyxl khi chua co (khong can mang o cac lan sau) ---
%PY% -c "import openpyxl" >nul 2>nul
if errorlevel 1 (
  echo Dang cai thu vien openpyxl lan dau...
  %PY% -m pip install --quiet --disable-pip-version-check openpyxl
  if errorlevel 1 (
    echo [LOI] Khong cai duoc openpyxl. Kiem tra ket noi mang roi chay lai.
    pause
    exit /b 1
  )
)

if not exist "donvi\" (
  echo [LOI] Khong thay thu muc "donvi" canh file nay.
  pause
  exit /b 1
)

%PY% cong_cu_gop_file.py --don-vi donvi --mau-3ab mau_chuan.xlsx --mau-3cd mau_3C_3D.xlsx --mau-pl78 mau_PL78.xlsx --phu-luc phu_luc.xlsx --nguong 50 --out-dir ket_qua
if errorlevel 1 (
  echo.
  echo ============================================================
  echo   [LOI] Chuong trinh dung giua chung - xem thong bao o tren.
  echo   Ket qua trong "ket_qua" CO THE CHUA DAY DU.
  echo ============================================================
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   XONG! Mo thu muc "ket_qua":
echo     FILE_TONG_3AB.xlsx  / BAO_CAO_3AB.xlsx
echo     FILE_TONG_3CD.xlsx  / BAO_CAO_3CD.xlsx
echo     FILE_TONG_PL78.xlsx / BAO_CAO_PL78.xlsx
echo     FILE_LOI.xlsx  (chi co khi co file khong doc duoc)
echo ============================================================
echo.
pause
