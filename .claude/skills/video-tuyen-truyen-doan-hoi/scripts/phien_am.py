"""Phiên âm lời dẫn tiếng Việt kèm mốc thời gian và tính tốc độ đọc.

Cách dùng: python3 -I phien_am.py <am_thanh.wav> [model]
Cần: pip install faster-whisper (model tải từ Hugging Face lần đầu, mặc định "medium").
"""
import sys

from faster_whisper import WhisperModel

duong_dan = sys.argv[1]
model = sys.argv[2] if len(sys.argv) > 2 else "medium"
m = WhisperModel(model, device="cpu", compute_type="int8")
doan, _ = m.transcribe(duong_dan, language="vi", vad_filter=True, beam_size=1)

am_tiet = 0
thoi_gian = 0.0
for s in doan:
    print(f"[{s.start:6.1f}-{s.end:6.1f}] {s.text.strip()}", flush=True)
    am_tiet += len(s.text.split())
    thoi_gian += s.end - s.start
if thoi_gian:
    print(f"\n# Tốc độ đọc: {am_tiet / thoi_gian:.2f} âm tiết/giây ({am_tiet} âm tiết / {thoi_gian:.0f}s)")
