@echo off
chcp 65001 >nul
setlocal
title Loc cau hinh VPN con chay
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo ============================================================
echo   LOC CAU HINH VPN CON CHAY (igareck/vpn-configs-for-russia)
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

rem --tai-xray: lan dau tu tai Xray-core de kiem tra THAT (cac lan sau dung lai)
%PY% loc_vpn.py --tai-xray --top 30 %*
if errorlevel 1 (
  echo.
  echo [LOI] Chuong trinh dung giua chung - xem thong bao o tren.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   XONG! Mo thu muc "ket_qua_vpn":
echo     vpn_con_chay.txt  - copy toan bo, dan vao app tren iPad
echo     bao_cao.txt       - do tre / ly do loi tung cau hinh
echo ============================================================
echo.
start "" "%~dp0ket_qua_vpn"
pause
