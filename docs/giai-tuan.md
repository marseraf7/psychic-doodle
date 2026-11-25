# Giải tuần (Đợt 2 – kế hoạch tiếp cận toàn cầu 21/11/2026)

Máy chủ tự tạo và chạy một giải trực tuyến mỗi tuần, không cần ai tạo bằng tay. Mục đích (báo cáo kênh PR, mục 2.9): mỗi
tuần có một sự kiện cố định để mời người chơi quay lại và có nội dung đăng lên Group/Page, Reddit, Discord, VK.

## Giải tuần chạy thế nào

- Máy chủ **luôn giữ đúng một Giải tuần sắp tới** (hoặc đang diễn ra). Lúc khởi động, mỗi ~10 phút, và ngay khi Giải tuần
  xong hoặc bị huỷ, máy chủ kiểm tra: không còn Giải tuần nào chưa xong thì tạo giải cho lần kế tiếp và mở đăng ký luôn
  (giải trước xong lúc ~21:00 Chủ nhật thì giải sau mở đăng ký trước gần 7 ngày).
- Lịch mặc định: **Chủ nhật 20:00 giờ Việt Nam**. Thể thức mặc định: **Arena 60 phút, luật Caro Việt Nam (năm quân bị chặn
  hai đầu không thắng), đồng hồ 3+2, tính Elo, công khai, tối đa 512 người**.
- Tên giải: `Cúp tuần Caro #N · Weekly Cup` (N tăng dần, nhớ qua khởi động lại; không bắt đầu bằng "Giải" vì các thông
  báo sẵn có đã viết "Giải {tên} đã bắt đầu"). Thẻ ở Trang chủ hiện tên theo ngôn ngữ
  người xem (vd. "Weekly Cup #N", "Турнир недели #N"). Mô tả giải có hai phần tiếng Việt và tiếng Anh: thể thức, giờ, giải
  thưởng là danh hiệu, không thu phí / không cá cược, chơi công bằng (không dùng máy hỗ trợ).
- Ban tổ chức là **hệ thống** ("Caro x Gomoku"), không gắn tài khoản nào: không bị giới hạn 3 giải mỗi người, không cần
  duyệt. **Quản trị viên** sửa, bắt đầu sớm, huỷ, xoá được như mọi giải; khiếu nại ván mất kết nối của Giải tuần báo cho
  quản trị viên.
- Không bao giờ tạo trùng: mỗi lần giải có một khoá là ngày đấu (`YYYY-MM-DD` theo múi giờ cấu hình), giữ chỗ trong CSDL
  trước khi tạo. Lần đã **huỷ** (hoặc đã **xoá**) không tạo lại – máy chủ chuyển sang tuần sau.
- Giờ đấu còn dưới 30 phút lúc cần tạo giải (vd. máy chủ vừa bật lúc 19:45 Chủ nhật mà chưa có giải): lấy tuần sau.
- ~30 phút trước giờ đấu, người đã đăng ký nhận thông báo ở chuông ("… sắp bắt đầu").
- **Thưởng = danh hiệu**: giải xong, hạng 1–3 nhận danh hiệu trên hồ sơ ("Vô địch / Á quân / Hạng ba Cúp tuần Caro #N"), mỗi
  giải chỉ trao một lần (máy chủ tắt giữa chừng thì lần quét sau trao bù, không trao hai lần).
- Trang chủ có thẻ **Giải tuần**: tên, giờ bắt đầu theo **giờ trên máy người xem**, đếm ngược, số người đã đăng ký, nút
  Đăng ký / Vào giải; khi đã có giải xong: "Tuần trước (#N): vô địch …", nút **Xem kết quả tuần trước** và **Chia sẻ kết
  quả** (link `/?t=<mã giải>` có thẻ xem trước Zalo / Messenger). Bản cổng game (CrazyGames, itch.io – không đăng nhập)
  không hiện thẻ.
- Bảng quản trị (Giải đấu → Duyệt → Số liệu máy chủ) có dòng: "Giải tuần: bật · lần kế: … · cấu hình: …" (chỉ đọc).

## Biến môi trường

Đặt trong file môi trường của máy chủ (`server/deploy/caro.env.example` có sẵn các dòng mẫu), rồi khởi động lại máy chủ.

| Biến | Mặc định | Giá trị |
| --- | --- | --- |
| `WEEKLY_CUP` | bật | `0` (hoặc `off`) để tắt |
| `WEEKLY_CUP_AT` | `sun 20:00` | thứ (`sun mon tue wed thu fri sat`, viết đủ `sunday` cũng được) + giờ `HH:MM` |
| `WEEKLY_CUP_TZ` | `Asia/Ho_Chi_Minh` | múi giờ IANA, vd. `Europe/Prague` (đổi giờ mùa hè được tính đúng) |
| `WEEKLY_CUP_FORMAT` | `arena` | `arena` hoặc `swiss` (hệ Thụy Sĩ, có điểm danh 10 phút trước giờ đấu) |
| `WEEKLY_CUP_MINUTES` | `60` | thời lượng Arena: 15, 20, 30, 45, 60, 90, 120 |
| `WEEKLY_CUP_RULE` | `vn` | `vn`, `free`, `std`, `renju` |
| `WEEKLY_CUP_CLOCK` | `3+2` | đồng hồ "phút+giây cộng", vd. `5+3` |

Giá trị sai thì máy chủ dùng giá trị mặc định và ghi **một dòng log** lúc khởi động (`[giải tuần] WEEKLY_CUP_AT="…" không
hợp lệ – dùng mặc định`); dòng trạng thái ở bảng quản trị cũng hiện cảnh báo này.

### Cách tắt / đổi giờ

- Tắt: `WEEKLY_CUP=0`, khởi động lại. Giải tuần đang mở đăng ký vẫn còn – muốn bỏ thì quản trị viên huỷ trên trang giải.
- Đổi giờ: đặt `WEEKLY_CUP_AT` / `WEEKLY_CUP_TZ` mới, khởi động lại. Giải đã tạo giữ giờ cũ; quản trị viên sửa giờ của giải
  đó trên trang giải (Quản lý → Cài đặt), hoặc huỷ để máy chủ tạo giải theo giờ mới cho tuần sau.
- Chạy thử trên máy: `node server.js` (bật mặc định). Bài thử (`npm run coverage`, e2e) tắt Giải tuần trừ bài của riêng nó.

## Gợi ý cho Minh: đăng bài trước mỗi giải

Mỗi giải là một lý do để đăng bài. Gợi ý lịch (giờ Việt Nam, Giải tuần Chủ nhật 20:00):

| Khi | Kênh | Nội dung |
| --- | --- | --- |
| Thứ Năm hoặc thứ Sáu | Group / Page Facebook (Caro, cờ trí tuệ) | Ảnh thẻ Giải tuần + link `/?t=<mã giải>` (bấm "Chia sẻ" trên trang giải); ghi rõ miễn phí, thưởng danh hiệu, Arena 60 phút |
| Thứ Bảy | Discord (server Gomoku / board game), VK (nhóm гомоку / рэндзю) | Bài ngắn tiếng Anh / tiếng Nga: "Weekly Cup #N – Sunday 13:00 UTC, free, rated, 3+2" (giờ UTC để người nước ngoài tự đổi) |
| Chủ nhật 19:30 | Group / Page, Zalo nhóm | Nhắc "còn 30 phút", link giải |
| Sau giải (tối Chủ nhật / thứ Hai) | Group / Page, Reddit (r/gomoku, r/boardgames – theo luật từng subreddit), Discord, VK | Bấm **Chia sẻ kết quả** trên thẻ Trang chủ: link kết quả + tên nhà vô địch; kèm 1–2 ván hay (nút Xem lại → Chia sẻ ván) |

Lưu ý: không hứa thưởng tiền mặt, không thu phí, không cá cược (luật nền tảng + pháp lý); đăng đúng luật của từng nhóm /
subreddit (nhiều nơi cấm quảng cáo – nên đăng như "kết quả / ván hay của cộng đồng"). Vòng đầu có thể ít người: mời trước
cộng đồng lõi, chấp nhận giải 8–16 người.

## Mã nguồn

| Phần | File |
| --- | --- |
| Hub: tạo giải, chống trùng, danh hiệu, nhắc giờ, tin `weeklyCup`, trạng thái quản trị | `server/src/hub/weekly-cup.js` |
| Tính lần kế theo múi giờ IANA (Intl) | `server/src/weekly-time.js` |
| Đọc biến môi trường, tên + mô tả giải | `server/src/weekly-cfg.js` |
| Lưu số #N, giữ chỗ mỗi lần giải | `server/src/store-weekly.js` (bảng `weekly_cup`) |
| Thẻ Trang chủ, danh hiệu, dòng quản trị | `caro/weekly-cup.js`, `caro/i18n-weekly.js`, `caro/i18n/<mã>/weekly.js` |
| Bài thử | `server/test/weekly-cup.test.js`, `caro/tests/e2e/weekly-cup.e2e.js` |
