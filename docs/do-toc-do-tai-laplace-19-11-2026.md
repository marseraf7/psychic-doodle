# Việc cho Laplace: đo tốc độ tải trang trên máy thật (19/11/2026)

Đây là bước 2 trong lộ trình của `docs/nghien-cuu-viet-lai-rust-17-11-2026.md`. Bước 1 vừa xong: máy chủ giờ gộp ~240
file JS lẻ của trang chính thành 6 khối, và chỉ nạp chuỗi dịch của ngôn ngữ đang dùng.

Ta mới chỉ đo bằng máy giả lập (xem mục "Số đo tại máy" ở cuối). Cần số đo thật trên điện thoại, nhất là khi mở link trong
**Zalo** và **Messenger**, để biết bản gộp có nhanh hơn thật không và còn chậm ở đâu trước khi làm bước tiếp theo.

## Chuẩn bị

- Đợi bản mới lên máy chủ: mở `https://caroxo.duckdns.org/?perf=1`. Sau khoảng 2 giây, góc trên trang hiện **ô số đo**.
  Dòng đầu phải ghi `Cách nạp mã: Bản gộp`.
- Có 2 địa chỉ để so:
  - **Bản gộp** (mới): `https://caroxo.duckdns.org/?perf=1`
  - **Từng file** (cách cũ, để so): `https://caroxo.duckdns.org/?bundle=0&perf=1`
- Ô số đo có nút **Sao chép**. Trong Zalo / Messenger nút này có thể không chép được; khi đó chữ đã được chọn sẵn, hãy giữ
  tay để chép, hoặc chụp màn hình.

## Đo gì

Mỗi lần đo, chép lại toàn bộ ô số đo. Các dòng chính:
- `Lần vẽ đầu (FCP)`: lúc màn hình bắt đầu hiện chữ / hình.
- `DOMContentLoaded`: lúc mã của trang đã chạy xong, bắt đầu bấm được.
- `File JS`: số file và dung lượng tải qua mạng (0 KB nghĩa là lấy từ bộ nhớ trên máy).
- `Việc CPU dài nhất`: lần máy bận liền lâu nhất; trên 200 ms là có thể thấy giật.
- `Service worker`: "Có" nghĩa là trang được phục vụ từ bộ nhớ trên máy (lần mở lại).

### A. Lần mở đầu (chưa có gì trên máy) – quan trọng nhất

Người mới nhận link qua Zalo thường rơi vào trường hợp này.
- **Chrome Android**: mở **tab ẩn danh mới** cho mỗi lần đo; đóng hết tab ẩn danh rồi mới đo lần sau.
  - Đo xen kẽ: Bản gộp → Từng file → Bản gộp → Từng file → Bản gộp → Từng file (3 lần mỗi kiểu).
- **Safari iPhone**: dùng tab Riêng tư, làm như trên.
- **Zalo / Messenger**: gửi 2 link trên cho chính mình rồi mở từ khung chat.
  - Lần đầu tiên mở trong mỗi app mới đúng là "lần đầu". Các lần sau, ô số đo thường ghi `Service worker: Có`; khi đó
    ghi là "lần mở lại".
  - Lưu ý: khi đã có Service worker, link `?bundle=0` vẫn có thể hiện "Bản gộp" (trang lấy từ bộ nhớ). Cứ ghi đúng dòng
    `Cách nạp mã` mà ô hiện.

### B. Lần mở lại (đã từng mở)

Mở lại cùng link 3 lần trong mỗi trình duyệt / app ở trên (không ẩn danh).

### C. Cảm nhận khi dùng (không cần số)

Trên mỗi máy, chơi 10 nước với máy, mở trang Giải đấu, mở một ván xem lại. Ghi lại chỗ nào thấy giật / chờ lâu (khoảng bao
nhiêu giây).

## Máy và mạng

- Ít nhất 1 điện thoại Android tầm trung (kiểu Galaxy A, Redmi, OPPO A…; ghi tên máy) và 1 iPhone nếu có.
- Đo trên **4G** (tắt Wi-Fi) là chính; nếu có thời gian thì đo thêm một lượt Wi-Fi. Ghi số vạch sóng / nhà mạng.

## Mẫu báo cáo

Gửi lại bảng dưới đây (mỗi dòng một lần đo), kèm phần chữ chép từ ô số đo nếu được:

| Máy | Trình duyệt / app | Mạng | Lần đầu / mở lại | Cách nạp mã | FCP (ms) | DOMContentLoaded (ms) | File JS | KB | Việc CPU dài nhất (ms) |
|---|---|---|---|---|---|---|---|---|---|
| Galaxy A24 | Chrome ẩn danh | 4G Viettel | Lần đầu | Bản gộp | | | | | |

Cuối báo cáo: phần C (cảm nhận), và mọi lỗi lạ thấy được (chữ hiện mã khoá thay vì tiếng Việt, đổi ngôn ngữ không đổi,
trang trắng…).

## Số đo tại máy (để đối chiếu)

Đo bằng Playwright + Chromium, giả lập điện thoại tầm trung: CPU chậm 4 lần, mạng 9 Mbps, RTT 170 ms, máy chủ HTTP/2 có nén
như Caddy. Đây là số trong phòng thí nghiệm, không phải máy thật.

| Kiểu | FCP | DOMContentLoaded | File JS | KB qua mạng | Việc CPU dài nhất |
|---|---|---|---|---|---|
| Từng file (cũ), lần đầu | ~670 ms | ~2.340 ms | 237 | ~950 | ~80 ms |
| Bản thử gộp 1 khối + 1 ngôn ngữ, lần đầu | ~620 ms | ~1.430 ms | 1 | ~500 | ~450 ms |
| **Bản gộp thật (6 khối + 1 gói ngôn ngữ), lần đầu** | **~630 ms** | **~1.480 ms** | 12 | ~545 | ~140 ms |

Bản thật chia mã thành 6 khối để tránh một lần CPU bận quá lâu. So với cách cũ: DOMContentLoaded nhanh hơn ~37%, tải qua
mạng ít hơn ~42%, FCP như cũ. Lần CPU bận lâu nhất tăng từ ~80 lên ~140 ms nhưng vẫn dưới 200 ms.
