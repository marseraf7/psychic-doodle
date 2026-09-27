@echo off
chcp 65001 >nul
setlocal
title Tu kiem tra luan van truoc khi nop Antiplagiat
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
  pause
  exit /b 1
)

rem --- Chi cai thu vien khi chua co ---
%PY% -c "import docx, pypdf" >nul 2>nul
if errorlevel 1 (
  echo Dang cai python-docx va pypdf lan dau...
  %PY% -m pip install --quiet --disable-pip-version-check python-docx pypdf
  if errorlevel 1 (
    echo [LOI] Khong cai duoc thu vien. Kiem tra ket noi mang roi chay lai.
    pause
    exit /b 1
  )
)

rem --- Tim file ban thao: ban_thao.docx / .txt / .pdf ---
set "BT="
for %%F in (ban_thao.docx ban_thao.txt ban_thao.pdf) do if not defined BT if exist "%%F" set "BT=%%F"

echo ============================================================
echo   1. Kiem tra trung lap voi tai lieu nguon (thu muc "nguon")
echo   2. Kiem tra trich dan [N] va Spisok literatury
echo   3. Tao danh muc tai lieu theo GOST tu file tai_lieu.csv
echo   4. Chay ca 3
echo ============================================================
set /p CHON="Chon (1-4): "

if "%CHON%"=="1" goto TRUNG
if "%CHON%"=="2" goto DAN
if "%CHON%"=="3" goto DM
if "%CHON%"=="4" goto TRUNG
echo Lua chon khong hop le.
pause
exit /b 1

:TRUNG
if not defined BT goto THIEU_BT
if not exist "nguon\" (
  echo [LOI] Khong thay thu muc "nguon" chua tai lieu nguon.
  pause
  exit /b 1
)
%PY% kiem_tra_luan_van.py trung-lap --ban-thao "%BT%" --nguon nguon
if errorlevel 1 goto LOI
if not "%CHON%"=="4" goto XONG

:DAN
if not defined BT goto THIEU_BT
%PY% kiem_tra_luan_van.py kiem-tra-dan --ban-thao "%BT%"
if errorlevel 1 goto LOI
if not "%CHON%"=="4" goto XONG

:DM
if "%CHON%"=="4" if not exist "tai_lieu.csv" goto XONG
if not exist "tai_lieu.csv" (
  echo [LOI] Khong thay file tai_lieu.csv - xem mau trong vi_du\tai_lieu.csv
  pause
  exit /b 1
)
%PY% kiem_tra_luan_van.py dinh-dang --csv tai_lieu.csv
if errorlevel 1 goto LOI
goto XONG

:THIEU_BT
echo [LOI] Khong thay ban_thao.docx / ban_thao.txt / ban_thao.pdf canh file nay.
pause
exit /b 1

:LOI
echo.
echo [LOI] Chuong trinh dung giua chung - xem thong bao o tren.
pause
exit /b 1

:XONG
echo.
echo XONG! Ket qua trong thu muc "ket_qua".
if exist "ket_qua\BAO_CAO_TRUNG_LAP.html" start "" "ket_qua\BAO_CAO_TRUNG_LAP.html"
pause
