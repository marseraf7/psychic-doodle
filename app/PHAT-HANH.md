# Kế hoạch phát hành app 1.0.0 (tuần 26–30/10/2026)

Mục tiêu: app Android lên Google Play (và iOS nếu kịp có Mac + tài khoản Apple), máy chủ ổn định, không còn lỗi Critical/High.
Mỗi bước xong đều **review + chạy test + sửa lỗi** trước khi sang bước sau (cột "Kiểm"). Người làm: **CC** = Claude Code,
**BX** = Baxter, **AGY** = Antigravity (máy thật), **M** = người dùng (việc cần tài khoản / tiền / bí mật).

## ⚠️ Rủi ro lớn nhất: chính sách Google Play cho tài khoản mới

Tài khoản nhà phát triển **cá nhân** tạo sau 13/11/2023 phải chạy **thử nghiệm kín (closed testing) ≥ 12 người trong
14 ngày liên tục** trước khi được xin lên bản chính thức. Nếu tài khoản của bạn thuộc diện này thì "phát hành tuần sau"
chỉ được ở mức **thử nghiệm kín / mở**; bản công khai sớm nhất khoảng giữa tháng 11. Việc **M0** dưới đây phải làm ngay
để biết lịch thật. (Tài khoản tổ chức, hoặc tài khoản cá nhân cũ hơn, không bị điều kiện này.)

## Trạng thái hiện tại

| Hạng mục | Trạng thái |
|---|---|
| C1–C3, H-S1–S5, H-F1 (máy chủ / engine / online) | Xong, trong PR #88 – chờ CI |
| M-F1, M-F2 (service worker), mở trang khi mạng chậm | Xong, trong PR #88 |
| H-E1 (Board) | PR #85 trả lại Baxter sửa |
| H-A2, H-A3, H-A4, M-A1, M-A2, M-A3 (phát hành mobile) | PR #87 của Baxter – CC review + áp bản vá workflow |
| H-A5 (link sâu) | PR #90 của Baxter – CC review |
| M-S1, M-S2 (Origin WebSocket, X-Forwarded-For) | PR #92 của Baxter – CC review |
| H-A1 (đăng nhập Google trên iOS) | **Không chặn 1.0**: iOS ẩn nút Google (không cần Sign in with Apple theo luật 4.8). Làm sau |
| M-F5 (chèn class không thoát ký tự), M-F6 (ô bạn bè mất chữ) | Giao BX (#93, #94) |
| Tài liệu cửa hàng (mô tả 4 ngôn ngữ, ảnh chụp) | Giao BX (#95) |
| Đo độ ổn định e2e WebKit (`boat-rapfi`) | Giao BX (#96) |
| Kiểm trên điện thoại thật | Giao AGY (#97) |
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

H-A1 (Google / Apple trên iOS), H-F2 + M-S5 (phiên 180 ngày, mật khẩu tối thiểu, tham số scrypt), H-S5 giai đoạn 2
(gửi phần thay đổi thay vì cả ván), M-F3 (gộp script), M-F4 (CSP bản tĩnh), M-F7 (chơi bằng bàn phím, cho phóng to),
M-A4 (AI trên luồng chính iOS), M-A5, các mục Low.
