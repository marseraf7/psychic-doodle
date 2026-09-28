# Máy chủ Cờ Caro online

Một tiến trình Node.js duy nhất vừa phục vụ giao diện game (thư mục `caro/`) vừa xử lý
chơi online qua WebSocket (`/ws`):

- **Phòng chơi**: mã 6 số + mật khẩu 3 số, người tạo chọn đi trước/đi sau, gửi link mời
  (`https://…/?room=123456`) – người vào vẫn phải nhập mật khẩu. **Tái đấu** cần cả hai bấm,
  mỗi ván tái đấu tự đổi bên đi trước.
- **Thách đấu bạn bè**: Bo1 / Bo3 / Bo5, ván đầu: mình đi trước / bạn đi trước / ngẫu nhiên;
  các ván sau tự đổi bên, ai thắng trước 1/2/3 ván thắng chung cuộc.
- **Tài khoản**: đăng ký tên đăng nhập + mật khẩu (mã hoá scrypt), hoặc đăng nhập /
  liên kết **Google**. Không có tài khoản vẫn chơi phòng được với tư cách khách.
- **Bạn bè & trạng thái**: kết bạn bằng tên đăng nhập (hoặc ngay trong phòng),
  xem bạn bè Online / Đang chơi / Offline theo thời gian thực.
- Máy chủ kiểm tra mọi nước đi bằng chính `caro/rules.js` (không gian lận được từ client).
- Mất mạng giữa ván: tự kết nối lại và vào lại phòng; mất kết nối quá 90 giây → xử thua.
  Rời phòng khi đang đánh → xử thua. Giới hạn số lần nhập sai mật khẩu/đăng nhập.

## Chạy thử trên máy

```bash
cd server
npm install
npm start            # mở http://localhost:8080
npm test             # kiểm thử tự động (2 người chơi giả lập qua WebSocket)
```

Biến môi trường:

| Biến | Ý nghĩa |
|---|---|
| `PORT` | Cổng (mặc định `8080`) |
| `DATA_DIR` | Nơi lưu tài khoản `db.json` (mặc định `server/data`) – nhớ sao lưu |
| `GOOGLE_CLIENT_ID` | Bật nút "Đăng nhập bằng Google" (bỏ trống thì nút bị ẩn) |
| `TRUST_PROXY=1` | Khi chạy sau nginx/Caddy, để lấy đúng IP người chơi |

## Đưa lên mạng (để người ở Việt Nam và Nga đều vào được)

GitHub Pages chỉ phục vụ file tĩnh nên **không chạy được phần online** – cần một máy chủ
chạy Node.js. Cách đơn giản nhất là thuê 1 VPS nhỏ (1 CPU / 512MB là đủ):

- Nên chọn VPS ở khu vực mà cả hai nước truy cập ổn định (ví dụ Singapore, Hồng Kông,
  Kazakhstan, Thổ Nhĩ Kỳ…), hoặc tách 2 máy chủ riêng cho từng nước nếu cần.
- Nên tránh các nền tảng có thể chặn người dùng theo quốc gia vì lệnh trừng phạt.
- Máy chủ không dùng dịch vụ nước ngoài nào (không Firebase, không CDN). Chỉ riêng tính năng
  Google cần truy cập `accounts.google.com` / `oauth2.googleapis.com`; nếu mạng chặn Google
  thì người chơi vẫn dùng tài khoản riêng bình thường.

### Cách 1 – Docker

```bash
docker build -f server/Dockerfile -t caro .
docker run -d --name caro --restart unless-stopped -p 8080:8080 -v caro-data:/data \
  -e GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com -e TRUST_PROXY=1 caro
```

### Cách 2 – Node trực tiếp + systemd

```bash
git clone <repo> /opt/caro && cd /opt/caro/server && npm ci --omit=dev
PORT=8080 DATA_DIR=/var/lib/caro node server.js
```

### HTTPS (bắt buộc cho điện thoại & đăng nhập Google)

Dùng [Caddy](https://caddyserver.com) – tự lấy chứng chỉ miễn phí. File `/etc/caddy/Caddyfile`:

```
caro.ten-mien-cua-ban.com {
    reverse_proxy localhost:8080
}
```

Caddy tự chuyển tiếp cả WebSocket. Nếu dùng nginx, nhớ thêm
`proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";` cho `/ws`.

### Bật đăng nhập Google

1. Vào <https://console.cloud.google.com/apis/credentials> → *Create credentials* →
   *OAuth client ID* → loại **Web application**.
2. *Authorized JavaScript origins*: thêm `https://caro.ten-mien-cua-ban.com`.
3. Đặt Client ID vào biến `GOOGLE_CLIENT_ID` rồi khởi động lại máy chủ.

### Giao diện ở nơi khác, máy chủ ở nơi khác

Nếu muốn giữ giao diện trên GitHub Pages, sửa `caro/config.js`:
`window.CARO_SERVER = 'https://caro.ten-mien-cua-ban.com';`.
Khuyên dùng cách để chính máy chủ phục vụ giao diện (link mời và Google hoạt động gọn hơn).

## Giới hạn hiện tại

- Tài khoản lưu trong 1 file JSON: phù hợp tới vài chục nghìn người dùng. Phòng chơi nằm
  trong bộ nhớ – khởi động lại máy chủ thì các ván đang đánh bị mất (tài khoản, bạn bè vẫn còn).
- Chỉ chạy 1 tiến trình (không chia tải nhiều máy).
- Chưa có quên mật khẩu qua email (tài khoản đã liên kết Google thì đăng nhập bằng Google được).
