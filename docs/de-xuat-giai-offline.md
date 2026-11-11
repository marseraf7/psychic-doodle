# Đề xuất: "Tạo giải đấu Offline" – giải của mọi bộ môn (Challonge + MyLeague.vn)

Ngày 04/11/2026. Tài liệu để anh duyệt trước khi làm. Nguồn: báo cáo của Laplace về Challonge (cả hệ Race), bản phân
tích MyLeague.vn trước đó, và bài đo tải thật trên máy chủ Caro (mục 7).

## 1. Mục tiêu và các quyết định đã chốt

Trong mục Giải đấu có lối vào riêng **"Tạo giải đấu Offline"**, tách hẳn khỏi hệ giải Caro hiện có. Hệ giải Caro gắn với
ván Caro trên web: phòng đấu, Elo, đồng hồ. Giải offline thì dựng được **giải của bất kỳ bộ môn nào**, có **mẫu sẵn của
các giải nổi tiếng**. Lâu dài: **chatbot AI** nghe người tạo mô tả giải rồi dựng đúng cấu trúc.

| # | Câu hỏi | Quyết định (04/11/2026) |
|---|---|---|
| 1 | Ai tạo được | **Mọi tài khoản tạo ngay**, không cần quản trị viên duyệt. Người xem **không cần đăng nhập** |
| 2 | Quy mô | Tối đa **512** đội / người mỗi giải |
| 3 | Môn / mẫu làm trước | Bóng đá (Premier League, Champions League, World Cup), thể thao điện tử (LoL Worlds), đua (F1 Grand Prix, Time Trial), cầu lông / bóng bàn (set) |
| 4 | Giải Caro offline hiện có (nhập tỉ số tay) | **Giữ nguyên**, không chuyển sang hệ mới |
| 5 | Chatbot AI | Để đợt sau. Bây giờ **thiết kế sẵn đường** cho nó (mục 6) |

## 2. Tách biệt với hệ giải Caro – nhưng dùng lại phần lõi

- **Tách hẳn ở phía người dùng.** Nút và trang riêng, link riêng `…/?o=<url>`, danh sách riêng, dữ liệu riêng (bảng
  `offline_tours`). Không đụng tới Elo, phòng đấu hay lịch giải Caro. Sửa hệ mới không làm hỏng giải Caro đang chạy.
- **Dùng lại phần lõi đã kiểm thử kỹ.** Logic thể thức trong `server/src/hub/stages*.js` không phụ thuộc mạng, có hàng
  chục bài kiểm. Phần dùng lại gồm:
  - loại trực tiếp (kể cả trận xếp hạng từng cặp hạng), nhánh thắng – thua;
  - vòng tròn, Thụy Sĩ (xếp cặp kiểu Hà Lan, 21 hệ số phụ FIDE);
  - kéo thả xếp nhánh, trình soạn mô tả có định dạng, ảnh, đính kèm, ảnh chia sẻ.

  Hệ mới thêm các kiểu kết quả và thể thức còn thiếu (mục 4) **ở file riêng**. Giải Caro chỉ nhận phần cải tiến
  hiệu năng chung (mục 7.3).

## 3. Người tham gia, kết quả theo bộ môn

- **Người tham gia** là *đội* hoặc *cá nhân*, không cần tài khoản: tên, tên ngắn, logo (ảnh tải lên như ảnh mô tả),
  quốc gia / địa phương, hạt giống, nhóm hạt giống (pot). Đội có danh sách thành viên (số áo, vị trí). Gắn
  `@tên_đăng_nhập` thì người đó tự báo kết quả được, nếu ban tổ chức cho phép.
- **Kiểu kết quả một trận / một lượt** (mỗi bộ môn chọn một kiểu):

| Kiểu | Ví dụ | Ghi gì | Cách xếp hạng |
|---|---|---|---|
| `score` | bóng đá, bóng rổ, khúc côn cầu | tỉ số; tuỳ chọn hiệp phụ, luân lưu | thắng / hoà / thua → điểm |
| `sets` | cầu lông, bóng bàn, bóng chuyền, tennis, thể thao điện tử Bo3/Bo5 | điểm từng set; luật set (21 điểm, cách 2, chạm 30…) | số set → thắng thua |
| `winner` | đánh cờ, đối kháng nhanh | chỉ người thắng / hoà (Quick advance) | thắng / hoà / thua |
| `legs` | Champions League vòng knock-out | 2 lượt đi – về, tổng tỉ số, luân lưu | tổng tỉ số |
| `rank` | Single Race, battle royale | thứ hạng của cả đoàn trong một lượt | bảng điểm theo hạng |
| `time` | Time Trial | thời gian `HH:MM:SS.mmm` | nhanh nhất; tự tính chênh lệch với người dẫn đầu và với người ngay trên |
| `points` | Grand Prix, thi chấm điểm | điểm mỗi chặng (tự tính từ hạng theo bảng điểm, hoặc nhập tay) | tổng điểm |

- **Bộ cài sẵn theo môn** (sửa được). Ví dụ bóng đá: thắng 3 – hoà 1 – thua 0, tie-break hiệu số → bàn thắng → đối đầu.
  Cầu lông: Bo3, set 21 điểm cách 2 chạm 30. Bóng bàn: Bo5, set 11 điểm cách 2. F1: bảng điểm 25-18-15-12-10-8-6-4-2-1.

## 4. Thể thức – những gì có sẵn và những gì thêm

Có sẵn, dùng lại:
- loại trực tiếp, nhánh thắng – thua, vòng tròn (chia bảng, 1–3 lượt), Thụy Sĩ;
- nhiều giai đoạn, kéo thả xếp nhánh, trận xếp hạng.

Thêm mới (file riêng trong `server/src/hub/`, kiểm thử như `stages.test.js`):
1. **League lượt đi – về** cho giải 20 đội (Premier League) và **vòng tròn lớn** tới 64 đội. Lịch theo vòng, có sân nhà / sân khách.
2. **League phase kiểu Champions League mới.** Mỗi đội gặp N đối thủ: lấy từ các nhóm hạt giống (pot), không gặp đội cùng
   quốc gia. Dùng một bảng xếp hạng chung. Chuyển giai đoạn **theo dải hạng**: hạng 1–8 vào thẳng vòng 1/8, hạng 9–24
   đá play-off, hạng 25+ bị loại.
3. **Thụy Sĩ theo số thắng / thua** kiểu LoL Worlds: thắng 3 thì đi tiếp, thua 3 thì bị loại. Các trận quyết định
   đi tiếp / bị loại dùng Bo3, còn lại Bo1. Ghép cặp cùng thành tích (1–0 gặp 1–0).
4. **Đi tiếp nhờ là đội hạng 3 tốt nhất** kiểu World Cup 2026 (12 bảng, 8 đội hạng ba có thành tích tốt nhất), kèm bảng
   phân nhánh theo tổ hợp bảng.
5. **Knock-out 2 lượt** (tổng tỉ số, luân lưu) và chung kết 1 trận.
6. **Hệ Race** (đúng như báo cáo Challonge của Laplace, nhưng bỏ chỗ dở của Challonge):
   - **Single Race**: nhập thứ hạng.
   - **Time Trial**: nhập thời gian, tự tính chênh lệch so với người dẫn đầu và với người ngay trên.
   - **Grand Prix**: 1–30 chặng, cộng điểm qua các chặng. Challonge bắt nhập điểm tay; mình **tự đổi hạng ra điểm**
     theo bảng điểm (sửa tay được). Có cả bảng xếp hạng đội, như bảng đội đua của F1.
   - Trạng thái chặt chẽ: không có tình trạng giải bị kẹt ở bước điểm danh như Challonge (mục 12.8 của báo cáo).
7. **Trận nhiều người** (battle royale, đua nhiều xe): một lượt có cả đoàn, điểm theo hạng + điểm thưởng.

## 5. Phần kiểu MyLeague.vn

- **Lịch thi đấu:** ngày giờ, sân, vòng; xuất lịch ra CSV / in.
- **Đội hình và thống kê cầu thủ:** bàn thắng, kiến tạo, thẻ vàng / đỏ, cầu thủ hay nhất trận. Tự có bảng vua phá
  lưới, danh sách bị treo giò (đủ thẻ). Có trình tự sự kiện trong trận (phút, cầu thủ).
- **Trang giải công khai:** tin tức, ảnh chia sẻ kết quả, nhúng vào web khác, trang đăng ký đội. Có tuỳ chọn duyệt
  đăng ký, giới hạn số đội, danh sách chờ.
- **Biên bản in** cho trọng tài ký tay. Đồng ban tổ chức chia quyền như giải Caro.

## 6. Đường cho chatbot AI (thiết kế ngay từ đầu)

- **Mọi giải là một "bản cấu hình" JSON** theo một lược đồ công khai (`format spec`): bộ môn, kiểu kết quả, các giai
  đoạn, cách xếp cặp, tie-break, luật đi tiếp. **Mẫu giải nổi tiếng chính là các bản cấu hình viết sẵn.**
- Máy chủ có **trình kiểm** (`validateSpec`) và **trình mô tả** (`describeSpec`): đổi bản cấu hình thành lời, kiểu
  "36 đội, mỗi đội đá 8 trận, hạng 1–8 vào thẳng…". Đi kèm phần **ước tính** số trận, số vòng, thời gian, và **xem
  trước nhánh / lịch**.
- Sau này chatbot chỉ việc **viết ra bản cấu hình**. Máy chủ kiểm hợp lệ, hiện mô tả bằng lời + xem trước để người tạo
  bấm đồng ý. **Chatbot không bao giờ trực tiếp tạo / sửa dữ liệu.** Như vậy an toàn, và chatbot sai thì người dùng
  thấy ngay.
- Ví dụ rút gọn (Champions League):

```json
{ "sport": "football", "result": "score", "points": { "w": 3, "d": 1, "l": 0 },
  "tiebreaks": ["gd", "gf", "away_gf", "wins", "away_wins", "opp_pts", "opp_gd", "opp_gf"],
  "stages": [
    { "type": "league_phase", "teams": 36, "games": 8, "pots": 4, "perPot": 2, "homeAway": "split", "avoid": ["country"],
      "advance": [{ "ranks": [1, 8], "to": "r16", "seedBy": "rank" }, { "ranks": [9, 24], "to": "playoff" }] },
    { "id": "playoff", "type": "knockout", "legs": 2, "pairing": "9-16 vs 17-24" },
    { "id": "r16", "type": "knockout", "legs": 2, "final": { "legs": 1 } } ] }
```

## 7. Ảnh hưởng tới máy chủ – đã đo thật

### 7.1 Bài đo (04/11/2026)

Bài đo chạy máy chủ thật trong máy ảo 4 nhân. Giải offline 512 người, 50 người cùng xem qua WebSocket, nhập hết kết quả.
Có hai kiểu nhập:
- **Dồn dập:** hàng nghìn kết quả trong vài giây – trường hợp xấu nhất.
- **Thực tế:** nhập một kết quả, chờ máy chủ gửi xong rồi mới nhập kết quả tiếp.

| Thể thức (512 người) | Số trận | Dữ liệu giải khi xong | Trang giải (chưa nén) | Dựng trang giải | CPU mỗi kết quả, 50 người xem (nhập thực tế) | Bản vá mỗi kết quả |
|---|---|---|---|---|---|---|
| Loại trực tiếp + xếp hạng đủ | 2 304 | 1,0 MB | 1,1 MB | 26 ms | ~86 ms | 1,5 KB |
| Nhánh thắng – thua | 1 022 | 0,5 MB | 0,5 MB | 7–11 ms | ~57 ms | 1,5 KB |
| Thụy Sĩ 9 vòng | 2 304 | 0,8 MB | 1,2 MB | 44–59 ms | ~76 ms | 8,6 KB |
| 32 bảng × 16 → loại trực tiếp 64 | 3 904 | 1,3 MB | 1,8 MB | **105–168 ms** | **~250 ms** | 1,7 KB |

- **Không người xem:** máy chủ xử lý một kết quả hết **2–6 ms CPU**, kể cả khi nhập dồn dập.
- **Bộ nhớ:** khoảng 70 MB lúc chưa có giải, khoảng 200–300 MB khi có 4 giải 512 người cùng chạy và 50 người xem.
  CSDL sau 4 giải là 3–5 MB.
- **Đường truyền:**
  - Máy chủ đã bật nén tin WebSocket (JSON còn khoảng 1/10). Số ở bảng là **chưa nén**.
  - Mỗi người mở trang giải 512 người nhận trang đầy đủ: 0,5–1,8 MB chưa nén, khoảng 0,1–0,2 MB thực truyền. Sau đó
    chỉ nhận bản vá 1,5–8,6 KB mỗi kết quả.
  - **Ngoại lệ:** Thụy Sĩ mỗi lần sang vòng mới gửi lại cả giai đoạn (khoảng 1 MB chưa nén) cho từng người xem.

### 7.2 Kết luận

- **Một giải lớn: máy chủ chịu được.** Giải 512 đội nhập kết quả thật (mỗi lần cách nhau vài giây trở lên) chỉ tốn vài
  phần trăm của một nhân CPU. Nhập dồn dập vẫn chạy trơn.
- **Rủi ro thật nằm ở 3 chỗ** khi mở cho **mọi tài khoản tạo ngay**:
  1. **Bộ nhớ:** hiện mọi giải chưa xong đều nằm trong RAM. Nhiều người tạo giải lớn rồi bỏ đó thì RAM tăng dần (giải 512
     người đang chạy chiếm vài MB RAM).
  2. **Tạo giải hàng loạt / spam** khi không còn bước quản trị viên duyệt.
  3. **Giải nhiều bảng có nhiều người xem:** mỗi kết quả dựng lại cả 32 bảng (105–168 ms). 10 giải cỡ này cùng nhập dồn
     dập thì một nhân CPU bận liên tục.

### 7.3 Biện pháp (đưa vào lộ trình, làm ngay từ đợt đầu)

- **Giải offline nạp theo yêu cầu.** Chỉ giải đang có người xem / sửa mới nằm trong RAM; quá 30 phút không ai đụng thì cất
  về CSDL (LRU, tối đa khoảng 200 giải trong RAM). Giải offline không có đồng hồ hay phòng đấu nên không cần chạy nền.
- **Hạn mức mỗi tài khoản:**
  - tối đa **10 giải offline chưa kết thúc**;
  - **20 lần tạo mỗi ngày**;
  - tối đa **10 000 trận mỗi giải**, kèm giới hạn theo thể thức (vòng tròn một bảng ≤ 64 đội; nhiều bảng thì mỗi bảng
    ≤ 16 như hiện nay);
  - ảnh vẫn tối đa 40 ảnh / tài khoản;
  - giải không ai đụng 180 ngày thì tự lưu trữ (chỉ đọc).
- **Chống lạm dụng:** tên / mô tả qua bộ lọc từ tục như hiện nay; nút báo cáo giải vi phạm; quản trị viên ẩn / xoá được.
  Hạn mức trên chặn được phần lớn spam.
- **Dựng trang giải theo phần** (cũng giúp giải Caro):
  - bảng xếp hạng nào có trận đổi mới tính lại (giảm 105–168 ms còn vài ms);
  - Thụy Sĩ sang vòng mới chỉ gửi các trận mới, không gửi lại cả giai đoạn;
  - giải nhiều bảng lần đầu chỉ gửi bảng của mình + tóm tắt, mở bảng nào mới tải bảng đó.
- **Bài đo tải thành bài kiểm thử cố định.** Thêm vào `server/test`, chạy cỡ nhỏ trong CI; có ngưỡng CPU / dung lượng
  để phát hiện sớm nếu đợt sau làm chậm máy chủ.

## 8. Lộ trình (mỗi đợt một PR, CI xanh thì merge, tự review sau mỗi đợt)

| Đợt | Nội dung |
|---|---|
| **O1 – Khung** | Lối vào "Tạo giải đấu Offline". Bảng `offline_tours` nạp theo yêu cầu + LRU, hạn mức mỗi tài khoản. Trang giải công khai `?o=<url>` (không cần đăng nhập). Đội / cá nhân, bản cấu hình JSON + `validateSpec`. Dùng lại các thể thức có sẵn với kiểu kết quả `score` / `sets` / `winner`. Dựng trang theo phần (mục 7.3). Bài đo tải trong CI |
| **O2 – Bộ môn & kết quả** | Bộ cài sẵn theo môn: bóng đá, cầu lông, bóng bàn, bóng chuyền, tennis, thể thao điện tử. Hiệp phụ, luân lưu, luật set. Tie-break theo môn |
| **O3 – Thể thức mới** | League lượt đi – về. League phase kiểu Champions League (pot, tránh cùng quốc gia, đi tiếp theo dải hạng). Thụy Sĩ theo số thắng / thua (LoL). Đi tiếp nhờ hạng ba tốt nhất (World Cup 2026). Knock-out 2 lượt |
| **O4 – Race** | Single Race, Time Trial (chênh lệch với người dẫn đầu / người ngay trên), Grand Prix nhiều chặng (bảng điểm tự động, bảng đội), trận nhiều người |
| **O5 – Thư viện mẫu** | Premier League, Champions League, World Cup 2026, LoL Worlds, F1, giải cầu lông / bóng bàn. Chọn mẫu → xem mô tả bằng lời + xem trước → sửa → tạo |
| **O6 – MyLeague** | Lịch & sân, đội hình, sự kiện trong trận, thống kê cầu thủ (vua phá lưới, thẻ, treo giò), trang đăng ký đội, biên bản |
| **O7 – Trình bày** | Nhánh / bảng / lịch đẹp trên điện thoại, ảnh chia sẻ, nhúng, xuất CSV / PDF |
| **O8 – Sẵn sàng cho AI** | Công bố lược đồ JSON, `describeSpec` (mô tả bằng lời), nhập cấu hình từ JSON. Khung hỏi – đáp để sau này cắm chatbot. Chatbot thật (khoá API, chi phí) là quyết định riêng sau |

### 8.1 Trạng thái (05/11/2026)

| Đợt | Đã làm | Còn lại / làm khác |
|---|---|---|
| O1 | Xong: kho riêng nạp theo yêu cầu + LRU, hạn mức, trang công khai `?o=`, `normalizeSpec`, memo giai đoạn đã xong | – |
| O2 | Xong: 13 bộ môn, luật set (kiểm cả trận theo Bo), hiệp phụ, luân lưu, điểm thắng / thua sát, tie-break theo điểm trong set | – |
| O3 | Xong: league lượt đi – về (bảng tới 64), league phase (pot, tránh cùng quốc gia, đi tiếp theo dải hạng qua hạt giống), Thụy Sĩ theo thắng / thua, hạng ba tốt nhất, knock-out 2 lượt; **nhánh theo vị trí trong bảng** (`path: 'groups'`, `caro/otour-path.js`): khuôn đúng 16 cặp vòng 32 đội World Cup 2026 (trận 73–88 và đường lên các vòng sau), khuôn chung cho nhất + nhì (+ hạng ba tốt nhất) – đội cùng bảng ở hai nửa nhánh; xem trước đường đi "1E – 3 A/B/C/D/F" khi vòng bảng chưa xong | Đội hạng ba vào ô nào: ghép hợp lệ (đúng bảng được phép, không trùng – kiểm cả 495 tổ hợp), có thể khác bảng Annex C của FIFA ở một số tổ hợp |
| O4 | Xong: Single Race, Grand Prix (bảng điểm, countback, điểm tay, bảng đội), Time Trial (chênh lệch); **chia lượt (heat)** cho đoàn đông (`heat` = tối đa người mỗi lượt; chia đều kiểu rắn theo hạt giống, các chặng sau đổi đối thủ; nhập / huỷ từng lượt; thời gian gộp mọi lượt, điểm theo hạng trong lượt; có chia lượt thì tới 512 người) | – |
| O5 | Xong: 10 mẫu, mô tả bằng lời + ước tính, đội mẫu | – |
| O6 | Xong: lịch & sân, đội hình, sự kiện trận, vua phá lưới / thẻ, đăng ký đội + duyệt, biên bản in; **treo giò tự động** (`otour-disc.js`: tích luỹ thẻ vàng, thẻ đỏ / 2 thẻ vàng một trận, xoá thẻ khi sang giai đoạn mới – ban tổ chức chỉnh; án rơi vào trận kế tiếp của đội, cảnh báo cầu thủ bị treo giò vẫn có tên trong trận) | – |
| O7 | Xong: Thụy Sĩ chỉ gửi vòng mới, bài đo tải trong CI, xuất CSV / JSON, tải lười vòng tròn > 8 bảng (trang 512 đội 1,6 MB → 125 KB; mở bảng nào tải các trận bảng đó, bảng đang mở được đẩy cập nhật); **trang riêng** kiểu Challonge / MyLeague thay cho hộp thoại (`#page-otour`, địa chỉ `?o=` / `?ot=list` / `?ot=new`, nút ‹ và Back / Forward của trình duyệt, các tab Tổng quan – Nhánh đấu & bảng – Lịch – Thống kê – Đội – Khác); **ảnh chia sẻ** vẽ ngay trên máy (bảng xếp hạng 1080×1350, bục trao giải 1200×630, kết quả từng trận); **nhúng vào website** (`embed.html?o=<link riêng>`, dữ liệu `/api/otour/<mã>.json` giữ 10 giây, mã `<iframe>` ở tab Khác; giải nháp / riêng tư không nhúng được); **báo cáo PDF** khổ A4 làm ngay trên máy (`pdf-lite.js` + `otour-pdf.js`: bảng xếp hạng, kết quả từng vòng, bục trao giải; tối đa 60 trang) | – |
| O8 | Xong: lược đồ `/api/otour/schema.json` (kèm ví dụ), `describeSpec`, nhập / xuất cấu hình JSON; **trợ lý AI** trong form tạo giải (`hub/otour-ai.js` + `hub/otour-ai-call.js` + `caro/otour-ai.js`): AI của máy chủ mặc định **Muse Spark** (Meta, rẻ; Claude vẫn dùng được), người dùng có thể **dùng khoá API của riêng mình** (Muse, Claude, OpenAI, Gemini, DeepSeek, OpenRouter – danh sách cố định `caro/otour-ai-providers.js`, khoá không lưu ở máy chủ); lời đáp JSON kiểm lại bằng `parseSpec`, xem trước rồi mới áp; trần lượt / ngày | Bật khoá + trần chi phí: `server/README.md` |
| Giải Mỹ (3 đợt) | **Mùa giải kiểu nhà nghề Mỹ** (`caro/otour-season.js`, `hub/stages-season.js`): miền × bảng con, số lần gặp theo quan hệ (cùng bảng con / cùng miền / khác miền) + "gặp thêm 1 lần", sân nhà chia đều; 5 mẫu đúng số trận thật (NBA 82, NFL 17, MLB 162, NHL 82, MLS 34). **Playoff giống bản gốc** (`hub/stages-playoff.js`): nhánh riêng từng miền, nhất bảng con giữ hạt giống đầu, miễn đấu cho hạt giống cao, play-in NBA / MLS, nhánh theo bảng con + vé vớt (NHL), Bo từng vòng (MLB), xếp lại cặp (NFL); **loạt Bo kiểu tỉ số** (bóng đá – vòng 1 MLS Bo3: mỗi trận một tỉ số, hoà thì luân lưu). **Tự xếp lịch** (`caro/otour-sched.js`, `hub/otour-sched.js`, `caro/otour-sched-ui.js`): ngày trong tuần, khung giờ, sân chung / sân nhà, ngày nghỉ tối thiểu, ngày không đấu; dời lượt đấu, hoãn + tìm ngày đá bù, cảnh báo trùng lịch, tải lịch `.ics`; tự xếp giai đoạn sau / vòng Thụy Sĩ mới | Giờ địa phương theo múi giờ lúc đặt lịch (không tính giờ mùa hè) |
| Thể thức đặc biệt – đợt 1 (Esports) | **Chi tiết từng ván** (`caro/otour-draft.js`, `hub/otour-games.js`, `caro/otour-games-ui.js`; lưu ở `m.esp` – `m.games` là mã ván cờ của giải Caro): bên xanh / đỏ, thời lượng, **cấm chọn** theo kịch bản (LoL 20 bước / tự chọn số cấm – chọn / tắt), **Fearless** cứng / mềm / tắt, phạm vi trong loạt hoặc cả giai đoạn (máy chủ chặn, giao diện báo tướng bị khoá), chỉ số đội bắt buộc (hạ gục, vàng, trụ, rồng, Baron… hoặc nhãn tự đặt), MVP, K/D/A tuỳ chọn, **biểu đồ vàng** theo thời gian; danh sách tướng gợi ý do ban tổ chức dán + tên đã dùng (không đóng gói dữ liệu của Riot); thống kê tướng (chọn / cấm / có mặt / tỉ lệ thắng), bên xanh thắng, thời lượng, MVP. **Đội vào thẳng giai đoạn sau** (`direct`), **Thụy Sĩ vòng 1 tránh cùng khu vực** (`region`). Mẫu **LoL Worlds 2025**: Play-In Bo5 → 15 đội vào thẳng Thụy Sĩ 16 đội → loại trực tiếp Bo5, Fearless cứng | – |
| Thể thức đặc biệt – đợt 2 (America's Cup) | Bộ môn **đua thuyền** (`sailing`): mỗi race ghi thuyền vào từ mạn trái / mạn phải, **thời gian về đích** từng thuyền (bắt buộc) → cách biệt về đích, thống kê bên vào sân thắng; dùng chung hạ tầng chi tiết ván (`DR.SPORTS`, `DR.defaults`). **Loại trực tiếp làm giai đoạn giữa** (chỉ giải offline): `advance` đội đi tiếp theo thứ hạng chung cuộc của nhánh. Kiểm tra mỗi giai đoạn sau có ít nhất 2 đội (`ot_stage_few`). Mẫu **America's Cup**: đội giữ cúp vào thẳng trận tranh cúp; 5 đội thách đấu đá vòng tròn 2 lượt → bán kết Bo9, chung kết Bo13 → trận tranh cúp Bo13 | – |
| Thể thức đặc biệt – đợt 3 (Tour de France) | Hệ Race thêm cách tính **`gt` – xe đạp nhiều chặng** (`hub/stages-gt.js`, `caro/otour-gt.js`): loại từng chặng (đồng bằng / đồi / núi / tính giờ cá nhân); nhập thứ hạng + thời gian (bỏ trống = cùng thời gian người về trước, "+0:12" = chậm hơn người về nhất), điểm leo núi, nước rút, giây thưởng / phạt, bỏ cuộc; dán cả danh sách về đích. **Năm bảng xếp hạng**: tổng thời gian có giây thưởng 10–6–4 (áo vàng), điểm theo loại chặng (áo xanh), leo núi (chấm bi), tay đua trẻ – cột thứ 4 "U25" (áo trắng), đồng đội (3 người nhanh nhất mỗi chặng); người giữ áo sau từng chặng; bỏ cuộc rời mọi bảng. Nhập lần lượt, chỉ huỷ chặng sau cùng. Bộ môn **xe đạp**, mẫu **Tour de France** (21 chặng, 23 đội × 8) | – |
| Thể thức đặc biệt – đợt 4 (The Masters, nhiều mùa, giải mời) | Hệ Race thêm cách tính **`golf` – đấu gậy** (`hub/stages-golf.js`, `caro/otour-golf.js`): par từng lỗ (1–18 lỗ), nhập **tổng gậy mỗi vòng (mặc định) hoặc từng lỗ**, lưu được khi vòng đang dở (bảng dẫn đầu ghi "đã đánh tới lỗ"); so với par, đồng hạng "T"; **cắt sau vòng N lấy top N + đồng hạng**, giữ điểm cộng dồn (Masters 2025: 50 người + đồng hạng, không còn luật "trong vòng 10 gậy"); rút lui; **đấu phụ đột tử** khi bằng điểm hạng nhất (lỗ 18, 10 luân phiên – ban tổ chức ghi người thắng + số lỗ); vòng thấp nhất, thống kê từng lỗ (eagle, birdie, par, bogey, lỗ khó nhất). Mẫu **The Masters** (90 người, 4 vòng par 72). **Giải nhiều mùa** (`hub/otour-next.js`, `caro/otour-next.js`): tạo mùa sau giữ cấu hình; **đặc cách trọn đời** tự chuyển sang mùa sau, nhà vô địch tự được thêm và đứng đầu (đội giữ cúp America's Cup vào thẳng trận tranh cúp); có thể giữ cả danh sách đội; liên kết các mùa. **Đăng ký chỉ theo lời mời**: ban tổ chức mời theo tên đăng nhập, người được mời nhận thông báo (chuông) và xem được giải riêng tư | – |
| Thể thức đặc biệt – đợt 5 (Esports World Cup) | **Giải tổng gom nhiều giải con** (`hub/otour-multi.js`, `caro/otour-multi.js`): giải tổng không có trận riêng, mỗi giải con là một giải offline thể thức riêng (`parent`); tạo giải con từ trang tổng, gắn / gỡ giải có sẵn. **Câu lạc bộ** = cột thứ 3 của danh sách đội; **bảng điểm câu lạc bộ**: giải con kết thúc thì mỗi câu lạc bộ nhận điểm theo thứ hạng chung cuộc của đội xếp cao nhất (bảng điểm theo hạng sửa được, mặc định 1000-750-500-300-200-200-100-100; bị loại cùng vòng thì đồng hạng), cộng dồn, bằng điểm xét số lần hạng cao hơn. Trang tổng: bảng điểm, các giải con (trạng thái, nhà vô địch), **lịch gộp** các trận sắp tới; trạng thái giải tổng theo các giải con. **Giải con không tính vào hạn mức** và không liệt kê riêng (tối đa 30 giải con). Mẫu **Esports World Cup**: tạo kèm 5 giải con theo thể loại (MOBA, bắn súng, sinh tồn, đối kháng, cờ nhanh) | Giải con riêng tư không hiện ở trang tổng |
| Thể thức đặc biệt – đợt 6 (soát tổng thể) | Bài thử `server/test/otour-special-flow.test.js` chạy trọn từng mẫu mới qua máy chủ với đủ số đội gợi ý (LoL Worlds, America's Cup, Tour de France 184 tay đua × 21 chặng, The Masters 90 golfer, Esports World Cup 5 giải con → bảng điểm câu lạc bộ), khách tải được bản xem đầy đủ. Sửa: golf – người thua đấu phụ xếp hạng 2 (trước đó vẫn hiện đồng hạng 1); xuất CSV bảng xếp hạng golf (hạng / bị cắt / rút lui, số vòng, tổng gậy, so với par). Trang nhúng `embed.html` vẽ được bảng xe đạp và golf (có kiểm thử trình duyệt) | – |
| Thể thức đặc biệt – đợt 7 (giải con Esports World Cup) | Tra thể thức từng game của EWC 2025 và thêm phần còn thiếu. **Bảng đấu loại kép 4 đội kiểu GSL** (`hub/stages-gsl.js`, kiểu giai đoạn `gsl`: mở màn → nhánh thắng / nhánh thua → trận quyết định; nhất, nhì bảng đi tiếp; Bo riêng trận quyết định) – thể thức vòng bảng của LoL, Valorant, TFT, cờ vua, Rocket League, MLBB ở EWC. **Sinh tồn**: điểm theo hạng + điểm mỗi lần hạ gục (`kill`), kết thúc kiểu **match point** (`mp`: ngưỡng cố định như Apex 50 điểm, hoặc "điểm đội dẫn đầu sau N trận + X" như Smash Rule của PUBG Mobile). **Vòng vớt** (`skip`): các đội đầu giai đoạn 1 vào thẳng giai đoạn 3, phần còn lại đá giai đoạn 2 (Survival Stage / Last Chance). **Giải vô địch câu lạc bộ**: bảng điểm mặc định sửa thành 1000-750-500-300-200-150-100-50, thêm điều kiện có điểm ở ít nhất N giải con và phải vô địch một giải mới đứng đầu. Mẫu Esports World Cup giờ tạo 6 giải con dùng các thể thức này | Các mục “chưa làm” trước đây đã làm ở đợt 8. |
| Thể thức đặc biệt – đợt 8 (giải con Esports World Cup, phần còn lại) | **Loạt Bo2 có hoà** cho vòng tròn / Thụy Sĩ thường của giải offline (hai ván phải đủ, 1–1 chia điểm). **Bảng đấu loại kép 8 người lấy 4** (`stages-gsl.js`, `size: 8`: 10 trận, trận quyết định chéo nhánh). **Nhất bảng GSL vào thẳng giai đoạn 3** (`skip` cho bảng GSL: nhì bảng đá vòng tròn giai đoạn 2, kiểu đối kháng 1 đấu 1). **Sinh tồn chia 3 bảng xoay vòng** (`rot`: mỗi trận hai bảng đấu, một bảng nghỉ; chỉ nhận kết quả của hai bảng đó). **Điểm thưởng mang sang** (`head`: điểm cộng sẵn theo thứ tự vào giai đoạn, kiểu Points Rush). Mẫu Esports World Cup thêm 3 giải con (MOBA loạt Bo2, sinh tồn có vòng giành điểm thưởng, chiến thuật thời gian thực) và đổi giải đối kháng sang 48 người. Kiểm thử: `server/test/otour-formats8.test.js`, `caro/tests/e2e/otour-formats8.e2e.js`. | Đã làm |
| Thể thức đặc biệt – đợt 9 (5 game EWC còn lại) | Tra thể thức EWC 2025 của bóng đá ảo, MOBA di động, đua xe ảo, bắn súng góc nhìn thứ nhất, đối kháng 2D. Bóng đá ảo, bắn súng, đối kháng 2D dùng thể thức đã có (bảng GSL → loại trực tiếp). Làm mới: **vòng tranh hạt giống + cơ hội cuối** (`stages-kings.js`, chỉ giai đoạn giữa: nửa trên cao gặp thấp – thắng vào nhóm hạt giống 1, thua vào nhóm 2; nửa dưới Bo riêng – thắng vào nhóm 2, thua bị loại; hai đội đã gặp nhau tránh gặp lại ngay vòng đầu nhánh sau) và **match point chỉ tính từ trận thứ N** (`mp.min`, kiểu Finalist Mode). Mẫu Esports World Cup có 14 giải con (tạo kèm tối đa 16). Soát lại việc đợt 2–9 và sửa: giải con có giai đoạn cuối là bảng GSL làm hỏng trang giải tổng; golf đồng hạng cùng nhận điểm câu lạc bộ; match point không đi cùng chia lượt; giây thưởng âm ở bảng xe đạp; vòng tranh hạt giống số đội lẻ (đội cao nhất nửa dưới miễn đấu). Kiểm thử: `server/test/otour-formats9.test.js`, `caro/tests/e2e/otour-formats9.e2e.js`. | Đã làm |
| Thể thức giải lớn – đợt 10 (CS Major) | **Giải offline tối đa 4 giai đoạn** (giải Caro trực tuyến giữ 3). **Ghép cặp Thụy Sĩ kiểu CS Major** (`stages-valve.js`, `pairing: 'valve'`, chỉ Thụy Sĩ theo thắng / thua – theo luật công khai "Major Supplemental Rulebook" của Valve, không chép mã): vòng 1 hạt giống i gặp i + n/2; sau đó cùng thành tích, xếp theo độ khó (tổng thắng − thua của các đối thủ đã gặp) rồi hạt giống giai đoạn, cao gặp thấp, không gặp lại; nhóm 6 đội theo bảng ưu tiên 15 dòng; xếp hạng giai đoạn theo thắng – thua, độ khó, hạt giống. Mẫu kiểu CS Major: 32 đội, 3 giai đoạn Thụy Sĩ (hạt giống 9–16 vào thẳng giai đoạn 2, 1–8 vào thẳng giai đoạn 3; giai đoạn 3 toàn Bo3), playoff 8 đội Bo3, chung kết Bo5. Kiểm thử: `server/test/otour-majors.test.js`, `caro/tests/e2e/otour-majors.e2e.js`. | Đã làm |
| Thể thức giải lớn – đợt 11 (sinh tồn PC kiểu PGC) | **Sinh tồn chia bảng cố định** (`cfg.groups` = 2–8, cách tính điểm): chia bảng kiểu rắn theo hạt giống, mỗi bảng đấu `events` trận riêng (trận i thuộc bảng i % G), xếp hạng / đi tiếp (`advance` mỗi bảng) / vào thẳng giai đoạn 3 (`skip` mỗi bảng) theo từng bảng; không dùng cùng chia lượt, 3 bảng xoay vòng, match point. **Hệ số phụ kiểu PUBG** (`tb: 'pubg'`): bằng điểm xét tổng điểm hạng (không tính hạ gục), điểm trận gần nhất, điểm hạng trận gần nhất. Mẫu kiểu PGC: 33 đội (1 đặc cách vào thẳng chung kết), 2 bảng × 18 trận (hạng 1–5 mỗi bảng vào thẳng chung kết, 6–13 đá vòng vớt lấy 5), chung kết 16 đội 18 trận. | Đã làm |
| Thể thức giải lớn – đợt 12 (LoL MSI / Worlds) | **Trận phụ phân hạng** ở vòng tròn chia bảng có người đi tiếp (`stages-tiematch.js`, `tbm`: 'match' – luôn đấu, đối đầu chỉ để chọn bên; 'h2h' – đối đầu trước): đúng hai đội bằng điểm ở vạch đi tiếp thì máy tự thêm một trận phụ khi bảng xong các trận chính, đội thắng xếp trên; trận phụ không tính điểm, không có hoà; huỷ trận chính thì trận phụ chưa đấu bị bỏ. **Bốc thăm nhánh theo thành tích Thụy Sĩ** (`stages-recdraw.js`, `draw: 'record'` ở loại trực tiếp ngay sau Thụy Sĩ thắng / thua): tốt nhất gặp kém nhất, còn lại ngẫu nhiên, tránh cùng khu vực, các đội tốt nhất ở hai nửa nhánh. Khung nhập ván esports ghi rõ quyền chọn bên (ván 1 hạt giống cao, sau đó đội thua ván trước). Mẫu mới: kiểu LoL Worlds 2022 (Play-In 2 bảng → vòng bảng chính 4 bảng 2 lượt, có trận phụ → loại trực tiếp), kiểu LoL MSI (Play-In nhánh thắng – thua lấy 1 → nhánh thắng – thua 8 đội Bo5); mẫu kiểu LoL Worlds bốc thăm tứ kết theo thành tích. | Đã làm |
| Thể thức giải lớn – đợt 13 (soát lại đợt 10–12) | Soát lại toàn bộ đợt 10–12. Sửa: nhập cấu hình JSON (`otour-spec-io.js` – parseSpec) còn chặn giải trên 3 giai đoạn nên không nhập lại được cấu hình 4 giai đoạn (mẫu kiểu CS Major) vừa xuất ra; mô tả trường `skip` trong lược đồ JSON. Bài thử: `server/test/otour-majors.test.js`. | Đã làm |
| Thể thức giải lớn – đợt 14 (PGC 2019 / 2022 / 2023) | **Giải offline tối đa 6 giai đoạn.** **Chuyển đội theo dải hạng** (`stages.js` – `routes: [{ n, to }]`, tối đa 4 dải; tổng quát hoá `skip`): ở giai đoạn giữa không phải loại trực tiếp, các dải hạng từ hạng 1 (chia bảng: mỗi bảng) vào thẳng giai đoạn `to` ≥ i + 2, các hạng sau đó `advance` đội đi tiếp giai đoạn kế (được 0) – mô phỏng nhánh thắng / nhánh thua song song bằng cách xếp các giai đoạn thành một hàng (PGC 2023: bảng → nhánh thua → nhánh thắng → Last Chance → chung kết); `directLast`: đội được chuyển thẳng đứng sau đội đi tiếp. **Cổng thắng trận** (`stages-race.js` – `gate: { seats }`, Grand Survival PGC 2022): mỗi trận `seats` đội theo hàng chờ, đội về nhất đi tiếp và rời phòng, đội kế tiếp vào thay; nhập lần lượt, máy chủ gửi phòng đấu của trận kế tiếp. **Mang nguyên điểm** (`carry`, Elimination PGC 2019). **Xoay N bảng** (`rot` = 4–8: các cặp bảng lần lượt gặp nhau). **Chỉ số phụ PUBG cũ** (`tb: 'pubg_k'`: tổng hạ gục, trận cao điểm nhất, hạ gục trận đó, hạ gục rồi hạng trận gần nhất). Sửa kèm: đội vào thẳng giai đoạn 3 (`skip`) bị ghi "không đi tiếp"; máy chủ chưa giới hạn phòng đấu của sinh tồn chia bảng cố định. Giao diện: `caro/otour-route-edit.js` (form), nhãn "Vào thẳng giai đoạn n", nhãn đội thắng trận. Mẫu kiểu PGC 2019 / 2022 / 2023. Kiểm thử: `server/test/otour-pgc.test.js`, `caro/tests/e2e/otour-pgc.e2e.js`. | Đã làm |

## 9. Không làm / làm khác

- Không chép mã Challonge / MyLeague (chỉ học ý tưởng). Không nhúng mã AGPL / GPL.
- Không tính Elo cho giải offline. Không trộn vào bảng xếp hạng Caro.
- "Ẩn khỏi danh sách" **không phải** riêng tư (bài học từ Challonge và MyLeague). Giải riêng tư thật thì chặn ở máy chủ, như giải Caro hiện nay.
