# Việc cho Laplace: kiểm "Đăng nhập bằng Telegram / VK" trong Mini App (26/11/2026)

Minh chuyển hướng dẫn này cho Laplace và nhận báo cáo về. Chỉ **kiểm và báo cáo**; Claude sửa code theo báo cáo.

## Bối cảnh

Game Caro x Gomoku chạy làm **Mini App** trong Telegram và VK (cách mở: `docs/huong-dan-cong-game-mini-app-22-11-2026.md`
mục 2, 3). Đợt 3 thêm **đăng nhập bằng dữ liệu khởi chạy có chữ ký**: máy chủ kiểm chữ ký Telegram / VK gửi kèm, rồi:

- **Khách chưa liên kết** → thẻ tài khoản (tab **Xem thêm**, trên cùng) có nút **"Lưu tiến độ bằng Telegram"** (hoặc VK). Bấm
  → tạo tài khoản mới không mật khẩu (tên đăng nhập dạng `tg_xxxxxxxx` / `vk_xxxxxxxx`), tiến độ khách (giải đố, chuỗi ngày…)
  mang sang.
- **Đã liên kết** → mở Mini App là **tự vào đúng tài khoản**, không phải bấm gì (kể cả máy khác, kể cả đã xoá dữ liệu).
- **Đang đăng nhập tài khoản Caro có mật khẩu** → nút **"Liên kết Telegram"** → hộp hỏi "Liên kết … với tài khoản @…?" → Đồng ý.
- **Huỷ liên kết**: Xem thêm → Tài khoản (⚙) → mục **"Telegram và VK"** → Huỷ liên kết. Tài khoản chỉ có Telegram / VK (chưa
  đặt mật khẩu): hộp cảnh báo rõ "là cách đăng nhập duy nhất…".
- Tài khoản **quản trị viên** cố ý **không** đăng nhập / liên kết được bằng Telegram / VK.

Điều kiện: Minh đã nạp token bot / khoá VK vào máy chủ (hướng dẫn mục 4). Chưa nạp thì không có nút nào – ghi đúng như vậy.

## Quy tắc

- Dùng tài khoản Telegram / VK **thử** nếu có; không gửi token, khoá bí mật, mật khẩu, số điện thoại, mã xác minh trong báo cáo
  hay ảnh chụp (che trước khi gửi). Không cần và không được xin Minh token / khoá.
- Không dùng tài khoản quản trị viên của Minh để thử liên kết (trừ bước 9, chỉ để xem bị chặn).
- Mỗi điều ghi kết quả thật quan sát được; không chắc thì ghi **[CHƯA CHẮC]**. Ghi giờ (để Claude đối chiếu log máy chủ).

## Máy và nơi mở cần kiểm (tối thiểu dòng 1, 2, 4, 5)

| # | Nền tảng | Máy / nơi mở |
|---|---|---|
| 1 | Telegram | Android – app Telegram |
| 2 | Telegram | iPhone – app Telegram |
| 3 | Telegram | Telegram Desktop (Windows / Mac) |
| 4 | Telegram | web.telegram.org (Chrome máy tính) |
| 5 | VK | vk.com bản máy tính (Chrome) |
| 6 | VK | app VK Android hoặc iPhone |
| 7 | VK | m.vk.com (trình duyệt điện thoại) |

## Việc cần làm (mỗi dòng trong bảng trên)

1. **Mở lần đầu, chưa từng liên kết**: mở Mini App (Telegram: `https://t.me/<bot>/play`; VK: `https://vk.com/app<id>`).
   Vào tab **Xem thêm**. Ghi: có nút "Lưu tiến độ bằng Telegram / VK" không, có thông báo lỗi nào không. Chụp ảnh.
2. **Tạo tài khoản bằng nút**: trước đó giải 2–3 câu đố (tab Câu đố) với tư cách khách. Bấm nút. Ghi: có báo "Đăng nhập
   thành công" không; tên hiển thị là gì (Telegram: tên của bạn; VK: tên VK hoặc tên khách đã tự đặt); tên đăng nhập dạng
   `@tg_…` / `@vk_…`; số câu đố đã giải còn không (tab Câu đố).
3. **Đóng Mini App rồi mở lại**: có tự vào tài khoản vừa tạo không (không bấm gì). Ghi thời gian từ lúc mở tới khi thấy tên.
4. **Xoá dữ liệu rồi mở lại**: Telegram Android: Cài đặt → Dữ liệu và bộ nhớ → Xoá bộ nhớ đệm (hoặc gỡ / cài lại app);
   iPhone: gỡ / cài lại app hoặc dùng máy khác cùng tài khoản Telegram; Desktop / web: Đăng xuất Telegram rồi đăng nhập lại, hoặc
   mở ở trình duyệt khác. VK: mở ở trình duyệt khác / chế độ ẩn danh. Mở Mini App: **phải vào đúng tài khoản cũ** (cùng
   `@tg_…`, cùng số câu đố). Đây là bước quan trọng nhất.
5. **Đăng xuất trong Mini App** (Xem thêm → Đăng xuất): phải về khách và **không** tự vào lại ngay. Đóng Mini App, mở lại: tự
   vào lại tài khoản (đúng thiết kế – mỗi lần mở mới là phiên mới).
6. **Liên kết tài khoản Caro có sẵn**: dùng một tài khoản Telegram / VK khác chưa liên kết (hoặc nhờ người thứ hai). Trong
   Mini App bấm "Đăng nhập" bằng tài khoản Caro có mật khẩu (tạo trước trên web nếu chưa có). Thẻ tài khoản có nút
   "Liên kết Telegram / VK" → bấm → hộp hỏi có đúng tên tài khoản `@…` không → Đồng ý. Đóng Mini App, xoá dữ liệu (bước 4),
   mở lại: tự vào tài khoản Caro đó.
7. **Huỷ liên kết (tài khoản có mật khẩu)**: Tài khoản (⚙) → mục "Telegram và VK" → Huỷ liên kết → Đồng ý. Mục biến mất. Đóng,
   mở lại Mini App (sau khi đăng xuất): không tự vào nữa, thấy lại nút "Lưu tiến độ…".
8. **Huỷ liên kết (tài khoản chỉ có Telegram – tạo ở bước 2)**: mục có dòng nhắc đặt mật khẩu; bấm Huỷ liên kết → hộp cảnh báo
   "… là cách đăng nhập duy nhất…" → bấm **Huỷ** (giữ nguyên). Chụp ảnh hộp cảnh báo. Sau đó thử đặt mật khẩu ở trên rồi huỷ
   liên kết: hộp hỏi thường.
9. **Tài khoản quản trị** (chỉ nếu Minh cho, dòng 1 hoặc 5): đăng nhập tài khoản quản trị trong Mini App → không có nút
   "Liên kết …". Ghi đúng như thấy.
10. **Xoá tài khoản** tạo ở bước 2 (Tài khoản → Xoá tài khoản → gõ lại tên đăng nhập): đóng, mở lại Mini App → là khách, có nút
    "Lưu tiến độ…" (liên kết đã bị xoá cùng tài khoản).
11. **Để Mini App mở lâu**: mở, để yên > 30 phút (hoặc khoá màn hình), quay lại: vẫn đăng nhập, chơi online được.
12. **Giao diện**: đổi ngôn ngữ (English, Русский): nút / hộp hỏi không bị cắt chữ, không đè nhau ở màn hẹp. Chụp ảnh.
13. VK: sau khi mở, nhìn địa chỉ trang (nếu xem được – vk.com bản máy tính: chuột phải khung game → "Sao chép địa chỉ khung" /
    công cụ nhà phát triển): địa chỉ **không còn** `sign=`. Không xem được thì ghi [KHÔNG XEM ĐƯỢC].

## Mẫu báo cáo (mỗi dòng máy một bảng)

```
Nền tảng: Telegram / VK   Máy: ______ (hãng, đời, hệ điều hành + phiên bản)   Nơi mở: ______ (bản app / trình duyệt)
Ngày giờ bắt đầu: __/__/2026 __:__
| Bước | Kết quả (Đạt / Không đạt / Không làm được) | Ghi chú, nguyên văn thông báo, ảnh |
|---|---|---|
| 1 Mở lần đầu – có nút Lưu tiến độ | | |
| 2 Tạo tài khoản – tên, @tg_…, câu đố còn | | |
| 3 Đóng / mở lại – tự vào (… giây) | | |
| 4 Xoá dữ liệu / máy khác – vào đúng tài khoản cũ | | |
| 5 Đăng xuất – không tự vào lại ngay | | |
| 6 Liên kết tài khoản Caro có sẵn | | |
| 7 Huỷ liên kết (có mật khẩu) | | |
| 8 Huỷ liên kết (chỉ Telegram) – hộp cảnh báo | | |
| 9 Tài khoản quản trị – không có nút | | |
| 10 Xoá tài khoản – liên kết mất | | |
| 11 Mở lâu > 30 phút | | |
| 12 Giao diện EN / RU | | |
| 13 VK: địa chỉ không còn sign= | | |
Lỗi lạ / thông báo khác (nguyên văn + giờ): ______
```

Gửi kèm ảnh chụp các bước 1, 2, 4, 8, 12. Thấy thông báo "Không xác minh được dữ liệu đăng nhập" thì ghi giờ và máy – Claude đối
chiếu log máy chủ (log không ghi dữ liệu của người chơi, chỉ ghi có một lần từ chối).
