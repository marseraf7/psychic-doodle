# Cờ Caro

Game cờ caro chạy trên web, chơi mượt trên cả điện thoại lẫn máy tính.

- **Bàn cờ vô hạn**: kéo để di chuyển, chụm 2 ngón / cuộn chuột để phóng to thu nhỏ.
- **Luật chặn 2 đầu** (phổ biến ở Việt Nam):
  - 4 quân liền, không bị chặn đầu nào → thắng.
  - 5 quân liền, bị chặn 1 đầu → thắng.
  - Bị chặn cả 2 đầu → không tính thắng.
- Chơi **2 người cùng máy**, **với máy** (Dễ / Vừa / Khó), hoặc **online**:
  **giải đấu** Arena / loại trực tiếp / nhánh thắng – thua / vòng tròn / Thụy Sĩ (ghép được nhiều giai đoạn, ví dụ
  vòng bảng → playoff) và **câu lạc bộ**, **tìm trận nhanh** (ghép với người có Elo gần mình), phòng công khai (ai cũng vào được từ danh sách
  "Phòng đang chờ"), tạo phòng riêng (mã 6 số + mật khẩu 3 số, gửi link mời), tái đấu tự đổi bên đi trước,
  thách đấu bạn bè Bo1/Bo3/Bo5, tài khoản riêng hoặc Google, kết bạn và xem ai đang online,
  xin hoà, chat nhanh, nhắn tin bạn bè, lịch sử 10 trận + xem lại + link chia sẻ, đối đầu, Elo và bảng xếp hạng.
  Phần online cần chạy máy chủ trong thư mục [`server/`](../server/README.md).
- Đi lại (bật/tắt trong Cài đặt: "Cho phép đi lại"), lưu ván đang chơi, tỉ số.
- **Thời gian mỗi nước**: không giới hạn / 10 / 20 / 30 giây – hết giờ mà chưa đánh thì thua
  (offline: tạm dừng khi mở Cài đặt; online: máy chủ đếm giờ, người tạo phòng/người thách đấu chọn).
- **Giao diện** Sáng / Tối / Theo hệ thống.
- **Ngôn ngữ**: Tiếng Việt, English, Русский, 中文 (lần đầu tự chọn theo ngôn ngữ trình duyệt,
  không khớp thì dùng tiếng Việt; đổi trong Cài đặt). Bản dịch nằm trong `i18n.js`.
- Chế độ "chạm 2 lần để đánh" (bật sẵn trên điện thoại) để tránh bấm nhầm.
- **Không dùng tài nguyên bên ngoài** (không CDN, không Google Fonts, không quảng cáo/analytics):
  mọi thứ nằm trong thư mục này, nên không bị chặn ở Việt Nam hay Nga.
  Có service worker nên đã mở một lần là chơi được cả khi mất mạng; có thể "Thêm vào màn hình chính".

## Chạy

Chỉ là file tĩnh, không cần cài đặt hay build:

```bash
cd caro
python3 -m http.server 8000   # rồi mở http://localhost:8000
```

Mở trực tiếp `index.html` cũng chơi được (khi đó không có chế độ offline).

## Đăng lên mạng

- **Có chế độ online**: chạy máy chủ ở thư mục `server/` (xem [server/README.md](../server/README.md)) –
  máy chủ phục vụ luôn giao diện này.
- **Chỉ chơi offline** – **GitHub Pages** (đã có sẵn workflow `.github/workflows/pages.yml`): vào
  *Settings → Pages → Source: GitHub Actions*; mỗi lần gộp vào nhánh `main`,
  game tự đăng lên `https://<tên-tài-khoản>.github.io/<tên-repo>/`.
- Hoặc tải thư mục `caro/` lên bất kỳ hosting tĩnh nào (Cloudflare Pages, Netlify,
  hosting trong nước…) – nên chọn nơi truy cập ổn định ở cả hai nước.

## Phím tắt (máy tính)

`←↑→↓` di chuyển · `+`/`-` phóng to/thu nhỏ · `C` về giữa · `N` ván mới · `Ctrl+Z` đi lại

## Kiểm thử

```bash
node caro/tests/rules.test.js
```

Kiểm thử trình duyệt cho giải đấu (cần Playwright + Chromium; mỗi kịch bản tự bật máy chủ trên dữ liệu tạm,
ảnh chụp màn hình lưu ở `E2E_OUT` hoặc thư mục tạm):

```bash
node caro/tests/e2e/tour-basic.e2e.js    # câu lạc bộ, Arena, loại trực tiếp
node caro/tests/e2e/tour-stages.e2e.js   # vòng bảng (xếp bảng tay) → playoff, Thụy Sĩ → nhánh thắng – thua
```

## Cấu trúc

| File | Nội dung |
|---|---|
| `rules.js` | Luật thắng + AI (dùng chung cho trình duyệt và Node) |
| `app.js` | Vẽ bàn cờ (canvas), xử lý chạm/chuột/phím, lưu trạng thái, chế độ xem lại ván |
| `ai-worker.js` | Chạy AI trong Web Worker để giao diện không bị khựng |
| `sound.js` | Âm thanh tạo bằng Web Audio (không cần file âm thanh) |
| `i18n.js`, `theme.js` | Bản dịch 4 ngôn ngữ; giao diện Sáng/Tối/Hệ thống |
| `online.js`, `config.js` | Chế độ online: kết nối máy chủ, tài khoản, bạn bè, phòng, thách đấu |
| `native.js` | Chỉ có tác dụng trong ứng dụng Android / iOS ([`app/`](../app/README.md)): nút Back, chia sẻ, rung, đăng nhập Google gốc |
| `match.js` | Tìm trận nhanh, danh sách phòng công khai đang chờ |
| `tour.js` | Giải đấu – phần lõi: điều hướng trong hộp thoại, danh sách giải, trang giải (thông tin, nút thao tác, người chơi, bảng xếp hạng Arena), trang duyệt của quản trị viên. Các file dưới cắm vào `window.CaroTourKit` |
| `tour-stages.js` | Vẽ các giai đoạn của giải: nhánh loại trực tiếp, nhánh thắng – thua + chung kết tổng, bảng vòng tròn, bảng Thụy Sĩ, danh sách trận |
| `tour-form.js` | Form tạo giải: mẫu có sẵn và trình ghép tối đa 3 giai đoạn |
| `tour-groups.js` | Xếp bảng (ban tổ chức, trước khi bắt đầu): kéo thả hoặc chọn bảng cho từng người, lưu / chia tự động |
| `club.js` | Câu lạc bộ: danh sách, trang CLB, tạo CLB, quản lý thành viên |
| `social.js` | Lịch sử & xem lại, bảng xếp hạng, nhắn tin, chặn / báo cáo, mật khẩu & email, chat nhanh |
| `index.html`, `style.css` | Giao diện |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Chạy offline, cài như ứng dụng |
