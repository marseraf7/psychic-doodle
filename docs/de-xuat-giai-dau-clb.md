# Đề xuất: Giải đấu và Câu lạc bộ Caro ở mức Challonge + MyLeague + Lichess Team

Nguồn:
- Báo cáo phân tích ngược Challonge của Laplace (28–29/10/2026).
- Báo cáo phân tích ngược MyLeague.vn của Laplace (29/10/2026).
- Danh sách quyền và cài đặt Team của Lichess. Chỉ lấy ý tưởng: lila là AGPL nên không chép mã.
- Mã hiện tại của Caro: `caro/tour-*.js`, `caro/club.js`, `server/src/hub/{tournaments,tour-run,bracket,stages*,clubs,disputes}.js`.

## 1. Tóm tắt

Ba nền tảng mạnh ở ba chỗ khác nhau:

| | Mạnh nhất ở | Điểm yếu đã đo được |
|---|---|---|
| **Challonge** | Cấu hình thể thức rất sâu (6 thể thức, Two Stage, Rank by 7 cách, tie-break 4 cấp), bracket tự chảy theo tiền lệ thắng/thua, realtime, JSON công khai, nhúng | Không có duyệt tay đăng ký. Không có Public/Private thật. BULK ADD nuốt xuống dòng |
| **MyLeague** | Quản lý **sau khi tạo**: checklist 6 bước, sắp xếp cặp đấu tay và bốc thăm, lịch từng trận, 7 vai trò đồng BTC, nhật ký, bình chọn, nhúng, số trận dự kiến ngay trong form | "Riêng tư" vẫn xem được qua link. Không kiểm định dạng tệp tải lên. Không có tie-break |
| **Lichess Team** | Cộng đồng: 8 quyền quản lý tách nhỏ, yêu cầu tham gia kèm lời nhắn, mã vào, chat và diễn đàn CLB có mức quyền, gửi tin tới toàn CLB, giải nội bộ, Team Battle giữa các CLB | Không quản lý giải kiểu bracket |

Caro đã có nền khá tốt:
- Trình ghép tối đa 3 giai đoạn.
- Bo theo giai đoạn, tranh hạng ba, reset chung kết.
- Hạt giống theo Elo, điểm danh, giải tính Elo.
- Khiếu nại giữ trận.
- **Trận chơi trực tuyến ngay trong hệ thống**, có xem trực tiếp và phát lại. Cả Challonge lẫn MyLeague đều không có điểm này.

Đề xuất: **giữ form tạo nhanh hiện tại**, rồi thêm ba lớp:
1. **Trang "Cài đặt nâng cao"** kiểu Challonge (mục 3). Mở bằng nút ngay dưới ô Thể thức khi chọn *Tuỳ chỉnh*, như ảnh anh gửi.
2. **Khu quản trị giải sau khi tạo** kiểu MyLeague (mục 4).
3. **CLB đầy đủ** kiểu Lichess Team + MyLeague (mục 6).

Những gì Caro không cần (phí / Stripe, bàn đấu offline, biên bản giấy, Free-For-All nhiều người) được ghi rõ ở mục 7, để không làm thừa.

## 2. Hiện trạng Caro so với ba nền tảng

✅ có · ◐ có một phần · ❌ chưa có · — không áp dụng

| Tính năng | Challonge | MyLeague | Lichess | Caro hiện tại | Đề xuất |
|---|---|---|---|---|---|
| Loại trực tiếp / nhánh thắng–thua / vòng tròn / Thụy Sĩ | ✅ | ✅ | ◐ (Arena, Swiss) | ✅ | Giữ |
| Ghép nhiều giai đoạn | ✅ (2) | ◐ (tổ hợp cố định) | ❌ | ✅ (3) | Giữ |
| Chung kết tổng: 1–2 trận / 1 trận / không | ✅ | ❌ | — | ◐ (bật/tắt reset) | Thêm lựa chọn "không có chung kết tổng" |
| Split participants (nửa số người bắt đầu ở nhánh thua) | ✅ | ❌ | — | ❌ | Thêm |
| Trận xếp hạng 3–4, 5–8… | ✅ | ◐ (chỉ hạng ba) | — | ◐ (hạng ba) | Thêm trận xếp hạng đầy đủ |
| Bo theo **từng vòng** (Bo1 → Bo3 bán kết → Bo5 chung kết) | ✅ (`round.best_of`) | ❌ | — | ◐ (theo giai đoạn) | Thêm |
| Rank by (7 cách) + điểm tuỳ chỉnh thắng/hoà trận + ván | ✅ | ◐ (3/1/0) | — | ◐ (điểm thắng/hoà/thua) | Thêm |
| Tie-break chọn được, 4 cấp | ✅ (10 tiêu chí) | ❌ | — | ◐ (cố định trong mã) | Thêm |
| Điểm cho người được miễn đấu (bye) | ✅ | ❌ | — | ◐ (cố định) | Thêm |
| Số vòng Thụy Sĩ tự tính | ◐ | ❌ | ✅ | ❌ | Thêm "tự động = ⌈log₂ n⌉" |
| Số trận dự kiến hiện ngay khi cấu hình | ❌ | ✅ | ❌ | ❌ | Thêm (và thời gian ước tính) |
| Đăng ký: danh sách mời / trang đăng ký | ✅ | ◐ | ◐ | ◐ (tự đăng ký) | Thêm danh sách mời, dán nhiều dòng, CSV |
| Hạn chót đăng ký | ❌ | ◐ (chỉ có ngày) | — | ❌ | Thêm (ngày **và** giờ) |
| Giới hạn số người + danh sách chờ | ◐ (cap) | ❌ | — | ◐ (cap) | Thêm danh sách chờ tự lên |
| Duyệt tay người đăng ký | ❌ | ✅ (vai trò kiểm duyệt) | ✅ (yêu cầu vào team) | ❌ | Thêm |
| Điều kiện tham gia (Elo min/max, số ván, tuổi tài khoản, mã vào) | ◐ | ❌ | ✅ | ◐ (CLB) | Thêm |
| Câu hỏi tuỳ chỉnh khi đăng ký | ✅ | ❌ | ❌ | ❌ | Thêm |
| Điểm danh, chọn giờ mở | ✅ (15 phút → 2 ngày) | ❌ | — | ◐ (cố định 10 phút) | Cho chọn |
| Hạt giống: Elo / ngẫu nhiên / theo danh sách / kéo thả | ✅ | ✅ (bốc thăm, chọn tay) | — | ◐ (Elo / ngẫu nhiên) | Thêm |
| Xếp cặp tay + bốc thăm có hiệu ứng | ◐ | ✅ | — | ❌ | Thêm |
| Lịch giờ cho từng vòng / trận | ◐ | ✅ | — | ❌ | Thêm lịch theo vòng |
| Checklist "đủ điều kiện mở giải chưa" | ❌ | ✅ | — | ❌ | Thêm |
| Khoá cấu hình sau khi bắt đầu | ✅ | ✅ | — | ◐ | Ghi rõ trường nào khoá |
| Reset bracket / xoá giải | ✅ | ✅ | — | ◐ (huỷ) | Thêm Reset |
| Đồng BTC theo vai trò | ✅ (username) | ✅ (7 vai trò) | ✅ (8 quyền) | ◐ (quản lý CLB) | Thêm vai trò ở cấp giải |
| Nhật ký hoạt động BTC | ◐ (Log) | ✅ | ✅ (mod log) | ❌ | Thêm |
| Thông báo (Announcements) | ✅ | ❌ | ✅ (PM all) | ❌ | Thêm |
| Khiếu nại | ✅ (Issues) | ❌ | — | ✅ | Giữ |
| Ẩn hạt giống / ẩn bracket trước giờ / không hiện trong tìm kiếm | ✅ | ◐ | — | ◐ (link / CLB) | Thêm; **riêng tư phải chặn thật** |
| Nhãn vòng tuỳ biến | ✅ | ❌ | — | ❌ | Thêm |
| Bracket tự chảy theo tiền lệ thắng/thua | ✅ | ✅ | — | ✅ (trong mã máy chủ) | Đưa tiền lệ vào dữ liệu gửi client |
| Bracket SVG, phóng to / kéo, toàn màn hình, tải ảnh | ✅ | ✅ | — | ◐ (HTML cột) | Thêm |
| Dải phong độ trong bảng xếp hạng | ❌ | ✅ | — | ❌ | Thêm |
| Realtime cho khán giả | ✅ (Faye) | ◐ | ✅ | ✅ | Giữ |
| JSON công khai + nhúng iframe | ✅ | ✅ | ✅ (API) | ❌ | Thêm |
| Dự đoán bracket / bình chọn trận / bình chọn hạng mục | ✅ | ✅ | ❌ | ❌ | Thêm (đợt sau) |
| Mẫu giải (template), sao chép giải | ✅ | ❌ | ◐ (giải định kỳ) | ❌ | Thêm |
| Ảnh chia sẻ kết quả / poster trận | ✅ (labs) | ✅ | ❌ | ❌ | Thêm, dùng `server/src/png.js` |

## 3. Trang "Cài đặt nâng cao" (như Challonge lúc tạo giải)

### 3.1 Cách mở

Trong form tạo giải, khi ô **Thể thức** là *Tuỳ chỉnh* (hoặc người dùng sửa một giai đoạn nên form tự chuyển sang *Tuỳ chỉnh*), ngay dưới ô đó hiện nút:

> ⚙ **Cài đặt nâng cao**

Bấm nút thì chuyển sang trang riêng (`#tour-new/advanced`):
- Mang theo mọi thứ đã nhập ở form nhanh (tên, mô tả, giai đoạn, giờ, thời gian, luật…).
- Bấm "← Quay lại form nhanh" không mất dữ liệu. Cả hai trang dùng chung một đối tượng cấu hình.
- Nháp được lưu vào `localStorage` để lỡ tải lại trang vẫn còn.

### 3.2 Bố cục

- **Màn rộng:** cột trái là các tab kiểu Challonge Advanced Options; cột phải là nội dung tab.
- **Điện thoại:** các tab thành dải cuộn ngang ở trên.
- **Thanh tóm tắt dính ở đáy trang**, cập nhật trực tiếp như MyLeague:
  > Vòng tròn (4 bảng) → 2 người/bảng → Loại trực tiếp · **~36 trận · 9 vòng · ước tính 2 giờ 40 phút** · tối đa 32 người · [Lưu nháp] [Tạo giải]

### 3.3 Các tab và trường

**① Thông tin cơ bản**
- Tên giải.
- Đường dẫn rút gọn tuỳ chọn (`/t/<slug>`, có nút ngẫu nhiên và kiểm trùng).
- Mô tả: Markdown nhẹ (đậm, nghiêng, link, danh sách), có xem trước.
- Ảnh/logo giải: kiểm định dạng và dung lượng, tái dùng cơ chế avatar đã có.
- Điều lệ giải: văn bản dài, tách khỏi mô tả.
- Đơn vị tổ chức: cá nhân hoặc một CLB mình có quyền "Giải đấu".

**② Thể thức** (giống trình ghép hiện tại, thêm tuỳ chọn riêng cho từng thể thức)
- Kiểu giải: Một giai đoạn / Hai giai đoạn / Ba giai đoạn / Arena.
- *Loại trực tiếp*:
  - Tranh hạng ba.
  - **Trận xếp hạng** (5–8, 9–16…), theo "Break ties with placement matches" của Challonge.
  - Quy tắc xếp hạt giống: truyền thống (1–16, 8–9…) hoặc theo thứ tự danh sách.
- *Nhánh thắng – thua*:
  - Chung kết tổng: **1–2 trận** (mặc định) / **1 trận** / **không có**.
  - **Split participants**.
- *Vòng tròn*:
  - Số lần gặp nhau: 1 / 2 / 3.
  - Chia bảng theo số bảng hoặc theo số người mỗi bảng.
  - Cách chia người vào bảng: rắn (snake) theo hạt giống / ngẫu nhiên / tránh cùng CLB.
- *Thụy Sĩ*:
  - Số vòng: tự động (⌈log₂ n⌉) hoặc chọn 2–15.
  - Tránh gặp lại.
  - Cân màu quân (đi trước / đi sau).
- *Arena*: thời lượng, 🔥 chuỗi thắng, tạm nghỉ (giữ như hiện tại).
- *Đi tiếp giữa các giai đoạn*:
  - Số người mỗi bảng hoặc tổng số người.
  - Cách xếp vào giai đoạn sau: chéo bảng (A1–B2) hoặc theo thứ hạng chung.

**③ Ván đấu và Bo**
- Bo mặc định của giai đoạn.
- **Bo riêng từng vòng**, ví dụ "Vòng 1–3: Bo1 · Bán kết: Bo3 · Chung kết: Bo5". Lấy theo `round.best_of` của Challonge.
- Thời gian mỗi nước hoặc đồng hồ; luật chơi; khai cuộc (tự do / swap2); giải có tính Elo.
- Đổi màu quân giữa các ván trong một trận.
- **Thời gian chờ vắng mặt**: sau bao nhiêu phút không vào thì xử thua. Hiện đang cố định.

**④ Xếp hạng và tie-break** (vòng tròn / Thụy Sĩ)
- *Xếp theo* 7 cách như Challonge:
  1. Số trận thắng.
  2. Số ván thắng.
  3. Tỉ lệ thắng ván.
  4. Hiệu số ván.
  5. Điểm trận.
  6. Tổng điểm.
  7. **Tuỳ chỉnh**: điểm thắng / hoà trận, điểm thắng / hoà ván, **điểm bye**.
- *Tie-break 4 cấp*. Mỗi cấp chọn một trong:
  - đối đầu trực tiếp;
  - Buchholz;
  - Median-Buchholz;
  - Sonneborn–Berger;
  - số trận thắng;
  - hiệu số ván;
  - số ván thắng;
  - số ván thắng khi đi sau;
  - Elo;
  - hạt giống;
  - BTC xếp tay.

  Máy chủ đã tính sẵn Buchholz, Sonneborn–Berger và đối đầu, nhưng đang cố định thứ tự trong `stages-groups.js`. Chỉ cần đổi sang đọc thứ tự từ cấu hình.

**⑤ Đăng ký**
- Cách lập danh sách:
  - **BTC nhập danh sách**: thêm từng người, **dán nhiều dòng** (tách dòng đúng, tránh lỗi BULK ADD của Challonge), nhập tệp **CSV** có tệp mẫu. Thay cho Excel của MyLeague.
  - **Mở trang đăng ký**.
- Giờ mở đăng ký và **hạn chót đăng ký (ngày + giờ)**.
- Giới hạn số người, kèm **danh sách chờ** tự lên khi có người rút.
- **Duyệt tay**: người đăng ký ở trạng thái "chờ duyệt"; BTC Chấp nhận / Từ chối (kèm lý do).
- **Điều kiện**: Elo tối thiểu / tối đa, số ván có tính Elo tối thiểu, tuổi tài khoản, chỉ thành viên CLB X, **mã vào giải** (như mật khẩu team của Lichess), đã xác minh email.
- **Câu hỏi tuỳ chỉnh** (tối đa 5 câu, kiểu chữ / chọn một). BTC xem câu trả lời trong danh sách người chơi.

**⑥ Điểm danh**
- Bật / tắt.
- Mở trước giờ bắt đầu: 10 phút / 15 phút / 30 phút / 1 giờ / 2 giờ / 1 ngày / 2 ngày.
- Người không điểm danh thì tự loại; người trong danh sách chờ được đôn lên.

**⑦ Hạt giống và bốc thăm**
- Theo Elo / ngẫu nhiên / theo thứ tự danh sách / **BTC kéo thả**.
- Tuỳ chọn: tránh cùng CLB gặp nhau ở vòng đầu.
- Xem trước bracket ngay trong trang (dùng tên giả #1…#n nếu chưa có người).

**⑧ Hiển thị và riêng tư**
- Ai xem được: công khai / chỉ người có link / chỉ thành viên CLB / **riêng tư (chỉ BTC + người chơi)**.
  - Rút từ lỗi của MyLeague: chế độ riêng tư phải **chặn thật ở máy chủ**, kể cả khi mở bằng link.
- Không hiện trong danh sách và tìm kiếm.
- Ẩn hạt giống.
- **Ẩn bracket cho tới khi giải bắt đầu**.
- Nhãn vòng tuỳ biến, ví dụ "Vòng loại" thay cho "Vòng 1".
- Chọn tab hiện: Thông báo / Bảng xếp hạng / Thống kê.
- Màu chủ đề của giải.

**⑨ Ban tổ chức** (vai trò ghép từ MyLeague và Lichess)
- Thêm đồng BTC bằng username (có gợi ý như ô thêm bạn).
- Tick từng quyền:
  - **Toàn quyền**: tự tick mọi quyền bên dưới.
  - **Cấu hình giải.**
  - **Quản lý người chơi**: thêm, loại, hạt giống.
  - **Duyệt đăng ký.**
  - **Cập nhật kết quả**: ghi đè, xử thua, huỷ kết quả.
  - **Xử lý khiếu nại.**
  - **Đăng thông báo / gửi tin.**
  - **Đồ hoạ**: ảnh, poster.

**⑩ Thông báo cho người chơi**
- Khi trận của mình mở (đã có push).
- Nhắc điểm danh.
- Nhắc trước giờ giải: 1 giờ, 10 phút.
- Gửi kết quả cuối.
- Nhận tin BTC gửi tới toàn giải.

**⑪ Tương tác khán giả** (đợt sau)
- Bình chọn từng trận "Ai sẽ thắng?" có hạn chót.
- Dự đoán cả bracket trước giờ bắt đầu, có bảng xếp hạng người đoán.
- Bình chọn hạng mục cuối giải: Kỳ thủ xuất sắc, Ván đẹp nhất.

**⑫ Khác**
- **Lưu thành mẫu giải**: mỗi người tối đa 10 mẫu. Dùng lại ở form nhanh qua ô "Mẫu của tôi".
- Sao chép từ một giải cũ.
- Giải định kỳ: hằng tuần / hằng tháng, tự tạo bản mới. Vẫn qua duyệt của quản trị viên, hoặc tự duyệt nếu đơn vị tổ chức là CLB đã được tin cậy.

## 4. Khu quản trị giải sau khi tạo (như MyLeague, thêm phần Challonge)

Trang giải hiện có thêm tab **Quản lý**, chỉ hiện với BTC. Tab này gồm:

1. **Checklist** ở đầu (theo kiểu MyLeague), mỗi dòng bấm thẳng tới chỗ cần làm:
   - ☐ Ảnh + điều lệ
   - ☐ Đủ người
   - ☐ Đã xếp hạt giống / cặp đấu
   - ☐ Đã đặt lịch
   - ☐ Đã có đồng BTC
   - ☐ Đã được duyệt
   - → **Mở giải**
2. **Người chơi**: thêm lẻ / dán nhiều dòng / CSV, xáo hạt giống, kéo thả hạt giống, thay người (trước khi bắt đầu), loại, xem câu trả lời đăng ký, tải danh sách CSV.
3. **Đăng ký chờ duyệt**: Chấp nhận / Từ chối hàng loạt; danh sách chờ.
4. **Cặp đấu**: mỗi trận vòng đầu là hai ô chọn người; nút **Bốc thăm ngẫu nhiên** có hộp xác nhận và hiệu ứng rút thăm; khoá lại khi giải bắt đầu.
5. **Lịch**: giờ bắt đầu từng vòng (và từng trận nếu muốn). Người chơi thấy đếm ngược ở trang trận.
6. **Kết quả**: vì trận chơi trực tuyến nên kết quả tự vào. BTC chỉ cần:
   - ghi đè kết quả khi có sự cố;
   - xử thắng vì đối thủ vắng / xử thua cả hai;
   - **huỷ kết quả**, bracket tự lùi lại như MyLeague;
   - cho đấu lại.

   Mọi thao tác đều ghi vào nhật ký.
7. **Khiếu nại**: giữ nguyên `tour-disputes.js`.
8. **Thông báo**: đăng bài ghim trên trang giải; tuỳ chọn gửi vào Hộp thư / Thông báo (`topbar-inbox.js`) của mọi người chơi.
9. **Nhật ký**: ai làm gì, lúc nào: tạo, sửa cấu hình, duyệt, đổi hạt giống, ghi đè, huỷ kết quả, khiếu nại.
10. **Cài đặt**: mở lại trang Cài đặt nâng cao. Sau khi giải bắt đầu, các trường Kiểu / Thể thức / số người / hạt giống / đăng ký bị **khoá và ghi rõ lý do** (theo Challonge). Tên, mô tả, hiển thị, BTC, thông báo vẫn sửa được.
11. **Đặt lại / Xoá**: Reset bracket (về trạng thái chưa bắt đầu, giữ người chơi) và Xoá giải. Cả hai cần gõ tên giải để xác nhận và dùng `CaroConfirm`.
12. **Nhúng**: mã iframe cho Bracket / Bảng xếp hạng / Lịch, có ô chỉnh rộng / cao và xem trước.

Vòng đời mới:

```
nháp → chờ duyệt → mở đăng ký → (đóng đăng ký) → điểm danh → đang đấu ⇄ tạm dừng → kết thúc
                                                                     ↘ huỷ
```

Thêm hai trạng thái *nháp* và *tạm dừng*. *Tạm dừng* là khi BTC dừng giải để xử lý sự cố: không mở trận mới, các trận đang chơi vẫn đấu nốt.

## 5. Hiển thị cho người xem

- **Bracket vẽ bằng SVG** từ dữ liệu có tiền lệ, theo mô hình Challonge. Mỗi trận gửi kèm `from: { a: {match, loser}, b: {match, loser} }`, client nối đường giữa các trận. Có phóng to / kéo / toàn màn hình. Rê chuột vào một người thì tô sáng đường đi của người đó. Tải ảnh PNG.
- **Bảng xếp hạng** có thêm cột theo cấu hình tie-break, **dải phong độ** (T T H B) và giải thích "Quy tắc xếp hạng" lấy từ cấu hình thật (MyLeague chỉ có văn bản chung).
- **Trang trận**: đếm ngược tới giờ đấu, thành tích hai người, xem trực tiếp, phát lại (đã có).
- **JSON công khai** `GET /api/tour/<id>.json` (theo Challonge `<slug>.json`): chỉ dữ liệu của giải công khai / có link, tôn trọng chế độ riêng tư. Phục vụ trang nhúng `/embed/tour/<id>?view=bracket|standings|schedule`.
- **Thống kê giải**: tổng số ván, ván dài nhất / ngắn nhất, chuỗi thắng dài nhất, tỉ lệ thắng của bên đi trước.

## 6. Câu lạc bộ (Lichess Team + MyLeague)

Hiện có: tạo CLB có duyệt; cách vào tự do / yêu cầu / mã mời; vai trò chủ / quản lý / thành viên; thông báo ghim; thành viên xếp theo Elo; giải của CLB.

Đề xuất thêm:

**6.1 Cài đặt CLB** (theo form Team của Lichess)
- Logo / biểu tượng.
- **Giới thiệu ngắn** (≤ 200 ký tự, hiện trong danh sách).
- **Mô tả** Markdown.
- **Mô tả riêng chỉ thành viên thấy**.
- Cách vào: tự do / **gửi yêu cầu kèm lời nhắn** / mã vào.
- **Ẩn danh sách thành viên.**
- **Chat CLB**: tắt / chỉ quản lý / thành viên.
- **Diễn đàn CLB**: tắt / chỉ quản lý / thành viên / mọi người.

**6.2 Tám quyền của quản lý** (theo `TeamSecurity` của Lichess). Thay vai trò "quản lý" chung chung bằng các quyền tick riêng:

| Quyền | Cho phép |
|---|---|
| Công khai | Hiện tên là quản lý trên trang CLB |
| Cài đặt | Sửa cài đặt, mô tả |
| Giải đấu | Tạo, quản lý, đăng ký giải của CLB |
| Kiểm duyệt | Kiểm duyệt chat, diễn đàn |
| Duyệt yêu cầu | Chấp nhận / từ chối yêu cầu vào CLB |
| Gửi tin | Gửi tin tới toàn bộ thành viên (có giới hạn tần suất) |
| Mời ra | Mời thành viên ra khỏi CLB, kèm tuỳ chọn **chặn** |
| Quản trị | Phân quyền cho quản lý khác |

Chủ CLB có mọi quyền. Ngoài ra có **chuyển quyền chủ** và **giải tán CLB**.

**6.3 Thành viên**
- Yêu cầu vào kèm lời nhắn; danh sách **đã từ chối** (có thể duyệt lại).
- Danh sách **bị chặn**.
- Ngày tham gia.
- Thống kê từng người trong CLB: số giải, số ván, thành tích.
- Thành viên tự tắt nhận tin CLB.
- Trang thành viên lọc theo online / đang chơi.

**6.4 Giao tiếp**
- **Chat CLB**: dùng lại hạ tầng chat phòng, có kiểm duyệt.
- **Diễn đàn CLB**: chủ đề + bài viết + ghim + khoá chủ đề, có kiểm duyệt.
- **Tin gửi toàn CLB**: vào Hộp thư; giới hạn tần suất, ví dụ 1 tin / 12 giờ.
- **Lịch sự kiện CLB**: các giải sắp tới, ván giao hữu.

**6.5 Thi đấu**
- Giải nội bộ CLB (đã có). Thêm "**giải chỉ cho thành viên**" với mọi thể thức, kể cả Thụy Sĩ. Ở Lichess, Thụy Sĩ chỉ dành cho team.
- **Đấu đồng đội giữa các CLB (Team Battle)**:
  - Một giải Arena mà người chơi thi đấu dưới tên CLB.
  - Mỗi CLB chỉ tính điểm của **N người cao điểm nhất** (BTC chọn N).
  - Bảng xếp hạng CLB cập nhật trực tiếp.
- **Giao hữu CLB đấu CLB** (theo đội hình kiểu MyLeague):
  - Mỗi bên chọn đội hình K người theo thứ tự bàn.
  - Bàn 1 gặp bàn 1…
  - Tổng điểm các bàn quyết định thắng thua.
- **Bảng xếp hạng CLB toàn hệ thống** (theo `/ranking/teams` của MyLeague): điểm cộng dồn theo vô địch / á quân / hạng ba của các giải CLB và Team Battle.
- **Tủ cúp CLB**: các giải đã vô địch.

## 7. Không làm hoặc làm khác, và vì sao

| Tính năng ở nền tảng khác | Quyết định cho Caro |
|---|---|
| Phí tham gia, Stripe, gói theo số trận (Challonge, MyLeague) | Không làm. Caro miễn phí, không quảng cáo |
| Bàn / sân đấu (Stations) | Không cần. Trận chơi trong phòng trực tuyến |
| Free For All (>2 người mỗi trận), Leaderboard | Caro chỉ 2 người. Arena đã thay Leaderboard |
| Nhập tỉ số tay theo set | Giải trực tuyến: kết quả tự vào từ ván thật. **Giải offline (danh sách do BTC tự thêm): có nhập tay theo set**, xem mục 10.4 |
| Biên bản PDF in ký tay | **Có**, trình duyệt tự dựng rồi In → Lưu PDF, không tải máy chủ (mục 10.5) |
| Bình luận Facebook | Dùng chat / diễn đàn nội bộ |
| Excel | Dùng CSV: nhẹ, không cần thư viện |
| Thành viên đội có số áo, vị trí bóng đá | Thay bằng "thứ tự bàn" trong đội hình CLB |
| Bài học lỗi của họ | Kiểm định dạng và cỡ tệp ở máy chủ. Riêng tư chặn thật. Dán nhiều dòng tách đúng. Lưu xong cập nhật ngay, không phải tải lại |

## 8. Thiết kế kỹ thuật (theo skill chia-file-hub)

Máy chủ (gom ở `server/src/hub/index.js`):
- `tour-config.js`: chuẩn hoá và kiểm cấu hình mới (giá trị mặc định, giới hạn, khoá sau khi bắt đầu).
- `tour-reg.js`: đăng ký nâng cao (duyệt, danh sách chờ, điều kiện, câu hỏi, CSV).
- `tour-staff.js`: đồng BTC + quyền.
- `tour-log.js`: nhật ký.
- `tour-draw.js`: bốc thăm, xếp cặp tay.
- `tour-public.js`: JSON công khai + nhúng.
- `stages-tiebreak.js`: rank by + tie-break theo cấu hình.
- `stages-elim.js` thêm chung kết tổng 3 kiểu, split, trận xếp hạng, Bo theo vòng, tiền lệ.
- `club-perms.js`, `club-forum.js`, `club-chat.js`, `club-battle.js`.
- Bảng SQLite mới qua `store-schema.js`, có nâng cấp dữ liệu cũ. Giải và CLB đang có vẫn chạy bình thường.

Trình duyệt (mỗi tính năng một module `window.CaroXxx`):
- `tour-adv.js` + `tour-adv-fields.js`: trang Cài đặt nâng cao.
- `tour-estimate.js`: số trận, số vòng, thời gian ước tính, dùng chung cho form nhanh.
- `tour-manage.js`, `tour-manage-players.js`, `tour-draw.js`.
- `tour-bracket-svg.js`.
- `club-settings.js`, `club-forum.js`.
- Chuỗi dịch mới theo chủ đề: `i18n-tour-adv.js`, `i18n-tour-manage.js`, `i18n-club-2.js`. Đủ **vi, en, ru, zh**.
- Mỗi đợt tăng `CACHE` trong `caro/sw.js`.

Kiểm thử:
- Unit cho từng thể thức và tie-break, so số trận với bảng của MyLeague: loại trực tiếp N−1, nhánh thắng–thua 2N−2, vòng tròn n(n−1)/2…
- e2e cho trang nâng cao, quản trị, bốc thăm, nhúng, CLB.
- Chạy `npm run coverage` và e2e trước mỗi PR.

## 9. Lộ trình (mỗi đợt là một PR, CI xanh thì merge)

| Đợt | Nội dung | Effort nên đặt |
|---|---|---|
| **1** | Nút **Cài đặt nâng cao** + trang nâng cao (khung tab, chuyển qua lại không mất dữ liệu, lưu nháp) với các tuỳ chọn engine **đã hỗ trợ**; thanh tóm tắt số trận / vòng / thời gian ước tính (cả ở form nhanh) | high |
| **2** | Tuỳ chọn thể thức mới phía máy chủ: chung kết tổng 3 kiểu, split, trận xếp hạng, Bo theo vòng, rank by + điểm tuỳ chỉnh + điểm bye, tie-break 4 cấp, Thụy Sĩ tự tính số vòng, thời gian chờ vắng mặt | high |
| **3** | Đăng ký nâng cao: hạn chót, danh sách chờ, duyệt tay, điều kiện, mã vào, câu hỏi, danh sách mời + dán nhiều dòng + CSV; giờ mở điểm danh | high |
| **4** | Khu quản trị: checklist, người chơi (kéo thả hạt giống), xếp cặp tay + bốc thăm, lịch theo vòng, ghi đè / huỷ kết quả, thông báo, nhật ký, khoá cấu hình, Reset / Xoá, trạng thái nháp / tạm dừng | high |
| **5** | Đồng BTC theo vai trò; chế độ riêng tư chặn thật; ẩn bracket trước giờ, ẩn hạt giống, nhãn vòng | high (bảo mật / quyền) |
| **6** | Bracket SVG theo tiền lệ, phóng to / toàn màn hình / tải PNG, dải phong độ, JSON công khai + nhúng, thống kê giải | high |
| **7** | CLB: cài đặt mới, 8 quyền quản lý, yêu cầu kèm lời nhắn, đã từ chối / chặn, chuyển chủ, tin gửi toàn CLB | high |
| **8** | CLB: chat + diễn đàn có kiểm duyệt | high |
| **9** | Team Battle, giao hữu CLB đấu CLB, bảng xếp hạng CLB, tủ cúp | high |
| **10** | Bình chọn trận, dự đoán bracket, bình chọn hạng mục, mẫu giải, sao chép, giải định kỳ, poster / ảnh chia sẻ | medium–high |

Việc lặp lại như soát dịch 4 ngôn ngữ, chạy e2e nhiều lần và kiểm trên điện thoại thật sẽ giao Antigravity theo skill `giao-viec-antigravity`.

## 10. Quyết định của anh (29/10/2026)

1. **Giải mới vẫn qua quản trị viên duyệt** như hiện nay. Giải định kỳ (Đợt 10) cũng qua duyệt.
2. **Làm theo thứ tự Đợt 1 → 10.**
3. **Giữ giới hạn 512 người mỗi giải.**
4. **Thêm nhập tỉ số tay theo set (ván)**, chỉ dành cho **giải offline**: giải mà danh sách người chơi do BTC tự thêm bằng Bulk Add (thêm lẻ / dán nhiều dòng / CSV).
   - Người được thêm không cần có tài khoản; trận diễn ra ngoài đời, BTC nhập kết quả.
   - Form nhập theo mẫu MyLeague: mỗi dòng một set (ván), có nút thêm/xoá dòng. Tỉ số trận tự suy ra theo cách tính đã chọn: số set thắng, hoặc tổng điểm các set. Thêm ô "kết quả phụ" để phân định khi hoà.
   - Bracket và bảng xếp hạng tự chảy như giải trực tuyến. Hỗ trợ "Huỷ kết quả".
   - **Quản trị viên (Admin) có quyền cao nhất**: sửa / huỷ mọi kết quả và mọi cài đặt của mọi giải. Mọi thao tác ghi vào nhật ký.
   - Làm cùng **Đợt 3** (Bulk Add) và **Đợt 4** (kết quả, huỷ kết quả).
5. **Biên bản trận PDF để in và ký tay**, chỉ làm theo cách **không thêm tải cho máy chủ và không ảnh hưởng người đang chơi**:
   - Trình duyệt của BTC tự dựng trang biên bản (HTML khổ A4) từ dữ liệu giải đã có, rồi mở hộp thoại In → "Lưu thành PDF". Máy chủ không tạo tệp, không thêm lệnh nặng. Thư viện PDF chỉ nạp khi bấm nút, nên không làm chậm lúc mở web.
   - Nội dung: tên giải, vòng, trận, hai người chơi, thời gian, tỉ số từng set, và ô ký: Trọng tài 1, Trọng tài 2, Ban tổ chức, Giám sát, hai người chơi.
   - Có cả biên bản trắng (in trước trận) và biên bản đã điền kết quả. In được nhiều trận một lúc (cả vòng).
   - Làm ở **Đợt 4** (khu quản trị).

## 11. Tiến độ

- **Đợt 1 – xong** (PR kèm tài liệu này):
  - Thêm nút **Cài đặt nâng cao** dưới ô Thể thức khi chọn Tuỳ chỉnh.
  - Thêm trang nâng cao 5 tab: Thông tin cơ bản · Thể thức · Ván đấu · Đăng ký & điểm danh · Hiển thị & quyền xem. Màn rộng có cột tab bên trái; điện thoại có dải tab ngang. Thanh tóm tắt luôn nằm ở đáy.
  - Form nhanh và trang nâng cao dùng chung một bản nháp: chuyển qua lại không mất dữ liệu, tải lại trang vẫn còn, có nút Đặt lại, tạo giải xong thì tự xoá nháp.
  - Dòng ước tính **số trận · số lượt đấu · thời gian** ở cả hai trang (`caro/tour-estimate.js`). Unit test mô phỏng cả giải bằng logic máy chủ, với mọi thể thức từ 2 đến 70 người: số trận và số lượt khớp chính xác.
- **Đợt 2 – xong**: chung kết tổng 2 trận / 1 trận / không có, split, trận xếp hạng mọi vị trí, Bo riêng bán kết / chung kết, xếp hạng theo (rank by) + điểm thắng / hoà / miễn đấu, tie-break 4 cấp, Thụy Sĩ tự tính số vòng.
- **Đợt 3 – xong**: hạn chót, danh sách chờ, duyệt tay, điều kiện Elo / số ván / tuổi tài khoản, mã vào, câu hỏi khi đăng ký, Bulk Add; giải offline nhập tỉ số theo set, huỷ kết quả, biên bản in ký tay.
- **Đợt 4 – xong**: tab Quản lý (checklist, hạt giống thủ công + xem trước cặp vòng 1, lịch theo vòng, thông báo ghim, nhật ký, sửa cài đặt, tạm dừng, đặt lại, xoá), lưu nháp → gửi duyệt; ô ngày giờ thống nhất 29/10/2026 · 09:00.
- **Đợt 5 – xong**: đồng ban tổ chức theo 6 quyền, giải riêng tư chặn cả link / xem ván, ẩn hạt giống, nhãn vòng tuỳ biến. Nhánh đấu vốn chỉ bốc thăm lúc bắt đầu nên trước giờ đấu chưa ai thấy.
- **Đợt 6 – xong**:
  - Nhánh đấu có **đường nối** giữa các trận (SVG đo theo vị trí thật), thanh công cụ **thu nhỏ / phóng to (40–200%) / toàn màn hình / tải ảnh PNG** (vẽ lại bằng canvas từ dữ liệu, không chụp màn hình). Mức phóng giữ qua các lần cập nhật.
  - **Dải phong độ** 5 trận gần nhất ở bảng vòng tròn / Thụy Sĩ (ô màu + chữ T / H / B, không chỉ dựa vào màu).
  - **Thanh tiến độ + thống kê**: số trận xong / tổng, số ván (set), đang đấu, hoà, xử thắng – tính ở trình duyệt, không thêm việc cho máy chủ.
  - **JSON công khai** `/api/tour/<mã>.json` (như Challonge): chỉ giải người chưa đăng nhập xem được; bỏ khiếu nại và trạng thái online; máy chủ giữ bản dựng 10 giây, chỉ tính lượt theo IP khi phải dựng mới.
  - **Trang nhúng** `embed.html?t=<mã>&view=bracket|standings|players&theme=light|dark&lang=…` cho phép đặt trong iframe của website khác (chỉ trang này bỏ chặn khung); tự cập nhật 20 giây một lần khi đang hiện, dừng khi giải xong. Tab Quản lý có khu **Nhúng vào website** sinh sẵn mã iframe.
- **Đợt 7 – xong**:
  - Cài đặt CLB: biểu tượng (chọn trong 24 biểu tượng, không tải ảnh lên), giới thiệu ngắn hiện ở danh sách, mô tả nhiều dòng, **mô tả chỉ thành viên thấy**, ẩn danh sách thành viên với người ngoài, chọn ai dùng chat / diễn đàn (dùng ở Đợt 8).
  - **8 quyền của quản lý** tick riêng (Công khai, Cài đặt, Giải đấu, Kiểm duyệt, Duyệt yêu cầu, Gửi tin, Mời ra / chặn, Phân quyền). Quản lý cũ giữ đúng quyền của vai trò cũ. Quyền "Phân quyền" chỉ chủ CLB cấp; quản lý có quyền này không sửa được nhau. Trao quyền chủ thì chủ cũ thành quản lý đủ quyền.
  - Yêu cầu vào **kèm lời nhắn**; từ chối thì vào danh sách **đã từ chối** (không gửi lại được, ban quản lý duyệt lại hoặc cho gửi lại); **mời ra kèm chặn** + danh sách bị chặn.
  - **Tin gửi toàn CLB** (1 tin / 12 giờ): người online nhận ngay, người offline nhận khi vào lại, hiện trong chuông thông báo; thành viên tự tắt nhận tin được.
  - Trang CLB có ngày vào của từng người, lọc thành viên đang online. Các việc quản lý chuyển sang trang **Quản lý CLB** riêng (`club-admin.js`); máy chủ tách `club-manage.js`.
- **Đợt 8 – xong**:
  - **Chat CLB** theo cài đặt: tắt / chỉ ban quản lý / mọi thành viên. Người đang mở trang CLB nhận tin ngay; mở trang thì thấy 50 tin gần nhất. Chỉ cập nhật khung chat, không mất chữ đang gõ.
  - **Diễn đàn CLB** theo cài đặt: tắt / ban quản lý viết / thành viên / mọi người đọc. Có chủ đề và bài viết theo trang, giữ xuống dòng. Tác giả sửa / xoá bài của mình. Bài mới hiện ngay ở người đang xem.
  - **Kiểm duyệt** (quyền Kiểm duyệt):
    - xoá tin chat / bài;
    - ghim, khoá, xoá chủ đề;
    - **cấm nói** một thành viên (cả chat và diễn đàn).
  - Giới hạn tần suất: chat 1 tin / giây, bài 1 / 10 giây, chủ đề 1 / phút, tối đa 500 chủ đề.
  - Lưu ở bảng SQLite riêng (`store-club.js`). Giải tán CLB thì xoá hết; xoá tài khoản thì xoá tin và bài của người đó.
