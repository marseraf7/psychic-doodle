# Bot Telegram "Siêu Thị AI"

Bot bán tài khoản / dịch vụ AI (ChatGPT, Claude, Gemini, Canva, CapCut...) với **giao hàng tự động**.

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

Lần chạy đầu bot tạo sẵn vài danh mục/sản phẩm mẫu (đặt `SEED_DEMO=0` để tắt). Sản phẩm hiện "hết hàng"
cho tới khi bạn `/themkho`. Dữ liệu lưu trong `data/shop.db` (SQLite) — nhớ sao lưu file này.

Để bot chạy 24/7, đặt trên VPS và chạy bằng `systemd`, `pm2` hoặc `screen`/`tmux`.
