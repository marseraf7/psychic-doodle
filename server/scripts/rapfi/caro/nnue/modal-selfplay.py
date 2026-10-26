"""
Sinh ván tự đấu trên Modal (CPU thuê theo giây, dùng credit): mỗi container chạy cloud-selfplay.py (worker.sh) HOURS giờ,
đẩy ván lên repo dữ liệu như các trợ lý khác (data/modal-<n>/). Không huấn luyện ở đây – huấn luyện vẫn ở Kaggle (GPU miễn
phí); khâu thiếu là ván mới, nên credit dùng cho CPU tự đấu được nhiều ván nhất.
Cài một lần trên máy mình:
    pip install modal && modal setup
    modal secret create caro-nnue-github GITHUB_TOKEN=<token chỉ quyền Contents: Read and write repo caro-nnue-data>
    (gõ token ngay trong terminal của mình – không dán vào chat, không ghi vào repo)
Chạy (--detach: tắt máy mình vẫn chạy tiếp; theo dõi / dừng ở trang Apps của Modal):
    CONTAINERS=4 CPU=8 HOURS=6 modal run --detach server/scripts/rapfi/caro/nnue/modal-selfplay.py
Biến môi trường: CONTAINERS (4) · CPU số nhân mỗi container (8) · HOURS (6, tối đa 23) · BRANCH nhánh psychic-doodle (mặc
định nhánh chính) · NODES / GAMES như worker.sh. In ước tính chi phí trước khi chạy – nên đặt thêm giới hạn chi tiêu
(Settings → Usage / Billing của workspace Modal) để không bao giờ vượt credit.
"""
import os

import modal

CONTAINERS = int(os.environ.get("CONTAINERS", "4"))
CPU = float(os.environ.get("CPU", "8"))
HOURS = min(float(os.environ.get("HOURS", "6")), 23.0)  # Modal dừng mọi hàm ở 24 giờ
MEM_GB = 1 + CPU / 2  # Rapfi-CARO tự đấu ~100–200 MB mỗi tiến trình
BRANCH = os.environ.get("BRANCH", "claude/vibrant-dirac-222bq2")
# Giá Modal (USD, tham khảo – xem modal.com/pricing): mỗi nhân CPU-giờ, mỗi GiB RAM-giờ
PRICE_CPU_H, PRICE_GB_H = 0.0473, 0.0080

app = modal.App("caro-nnue-selfplay")
# Chỉ cài gói hệ thống trong ảnh; Rapfi-CARO dựng lúc chạy (-march=native đúng CPU của máy được cấp – dựng sẵn trong ảnh
# rồi chạy trên CPU đời khác có thể lỗi lệnh không hỗ trợ)
image = modal.Image.debian_slim(python_version="3.11").apt_install(
    "git", "curl", "build-essential", "clang", "cmake", "ninja-build", "patch", "tmux", "nodejs")


@app.function(image=image, cpu=CPU, memory=int(MEM_GB * 1024), timeout=int((HOURS + 1) * 3600),
              secrets=[modal.Secret.from_name("caro-nnue-github")])
def selfplay(name: str, hours: float, branch: str, env: dict):
    import subprocess
    subprocess.run(["git", "clone", "-q", "--depth", "1", "-b", branch, "https://github.com/marseraf7/psychic-doodle", "/pd"], check=True)
    subprocess.run(["python", "/pd/server/scripts/rapfi/caro/nnue/cloud-selfplay.py"],
                   env={**os.environ, **env, "WORKER": name, "HOURS": str(hours), "GRACE": "40"}, check=False)


@app.local_entrypoint()
def main():
    cost = CONTAINERS * (HOURS + 0.3) * (CPU * PRICE_CPU_H + MEM_GB * PRICE_GB_H)
    print(f"{CONTAINERS} container × {CPU:g} nhân × {HOURS:g} giờ → ước tính ~{cost:.1f} USD credit "
          f"(~{int(CONTAINERS * CPU * HOURS * 600):,} ván nếu ~600 ván / nhân-giờ – số thật ghi trong log từng container)")
    # nproc trong container thấy cả CPU của máy chủ (không phải phần được cấp) – đặt rõ số tiến trình. Lô 100 ván (thay vì
    # 200) cho hết giờ ít ván dở bị bỏ
    env = {"SP_PROCS": str(int(CPU)), "GAMES": "100"}
    env.update({k: os.environ[k] for k in ("NODES", "GAMES", "SP_PROCS", "DATA_REPO") if k in os.environ})
    names = [f"modal-{i + 1}" for i in range(CONTAINERS)]
    for _ in selfplay.starmap([(n, HOURS, BRANCH, env) for n in names]):
        pass
    print("Xong – ván đã ở repo dữ liệu (data/modal-*/); phiên Kaggle sau sẽ học trên các ván này")
