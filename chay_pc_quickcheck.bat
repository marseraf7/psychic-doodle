@echo off
chcp 65001 >nul
setlocal
title PC QuickCheck - chan doan nhanh (chi doc du lieu)
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

rem --- Tu xin quyen Administrator (can de doc SMART, bo dem loi o, file dump) ---
net session >nul 2>nul
if errorlevel 1 (
  echo Dang xin quyen Administrator de doc SMART / dump day du...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" >nul 2>nul
  if not errorlevel 1 exit /b 0
  echo [!] Khong co quyen Administrator - van chay nhung mot so muc se doc thieu.
  echo.
)

rem --- Tim Python THAT (tranh ban "gia" cua Microsoft Store) ---
set "PY="
python --version >nul 2>nul && set "PY=python"
if not defined PY py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY (
  echo [LOI] Chua cai Python 3.8+. Vao https://www.python.org/downloads/
  echo cai dat va NHO tick "Add python.exe to PATH".
  pause
  exit /b 1
)

rem Tool chi dung thu vien chuan cua Python - khong can cai them gi, khong can mang.
%PY% -m pc_quickcheck %*
echo.
pause
