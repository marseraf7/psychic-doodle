# Việc cho Laplace: kiểm tổng các đợt 0–3 trên máy thật (27/11/2026)

Minh chuyển hướng dẫn này cho Laplace và nhận báo cáo về. Laplace chỉ **kiểm và báo cáo**; Claude sửa code theo báo cáo.
Bản này là **mục lục + thứ tự kiểm**. Phần nào đã có hướng dẫn riêng thì làm theo bản riêng. Các mục chưa bản riêng nào
phủ được viết đủ ở mục 3.

## 1. Quy tắc chung

- Không gửi mật khẩu, token, khoá bí mật, số điện thoại, mã xác minh, email trong báo cáo hay ảnh chụp (che trước khi gửi).
  Không xin Minh token / khoá.
- Dùng tài khoản thử. Không dùng tài khoản quản trị viên của Minh, trừ mục 3.4 (Minh đăng nhập giúp).
- Mỗi điều ghi kết quả thật quan sát được. Không chắc thì ghi **[CHƯA CHẮC]**. Ghi giờ cho mỗi lỗi (để Claude đối chiếu log
  máy chủ), kèm máy, hệ điều hành, trình duyệt / app và phiên bản.
- Lỗi giao diện: chụp ảnh, ghi chiều rộng màn hình. Chuẩn: chữ bị cắt phải có "…", nút không đè chữ, thanh dính không
  che ô nhập, không lộ chuỗi mẫu kiểu `{x}`.
- Phiên bản game: tab **Xem thêm** → **Cài đặt**, dòng số phiên bản ở cuối (ghi vào đầu báo cáo).

## 2. Thứ tự kiểm và hướng dẫn riêng

| # | Việc | Điều kiện (Minh làm trước) | Hướng dẫn |
|---|---|---|---|
| 1 | Bản cổng itch.io / CrazyGames (mục 3.1 dưới đây + QA Tool) | Minh tải gói lên itch.io (chế độ nháp) / CrazyGames | `docs/crazygames-nop-basic-launch.md` mục 9 + mục 3.1 |
| 2 | Telegram / VK Mini App: mở, chơi, đăng nhập có chữ ký | Bot Telegram + app VK, token / khoá đã nạp vào máy chủ | `docs/laplace-kiem-dang-nhap-mini-app-26-11-2026.md` |
| 3 | Discord Activity | App Discord + `DISCORD_CLIENT_ID` trên máy chủ | `docs/discord-activity.md` mục 5 |
| 4 | Xuất video trên điện thoại | – | `docs/laplace-kiem-video-dien-thoai-25-11-2026.md` |
| 5 | Giải tuần (mục 3.2) | Máy chủ đã cập nhật bản mới | mục 3.2 |
| 6 | Link chia sẻ trong Zalo / Messenger + bảng Nguồn người chơi (mục 3.3, 3.4) | – | mục 3.3, 3.4 |
| 7 | Bốn ngôn ngữ mới ja / ko / cs / zh-Hant ở 390px (mục 3.5) | – | mục 3.5 |
| 8 | App Android (Capacitor) trên máy thật (mục 3.6) | Minh gửi file APK từ CI (artifact của workflow "App Caro") | mục 3.6 |
| 9 | Đổi tên miền | Chỉ sau khi Minh mua tên miền và chuyển theo `docs/doi-ten-mien.md` | mục 3.7 |

Chưa có điều kiện của dòng nào thì bỏ qua dòng đó và ghi "chưa kiểm – thiếu <điều kiện>".

## 3. Các mục chưa có hướng dẫn riêng

### 3.1 Bản cổng (itch.io và CrazyGames)

Mở bản xem trước trên máy tính (Chrome) và điện thoại (Chrome Android, Safari iPhone):

1. Vào là chơi khách, mặc định tiếng Anh. Không có nút Đăng nhập / Đăng ký / Google ở bất kỳ tab nào.
2. Tab **More** (Xem thêm), thẻ tài khoản trên cùng: có tên khách, **không có nút "Rename" (Đổi tên)** (Minh chốt 27/11/2026).
3. Không có link ra trang ngoài (trang chính, mạng xã hội, cửa hàng ứng dụng). Bấm thử mọi chỗ trông giống link.
4. Online → tạo phòng: hộp thông tin phòng có link mời **chỉ để sao chép** (bấm sao chép → dán vào ô ghi chú để kiểm).
5. Chat: không có ô gõ chữ tự do, chỉ có câu chat nhanh / biểu cảm có sẵn.
6. Không có nút **Xuất video**.
7. itch.io: thử cả chế độ toàn màn hình (nút phóng to của itch). Bàn cờ có bị cắt, có cuộn được không.

### 3.2 Giải tuần

Giải mặc định: Chủ nhật 20:00 giờ Việt Nam, Arena 60 phút, đồng hồ 3+2 (chi tiết: `docs/giai-tuan.md`).

1. Trang chủ có thẻ **Giải tuần**: tên, giờ bắt đầu **theo giờ máy của bạn**, đếm ngược, số người đã đăng ký. Đổi múi giờ
   máy sang Moscow rồi Tokyo, mở lại: giờ phải đổi theo. Ghi giờ hiện ra ở từng múi.
2. Bấm **Đăng ký** bằng tài khoản thử. Rút đăng ký được không, rồi đăng ký lại.
3. ~30 phút trước giờ đấu: chuông thông báo có dòng "… sắp bắt đầu" không.
4. Khi giải chạy: ít nhất hai người thử vào giải, được ghép ván liên tục, bảng điểm cập nhật sau mỗi ván.
5. Điện thoại khoá màn hình 1 phút giữa giải rồi mở lại: còn trong giải không, có bị xử thua oan không.
6. Sau giải: thẻ ở Trang chủ ghi "Tuần trước (#N): vô địch …"; nút **Chia sẻ kết quả** gửi vào Zalo / Messenger có ô xem trước;
   hồ sơ người hạng 1–3 có danh hiệu.

### 3.3 Link chia sẻ trong Zalo và Messenger

1. Trong game: chia sẻ một ván đã chơi, một câu đố, một phòng (nút chia sẻ) → gửi vào Zalo và Messenger (chat với chính mình).
2. Ghi: ô xem trước có ảnh + tiêu đề + mô tả đúng không (chụp ảnh ô xem trước).
3. Bấm link trong Zalo, trong Messenger (trình duyệt trong app): mở đúng ván / câu đố / phòng không; chơi tiếp được không.
4. Mở link khi **chưa** đăng nhập và khi đã đăng nhập: kết quả có khác không.

### 3.4 Bảng Nguồn người chơi (cần Minh đăng nhập quản trị viên trên máy thử)

1. Mở link game có đuôi `?ref=laplace_test` trên một trình duyệt **ẩn danh** (mã giới thiệu chỉ ghi ở lần mở đầu trên một
   máy) và chơi một ván Online (ghép trận nhanh hoặc phòng với người thử khác; ván với máy không tính vào cột số ván).
2. Trên máy của Minh: tab Xem thêm → hàng **Nguồn người chơi**. Dòng nguồn `web` có thêm 1 người mới không; danh sách mã
   giới thiệu có `laplace_test` không. Ghi số liệu thấy được (chụp ảnh).

### 3.5 Bốn ngôn ngữ mới (ja, ko, cs, zh-Hant) ở màn hình hẹp

Điện thoại thật hoặc Chrome chế độ thiết bị, chiều rộng **390px**. Mỗi ngôn ngữ (Cài đặt → Ngôn ngữ):

1. Đi qua các tab: Trang chủ, Chơi với máy (chọn đối thủ, vào ván), Câu đố, Online (phòng chờ, tạo phòng), Giải đấu, Xem thêm, Cài đặt.
2. Ghi mọi chỗ: chữ tràn khung, bị cắt mà không có "…", nút đè chữ, chữ còn tiếng Anh / tiếng Việt lẫn vào.
3. Chữ Hán: zh-Hant (phồn thể) không được lẫn chữ giản thể. Dấu ba chấm tiếng Trung là **một ký tự "…"**, không phải "……".
4. Laplace không cần soát ngữ pháp. Nếu quen người bản ngữ thì nhờ họ đọc lướt Trang chủ + Cài đặt và ghi lại nhận xét
   nguyên văn.

### 3.6 App Android trên máy thật

1. Cài APK, mở lần đầu: thời gian tới Trang chủ. Chơi 1 ván với máy, 1 câu đố, vào Online.
2. Nút Back của máy: đóng hộp thoại / về tab trước, không thoát app đột ngột.
3. Chia sẻ (nút chia sẻ ván): hiện bảng chia sẻ của Android. Đăng nhập Google (nếu có nút): dùng tài khoản trên máy.
4. Thoát app ra màn hình chính 5 phút, mở lại: còn đúng chỗ cũ, Online tự kết nối lại.
5. **Không cần** cố tái hiện lỗi "Play Services kéo app chết". Lỗi này đã tìm ra gốc và xử lý trong CI (27/11/2026): nó chỉ
   xảy ra nếu Play Services tự khởi động lại đúng ~20 giây đầu sau khi mở app. Nếu thấy app tự tắt khi vừa mở thì ghi giờ,
   máy, phiên bản Android và báo ngay.

### 3.7 Đổi tên miền (chỉ sau khi Minh đã chuyển)

1. Mở tên miền **cũ** trên trình duyệt đã từng chơi (có tài khoản / tiến độ): phải được chuyển sang tên miền mới, **vẫn
   đăng nhập**, còn tiến độ câu đố.
2. Mở link cũ đã gửi trong Zalo trước đó: vẫn mở đúng nội dung ở tên miền mới.
3. App đã cài từ màn hình chính (PWA) bằng tên miền cũ: mở lên có báo / tự chuyển không. Ghi nguyên văn.

## 4. Mẫu báo cáo

Đầu báo cáo: ngày kiểm, phiên bản game, danh sách máy (máy, hệ điều hành, trình duyệt / app + phiên bản).

Mỗi mục trong bảng ở mục 2 một bảng:

| Bước | Máy | Kết quả (ĐẠT / LỖI / CHƯA KIỂM) | Ghi chú, giờ, ảnh |
|---|---|---|---|
| 3.1-2 | iPhone 13, Safari | ĐẠT | – |

Cuối báo cáo:
- **Lỗi chặn chơi** (không chơi được, mất dữ liệu, không đăng nhập được): liệt kê riêng, ưu tiên cao nhất.
- **Lỗi giao diện**: theo ngôn ngữ / màn hình.
- **Chưa kiểm được** và lý do (thiếu điều kiện gì).
