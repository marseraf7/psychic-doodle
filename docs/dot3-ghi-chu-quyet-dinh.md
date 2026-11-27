# Đợt 3 – ghi chú để Minh quyết (26/11/2026)

Các mục Đợt 3 trong `docs/ke-hoach-tiep-can-toan-cau-21-11-2026.md`. Nguồn: báo cáo của Laplace
`BAO-CAO-FACEBOOK-APP-VA-KENH-PR-CARO-21-11-2026.md` (gọi tắt **[L-FB]**) và `KE-HOACH-TRIEN-KHAI-CRAZYGAMES-ITCH-TELEGRAM-
21-11-2026.md` (**[L-CG]**, tóm tắt docs.crazygames.com đọc 21/11/2026), tài liệu chính thức đọc 26/11/2026, và mã trong repo.
[CHƯA XÁC MINH] = chưa có nguồn; [ƯỚC LƯỢNG] = Claude đoán, có căn cứ. Công tính theo "PR" (một PR vừa ≈ một lượt làm +
review + test như các đợt trước).

| Mục | Khuyến nghị | Minh cần quyết |
|---|---|---|
| Telegram đăng nhập bằng initData | Đang làm ở nhánh khác (kiểm chữ ký initData ở máy chủ) | – |
| Discord Activities | **Đã làm bản đầu** – xem `docs/discord-activity.md` | Tạo app Discord, đặt `DISCORD_CLIENT_ID`, nhờ Laplace kiểm |
| CrazyGames Full Launch | **Đã làm sẵn, tắt mặc định** (Minh chốt 27/11/2026) – `docs/crazygames-full-launch.md` | Chỉ bật khi được mời + đồng ý |
| TWA Google Play | **Không làm** – giữ app Capacitor | – (chỉ quyết nếu muốn bỏ Capacitor) |
| Facebook Approved Partner | Nộp đơn thử (0 đồng) **chỉ khi** có giấy tờ doanh nghiệp; chưa viết mã | Có / không có pháp nhân (hộ kinh doanh, công ty) |

## 1. CrazyGames Full Launch

**Dữ kiện [L-CG]:** Basic Launch không bắt buộc SDK, cấm mọi quảng cáo; xong Basic (≥ 7 ngày và ≥ 500 lượt chơi) và đạt
chỉ số thì CrazyGames *mời* Full Launch. Full Launch: **SDK bắt buộc**, có chia doanh thu quảng cáo (tỉ lệ **không công
bố**, ngưỡng chi trả 100 EUR/tháng), quảng cáo chỉ qua SDK CrazyGames và game vẫn chơi được khi bật chặn quảng cáo; tiến
trình gắn tài khoản CrazyGames (username + avatar, tự đăng nhập); multiplayer mức Full: thông tin phòng, link mời, vào
chơi ngay, giữ phòng qua các ván, tôn trọng DisableChat; sự kiện `loadingStart/Stop`, `gameplayStart/Stop`, tắt tiếng
theo nền tảng và trong lúc quảng cáo.

**Mâu thuẫn với phạm vi:** Full Launch = kiếm tiền bằng quảng cáo. Minh đã loại "Kiếm tiền" khỏi phạm vi; trang chủ và
thẻ mô tả đang ghi "free, **ad-free**" (`caro/index.html`, khoá `home_about` trong `caro/i18n-shell.js` – 8 ngôn ngữ).

**Nếu Minh đồng ý (chỉ bản CrazyGames, bản web / app giữ không quảng cáo):**

| Việc mã | Ghi chú | Công [ƯỚC LƯỢNG] |
|---|---|---|
| Quảng cáo giữa ván (midgame) qua SDK, chỉ khi `CARO_PORTAL === 'crazygames'` | Chỉ ở điểm nghỉ (hết ván, trước ván mới), không giữa ván online đang tính giờ; tắt / bật tiếng quanh quảng cáo; chặn quảng cáo vẫn chơi tiếp | 1 PR vừa |
| Rewarded (tuỳ chọn) | Ví dụ "xem quảng cáo để nhận gợi ý / đổi giao diện bàn cờ" – phải có phần thưởng thật; có thể bỏ | 1 PR nhỏ |
| Tài khoản CrazyGames qua SDK | Máy chủ kiểm token của CrazyGames → tài khoản Caro riêng (như Telegram initData); username / avatar CrazyGames | 1 PR vừa (có phần máy chủ + bảo mật) |
| Lưu dữ liệu qua SDK (Data module) | Tiến độ khách (câu đố, học, cài đặt) đồng bộ theo tài khoản CrazyGames | 1 PR nhỏ–vừa |
| Multiplayer mức Full | Link mời qua SDK, giữ phòng qua ván (đã có tái đấu), tôn trọng DisableChat (bản cổng đã tắt chat tự do) | 1 PR nhỏ |
| Chữ "ad-free" | Bỏ khỏi bản CrazyGames (bản dựng cổng thay chuỗi) hoặc sửa toàn bộ 8 ngôn ngữ | nhỏ, cùng PR quảng cáo |
| Kiểm thử + QA CrazyGames | e2e với SDK giả, QA Tool của CrazyGames, vòng sửa theo phản hồi | 1 PR + chờ QA |

Tổng [ƯỚC LƯỢNG]: 4–5 PR vừa. Rủi ro: doanh thu không đoán được (tỉ lệ không công bố, khán giả quốc tế); quảng cáo xen
vào game đối kháng có tính giờ dễ làm người chơi bỏ; thêm nghĩa vụ hợp đồng / thuế (Tipalti).

**Khuyến nghị:** giữ Basic Launch (không quảng cáo) làm kênh kéo người. Nếu được mời Full Launch thì hỏi CrazyGames trước
xem có ở lại Basic lâu dài được không [CHƯA XÁC MINH]; chỉ nhận Full khi Minh chủ động muốn thử kiếm tiền, và khi đó
làm theo bảng trên, quảng cáo chỉ ở bản CrazyGames.

## 2. TWA Google Play

**Hiện trạng repo:** đã có app Android / iOS bằng Capacitor (`app/`, cùng mã `caro/`), CI dựng APK + AAB
(`.github/workflows/app.yml`), máy chủ phục vụ `/.well-known/assetlinks.json` theo `APP_LINK_SHA256` (link sâu), kế hoạch
phát hành Play ở `app/PHAT-HANH.md`. Cả hai cách đều cần tài khoản Play 25 USD và, với tài khoản cá nhân mới, thử nghiệm kín
≥ 12 người trong 14 ngày [L-FB 2.8; `app/PHAT-HANH.md`].

| | Capacitor (đang có) | TWA (Bubblewrap / PWABuilder) |
|---|---|---|
| Nội dung | File game nằm trong app – chơi offline ngay, không phụ thuộc trình duyệt | Chrome hiển thị trang web thật – cập nhật theo web, không cần dựng lại app |
| Tính năng gốc | Nút Back, bảng chia sẻ, rung, đăng nhập Google bằng tài khoản trên máy (`caro/native.js`) | Chỉ những gì web làm được trong Chrome [CHƯA XÁC MINH: nút Google của web có chạy trong TWA không] |
| Điều kiện | Không cần tên miền ổn định để chạy | Cần HTTPS + `assetlinks.json` ổn định; máy phải có Chrome (hoặc trình duyệt hỗ trợ TWA) |
| Dữ liệu | Riêng của app | Chung với trang web trong Chrome (đăng nhập / tiến độ dùng chung) |
| Công | Đã xong, có test máy ảo trên CI | Gói mới + kiểm lại toàn bộ trên máy thật |

Chính sách Play (mục Spam, "Repetitive Content", support.google.com/googleplay/android-developer/answer/9899034) cấm
"Creating multiple apps with highly similar functionality, content, and user experience" → không đăng **cả hai**.

**Khuyến nghị:** không làm TWA; dồn sức đưa app Capacitor lên Play theo `app/PHAT-HANH.md`. Chỉ cân nhắc TWA nếu Minh
muốn **thay** Capacitor (bỏ việc dựng app mỗi lần cập nhật) – điều kiện: có tên miền riêng ổn định trước (assetlinks gắn
tên miền), chấp nhận mất đăng nhập Google gốc / offline đóng gói sẵn, và dùng cùng tên gói + khoá ký nếu muốn cập nhật đè
lên cùng trang Play [CHƯA XÁC MINH quy trình đổi từ Capacitor sang TWA trên cùng trang].

## 3. Facebook Approved Partner / Instant Games – "phép thử 0 đồng"

**Laplace báo [L-FB phần 1]:**
- Instant Games còn mở nhưng phải được nhận vào **Approved Partner Program** trước khi lên sóng: tài khoản Facebook
  Business **đã xác minh doanh nghiệp**, Developer account, đơn tiếng Anh kèm link game đã phát hành; bị từ chối thì
  **180 ngày** sau mới nộp lại. Không mất phí. Sau đó còn vòng duyệt game 5–7 ngày làm việc.
- Kỹ thuật hợp: được dùng máy chủ riêng + WebSocket, xác thực bằng `getSignedPlayerInfoAsync`; gói khởi động nên < 5 MB
  (engine Wasm phải tải sau); từ 01/08/2025 game mới bắt buộc **Zero Permissions** (SDK v8) – danh tính là ASID, token
  tài khoản web hiện tại không dùng được nguyên trạng; **không được dẫn người chơi ra URL ngoài**; không chơi offline.
- Chat tự xây được phép nhưng tự chịu kiểm duyệt theo Community Standards; Tournaments / Leaderboards có API chính thức.
- Không bắt buộc quảng cáo / IAP. Canvas / Web Games đã khai tử 30/09/2026 – chỉ còn đường Instant Games.
- Ẩn số: cá nhân ở Việt Nam không có giấy tờ doanh nghiệp có qua xác minh doanh nghiệp không [CHƯA XÁC MINH]; kết luận
  của Laplace: "CHỜ – thử song song, không đầu tư chính".

**Việc Minh làm (nếu thử):** tạo Facebook Business + xác minh doanh nghiệp (cần giấy tờ pháp nhân); tài khoản Developer,
tạo app gắn Business; viết đơn Approved Partner tiếng Anh (mô tả đội ngũ / mục tiêu, link trang web game – nên dùng tên
miền riêng thay duckdns); chờ kết quả. Claude soạn được bản nháp đơn tiếng Anh nếu Minh muốn.

**Việc mã – chỉ khi được nhận [ƯỚC LƯỢNG]:**

| Việc | Công |
|---|---|
| Bản dựng riêng `instant` (như bản cổng: `server/scripts/build-portal.js`): nạp SDK FBInstant v8 từ Meta, `initializeAsync` → `setLoadingProgress` → `startGameAsync`, khách mặc định, ẩn link ngoài, không service worker | 1 PR vừa |
| Đăng nhập bằng chữ ký người chơi (máy chủ kiểm chữ ký bằng app secret – biến môi trường, không vào repo) → tài khoản Caro theo ASID; liên kết với tài khoản web bằng mã nhập tay (tuỳ chọn) | 1 PR vừa (bảo mật) |
| Gói khởi động < 5 MB, Rapfi chỉ tải khi cần (đã tải sau sẵn – cần đo lại trong bản dựng) | nhỏ – vừa |
| Mời / chia sẻ qua `shareAsync` / `context.chooseAsync` thay link; Tournaments / Leaderboards của Meta (tuỳ chọn) | 1 PR vừa |
| Chat: giữ chat nhanh câu mẫu như bản cổng (tránh nghĩa vụ kiểm duyệt) | nhỏ |
| Ảnh / video giới thiệu, chính sách riêng tư, vòng duyệt game | Minh + Claude |

Tổng [ƯỚC LƯỢNG]: 3–4 PR vừa + vòng duyệt. Rủi ro: bị từ chối là khoá 180 ngày; khám phá tự nhiên trên Facebook nhỏ, phải
tự kéo [L-FB 1.5]; bản Instant là "đảo riêng" không dẫn người về web.

**Khuyến nghị:** chỉ nộp khi đã có giấy tờ doanh nghiệp và tên miền riêng (đơn mạnh hơn, tránh mất lượt 180 ngày vì hồ sơ
yếu). Không viết mã trước khi được nhận. Nếu chưa có pháp nhân: để sau, ưu tiên các kênh 0 đồng khác (video ngắn, Group
Facebook, giải tuần – [L-FB 2.13]).

## 4. Telegram đăng nhập bằng initData

Đã làm (Telegram + VK): máy chủ kiểm chữ ký initData / tham số VK, không tin `user.id` phía trình duyệt – cách bật và quyết
định bảo mật ở `docs/huong-dan-cong-game-mini-app-22-11-2026.md` mục 4, bài kiểm cho Laplace ở
`docs/laplace-kiem-dang-nhap-mini-app-26-11-2026.md`. Rà soát Đợt 3 (27/11/2026) thêm: chống phát lại (dữ liệu cũ hơn lần dùng
gần nhất bị từ chối), `referrer-policy: strict-origin` ở lượt mở Mini App. Cần Minh quyết:
- Nhật ký truy cập của Caddy (`/var/log/caddy/caro-access.log`) ghi nguyên địa chỉ lượt mở VK (có `sign`, `vk_user_id`). Nên
  thêm bộ lọc xoá tham số `sign` trong khối `log` của Caddyfile (chưa sửa vì chưa thử được cú pháp trên Caddy thật) hoặc giữ log
  ngắn hạn.
- `HOST_AUTH_MAX_AGE` mặc định 24 giờ: rút xuống (vd. 3600) thì bản lộ hết hạn sớm hơn, nhưng người để Mini App mở quá thời hạn
  rồi mới bấm "Lưu tiến độ" sẽ phải đóng / mở lại.

## 5. Discord Activities

Đã làm bản đầu (khách, chưa OAuth): xem `docs/discord-activity.md` – các bước trong Developer Portal, biến
`DISCORD_CLIENT_ID`, giới hạn, mục cho Laplace kiểm trên Discord máy tính / web / Android / iOS. Theo [L-FB 2.6], Discord mở
Activities cho mọi nhà phát triển từ 09/2024, không có cổng kiểu Approved Partner; công khai cần xác minh app
(docs.discord.com → Enabling Discovery).
