#!/usr/bin/env bash
# Vòng luyện mạng NNUE luật Việt Nam cho Rapfi-CARO – chạy liên tục (nhiều ngày / tuần), tắt rồi chạy lại thì tiếp tục.
#   tmux new -s caro 'bash server/scripts/rapfi/caro/nnue/run.sh'      (cài đặt trước: setup.sh)
# Song song:
#   - Tự đấu: SP_PROCS tiến trình Rapfi-CARO (thư mục engines/best – bảng cổ điển lúc đầu, mạng tốt nhất về sau) sinh ván
#     vào data/ (mỗi lô GAMES ván, NODES nút mỗi nước; nửa số lô bắt đầu từ khai cuộc thật openings.txt).
#   - Mỗi vòng (khi có thêm ít nhất ROUND_GAMES ván): huấn luyện tiếp ITERS bước trên WINDOW file dữ liệu mới nhất → xuất
#     mạng nets/rN.bin.lz4 → đấu với mạng tốt nhất (arena.js, ARENA_OPENINGS × 2 ván, ARENA_MS ms / nước) → điểm ≥ PROMOTE
#     thì thay mạng tốt nhất (tự đấu dùng mạng mới từ lô sau) và đo với engine của game (boat-match.js, như README).
# Nhật ký: logs/progress.log (mỗi vòng một dòng). Mạng tốt nhất: engines/best/caro-nnue.bin.lz4. Dừng: Ctrl-C (tự đấu
# dừng theo), hoặc tạo file WORK/STOP (dừng sau vòng hiện tại).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
WORK="${WORK:-$HOME/caro-nnue}"
CORES=$(nproc)
if command -v nvidia-smi > /dev/null && nvidia-smi > /dev/null 2>&1; then GPU=1; else GPU=0; fi
# Mặc định theo phần cứng (đặt biến môi trường để đổi)
TRAIN_THREADS=${TRAIN_THREADS:-$([ $GPU = 1 ] && echo 2 || echo $(( CORES > 3 ? CORES / 2 : 1 )))}
SP_PROCS=${SP_PROCS:-$(( CORES - TRAIN_THREADS > 0 ? CORES - TRAIN_THREADS : 1 ))}
NODES=${NODES:-20000}
GAMES=${GAMES:-200}
ROUND_GAMES=${ROUND_GAMES:-$([ $GPU = 1 ] && echo 20000 || echo 5000)}
WINDOW=${WINDOW:-1000}                     # số file dữ liệu mới nhất dùng để huấn luyện (mỗi file GAMES ván)
ITERS=${ITERS:-$([ $GPU = 1 ] && echo 20000 || echo 1500)}
BATCH=${BATCH:-$([ $GPU = 1 ] && echo 1024 || echo 128)}
LR=${LR:-0.001}
ARENA_OPENINGS=${ARENA_OPENINGS:-32}
ARENA_MS=${ARENA_MS:-300}
PROMOTE=${PROMOTE:-0.55}
VS_OPENINGS=${VS_OPENINGS:-16}             # đo với engine của game: số khai cuộc (× 2 ván)
LOG="$WORK/logs/progress.log"
# shellcheck disable=SC1091
. "$WORK/venv/bin/activate"
log() { echo "$(date -u '+%F %T') $*" | tee -a "$LOG"; }

# ---------------------------------------------------------------- tự đấu (chạy nền)
selfplay_worker() { # $1 = số hiệu
  local b=0
  while [ ! -f "$WORK/STOP" ]; do
    b=$((b + 1))
    local out="$WORK/data/sp-$(date +%s)-$1-$b.binpack.lz4" op=""
    [ $((b % 2)) -eq 0 ] && op="--opening $WORK/openings.txt"
    # Mỗi lô đọc lại engines/best: thay mạng tốt nhất thì lô sau dùng ngay
    (cd "$WORK/engines/best" && ./pbrain-rapfi selfplay --rule caro -n "$GAMES" --boardsize 20 $op \
      --budget-unit nodes --budget-distribution fixed --budget-value "$NODES" \
      --seed $(( $1 * 1000003 + b * 7919 + $(date +%s) % 100000 )) -o "$out.tmp" --report-interval 3600000 \
      > /dev/null 2>&1) && mv "$out.tmp" "$out" || { rm -f "$out.tmp"; sleep 30; }
  done
}
PIDS=()
for i in $(seq 1 "$SP_PROCS"); do selfplay_worker "$i" & PIDS+=($!); done
cleanup() { kill "${PIDS[@]}" 2> /dev/null; pkill -P $$ 2> /dev/null; exit 0; }
trap cleanup INT TERM
log "Bắt đầu: $CORES lõi, GPU=$GPU · tự đấu $SP_PROCS tiến trình × $NODES nút · huấn luyện $TRAIN_THREADS luồng, $ITERS bước × lô $BATCH mỗi vòng"

count_games() { echo $(( $(ls "$WORK/data"/*.binpack.lz4 2> /dev/null | wc -l) * GAMES )); }

# ---------------------------------------------------------------- các vòng luyện
round=$(ls -d "$WORK"/runs/r* 2> /dev/null | sed 's/.*\/r//' | sort -n | tail -1); round=${round:-0}
last_games=$(cat "$WORK/runs/last_games" 2> /dev/null || echo 0)
while [ ! -f "$WORK/STOP" ]; do
  if [ $(( $(count_games) - last_games )) -lt "$ROUND_GAMES" ]; then sleep 300; continue; fi
  round=$((round + 1)); R="$WORK/runs/r$round"; mkdir -p "$R/train"
  last_games=$(count_games); echo "$last_games" > "$WORK/runs/last_games"
  ls -t "$WORK/data"/*.binpack.lz4 | head -n "$WINDOW" | while read -r f; do ln -sf "$f" "$R/train/"; done
  prev=$(ls -t "$WORK"/runs/r*/ckpts/ckpt_mix9svq_*.pt 2> /dev/null | grep -v ema | head -1)
  cat > "$R/config.yaml" << EOF
rundir: $R
dataset_type: packed_binary
dataset_args: {rules: [caro], boardsizes: 20, apply_symmetry: true}
train_datas: [$R/train]
data_pipelines: {line_encoding: {line_length: 11}}
model_type: mix9svq
model_args: {dim_middle: 128, dim_feature: 64, dim_policy: 32, dim_value: 64, dim_dwconv: 32, codebook_size: 65536, kmeans_init: false}
loss_args: {policy_reg_lambda: 0.001}
batch_size: $BATCH
iterations: $ITERS
save_interval: $ITERS
log_interval: 100
val_interval: 100000000
learning_rate: $LR
weight_decay: 1.0e-7
clip_grad_norm: 1.0
EOF
  [ -n "$prev" ] && echo "load_from: $prev" >> "$R/config.yaml"
  log "Vòng $round: huấn luyện trên $(ls "$R/train" | wc -l) file (~$last_games ván đã có), từ ${prev:-đầu}"
  if [ $GPU = 1 ]; then
    (cd "$WORK/trainer" && accelerate launch --num_processes 1 train.py -c "$R/config.yaml") > "$R/train.log" 2>&1
  else
    (cd "$WORK/trainer" && OMP_NUM_THREADS=$TRAIN_THREADS nice accelerate launch --cpu --num_processes 1 train.py -c "$R/config.yaml" --use_cpu) > "$R/train.log" 2>&1
  fi
  ck=$(ls "$R"/ckpts/ckpt_mix9svq_*.pt 2> /dev/null | grep -v ema | tail -1)
  if [ -z "$ck" ]; then log "Vòng $round: huấn luyện lỗi – xem $R/train.log"; sleep 600; continue; fi
  loss=$(tail -1 "$R/training_log.jsonl" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(round(d.get('train_loss',{}).get('value_loss',0),4))" 2> /dev/null)
  net="$WORK/nets/r$round.bin.lz4"
  (cd "$WORK/trainer" && OMP_NUM_THREADS=$TRAIN_THREADS python export.py -c "$R/run_config.yaml" -p "$ck" -o "$net" \
    --export_type bin-lz4 --export_args "{rule: caro, board_size: 20}") > "$R/export.log" 2>&1
  [ -s "$net" ] || { log "Vòng $round: xuất mạng lỗi – xem $R/export.log"; continue; }

  # Đấu: mạng mới (cand) với mạng tốt nhất (best)
  C="$WORK/engines/cand"; rm -rf "$C"; mkdir -p "$C"
  ln -sf "$WORK/bin/pbrain-rapfi" "$WORK/bin/model210901.bin" "$WORK/bin/model-caro.bin" "$C/"
  cp "$net" "$C/caro-nnue.bin.lz4"; node "$HERE/make-config.js" "$C" caro-nnue.bin.lz4
  res=$(node "$HERE/arena.js" "$C" "$WORK/engines/best" "$ARENA_OPENINGS" "$ARENA_MS" 2>> "$R/arena.err" | tee "$R/arena.out" | tail -1)
  score=$(echo "$res" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['score'])" 2> /dev/null || echo 0)
  if python3 -c "import sys; sys.exit(0 if float('$score') >= $PROMOTE else 1)"; then
    cp "$net" "$WORK/engines/best/caro-nnue.bin.lz4.new" && mv "$WORK/engines/best/caro-nnue.bin.lz4.new" "$WORK/engines/best/caro-nnue.bin.lz4"
    node "$HERE/make-config.js" "$WORK/engines/best" caro-nnue.bin.lz4
    cp "$net" "$WORK/nets/best.bin.lz4"
    # Đo với engine của game (như bảng trong README): Rapfi-CARO + mạng 1 giây vs engine 3 giây
    vs=$(cd "$ROOT" && CHECK=0 RAPFI=native RAPFI_DIR="$WORK/engines/best" node server/scripts/rapfi/boat-match.js vn "$VS_OPENINGS" 1000 3000 2> /dev/null |
      node -e 'let w=0,t=0;for(const l of require("fs").readFileSync(0,"utf8").trim().split("\n")){const g=JSON.parse(l);t++;if(g.winner===g.boatSide)w++}console.log(w+"/"+t)')
    log "Vòng $round: loss giá trị $loss · đấu mạng cũ $res → THAY mạng tốt nhất · vs engine của game: $vs"
  else
    log "Vòng $round: loss giá trị $loss · đấu mạng cũ $res → giữ mạng cũ"
  fi
done
cleanup
