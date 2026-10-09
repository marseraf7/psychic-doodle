# Bot Telegram "Siêu Thị AI"

Bot bán tài khoản / dịch vụ AI (ChatGPT, Claude, Gemini, Canva, CapCut...) với **giao hàng tự động**.

## Bảng giá tự động từ Google Sheet

Bot đọc bảng giá tại `SHEET_URL` (file `.env`) **mỗi 60 phút** (`SYNC_MINUTES`) và **cộng thêm 20.000đ** (`PRICE_MARKUP`) vào giá mỗi sản phẩm.

- Cột A: tên sản phẩm · Cột B: giá (`44k`, `1299k`, `150.000`...) · Cột C: ghi `HẾT HÀNG` thì bot tạm ngừng bán sản phẩm đó.
  Các dòng không có giá (tiêu đề, quảng cáo) được bỏ qua.
- Sản phẩm mới trong sheet → tự thêm; đổi tên/giá → tự cập nhật; xoá khỏi sheet → tự ngừng bán.
- Sản phẩm tự xếp vào danh mục theo tên: API Token AI, AI Chat & Lập trình, AI Ảnh/Video/Giọng nói, Thiết kế,
  VPN & Proxy, Giải trí, Học tập & Làm việc, MMO & Marketing (sửa quy tắc trong `sheet_sync.py`).
- Sheet phải bật chia sẻ **"Bất kỳ ai có đường liên kết đều có thể xem"**. Nếu không đọc được, bot giữ nguyên giá cũ và báo admin.
- `/capnhat` để cập nhật ngay. Lưu ý: `/giasp` với sản phẩm từ sheet sẽ bị ghi đè ở lần cập nhật sau — hãy sửa giá trên sheet.
  `/ansp` thì vẫn giữ ẩn dù sheet cập nhật.

**Giao hàng cho sản phẩm từ sheet:** khách trả tiền bằng số dư → bot báo admin "🔔 ĐƠN CẦN GIAO". Admin giao bằng:
```
/giao 12
email@gmail.com|matkhau
```
Bot gửi ngay cho khách. Nếu không giao được: `/huydon 12` (hoàn tiền tự động). `/donchua` xem các đơn đang chờ.
Nếu bạn `/themkho` cho một sản phẩm thì sản phẩm đó được giao tự động từ kho trước.

## Tính năng

**Khách hàng** (menu nút bấm):
- 🛒 **Sản phẩm** — xem theo danh mục, giá, số lượng còn trong kho; mua 1/2/3/5/10 cái
- 💰 **Nạp tiền** — chọn số tiền, bot gửi **mã QR VietQR** kèm nội dung chuyển khoản (`SAI<số phiếu>`); khách bấm "Tôi đã chuyển khoản" để báo admin
- ⚡ **Giao hàng tự động** — mua xong bot trừ số dư và gửi ngay tài khoản trong kho (dài quá thì gửi file .txt)
- 📦 **Đơn hàng** — xem lại 10 đơn gần nhất và nội dung đã mua
- 👤 **Tài khoản** — ID, số dư, số đơn
- 🎁 **Giới thiệu** — link mời riêng, nhận % hoa hồng mỗi lần bạn bè nạp tiền
- 📞 **Hỗ trợ** — nút nhắn thẳng tới tài khoản hỗ trợ

**Admin** (gõ `/admin` để xem):

| Lệnh | Ý nghĩa |
|---|---|
| `/dssp` | Danh sách danh mục, sản phẩm, ID, tồn kho |
| `/themdm 🤖 ChatGPT` | Thêm danh mục |
| `/themsp 1 \| ChatGPT Plus 1 tháng \| 120k \| Mô tả...` | Thêm sản phẩm vào danh mục 1 |
| `/giasp 3 150000` | Đổi giá sản phẩm 3 |
| `/ansp 3` / `/hiensp 3` | Ẩn / hiện sản phẩm |
| `/themkho 3` + xuống dòng, mỗi dòng 1 tài khoản | Nhập hàng vào kho |
| `/khach <id>` | Xem thông tin khách |
| `/congtien <id> 50000` | Cộng tiền (số âm để trừ) |
| `/ban <id>` / `/unban <id>` | Chặn / bỏ chặn khách |
| `/capnhat` | Cập nhật giá từ Google Sheet ngay |
| `/donchua` | Đơn đang chờ giao |
| `/giao <mã đơn>` + xuống dòng nội dung | Giao đơn cho khách |
| `/huydon <mã đơn>` | Huỷ đơn chờ giao, hoàn tiền |
| `/thongke` | Doanh thu, tổng nạp, phiếu chờ duyệt |
| `/thongbao <nội dung>` | Gửi thông báo cho toàn bộ khách |

Yêu cầu nạp tiền gửi tới admin kèm nút **✅ Duyệt / ❌ Huỷ** — bấm Duyệt là tiền được cộng ngay
(mỗi phiếu chỉ duyệt được 1 lần, hoa hồng giới thiệu tự cộng cho người mời).

Ví dụ nhập kho:
```
/themkho 1
email1@gmail.com|matkhau1
email2@gmail.com|matkhau2
```

## Cài đặt & chạy

1. Tạo bot với [@BotFather](https://t.me/BotFather) → `/newbot` → lấy **token**.
   Đặt ảnh đại diện (logo Siêu Thị AI) bằng `/setuserpic`, mô tả bằng `/setdescription`.
2. Lấy ID Telegram của bạn qua [@userinfobot](https://t.me/userinfobot).
3. Cài Python 3.10+, rồi trong thư mục `telegram_bot`:
   ```bash
   pip install -r requirements.txt
   cp .env.example .env      # Windows: copy .env.example .env
   ```
4. Mở `.env`, điền `BOT_TOKEN`, `ADMIN_IDS`, thông tin ngân hàng (`BANK_ID` theo mã VietQR: MB, VCB, TCB, ACB, BIDV, ICB...).
5. Chạy: `python bot.py` (Windows có thể bấm đúp `chay_bot.bat`).

Khi có `SHEET_URL`, sản phẩm được lấy từ sheet ngay lúc bot khởi động. Dữ liệu lưu trong `data/shop.db` (SQLite) — nhớ sao lưu file này.

Để bot chạy 24/7, đặt trên VPS và chạy bằng `systemd`, `pm2` hoặc `screen`/`tmux`.
