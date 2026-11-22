# Đổi tên miền không mất dữ liệu (cho Minh)

Kế hoạch: `docs/ke-hoach-tiep-can-toan-cau-21-11-2026.md` (Đợt 0, bước 0). Tên miền hiện tại: `caroxo.duckdns.org`
(một chỗ duy nhất trong mã: `server/src/site.js` → `DEFAULT_HOST`). Dưới đây `TEN_MOI` là tên miền đã mua (vd. `caro.vn`).

## Cách hoạt động

- Cả tên cũ lẫn tên mới cùng trỏ về **một máy chủ**; máy chủ phân biệt theo tên trình duyệt gọi (header Host).
- Người mở tên cũ bằng trình duyệt: thấy trang "Đang chuyển…" (không phải app) → trang gỡ bản app cũ (service worker,
  bộ nhớ đệm), ghé qua tên mới lấy **vé** (`/api/migrate/begin` – máy chủ đặt cookie `caro_mig` 15 phút ở tên mới rồi đưa về
  tên cũ), gom dữ liệu trên máy (đăng nhập, khoá khách, cài đặt, tiến độ, ván lưu trên máy – tối đa ~500 KB), gửi lên
  máy chủ kèm vé lấy **mã dùng một lần** (128 bit, 10 phút), rồi sang `https://TEN_MOI/<cùng đường dẫn>?…&mig=<mã>`. Ở tên
  mới, app lấy dữ liệu một lần (máy chủ xoá ngay) – **chỉ trình duyệt có cookie vé của lượt đó lấy được**, nên link
  `?mig=` do người khác gửi không "đăng nhập hộ" được (login CSRF) – chỉ điền các khoá **chưa có** (không ghi đè dữ liệu
  mới hơn), bỏ `?mig=`. Vé chỉ được gửi về tên cũ có trong `MOVED_FROM` (**bắt buộc khai** – bỏ trống thì vẫn chuyển hướng
  nhưng không mang dữ liệu).
- Máy tìm kiếm, máy đọc link (Zalo / Messenger / Facebook), file, ảnh, API, trang nhúng: **301** sang tên mới.
- Vẫn chạy ở tên cũ (không chuyển): WebSocket, `/mcp` (connector cũ), `/.well-known/*` (link sâu app), `/healthz`, POST của
  app cũ, API gọi từ app Android / iOS / desktop và bản GitHub Pages. App đã cài trỏ tên cũ **vẫn chơi được**.
- Mã: `server/src/domain-move.js`, `caro/migrate-out.js` (tên cũ), `caro/migrate-in.js` (tên mới). Kiểm thử:
  `server/test/domain-move.test.js`, `caro/tests/e2e/domain-move.e2e.js` (127.0.0.1 = tên cũ, localhost = tên mới).

## Các bước khi đã mua tên miền

1. **DNS** (trang quản lý tên miền): bản ghi `A` của `TEN_MOI` (và `www` nếu muốn) → IP máy chủ hiện tại (xem
   `nslookup caroxo.duckdns.org`). Có IPv6 thì thêm `AAAA`. Đợi `nslookup TEN_MOI` ra đúng IP. **Giữ DuckDNS** trỏ về máy
   này lâu dài (ít nhất 6–12 tháng): link cũ, app cũ, người chưa quay lại vẫn cần tên cũ.
2. **Mã nguồn** (trên máy có repo): `bash scripts/set-domain.sh TEN_MOI` → sửa `server/src/site.js`, `caro/config.js`
   (bản GitHub Pages), `caro/index.html` (canonical), `caro/connector.html`, `caro/privacy.html`, tài liệu Claude
   Directory (kể cả mã `ui.domain`), `app/README.md`; **thêm** tên mới (giữ tên cũ) vào link sâu Android / iOS; tăng
   `CACHE`. Danh sách: `scripts/domain-files.js`. Rồi `cd server && npm test`, commit, merge, để máy chủ tự cập nhật
   (`update.sh`) hoặc `sudo bash /opt/caro/server/deploy/update.sh`.
3. **Máy chủ** (SSH vào VPS, sau bước 1–2):
   `sudo bash /opt/caro/server/deploy/move-domain.sh TEN_MOI caroxo.duckdns.org caroxo.ddnsgeek.com`
   – đặt trong `/etc/caro/caro.env`: `PUBLIC_URL=https://TEN_MOI`, `MOVED_TO=https://TEN_MOI`,
   `MOVED_FROM=caroxo.duckdns.org,caroxo.ddnsgeek.com`; dựng lại `/etc/caddy/Caddyfile` với cả tên mới + tên cũ (Caddy tự
   xin chứng chỉ), nạp lại Caddy, khởi động lại máy chủ (có bản sao lưu `.bak-…` của hai file). Kiểm tra theo lời in ra.
   Nếu có `WS_ALLOWED_ORIGINS` / `CARO_MCP_URL` / `CARO_PUBLIC_HOST` cũ trong `caro.env`: sửa sang tên mới (hoặc xoá
   `CARO_MCP_URL` để máy chủ tự tính).
4. **Thử**: trình duyệt đã từng chơi ở tên cũ → mở `https://caroxo.duckdns.org/` → tự sang tên mới, còn đăng nhập + tiến
   độ. `curl -sI https://caroxo.duckdns.org/robots.txt` → `301` về tên mới. Google Search Console: thêm tài sản tên mới
   (xác minh DNS), gửi `https://TEN_MOI/sitemap.xml`; ở tài sản tên cũ dùng **Change of Address** (Đổi địa chỉ).
5. **App Android** (Play Console): dựng bản mới với biến `CARO_SERVER_URL=https://TEN_MOI` (GitHub → Settings → Secrets
   and variables → Actions → Variables, xem `app/README.md`; bỏ trống thì lấy tên miền trong `site.js` sau bước 2). Link sâu
   (App Links) đã có cả hai tên sau bước 2; `/.well-known/assetlinks.json` máy chủ phục vụ ở cả hai tên (cùng
   `APP_LINK_SHA256`). Trong Play Console sửa **Privacy policy URL** và link xoá tài khoản sang `https://TEN_MOI/privacy.html…`.
   Bản app cũ vẫn chạy (nói chuyện với tên cũ) – không cần ép cập nhật ngay; khi muốn thì tăng `MIN_APP_VERSION`.
6. **App iOS** (App Store Connect / Xcode): Associated Domains đã có `applinks:TEN_MOI` (bước 2); dựng bản mới như Android,
   sửa Privacy Policy URL / Support URL. Apple tải `apple-app-site-association` từ tên mới (cùng `APPLE_TEAM_ID`).
7. **App desktop** (Tauri, thí điểm): dựng lại (`CARO_SERVER_URL` như trên) – CSP của cửa sổ app lấy theo máy chủ lúc dựng.
8. **Claude Directory**: connector cũ `https://caroxo.duckdns.org/mcp` vẫn chạy (máy chủ nhận cả tên cũ, `ui.domain`
   tính theo tên Claude đang nối). Sửa listing / nộp lại với `https://TEN_MOI/mcp` theo
   `docs/claude-directory/SUBMISSION.md` (bước 2 đã đổi URL và mã `ui.domain` trong đó: `…claudemcpcontent.com` mới).
   Người đã thêm connector thủ công nên thêm lại bằng URL mới.
9. **Kênh khác**: sửa link ở trang Facebook / Zalo OA / VK / Telegram bot / itch.io / CrazyGames, Google OAuth (thêm
   `https://TEN_MOI` vào Authorized JavaScript origins của `GOOGLE_CLIENT_ID` – thiếu thì nút Google không chạy ở tên mới).

## Lưu ý

- Dữ liệu ở tên cũ không bị xoá (người dùng quay lại tên cũ thì lại được chuyển, tên mới không bị ghi đè).
- Trình duyệt chặn bộ nhớ (chế độ riêng tư) hoặc dữ liệu > 500 KB: phần vừa đủ được mang theo theo thứ tự ưu tiên
  (đăng nhập, khoá khách, tiến độ, cài đặt, ván lưu trên máy mới nhất trước). Người có tài khoản luôn còn dữ liệu trên máy chủ.
- PWA đã "cài" ở tên cũ mở ra trang chuyển rồi sang tên mới trong trình duyệt; người chơi cài lại PWA ở tên mới (một lần).
- Bỏ hẳn tên cũ (sau nhiều tháng): xoá `MOVED_FROM` / tên cũ khỏi Caddy là lúc link cũ chết – không vội.
