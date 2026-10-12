# Cờ Caro

Game cờ caro chạy trên web, chơi mượt trên cả điện thoại lẫn máy tính.

- **Bàn cờ vô hạn**: kéo để di chuyển, chụm 2 ngón / cuộn chuột để phóng to thu nhỏ.
- **4 luật chơi** (chọn ở "Ván mới", Cài đặt, khi tạo phòng / thách đấu / tạo giải):
  - **Caro Việt Nam** (mặc định, luật chặn 2 đầu): 4 quân liền không bị chặn đầu nào → thắng; 5 quân liền bị chặn
    1 đầu → thắng; bị chặn cả 2 đầu → không tính.
  - **Gomoku tự do**: 5 quân liên tiếp trở lên là thắng (6, 7 quân vẫn thắng), không quan tâm bị chặn.
  - **Gomoku tiêu chuẩn**: chỉ đúng 5 quân mới thắng, quá năm (6 quân trở lên) không tính.
  - **Renju** (luật thi đấu quốc tế): X chỉ thắng với đúng 5 quân và bị cấm 3-3, 4-4, quá năm (định nghĩa RIF:
    "ba" là đường thêm 1 quân ở ô không cấm thành bốn thẳng, xét đệ quy; bốn-bốn trên cùng một đường cũng tính);
    O 5 quân trở lên đều thắng. Ô cấm hiện dấu ✕ đỏ và không đặt được (máy chủ cũng từ chối).
- Chơi **2 người cùng máy**, **với máy** (24 nhân vật: 6 mức × 4 lối đánh, xem dưới), hoặc **online**:
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

- **24 nhân vật máy** (`bots.js`) = 6 mức sức cờ × 4 lối đánh, mỗi người một tên và lời thoại riêng:

  | Mức | Tấn công | Phòng thủ – phản công | Nước đôi | Gài bẫy (dương đông kích tây) |
  |---|---|---|---|---|
  | ~600 | BéXuânMaiLonTon | Chị Bảy | Cocobay | Sa Tị |
  | ~900 | Anh Độ | Khô Gà | Bã Mía | Phượng Lên Đồ |
  | ~1200 | Mân Đàn | Phấn Đào | Vardrid | Ba Sáu |
  | ~1500 | Khá Bảnh | Trà Từ Tay | Người Tày | Tú Sena |
  | ~1800 | Rung Động | Độc Tày | SVBK | Đi Bộ Vuốt Râu |
  | ~2350 | GOAT | UEFAlona | Penaldo | Hai Ngón |

  Sức cờ tạo bằng cách pha AI của `rules.js` (mức 1–3, độ sâu / thời gian tìm chuỗi ép; mức ~2350 dùng `engine.js`)
  với lỗi có chủ đích (đánh "cho vui", quên chặn, không thấy nước thắng). Lối đánh đổi cách chấm điểm nước đi:
  Tấn công coi trọng thế của mình và tìm chuỗi ép (VCF) sớm; Phòng thủ coi trọng thế của đối thủ và chặn sớm mọi nước
  thắng chắc của họ; Nước đôi thưởng ô giao điểm có thế trên nhiều đường; Gài bẫy thưởng nước "nhảy" cách quãng, tránh
  đánh sát nước vừa đi của đối thủ, thưởng thế 3 có khe. Ở engine: trọng số thế mình / thế đối thủ và thưởng khi xếp
  thứ tự nước. Mới vào mở sẵn 3 mức đầu; thắng một nhân vật bất kỳ ở một mức thì mở khoá cả mức sau. 6 nhân vật cũ
  giữ mã (na, ti, bin, mai, minh, rong), người dùng bản cũ không mất lựa chọn. Thứ tự sức cờ đã kiểm bằng cho máy
  tự đấu (mỗi mức thắng mức ngay dưới 20–28 / 32 ván).
- **Ngoại hình nhân vật** (`bot-looks.js`, chỉ có dữ liệu): mỗi nhân vật một ảnh đại diện, một biểu tượng (emoji hoặc ảnh
  nhỏ) và một màu riêng. **Đổi ảnh**: chép ảnh mới (svg / png / jpg / webp, vuông) vào `img/bots/`, sửa đường dẫn
  `avatar` của nhân vật trong `bot-looks.js`, thêm đường dẫn vào `FILES` trong `sw.js` và tăng `CACHE`. Ảnh mặc định sinh
  bằng `node server/scripts/gen-bot-avatars.js` (tóc / mũ theo lối đánh, phụ kiện theo mức). Bảng chọn đối thủ
  (`bot-picker.js`, dùng chung cho Ván mới và Cài đặt) hiện ảnh, biểu tượng, lối đánh và mô tả của từng nhân vật.
- **Phân tích ván** (`analysis.js`, chạy trong Web Worker): bấm "Phân tích" ở thẻ kết quả hoặc khi xem lại ván.
  Dùng **engine riêng của game** (`engine.js`, tự viết theo ý tưởng của các engine Gomoku mạnh, không dùng mã của họ):
  Alpha-Beta (PVS) làm sâu dần + bảng ghi nhớ thế cờ, chấm điểm theo cửa sổ 5 / 6 ô đúng luật Caro Việt Nam (hàng bị chặn
  hai đầu = 0 điểm, 3 quân không bị chặn = đe doạ thắng), bộ giải chuỗi ép (VCF) riêng có bảng ghi nhớ. Mỗi thế được đổi ra
  khả năng thắng; nước đi xếp loại theo mức tụt (?! ≥ 10%, ? ≥ 18%, ?? ≥ 30%) hoặc theo chuỗi thắng chắc (bỏ lỡ / để thua chắc);
  độ chính xác theo công thức Lichess. Đo được: giải 300/300 bài đố (TB ~9 ms/bài, bộ cũ 288/300 với 300 ms), 57 nước thắng
  mà bộ cũ không xác nhận được đã kiểm bằng bộ vét cạn độc lập; GOAT dùng engine thắng GOAT cũ 9–1.
  Ký hiệu: Chưa chính xác `?!` (mới), Xuất sắc `!!` (tự tìm ra chuỗi thắng ≥ 3 nước),
  Tốt nhất `!`, Tốt, Bỏ lỡ `×` (có nước / chuỗi thắng mà không đi), Sai lầm `?` (để đối thủ có chuỗi ép thắng
  trong khi có nước tránh được), Sai lầm nặng `??` (để thua sau 1–2 nước), Thế đã thua. Có độ chính xác (%) từng bên,
  dải màu từng nước, thời điểm quan trọng; trên bàn cờ đánh dấu loại nước và khoanh xanh nước tốt hơn.
  **Thử lại**: bày lại thế cờ trước nước sai để tự tìm nước đúng (máy kiểm tra và tự chặn).
- **Giải đố** (`study.js`, dữ liệu `puzzles.json`): tìm chuỗi nước ép thắng; máy tự chặn sau mỗi nước đúng.
  Các chế độ: *Có xếp hạng* (điểm giải đố kiểu Elo, chọn bài gần điểm của bạn), *Chuỗi đúng* (khó dần, sai là hết),
  *Bài của ngày* (giống nhau cho mọi người). Có Gợi ý, Đáp án (tự đi hết lời giải). Điểm, kỷ lục lưu trên máy.
  Bộ 300 bài sinh tự động: `node server/scripts/gen-puzzles.js [số bài] [hạt giống]` – cho các nhân vật máy
  đấu với nhau, lấy thế cờ sớm nhất có chuỗi ép 2–7 nước (và một bài dễ ở giữa chuỗi), bỏ bài trùng hình
  (kể cả xoay / lật), chấm độ khó theo độ dài chuỗi và số nước "bẫy". Sau đó `node server/scripts/tag-puzzles.js` gắn
  chủ đề **VCF** (thắng chỉ bằng nước bốn) / **VCT** (cần cả nước ba mở), và `node server/scripts/gen-vcf-puzzles.js`
  thêm bài VCF thuần theo luật Gomoku tự do. Hiện có 363 bài: 124 VCF, 239 VCT; mục Giải đố có thêm hai chế độ luyện
  theo chủ đề *Chuỗi nước bốn (VCF)* và *Chuỗi đe doạ (VCT)* (không tính điểm).
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
- **Học chơi** (`learn.js`): 9 bài tương tác (năm quân, chặn hai đầu, bốn mở, ba mở, thắng kép, chuỗi nước bốn VCF
  theo luật tự do, chuỗi đe doạ VCT theo luật Việt Nam, thế Nón lá, Renju bốn-ba tránh ô cấm). Các mục giải thích từng
  bước có hình minh hoạ (mọi hình đã kiểm bằng `rules.js`):
  - **Luật chơi**: Caro Việt Nam, Gomoku tự do, Gomoku tiêu chuẩn, Renju, khai cuộc Swap2.
  - **Khai cuộc**: 26 thế khai cuộc chuẩn (13 trực chỉ, 13 gián chỉ, tên Hán – Việt, thế nào X / O thắng),
    Hoa Nguyệt (花月) & Phố Nguyệt (浦月), thế Nón lá.
  - **Chiến thuật**: VCF, VCT.
  - **Lối đánh của máy**: 4 thẻ lối đánh (ảnh nhân vật, mô tả ngắn) mở phần giới thiệu từng lối.
  - **Phim minh hoạ có phụ đề** (`learn-board.js` phát, `learn-demos.js` dữ liệu, `i18n-demos.js` phụ đề 4 ngôn ngữ):
    quân hiện lần lượt, quân mới có vòng sáng, phụ đề theo ngôn ngữ đang chọn (đổi ngôn ngữ thì phụ đề đổi ngay, giữ
    khung đang xem), có nút phát lại / tạm dừng / khung tiếp. Mọi phim được `caro/tests/demos.test.js` kiểm bằng luật
    thật (nước hợp lệ, khung "thắng / đe doạ / chặn / ô cấm" đúng như phụ đề nói, đủ phụ đề 4 ngôn ngữ).
  - **Luyện ngay** (`learn-practice.js`): có ở mọi bước và ngay trong danh sách (nút "Luyện"), kể cả khi đọc lại. Luật
    chơi → ván với máy theo luật đó; khai cuộc → ván Renju với máy bày sẵn 3 quân của một thế (Hoa / Phố Nguyệt hoặc
    ngẫu nhiên trong 26 thế); VCF / VCT → giải đố theo chủ đề; Renju, Nón lá → bài thực hành; lối đánh → bảng chọn đối thủ.
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

- **Khung 5 tab** như app Lichess (`shell.js`, `shell.css`): Trang chủ · Câu đố · Học tập · Xem · Xem thêm. Điện thoại: thanh tab
  dưới đáy; màn hình rộng (≥900px): menu chữ trên cùng, Trang chủ 3 cột. Mở app là vào Trang chủ; bàn cờ hiện khi vào ván,
  nút ‹ trên thanh trên của bàn cờ đưa về trang đang xem dở. Nền tối là mặc định (đổi trong Cài đặt → Giao diện).
- **Trang chủ** (`home.js`): thẻ Xếp cặp nhanh (lưới ô thời gian) · Phòng chờ (tạo phòng + sảnh) · Với máy (ô luật × sức cờ, bấm là chơi);
  nút lớn Tạo phòng / Thách đấu bạn / Chơi với máy / 2 người một máy; thẻ "Tiếp tục ván" khi có ván dở.
- **Xem thêm** (`more.js`): tài khoản, Chơi (giải đấu, câu lạc bộ, vào phòng bằng mã), Công cụ, Cộng đồng (bạn bè), Cài đặt.
- **Cài đặt dạng danh sách** (`settings-ui.js`): hàng có giá trị hiện bên phải, công tắc, trang con (Âm thanh, Giao diện có
  bàn cờ xem trước, Cài đặt bàn cờ, Ngôn ngữ, Ván cờ mặc định, Đối thủ máy).
- **Thiết lập ván đấu** (hộp Ván mới, như Lichess): luật, thời gian, đối thủ, bên X / Ngẫu nhiên / O.
- **Thời gian tuỳ chỉnh** (`timectl.js` dùng chung máy chủ + trình duyệt, `tc-picker.js`): 3 thẻ Không giới hạn · Mỗi nước · Đồng hồ;
  thanh trượt số giây mỗi nước (5…120) hoặc "phút + giây cộng" (1…180 phút, 0…180 giây) + ô chọn nhanh. Dùng cho Ván mới,
  Cài đặt, Tạo phòng, Thách đấu. Chơi trên máy cũng có đồng hồ tổng (`local-clock.js`): chạy từ sau nước đầu, tạm dừng khi
  mở trang / hộp thoại, giữ thời gian còn lại khi tải lại trang. Lưới ghép trận ở Trang chủ có 9 ô đồng hồ + giây mỗi nước + Tuỳ chỉnh.
- Các hộp thoại cũ (Online, Giải đố, Học chơi, Cài đặt) được `CaroShell.proxy()` chuyển thành trang: mã cũ vẫn gọi
  `showModal()` / `close()` như trước.
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
node caro/tests/demos.test.js    # phim minh hoạ phần Học: nước hợp lệ, đúng như phụ đề, đủ 4 ngôn ngữ
```

Kiểm thử trình duyệt cho giải đấu (cần Playwright + Chromium; mỗi kịch bản tự bật máy chủ trên dữ liệu tạm,
ảnh chụp màn hình lưu ở `E2E_OUT` hoặc thư mục tạm):

```bash
node caro/tests/e2e/tour-basic.e2e.js    # câu lạc bộ, Arena, loại trực tiếp
node caro/tests/e2e/tour-stages.e2e.js   # vòng bảng (xếp bảng tay) → playoff, Thụy Sĩ → nhánh thắng – thua
node caro/tests/e2e/study.e2e.js         # nhân vật máy, phân tích ván + Thử lại, giải đố (3 chế độ)
node caro/tests/e2e/play2.e2e.js         # đồng hồ + Swap2, xem trực tiếp, hồ sơ, học chơi, thành tích, chia sẻ ảnh/GIF, bàn cờ
node caro/tests/e2e/batchd.e2e.js        # huỷ ván, nước đầu, đi lại, +15 giây, thống kê sâu, số liệu máy chủ, ván giải mất kết nối, Storm, ảnh og
node caro/tests/e2e/journey.e2e.js       # hành trình người chơi: quét mọi hộp thoại 4 ngôn ngữ × 360/1280 px, luật Swap2/Renju, chạm thật trên điện thoại, online + xem ván
```

## Cấu trúc

| File | Nội dung |
|---|---|
| `rules.js` | 4 luật thắng, nước cấm Renju + AI (dùng chung cho trình duyệt và Node) |
| `app.js` | Vẽ bàn cờ (canvas), xử lý chạm/chuột/phím, lưu trạng thái, chế độ xem lại ván |
| `ai-worker.js` | Chạy AI (nhân vật máy) và phân tích ván trong Web Worker để giao diện không bị khựng |
| `bots.js` | 24 nhân vật máy (6 mức × 4 lối đánh): số liệu sức cờ, trọng số lối đánh, `botMove` |
| `engine.js` | Engine phân tích: Alpha-Beta + chuỗi ép, đủ 4 luật (kể cả nước cấm Renju), trọng số lối đánh (dùng chung trình duyệt, Worker, Node) |
| `analysis.js` | Phân tích ván: xếp loại từng nước, độ chính xác, kiểm tra nước thắng / nước giữ thế (dùng chung trình duyệt, Worker, Node) |
| `study.js` | Bảng phân tích trong chế độ xem lại, "Thử lại", Giải đố (3 chế độ). Mượn bàn cờ của `app.js` qua `CaroApp.enterExt` |
| `swap.js` | Luật Swap2: thẻ hướng dẫn đặt quân, nút chọn bên |
| `watch.js` | Xem trực tiếp: danh sách "Đang diễn ra", nút Xem (bạn bè, trận trong giải), chế độ người xem |
| `profile.js` | Hồ sơ người chơi: điểm từng loại + biểu đồ, thống kê, ván gần đây |
| `learn.js`, `habits.js` | Học chơi (9 bài + giải thích luật, khai cuộc, chiến thuật, lối đánh) + thẻ chào người mới; chuỗi ngày chơi + huy hiệu |
| `learn-board.js`, `learn-demos.js`, `learn-practice.js` | Phần Học: hình bàn cờ + trình phát phim có phụ đề; dữ liệu phim; nút "Luyện ngay" |
| `bot-looks.js`, `bot-picker.js`, `img/bots/` | Ngoại hình nhân vật máy (ảnh, biểu tượng, màu – sửa được); bảng chọn đối thủ dùng chung |
| `share.js` | Ảnh PNG / GIF động của ván để chia sẻ |
| `boardstyle.js` | Màu bàn, kiểu quân (chạy trong `<head>`), hàm vẽ quân dùng chung |
| `puzzles.json` | 363 bài đố (thế cờ, bên đi, độ dài chuỗi, độ khó, lời giải, chủ đề VCF / VCT, luật nếu khác luật Việt Nam) |
| `sound.js` | Âm thanh tạo bằng Web Audio (không cần file âm thanh) |
| `i18n.js`, `i18n-rules.js`, `i18n-bots.js`, `i18n-demos.js`, `i18n-shell.js`, `i18n-tc.js`, `theme.js` | Bản dịch 4 ngôn ngữ (`i18n-shell.js`: khung trang, Trang chủ, Cài đặt; `i18n-tc.js`: thời gian, Thiết lập ván đấu; `i18n-rules.js`: luật + phần Học, `i18n-bots.js`: lối đánh, tên và lời thoại 24 nhân vật, `i18n-demos.js`: phụ đề phim minh hoạ); giao diện Sáng/Tối/Hệ thống |
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
| `shell.js`, `shell.css` | Khung 5 tab, trang, chuyển hộp thoại cũ thành trang (`CaroShell`); kiểu hàng danh sách, công tắc, Trang chủ |
| `home.js`, `more.js`, `settings-ui.js` | Trang chủ; Xem thêm; Cài đặt dạng danh sách + trang con + bàn cờ xem trước |
| `timectl.js`, `tc-picker.js`, `local-clock.js`, `setup.css` | Mức thời gian cho phép (dùng chung máy chủ); bộ chọn thời gian; đồng hồ tổng khi chơi trên máy; giao diện Thiết lập ván đấu |
| `index.html`, `style.css` | Giao diện |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Chạy offline, cài như ứng dụng |
