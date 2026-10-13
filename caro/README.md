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

- **31 nhân vật máy** (`bots.js`) = 6 mức sức cờ × 5 lối đánh + trùm cuối **BOAT**, mỗi người một tên và lời thoại riêng:

  | Mức | Tấn công | Phòng thủ – phản công | Nước đôi | Gài bẫy (dương đông kích tây) | Toàn diện |
  |---|---|---|---|---|---|
  | ~600 | Bé Bưởi | Chị Bảy | Cocobay | Sa Tị | Trình |
  | ~900 | Anh Độ | Khô Gà | Bã Mía | Phượng Lên Đồ | Tê Liệt |
  | ~1200 | Mân Đàn | Phấn Đào | Vardrid | Ba Sáu | Con Gái FIFA |
  | ~1500 | Khá Bảnh | Trà Từ Tay | Người Tày | Tú Sena | Sách Thể Thao |
  | ~1800 | Rung Động | Độc Tày | SVBK | Đi Bộ Vuốt Râu | The Liems |
  | ~2350 | Y Đững | UEFAlona | Penaldo | Hai Ngón | GOAT |
  | ~2700 (trùm cuối) | | | | | **BOAT** |

  **Toàn diện** (`uni`, `i18n-bots-uni.js`): không thiên lối nào, ít lỗi hơn / nghĩ lâu hơn các nhân vật cùng mức – mạnh
  nhất mỗi mức. Đo bằng `bot-match.js` (2 ván đổi bên mỗi khai cuộc): thắng các nhân vật cùng mức 65–82% (mức 1–4),
  60–65% (mức 5); GOAT thắng Y Đững 60%, Hai Ngón 56%, UEFAlona / Penaldo 58%. GOAT, các nhân vật mức ~2350 và The Liems
  dùng sách khai cuộc (`book.js`). Ở mức ~2350 bên đi trước thắng ~80–85% số ván máy – máy.
  Sức cờ: mức 1–3 dùng AI của `rules.js`; từ mức ~1500 dùng `engine.js` với độ sâu / thời gian giới hạn (như các mức Stockfish
  của Lichess – yếu hơn vì nhìn nông hơn, không phải vì đánh bừa): ~1500 sâu 1 + 30 ms, ~1800 sâu 3 + 80 ms, ~2350 900 ms.
  Đo bằng `node server/scripts/bot-match.js` (2 ván đổi bên mỗi khai cuộc): mức trên thắng mức dưới ~71% ở mỗi bậc.
  Phần còn lại của mục này: AI của `rules.js` (mức 1–3, độ sâu / thời gian tìm chuỗi ép)
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
  **Nhanh như Lichess** (chạy hết trên máy người chơi, máy chủ không tốn gì thêm):
  - *Phân tích ngầm khi chơi* (`live-analysis.js`): mỗi nước mới được engine chấm ngay trong một Web Worker riêng
    (200 ms/thế, giữ bảng nhớ engine suốt ván; tạm dừng khi máy đang nghĩ nước / app chạy nền; đi lại thì bỏ phần đã khác).
    Nước nào có thể bị đánh dấu thì chấm luôn thế sau nước tốt nhất để so (`altNeeded`). Hết ván bấm Phân tích là có kết quả
    gần như tức thì (đo ~0,2 giây với ván ngắn). Hoãn một nhịp sau mỗi nước và dừng hẳn Worker khi máy bắt đầu nghĩ, để máy
    có trọn CPU; đi lại / rẽ nhánh trong lúc đang chấm thì bỏ kết quả cũ. Tắt được ở Cài đặt › Cài đặt bàn cờ để tiết kiệm pin.
  - *Hai lượt*: ván chưa được phân tích ngầm (ván của người khác, ván cũ trong Lịch sử đấu) chạy lượt nhanh trước
    (~15–40 ms/thế, hiện kết quả sau 1–2 giây kèm dòng "đang phân tích kỹ hơn"), rồi lượt kỹ chỉ chấm lại các thế
    mới chấm nhanh và thay kết quả. Các thế đã chấm đủ kỹ luôn được dùng lại (`analyzeGame({ evals })`).
    Mở phân tích ván khác khi ván trước còn chạy: huỷ ván trước (dừng Worker), không phải chờ, không hiện lẫn kết quả.
  Dùng **engine riêng của game** (`engine.js`, tự viết theo ý tưởng của các engine Gomoku mạnh, không dùng mã của họ):
  Alpha-Beta (PVS) làm sâu dần + bảng ghi nhớ thế cờ, chấm điểm theo cửa sổ 5 / 6 ô đúng luật Caro Việt Nam (hàng bị chặn
  hai đầu = 0 điểm, 3 quân không bị chặn = đe doạ thắng), bộ giải chuỗi ép (VCF) riêng có bảng ghi nhớ. Mỗi thế được đổi ra
  khả năng thắng; nước đi xếp loại theo mức tụt (?! ≥ 10%, ? ≥ 18%, ?? ≥ 30%) hoặc theo chuỗi thắng chắc (bỏ lỡ / để thua chắc);
  độ chính xác theo công thức Lichess. Đo được: giải 300/300 bài đố (TB ~9 ms/bài, bộ cũ 288/300 với 300 ms), 57 nước thắng
  mà bộ cũ không xác nhận được đã kiểm bằng bộ vét cạn độc lập; GOAT dùng engine thắng GOAT cũ 9–1.
  **Học từ ván vô địch** (cách các engine cờ vua như Stockfish chỉnh hàm đánh giá – Texel tuning – và vòng "tự đấu – học
  lại" của các engine Gomoku vô địch Gomocup; chỉ học ý tưởng, không dùng mã của họ): mỗi luật có bộ trọng số riêng,
  tách "thế của mình" và "thế của đối thủ" (`EVAL` trong `engine.js`), học từ ~340 nghìn ván Gomocup 2016–2025
  (Freestyle → luật tự do, Standard, Renju, Caro → luật Việt Nam) và ván tự đấu. Engine học xong thắng bản cũ 72%
  (tự do), 61% (tiêu chuẩn), 67% (Renju), 63% rồi thêm 61% sau vòng tự đấu (Việt Nam). Công cụ (chỉ cho người phát triển):
  - `server/scripts/gomocup-import.js` – đọc ván Gomocup (.psq) → `<luật>.jsonl`
  - `server/scripts/selfplay.js` – engine tự đấu sinh thêm ván (luật ít dữ liệu như luật Việt Nam)
  - `server/scripts/tune-eval.js` – học trọng số (hồi quy logistic, Adam; 80% học / 20% kiểm tra)
  - `server/scripts/build-book.js` – dựng sách khai cuộc (`book-data.js`): engine nghĩ 6 giây mỗi thế đầu ván
  - `server/scripts/bot-match.js` – đấu kiểm chứng (chỉ nhận trọng số / thay đổi nào thắng bản cũ); tham số `bal` dùng bộ
    khai cuộc cân bằng
  - `server/scripts/gen-openings.js` – sinh bộ khai cuộc cân bằng (`openings.json`) cho tự đấu
  - `server/scripts/train-policy.js` – học chính sách nước đi từ ván (`policy-data.js`)

  Tìm kiếm: LMR (giảm độ sâu nước xếp cuối, như Stockfish / Rapfi) bật cho luật tiêu chuẩn – tự đấu 60% trên 192 ván;
  luật khác không lợi nên tắt. Mỗi thay đổi chỉ được giữ khi thắng bản trước trong tự đấu.
  **Nâng cấp theo tài liệu** (Allis "Go-Moku and Threat-Space Search"; Wine – arXiv 2111.01016; ý tưởng của Rapfi / Yixin –
  chỉ học ý tưởng, tự viết, không dùng mã GPL của họ):
  - *Mẫu hình theo ô* (`engine-patterns.js`): với mỗi ô trống, mỗi bên, mỗi hướng: đánh vào thì đường 11 ô thành gì (năm,
    bốn mở, bốn, ba mở, ba, hai…) – phân loại bằng **vét cạn đúng luật thắng** nên đúng cả 4 luật (kể cả "bốn mở thắng ngay",
    "năm bị chặn hai đầu" của luật Việt Nam), ghi nhớ theo mã 3^11; gộp 4 hướng thành mẫu chéo (bốn mở, bốn-ba, ba kép…).
    Mỗi nước chỉ cộng / trừ một chữ số vào mã 11 ô giữ sẵn của 44 (ô, hướng) quanh nó. Đã kiểm khớp tuyệt đối với luật thật
    trên hàng trăm nghìn ô của ván Gomocup (ô thắng, ô "bốn", "bốn mở", ô chặn, ô phòng thủ).
  - *Chuỗi bốn nhanh hơn*: còn 1 nước công thì chỉ "bốn mở" mới thắng (tra mẫu, khỏi đặt thử); còn 2 nước công thì nước
    bốn chỉ thử khi tạo được ô bốn mở mới trên đường qua nó (Allis: nước sau phụ thuộc nước trước – giữ nguyên kết quả trên
    ~7.000 thế); ô chặn duy nhất của một nước bốn là chính ô thắng (trừ luật Việt Nam – chặn đầu cũng được, tra mẫu); ứng
    viên xếp theo mẫu đường thay cho đếm cửa sổ; luật Việt Nam chỉ thử bốn mở ở lá (ba mở đã là đe doạ thắng nên nước bốn
    rất nhiều – tìm sâu hơn có lợi hơn); Renju ghi nhớ nước cấm theo thế. Kết quả trong 300 ms: luật tự do tìm sâu ~6,8 lớp
    (bản trước ~5), Việt Nam ~5,4 (trước ~3,6), Renju ~5,8.
  - *Phòng thủ bắt buộc* (Rapfi / Allis): đối thủ có ô "bốn mở" thì chỉ xét nước làm đối thủ hết ô đó + nước bốn phản công;
    *thắng nhanh*: có ô bốn mở mà đối thủ không có nước bốn nào → thắng chắc.
  - *VCT – chuỗi đe doạ ba / bốn* (`engine-vct.js`, threat-space search của Allis): bên công chỉ đi nước ba / bốn, bên thủ
    xét **mọi** cách phòng (kể cả phản công bằng bốn); chỉ nhận khi mọi nhánh đều thắng (kiểm 75 lần báo thắng bằng cách đánh
    tiếp với engine cũ nghĩ lâu: đúng 75/75). Dùng ở gốc (tìm thắng) và để **kiểm nước định đi**: sau mỗi lớp làm sâu dần,
    nếu sau nước tốt nhất đối thủ có VCT thì bỏ nước đó và tìm lại.
  - *Đo công bằng*: khai cuộc ngẫu nhiên 3 quân lợi cho X tới mức X thắng ~80% bất kể engine nào, nên tự đấu dùng **bộ khai
    cuộc cân bằng** (`server/scripts/gen-openings.js` → `openings.json`, như Gomocup / Stockfish). Bản mới thắng bản trước
    đợt nâng cấp: **Việt Nam 81%, tự do 76%, tiêu chuẩn 82%, Renju 74%** (192 ván mỗi luật, 300 ms/nước, đổi bên mỗi khai
    cuộc; bản cuối, gồm cả chính sách nước đi và học tăng cường bên dưới). GOAT (Toàn diện, 1,3 giây) với các nhân vật cùng mức 2350 (luật Việt Nam, thời gian thật của nhân vật, 96 ván):
    Y Đững 74%, Pháo 76%, Long 76%, Áo 52% (Áo – lối gài bẫy – gần như dùng engine thuần, chỉ nghĩ ít hơn; cho GOAT nghĩ
    2,5 giây cũng chỉ 59% nên giữ 1,3 giây cho người chơi khỏi chờ).
    Đã thử và **không giữ** (không thắng hơn trong tự đấu): bỏ lượt thử (null move), LMR cho mọi luật, độ rộng 8 / 12,
    trọng số mẫu chéo học từ Gomocup cho luật tự do / Renju / Việt Nam (chỉ giữ cho luật tiêu chuẩn), tìm thêm một nước
    phòng ở lá, bỏ lọc chuỗi bốn ở gốc, cửa sổ khát vọng (aspiration window).
  **Trùm cuối BOAT** (Best of All Time – mức 7, lối Toàn diện, nghĩ 3 giây, mở khoá khi thắng một nhân vật ~2350; ảnh
  `img/bots/boat.svg`, chuỗi 4 ngôn ngữ trong `i18n-bots-uni.js`, huy hiệu *Đánh chìm BOAT*). Học máy dùng cho BOAT (và mọi
  nhân vật dùng engine):
  - *Chính sách nước đi học từ ván vô địch* (`server/scripts/train-policy.js` → `policy-data.js`): như mạng policy của
    AlphaGo nhưng thay CNN bằng mô hình log-linear trên mẫu hình (chạy nhanh bằng JavaScript, không cần GPU), học từ ~200
    nghìn thế mỗi luật của ván Gomocup: đoán đúng nước của engine vô địch 31–34% (top-3 55–59%), cách xếp cũ 24–28%
    (top-3 46–51%). Dùng để xếp ứng viên: tự đấu 53% trên 768 ván.
  - *Học tăng cường bằng tự đấu* (luật Việt Nam – ít ván thật nhất): engine tự đấu 4.000 ván → học lại hàm đánh giá từ kết
    quả → lặp lại. Vòng 1 thắng bộ trước 58% (192 ván), vòng 2 thắng vòng 1 53% (384 ván).
  - *MCTS (PUCT như AlphaZero)* dùng chính sách trên làm xác suất tiên nghiệm, tìm kiếm ngắn làm hàm giá trị: **thua**
    Alpha-Beta 40–44% (96 ván / cấu hình) – không có mạng giá trị mạnh (cần GPU, hàng triệu ván) thì MCTS kém Alpha-Beta
    + chuỗi đe doạ ở cờ caro, nên không dùng.
  - Đo: BOAT thắng GOAT 63% (Việt Nam) / 58% (tự do) – 48 ván mỗi luật, cùng engine nên lợi thế đến từ nghĩ lâu hơn.
  - So với nhà vô địch Gomocup **Rapfi** (chạy cục bộ bằng `server/scripts/rapfi/`): Rapfi nghĩ 40 ms / nước vẫn thắng
    engine của game nghĩ 3 giây (engine được 19% tự do, 38% tiêu chuẩn, 38% Renju). Học hàm đánh giá tuyến tính theo
    điểm của Rapfi làm engine kém đi (33–41%) – muốn tới mức vô địch cần mạng nơ-ron (NNUE hoặc CNN + MCTS).
  **BOAT chạy Rapfi (WebAssembly) ở luật tự do / tiêu chuẩn / Renju** (`boat-rapfi.js` + `rapfi/`, như trang Gomocalc):
  - Rapfi (GPL-3) dựng bằng Emscripten thành `rapfi/rapfi-single-simd128.{js,wasm}` (1,2 MB, 1 luồng, WebAssembly SIMD),
    chạy trong Worker riêng `rapfi/worker.js`, nói giao thức Piskvork; BOAT nghĩ 2,5 giây / nước (`bots.js`: `rapfi.ms`).
  - Mạng NNUE "mix9svq" (CC0, ~10 MB; Renju 2 file) chỉ tải khi bắt đầu ván với BOAT – thử `rapfi/nets/` trên máy chủ,
    rồi jsDelivr, rồi GitHub raw – giữ trong Cache Storage `caro-rapfi-nets-v1` (sw.js không xoá), lần sau không tải lại.
  - Bàn vô hạn → bàn Rapfi (tự do 20×20, tiêu chuẩn / Renju 15×15): mỗi nước đặt khung bao các quân vào giữa, chừa ≥ 1 ô
    mỗi bên. Không vừa bàn, luật Việt Nam, trình duyệt không có WebAssembly SIMD, tải mạng lỗi / quá 6 giây, Rapfi treo
    hay trả nước sai → nước đó dùng engine của game (BOAT luật Việt Nam vẫn là engine của game).
  - Đo (16 ván mỗi luật, khai cuộc cân bằng, bản WASM chạy trong Node như trong trình duyệt – `RAPFI=wasm
    server/scripts/rapfi/match.js`): Rapfi-WASM nghĩ **1 giây** thắng engine của game nghĩ 3 giây **94%** tự do, **81%**
    tiêu chuẩn, **81%** Renju – trong app Rapfi còn được 2,5 giây.
  - Giấy phép: trang `licenses.html` (Xem thêm / Cài đặt → *Giấy phép mã nguồn mở*, 4 ngôn ngữ) ghi công Rapfi, toàn văn
    GPL-3 (`rapfi/COPYING.txt`), mã nguồn đúng commit đang dùng (`rapfi/build/rapfi-src-3c94c2a.tar.gz`), cách dựng lại
    (`rapfi/build/build.sh`, `rapfi/SOURCE.md`). CSP máy chủ thêm `'wasm-unsafe-eval'` và 2 CDN của mạng.
  **Phân tích song song** (`an-pool.js`): các thế của ván chia cho min(4, lõi − 1) Web Worker (như Lichess chạy Stockfish
  nhiều luồng) – ván 36 nước trên máy 4 lõi: kết quả nhanh 1,4 giây (trước 2,9), phân tích kỹ xong 6,8 giây (trước 18,4).
  Phân tích ngầm gắn khoá thế cờ vào từng kết quả: đi lại / rẽ nhánh bao nhiêu lần cũng không dùng nhầm (e2e: 300 lần).
  **Sách khai cuộc** (`book-data.js`, 814 thế cho 4 luật, dựng lại bằng engine mới): engine nghĩ 6 giây mỗi thế (gấp ~5 lần
  thời gian GOAT được nghĩ).
  Lấy thêm ván để học: Gomocup – mỗi năm một file `https://gomocup.org/static/tournaments/<năm>/results/gomocup<năm>results.zip`
  (bảng Caro có từ 2021); Renju – cơ sở dữ liệu ván của RenjuNet (renju.net, định dạng RIF); ván Caro Việt Nam của
  người chơi: xuất ván từ chính app (Lịch sử đấu / API `/api/replay/<mã>`) hoặc gửi dãy nước dạng `x,y` mỗi dòng.
  Tối ưu (cùng kết quả, nhanh ~2,5 lần): đọc mỗi đường một lần rồi trượt cửa sổ, ô chặn chỉ xét trên hướng làm thành ô thắng,
  bỏ tính điểm khi đang tìm chuỗi ép; ở gốc bỏ các nước để đối thủ có chuỗi ép. Lối đánh của nhân vật máy chỉ tính theo góc
  nhìn của máy và chỉ đổi thứ tự trong nhóm nước tốt nhất (trước đây làm GOAT "Gài bẫy" yếu hẳn).
  Phân tích: nước đã đi trùng nước tốt nhất của engine thì không bị chấm sai; mức tụt so với thế sau nước tốt nhất cùng độ sâu.
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
- **Màn chơi** (`player-strips.js`, `game.css`): thẻ người chơi trên (đối thủ) / dưới (mình) với ảnh, tên, Elo, quân X / O và đồng hồ;
  thẻ của bên tới lượt sáng lên. Điện thoại: thanh công cụ phẳng sát đáy (Ván mới · Đi lại · Phân tích · Về giữa · Cài đặt);
  máy tính rộng: thẻ người chơi ở cột phải như Lichess.
- **Tab Câu đố** (`puzzle-home.js`, `pages.css`): thẻ "Câu đố hôm nay" có bàn cờ thu nhỏ + nút Giải ngay, các chế độ dạng danh sách.
  Tab Học tập, Xem cũng chuyển sang khối danh sách; tab Xem có thêm lối tắt Giải đấu / Xếp hạng / Lịch sử.
- **Lịch sử đấu** (`history.js`, máy chủ `server/src/hub/history.js`): lưu tối đa 300 ván / tài khoản, mỗi lần tải 20 ván.
  Chủ lịch sử chọn ai xem được: Công khai · Bạn bè · Chỉ mình tôi. Xem lịch sử người khác từ hồ sơ của họ;
  mỗi ván có Xem lại, Phân tích (chạy trên máy người xem), Chia sẻ.
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
node caro/tests/e2e/attention.e2e.js     # tiêu đề tab báo lượt, hết ván, đổi ngôn ngữ; kết nối chết lặng thì tự kết nối lại
node caro/tests/e2e/live.e2e.js          # phân tích ngầm khi chơi (hết ván có ngay), phân tích hai lượt, công tắc trong Cài đặt
node caro/tests/e2e/play2.e2e.js         # đồng hồ + Swap2, xem trực tiếp, hồ sơ, học chơi, thành tích, chia sẻ ảnh/GIF, bàn cờ
node caro/tests/e2e/batchd.e2e.js        # huỷ ván, nước đầu, đi lại, +15 giây, thống kê sâu, số liệu máy chủ, ván giải mất kết nối, Storm, ảnh og
node caro/tests/e2e/boat-rapfi.e2e.js    # BOAT chạy Rapfi ở 3 luật, luật Việt Nam dùng engine, mạng lấy từ bộ nhớ đệm, trang giấy phép (RAPFI_NETS=<thư mục mạng> nếu không ra được Internet)
node caro/tests/e2e/journey.e2e.js       # hành trình người chơi: quét mọi hộp thoại 4 ngôn ngữ × 360/1280 px, luật Swap2/Renju, chạm thật trên điện thoại, online + xem ván
```

## Cấu trúc

| File | Nội dung |
|---|---|
| `rules.js` | 4 luật thắng, nước cấm Renju + AI (dùng chung cho trình duyệt và Node) |
| `app.js` | Vẽ bàn cờ (canvas), xử lý chạm/chuột/phím, lưu trạng thái, chế độ xem lại ván |
| `ai-worker.js` | Chạy AI (nhân vật máy) và phân tích ván trong Web Worker để giao diện không bị khựng |
| `bots.js` | 31 nhân vật máy (6 mức × 5 lối đánh + trùm cuối BOAT): số liệu sức cờ, trọng số lối đánh, sách khai cuộc, `botMove` |
| `policy-data.js` | Trọng số chính sách nước đi theo luật (sinh bởi `server/scripts/train-policy.js`) – engine dùng để xếp ứng viên |
| `an-pool.js` | Phân tích ván song song trên nhiều Web Worker (chấm thế + thế sau nước tốt nhất), `study.js` chỉ còn xếp loại |
| `book.js`, `book-data.js` | Sách khai cuộc của nhân vật mức cao: tra thế cờ (chuẩn hoá xoay / lật / dời) → nước đã phân tích sẵn |
| `engine.js` | Engine phân tích (hub): `analyse()` – chuỗi ép ở gốc, làm sâu dần có kiểm nước định đi; gom các phần `engine-*.js` (dùng chung trình duyệt, Worker, Node) |
| `engine-patterns.js` | Mẫu đường / mẫu chéo theo ô (vét cạn đúng luật cả 4 luật, bảng tra theo mã 11 ô) |
| `engine-position.js` | Thế cờ của engine: đi / lùi, cập nhật dần mẫu hình, ô thắng, khoá Zobrist |
| `engine-renju.js`, `engine-eval.js`, `engine-moves.js` | Gắn vào thế cờ: nước cấm Renju; chấm điểm (trọng số học từ Gomocup, lối đánh); sinh nước, nước bốn, ô chặn, phòng thủ bắt buộc |
| `engine-search.js` | Alpha-Beta (PVS) làm sâu dần, bảng ghi nhớ, chuỗi bốn (VCF) ở lá và ở gốc |
| `engine-vct.js` | Chuỗi đe doạ ba / bốn (VCT – threat-space search của Allis): tìm thắng và kiểm nước định đi |
| `boat-rapfi.js`, `i18n-rapfi.js` | BOAT gọi Rapfi (Worker) ở luật tự do / tiêu chuẩn / Renju: tải mạng khi cần, đặt thế vào bàn Rapfi, dự phòng engine của game |
| `rapfi/` | Rapfi WebAssembly (GPL-3): `worker.js`, `rapfi-single-simd128.{js,wasm}`, mô hình cổ điển, `COPYING.txt`, `SOURCE.md`, `build/` (mã nguồn + cách dựng) |
| `licenses.html` | Giấy phép mã nguồn mở (Rapfi GPL-3, mạng CC0, phông OFL) – 4 ngôn ngữ, dùng `privacy.js` |
| `attention.js` | Ván online: tiêu đề tab "Đến lượt bạn" / "Đang chờ đối thủ", biểu tượng tab nhấp nháy khi tới lượt mà đang ở tab khác; giữ màn hình sáng khi đang có ván và đang ở bàn cờ (Wake Lock) |
| `live-analysis.js` | Phân tích ngầm ván đang chơi trong Web Worker riêng; `study.js` lấy các thế đã chấm qua `CaroLive.evalsFor` |
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
| `online.js`, `config.js` | Chế độ online: kết nối máy chủ (ping mỗi 10 giây, trượt 2 lần liên tiếp thì tự kết nối lại; quá 10 giây chưa có "welcome" cũng kết nối lại; máy chủ cũ chưa có lệnh ping thì thôi ping, không báo lỗi), tài khoản, bạn bè, phòng, thách đấu |
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
| `history.js`, `i18n-history.js` | Lịch sử đấu: quyền xem, danh sách ván, xem lại, phân tích |
| `timectl.js`, `tc-picker.js`, `local-clock.js`, `setup.css` | Mức thời gian cho phép (dùng chung máy chủ); bộ chọn thời gian; đồng hồ tổng khi chơi trên máy; giao diện Thiết lập ván đấu |
| `player-strips.js`, `game.css`, `puzzle-home.js`, `pages.css` | Thẻ người chơi + thanh công cụ màn chơi; thẻ Câu đố hôm nay; kiểu danh sách của tab Câu đố / Học tập / Xem |
| `index.html`, `style.css` | Giao diện |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Chạy offline, cài như ứng dụng |
