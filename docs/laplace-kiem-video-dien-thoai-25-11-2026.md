# Việc cho Laplace: kiểm "Xuất video" trên điện thoại thật (25/11/2026)

Minh chuyển hướng dẫn này cho Laplace và nhận báo cáo về. Chỉ **kiểm và báo cáo**; Claude sửa code theo báo cáo.

## Bối cảnh

Game có nút **Xuất video** (video dọc 9:16, 1080×1920, 30 khung/giây, không tiếng) để Minh đăng TikTok / YouTube Shorts /
Facebook Reels. Có ở hai chỗ:

- Tab **Câu đố** → thẻ "Câu đố hôm nay" → **Xuất video** (video câu đố ~12–16 giây).
- Xem lại một ván (ván vừa chơi xong → Xem lại / Phân tích, hoặc Lịch sử ván) → **Chia sẻ** → **Xuất video** (video ván
  đấu, tối đa ~47 giây).

Trình duyệt dựng video bằng `MediaRecorder` theo thời gian thật (video 15 giây mất ~15 giây). Định dạng: **MP4 (H.264)** nếu
trình duyệt ghi được, không thì **WebM**. Hướng dẫn cho Minh: `video-ngan-huong-dan.md`.

## Quy tắc

- Dùng tài khoản / máy thử, **không đăng công khai** lên TikTok / YouTube / Facebook: chỉ đi tới bước xem trước trước khi
  đăng (hoặc đăng ở chế độ riêng tư / "Chỉ mình tôi" rồi xoá ngay), không gắn tên Minh hay tên game vào tài khoản thật.
- Không gửi mật khẩu, mã xác minh, số điện thoại trong báo cáo hay ảnh chụp (che trước khi gửi).
- Mỗi điều ghi kết quả thật quan sát được; không chắc thì ghi **[CHƯA CHẮC]**.

## Máy và trình duyệt cần kiểm (càng nhiều càng tốt, tối thiểu 4 dòng đầu)

| # | Máy | Trình duyệt / nơi mở |
|---|---|---|
| 1 | Android (Chrome mới nhất) | Chrome |
| 2 | iPhone (iOS 17 trở lên) | Safari |
| 3 | Android | Mở link game trong **Zalo** (trình duyệt trong Zalo) |
| 4 | iPhone hoặc Android | Mở link game trong **Messenger** (trình duyệt trong Messenger) |
| 5 | Android hoặc iPhone | App Caro cài từ file (nếu Minh có bản app Capacitor) |
| 6 | Máy tính | Chrome / Edge, Firefox, Safari (Mac) |
| 7 | Android đời cũ / máy yếu (RAM ≤ 3 GB) | Chrome |

## Việc cần làm trên mỗi máy

1. Mở game, tab **Câu đố** → **Xuất video**. Chụp ảnh hộp thoại (có ô xem trước).
2. Bấm **Bắt đầu**, giữ màn hình mở. Ghi: có thanh tiến độ không, mất bao lâu (bấm giờ), máy có nóng / giật không.
3. Khi xong: ghi dòng báo "Xong: video … giây, … MB, định dạng …" (**MP4 hay WEBM**).
4. Bấm **Tải về** (nếu có): file có về máy không, nằm ở đâu (Tệp / Thư viện ảnh / Downloads), tên file, có mở xem được không.
5. Bấm **Chia sẻ** (nếu có): bảng chia sẻ của máy có hiện **TikTok, Facebook, YouTube** không. Chọn từng cái, đi tới
   màn hình xem trước bài đăng: video có lên không, khung có bị cắt / thu nhỏ không, có báo "định dạng không hỗ trợ" không.
6. Thử bằng file đã tải: mở TikTok / YouTube (Tạo → Shorts) / Facebook (Tạo thước phim) → chọn file từ máy → tới bước xem
   trước. Ghi nền tảng nào nhận, nền tảng nào báo lỗi.
7. Lặp lại với **video ván đấu**: chơi nhanh một ván với máy (thắng hoặc thua đều được), Xem lại → Chia sẻ → Xuất video.
   Thử bật / tắt "Hiện tên người chơi" và xem ô xem trước đổi theo.
8. Thử **giữa chừng chuyển sang ứng dụng khác** rồi quay lại: công cụ có báo "Màn hình bị ẩn giữa chừng…" không; video ra
   có giật không.
9. Thử nút **Huỷ** giữa chừng.
10. Đổi ngôn ngữ game sang **English** và **Русский**, dựng lại một video câu đố: chữ trên video có bị tràn / cắt không.
11. Mở video đã tải trên máy, xem hết: thẻ kết cuối video có đọc rõ dòng "tìm: <tên miền>" không; chữ hoặc bàn cờ có bị
    nút của TikTok / Reels che (xem ở màn xem trước bài đăng) không.

## Mẫu báo cáo (mỗi máy một bảng)

```
Máy: ______ (hãng, đời, hệ điều hành + phiên bản)   Trình duyệt / nơi mở: ______ (phiên bản)
| Bước | Kết quả | Ghi chú / ảnh |
|---|---|---|
| 1. Mở hộp Xuất video | được / không | |
| 2. Dựng video câu đố | được / không – mất __ giây – máy nóng? giật? | |
| 3. Định dạng | MP4 / WEBM – __ MB | |
| 4. Tải về | được / không – lưu ở ______ – mở xem được? | |
| 5. Chia sẻ → TikTok | nhận / báo lỗi "______" / không có trong danh sách | |
| 5. Chia sẻ → Facebook Reels | nhận / báo lỗi / không có | |
| 5. Chia sẻ → YouTube Shorts | nhận / báo lỗi / không có | |
| 6. Tải file lên từ máy (TikTok / Reels / Shorts) | nhận / lỗi (từng nơi) | |
| 7. Video ván đấu + ô hiện tên | được / không | |
| 8. Chuyển app giữa chừng | có cảnh báo? video giật? | |
| 9. Huỷ | được / không | |
| 10. English / Русский | chữ tràn? | |
| 11. Thẻ kết, vùng bị che | đọc rõ tên miền? bị che chỗ nào? | |
Lỗi khác / ảnh chụp: ______
```

## Kết luận cần có cuối báo cáo

- Bảng tổng: máy / trình duyệt × (dựng được? MP4 hay WebM? TikTok / Reels / Shorts nhận?).
- Trong Zalo / Messenger: nút Tải về và Chia sẻ có chạy không; nếu không, cách nào để Minh vẫn đăng được (vd. mở bằng Chrome).
- Ưu tiên sửa: lỗi nào chặn Minh đăng video (cao), lỗi nào chỉ khó chịu (thấp).
