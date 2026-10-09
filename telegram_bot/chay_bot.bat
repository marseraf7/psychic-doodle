@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .env (
  copy .env.example .env >nul
  echo Da tao file .env - hay mo file .env, dien BOT_TOKEN va thong tin ngan hang roi chay lai.
  pause
  exit /b
)
pip install -r requirements.txt
python bot.py
pause
