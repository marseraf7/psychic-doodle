# Discord Activity – bản đầu (Đợt 3, 26/11/2026)

Chơi Caro ngay trong cuộc gọi / kênh của Discord. Mã: `caro/host-detect.js` (nhận biết), `caro/host-discord.js` (SDK, chế độ
khách, link ra ngoài, nút mời), `caro/vendor/discord-sdk.js` (SDK tự phục vụ), `caro/host.css` (ẩn đăng nhập / link ngoài);
máy chủ `server/src/host-embed.js` (cho nhúng, thẻ meta client id), `server/src/portal-origins.js` (Origin WebSocket).
Kiểm thử: `caro/tests/host-discord.test.js`, `server/test/discord-activity.test.js`, `caro/tests/e2e/host-discord.e2e.js`.

## 1. Cách Discord chạy Activity (tài liệu chính thức, docs.discord.com, đọc 26/11/2026)

- Activity là trang web chạy trong iframe của Discord (máy tính, web, điện thoại). Mọi yêu cầu mạng đi qua proxy của
  Discord: đường dẫn `/foo` của Activity có client id `12345678` thành `https://12345678.discordsays.com/foo`
  (trang *Networking*). Yêu cầu không có URL Mapping bị chặn (`blocked:csp`); WebSocket được hỗ trợ, WebRTC thì không.
- **URL Mappings** (Developer Portal → Activities → URL Mappings): tiền tố `/` trỏ tới tên miền của game (không ghi
  `https://`). Bản production: "The URL for your application's html should be set to the `/` route" (trang *Local
  development*).
- Discord thêm tham số vào địa chỉ khi mở: SDK 2.5.0 đọc `frame_id`, `instance_id`, `platform` (`desktop` | `mobile`) –
  thiếu là báo lỗi – và `guild_id`, `channel_id`, `location_id`, `custom_id`, `referrer_id`, `mobile_app_version` (mã
  nguồn `Discord.mjs` của gói npm).
- `new DiscordSDK(clientId)` bắt tay qua `postMessage`; `ready()` xong khi đã nối (trang *How Activities work*).
- Lệnh không cần quyền OAuth: `openExternalLink`, `openInviteDialog`, `encourageHardwareAcceleration`,
  `getActivityInstanceConnectedParticipants`, `captureLog`. `userSettingsGetLocale` cần quyền `identify` (trang
  *Embedded App SDK*).
- Activity chưa xác minh chỉ nhóm phát triển và người thử nghiệm mở được; muốn mọi người thấy / bật Discovery phải
  qua xác minh danh tính chủ nhóm + xác minh app (trang *Enabling Discovery*). Danh sách điều kiện cụ thể nằm trong
  Developer Portal (App Verification, Discovery Status) – [CHƯA XÁC MINH] chi tiết vì cần tài khoản.

## 2. Bản đầu làm gì

| Việc | Cách làm |
|---|---|
| Nhận biết | Đủ `?frame_id&instance_id&platform=desktop|mobile` (như SDK đòi) hoặc tên miền `*.discordsays.com`. Không dùng `?host=discord`: URL Mapping chỉ trỏ tiền tố → tên miền, không thêm được tham số. `CARO_HOST = CARO_SRC = 'discord'` (đo theo nguồn), lớp `html.host-discord`, nhớ trong sessionStorage. Trang web thường không bị nhận nhầm (bài thử). |
| SDK | `vendor/discord-sdk.js` chỉ nạp trong Discord (~149 KB, nén gzip ~45 KB). Client id công khai lấy từ tên miền `<client_id>.discordsays.com`; mở thẳng (thử trên máy) thì từ thẻ meta máy chủ chèn theo `DISCORD_CLIENT_ID`. Không chuyển console của game sang Discord. |
| Chế độ khách | Như bản cổng game: không đăng nhập / đăng ký (bấm vào thì báo "bản này không có đăng nhập"), ẩn giải tuần, ẩn link ra ngoài. Chat vẫn giữ. |
| Link ra ngoài | Link còn sót / `window.open` → `openExternalLink` (Discord hỏi người dùng trước khi mở). |
| Phòng chơi | Hộp "Thông tin phòng": mã + mật khẩu như cũ, nút **Mời bạn trên Discord** (`openInviteDialog`) và câu hướng dẫn "người trong cuộc gọi mở Caro → Vào phòng bằng mã". Ô link mời bị ẩn (địa chỉ discordsays.com không mở được ngoài Discord). |
| Không làm | Phòng tự động theo `instance_id`: phòng do máy chủ cấp mã ngẫu nhiên 6 số + mật khẩu 4 số (`hub/rooms.js`), không nhận mã tuỳ ý – muốn có phải sửa máy chủ (để sau). OAuth / tài khoản Discord, tiếng theo `locale` của Discord (cần quyền `identify`), service worker (trên tên miền của Discord). |
| Máy chủ | Chỉ lượt tải trang chính có đủ ba tham số: `frame-ancestors https://discord.com https://*.discord.com https://discordapp.com https://*.discordapp.com https://*.discordsays.com`, bỏ X-Frame-Options; mọi lượt khác giữ `frame-ancestors 'none'`. Không thêm nguồn script (SDK tự phục vụ, cùng nguồn qua proxy). WebSocket: nhận đúng Origin `https://<DISCORD_CLIENT_ID>.discordsays.com` – không nhận mọi `*.discordsays.com` (Activity của người khác cũng ở đó). |

Tiếng: theo ngôn ngữ trình duyệt / app Discord của máy, hoặc người chơi tự chọn trong game (lưu riêng cho tên miền
discordsays.com – không chung với trang chính).

## 3. Việc Minh làm (Discord Developer Portal – discord.com/developers/applications)

1. **New Application** → đặt tên "Caro x Gomoku" (không dùng tên / logo của ai khác). Ghi lại **Application ID** (=
   client id, công khai). **Không cần** client secret ở bản này – không đưa secret vào đâu cả.
2. **Activities → Settings** → bật **Enable Activities** (Discord tự tạo lệnh "Launch").
3. **Activities → URL Mappings** → Prefix `/`, Target: tên miền của game, không `https://` (ví dụ `caroxo.duckdns.org`
   hoặc tên miền riêng khi đã chuyển). Không bật **Application URL Override** (chỉ dùng khi chạy thử trên máy).
4. **Máy chủ**: đặt biến môi trường `DISCORD_CLIENT_ID=<Application ID>` rồi khởi động lại (thiếu biến này thì Activity
   vẫn mở nhưng **không chơi online được** – máy chủ từ chối WebSocket). Tuỳ chọn: `DISCORD_WS=0` tắt WebSocket từ
   Discord; `DISCORD_FRAME_ANCESTORS='none'` tắt cho nhúng.
5. **Thử**: Discord → Cài đặt người dùng → Nâng cao → bật **Developer Mode**. Tạo một server riêng, vào kênh thoại →
   nút Activities (biểu tượng tên lửa / App Launcher) → chọn app. Activity chưa xác minh chỉ nhóm phát triển / người thử
   mở được: thêm người thử ở mục **App Testers** của Developer Portal [CHƯA XÁC MINH tên mục chính xác hiện nay].
6. **Công khai** (sau khi Laplace báo ổn): Developer Portal → **App Verification** (xác minh danh tính chủ nhóm + app) →
   **Discovery Status** → **Enable Discovery**. Đủ điều kiện cũng không chắc được lên App Directory; bật xong có thể mất
   tới 24 giờ mới hiện. Cần trang chính sách riêng tư / điều khoản: game đã có `privacy.html` [CHƯA XÁC MINH Discord có
   đòi URL điều khoản riêng không].

## 4. Giới hạn của bản đầu

- Chỉ chơi khách: tài khoản / Elo / bạn bè của trang chính không dùng được trong Discord; tiến độ khách nằm ở tên miền
  discordsays.com (xoá dữ liệu Discord là mất).
- Ảnh từ tên miền khác (ảnh đại diện Google…) bị CSP của Discord chặn; khách không có nên gần như không thấy.
- Máy Rapfi (BOAT, phân tích) lấy mạng NNUE từ `rapfi/nets/` của máy chủ trước (qua proxy – được); nếu máy chủ chưa có
  thì lấy từ jsDelivr / GitHub → bị CSP của Discord chặn [CHƯA XÁC MINH trên máy chủ thật].
- Link chia sẻ ván / giải / video trong game vẫn là địa chỉ discordsays.com (không mở được ngoài Discord) – chỉ hộp
  Thông tin phòng đã thay. Làm tiếp nếu Activity có người dùng: link sâu qua `custom_id` + `shareLink`.
- Proxy của Discord có chuyển nguyên header CSP / Origin WebSocket / chuỗi tham số tới máy chủ như bài thử giả lập không:
  [CHƯA XÁC MINH trên Discord thật] – Laplace kiểm (mục 5).

## 5. Laplace kiểm trên máy thật

Minh chuyển phần này cho Laplace sau khi làm xong mục 3 (bước 1–5) và thêm Laplace làm người thử.

**Thiết bị**: Discord máy tính (Windows hoặc macOS), Discord web (Chrome), Discord Android, Discord iOS. Mỗi nơi:

1. Vào kênh thoại của server thử → mở Activity Caro. Ghi thời gian từ lúc bấm tới khi thấy Trang chủ.
2. Không thấy nút Đăng nhập / Đăng ký; mục Tài khoản ghi là khách. Không thấy link ra trang ngoài.
3. Chọn ngôn ngữ trong game (thử tiếng Việt, tiếng Anh) → đóng Activity, mở lại → vẫn giữ.
4. Chơi với máy 1 ván (cấp dễ) và 1 ván Rapfi (BOAT) nếu có → máy có đi không.
5. Người A: Online → Phòng chờ → Tạo phòng → hộp Thông tin phòng có mã + mật khẩu, nút "Mời bạn trên Discord", câu
   hướng dẫn; **không** có ô link. Bấm nút mời → hộp mời của Discord hiện.
6. Người B (cùng cuộc gọi, máy khác): mở Activity → Vào phòng bằng mã → chơi hết ván với A. Có trễ / rớt kết nối không.
7. Trang Xem thêm → Giấy phép mã nguồn mở → bấm link "giấy phép" của Discord SDK → mở được (trong Activity).
8. Thu nhỏ / mở lại Activity, khoá màn hình 1 phút (điện thoại) → còn ở phòng không.
9. Ảnh chụp Trang chủ và bàn cờ ở chiều dọc (điện thoại): chữ bị cắt, nút đè chữ, thanh trên / dưới che nội dung.

**Mẫu báo cáo** (mỗi thiết bị một bảng):

```
Thiết bị / bản Discord: …          Ngày giờ: …          Mạng: Wi-Fi / 4G
| Bước | Kết quả (Đạt / Không đạt) | Ghi chú (thời gian, thông báo lỗi nguyên văn, ảnh) |
| 1 mở Activity (… giây) | | |
| 2 chế độ khách | | |
| 3 giữ ngôn ngữ | | |
| 4 máy / Rapfi | | |
| 5 tạo phòng + nút mời | | |
| 6 chơi với người B | | |
| 7 link giấy phép | | |
| 8 thu nhỏ / khoá màn hình | | |
| 9 hiển thị | | |
Lỗi khác / gợi ý: …
```

Không đưa mật khẩu, token, Application secret vào báo cáo.

## 6. Dựng lại vendor/discord-sdk.js

Bản trong repo: `@discord/embedded-app-sdk` **2.5.0** (MIT, phát hành 05/05/2026), gói bằng **esbuild 0.28.2** thành IIFE
gán `window.DiscordSDK = { DiscordSDK, Events, Platform }`. Gói npm đã chép sẵn mọi phụ thuộc vào `output/lib`: zod,
uuid, eventemitter3, decimal.js-light, lodash.transform (MIT), big-integer (Unlicense), tslib (0BSD) – không có thư
viện GPL. Toàn văn giấy phép: `caro/vendor/discord-sdk-LICENSE.txt`.

Làm trong một thư mục tạm, ngoài repo (không thêm phụ thuộc vào repo):

```bash
mkdir dsdk && cd dsdk && npm init -y
npm install --ignore-scripts @discord/embedded-app-sdk@2.5.0 esbuild@0.28.2
echo "export { DiscordSDK, Events, Platform } from '@discord/embedded-app-sdk';" > entry.mjs
npx esbuild entry.mjs --bundle --format=iife --global-name=DiscordSDK --minify --target=es2019 --legal-comments=none --outfile=out-min.js
```

Rồi `caro/vendor/discord-sdk.js` = khối chú thích đầu file hiện có (sửa số phiên bản) + nội dung `out-min.js`; sửa mã
băm trong `server/test/discord-activity.test.js`; nâng phiên bản thì soát lại giấy phép các thư viện trong
`node_modules/@discord/embedded-app-sdk/output/lib` và ghép lại `discord-sdk-LICENSE.txt`. Bản 3.0 đang beta (11/2026) –
chờ bản chính thức.
