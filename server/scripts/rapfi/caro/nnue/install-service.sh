#!/usr/bin/env bash
# Cài run.sh thành dịch vụ systemd trên máy luyện: máy (Spot / bị dừng) bật lại là tự luyện tiếp, không cần mở tmux.
# Mỗi lần khởi động: git pull repo này + setup.sh (dựng lại Rapfi-CARO nếu bản vá đổi) rồi chạy run.sh.
#   DATA_REPO=https://github.com/marseraf7/caro-nnue-data.git bash server/scripts/rapfi/caro/nnue/install-service.sh
# Các biến khác của run.sh (TRAIN, SP_PROCS, ITERS…) đặt cùng lệnh trên cũng được ghi vào dịch vụ.
# Chạy bằng tài khoản thường (có sudo); dịch vụ chạy dưới tài khoản đó. Git của tài khoản phải đẩy được lên repo dữ liệu
# (token lưu ở ~/.git-credentials – xem README).
# Xem: systemctl status caro-nnue · journalctl -u caro-nnue -f · tail -f ~/caro-nnue/logs/progress.log
# Dừng hẳn: sudo systemctl disable --now caro-nnue
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
USER_NAME="$(id -un)"
WORK="${WORK:-$HOME/caro-nnue}"
ENV_LINES="Environment=WORK=$WORK"
for v in DATA_REPO TRAIN SP_PROCS TRAIN_THREADS NODES GAMES ROUND_GAMES WINDOW ITERS BATCH LR LR_DECAY LR_EVERY LR_MIN \
  ARENA_OPENINGS ARENA_MS PROMOTE VS_OPENINGS TEMP_SAVE; do
  [ -n "${!v:-}" ] && ENV_LINES="$ENV_LINES
Environment=$v=${!v}"
done
sudo tee /etc/systemd/system/caro-nnue.service > /dev/null << EOF
[Unit]
Description=Luyện mạng NNUE luật Việt Nam cho Rapfi-CARO (run.sh)
Wants=network-online.target
After=network-online.target

[Service]
User=$USER_NAME
WorkingDirectory=$ROOT
Environment=HOME=$HOME
$ENV_LINES
# Lấy code mới + dựng lại khi cần; lỗi (mất mạng…) vẫn chạy tiếp bằng bản đang có
ExecStartPre=-/usr/bin/git -C $ROOT pull -q
ExecStartPre=-/bin/bash $HERE/setup.sh
ExecStart=/bin/bash $HERE/run.sh
# run.sh tự thoát 0 khi có file STOP – chỉ khởi động lại khi lỗi / bị giết
Restart=on-failure
RestartSec=60
KillMode=control-group
TimeoutStopSec=60
Nice=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now caro-nnue
echo "Đã cài dịch vụ caro-nnue (chạy ngay và mỗi lần máy bật). Xem: journalctl -u caro-nnue -f"
