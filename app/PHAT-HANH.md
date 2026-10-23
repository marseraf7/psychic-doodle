# Kế hoạch phát hành app 1.0.0 (tuần 26–30/10/2026)

Mục tiêu: app Android lên Google Play (và iOS nếu kịp có Mac + tài khoản Apple), máy chủ ổn định, không còn lỗi Critical/High.
Mỗi bước xong đều **review + chạy test + sửa lỗi** trước khi sang bước sau (cột "Kiểm"). Người làm: **CC** = Claude Code,
**BX** = Baxter, **AGY** = Antigravity (máy thật), **M** = người dùng (việc cần tài khoản / tiền / bí mật).

## ⚠️ Rủi ro lớn nhất: chính sách Google Play cho tài khoản mới

Tài khoản nhà phát triển **cá nhân** tạo sau 13/11/2023 phải chạy **thử nghiệm kín (closed testing) ≥ 12 người trong
14 ngày liên tục** trước khi được xin lên bản chính thức. Nếu tài khoản của bạn thuộc diện này thì "phát hành tuần sau"
chỉ được ở mức **thử nghiệm kín / mở**; bản công khai sớm nhất khoảng giữa tháng 11. Việc **M0** dưới đây phải làm ngay
để biết lịch thật. (Tài khoản tổ chức, hoặc tài khoản cá nhân cũ hơn, không bị điều kiện này.)

## Trạng thái hiện tại (cập nhật 23/10)

| Hạng mục | Trạng thái |
|---|---|
| C1–C3, H-S1–S5, H-F1 (máy chủ / engine / online) | ✅ Đã merge (PR #88) |
| M-F1, M-F2 (service worker), mở trang khi mạng chậm, máy chủ tự tải mạng Rapfi | ✅ Đã merge (PR #88) |
| H-A2, H-A3, H-A4, M-A1, M-A2, M-A3 (phát hành mobile) | ✅ Đã merge (PR #87) |
| H-A5 (link sâu) | ✅ Đã merge (PR #90) – còn cần M3 (`APP_LINK_SHA256`, `APPLE_TEAM_ID`) |
| M-A4, L-F6, L-F2, L-S1, L-S4, L-A1, L-A4 + tranh chấp tải script ở danh sách bạn bè | ✅ Đã merge (PR #101) – M-A4 cần kiểm trên iPhone thật (#97) |
| M-S1, M-S2 (Origin WebSocket, X-Forwarded-For) | ✅ Đã merge (PR #92) |
| H-E1 (Board) | ✅ Đã merge (PR #85) |
| M-F5, M-F6 | ✅ Đã merge (PR #106) |
| M-E1 + màn hình báo lỗi khi trang không nạp được | ✅ Đã merge (PR #108, bỏ thẻ meta CSP) |
| Test hồi quy service worker | ✅ Đã merge (PR #102) |
| Bù trễ đồng hồ cho người chơi ở xa (#110 P1) | CC làm – chỉ máy chủ, lên máy chủ qua tự cập nhật, không chặn app |
| M-A5 (trang chính sách dự phòng trên GitHub Pages), M-T1a (test Renju 3-3 giả) | Giao BX (#104, #105) – chưa có PR |
| Tài liệu cửa hàng (mô tả 4 ngôn ngữ, ảnh chụp) | Giao BX (#95) – chưa có PR |
| Đo độ ổn định e2e WebKit / Firefox / Android trên CI | Giao BX (#96) – chưa có PR |
| Kiểm trên điện thoại thật | Giao AGY (#97) |
| H-A1 (đăng nhập Google / Apple trên iOS) | **Không chặn 1.0**: iOS ẩn nút Google nên không bắt buộc Sign in with Apple (luật 4.8) |
| Chuyển máy chủ sang châu Âu | M (tuỳ chọn, `server/deploy/CHUYEN-MAY-CHU.md`) |

## Lịch

| Ngày | Việc | Ai | Kiểm (xong mới sang bước sau) |
|---|---|---|---|
| **Thứ 5–6 22–23/10** | M0: kiểm loại / ngày tạo tài khoản Play Console; tạo app `io.github.marseraf7.caro` | M | Biết có phải chạy closed test 14 ngày không |
| | Merge PR #88 khi CI xanh | CC | CI xanh, `/healthz` trên máy chủ sau tự cập nhật |
| | Review + sửa + merge #87, #90, #92; áp bản vá workflow của #87 | CC | coverage + e2e + CI Android/iOS |
| | BX sửa #85 (H-E1) theo review | BX → CC | đo tốc độ bot không chậm hơn, test nạp ván lỗi |
| **Thứ 7–CN 24–25/10** | M-F5, M-F6 | BX → CC | test mới đỏ trên code cũ; review bảo mật |
| | Tài liệu cửa hàng: mô tả, ảnh chụp | BX → CC/M | M duyệt chữ |
| | M1: tạo keystore, thêm 4 Secrets (`CARO_KEYSTORE_*`); M2: đăng ký trước các tên trong `ADMIN_USERNAMES` | M | CC chạy workflow, AAB đã ký |
| **Thứ 2 26/10** | RC1: `version 1.0.0`, dựng AAB đã ký, tải lên **thử nghiệm nội bộ** rồi **kín** | CC + M | cài từ Play trên máy thật |
| | Kiểm máy thật (Android 10–15, 1 iPhone nếu có) theo danh sách #97 | AGY | báo cáo lỗi kèm ảnh |
| **Thứ 3–4 27–28/10** | Sửa lỗi từ kiểm máy thật; RC2 | CC/BX | e2e đủ 3 trình duyệt + Android 34/35 |
| | Play Console: App content (chính sách, Data safety, xoá tài khoản, xếp loại nội dung, đối tượng 13+) | M | không còn mục đỏ |
| **Thứ 5 29/10** | Gửi duyệt: bản chính thức (nếu tài khoản không bị điều kiện 14 ngày) / mở thử nghiệm mở | M | — |
| | iOS: nếu có Mac + Apple Developer → Archive, TestFlight; không thì để đợt sau | M | — |
| **Thứ 6 30/10** | Theo dõi lỗi, nhật ký máy chủ; đặt `MIN_APP_VERSION` khi cần | CC | — |

## Việc của người dùng (M) – cần tài khoản / tiền / bí mật

- **M0** Play Console: loại tài khoản, ngày tạo (xem mục rủi ro). Phí 25 USD một lần nếu chưa có.
- **M1** Khoá ký Android (`app/README.md` mục *Phát hành lên Google Play*). Cất giữ cẩn thận; **không** gửi khoá / mật khẩu cho
  ai, kể cả Claude – chỉ đặt vào GitHub Secrets.
- **M2** Tự đăng ký các tài khoản quản trị trước khi điền `ADMIN_USERNAMES` (cảnh báo của PR #78).
- **M3** Link sâu (PR #90): đặt `APP_LINK_SHA256` (SHA-256 của khoá ký trong *Play Console → App integrity*) trên máy chủ;
  iOS cần `APPLE_TEAM_ID`.
- **M4** Đăng nhập Google trên Android: tạo OAuth client Android với SHA-1 khoá phát hành (`app/README.md`).
- **M5** iOS: máy Mac + tài khoản Apple Developer (99 USD/năm). Không có thì phát hành Android trước.
- **M6** (tuỳ chọn) Chuyển máy chủ sang châu Âu trước khi quảng bá ở Nga.

## Quy tắc review mỗi bước (CC)

1. Đọc diff, đối chiếu với Issue; việc bảo mật / đăng nhập / dữ liệu người dùng xét ở mức `high`.
2. Chạy `cd server && npm run coverage`, `caro/tests/*.test.js`, e2e liên quan (Chromium; Firefox/WebKit trên CI).
3. Kiểm test mới **đỏ trên code cũ**.
4. CI xanh mới merge; đỏ thì tìm nguyên nhân gốc, không chạy lại quá một lần.
5. Ghi kết quả vào bảng "Trạng thái" ở trên.

## Sau 1.0 (không chặn phát hành)

Đáng làm nhưng thay đổi lớn, làm sát ngày phát hành dễ gây lỗi mới:

- **H-F2 + M-S5**: phiên 180 ngày lưu trong `localStorage`, mật khẩu tối thiểu 6 ký tự, scrypt dùng tham số mặc định →
  rút còn 30 ngày (tự gia hạn khi dùng), tối thiểu 8 ký tự cho tài khoản mới, ghi tham số scrypt kèm mã băm; về lâu dài
  dùng cookie `HttpOnly` thay cho token trong JavaScript.
- **M-F3** (= #110 P4): gộp 118 script thành vài bundle, nạp lười trang giải đấu / học / phân tích.
- **M-F7**: chơi bằng bàn phím, cho phóng to (cần thử kỹ thao tác chụm trên bàn cờ).
- **M-S6**: giới hạn thành viên câu lạc bộ, tìm kiếm không quét tuần tự.
- **H-S5 giai đoạn 2** (= #110 P2): gửi phần thay đổi của ván thay vì cả ván, sự kiện có phiên bản để kết nối lại chỉ
  phát lại phần lỡ.
- **#110 P3**: file tĩnh qua điểm gần Nga (GitHub Pages / CDN) – đổi hạ tầng, chờ M duyệt.
- **L-F1** (đổi mã khách khi đăng xuất, nút xoá dữ liệu trên máy), **L-F4** (biểu tượng PNG cho bản web), **L-S2** (HMAC mã
  đặt lại mật khẩu), **L-S5**, **L-A3**.

## Không sửa (đã cân nhắc)

| Mục | Lý do |
|---|---|
| M-S3 – tự cập nhật bằng root | Lựa chọn của người dùng (khỏi vào SSH mỗi lần), đã có sao lưu + tự quay lại bản cũ. Bật xác thực 2 lớp cho GitHub; đông người dùng thì chuyển sang chỉ cập nhật theo tag |
| M-S4 / L-F3 – mật khẩu phòng 3 số, hai người chơi đều thấy | Mật khẩu để đưa cho bạn; giới hạn đoán đã chặt (40 lần / 10 phút mỗi phòng). M quyết định không sửa (#99 đóng) |
| M-F4 – thẻ meta CSP cho bản tĩnh | Bản chạy thật do máy chủ Node gửi CSP chặt; meta CSP dễ chặn nhầm Google / Rapfi |
| L-S3 – đoán tên đăng nhập qua thời gian phản hồi | Tên đăng nhập vốn công khai (bảng xếp hạng, tìm kiếm, API) |
| L-S6 – cày Elo bằng tài khoản phụ | Theo thiết kế, đã giới hạn số ván / cặp / ngày |
| L-S7 – máy chủ lọc `<` `>` | Làm hỏng nội dung bình thường ("<3"); giao diện đã thoát ký tự (M-F5 vá nốt) |
| L-A2 – thu gọn mã bản phát hành Android | Dễ hỏng cầu nối WebView ↔ JavaScript; dung lượng không phải vấn đề |
| L-E1 – phân tích chạy quá ngân sách thời gian | Đánh đổi có chủ ý, có test, có tự giảm tải khi máy nóng |
