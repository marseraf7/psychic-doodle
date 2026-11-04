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

## 9. Không làm / làm khác

- Không chép mã Challonge / MyLeague (chỉ học ý tưởng). Không nhúng mã AGPL / GPL.
- Không tính Elo cho giải offline. Không trộn vào bảng xếp hạng Caro.
- "Ẩn khỏi danh sách" **không phải** riêng tư (bài học từ Challonge và MyLeague). Giải riêng tư thật thì chặn ở máy chủ, như giải Caro hiện nay.
