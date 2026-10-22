# Chuyển máy chủ sang châu Âu (giảm ping cho người chơi ở Nga / Đông Âu)

**Vì sao:** máy chủ hiện ở Google Cloud Oregon (Mỹ). Từ Moscow ping thường 180–240 ms; nước đi online đi qua WebSocket
nên không cache được, chỉ rút ngắn quãng đường mới giảm ping thật. Đặt ở Phần Lan: Moscow ≈ 25–45 ms, người chơi ở Mỹ
≈ 90–110 ms (vẫn chơi tốt).

**Nguyên tắc:** giữ **nguyên tên miền** `caroxo.duckdns.org` rồi chỉ đổi IP nó trỏ tới. App Android / iOS đã dựng sẵn
tên miền này (`app/README.md`, `CARO_SERVER_URL`), nên không phải phát hành lại app. Chuyển xong người chơi không phải làm gì.

Toàn bộ các bước dưới đây bạn tự làm trên máy chủ (SSH bằng khoá). **Không gửi mật khẩu / khoá riêng của máy chủ cho
ai, kể cả Claude.** Cần gì thì dán *kết quả lệnh*, không dán bí mật.

---

## 0. Chọn nơi đặt máy (chọn một)

| Nhà cung cấp | Vùng | Ghi chú |
|---|---|---|
| **Hetzner Cloud** (khuyên dùng) | Helsinki (`hel1`) | Rẻ (CX22, 2 vCPU / 4 GB ≈ vài €/tháng), mạng tốt tới Nga. Cần xác minh danh tính khi đăng ký. |
| Google Cloud | `europe-north1` (Phần Lan) | Cùng tài khoản đang dùng; giá cao hơn Hetzner. |

Cấu hình tối thiểu: **2 vCPU, 2–4 GB RAM**, Ubuntu 24.04 (hoặc 22.04), ổ 20 GB. Rapfi chạy trên trình duyệt người chơi
nên máy chủ không cần mạnh. Mở cổng vào: **22 (nên giới hạn theo IP bạn), 80, 443** (80 để Caddy lấy chứng chỉ HTTPS).
Thêm khoá SSH của bạn lúc tạo máy.

> Nếu tên miền DuckDNS bị chặn ở một số nhà mạng Nga, đổi sang tên miền riêng sẽ chắc hơn (xem mục 8). Có thể làm sau;
> chuyển vùng và đổi tên miền nên làm **hai đợt riêng** để lỗi nào cũng biết do đâu.

## 1. Chuẩn bị trước (không ảnh hưởng người chơi)

1. Hạ TTL: DuckDNS luôn có TTL ngắn (~60 giây) nên không cần chỉnh. Tên miền riêng thì hạ TTL xuống 60 giây **trước ít nhất
   một ngày**.
2. Chọn giờ vắng người (xem `curl -s https://caroxo.duckdns.org/api/stats` → `players`, `games`).
3. Ghi lại cấu hình hiện tại trên **máy cũ**:
   ```bash
   sudo cat /etc/caro/caro.env          # chép các giá trị: ADMIN_USERNAMES, GOOGLE_CLIENT_ID, SMTP_URL, MAIL_FROM,
                                        # MIN_APP_VERSION, *_UPDATE_URL (đừng dán lên chat / Issue / PR)
   git -C /opt/caro log --oneline -1    # bản code đang chạy
   ```

## 2. Dựng máy mới (chạy song song, chưa nhận người chơi)

SSH vào máy **mới**:

```bash
sudo apt-get update && sudo apt-get install -y git
sudo git clone https://github.com/marseraf7/psychic-doodle.git /opt/caro
cd /opt/caro && sudo git checkout claude/vibrant-dirac-222bq2      # nhánh đang chạy trên máy cũ (hoặc nhánh chính của repo)
```

Chạy `install.sh` với **chính tên miền hiện tại** (script cài Node 22, Caddy, systemd cách ly, tường lửa, fail2ban,
sao lưu hằng ngày, tự cập nhật 10 phút một lần):

```bash
sudo bash /opt/caro/server/deploy/install.sh caroxo.duckdns.org
```

Lúc này Caddy **chưa lấy được chứng chỉ HTTPS** (tên miền còn trỏ về máy cũ) — bình thường, sẽ xong ở bước 5.
Kiểm tra máy chủ Node đã chạy: `curl http://127.0.0.1:8080/healthz` → `ok`.

> ⚠️ `install.sh` siết SSH (tắt đăng nhập bằng mật khẩu, tắt root) **chỉ khi** user chạy `sudo` có khoá SSH trong
> `~/.ssh/authorized_keys`. Mở một cửa sổ SSH thứ hai kiểm tra vào lại được trước khi đóng cửa sổ đầu.

Điền cấu hình (chép từ máy cũ, `sudo nano /etc/caro/caro.env`), **chưa khởi động lại**:
- `PUBLIC_URL=https://caroxo.duckdns.org` (install.sh đã điền).
- `ADMIN_USERNAMES`, `GOOGLE_CLIENT_ID`, `SMTP_URL`, `MAIL_FROM`, `MIN_APP_VERSION`… giống máy cũ.

Mạng Rapfi (~40 MB): `update.sh` tự tải vào `caro/rapfi/nets/` ở lần chạy tới (10 phút một lần). Muốn có ngay:
`sudo bash /opt/caro/server/deploy/update.sh`.

## 3. Đóng băng máy cũ và chép dữ liệu (đây là lúc người chơi bị gián đoạn ~5–10 phút)

Báo trước trong game / kênh chat cộng đồng. Rồi trên máy **cũ**:

```bash
# 1. Dừng máy chủ để CSDL không đổi nữa (người chơi sẽ mất kết nối từ đây)
sudo systemctl stop caro caro-update.timer

# 2. Sao lưu CSDL + khoá bí mật (eval-key nằm NGOÀI caro.db, phải chép riêng)
sudo sqlite3 /var/lib/caro/caro.db ".backup '/root/caro-chuyen.db'"
sudo cp /var/lib/caro/eval-key /root/eval-key
sudo chmod 600 /root/caro-chuyen.db /root/eval-key
```

Chép sang máy mới. Cách an toàn: kéo từ máy mới về bằng chính khoá SSH của bạn (tuyệt đối không gõ mật khẩu vào lệnh):

```bash
# chạy trên máy MỚI (thay <IP-cũ> và <user>; cần đăng nhập SSH được vào máy cũ bằng khoá)
scp <user>@<IP-cũ>:/root/caro-chuyen.db /tmp/caro-chuyen.db     # nếu /root không đọc được: chép về /tmp ở máy cũ trước
scp <user>@<IP-cũ>:/root/eval-key       /tmp/eval-key
```

Hoặc tải về máy bạn rồi tải lên máy mới (`scp` hai chiều). Trên máy **mới**:

```bash
sudo systemctl stop caro
sudo install -o caro -g caro -m 600 /tmp/caro-chuyen.db /var/lib/caro/caro.db
sudo install -o caro -g caro -m 600 /tmp/eval-key       /var/lib/caro/eval-key
sudo rm -f /var/lib/caro/caro.db-wal /var/lib/caro/caro.db-shm      # file tạm của CSDL cũ nếu có
sudo shred -u /tmp/caro-chuyen.db /tmp/eval-key
sudo systemctl start caro
curl http://127.0.0.1:8080/healthz          # ok
curl -s http://127.0.0.1:8080/api/leaderboard | head -c 300    # có dữ liệu cũ
```

Nếu có dữ liệu cũ khác trong `/var/lib/caro` (vd. `db.json.imported`) thì không cần chép.

## 4. Thử máy mới **trước khi** đổi DNS

Trên máy của bạn, ép tên miền trỏ tạm vào IP mới (chỉ máy bạn thấy):

```bash
# Linux/macOS: thêm dòng vào /etc/hosts       <IP-mới>  caroxo.duckdns.org
# Windows:    C:\Windows\System32\drivers\etc\hosts (mở bằng quyền quản trị)
```

Chưa có HTTPS hợp lệ (chưa đổi DNS) nên trình duyệt sẽ cảnh báo chứng chỉ — dùng bước 5 xong mới thử đầy đủ, hoặc thử
nhanh bằng `curl -k --resolve caroxo.duckdns.org:443:<IP-mới> https://caroxo.duckdns.org/healthz`. Muốn chắc hơn thì
chạy bước 5 trước rồi 4 sau; đổi DNS rất nhanh nên rủi ro thấp.

## 5. Đổi DNS

1. Vào trang DuckDNS (đăng nhập tài khoản đang sở hữu `caroxo`) → ô **current ip** của `caroxo` → điền **IP máy mới** →
   *update ip*. (Hoặc `curl "https://www.duckdns.org/update?domains=caroxo&token=<TOKEN>&ip=<IP-mới>"` — token là bí
   mật, đừng ghi vào repo / log.)
2. Đợi ~1–2 phút. Kiểm tra: `nslookup caroxo.duckdns.org` ra IP mới.
3. Trên máy mới, Caddy tự lấy chứng chỉ HTTPS: `sudo journalctl -u caddy -n 30` (tìm `certificate obtained`).
   Nếu chưa: `sudo systemctl reload caddy`.
4. `curl https://caroxo.duckdns.org/healthz` → `ok`. Xoá dòng thử trong file `hosts`.

## 6. Kiểm tra sau khi chuyển

- [ ] Đăng nhập tài khoản cũ được (mật khẩu, và Google nếu có). Lịch sử, bạn bè, Elo còn nguyên.
- [ ] Vào phòng, đánh một ván online với tài khoản thứ hai; tin nhắn, bong bóng chat hoạt động.
- [ ] Tải lại trang: **Trang chủ hiện ngay** (bản mới có service worker lấy bộ nhớ đệm trước).
- [ ] BOAT / phân tích Rapfi: mạng tải từ `/rapfi/nets/` của chính máy chủ (DevTools → Network, không còn gọi jsDelivr).
- [ ] App Android / iOS vẫn vào được (cùng tên miền nên không đổi gì).
- [ ] `systemctl list-timers caro-update` có lịch; `/etc/cron.d/caro-backup` có (sao lưu 3:17 mỗi ngày).
- [ ] Người ở Nga thử không VPN, đo bằng ô **Ping** trong Cài đặt nhanh (bánh răng trên thanh trên).

## 7. Dọn máy cũ

Giữ máy cũ **tắt** (không xoá) ít nhất 7 ngày để quay lại được nếu có sự cố:

```bash
sudo systemctl disable caro caro-update.timer      # đừng để nó tự bật lại và tranh dữ liệu
```

Sau thời gian đó mới xoá máy / ổ đĩa. **Quay lại máy cũ khi có sự cố** (trong vòng 7 ngày): bật `caro` trên máy cũ, đổi
DNS về IP cũ. Lưu ý dữ liệu sinh ra trên máy mới từ lúc chuyển sẽ không có trên máy cũ — nên chỉ quay lại khi lỗi nặng,
và chép lại `caro.db` mới nhất về máy cũ theo cách ở bước 3.

Xoá các tệp sao lưu tạm `/root/caro-chuyen.db`, `/root/eval-key` trên máy cũ (`sudo shred -u …`) khi không cần nữa.

## 8. (Tuỳ chọn) Đổi sang tên miền riêng

DuckDNS miễn phí; một số nhà mạng / phần mềm diệt virus ở Nga chặn các subdomain dynamic-DNS. Tên miền riêng
(`caro.<tên-của-bạn>.com`, vài USD/năm) ổn định hơn:

1. Mua tên miền, thêm bản ghi **A** (và **AAAA** nếu máy có IPv6) trỏ tới IP máy mới.
2. Trên máy chủ: chạy lại `sudo bash /opt/caro/server/deploy/install.sh caro.<tên-của-bạn>.com` (an toàn chạy lại),
   rồi sửa `PUBLIC_URL` trong `/etc/caro/caro.env` và `sudo systemctl restart caro`.
3. **App điện thoại:** đặt biến Actions `CARO_SERVER_URL` (Settings → Secrets and variables → Variables) thành tên miền mới
   rồi dựng lại app. App cũ vẫn dùng `caroxo.duckdns.org` nên **giữ DuckDNS trỏ về máy mới** một thời gian, và đặt
   `MIN_APP_VERSION` + `ANDROID_UPDATE_URL` / `IOS_UPDATE_URL` để bắt cập nhật khi đã phát hành bản mới.
4. Đăng nhập Google: thêm tên miền mới vào *Authorized JavaScript origins* của OAuth Client (Google Cloud Console).
5. Đổi các liên kết trong cửa hàng ứng dụng (chính sách quyền riêng tư `…/privacy.html`).

## 9. Nếu vẫn lag sau khi chuyển

- Đo thật từ Nga (`ping`, hoặc ô Ping trong game). Nếu ≥ 100 ms: thử nhà cung cấp / vùng khác (Hetzner Falkenstein, GCP
  `europe-central2` Warsaw).
- Nếu **không vào được hẳn** (không phải chậm): có thể IP / tên miền bị chặn ở tầng nhà mạng; đổi sang IP khác (tạo máy
  mới, hoặc đổi Floating IP) và dùng tên miền riêng. Tránh phụ thuộc duy nhất một CDN (Cloudflare đang bị bóp ở Nga);
  nếu cần CDN cho file tĩnh, cân nhắc nhà cung cấp còn hoạt động tốt ở Nga.

## Tóm tắt thời gian

| Bước | Ảnh hưởng người chơi | Thời gian |
|---|---|---|
| 0–2 Dựng máy mới | không | 20–30 phút |
| 3 Dừng máy cũ + chép dữ liệu | **ngắt kết nối** | 5–10 phút |
| 5 Đổi DNS + HTTPS | vài phút nữa mới vào lại được | 2–5 phút |
| 6–7 Kiểm tra, dọn | không | tuỳ |
