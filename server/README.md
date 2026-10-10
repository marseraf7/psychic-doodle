# Máy chủ Cờ Caro online

Một tiến trình Node.js duy nhất vừa phục vụ giao diện game (thư mục `caro/`) vừa xử lý
chơi online qua WebSocket (`/ws`):

- **Phòng chơi**: mã 6 số + mật khẩu 3 số, người tạo chọn đi trước/đi sau, gửi link mời
  (`https://…/?room=123456`) – người vào vẫn phải nhập mật khẩu. **Tái đấu** cần cả hai bấm,
  mỗi ván tái đấu tự đổi bên đi trước.
- **Phòng công khai**: đánh dấu khi tạo phòng → phòng hiện trong mục "Phòng đang chờ" của mọi người
  (cập nhật tức thì), vào không cần mật khẩu. Phòng đã đủ 2 người hoặc chủ phòng offline thì ẩn đi;
  người đã chặn nhau không thấy phòng của nhau.
- **Thời gian**: giới hạn mỗi nước (10/20/30 giây) hoặc **đồng hồ tổng + cộng giờ** như cờ vua:
  1+1, 3+2, 5+3, 10+5 (phút + giây cộng sau mỗi lần đi). Máy chủ giữ đồng hồ (theo người chơi), hết giờ thì thua.
- **Luật khai cuộc Swap2** (chống lợi thế đi trước, tuỳ chọn khi tạo phòng / thách đấu / tạo giải): người cầm X
  đặt 3 quân (X, O, X); người kia chọn cầm X, cầm O, hoặc đặt thêm 2 quân (O, X) rồi để người đầu chọn bên.
  Quân luôn xen kẽ X/O nên lịch sử và xem lại không đổi. Máy chủ cho biết ai phải hành động (`actor`, `phase`).
- **Xem trực tiếp** (như Lichess TV): danh sách "Đang diễn ra" (điểm trung bình cao trước), xem ván của bạn bè
  đang chơi, trận đang đấu trong giải. Xem được phòng công khai / tìm nhanh / giải đấu / thách đấu bạn bè (phòng riêng
  có mật khẩu thì không); người xem không thấy mật khẩu, người chơi thấy số người đang xem.
- **Tìm trận nhanh**: chọn thời gian mỗi nước / đồng hồ tổng (hoặc "Bất kỳ") rồi bấm tìm; máy chủ ghép với người
  đang tìm có điểm gần nhất (trong đúng loại thời gian) (lệch tối đa 150 điểm, nới thêm 25 điểm mỗi giây chờ), ngẫu nhiên ai đi trước.
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
- **Đối đầu, điểm Glicko-2, bảng xếp hạng**: thành tích thắng–thua–hoà giữa hai người; điểm **Glicko-2** như Lichess
  (`src/rating.js`), tách theo loại thời gian: Siêu chớp / Chớp / Nhanh / Chậm (theo thời lượng ước tính
  phút×60 + 40×giây cộng; giới hạn 10 giây/nước = Chớp, 20–30 = Nhanh, không giới hạn = Chậm). Bắt đầu 1200;
  người mới có điểm "tạm" (dấu ?) và lên xuống nhanh, chơi nhiều thì ổn định; lâu không chơi thì độ tin cậy giảm dần.
  Tài khoản cũ: mọi loại bắt đầu từ điểm Elo cũ. "Điểm chính" = loại chơi nhiều nhất. Bảng xếp hạng chung + từng loại
  (từng loại chỉ xếp người không còn điểm tạm). Sau ván, thẻ kết quả hiện điểm thay đổi. Chỉ tính ván giữa hai tài khoản.
- **Trang hồ sơ**: điểm từng loại + biểu đồ điểm theo thời gian (400 điểm gần nhất), thắng / thua / hoà,
  chuỗi thắng dài nhất, số giải vô địch / đã chơi, 10 ván gần đây, đối đầu với mình.
  Chống cày điểm: ván kết thúc sớm dưới 10 nước (đầu hàng, hoà, rời phòng, hết giờ…) không tính,
  mỗi cặp chỉ tính tối đa 5 ván mỗi ngày.
- **Câu lạc bộ** (giống Team của Lichess): ai có tài khoản cũng tạo được (tối đa 2 CLB mình làm chủ),
  quản trị viên duyệt mới hiện công khai. Vào tự do / gửi yêu cầu chờ duyệt / bằng mã mời; vai trò chủ –
  quản lý – thành viên (duyệt, mời ra, trao quyền chủ); thông báo ghim; thành viên xếp theo Elo, ai đang online;
  giải đấu riêng của CLB.
- **Giải đấu** (kết hợp Arena của Lichess và nhánh đấu của Challonge), ai cũng tạo được (tối đa 3 giải chưa
  xong), quản trị viên duyệt mới mở đăng ký:
  - *Arena*: chơi trong 15–120 phút, xong ván là tự được ghép ván mới với người có điểm gần mình;
    thắng 2, hoà 1 (hoà dưới 10 nước: 0), thắng 2 ván liền thì 🔥 nhân đôi điểm. Vào muộn / tạm nghỉ được.
  - *Nhánh đấu / vòng bảng*: ghép tự do 1–3 giai đoạn, mỗi giai đoạn một thể thức:
    - **loại trực tiếp** (tuỳ chọn tranh hạng 3),
    - **nhánh thắng – thua** (double elimination: thua 2 trận mới bị loại, chung kết tổng có thể "reset"),
    - **vòng tròn** (chia theo số bảng hoặc theo số người mỗi bảng như Challonge, tối đa 16 người/bảng – bảng
      lớn hơn tự chia thêm; chia kiểu rắn theo hạt giống, hoặc ban tổ chức tự xếp bảng trước khi bắt đầu;
      gặp nhau 1 hoặc 2 lượt, điểm thắng / hoà / thua tự đặt; bằng điểm xét đối đầu rồi hiệu số ván),
    - **hệ Thụy Sĩ** (1–15 vòng, ghép người cùng điểm chưa gặp nhau, miễn đấu cho người thấp nhất chưa
      được miễn; bằng điểm xét Buchholz rồi Sonneborn–Berger). Số vòng tự giảm còn khoảng nửa số người
      (3–4 người: đủ vòng) vì đánh gần hết n−1 vòng thì thường không còn cách ghép nào tránh gặp lại.

    Giai đoạn trước giai đoạn cuối phải là vòng tròn / Thụy Sĩ và có "số người đi tiếp", ví dụ vòng bảng
    (4 bảng, nhì bảng trở lên đi tiếp) → playoff loại trực tiếp hoặc nhánh thắng – thua. Người đi tiếp được
    xếp hạt giống theo thành tích (các nhất bảng trước, rồi các nhì bảng…), nhất bảng không gặp người cùng
    bảng ở trận đầu playoff. Mỗi giai đoạn có Bo1/3/5 riêng (ván sau đổi bên đi trước; vòng tròn / Thụy Sĩ
    hoà được). Hạt giống theo Elo hoặc ngẫu nhiên, thiếu người thì hạt giống cao được miễn đấu; điểm danh
    10 phút trước giờ (không điểm danh = không được xếp); tới lượt mà vắng mặt quá 2 phút = thua (cả hai
    vắng: ở vòng tròn / Thụy Sĩ cả hai cùng thua); rời trận giữa chừng = thua cả trận.
    Logic các thể thức nằm riêng trong `src/hub/stages.js` (không phụ thuộc mạng, có kiểm thử riêng).
  - Máy chủ tự mở phòng và đưa người chơi vào ván; trang giải cập nhật trực tiếp (nhánh đấu, bảng xếp hạng,
    link xem lại từng ván, bục trao giải). Ban tổ chức: bắt đầu sớm, huỷ, loại người chơi. Giải theo thời gian
    thực có giới hạn mỗi nước (10/20/30 giây), tuỳ chọn tính / không tính Elo, mở cho mọi người / ai có link /
    thành viên CLB. Link mời `https://…/?t=<mã>`, CLB `https://…/?club=<mã>`. Lưu trong SQLite: máy chủ khởi
    động lại thì giải vẫn chạy tiếp (ván đang dở được đấu lại).
  - Tối đa 512 người mỗi giải. Để chạy được trên VPS nhỏ (1 vCPU, 1 GB RAM), trang giải chỉ gửi **phần đổi**
    so với lần trước (trận / dòng bảng xếp hạng vừa đổi), phần chung dựng một lần cho mọi người xem, các
    thay đổi được gom (0,3 giây với giải nhỏ, tới 2 giây với giải 512 người), tin lớn được nén
    (permessage-deflate). Đo với giải vòng bảng 512 người, 512 người cùng xem: mỗi lần cập nhật khoảng
    0,1 giây CPU và 0,5 MB dữ liệu gửi đi (trước đó: vài giây CPU và ~40 MB).
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

Mã máy chủ: `server.js` (HTTP + WebSocket), `src/store.js` (SQLite), `src/room.js` (một phòng chơi; đồng hồ ở
`src/room-clock.js`, luật Swap2 ở `src/room-swap2.js`), `src/rating.js` (Glicko-2),
`src/hub/` – xử lý tin nhắn, chia theo chủ đề: `core.js` (kết nối, phiên, giới hạn tần suất),
`auth.js` (tài khoản, mật khẩu, email), `social.js` (bạn bè, lịch sử, chặn, tin nhắn), `profile.js` (bảng xếp hạng, hồ sơ),
`rooms.js` (phòng, ván đấu, thách đấu, điểm, xin hoà), `matchmaking.js` (tìm trận nhanh, phòng công khai),
`watch.js` (xem trực tiếp, danh sách ván hay),
`clubs.js` (câu lạc bộ), `tournaments.js` (giải đấu – phần chung: tạo, đăng ký, xem, ban tổ chức, nhịp chạy),
`arena.js` (giải Arena), `bracket.js` (giải theo giai đoạn: mở trận, ghi kết quả, chuyển giai đoạn),
`stages.js` (logic thuần các thể thức: loại trực tiếp, nhánh thắng – thua, vòng tròn, Thụy Sĩ),
`tourpush.js` (gửi cập nhật trang giải: gom, chỉ gửi phần đổi), `admin.js` (quản trị viên duyệt).
Tin nhắn loại `X` do phương thức `on_X` xử lý.

Cần **Node.js 22.13 trở lên** (dùng SQLite có sẵn trong Node, không phải cài thêm CSDL).

Biến môi trường:

| Biến | Ý nghĩa |
|---|---|
| `PORT` | Cổng (mặc định `8080`) |
| `HOST` | Địa chỉ lắng nghe (mặc định mọi địa chỉ). Chạy sau Caddy/nginx trên cùng máy thì đặt `127.0.0.1` để không ai gọi thẳng vào cổng Node |
| `DATA_DIR` | Thư mục chứa CSDL `caro.db` (mặc định `server/data`) – nhớ sao lưu |
| `GOOGLE_CLIENT_ID` | Bật nút "Đăng nhập bằng Google" (bỏ trống thì nút bị ẩn) |
| `SMTP_URL` | Bật "Quên mật khẩu" qua email, ví dụ `smtps://ten%40gmail.com:mat-khau-ung-dung@smtp.gmail.com:465` (bỏ trống thì tính năng bị ẩn) |
| `ADMIN_USERNAMES` | Tên đăng nhập của quản trị viên, cách nhau bởi dấu phẩy, ví dụ `minh,lan`. Quản trị viên duyệt câu lạc bộ và giải đấu mới (nút **Giải đấu → Duyệt**). Tạo tài khoản bình thường trong game rồi điền tên đăng nhập vào đây. Bỏ trống = không ai duyệt được, giải / CLB mới chỉ nằm ở trạng thái chờ |
| `MIN_APP_VERSION` | Bản app điện thoại thấp nhất còn được chơi online, ví dụ `1.0.0`. App cũ hơn hiện "Cần cập nhật app" (chơi offline vẫn được). Bỏ trống = không kiểm tra. Bản web luôn mới nhất nên không bị ảnh hưởng |
| `ANDROID_UPDATE_URL`, `IOS_UPDATE_URL` | Link cửa hàng cho nút "Cập nhật app", ví dụ `https://play.google.com/store/apps/details?id=io.github.marseraf7.caro` |
| `MAIL_FROM` | Người gửi, ví dụ `"Cờ Caro <caro@ten-mien.com>"` (mặc định: tài khoản trong `SMTP_URL`) |
| `TRUST_PROXY=1` | **Chỉ bật khi chạy sau nginx/Caddy** (lấy IP người chơi từ header `X-Forwarded-For`). Máy chủ chỉ tin header này khi kết nối đến từ chính máy hoặc mạng nội bộ (proxy), nên người gọi thẳng từ Internet không giả IP được |

## Đưa lên mạng (để người ở Việt Nam và Nga đều vào được)

GitHub Pages chỉ phục vụ file tĩnh nên **không chạy được phần online** – cần một máy chủ
chạy Node.js. Cách đơn giản nhất là thuê 1 VPS nhỏ (1 CPU / 512MB là đủ):

- Nên chọn VPS ở khu vực mà cả hai nước truy cập ổn định (ví dụ Singapore, Hồng Kông,
  Kazakhstan, Thổ Nhĩ Kỳ…), hoặc tách 2 máy chủ riêng cho từng nước nếu cần.
- Nên tránh các nền tảng có thể chặn người dùng theo quốc gia vì lệnh trừng phạt.
- Máy chủ không dùng dịch vụ nước ngoài nào (không Firebase, không CDN). Chỉ riêng tính năng
  Google cần truy cập `accounts.google.com` / `oauth2.googleapis.com`; nếu mạng chặn Google
  thì người chơi vẫn dùng tài khoản riêng bình thường.

### Cách 1 – Script cài tự động (khuyên dùng, VPS Ubuntu 22.04 / 24.04)

```bash
sudo git clone -b <nhánh> https://github.com/<chủ>/<repo>.git /opt/caro
sudo bash /opt/caro/server/deploy/install.sh caro.ten-mien.com
sudo nano /etc/caro/caro.env          # ADMIN_USERNAMES, GOOGLE_CLIENT_ID, SMTP_URL…
sudo systemctl restart caro
```

`install.sh` cài Node.js 22 + Caddy (HTTPS tự động) và bật sẵn các lớp bảo vệ:

- Máy chủ chạy bằng user `caro` không có quyền gì, bị cách ly bằng systemd (`deploy/caro.service`:
  chỉ ghi được thư mục dữ liệu, không thấy `/home`, chặn lệnh hệ thống nguy hiểm, giới hạn 600 MB RAM;
  `systemd-analyze security caro` chấm 1.2 – mức "OK"). Mã nguồn thuộc root, dịch vụ không sửa được.
- Cổng Node chỉ nghe `127.0.0.1`; ra Internet chỉ qua Caddy (HTTPS, HSTS, ẩn phiên bản, chặn yêu cầu > 16 KB).
- Tường lửa `ufw`: chỉ mở SSH, 80, 443. SSH: tắt đăng nhập bằng mật khẩu và đăng nhập root (chỉ khi
  bạn đang đăng nhập bằng khoá – nếu không, script giữ nguyên để bạn không bị khoá ở ngoài); `fail2ban`
  chặn 1 giờ IP đăng nhập SSH sai 5 lần.
- Bí mật (`SMTP_URL`…) nằm trong `/etc/caro/caro.env`, chỉ root đọc được (file dịch vụ ai cũng đọc được).
- Tự cài bản vá bảo mật Ubuntu, giới hạn nhật ký 200 MB, tham số mạng an toàn (sysctl),
  sao lưu CSDL mỗi ngày vào `/var/backups/caro` (giữ 14 ngày).

Cập nhật code: `sudo bash /opt/caro/server/deploy/update.sh` – sao lưu dữ liệu trước, tải code mới,
khởi động lại; bản mới không chạy được thì tự quay lại bản cũ.

Repo riêng tư: clone bằng *deploy key* (khoá chỉ đọc, GitHub → Settings → Deploy keys), rồi
`sudo git -C /opt/caro config core.sshCommand "ssh -i /root/.ssh/caro_deploy"` để `update.sh` tải được.

### Cách 2 – Docker

```bash
docker build -f server/Dockerfile -t caro .
docker run -d --name caro --restart unless-stopped -p 127.0.0.1:8080:8080 -v caro-data:/data \
  -e GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com -e TRUST_PROXY=1 caro
```

`-p 127.0.0.1:8080:8080`: chỉ mở cổng trong máy, người ngoài vào qua Caddy/nginx.

### Cách 3 – Node trực tiếp + systemd (tự làm từng bước)

```bash
git clone <repo> /opt/caro && cd /opt/caro/server && npm ci --omit=dev
HOST=127.0.0.1 PORT=8080 DATA_DIR=/var/lib/caro node --disable-warning=ExperimentalWarning server.js
```

Mẫu file dịch vụ và cấu hình: `deploy/caro.service`, `deploy/caro.env.example`, `deploy/Caddyfile`.

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

- **Chống quá tải khi xem trực tiếp / xếp hạng**: mỗi phòng tối đa 200 người xem, mỗi kết nối xem 1 phòng; trạng thái
  gửi người xem chuyển JSON một lần cho tất cả; số người xem vào/ra dồn dập được gom (tối đa 1 lần/giây/phòng);
  danh sách "Đang diễn ra" dựng chung mỗi 3 giây; bảng xếp hạng giữ kết quả tới ván tính điểm tiếp theo (tối đa 60 giây);
  hồ sơ (truy vấn CSDL) và lệnh xem bị giới hạn tần suất theo kết nối. Kết nối không đọc dữ liệu (dồn quá 2 MB) bị ngắt.

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
- Chống spam "mở trang giải" (mỗi lần mở giải 512 người là ~1,4 MB dữ liệu): phần chung của trang giải được
  lưu sẵn và dùng lại; số lần tải trang đầy đủ giới hạn theo IP (giải càng đông càng tốn lượt), hết lượt thì
  nhận ở nhịp cập nhật kế tiếp. Trước khi sửa, 1 kết nối spam đã chiếm ~0,9 vCPU; nay ~0,14 và bị chặn sau ~40 lần.
- Chỉ tin `X-Forwarded-For` khi kết nối đến từ proxy (chính máy / mạng nội bộ); cổng Node có thể chỉ nghe `127.0.0.1`.
- `deploy/install.sh` cài sẵn: dịch vụ cách ly (systemd, mức 1.2 "OK"), tường lửa, SSH chỉ dùng khoá, fail2ban,
  tự vá bảo mật, sao lưu hằng ngày (xem mục *Đưa lên mạng*).

## Giới hạn hiện tại

- Dữ liệu lưu trong 1 file SQLite: thoải mái tới hàng chục nghìn người dùng trên VPS 1 CPU / 512MB.
  Phòng chơi nằm trong bộ nhớ – khởi động lại máy chủ thì các ván đang đánh bị mất
  (tài khoản, bạn bè, lịch sử vẫn còn).
- Chỉ chạy 1 tiến trình (không chia tải nhiều máy).
- Báo cáo vi phạm được lưu trong bảng `reports` của `caro.db`, chưa có trang quản trị:
  xem bằng `sqlite3 caro.db "SELECT * FROM reports ORDER BY id DESC LIMIT 20"`.
