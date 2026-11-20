# Xử lý rà soát bảo mật 20/11/2026

Ngày xử lý: 20/11/2026. Người làm: Claude Code.

Nguồn là hai báo cáo của Laplace: `BAO-CAO-RA-SOAT-BAO-MAT-CARO-20-11-2026.md` (rà tĩnh và thăm dò production) và
`BO-SUNG-RA-SOAT-DONG-BAO-MAT-CARO-20-11-2026.md` (rà động trên bản local, commit `65e6252`). Mỗi mục đã được đối chiếu
lại với code trước khi sửa. Chỗ nào báo cáo sai thì có ghi ở cột "Ghi chú".

## 1. Bảng trạng thái

| Mục | Nội dung | Trạng thái | Commit / lý do |
|---|---|---|---|
| **H-1** | `GET /.%00/…` làm `fs.stat` ném lỗi đồng bộ, sập cả tiến trình | **Đã sửa** | `3402169`: chặn ký tự điều khiển sau giải mã → 400, bọc `try/catch` quanh phần phục vụ file tĩnh. Cách kiểm trên production ở mục 3 |
| **S-1** (mới, tìm khi rà lại sau H-1) | `POST /api/rum` với thân `{"fcp":{"toString":1,"valueOf":1}}` khiến `Number()` ném `TypeError` trong callback `req.on('end')`. Không cần đăng nhập, một yêu cầu làm **sập cả tiến trình**, cùng loại với H-1 | **Đã sửa** | `1e5ce62`: `rum.js` chỉ nhận số hoặc chuỗi và có `try/catch`. Thêm lưới an toàn cho từng yêu cầu: `src/guard.js` bọc handler HTTP và connect / message / disconnect của WebSocket. Test `request-guard.test.js` báo đỏ khi chưa sửa |
| **L-1** | Mã 6 số đặt lại mật khẩu và xác minh email lưu bằng SHA-256 không muối | **Đã sửa** | `c23549c`: lưu HMAC-SHA256 với khoá riêng `DATA_DIR/code-key` (quyền 600). Mã SHA-256 cũ vẫn được nhận cho tới khi hết hạn (≤ 30 phút). So sánh bằng `timingSafeEqual` |
| **NV-4** | `nodemailer@10.0.12` có 5 lỗ hổng mức Moderate | **Đã sửa** | `0d2764c`: lên **10.5.0**, `npm audit` còn 0 lỗ hổng. Bản 10.6.1 ra đúng hôm nay nên chưa dùng, chờ vài ngày cho an toàn chuỗi cung ứng. CHANGELOG không có thay đổi phá vỡ. Có test gửi thư thật qua một máy chủ SMTP giả |
| **I-1** | Tên đăng nhập không tồn tại được trả lời ngay, không chạy băm, nên đo thời gian là biết tên nào đã có | **Đã sửa** | `21651f0`: vẫn chạy một lần scrypt giả cùng tham số. Lần sai vẫn được đếm trước khi băm, như cũ |
| **I-11** | CSP `connect-src` mở cả `cdn.jsdelivr.net` và `raw.githubusercontent.com` | **Đã sửa (thu hẹp, không gỡ)** | `fff980e`. Báo cáo ghi "client không gọi hai origin này" là **sai**: `caro/rapfi/worker.js` (BOAT) tải mạng NNUE từ đó khi máy chủ chưa có sẵn `rapfi/nets/`. Nay CSP chỉ mở 4 đường dẫn `…/rapfi-networks@<commit>/mix9svq/` (dùng chung với app desktop). Đã kiểm bằng Chromium thật |
| **I-4** | Mật khẩu phòng riêng chỉ có 3 số | **Đã sửa** | `91a1db5`: nâng lên 4 số. Ô nhập nhận cả 3 lẫn 4 số, hướng dẫn đủ 4 ngôn ngữ, giới hạn thử sai giữ nguyên. Phòng chỉ nằm trong bộ nhớ nên sau khi khởi động lại không còn phòng 3 số. **Lưu ý app điện thoại bản cũ** ở mục 2.4 |
| **I-7** | `update.sh` chỉ kiểm 4 byte magic khi tải mạng Rapfi | **Đã sửa** | `3a9f3e1`: thêm SHA-256 ghim cạnh commit. Đã tải lại đủ 4 file thật để tính mã băm, khớp `SPEC` của `worker.js`. File đã có sẵn trên máy chủ được kiểm một lần, sai thì tải lại. Vẫn giữ kiểm magic |
| **4.1.1** | `attHtml()` đặt URL đính kèm vào `href` mà client không kiểm scheme | **Đã sửa (phòng thủ chiều sâu)** | `2fd91af`: client chỉ tạo `<a href>` cho link http(s) theo `LINK_RE` của `rich-text.js`, còn lại hiện chữ thường. Máy chủ vốn đã chặn từ trước |
| **I-13** | HSTS không có `includeSubDomains`; chưa có `security.txt` | **Đã sửa trong repo, Minh cần áp dụng Caddy** | `d6a0c42`: thêm `includeSubDomains` vào `Caddyfile`, **không** thêm `preload`. Thêm `/.well-known/security.txt` (liên hệ qua Issues, không có email). Lệnh sửa Caddy ở mục 2.5 |
| I-2 | Phiên đăng nhập sống 180 ngày | Không sửa | Đánh đổi theo thiết kế: chỉ lưu bản băm của token, thu hồi khi đổi hoặc quên mật khẩu, có đăng xuất thiết bị từ xa |
| I-3 | Danh tính khách là khoá bearer do client tự sinh | Không sửa | Theo thiết kế. `requireUser` chặn khách khỏi mọi tính năng cần tài khoản |
| I-5 | `GET /api/rum` công khai | Không sửa | Chỉ là số gộp, không có IP, UA hay tài khoản |
| I-6 | Cả cây `caro/` được phục vụ công khai | Không sửa | Các file này vốn đã công khai trên GitHub. Ghi nhớ: file nội bộ đặt vào `caro/` sẽ công khai ngay. Riêng `/tests/` đã bị chặn |
| I-8 | `install.sh` chạy `curl … \| bash` (NodeSource) bằng root | Không sửa | Chỉ chạy một lần khi dựng máy, theo cách cài chính thức. Có thể đổi sang kho apt có ký khoá khi dựng máy mới |
| I-9 | MCP `/mcp` công khai, không đăng nhập | Không sửa | Connector công khai theo ý Minh. Đã có kiểm Origin và Host, 240 yêu cầu/phút/IP, hàng đợi máy cờ. Muốn tắt: `CARO_MCP=0` |
| I-10 | `Access-Control-Allow-Origin: *` trên các GET công khai | Không sửa | Không có cookie hay credentials, dữ liệu là công khai |
| I-12 | Bản GitHub Pages thiếu header bảo mật | Không sửa (giới hạn nền tảng) | GitHub Pages không cho đặt header. Minh quyết định bản Pages có phải kênh chính thức không |
| NV-1 | Tên trong `ADMIN_USERNAMES` chưa có tài khoản thì ai đăng ký trước sẽ thành quản trị | **Minh kiểm trên VPS** | Mục 2.1 |
| NV-2 | Tin `X-Forwarded-For` từ mọi dải IP nội bộ khi chưa đặt `TRUSTED_PROXY_CIDRS` | **Minh kiểm trên VPS** | Mục 2.2 |
| NV-3 | Quyền file thực tế của thư mục dữ liệu | **Minh kiểm trên VPS** | Mục 2.3 |
| nuclei / ZAP trên production | Laplace chưa chạy được vì sandbox chặn | Còn nợ | Nên chạy ZAP Baseline từ một máy thường **sau khi** bản vá H-1 và S-1 đã lên production |

## 2. Việc Minh làm trên VPS

Mọi lệnh dưới đây chỉ đọc, trừ những chỗ ghi rõ "sửa". Chạy qua SSH trên máy chủ.

### 2.1 NV-1: tên quản trị nào chưa có tài khoản

```bash
sudo grep '^ADMIN_USERNAMES' /etc/caro/caro.env
# Thay ten1,ten2 bằng các tên vừa thấy (chữ thường). Tên nào KHÔNG được in ra là tên chưa có tài khoản:
sudo sqlite3 -readonly /var/lib/caro/caro.db "SELECT username FROM users WHERE username IN ('ten1','ten2');"
# Hoặc xem cảnh báo lúc khởi động:
sudo journalctl -u caro --since '-30 days' | grep 'chưa có tài khoản'
```

Nếu có tên chưa có tài khoản (sửa): tự đăng ký tên đó ngay trên trang. Cách khác là bỏ tên đó khỏi `/etc/caro/caro.env`
rồi khởi động lại lúc không có ván nào đang đấu. Trước khi khởi động lại, chạy
`curl -s http://127.0.0.1:8080/api/stats` và chờ tới khi thấy `"games":0`, rồi mới chạy `sudo systemctl restart caro`.

### 2.2 NV-2: Node có lộ ra ngoài không, có tin X-Forwarded-For không

```bash
sudo ss -ltnp | grep ':8080'            # cần thấy 127.0.0.1:8080, KHÔNG phải 0.0.0.0:8080 hay *:8080
PID=$(systemctl show -p MainPID --value caro)
sudo tr '\0' '\n' < /proc/$PID/environ | grep -E '^(HOST|TRUST_PROXY|TRUSTED_PROXY_CIDRS)='
command -v docker >/dev/null && sudo docker ps --format '{{.Names}} {{.Ports}}'   # không dùng Docker thì bỏ qua
sudo ufw status | head -20               # chỉ nên mở 22, 80, 443
```

Từ một máy **khác** (máy nhà, không phải VPS), chạy `curl -m 5 http://<IP-VPS>:8080/healthz`. Lệnh phải hết giờ hoặc bị
từ chối. Nếu nó trả `ok` thì cần sửa: đặt `HOST=127.0.0.1` (có sẵn trong `caro.service` mẫu), hoặc đặt
`TRUSTED_PROXY_CIDRS=127.0.0.1` trong `/etc/caro/caro.env`, rồi khởi động lại lúc không có ván (cách chờ như mục 2.1).

### 2.3 NV-3: quyền file thư mục dữ liệu

```bash
sudo stat -c '%a %U:%G %n' /var/lib/caro /var/lib/caro/* /etc/caro/caro.env /var/backups/caro 2>/dev/null
```

Kết quả đạt yêu cầu:

- `/var/lib/caro` là `700 caro:caro`.
- `caro.db`, `caro.db-wal`, `caro.db-shm`, `eval-key`, `code-key` (file mới, máy chủ tự tạo ở lần chạy đầu sau bản này)
  và các file `*-key` khác đều là `600 caro:caro`.
- `caro.env` là `600 root:root`.

Nếu lệch (sửa):

```bash
sudo chmod 700 /var/lib/caro && sudo find /var/lib/caro -maxdepth 1 -type f -exec chmod 600 {} +
sudo chmod 600 /etc/caro/caro.env
```

`code-key` **không cần** sao lưu hay chép khi chuyển máy. Mất khoá thì chỉ các mã đang chờ (≤ 30 phút) hết hiệu lực.
Đây là lý do nó cố ý không nằm trong bản sao lưu.

### 2.4 I-4: app điện thoại bản cũ

Ô mật khẩu phòng của app 1.0.0 chỉ gõ được 3 số, nên người dùng bản app cũ không vào được phòng riêng có mật khẩu 4 số.
Họ vẫn vào được phòng công khai và lời thách đấu. Có hai cách xử lý:

- Nếu còn nhiều người dùng app cũ: thêm dòng `ROOM_PIN_DIGITS=3` vào `/etc/caro/caro.env` để tạm quay về 3 số, rồi
  khởi động lại lúc không có ván.
- Khi app bản mới (dựng từ `caro/` hiện tại) đã lên cửa hàng: đặt `MIN_APP_VERSION` theo `app/README.md` và bỏ
  `ROOM_PIN_DIGITS`.

### 2.5 I-13: áp HSTS includeSubDomains cho Caddy đang chạy

`update.sh` không chép lại `Caddyfile`, nên phải sửa tay một lần:

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak
sudo sed -i 's/Strict-Transport-Security "max-age=31536000"$/Strict-Transport-Security "max-age=31536000; includeSubDomains"/' /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && sudo systemctl reload caddy
curl -sI https://caroxo.duckdns.org/ | grep -i strict-transport   # cần thấy includeSubDomains
```

Không thêm `preload`. `duckdns.org` là tên miền dùng chung, và đã vào danh sách preload của trình duyệt thì rất khó gỡ ra.

## 3. Kiểm H-1 và S-1 đã hết trên production mà không làm sập máy chủ

Phải chắc chắn bản vá đã lên máy chủ **rồi mới** bắn thử. Nếu bắn vào bản cũ thì chính lần thử đó sẽ làm sập máy chủ.

```bash
# 1) Bản đang chạy đã có bản vá chưa (in "co-ban-va" mới làm tiếp; commit 1e5ce62 là bản vá S-1, có sau H-1):
cd /opt/caro && sudo git merge-base --is-ancestor 1e5ce62 HEAD && echo co-ban-va
# 2) Ghi lại số lần khởi động lại hiện tại:
systemctl show caro -p NRestarts
# 3) Bắn thử: cả hai lệnh cần in 400
curl -s -o /dev/null -w '%{http_code}\n' 'https://caroxo.duckdns.org/.%00/WEB-INF/web.xml'
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: text/plain' --data '{"fcp":{"toString":1,"valueOf":1}}' https://caroxo.duckdns.org/api/rum
# 4) Máy chủ vẫn sống, không khởi động lại, không có lỗi cũ trong log:
curl -s https://caroxo.duckdns.org/healthz; echo          # cần in ok
systemctl show caro -p NRestarts                          # cần đúng bằng số ở bước 2
sudo journalctl -u caro --since '-5 min' | grep -cE 'ERR_INVALID_ARG_VALUE|Cannot convert object'   # cần in 0
```

Ở bước 3, lệnh `%00` có thể bị Caddy trả 400 trước khi tới Node. Kết quả đó cũng đạt. Muốn thử thẳng vào Node thì chạy
trên VPS, thay URL ở bước 3 bằng `http://127.0.0.1:8080/...`.

## 4. Rà lại các đường sập tiến trình (sau H-1)

Đã rà mọi chỗ chuỗi lấy từ yêu cầu đi tới `fs`, `path`, `Buffer`, `JSON.parse`, `decodeURIComponent`, `new URL` và
`res.writeHead` / `setHeader`. Kết quả:

- **HTTP:**
  - `web.js` đã có `try` quanh `new URL` và `decodeURIComponent`.
  - Không có header nào ghép từ dữ liệu người dùng. Không có `Content-Disposition`.
  - MCP phản chiếu `Origin`, nhưng giá trị đó đã qua bộ phân tích HTTP của Node.
  - `Request` / `Headers` của MCP nằm trong `try`.
  - `gameByShare` kiểm định dạng mã ván, `boardPng` có `try`.
  - Callback `fs.stat` của trang chính nay tự bắt lỗi.
  - **Đường sập duy nhất tìm thêm được là S-1 (`/api/rum`)**, đã sửa.
  - `serveAvatar`, `publicPlayer`, `publicTour` và `publicOTour` chỉ tra `Map`, câu SQL có tham số. `JSON.parse` dữ liệu
    giải trong CSDL chỉ hỏng được khi CSDL đã hỏng, và nay có `guardHttp` đỡ.
- **WebSocket:** `hub.handle` đã bọc `JSON.parse` và mọi handler `on_*` trong `try/catch` (kể cả hàm `async`). Ảnh avatar
  và ảnh giải chỉ giải mã `Buffer` base64 bên trong handler. Thư gửi chạy nền đều có `.catch`. Nay `connect`, `message`
  và `disconnect` có thêm `guardCall`.
- **Chiến lược cấp tiến trình:** không thêm `uncaughtException` nuốt lỗi. Lỗi cấp tiến trình vẫn làm tiến trình thoát,
  systemd khởi động lại (`Restart=always`). Lớp chặn nằm ở **từng yêu cầu**: `guardHttp` trả 500, ghi log không kèm
  query; `guardCall` chỉ ghi log. Lưới này không với tới các callback hẹn sau, nên những chỗ đó phải tự có `try/catch`
  (`rum.js`, `serveIndex`, file tĩnh).
- **Chưa bọc, ghi nhận:** còn 8 hẹn giờ trong logic ván (`rooms.js`, `challenges.js`, `watch.js`, `lobby.js`,
  `matchmaking.js`, `tourpush.js`, `core.js` xử thua). Dữ liệu ở đó là trạng thái nội bộ, không lấy thẳng từ yêu cầu.
  Bọc chúng sẽ che lỗi trạng thái hỏng. Các hẹn giờ khác đã đi qua `safeTimer`.
