# Cờ Caro

Game cờ caro chạy trên web, chơi mượt trên cả điện thoại lẫn máy tính.

- **Bàn cờ vô hạn**: kéo để di chuyển, chụm 2 ngón / cuộn chuột để phóng to thu nhỏ.
- **Luật chặn 2 đầu** (phổ biến ở Việt Nam):
  - 4 quân liền, không bị chặn đầu nào → thắng.
  - 5 quân liền, bị chặn 1 đầu → thắng.
  - Bị chặn cả 2 đầu → không tính thắng.
- Chơi **2 người cùng máy**, **với máy** (6 nhân vật có tính cách, xem dưới), hoặc **online**:
  **giải đấu** Arena / loại trực tiếp / nhánh thắng – thua / vòng tròn / Thụy Sĩ (ghép được nhiều giai đoạn, ví dụ
  vòng bảng → playoff) và **câu lạc bộ**, **tìm trận nhanh** (ghép với người có điểm gần mình), phòng công khai (ai cũng vào được từ danh sách
  "Phòng đang chờ"), tạo phòng riêng (mã 6 số + mật khẩu 3 số, gửi link mời), tái đấu tự đổi bên đi trước,
  thách đấu bạn bè Bo1/Bo3/Bo5, tài khoản riêng hoặc Google, kết bạn và xem ai đang online,
  xin hoà, chat nhanh, nhắn tin bạn bè, lịch sử 10 trận + xem lại + link chia sẻ, đối đầu, điểm Glicko-2 và bảng xếp hạng theo loại thời gian, xem trực tiếp, hồ sơ người chơi.
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

## Học cờ: máy có tính cách, phân tích ván, giải đố (học theo chess.com / Lichess)

- **6 nhân vật máy** (`bots.js`), mỗi người một sức cờ ước tính và lời thoại riêng:
  Na ~600 · Tí ~900 · Bin ~1200 · Cô Mai ~1500 · Thầy Minh ~1800 · Rồng ~2100.
  Sức cờ tạo bằng cách pha AI của `rules.js` (mức 1–3, độ sâu / thời gian tìm chuỗi ép) với lỗi có chủ đích
  (đánh "cho vui", quên chặn, không thấy nước thắng). Mới vào mở sẵn 3 nhân vật đầu; thắng nhân vật nào thì mở khoá
  người kế tiếp. Người dùng bản cũ đang chọn Dễ / Vừa / Khó được chuyển sang Tí / Cô Mai / Thầy Minh.
  Thứ tự sức cờ đã kiểm bằng cho máy tự đấu (mỗi cặp liền kề, người sau thắng nhiều hơn).
- **Phân tích ván** (`analysis.js`, chạy trong Web Worker): bấm "Phân tích" ở thẻ kết quả hoặc khi xem lại ván.
  Mỗi nước được xếp loại dựa trên chuỗi nước ép (VCF) của hai bên: Xuất sắc `!!` (tự tìm ra chuỗi thắng ≥ 3 nước),
  Tốt nhất `!`, Tốt, Bỏ lỡ `×` (có nước / chuỗi thắng mà không đi), Sai lầm `?` (để đối thủ có chuỗi ép thắng
  trong khi có nước tránh được), Sai lầm nặng `??` (để thua sau 1–2 nước), Thế đã thua. Có độ chính xác (%) từng bên,
  dải màu từng nước, thời điểm quan trọng; trên bàn cờ đánh dấu loại nước và khoanh xanh nước tốt hơn.
  **Thử lại**: bày lại thế cờ trước nước sai để tự tìm nước đúng (máy kiểm tra và tự chặn).
- **Giải đố** (`study.js`, dữ liệu `puzzles.json`): tìm chuỗi nước ép thắng; máy tự chặn sau mỗi nước đúng.
  Ba chế độ: *Có xếp hạng* (điểm giải đố kiểu Elo, chọn bài gần điểm của bạn), *Chuỗi đúng* (khó dần, sai là hết),
  *Bài của ngày* (giống nhau cho mọi người). Có Gợi ý, Đáp án (tự đi hết lời giải). Điểm, kỷ lục lưu trên máy.
  Bộ 300 bài sinh tự động: `node server/scripts/gen-puzzles.js [số bài] [hạt giống]` – cho các nhân vật máy
  đấu với nhau, lấy thế cờ sớm nhất có chuỗi ép 2–7 nước (và một bài dễ ở giữa chuỗi), bỏ bài trùng hình
  (kể cả xoay / lật), chấm độ khó theo độ dài chuỗi và số nước "bẫy".
- Nút **Về giữa** chuyển thành nút tròn nổi ở góc phải để thanh dưới có chỗ cho **Giải đố**.

## Thi đấu, cộng đồng và tuỳ chỉnh (đợt B/C)

- **Đồng hồ tổng + cộng giờ** (1+1, 3+2, 5+3, 10+5) bên cạnh giới hạn mỗi nước: chọn ở Chơi nhanh, tạo phòng,
  thách đấu, tạo giải. Thanh trên hiện đồng hồ hai bên, đỏ khi còn dưới 10 giây.
- **Luật khai cuộc Swap2** (tuỳ chọn): thẻ hướng dẫn đặt 3 quân, nút chọn bên.
- **Điểm Glicko-2 theo loại thời gian**, dấu ? cho điểm tạm, bảng xếp hạng có tab Siêu chớp / Chớp / Nhanh / Chậm.
- **Hồ sơ người chơi** (`profile.js`): bấm tên ở bạn bè, bảng xếp hạng, phòng, giải đấu. Biểu đồ điểm (chạm / rê để xem),
  thống kê, chuỗi thắng, giải đấu, ván gần đây.
- **Xem trực tiếp** (`watch.js`): mục "Đang diễn ra" trong bảng Online, nút "Xem" cạnh bạn bè đang chơi, nhãn "● Đang đấu"
  và biểu tượng mắt trong trang giải. Chế độ xem chỉ đọc, có nút "Ván khác" / "Thôi xem".
- **Học chơi** (`learn.js`): 6 bài tương tác (năm quân, chặn hai đầu, bốn mở, ba mở, thắng kép, chuỗi ép).
  Mở game lần đầu: thẻ "Bạn chơi Caro tới đâu?" để chọn bài học / đối thủ phù hợp (không chặn bàn cờ).
- **Thành tích** (`habits.js`): chuỗi ngày chơi liên tiếp (lịch 14 ngày) và 19 huy hiệu (thắng từng nhân vật máy,
  giải đố, học xong, online, điểm, vô địch giải). Lưu trên máy; huy hiệu online dựa vào thống kê tài khoản.
- **Chia sẻ ảnh / GIF** (`share.js`): trong chế độ xem lại bấm "Chia sẻ" → ảnh PNG thế cờ cuối hoặc GIF động từng nước
  (mã hoá GIF ngay trên máy, không cần thư viện), hoặc link xem lại. Điện thoại: bảng chia sẻ của hệ thống
  (ứng dụng dùng thêm plugin `@capacitor/filesystem` để ghi file tạm); máy tính: tải file về.
- **Tuỳ chỉnh bàn cờ** (`boardstyle.js`, Cài đặt → Bàn cờ): màu bàn Giấy / Gỗ / Xanh lá / Xanh dương / Đêm,
  kiểu quân X/O mảnh / đậm / quân đá đen trắng, kiểu âm thanh Mặc định / Gõ gỗ / Nhẹ.

## Học từ Lichess (đợt D)

- **Thao tác trong ván** (`gamex.js`, thẻ nổi trên thanh dưới): đếm ngược đi nước đầu ở phòng gặp người lạ,
  "+15 giây cho đối thủ", "Xin đi lại" (phòng riêng / bạn bè) và trả lời lời xin đi lại, "Berserk" ở giải Arena.
  Nút "Đầu hàng" thành "Huỷ ván" khi ván chưa quá 1 nước.
- **Puzzle Storm** (`storm.js`): giải càng nhiều bài càng tốt trong 3 phút, bài khó dần; đi sai mất 10 giây,
  chuỗi đúng 5 / 12 / 20 / 30 bài được cộng 3 / 5 / 7 / 10 giây; kỷ lục lưu trên máy.
- **Độ khó bài đố tính điểm**: Dễ nhất / Dễ / Vừa sức / Khó / Khó nhất (lệch −600 … +600 so với điểm giải đố).
- **Hồ sơ**: thống kê sâu theo loại thời gian và hoạt động 30 ngày; **trang Duyệt** của quản trị viên có số liệu máy chủ.
- **Trang giải**: mục "Ván mất kết nối" – ban tổ chức bấm Công nhận / Huỷ kết quả / Cho đấu lại (`tour-disputes.js`).

## Phím tắt (máy tính)

`←↑→↓` di chuyển · `+`/`-` phóng to/thu nhỏ · `C` về giữa · `N` ván mới · `Ctrl+Z` đi lại

## Giao diện (học theo Lichess)

- **Phông Noto Sans** (giống Lichess), lưu trong `fonts/`, không tải từ dịch vụ ngoài; đủ dấu tiếng Việt và chữ Nga,
  chữ Hán dùng phông Noto Sans SC / PingFang của máy. Trang tiếng Việt chỉ tải ~49 KB phông.
- **Thang cỡ chữ** duy nhất trong `style.css` (`--fs-2xs` … `--fs-xl`): co giãn theo bề rộng màn hình bằng `clamp()`
  và tính theo `rem` (theo cỡ chữ người dùng đặt). Không ghi cỡ chữ bằng px ở chỗ khác; ô nhập luôn ≥16px (iOS không tự phóng to).
- **Biểu tượng SVG** (`index.html`, `<symbol id="i-…">`): nét 2px cùng một kiểu, thay cho ký tự / emoji vốn hiện khác nhau trên mỗi máy.
- **Nút chọn dạng phân đoạn** (`.seg`): các lựa chọn liền một khối trên một hàng; ô radio thật vẫn còn (trong suốt, phủ kín ô)
  để bàn phím, trình đọc màn hình và kiểm thử dùng được.
- **Chơi nhanh**: lưới ô như Lichess – bấm một ô là tìm trận ngay với thời gian đó.
- Hiệu ứng mở hộp thoại / bấm nút ngắn; tắt hết khi máy bật "giảm chuyển động".

## Kiểm thử

```bash
node caro/tests/rules.test.js
node caro/tests/study.test.js    # phân tích ván, nhân vật máy, kiểm từng bài đố có lời giải đúng
```

Kiểm thử trình duyệt cho giải đấu (cần Playwright + Chromium; mỗi kịch bản tự bật máy chủ trên dữ liệu tạm,
ảnh chụp màn hình lưu ở `E2E_OUT` hoặc thư mục tạm):

```bash
node caro/tests/e2e/tour-basic.e2e.js    # câu lạc bộ, Arena, loại trực tiếp
node caro/tests/e2e/tour-stages.e2e.js   # vòng bảng (xếp bảng tay) → playoff, Thụy Sĩ → nhánh thắng – thua
node caro/tests/e2e/study.e2e.js         # nhân vật máy, phân tích ván + Thử lại, giải đố (3 chế độ)
node caro/tests/e2e/play2.e2e.js         # đồng hồ + Swap2, xem trực tiếp, hồ sơ, học chơi, thành tích, chia sẻ ảnh/GIF, bàn cờ
node caro/tests/e2e/batchd.e2e.js        # huỷ ván, nước đầu, đi lại, +15 giây, thống kê sâu, số liệu máy chủ, ván giải mất kết nối, Storm, ảnh og
```

## Cấu trúc

| File | Nội dung |
|---|---|
| `rules.js` | Luật thắng + AI (dùng chung cho trình duyệt và Node) |
| `app.js` | Vẽ bàn cờ (canvas), xử lý chạm/chuột/phím, lưu trạng thái, chế độ xem lại ván |
| `ai-worker.js` | Chạy AI (nhân vật máy) và phân tích ván trong Web Worker để giao diện không bị khựng |
| `bots.js` | 6 nhân vật máy: số liệu sức cờ, `botMove` |
| `analysis.js` | Phân tích ván: xếp loại từng nước, độ chính xác, kiểm tra nước thắng / nước giữ thế (dùng chung trình duyệt, Worker, Node) |
| `study.js` | Bảng phân tích trong chế độ xem lại, "Thử lại", Giải đố (3 chế độ). Mượn bàn cờ của `app.js` qua `CaroApp.enterExt` |
| `swap.js` | Luật Swap2: thẻ hướng dẫn đặt quân, nút chọn bên |
| `watch.js` | Xem trực tiếp: danh sách "Đang diễn ra", nút Xem (bạn bè, trận trong giải), chế độ người xem |
| `profile.js` | Hồ sơ người chơi: điểm từng loại + biểu đồ, thống kê, ván gần đây |
| `learn.js`, `habits.js` | Học chơi (6 bài) + thẻ chào người mới; chuỗi ngày chơi + huy hiệu |
| `share.js` | Ảnh PNG / GIF động của ván để chia sẻ |
| `boardstyle.js` | Màu bàn, kiểu quân (chạy trong `<head>`), hàm vẽ quân dùng chung |
| `puzzles.json` | 300 bài đố (thế cờ, bên đi, độ dài chuỗi, độ khó, lời giải) |
| `sound.js` | Âm thanh tạo bằng Web Audio (không cần file âm thanh) |
| `i18n.js`, `theme.js` | Bản dịch 4 ngôn ngữ; giao diện Sáng/Tối/Hệ thống |
| `online.js`, `config.js` | Chế độ online: kết nối máy chủ, tài khoản, bạn bè, phòng, thách đấu |
| `native.js` | Chỉ có tác dụng trong ứng dụng Android / iOS ([`app/`](../app/README.md)): nút Back, chia sẻ, rung, đăng nhập Google gốc |
| `match.js` | Tìm trận nhanh, danh sách phòng công khai đang chờ |
| `gamex.js` | Thao tác phụ trong ván: đếm ngược nước đầu, +15 giây, xin đi lại, Berserk |
| `storm.js` | Puzzle Storm (3 phút) |
| `tour-disputes.js` | Trang giải: ván mất kết nối, ban tổ chức công nhận / huỷ kết quả / cho đấu lại |
| `tour-patch.js` | Áp bản cập nhật trang giải (máy chủ chỉ gửi phần đổi); dùng chung với kiểm thử máy chủ |
| `tour.js` | Giải đấu – phần lõi: điều hướng trong hộp thoại, danh sách giải, trang giải (thông tin, nút thao tác, người chơi, bảng xếp hạng Arena), trang duyệt của quản trị viên. Các file dưới cắm vào `window.CaroTourKit` |
| `tour-stages.js` | Vẽ các giai đoạn của giải: nhánh loại trực tiếp, nhánh thắng – thua + chung kết tổng, bảng vòng tròn, bảng Thụy Sĩ, danh sách trận |
| `tour-form.js` | Form tạo giải: mẫu có sẵn và trình ghép tối đa 3 giai đoạn |
| `tour-groups.js` | Xếp bảng (ban tổ chức, trước khi bắt đầu): kéo thả hoặc chọn bảng cho từng người, lưu / chia tự động |
| `club.js` | Câu lạc bộ: danh sách, trang CLB, tạo CLB, quản lý thành viên |
| `social.js` | Lịch sử & xem lại, bảng xếp hạng, nhắn tin, chặn / báo cáo, mật khẩu & email, chat nhanh |
| `index.html`, `style.css` | Giao diện |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Chạy offline, cài như ứng dụng |
