# Hướng dẫn đưa game lên CrazyGames, itch.io, Telegram, VK (22/11/2026)

Việc của Minh (tài khoản, bấm nộp) và việc kiểm thật của Laplace, theo `docs/ke-hoach-tiep-can-toan-cau-21-11-2026.md`
(Đợt 1). Phần code: `server/scripts/build-portal.js`, `caro/portal*.js`, `server/src/portal-origins.js`; Mini App:
`caro/host-detect.js`, `caro/host*.js`, `caro/vendor/vk-bridge.js`, `server/src/host-embed.js`; đăng nhập bằng Mini App
(Đợt 3, 26/11/2026): `caro/host-auth.js`, `server/src/host-auth.js`, `server/src/hub/host-login.js` – mục 4.

## 1. Đóng gói bản cổng (CrazyGames / itch.io)

```
node server/scripts/build-portal.js crazygames --server https://<tên miền máy chủ>
node server/scripts/build-portal.js itch --server https://<tên miền máy chủ>
```

- Ra `dist/portal-<cổng>/` (thư mục tĩnh, `index.html` ở gốc, đường dẫn tương đối) và `dist/caro-<cổng>.zip` (tải file
  ZIP này lên cổng). Không có `--server` thì lấy `CARO_SERVER_URL`, rồi `PUBLIC_URL`, mặc định tên miền chính khai trong `server/src/site.js`.
- Script in số file, tổng dung lượng, phần tải ban đầu so với giới hạn của cổng; vượt giới hạn hoặc còn đường dẫn tuyệt đối
  thì báo lỗi. Đo 25/11/2026 (bản crazygames): 419 file, ~13,9 MB (ZIP ~5,2 MB), tải ban đầu ~2,5 MB; đo bằng Chromium:
  2 818 KB tới khi bàn cờ chơi được (chi tiết: `docs/crazygames-nop-basic-launch.md` mục 2).
- Bản cổng: chơi khách mặc định, không đăng nhập / đăng ký, không link ra ngoài, không chat tự do (còn chat nhanh câu mẫu),
  không service worker, không quảng cáo, tiếng Anh mặc định (đổi được). Bản CrazyGames có SDK v3 mức Basic.

### Máy chủ

- WebSocket từ cổng đã được cho phép sẵn: `https://*.game-files.crazygames.com`, `https://html.itch.zone`,
  `https://html-classic.itch.zone`. Thấy cổng dùng tên miền khác (log máy chủ: "Chặn kết nối WebSocket vì Origin lạ: …")
  thì thêm vào biến môi trường `PORTAL_WS_ORIGINS` (cách nhau dấu phẩy; dạng `https://a.example` hoặc
  `https://*.example.com`), khởi động lại máy chủ.

### CrazyGames (Minh)

Gói nộp đầy đủ (Đợt 2): **`docs/crazygames-nop-basic-launch.md`** – danh sách kiểm, số đo thật của gói, metadata tiếng Anh
(tên, mô tả, hướng dẫn điều khiển, tag), ghi chú cho QA, thư hỏi support về WebSocket + phương án dự phòng, theo dõi sau nộp,
mục nghiệm thu của Laplace trong QA Tool + mẫu báo cáo. Bài nháp Reddit / Discord và thông báo Giải tuần:
**`docs/reddit-discord-bai-nhap.md`**.

Ảnh bìa + video bìa từ gameplay thật (dựng bản cổng, chơi một ván với máy trong Chromium, chụp / quay):

```
node server/scripts/portal-media.js                      # dist/portal-media/: cover-1920x1080 / 800x1200 / 800x800 (.png, -raw.png) + cover-video.mp4
node server/scripts/portal-media.js --sizes 1920x1080 --no-video   # chỉ một ảnh
```

Cỡ 1920×1080 / 800×1200 / 800×800 là cỡ CrazyGames thường yêu cầu – **kiểm lại trong biểu mẫu Developer Portal trước khi
nộp**, khác thì đổi `--sizes` / `--video-size`.

1. Đăng ký CrazyGames Developer Portal, xong khai thanh toán (Tipalti) trước khi nộp.
2. Nên hỏi support trước: "game có máy chủ multiplayer riêng qua WebSocket (wss) – có được không?" (thư nháp trong tài liệu
   nộp, mục 6).
3. Nộp game: chọn Basic Launch, tải `dist/caro-crazygames.zip`, điền tên / mô tả / hướng dẫn tiếng Anh, ảnh bìa và video bìa
   (kích thước theo biểu mẫu thật), khai PEGI 12, ghi chú cho QA (bản tiếng Anh trong tài liệu nộp, mục 5).
4. Kiểm trong QA Tool (Laplace): mở được, chơi trọn ván với máy, sự kiện `gameplayStart` khi vào ván, thời gian tới lúc
   chơi được ≤ 20 giây, không nút đăng nhập, online được hay không (ghi nguyên văn) – chi tiết + mẫu báo cáo ở mục 9.

### itch.io (Minh)

1. Tạo trang game: Kind of project = HTML; tải `dist/caro-itch.zip`, tick "This file will be played in the browser".
2. Kích thước khung nhúng gợi ý 1280 × 800 (màn hẹp vẫn dùng được), bật nút Fullscreen, chọn "Click to launch".
3. Tắt thanh toán / quyên góp ở đợt đầu (Minh đã duyệt). Đăng nháp, kiểm (Laplace): chơi trọn ván với máy, online được hay
   không – ghi kết quả thật, mô tả trang khớp với kết quả.

## 2. Telegram Mini App (MVP)

Mini App mở đúng trang chính (không bản riêng), tự nhận ra Telegram: ready / expand, chặn vuốt dọc đóng app, giao diện sáng /
tối theo Telegram (nếu người chơi chưa tự chọn), nút Back của Telegram = lùi trong app, link ra ngoài mở bằng trình duyệt
ngoài, đang chơi online thì đóng app phải xác nhận. Đăng nhập bằng Telegram: bật khi Minh nạp token bot vào máy chủ (mục 4).
Khán giả: Nga / quốc tế, không quảng bá cho người chơi Việt Nam (kế hoạch C0.3).

Minh làm trong Telegram, mở **@BotFather** (tên mục có thể khác theo bản Telegram – làm theo giao diện thật, ghi lại đã đặt gì):

1. `/newbot` → tên hiển thị + username kết thúc bằng `bot`. BotFather trả **token**: chỉ dùng để bật đăng nhập bằng Telegram
   (mục 4) – Minh tự nạp thẳng vào máy chủ, **không** dán vào chat, tài liệu hay repo. Lỡ lộ thì `/revoke` ngay.
2. `/newapp` (hoặc Bot Settings → Configure Mini App): chọn bot, đặt tên, mô tả, ảnh, **Web App URL**
   `https://<tên miền>/?host=tg`, **short name** (vd. `play`) → link mở thẳng `https://t.me/<bot>/play`.
3. Bot Settings → **Menu Button** → URL `https://<tên miền>/?host=tg`, chữ nút "Play" / "Играть".
4. `?host=tg` là bắt buộc: máy chủ thấy dấu này mới cho Telegram Web nhúng trang và cho nạp `telegram-web-app.js`.
   Muốn thử toàn màn hình (Bot API 8.0, điện thoại) thì thêm `&fs=1` – kiểm nút Đóng / menu của Telegram có che thanh trên
   của app không trước khi bật cho mọi người.

Link sâu (`startapp`, chỉ chữ, số, `_`, `-`): `https://t.me/<bot>/play?startapp=room-123456` (vào phòng),
`…?startapp=replay-<mã>` (xem lại ván), `…?startapp=t-<mã>` (giải), `…?startapp=o-<mã>` (giải offline), cũng nhận `club-`,
`u-` (hồ sơ), `cls-`.

Laplace kiểm (Android + Desktop, iOS nếu có): direct link mở đúng game; chơi trọn ván với máy; nút Back; thoát ra vào lại
– ván / cài đặt / đăng nhập còn không (kết luận về localStorage trong WebView Telegram); link `startapp=room-…` vào đúng phòng.

## 3. VK Mini App (MVP)

Tự nhận ra VK (tham số khởi chạy `vk_app_id` + `sign`): VKWebAppInit, giao diện sáng / tối theo VK. Đăng nhập bằng VK: bật
khi Minh nạp khoá bí mật của app vào máy chủ (mục 4) – máy chủ kiểm chữ ký `sign`, chưa kiểm thì không bao giờ tin `vk_user_id`.

Minh làm ở dev.vk.ru (Mini Apps → Create app / Создать приложение; tên mục chưa kiểm được từ đây – làm theo giao diện thật):

1. Chọn loại Mini App (Игра nếu muốn vào danh mục game), đặt tên, ảnh.
2. Mục Hosting / Размещение: địa chỉ cho **mobile** (`vk.com` app Android / iOS), **m.vk.com** và **vk.com bản máy tính**
   đều là `https://<tên miền>/?host=vk` (VK tự thêm `vk_*` + `sign`).
3. Bật app, gắn vào cộng đồng VK của game (Community → Apps / Приложения). Khoá bí mật (Защищённый ключ) + mã số app: dùng để
   bật đăng nhập bằng VK (mục 4) – Minh tự nạp thẳng vào máy chủ, không gửi qua chat.
4. Link sâu: `https://vk.com/app<id>#room-123456` (VK truyền phần sau `#` trong tham số `hash`; app nhận cả khi VK đưa thẳng vào `location.hash` – Laplace kiểm bản nào đúng).

Laplace kiểm: mở trên vk.com (máy tính – iframe), m.vk.com, app VK Android; chơi trọn ván với máy; giao diện đổi theo
chế độ tối của VK; link `#room-…` vào đúng phòng.

### Máy chủ (Mini App)

- Lượt mở trang chính có `?host=tg|vk`, `?tgWebAppStartParam=` hoặc `?vk_app_id=…&sign=` được nhúng trong
  `https://web.telegram.org`, `vk.com`, `vk.ru` (và tên miền con) và được nạp `https://telegram.org/js/telegram-web-app.js`.
  Mọi lượt khác giữ nguyên `frame-ancestors 'none'`. Đổi danh sách bằng `HOST_FRAME_ANCESTORS` (cách nhau dấu cách;
  `none` = tắt).

## 4. Đăng nhập bằng Telegram / VK (Đợt 3 – Minh nạp bí mật vào máy chủ)

Người chơi trong Mini App: đã liên kết thì **tự vào đúng tài khoản** (kể cả máy mới / đã xoá dữ liệu trình duyệt – lý do làm:
localStorage trong WebView của Telegram / VK không bền); khách thấy nút "Lưu tiến độ bằng Telegram / VK" (tạo tài khoản không
mật khẩu, mang tiến độ khách sang); người đã có tài khoản Caro thấy nút "Liên kết Telegram / VK" (hỏi xác nhận). Huỷ liên kết ở
Cài đặt tài khoản. Chưa nạp bí mật thì tính năng **tắt hẳn** (không nút, máy chủ báo "không hỗ trợ").

### Minh làm (trực tiếp trên máy chủ – không gửi token / khoá qua chat, email, Issue, repo)

1. Lấy bí mật:
   - Telegram: token của bot đã tạo ở mục 2 (BotFather → bot → API Token).
   - VK: dev.vk.ru → app → Settings / Настройки: **Защищённый ключ** (Secure key) và **ID приложения** (App ID).
2. SSH vào máy chủ, mở file cấu hình (chỉ root đọc được):
   ```
   sudo nano /etc/caro/caro.env
   ```
   Điền (mẫu ở `server/deploy/caro.env.example`):
   ```
   TELEGRAM_BOT_TOKEN=<dán token>
   VK_APP_SECRET=<dán khoá bí mật>
   VK_APP_ID=<mã số app>
   ```
   Chỉ dùng một nền tảng thì để trống dòng của nền tảng kia. Lưu, rồi `sudo systemctl restart caro`.
3. Kiểm: `sudo journalctl -u caro -n 30` phải có dòng `(Đăng nhập bằng Mini App: telegram, vk)`. Có dòng
   `TELEGRAM_BOT_TOKEN sai định dạng` thì token dán thiếu / thừa ký tự. Log **không bao giờ** in token / khoá.
4. Giao Laplace kiểm theo `docs/laplace-kiem-dang-nhap-mini-app-26-11-2026.md`.
5. Lỡ lộ: Telegram – BotFather `/revoke` lấy token mới; VK – tạo lại khoá bí mật; nạp lại vào máy chủ, khởi động lại. Tài
   khoản / liên kết của người chơi không mất (liên kết theo id Telegram / VK, không theo token).

### Cách hoạt động, quyết định bảo mật

- Telegram: máy chủ kiểm `initData` theo core.telegram.org/bots/webapps ("Validating data received via the Mini App"): HMAC-SHA256
  với khoá `HMAC_SHA256("WebAppData", token)`, mọi trường trừ `hash` (cả `signature`), so bằng `crypto.timingSafeEqual`;
  `auth_date` không cũ quá 24 giờ, không ở tương lai quá 5 phút. VK: chỉ các tham số `vk_…`, sắp theo tên, HMAC-SHA256 bằng khoá
  bí mật, base64url (ví dụ chính thức `VKCOM/vk-apps-launch-params` – có trong bài thử); `vk_ts` bắt buộc, không quá 24 giờ;
  `vk_app_id` phải khớp `VK_APP_ID`. `HOST_AUTH_MAX_AGE` (giây, 60–86400) rút ngắn thời hạn nếu muốn.
- Máy chủ chỉ lưu nền tảng + id Telegram / VK + lúc liên kết + mốc thời gian (`auth_date` / `vk_ts`) của dữ liệu khởi chạy
  dùng gần nhất (bảng `host_links`); không lưu initData, username Telegram, ảnh. Xoá tài khoản / huỷ liên kết là xoá dòng đó.
- **Chống phát lại** (rà soát Đợt 3): dữ liệu khởi chạy có mốc cũ hơn lần dùng gần nhất của cùng Telegram / VK thì không cấp
  phiên – bản initData / `sign` bị lộ của một lần mở trước hết dùng được ngay khi người chơi mở lại Mini App (tải lại trang trong
  cùng lần mở vẫn được). Chưa chặn được: kẻ có bản lộ dùng TRƯỚC khi người chơi mở lại (trong thời hạn `HOST_AUTH_MAX_AGE`).
- **Tài khoản quản trị viên không đăng nhập / liên kết được bằng Telegram / VK** – quyền cao nhất chỉ vào bằng mật khẩu / Google.
- Tên đăng nhập tự sinh `tg_xxxxxxxx` / `vk_xxxxxxxx` (ngẫu nhiên, không chứa id Telegram / VK).
- VK: trang chép tham số có chữ ký vào sessionStorage rồi **bỏ `sign` khỏi địa chỉ** (thêm `?host=vk`) để chữ ký không lọt vào
  link sao chép / lịch sử. Lượt mở Mini App trả `referrer-policy: strict-origin` để CSS / script tải trước khi kịp bỏ `sign`
  không mang nguyên địa chỉ làm Referer. Địa chỉ lượt mở đầu (có `sign`) vẫn tới máy chủ: nếu proxy (Caddy / nginx) ghi log đầy đủ địa chỉ,
  nên tắt ghi query string hoặc giữ log ngắn hạn – ai đọc được log có thể đăng nhập thay người chơi trong thời hạn còn hiệu lực.
- Giới hạn: 30 lần dữ liệu sai / IP / 10 phút; 1 lần / giây / kết nối; tạo tài khoản chung hạn mức với đăng ký thường.
