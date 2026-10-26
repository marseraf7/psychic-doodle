#!/usr/bin/env bash
# Vòng luyện mạng NNUE luật Việt Nam cho Rapfi-CARO – chạy liên tục (nhiều ngày / tuần), tắt rồi chạy lại thì tiếp tục.
#   tmux new -s caro 'bash server/scripts/rapfi/caro/nnue/run.sh'      (cài đặt trước: setup.sh; chạy như dịch vụ:
#                                                                       install-service.sh)
# Song song:
#   - Tự đấu: SP_PROCS tiến trình Rapfi-CARO (thư mục engines/best – bảng cổ điển lúc đầu, mạng tốt nhất về sau) sinh ván
#     vào data/ (mỗi lô GAMES ván, NODES nút mỗi nước; nửa số lô bắt đầu từ khai cuộc thật openings.txt).
#   - Mỗi vòng (khi có thêm ít nhất ROUND_GAMES ván): huấn luyện tiếp ITERS bước trên WINDOW file dữ liệu mới nhất → xuất
#     mạng nets/rN.bin.lz4 → đấu với mạng tốt nhất (arena.js, ARENA_OPENINGS × 2 ván, ARENA_MS ms / nước) → điểm ≥ PROMOTE
#     thì thay mạng tốt nhất (tự đấu dùng mạng mới từ lô sau) và đo với engine của game (boat-match.js, như README).
#     128 ván, ngưỡng 0,57: hai mạng ngang sức chỉ ~6% lần lọt ngưỡng (64 ván / 0,55 là ~20% – mạng tốt nhất trôi dạt).
#   - Tốc độ học giảm dần: LR × LR_DECAY sau mỗi LR_EVERY vòng, không dưới LR_MIN.
# Repo dữ liệu chung (đặt DATA_REPO, vd. https://github.com/marseraf7/caro-nnue-data.git – xem lib.sh và README):
#   - huấn luyện thêm trên ván các trợ lý đẩy lên (worker.sh); mặc định máy này thôi tự đấu, dồn mọi lõi cho huấn luyện
#   - mạng ứng viên luyện ở Kaggle (cand/, kaggle-train.py) cũng qua đúng vòng đấu chọn như mạng luyện ở đây
#   - mạng tốt nhất được đẩy lên best/ – các trợ lý tự đấu bằng mạng đó từ lô sau
#   TRAIN=0: không huấn luyện ở máy này (để Kaggle luyện), chỉ đấu chọn ứng viên – nên đặt kèm SP_PROCS=<số lõi>.
# Nhật ký: logs/progress.log (mỗi vòng một dòng). Mạng tốt nhất: engines/best/caro-nnue.bin.lz4. Dừng: Ctrl-C (tự đấu
# dừng theo), hoặc tạo file WORK/STOP (dừng sau vòng hiện tại).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
WORK="${WORK:-$HOME/caro-nnue}"
CORES=$(nproc)
if command -v nvidia-smi > /dev/null && nvidia-smi > /dev/null 2>&1; then GPU=1; else GPU=0; fi
DATA_REPO="${DATA_REPO:-}"
REPO="$WORK/shared"
TRAIN=${TRAIN:-1}
# Mặc định theo phần cứng (đặt biến môi trường để đổi)
if [ -n "$DATA_REPO" ]; then # ván do các trợ lý sinh: dồn lõi cho huấn luyện
  TRAIN_THREADS=${TRAIN_THREADS:-$([ $GPU = 1 ] && echo 2 || echo "$CORES")}
  SP_PROCS=${SP_PROCS:-0}
else
  TRAIN_THREADS=${TRAIN_THREADS:-$([ $GPU = 1 ] && echo 2 || echo $(( CORES > 3 ? CORES / 2 : 1 )))}
  SP_PROCS=${SP_PROCS:-$(( CORES - TRAIN_THREADS > 0 ? CORES - TRAIN_THREADS : 1 ))}
fi
NODES=${NODES:-20000}
GAMES=${GAMES:-200}
ROUND_GAMES=${ROUND_GAMES:-$([ $GPU = 1 ] && echo 20000 || echo 5000)}
WINDOW=${WINDOW:-1000}                     # số file dữ liệu mới nhất dùng để huấn luyện (mỗi file GAMES ván)
ITERS=${ITERS:-$([ $GPU = 1 ] && echo 20000 || echo 1500)}
TEMP_SAVE=${TEMP_SAVE:-$([ $GPU = 1 ] && echo 1000 || echo 100)}   # lưu tạm mỗi … bước: máy bị dừng thì học tiếp từ đây
BATCH=${BATCH:-$([ $GPU = 1 ] && echo 1024 || echo 128)}
LR=${LR:-0.001}
LR_DECAY=${LR_DECAY:-0.8}
LR_EVERY=${LR_EVERY:-5}
LR_MIN=${LR_MIN:-0.0001}
ARENA_OPENINGS=${ARENA_OPENINGS:-64}       # khai cuộc 32–95 của openings.json (không dùng cho tự đấu), × 2 ván
ARENA_MS=${ARENA_MS:-300}
PROMOTE=${PROMOTE:-0.57}
VS_OPENINGS=${VS_OPENINGS:-16}             # đo với engine của game: số khai cuộc (× 2 ván)
LOG="$WORK/logs/progress.log"
# Chỉ một run.sh mỗi WORK: hai bản cùng chạy sẽ cùng học tiếp / ghi đè một vòng (vd. dịch vụ + tmux quên tắt)
mkdir -p "$WORK/logs"
exec 9> "$WORK/run.lock"
flock -n 9 || { echo "run.sh đang chạy ở nơi khác (khoá $WORK/run.lock) – thoát"; exit 0; }
# shellcheck disable=SC1091
. "$WORK/venv/bin/activate"
# shellcheck source=lib.sh
. "$HERE/lib.sh"
# Chạy lệnh dài (huấn luyện, xuất, đấu) ở nền rồi chờ: tín hiệu dừng được xử lý ngay thay vì đợi lệnh xong (có thể hàng giờ)
bg() { "$@" & wait $!; }

# ---------------------------------------------------------------- tự đấu (chạy nền)
selfplay_worker() { # $1 = số hiệu
  local b=0 fails=0 eng out op
  while [ ! -f "$WORK/STOP" ]; do
    b=$((b + 1))
    out="$WORK/data/sp-$(date +%s)-$1-$b.binpack.lz4"; op=""
    [ $((b % 2)) -eq 0 ] && op="$WORK/openings.txt"
    # Mỗi lô đọc lại engines/best: thay mạng tốt nhất thì lô sau dùng ngay. Lỗi 3 lô liền (vd. mạng hỏng): dùng bản cổ
    # điển, cứ 10 lô thử lại best một lần
    eng=best
    if [ $fails -ge 3 ] && [ $((b % 10)) -ne 0 ]; then eng=classic; fi
    if selfplay_batch "$WORK/engines/$eng" "$out" $(( $1 * 1000003 + b * 7919 + $(date +%s) % 100000 )) \
      "$WORK/logs/selfplay-$1.log" "$op"; then
      [ "$eng" = best ] && fails=0
    else
      [ "$eng" = best ] && fails=$((fails + 1))
      log "Tự đấu $1 lỗi ($eng, lần $fails) – xem logs/selfplay-$1.log$([ $fails -eq 3 ] && echo ' · chuyển sang bản cổ điển')"
      nap 30
    fi
  done
}
PIDS=()
for i in $(seq 1 "$SP_PROCS"); do selfplay_worker "$i" & PIDS+=($!); done
# Dừng cả cây tiến trình con / cháu (tự đấu, huấn luyện, đấu chọn) – không để Rapfi mồ côi chạy tiếp. SIGKILL: Rapfi
# tự đấu bỏ qua SIGTERM (cố chơi hết rồi mới thoát). Cha trước con: vòng tự đấu không kịp mở lô mới.
killtree() { local c kids; kids=$(pgrep -P "$1"); kill -9 "$1" 2> /dev/null; for c in $kids; do killtree "$c"; done; }
# Ctrl-C / timeout gửi tín hiệu cho cả nhóm: vòng tự đấu chết ngay, Rapfi bị mồ côi trước khi kịp dọn – giết thêm mọi
# pbrain-rapfi đang chạy trong WORK/engines (nhận qua thư mục làm việc, không đụng tiến trình khác)
cleanup() {
  trap - INT TERM EXIT
  local c p
  for c in $(pgrep -P $$); do killtree "$c"; done
  for p in $(pgrep -x pbrain-rapfi); do
    case "$(readlink "/proc/$p/cwd" 2> /dev/null)" in "$(cd "$WORK" && pwd -P)"/engines/*) kill -9 "$p" 2> /dev/null ;; esac
  done
  exit 0
}
trap cleanup INT TERM EXIT
log "Bắt đầu: $CORES lõi, GPU=$GPU · tự đấu $SP_PROCS tiến trình × $NODES nút · huấn luyện $([ "$TRAIN" = 1 ] && echo "$TRAIN_THREADS luồng, $ITERS bước × lô $BATCH mỗi vòng" || echo "tắt (TRAIN=0)")$([ -n "$DATA_REPO" ] && echo " · repo dữ liệu $DATA_REPO")"

DATA_DIRS=("$WORK/data")
if [ -n "$DATA_REPO" ]; then
  until repo_open "$REPO"; do log "Chưa mở được repo dữ liệu $DATA_REPO (quyền git?) – thử lại sau 60 giây"; nap 60; done
  DATA_DIRS+=("$REPO/data")
fi
count_games() { echo $(( $(data_files 1000000000 "${DATA_DIRS[@]}" | wc -l) * GAMES )); }
best_label() { cat "$WORK/nets/best.label" 2> /dev/null || echo "$([ -f "$WORK/engines/best/caro-nnue.bin.lz4" ] && echo net || echo classic)"; }

# Đẩy mạng tốt nhất lên repo dữ liệu (best/) – các trợ lý tự đấu bằng mạng này từ lô sau
publish_best() { # $1 = mô tả kết quả đấu (JSON hoặc chữ)
  [ -n "$DATA_REPO" ] && [ -f "$WORK/engines/best/caro-nnue.bin.lz4" ] || return 0
  mkdir -p "$REPO/best"
  cp "$WORK/engines/best/caro-nnue.bin.lz4" "$REPO/best/caro-nnue.bin.lz4"
  python3 -c "import json,sys,time; json.dump({'label': sys.argv[1], 'time': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'result': sys.argv[2]}, open(sys.argv[3], 'w'), ensure_ascii=False, indent=1)" \
    "$(best_label)" "${1:-}" "$REPO/best/best.json"
  repo_push "$REPO" "Mạng tốt nhất: $(best_label)" best/caro-nnue.bin.lz4 best/best.json ||
    log "Đẩy mạng tốt nhất lên repo dữ liệu lỗi – thử lại lần thay mạng sau"
}

# Đấu chọn: evaluate <file mạng> <nhãn> <thư mục kết quả> <loss giá trị> – mạng ứng viên (cand) đấu với mạng tốt nhất
# (best); điểm ≥ PROMOTE thì thay, đo với engine của game và đẩy lên repo dữ liệu
evaluate() {
  local net="$1" label="$2" R="$3" loss="$4" C="$WORK/engines/cand" res score vs
  rm -rf "$C"; mkdir -p "$C" "$R"
  ln -sf "$WORK/bin/pbrain-rapfi" "$WORK/bin/model210901.bin" "$WORK/bin/model-caro.bin" "$C/"
  cp "$net" "$C/caro-nnue.bin.lz4"; node "$HERE/make-config.js" "$C" caro-nnue.bin.lz4
  # Rapfi nạp mạng hỏng thì lặng lẽ chơi bằng bảng cổ điển: phải thấy "weight loaded" mới cho đấu
  if ! net_loads "$C"; then log "$label: Rapfi-CARO không nạp được mạng $net – bỏ qua"; return; fi
  bg bash -c 'exec node "$1/arena.js" "$2" "$3/engines/best" "$4" "$5" > "$6/arena.out" 2>> "$6/arena.err"' _ "$HERE" "$C" "$WORK" "$ARENA_OPENINGS" "$ARENA_MS" "$R"
  res=$(tail -1 "$R/arena.out")
  score=$(echo "$res" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['score'])" 2> /dev/null || echo 0)
  # Khoảng tin cậy 95% của điểm (128 ván: ±~8,7%) – 52–53% là chưa phân biệt được với ngang sức
  res="$res $(echo "$res" | python3 -c "
import json, math, sys
d = json.loads(sys.stdin.read()); n = d['games']; p = d['score']
e = 1.96 * math.sqrt(max(p * (1 - p), 1e-9) / n)
elo = lambda x: -400 * math.log10(1 / min(max(x, 0.001), 0.999) - 1)
print(f'≈ {elo(p):+.0f} Elo (95%: {elo(p - e):+.0f}…{elo(p + e):+.0f})')" 2> /dev/null)"
  if python3 -c "import sys; sys.exit(0 if float('$score') >= $PROMOTE else 1)"; then
    cp "$net" "$WORK/engines/best/caro-nnue.bin.lz4.new" && mv "$WORK/engines/best/caro-nnue.bin.lz4.new" "$WORK/engines/best/caro-nnue.bin.lz4"
    node "$HERE/make-config.js" "$WORK/engines/best" caro-nnue.bin.lz4
    cp "$net" "$WORK/nets/best.bin.lz4"; echo "$label" > "$WORK/nets/best.label"
    # Đo với engine của game (như bảng trong README): Rapfi-CARO + mạng 1 giây vs engine 3 giây
    bg bash -c 'cd "$1" && CHECK=0 RAPFI=native RAPFI_DIR="$2/engines/best" exec node server/scripts/rapfi/boat-match.js vn "$3" 1000 3000 > "$4/vs-engine.out" 2> /dev/null' _ "$ROOT" "$WORK" "$VS_OPENINGS" "$R"
    vs=$(node -e 'let w=0,t=0;for(const l of require("fs").readFileSync(0,"utf8").trim().split("\n")){const g=JSON.parse(l);t++;if(g.winner===g.boatSide)w++}console.log(w+"/"+t)' < "$R/vs-engine.out")
    log "$label: loss giá trị $loss · đấu mạng cũ $res → THAY mạng tốt nhất · vs engine của game: $vs"
    publish_best "đấu mạng cũ $res · vs engine của game $vs"
  else
    log "$label: loss giá trị $loss · đấu mạng cũ $res → giữ mạng cũ"
  fi
}

# Lần đầu nối repo dữ liệu: đẩy mạng tốt nhất sẵn có (các vòng trước) để các trợ lý dùng ngay
if [ -n "$DATA_REPO" ] && [ -f "$WORK/engines/best/caro-nnue.bin.lz4" ] &&
  [ "$(sha256sum < "$WORK/engines/best/caro-nnue.bin.lz4")" != "$(sha256sum < "$REPO/best/caro-nnue.bin.lz4" 2> /dev/null)" ]; then
  publish_best "mạng tốt nhất sẵn có trên máy luyện"
fi

# Mạng ứng viên luyện ở Kaggle (cand/<nhãn>.bin.lz4): mỗi mạng đấu chọn một lần. Gọi ở đầu mỗi vòng và cả trong lúc
# huấn luyện (train_bg) – mạng GPU không phải chờ hết một vòng CPU (hàng giờ) mới được đấu chọn
check_cands() {
  [ -n "$DATA_REPO" ] || return 0
  local f label closs
  repo_pull "$REPO"
  for f in $(ls "$REPO"/cand/*.bin.lz4 2> /dev/null | sort); do
    label=$(basename "$f" .bin.lz4)
    [ -e "$WORK/runs/cand-$label" ] && continue
    mkdir -p "$WORK/runs/cand-$label"
    # train_loss đo trên ván đã học (giảm mãi); val_loss đo trên ván để riêng – mới cho biết mạng mạnh lên thật
    closs=$(python3 -c "
import json, sys
m = json.load(open(sys.argv[1]))
r = lambda v: '?' if v is None else round(v, 4)
print(f\"{r(m.get('value_loss'))} · val {r(m.get('val_loss'))}\" + (' (dừng sớm)' if m.get('early_stop') else ''))" "${f%.bin.lz4}.json" 2> /dev/null || echo '?')
    log "$label: mạng ứng viên từ Kaggle – đấu chọn"
    evaluate "$f" "$label" "$WORK/runs/cand-$label" "$closs"
  done
}
# Huấn luyện ở nền; trong lúc chờ, mỗi 5 phút xem có mạng ứng viên mới để đấu chọn (chạy song song, chia CPU)
train_bg() {
  "$@" & local pid=$!
  while kill -0 "$pid" 2> /dev/null; do
    sleep "${CAND_EVERY:-300}" & wait $!
    kill -0 "$pid" 2> /dev/null && check_cands
  done
  wait "$pid"
}

# ---------------------------------------------------------------- các vòng luyện
round=$(ls -d "$WORK"/runs/r* 2> /dev/null | sed 's/.*\/r//' | sort -n | tail -1); round=${round:-0}
# Vòng cuối chưa xong (máy bị dừng giữa lúc huấn luyện / xuất / đấu): làm lại đúng vòng đó – học nốt từ lần lưu
# tạm cuối (cùng rundir), không bỏ cả vòng như trước. Vòng xong có file done (bản cũ: có mạng nets/rN.bin.lz4).
resume=0
if [ "$round" -gt 0 ] && [ ! -e "$WORK/runs/r$round/done" ] && [ ! -s "$WORK/nets/r$round.bin.lz4" ]; then resume=1; fi
last_games=$(cat "$WORK/runs/last_games" 2> /dev/null || echo 0)
while [ ! -f "$WORK/STOP" ]; do
  check_cands
  [ "$TRAIN" != 1 ] && { nap 300; continue; }
  if [ $resume = 1 ]; then
    resume=0; R="$WORK/runs/r$round"
    lr=$(python3 -c "print(max($LR_MIN, $LR * $LR_DECAY ** (($round - 1) // $LR_EVERY)))")
    prev=$(grep -s '^load_from:' "$R/config.yaml" | cut -d' ' -f2-)
    # Dữ liệu packed_binary không học tiếp "chính xác" được từ state_*.pt (bộ huấn luyện từ chối) → nạp trọng số lần
    # lưu cuối (load_from) và học nốt số bước còn lại; các lần lưu cũ chuyển sang ckpts-<số bước đã học>
    done_steps=$(cat "$R/steps" 2> /dev/null || echo 0)
    ck=$(ls "$R"/ckpts/ckpt_mix9svq_*.pt 2> /dev/null | grep -v ema | tail -1)
    if [ -n "$ck" ]; then
      done_steps=$((done_steps + $(basename "$ck" .pt | sed 's/.*_0*//')))
      mv "$R/ckpts" "$R/ckpts-$done_steps"; prev="$R/ckpts-$done_steps/$(basename "$ck")"
      echo "$done_steps" > "$R/steps"
    fi
    rm -f "$R"/training_log.jsonl
    left=$((ITERS - done_steps)); [ "$left" -lt "$TEMP_SAVE" ] && left=$TEMP_SAVE
    python3 "$HERE/make-train-config.py" "$R" "$R/train" "$BATCH" "$left" "$lr" "$prev" "$left" "$TEMP_SAVE"
    log "Vòng $round: làm tiếp sau khi máy bị dừng – đã học $done_steps/$ITERS bước, học nốt $left bước từ ${prev:-đầu}"
  else
    if [ $(( $(count_games) - last_games )) -lt "$ROUND_GAMES" ]; then nap 300; continue; fi
    round=$((round + 1)); R="$WORK/runs/r$round"; mkdir -p "$R/train"
    last_games=$(count_games); echo "$last_games" > "$WORK/runs/last_games"
    data_files "$WINDOW" "${DATA_DIRS[@]}" | while read -r f; do ln -sf "$f" "$R/train/"; done
    prev=$(ls -t "$WORK"/runs/r*/ckpts/ckpt_mix9svq_*.pt 2> /dev/null | grep -v ema | head -1)
    lr=$(python3 -c "print(max($LR_MIN, $LR * $LR_DECAY ** (($round - 1) // $LR_EVERY)))")
    python3 "$HERE/make-train-config.py" "$R" "$R/train" "$BATCH" "$ITERS" "$lr" "$prev" "$ITERS" "$TEMP_SAVE"
    log "Vòng $round: huấn luyện trên $(ls "$R/train" | wc -l) file (~$last_games ván đã có), LR $lr, từ ${prev:-đầu}"
  fi
  if [ $GPU = 1 ]; then
    train_bg bash -c 'cd "$1/trainer" && exec accelerate launch --num_processes 1 train.py -c "$2/config.yaml" > "$2/train.log" 2>&1' _ "$WORK" "$R"
  else
    train_bg bash -c 'cd "$1/trainer" && OMP_NUM_THREADS=$3 exec nice accelerate launch --cpu --num_processes 1 train.py -c "$2/config.yaml" --use_cpu > "$2/train.log" 2>&1' _ "$WORK" "$R" "$TRAIN_THREADS"
  fi
  ck=$(ls "$R"/ckpts/ckpt_mix9svq_*.pt 2> /dev/null | grep -v ema | tail -1)
  if [ -z "$ck" ]; then log "Vòng $round: huấn luyện lỗi – xem $R/train.log"; touch "$R/done"; nap 600; continue; fi
  rm -rf "$R"/ckpts-*   # lần lưu của các đoạn trước (học tiếp) – đã học xong, bỏ cho nhẹ đĩa (~140 MB mỗi đoạn)
  # Loss giá trị (value) của lần ghi cuối có train_loss
  loss=$(python3 -c "
import json, sys
v = None
for l in open(sys.argv[1]):
    l = l.strip()
    if l and 'train_loss' in l: v = json.loads(l)['train_loss'].get('value_loss')
print('?' if v is None else round(v, 4))" "$R/training_log.jsonl" 2> /dev/null)
  net="$WORK/nets/r$round.bin.lz4"
  bg bash -c 'cd "$1/trainer" && OMP_NUM_THREADS=$5 exec python export.py -c "$2/run_config.yaml" -p "$3" -o "$4" \
    --export_type bin-lz4 --export_args "{rule: caro, board_size: 20}" > "$2/export.log" 2>&1' _ "$WORK" "$R" "$ck" "$net" "$TRAIN_THREADS"
  [ -s "$net" ] || { log "Vòng $round: xuất mạng lỗi – xem $R/export.log"; touch "$R/done"; continue; }
  evaluate "$net" "r$round" "$R" "$loss"
  touch "$R/done"
done
cleanup
