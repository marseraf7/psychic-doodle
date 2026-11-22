# Kế hoạch tiếp cận người chơi toàn cầu (21/11/2026)

Gộp từ hai báo cáo của Laplace (`BAO-CAO-FACEBOOK-APP-VA-KENH-PR-CARO-21-11-2026.md`,
`KE-HOACH-TRIEN-KHAI-CRAZYGAMES-ITCH-TELEGRAM-21-11-2026.md`) và đánh giá của Claude. Minh đã duyệt ngày 21/11/2026:
tên miền riêng, thêm ja / ko / cs / zh-Hant, bản cổng tắt chat tự do (chỉ biểu cảm), itch.io tắt quyên góp ở đợt đầu,
VK Mini App làm song song Telegram.

## 1. Thay đổi so với kế hoạch của Laplace

1. **Tên miền riêng là bước 0.** Dữ liệu trình duyệt (đăng nhập, tiến độ khách, service worker, app đã cài) gắn theo
   tên miền; đổi muộn thì người chơi mất dữ liệu và mọi link đã gắn ở các kênh phải làm lại. Tên miền duckdns còn làm
   yếu hồ sơ Claude Directory, TWA và SEO. Claude làm đường chuyển dữ liệu một lần (mã chuyển ngắn hạn) + chuyển hướng 301.
2. **Nga: VK ngang hàng Telegram** (VK có danh mục game tự khám phá; tiếng Nga đã có).
3. **Bản cổng (CrazyGames / itch.io) tắt chat tự do**, chỉ giữ biểu cảm có sẵn (giảm nghĩa vụ kiểm duyệt, PEGI 12).
4. **Thêm ngôn ngữ của các nước Gomoku mạnh:** ja, ko, cs, zh-Hant (người bản ngữ soát trước khi bật công khai).
5. **Trung Quốc đại lục ngoài tầm** lúc này (mini game WeChat cần pháp nhân + ICP; Telegram / Facebook / Google bị chặn):
   tiếng Trung nhắm Đài Loan, Hồng Kông, Hoa kiều.

## 2. Thị trường ưu tiên

| Hạng | Thị trường | Kênh chính |
|---|---|---|
| 1 | Việt Nam | Video ngắn (TikTok / Reels / Shorts), Page + Group Facebook, giải tuần, link chia sẻ Zalo / Messenger, SEO tiếng Việt |
| 2 | Nga + Estonia, Latvia, Ukraina | VK community + VK Mini App, Telegram Mini App, cộng đồng renju tiếng Nga |
| 3 | Nhật (連珠), Hàn (오목) | Tiếng Nhật / Hàn, X (Nhật), CrazyGames, SEO bản địa |
| 4 | Séc / Slovakia (Piškvorky), Ba Lan, Hungary, Thụy Điển | Tiếng Séc, CrazyGames, Reddit / Discord, liên đoàn & CLB (trang nhúng giải, API v1) |
| 5 | Đài Loan, Hồng Kông | Tiếng Trung phồn thể, YouTube / Bilibili |
| Nền | Quốc tế (tiếng Anh) | itch.io, Reddit r/gomoku r/renju, Product Hunt, Claude Directory |

Điểm khác biệt: "Caro – biến thể Gomoku của Việt Nam (năm chặn hai đầu không thắng)" + đủ Renju / Swap2 chuẩn RIF + máy
Rapfi + giải đấu, câu đố, chơi theo lượt.

## 3. Lộ trình

**Đợt 0 (ngay)**
- Minh: mua tên miền; tài khoản itch.io, CrazyGames Developer (khai thanh toán); bot Telegram (token nạp thẳng vào
  máy chủ, không gửi qua chat); cộng đồng VK + app VK Mini App; nộp Claude Directory.
- Claude: chuyển tên miền không mất dữ liệu (biến môi trường, mã chuyển một lần, 301); trường nguồn `src` trong tin
  `hello` + link chia sẻ + bảng thống kê theo nguồn cho quản trị viên; SEO nền (robots.txt, sitemap.xml, canonical,
  hreflang, JSON-LD, og / twitter cho trang chính); tinh chỉnh theo báo cáo SEO của Laplace khi có.

**Đợt 1 (1–2 tuần; Laplace nghiệm thu theo checklist trong kế hoạch gốc)**
- Bản dựng cổng `PORTAL_MODE` (crazygames / itch): khách mặc định, ẩn đăng nhập ngoài và link ra ngoài, không đăng ký
  service worker, tắt chat tự do, tiếng Anh mặc định, đường dẫn tương đối; SDK CrazyGames mức Basic; script đóng gói ZIP.
- Lớp "chạy trong ứng dụng khác": Telegram Mini App MVP (ready / expand / toàn màn hình / theme) và VK Mini App MVP
  (VK Bridge init, theme, nút đóng), `src` tương ứng.
- Thêm ja / ko / cs / zh-Hant theo quy trình 4 ngôn ngữ hiện có (sau khi hai khối trên xong, để dịch luôn chuỗi mới).

**Đợt 2 (2–6 tuần, phần lớn Minh vận hành)**: video ngắn 3–5 / tuần (Claude làm công cụ xuất video từ ván / câu đố),
giải tuần cố định, nộp CrazyGames Basic Launch (hỏi support trước về WebSocket tới máy chủ riêng), bài thảo luận
Reddit / Discord.

**Đợt 3 (sau 6 tuần, theo số đo)**: Telegram đăng nhập bằng initData (nếu localStorage không bền), CrazyGames Full
Launch nếu được mời, TWA Google Play, Facebook Approved Partner (phép thử 0 đồng), Discord Activities.

## 4. Đo hiệu quả

Theo từng nguồn (`src`): người mới / ngày, D1, D7, số ván / người. Mục tiêu tham khảo 6 tuần: CrazyGames qua Basic
Launch (≥ 500 lượt chơi + giữ chân); ≥ 3 kênh có D7 ≥ 10 %; giải tuần ≥ 16 người.
