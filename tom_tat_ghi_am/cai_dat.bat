@echo off
chcp 65001 >nul
setlocal
title Cai dat cong cu phan tich cuoc hop (GPU)
cd /d "%~dp0"
set PYTHONUTF8=1

echo ============================================================
echo   CAI DAT CONG CU PHAN TICH CUOC HOP  (can mang, lam 1 lan)
echo   Yeu cau: card NVIDIA (khuyen nghi 24GB), driver NVIDIA moi,
echo            Python 3.10 - 3.13, khoang 40GB o dia trong
echo ============================================================
echo.

set "PY="
python --version >nul 2>nul && set "PY=python"
if not defined PY py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY (
  echo [LOI] Chua cai Python. Tai tai https://www.python.org/downloads/ va tick "Add python.exe to PATH".
  pause & exit /b 1
)
%PY% -c "import sys; sys.exit(not ((3, 10) <= sys.version_info[:2] <= (3, 13)))" >nul 2>nul
if errorlevel 1 (
  echo [LOI] Can Python 3.10 den 3.13. Phien ban hien tai:
  %PY% --version
  pause & exit /b 1
)
nvidia-smi >nul 2>nul
if errorlevel 1 echo [!] Khong thay driver NVIDIA ^(nvidia-smi^). Cai driver moi nhat tai https://www.nvidia.com/drivers

rem --- Moi truong Python rieng (.venv) de khong dung cham thu vien khac ---
if not exist ".venv\Scripts\python.exe" (
  echo Tao moi truong .venv ...
  %PY% -m venv .venv || (echo [LOI] Khong tao duoc .venv & pause & exit /b 1)
)
set "VPY=.venv\Scripts\python.exe"
%VPY% -m pip install --quiet --upgrade pip

rem --- PyTorch ban CUDA (pip mac dinh chi cai ban CPU tren Windows) ---
echo Cai PyTorch ban GPU (khoang 3GB)...
%VPY% -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128
if errorlevel 1 (
  echo Thu lai voi CUDA 12.6...
  %VPY% -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu126
  if errorlevel 1 (echo [LOI] Khong cai duoc PyTorch GPU. & pause & exit /b 1)
)

echo Cai cac thu vien con lai...
%VPY% -m pip install -r requirements-phan-tich.txt
if errorlevel 1 (echo [LOI] Cai thu vien that bai - xem thong bao o tren. & pause & exit /b 1)

%VPY% -c "import torch, sys; ok = torch.cuda.is_available(); print('GPU:', torch.cuda.get_device_name(0) if ok else 'KHONG THAY'); sys.exit(0 if ok else 1)"
if errorlevel 1 echo [!] PyTorch khong thay GPU - kiem tra driver NVIDIA roi chay lai file nay.

echo.
echo ============================================================
echo   Tai model (can token HuggingFace - xem README)
echo ============================================================
%VPY% tai_model.py
pause
