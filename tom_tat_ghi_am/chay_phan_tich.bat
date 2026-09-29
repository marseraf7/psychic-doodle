@echo off
chcp 65001 >nul
setlocal
title Phan tich cuoc hop (offline)
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

if not exist ".venv\Scripts\python.exe" (
  echo [LOI] Chua cai dat. Chay cai_dat.bat truoc.
  pause & exit /b 1
)
if "%~1"=="" (
  echo Cach dung: KEO THA file ghi am vao file nay.
  echo Tuy chon nang cao ^(so nguoi noi, dat ten...^): xem README.
  pause & exit /b 1
)
.venv\Scripts\python.exe phan_tich_cuoc_hop.py %*
if errorlevel 1 (
  echo.
  echo [LOI] Co file xu ly khong thanh cong - xem thong bao o tren.
) else (
  start "" "ket_qua_phan_tich" 2>nul
)
echo.
pause
