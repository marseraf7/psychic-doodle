# Hướng dẫn đưa game lên CrazyGames, itch.io, Telegram, VK (22/11/2026)

Việc của Minh (tài khoản, bấm nộp) và việc kiểm thật của Laplace, theo `docs/ke-hoach-tiep-can-toan-cau-21-11-2026.md`
(Đợt 1). Phần code: `server/scripts/build-portal.js`, `caro/portal*.js`, `server/src/portal-origins.js`.

## 1. Đóng gói bản cổng (CrazyGames / itch.io)

```
node server/scripts/build-portal.js crazygames --server https://<tên miền máy chủ>
node server/scripts/build-portal.js itch --server https://<tên miền máy chủ>
```

- Ra `dist/portal-<cổng>/` (thư mục tĩnh, `index.html` ở gốc, đường dẫn tương đối) và `dist/caro-<cổng>.zip` (tải file
  ZIP này lên cổng). Không có `--server` thì lấy `CARO_SERVER_URL`, rồi `PUBLIC_URL`, mặc định `https://caroxo.duckdns.org`.
- Script in số file, tổng dung lượng, phần tải ban đầu so với giới hạn của cổng; vượt giới hạn hoặc còn đường dẫn tuyệt đối
  thì báo lỗi. Đo 22/11/2026: ~400 file, ~13 MB (ZIP ~5 MB), tải ban đầu ~2,5 MB.
- Bản cổng: chơi khách mặc định, không đăng nhập / đăng ký, không link ra ngoài, không chat tự do (còn chat nhanh câu mẫu),
  không service worker, không quảng cáo, tiếng Anh mặc định (đổi được). Bản CrazyGames có SDK v3 mức Basic.

### Máy chủ

- WebSocket từ cổng đã được cho phép sẵn: `https://*.game-files.crazygames.com`, `https://html.itch.zone`,
  `https://html-classic.itch.zone`. Thấy cổng dùng tên miền khác (log máy chủ: "Chặn kết nối WebSocket vì Origin lạ: …")
  thì thêm vào biến môi trường `PORTAL_WS_ORIGINS` (cách nhau dấu phẩy; dạng `https://a.example` hoặc
  `https://*.example.com`), khởi động lại máy chủ.

### CrazyGames (Minh)

1. Đăng ký CrazyGames Developer Portal, xong khai thanh toán (Tipalti) trước khi nộp.
2. Nên hỏi support trước: "game có máy chủ multiplayer riêng qua WebSocket (wss) – có được không?".
3. Nộp game: chọn Basic Launch, tải `dist/caro-crazygames.zip`, điền tên / mô tả / hướng dẫn tiếng Anh, ảnh bìa và video bìa
   (kích thước theo biểu mẫu thật), khai PEGI 12, ghi chú cho QA: "multiplayer backend riêng, chơi khách mặc định, máy cờ
   WASM tải khi cần".
4. Kiểm trong QA Tool (Laplace): mở được, chơi trọn ván với máy, sự kiện `gameplayStart` khi vào ván, thời gian tới lúc
   chơi được ≤ 20 giây, không nút đăng nhập, online được hay không (ghi nguyên văn).

### itch.io (Minh)

1. Tạo trang game: Kind of project = HTML; tải `dist/caro-itch.zip`, tick "This file will be played in the browser".
2. Kích thước khung nhúng gợi ý 1280 × 800 (màn hẹp vẫn dùng được), bật nút Fullscreen, chọn "Click to launch".
3. Tắt thanh toán / quyên góp ở đợt đầu (Minh đã duyệt). Đăng nháp, kiểm (Laplace): chơi trọn ván với máy, online được hay
   không – ghi kết quả thật, mô tả trang khớp với kết quả.
