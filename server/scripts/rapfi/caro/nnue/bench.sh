#!/usr/bin/env bash
# Đo tốc độ tự đấu THẬT trên máy này (vài phút) để biết 1 triệu ván cần bao lâu – chạy sau setup.sh, trước run.sh.
#   bash bench.sh            dùng số tiến trình như run.sh MODE=gen (số luồng - 1)
#   SP_PROCS=2 NODES=10000 TARGET=500000 bash bench.sh
# Không ghi gì vào WORK/data. Dùng bảng cổ điển (engines/classic) nên không ảnh hưởng mạng đang luyện.
set -uo pipefail
WORK="${WORK:-$HOME/caro-nnue}"
CORES=$(nproc)
SP_PROCS=${SP_PROCS:-$(( CORES > 1 ? CORES - 1 : 1 ))}
NODES=${NODES:-20000}          # phải giống NODES của run.sh khi luyện thật
PER=${PER:-6}                  # số ván mỗi tiến trình trong lần đo
TARGET=${TARGET:-1000000}
OUT="$(mktemp -d "$WORK/bench.XXXXXX")"
trap 'rm -rf "$OUT"' EXIT
[ -x "$WORK/engines/classic/pbrain-rapfi" ] || { echo "Chưa chạy setup.sh (thiếu engines/classic)"; exit 1; }

echo "Đo: $SP_PROCS tiến trình × $PER ván × $NODES nút/nước (có thể vài phút, máy yếu lâu hơn)…"
T0=$(date +%s)
for i in $(seq 1 "$SP_PROCS"); do
  (cd "$WORK/engines/classic" && ./pbrain-rapfi selfplay --rule caro -n "$PER" --boardsize 20 \
    --budget-unit nodes --budget-distribution fixed --budget-value "$NODES" \
    --seed $((i * 7919 + T0 % 100000)) -o "$OUT/b$i.binpack.lz4" --report-interval 3600000 > "$OUT/b$i.log" 2>&1) &
done
wait
T1=$(date +%s)
OK=$(ls -s "$OUT"/*.binpack.lz4 2> /dev/null | awk '$1 > 0' | wc -l)
[ "$OK" -gt 0 ] || { echo "Không tiến trình nào sinh được ván – xem log: $OUT/b1.log"; trap - EXIT; exit 1; }
GAMES=$(( OK * PER )); SEC=$(( T1 - T0 )); [ "$SEC" -lt 1 ] && SEC=1
awk -v g="$GAMES" -v s="$SEC" -v t="$TARGET" -v p="$SP_PROCS" 'BEGIN {
  perday = g / s * 86400
  printf "Sinh %d ván trong %d giây → %.0f ván/phút (%.1f ván/phút/tiến trình), ~%.0f ván/ngày\n", g, s, g / s * 60, g / s * 60 / p, perday
  printf "Để đủ %d ván: ~%.1f ngày chạy liền (nếu máy không giảm xung vì nóng – đo lại sau 1–2 giờ)\n", t, t / perday
}'
