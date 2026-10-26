"""
Sinh ván tự đấu trên máy thuê theo giờ / phiên notebook (Kaggle CPU, Modal…): chạy worker.sh (Rapfi-CARO tự đấu bằng mạng
tốt nhất, đẩy từng lô 200 ván lên repo dữ liệu) trong HOURS giờ rồi dừng gọn – lô đang chạy được đánh nốt và đẩy lên.
  Kaggle (notebook CPU – không tốn giờ GPU; Settings: Internet On; Secrets: GITHUB_TOKEN), một ô:
    !git clone -q --depth 1 https://github.com/marseraf7/psychic-doodle /kaggle/temp/pd
    !WORKER=kaggle-cpu1 python /kaggle/temp/pd/server/scripts/rapfi/caro/nnue/cloud-selfplay.py
  Modal: modal-selfplay.py gọi file này trong từng container.
Biến môi trường:
  WORKER      tên trợ lý (bắt buộc, mỗi máy / notebook một tên – ván nằm ở data/<WORKER>/)
  HOURS       số giờ tự đấu (mặc định 11 – phiên Kaggle dừng ở 12 giờ); hết giờ thì chờ lô dở tối đa GRACE phút (45)
  DATA_REPO, SP_PROCS, GAMES, NODES – như worker.sh
Token: GITHUB_TOKEN (biến môi trường, Kaggle Secrets hoặc Modal Secret) – chỉ ghi vào kho mật khẩu git của máy này
(~/.git-credentials, quyền 600) để worker.sh đẩy được, không in ra; cần quyền ghi (Contents) repo dữ liệu.
"""
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
HOURS = float(os.environ.get("HOURS", "11"))
GRACE = float(os.environ.get("GRACE", "45"))
WORK = Path(os.environ.get("WORK", str(Path.home() / "caro-nnue")))


def say(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def token():
    t = os.environ.get("GITHUB_TOKEN", "")
    if not t and Path("/kaggle").exists():
        try:
            from kaggle_secrets import UserSecretsClient
            t = UserSecretsClient().get_secret("GITHUB_TOKEN")
        except Exception:
            t = ""
    return t


def git_login(t):
    """worker.sh dùng git của máy: đặt token vào kho mật khẩu git (không qua dòng lệnh, không in)."""
    cred = Path.home() / ".git-credentials"
    cred.write_text(f"https://x-access-token:{t}@github.com\n")
    cred.chmod(0o600)
    subprocess.run(["git", "config", "--global", "credential.helper", "store"], check=True)


if __name__ == "__main__":
    if not os.environ.get("WORKER"):
        sys.exit("Đặt WORKER=<tên, chữ thường/số/gạch ngang> (mỗi máy một tên)")
    t = token()
    if not t:
        sys.exit("Thiếu GITHUB_TOKEN (Kaggle: Add-ons → Secrets; Modal: Secret caro-nnue-github) – cần quyền ghi repo dữ liệu")
    git_login(t)
    (WORK / "STOP").unlink(missing_ok=True)
    deadline = time.time() + HOURS * 3600
    say(f"Trợ lý {os.environ['WORKER']}: tự đấu {HOURS:g} giờ trên {os.cpu_count()} luồng CPU (lần đầu dựng Rapfi-CARO ~5 phút)")
    # worker.sh tự in tiến độ (mỗi lô một dòng) ra đầu ra chung – hiện ngay trong log notebook / Modal
    p = subprocess.Popen(["bash", str(HERE / "worker.sh")], start_new_session=True)
    while p.poll() is None and time.time() < deadline:
        time.sleep(30)
    if p.poll() is None:
        say(f"Hết giờ – đánh nốt lô đang chạy rồi đẩy lên (tối đa {GRACE:g} phút)")
        (WORK / "STOP").touch()
        try:
            p.wait(GRACE * 60)
        except subprocess.TimeoutExpired:
            say("Lô dở chưa xong – dừng (lô này bỏ, các lô trước đã ở trên repo)")
            os.killpg(p.pid, signal.SIGTERM)
            p.wait()
    say("Xong")
