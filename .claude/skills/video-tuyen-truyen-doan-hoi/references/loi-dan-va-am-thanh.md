# Lời dẫn và âm thanh

## Viết lời dẫn

- **Độ dài:** số âm tiết ≈ số giây × 3,7. Một video 2 phút có khoảng 440 âm tiết lời dẫn (mỗi chữ tiếng Việt là một âm tiết).
- **Cấu trúc 7 bước:** bối cảnh → chủ thể → trích văn bản → mục tiêu → chỉ tiêu → giải pháp → kết. Xem `phan-tich-video-mau.md`.
- **Giọng văn:** trang trọng, câu dài nhiều vế, giàu cụm từ chính luận ("bồi đắp niềm tin", "khát vọng cống hiến", "lan tỏa"). Kết bằng câu đối xứng, nhịp 2–4 vế.
- **Trích dẫn:** tên văn bản, mục tiêu, chỉ tiêu phải đọc **nguyên văn** từ văn bản gốc. Không làm tròn hay đổi con số.
- **Viết để đọc:** viết số bằng chữ khi dễ đọc sai (XIV → "mười bốn"). Viết đầy đủ chữ viết tắt lần đầu ("Đoàn Thanh niên Cộng sản Hồ Chí Minh").
- **Tách câu theo cảnh:** mỗi dòng trong bảng phân cảnh ứng với một câu hoặc vế lời dẫn. Cảnh đồ họa kéo dài đúng bằng câu tương ứng.

## Giọng đọc

| Cách | Khi nào dùng |
|---|---|
| Người đọc thật (phát thanh viên, đoàn viên giọng tốt) | Sản phẩm chính thức. Thu ở phòng yên tĩnh, file WAV 48 kHz |
| TTS thương mại (Vbee, FPT.AI, Viettel AI, Zalo AI, ElevenLabs) | Bản chính thức khi không có người đọc. Chọn giọng nữ miền Bắc, tốc độ 1.0 |
| TTS mã nguồn mở (VieNeu-TTS, viXTTS) | Bản nháp để canh nhịp. Không clone giọng người thật khi chưa được đồng ý |

Sau khi có file giọng đọc:
1. Đặt file vào `public/loi-dan.mp3` và khai báo `"loiDan": "loi-dan.mp3"` trong `meta`.
2. Lấy mốc thời gian từng câu bằng `scripts/phien_am.py public/loi-dan.mp3`.
3. Chỉnh trường `giay` của các cảnh sao cho tổng thời lượng từng nhóm cảnh khớp với câu tương ứng. Nhóm montage có thể lệch ±0,3 giây; cảnh số liệu nên bắt đầu đúng lúc giọng đọc nói con số.

## Nhạc nền

- Chọn nhạc hùng tráng, cao trào (orchestral hoặc epic có trống). Chỉ dùng nhạc có giấy phép rõ ràng: thư viện miễn phí bản quyền (YouTube Audio Library, Pixabay Music) hoặc nhạc đã mua.
- `amLuongNhac`: 0,15–0,22 khi có lời dẫn. Có thể để 0,6 cho bản không lời.
- Muốn nhạc to ở mở đầu và kết, nhỏ khi có lời: thay `volume` cố định trong `Video.tsx` bằng một hàm theo khung hình, ví dụ `volume={(f) => interpolate(f, [0, 150, 180], [0.6, 0.6, 0.18], { extrapolateRight: "clamp" })}`.

## Chuẩn hóa độ to sau khi render

Video mẫu ở mức −15 LUFS. Chuẩn hóa về −14 đến −16 LUFS:
```bash
ffmpeg -i out/video.mp4 -c:v copy -af loudnorm=I=-15:TP=-1.5:LRA=11 out/video-chuan.mp4
```
