#!/usr/bin/env bash
# Chép dữ liệu tự đấu và mạng giữa máy sinh ván (MODE=gen) và máy huấn luyện (MODE=train).
#   bash chuyen.sh dong-goi            máy gen: gói các file ván MỚI (chưa gửi lần nào) thành $WORK/gui/du-lieu-<giờ>.tar
#   bash chuyen.sh nhap <file.tar>     máy train: giải nén vào $WORK/data (bỏ qua file đã có)
#   bash chuyen.sh xuat-mang           máy train: chép mạng tốt nhất ra $WORK/gui/best.bin.lz4
#   bash chuyen.sh nhap-mang <file>    máy gen: dùng mạng đó cho tự đấu từ lô sau (như run.sh khi thay mạng)
# WORK mặc định ~/caro-nnue. Chỉ dùng file ván đã xong (*.binpack.lz4), không đụng file đang ghi (*.tmp).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${WORK:-$HOME/caro-nnue}"
mkdir -p "$WORK/gui"

case "${1:-}" in
  dong-goi)
    SENT="$WORK/gui/da-gui.txt"; touch "$SENT"
    NEW="$WORK/gui/moi.txt"
    (cd "$WORK/data" && ls -- *.binpack.lz4 2> /dev/null | sort) | comm -23 - <(sort "$SENT") > "$NEW" || true
    N=$(wc -l < "$NEW")
    [ "$N" -gt 0 ] || { echo "Không có file ván mới."; exit 0; }
    OUT="$WORK/gui/du-lieu-$(date +%Y%m%d-%H%M).tar"
    # Dữ liệu đã nén lz4 nên chỉ cần tar (không nén thêm)
    tar -cf "$OUT.tmp" -C "$WORK/data" -T "$NEW" && mv "$OUT.tmp" "$OUT"
    cat "$NEW" >> "$SENT"
    echo "Đã gói $N file ($(du -h "$OUT" | cut -f1)) → $OUT"
    ;;
  nhap)
    [ -f "${2:-}" ] || { echo "Dùng: chuyen.sh nhap <file.tar>"; exit 1; }
    mkdir -p "$WORK/data"
    # --keep-old-files: không ghi đè file đã có (giữ giờ sửa gốc nên run.sh vẫn xếp đúng thứ tự mới / cũ)
    tar -xf "$2" -C "$WORK/data" --keep-old-files 2> /dev/null || true
    echo "Đã nhập. Hiện có $(ls "$WORK/data"/*.binpack.lz4 2> /dev/null | wc -l) file ván trong $WORK/data"
    ;;
  xuat-mang)
    [ -s "$WORK/nets/best.bin.lz4" ] || { echo "Chưa có mạng tốt nhất (nets/best.bin.lz4)."; exit 1; }
    cp "$WORK/nets/best.bin.lz4" "$WORK/gui/best.bin.lz4"
    echo "Đã chép → $WORK/gui/best.bin.lz4"
    ;;
  nhap-mang)
    [ -s "${2:-}" ] || { echo "Dùng: chuyen.sh nhap-mang <best.bin.lz4>"; exit 1; }
    B="$WORK/engines/best"; [ -d "$B" ] || { echo "Chưa chạy setup.sh (thiếu $B)"; exit 1; }
    # Ghi tạm rồi đổi tên: tự đấu đang chạy không bao giờ đọc phải file dở
    cp "$2" "$B/caro-nnue.bin.lz4.new" && mv "$B/caro-nnue.bin.lz4.new" "$B/caro-nnue.bin.lz4"
    node "$HERE/make-config.js" "$B" caro-nnue.bin.lz4
    cp "$2" "$WORK/nets/best.bin.lz4"
    echo "Tự đấu sẽ dùng mạng mới từ lô ván sau."
    ;;
  *)
    sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
