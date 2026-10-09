# Máy chủ Cờ Caro online

Một tiến trình Node.js duy nhất vừa phục vụ giao diện game (thư mục `caro/`) vừa xử lý
chơi online qua WebSocket (`/ws`):

- **Phòng chơi**: mã 6 số + mật khẩu 3 số, người tạo chọn đi trước/đi sau, gửi link mời
  (`https://…/?room=123456`) – người vào vẫn phải nhập mật khẩu. **Tái đấu** cần cả hai bấm,
  mỗi ván tái đấu tự đổi bên đi trước.
- **Phòng công khai**: đánh dấu khi tạo phòng → phòng hiện trong mục "Phòng đang chờ" của mọi người
  (cập nhật tức thì), vào không cần mật khẩu. Phòng đã đủ 2 người hoặc chủ phòng offline thì ẩn đi;
  người đã chặn nhau không thấy phòng của nhau.
- **Tìm trận nhanh**: chọn thời gian mỗi nước (hoặc "Bất kỳ") rồi bấm tìm; máy chủ ghép với người
  đang tìm có Elo gần nhất (lệch tối đa 150 điểm, nới thêm 25 điểm mỗi giây chờ), ngẫu nhiên ai đi trước.
  Không ghép người đã chặn nhau; khách tìm trận được nhưng ván không tính Elo. Mất kết nối, vào phòng khác
  hoặc tái đấu với đối thủ cũ thì tự thôi tìm.
- **Thách đấu bạn bè**: Bo1 / Bo3 / Bo5, ván đầu: mình đi trước / bạn đi trước / ngẫu nhiên;
  các ván sau tự đổi bên, ai thắng trước 1/2/3 ván thắng chung cuộc.
- **Tài khoản**: đăng ký tên đăng nhập + mật khẩu (mã hoá scrypt), hoặc đăng nhập /
  liên kết **Google**. Không có tài khoản vẫn chơi phòng được với tư cách khách.
- **Bạn bè & trạng thái**: kết bạn bằng tên đăng nhập (hoặc ngay trong phòng),
  xem bạn bè Online / Đang chơi / Offline theo thời gian thực.
- **Trong ván**: xin hoà (đối thủ đồng ý / từ chối, đánh tiếp coi như từ chối), chat nhanh bằng
  8 câu có sẵn (mỗi người thấy theo ngôn ngữ của mình, không có chữ tự do nên không bị spam/lăng mạ).
- **Lịch sử & xem lại**: mỗi tài khoản giữ 10 trận gần nhất; xem lại từng nước, chia sẻ link
  `https://…/?replay=<mã>` (ai có link cũng xem được, không cần tài khoản).
- **Đối đầu, Elo, bảng xếp hạng**: thành tích thắng–thua–hoà giữa hai người, điểm Elo
  (bắt đầu 1200, 20 trận đầu thay đổi nhanh hơn), top 20. Chỉ tính ván giữa hai tài khoản.
  Chống cày điểm: ván kết thúc sớm dưới 10 nước (đầu hàng, hoà, rời phòng, hết giờ…) không tính,
  mỗi cặp chỉ tính tối đa 5 ván mỗi ngày.
- **Nhắn tin bạn bè**: lưu 100 tin gần nhất mỗi cặp, báo số tin chưa đọc; **chặn** (huỷ kết bạn,
  không nhắn / thách đấu / chat nhanh được nữa) và **báo cáo** (máy chủ tự đính kèm tin nhắn gần nhất).
- **Xoá tài khoản** ngay trong game (Online → Tài khoản → Xoá tài khoản): xoá phiên đăng nhập, bạn bè,
  tin nhắn, Elo, đối đầu, email; ván đã chơi với người khác còn trong lịch sử của họ nhưng bỏ tên và id.
  Trang chính sách quyền riêng tư: `https://…/privacy.html` (4 ngôn ngữ, mục `#delete` hướng dẫn xoá tài khoản).
- **Mật khẩu**: đổi mật khẩu (đăng xuất các thiết bị khác), đặt mật khẩu cho tài khoản Google,
  thêm email và **quên mật khẩu** qua mã 6 số gửi email (cần cấu hình SMTP).
- Máy chủ kiểm tra mọi nước đi bằng chính `caro/rules.js` (không gian lận được từ client).
- Mất mạng giữa ván: tự kết nối lại và vào lại phòng; mất kết nối quá 90 giây → xử thua.
  Rời phòng khi đang đánh → xử thua. Giới hạn số lần nhập sai mật khẩu/đăng nhập.
  Đang có lời thách đấu chờ mà vào ván khác thì lời mời tự huỷ.

## Chạy thử trên máy

```bash
cd server
npm install
npm start            # mở http://localhost:8080
npm test             # kiểm thử tự động (2 người chơi giả lập qua WebSocket)
npm run coverage     # kiểm thử + đo độ phủ mã (CI báo lỗi nếu dưới 90% dòng / 80% nhánh / 85% hàm)
```

Mã máy chủ: `server.js` (HTTP + WebSocket), `src/store.js` (SQLite), `src/room.js` (một phòng chơi),
`src/hub/` – xử lý tin nhắn, chia theo chủ đề: `core.js` (kết nối, phiên, giới hạn tần suất),
`auth.js` (tài khoản, mật khẩu, email), `social.js` (bạn bè, xếp hạng, lịch sử, chặn, tin nhắn),
`rooms.js` (phòng, ván đấu, thách đấu, Elo, xin hoà), `matchmaking.js` (tìm trận nhanh, phòng công khai).
Tin nhắn loại `X` do phương thức `on_X` xử lý.

Cần **Node.js 22.13 trở lên** (dùng SQLite có sẵn trong Node, không phải cài thêm CSDL).

Biến môi trường:

| Biến | Ý nghĩa |
|---|---|
| `PORT` | Cổng (mặc định `8080`) |
| `DATA_DIR` | Thư mục chứa CSDL `caro.db` (mặc định `server/data`) – nhớ sao lưu |
| `GOOGLE_CLIENT_ID` | Bật nút "Đăng nhập bằng Google" (bỏ trống thì nút bị ẩn) |
| `SMTP_URL` | Bật "Quên mật khẩu" qua email, ví dụ `smtps://ten%40gmail.com:mat-khau-ung-dung@smtp.gmail.com:465` (bỏ trống thì tính năng bị ẩn) |
| `MIN_APP_VERSION` | Bản app điện thoại thấp nhất còn được chơi online, ví dụ `1.0.0`. App cũ hơn hiện "Cần cập nhật app" (chơi offline vẫn được). Bỏ trống = không kiểm tra. Bản web luôn mới nhất nên không bị ảnh hưởng |
| `ANDROID_UPDATE_URL`, `IOS_UPDATE_URL` | Link cửa hàng cho nút "Cập nhật app", ví dụ `https://play.google.com/store/apps/details?id=io.github.marseraf7.caro` |
| `MAIL_FROM` | Người gửi, ví dụ `"Cờ Caro <caro@ten-mien.com>"` (mặc định: tài khoản trong `SMTP_URL`) |
| `TRUST_PROXY=1` | **Chỉ bật khi chạy sau nginx/Caddy** (lấy IP người chơi từ proxy). Không có proxy mà bật thì kẻ xấu giả IP để né giới hạn thử mật khẩu |

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
PORT=8080 DATA_DIR=/var/lib/caro node --disable-warning=ExperimentalWarning server.js
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

### Bật quên mật khẩu qua email

Cần một tài khoản gửi thư SMTP. Dễ nhất là Gmail: bật xác minh 2 bước, tạo
*App password* tại <https://myaccount.google.com/apppasswords>, rồi đặt
`SMTP_URL=smtps://ten%40gmail.com:matkhau16kytu@smtp.gmail.com:465` (ký tự `@` trong tên
đăng nhập viết thành `%40`). Có thể dùng Yandex, Mail.ru, Zoho… theo cách tương tự.
Người chơi phải tự thêm email trong mục **Tài khoản** và **xác minh** bằng mã 6 số gửi tới
email đó thì mới lấy lại mật khẩu được (không xác minh thì không ai dùng được email của người khác).

### Sao lưu dữ liệu

Toàn bộ tài khoản, lịch sử, tin nhắn nằm trong `DATA_DIR/caro.db` (kèm 2 file tạm
`caro.db-wal`, `caro.db-shm` khi đang chạy). Sao lưu an toàn khi máy chủ đang chạy:

```bash
sqlite3 /var/lib/caro/caro.db ".backup '/root/caro-$(date +%F).db'"
```

Hoặc dừng máy chủ rồi chép cả thư mục. Nâng cấp từ bản cũ dùng `db.json`: lần đầu chạy
máy chủ tự nhập vào `caro.db` và đổi tên file cũ thành `db.json.imported`.

### Giao diện ở nơi khác, máy chủ ở nơi khác

Nếu muốn giữ giao diện trên GitHub Pages, sửa `caro/config.js`:
`window.CARO_SERVER = 'https://caro.ten-mien-cua-ban.com';`.
Khuyên dùng cách để chính máy chủ phục vụ giao diện (link mời và Google hoạt động gọn hơn).

## Bảo mật đã có

- Mật khẩu băm scrypt; token đăng nhập và mã đặt lại mật khẩu chỉ lưu dạng băm SHA-256.
- Quên mật khẩu: luôn trả lời giống nhau dù tài khoản có tồn tại hay không; mã 6 số hết hạn sau
  15 phút, sai 5 lần là huỷ; đặt lại xong thì đăng xuất mọi thiết bị.
- Link xem lại không chứa id tài khoản; tin nhắn tối đa 500 ký tự, 60 tin / 10 phút.
- Email phải được xác minh (mã 6 số, 30 phút, sai 5 lần phải gửi mã mới; tối đa 3 thư / 10 phút
  tới cùng một địa chỉ) mới được dùng để khôi phục mật khẩu.
- Chống dò email đã đăng ký: lưu email tối đa 10 lần / 10 phút mỗi tài khoản (30 lần / IP);
  "Quên mật khẩu" trả lời ngay, gửi thư chạy nền (thời gian trả lời không lộ tài khoản có email hay không).
- Xin hoà: đang chờ trả lời thì không báo lại cho đối thủ; bị từ chối thì 30 giây sau mới được xin lại.
- Máy chủ kiểm tra mọi nước đi; tên người chơi được lọc/escape (chống XSS).
- Header CSP, chống nhúng iframe (clickjacking), `nosniff`; chỉ cho phép GET/HEAD file tĩnh, chặn truy cập ngoài thư mục `caro/`.
- Giới hạn thử sai (mỗi 10 phút), tính theo đối tượng bị dò chứ không khoá cả IP, vì nhà mạng di động
  cho rất nhiều thuê bao dùng chung 1 IP (CGNAT):
  - Mật khẩu phòng: 8 lần/IP cho mỗi phòng, 40 lần cho mỗi phòng (mọi IP), 60 lần/IP tổng cộng.
  - Đăng nhập: 8 lần/IP cho mỗi tài khoản, 30 lần cho mỗi tài khoản (mọi IP), 100 lần/IP.
  - Tạo tài khoản: 30 tài khoản/IP.
- 200 kết nối/IP; 15 tin nhắn/giây mỗi kết nối (vượt quá bị ngắt); tin nhắn tối đa 16KB.
- Mất kết nối quá 90 giây khi ván đang diễn ra (kể cả chưa đánh nước nào, hoặc rớt mạng giữa 2 ván Bo3/Bo5)
  thì bị xử thua, không để đối thủ chờ vô hạn. Đăng xuất khi đang trong phòng thì rời phòng luôn.
- File mẫu `deploy/caro.service` chạy dưới user riêng, chỉ được ghi vào thư mục dữ liệu.

## Giới hạn hiện tại

- Dữ liệu lưu trong 1 file SQLite: thoải mái tới hàng chục nghìn người dùng trên VPS 1 CPU / 512MB.
  Phòng chơi nằm trong bộ nhớ – khởi động lại máy chủ thì các ván đang đánh bị mất
  (tài khoản, bạn bè, lịch sử vẫn còn).
- Chỉ chạy 1 tiến trình (không chia tải nhiều máy).
- Báo cáo vi phạm được lưu trong bảng `reports` của `caro.db`, chưa có trang quản trị:
  xem bằng `sqlite3 caro.db "SELECT * FROM reports ORDER BY id DESC LIMIT 20"`.
