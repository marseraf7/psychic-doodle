#!/usr/bin/env bash
# Trợ lý sinh ván cho mạng NNUE luật Việt Nam: Rapfi-CARO tự đấu bằng mạng tốt nhất hiện tại rồi đẩy từng lô ván lên
# repo dữ liệu chung. Máy luyện (run.sh) và Kaggle (kaggle-train.py) học trên các ván này.
#   WORKER=laplace bash server/scripts/rapfi/caro/nnue/worker.sh
# Cần: máy Linux x86-64, git đã đăng nhập được vào repo dữ liệu (đẩy được commit), ~2 GB đĩa. Lần đầu tự cài
# (setup.sh --engine-only, ~5 phút). Máy bị thay / khởi động lại: chạy lại lệnh trên, làm tiếp; lô đang dở thì bỏ.
# Biến môi trường:
#   WORKER      tên trợ lý (bắt buộc, chữ thường / số / gạch ngang) – ván nằm ở data/<WORKER>/ trong repo dữ liệu
#   DATA_REPO   repo dữ liệu (mặc định https://github.com/marseraf7/caro-nnue-data.git)
#   SP_PROCS    số tiến trình tự đấu song song (mặc định = số lõi) · GAMES ván mỗi lô (200) · NODES nút mỗi nước (40000 – gấp đôi để ván chất lượng hơn, đổi lại ít ván hơn)
# Dừng: Ctrl-C, hoặc tạo file $WORK/STOP (dừng sau lô đang chạy).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${WORK:-$HOME/caro-nnue}"
WORKER="${WORKER:-}"
DATA_REPO="${DATA_REPO:-https://github.com/marseraf7/caro-nnue-data.git}"
SP_PROCS=${SP_PROCS:-$(nproc)}
GAMES=${GAMES:-200}
NODES=${NODES:-40000}
REPO="$WORK/shared"
LOG="$WORK/logs/worker.log"
if ! [[ "$WORKER" =~ ^[a-z0-9][a-z0-9-]{0,30}$ ]]; then
  echo "Đặt tên trợ lý: WORKER=<tên, chữ thường/số/gạch ngang> bash $0"; exit 1
fi
mkdir -p "$WORK/logs"
# shellcheck source=lib.sh
. "$HERE/lib.sh"

bash "$HERE/setup.sh" --engine-only > "$WORK/logs/setup.log" 2>&1 || { echo "Cài đặt lỗi – xem $WORK/logs/setup.log"; exit 1; }
# Clone thưa: chỉ thư mục mạng tốt nhất (không kéo ván của người khác)
until repo_open "$REPO" best; do log "Chưa mở được repo dữ liệu $DATA_REPO (quyền git?) – thử lại sau 60 giây"; nap 60; done
rm -f "$WORK/STOP"

PIDS=()
cleanup() {
  trap - INT TERM EXIT
  local p
  for p in "${PIDS[@]}"; do kill "$p" 2> /dev/null; done
  for p in $(pgrep -x pbrain-rapfi); do
    case "$(readlink "/proc/$p/cwd" 2> /dev/null)" in "$(cd "$WORK" && pwd -P)"/engines/*) kill -9 "$p" 2> /dev/null ;; esac
  done
  exit 0
}
trap cleanup INT TERM EXIT

# Lấy mạng tốt nhất từ repo (đổi thì cài vào engines/best, kiểm Rapfi nạp được; không nạp được thì tự đấu bằng bảng
# cổ điển). In nhãn mạng đang dùng (vd. r12, k-20261025-0310, hoặc classic).
NET_LABEL=classic
sync_best() {
  repo_pull "$REPO"
  local want have
  want=$(sha256sum "$REPO/best/caro-nnue.bin.lz4" 2> /dev/null | cut -d' ' -f1)
  have=$(sha256sum "$WORK/engines/best/caro-nnue.bin.lz4" 2> /dev/null | cut -d' ' -f1)
  [ -z "$want" ] && { NET_LABEL=classic; return; }
  if [ "$want" != "$have" ]; then
    cp "$REPO/best/caro-nnue.bin.lz4" "$WORK/engines/best/caro-nnue.bin.lz4.new"
    mv "$WORK/engines/best/caro-nnue.bin.lz4.new" "$WORK/engines/best/caro-nnue.bin.lz4"
    node "$HERE/make-config.js" "$WORK/engines/best" caro-nnue.bin.lz4
    if ! net_loads "$WORK/engines/best"; then
      log "Mạng tốt nhất mới không nạp được – tự đấu bằng bảng cổ điển"
      rm -f "$WORK/engines/best/caro-nnue.bin.lz4"; node "$HERE/make-config.js" "$WORK/engines/best"
      NET_LABEL=classic; return
    fi
  fi
  NET_LABEL=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('label','net'))" "$REPO/best/best.json" 2> /dev/null || echo net)
  [[ "$NET_LABEL" =~ ^[A-Za-z0-9_-]+$ ]] || NET_LABEL=net
}

log "Trợ lý $WORKER bắt đầu: $SP_PROCS tiến trình × $GAMES ván / lô, $NODES nút mỗi nước → $DATA_REPO"
total=0; b=0
while [ ! -f "$WORK/STOP" ]; do
  sync_best
  b=$((b + 1)); PIDS=(); outs=()
  # Mỗi tiến trình một lô; nửa số lô bắt đầu từ khai cuộc thật (openings.txt), nửa từ bàn trống
  for i in $(seq 1 "$SP_PROCS"); do
    out="$WORK/data/sp-$(date +%s)-$WORKER-$b$i-$NET_LABEL.binpack.lz4"; outs+=("$out")
    op=""; [ $(( (b + i) % 2 )) -eq 0 ] && op="$WORK/openings.txt"
    selfplay_batch "$WORK/engines/best" "$out" $(( RANDOM * 32768 + RANDOM + i )) "$WORK/logs/selfplay-$i.log" "$op" &
    PIDS+=($!)
  done
  for p in "${PIDS[@]}"; do wait "$p"; done
  month=$(date -u +%Y%m); done_files=()
  mkdir -p "$REPO/data/$WORKER/$month"
  for out in "${outs[@]}"; do
    [ -s "$out" ] || continue
    mv "$out" "$REPO/data/$WORKER/$month/"; done_files+=("data/$WORKER/$month/$(basename "$out")")
  done
  if [ ${#done_files[@]} -eq 0 ]; then log "Lô $b lỗi cả $SP_PROCS tiến trình – xem $WORK/logs/selfplay-*.log"; nap 60; continue; fi
  if repo_push "$REPO" "$WORKER: +$(( ${#done_files[@]} * GAMES )) ván (mạng $NET_LABEL)" "${done_files[@]}"; then
    total=$((total + ${#done_files[@]} * GAMES))
    log "Lô $b: đã đẩy ${#done_files[@]} file (+$(( ${#done_files[@]} * GAMES )) ván, mạng $NET_LABEL) · tổng phiên này $total ván"
  else
    log "Lô $b: đẩy lên repo lỗi – giữ lại trong $REPO, lô sau đẩy kèm"
  fi
done
cleanup
