#!/usr/bin/env bash
# Phân tích một video mẫu để học phong cách: thông số kỹ thuật, tấm ghép khung hình,
# các điểm cắt cảnh, độ to âm thanh và (tùy chọn) bản ghi lời dẫn.
# Cách dùng: phan_tich_video.sh <video.mp4> <thu-muc-ket-qua> [--phien-am]
set -euo pipefail
VIDEO="$1"; OUT="$2"; PHIEN_AM="${3:-}"
mkdir -p "$OUT"

# ffmpeg đầy đủ bộ lọc: ưu tiên bản hệ thống, nếu không có thì dùng imageio-ffmpeg (pip install imageio-ffmpeg).
FF="$(command -v ffmpeg || true)"
if [ -z "$FF" ]; then
  FF="$(python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())' 2>/dev/null || true)"
fi
[ -n "$FF" ] || { echo "Cần ffmpeg: pip install imageio-ffmpeg"; exit 1; }

echo "== Thông số =="
"$FF" -hide_banner -i "$VIDEO" 2>&1 | grep -E "Duration|Stream" | sed 's/^ *//' || true

echo "== Tấm ghép khung hình (1 khung / 2 giây, 20 khung / tấm) =="
"$FF" -v error -y -i "$VIDEO" -vf "fps=1/2,scale=384:-1,tile=5x4:padding=4:color=white" "$OUT/tam_%02d.png"
ls "$OUT"/tam_*.png

echo "== Điểm cắt cảnh (giây) =="
"$FF" -i "$VIDEO" -vf "select='gt(scene,0.25)',showinfo" -an -f null - 2>&1 \
  | grep -o 'pts_time:[0-9.]*' | cut -d: -f2 | tee "$OUT/diem_cat.txt" | tr '\n' ' ' || true; echo
python3 -I - "$OUT/diem_cat.txt" <<'PY'
import sys, statistics as st
t=[float(x) for x in open(sys.argv[1]) if x.strip()]
d=[b-a for a,b in zip(t,t[1:]) if b-a>0.3]
if d: print(f"Số điểm cắt: {len(t)} · trung vị độ dài cảnh: {st.median(d):.2f}s · ngắn nhất {min(d):.2f}s · dài nhất {max(d):.2f}s")
PY

echo "== Độ to âm thanh =="
"$FF" -hide_banner -i "$VIDEO" -af ebur128 -f null - 2>&1 | grep -A1 "Integrated loudness" | tail -1 | sed 's/^ *//' || true

if [ "$PHIEN_AM" = "--phien-am" ]; then
  echo "== Phiên âm lời dẫn =="
  "$FF" -v error -y -i "$VIDEO" -ac 1 -ar 16000 "$OUT/am_thanh.wav"
  python3 -I "$(dirname "$0")/phien_am.py" "$OUT/am_thanh.wav" | tee "$OUT/loi_dan.txt"
fi
echo "Xong. Xem các tấm ghép trong $OUT để mô tả cảnh."
