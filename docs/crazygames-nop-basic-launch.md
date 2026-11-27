# Gói nộp CrazyGames – Basic Launch (25/11/2026)

Đợt 2 của `docs/ke-hoach-tiep-can-toan-cau-21-11-2026.md`. Claude soạn và dựng công cụ; **Minh tự nộp** trong Developer
Portal; **Laplace nghiệm thu** trong QA Tool (mục 9). Căn cứ: kế hoạch của Laplace (CrazyGames A0–A5, 21/11/2026, đọc từ
docs.crazygames.com ngày 21/11/2026) và hướng dẫn chung `docs/huong-dan-cong-game-mini-app-22-11-2026.md`.

Quy ước: **[ĐÃ ĐO]** = số chạy thật trên máy của Claude ngày 25/11/2026; **[CHƯA XÁC MINH]** = chưa có nguồn / chưa thử
được, phải chốt bằng biểu mẫu thật, phản hồi support hoặc QA; **[ƯỚC LƯỢNG]** = suy luận có ghi căn cứ.

## 1. Lệnh

```
node server/scripts/build-portal.js crazygames --server https://<tên miền máy chủ>   # gói nộp: dist/caro-crazygames.zip
node server/scripts/portal-media.js                                                    # ảnh bìa + video bìa: dist/portal-media/
```

`portal-media.js` (Playwright + Chromium có sẵn, không tự cài; ffmpeg nếu có):

- Dựng bản cổng crazygames vào thư mục tạm (gọi `buildPortal` của `build-portal.js`), máy chủ online trỏ về một cổng cục bộ
  đã đóng (không có máy chủ – kiểm luôn bản cổng vẫn chơi được với máy), chặn mọi yêu cầu ra ngoài (kể cả SDK).
- Mở bằng Chromium như **khách tiếng Anh** (tên khách mặc định), bấm "Play the computer" → chọn nhân vật máy mạnh nhất đã mở
  khoá với khách mới (Mân Đàn ~1200) → "Play", rồi **bấm từng ô** trên bàn cờ. Nước của X do engine của chính game chọn;
  máy trả lời như với người thật. Kiểu bàn gỗ, quân đậm (`--board`, `--pieces`, như người chơi chọn trong Cài đặt).
- Ảnh: `cover-<R>x<C>.png` (ảnh chụp + dải tiêu đề "Caro x Gomoku" và một dòng phụ tiếng Anh vẽ chồng ở mép dưới, che
  thanh dưới chứ không che bàn cờ) và `cover-<R>x<C>-raw.png` (ảnh chụp nguyên, cho trường hợp biểu mẫu không muốn chữ trên
  ảnh). Mặc định chụp thế cờ ngay trước nước thắng của X (`--frame before`); `--frame win` chụp sau khi thắng (có đường thắng).
- Video: `cover-video.mp4` – quay cả ván (Playwright `recordVideo`), cắt còn ~18 giây cuối (`--seconds`), H.264 yuv420p,
  30 khung hình / giây, **không tiếng**, 1920×1080 (`--video-size`). Không có ffmpeg: giữ `cover-video.webm` chưa cắt và in
  lệnh ffmpeg để tự chuyển.
- In số đo cục bộ: byte tải tới khi bàn cờ chơi được, giây tới Trang chủ / tới ván.
- Tham số: `--out dir`, `--sizes 1920x1080,800x1200,800x800`, `--no-video`, `--video-size`, `--seconds 3–60`,
  `--frame before|win`, `--no-title`, `--title`, `--subtitle`, `--board`, `--pieces`, `--theme dark|light`, `--ffmpeg`.
  Chạy đủ 3 ảnh + video mất ~1 phút.

**Kích thước ảnh / video:** 1920×1080 (ngang), 800×1200 (dọc), 800×800 (vuông) là cỡ CrazyGames thường yêu cầu, nhưng
**[CHƯA XÁC MINH]** với biểu mẫu hiện tại – **kiểm lại trong biểu mẫu Developer Portal trước khi nộp**, khác thì chạy lại với
`--sizes …` / `--video-size …`. Yêu cầu về độ dài / dung lượng video bìa cũng phải đọc trong biểu mẫu.

Mỗi ảnh là một ván thật khác nhau (máy có yếu tố ngẫu nhiên) – chạy lại nếu muốn thế cờ khác. Minh duyệt ảnh trước khi nộp.

## 2. Số đo thật của gói hiện tại [ĐÃ ĐO]

Gốc mã: commit `621c7e8` (25/11/2026), `node server/scripts/build-portal.js crazygames` (máy chủ mặc định):

| Mục | Số đo | Giới hạn CrazyGames |
| --- | --- | --- |
| ZIP tải lên | 5 417 642 byte (~5,2 MB) | – |
| Tổng gói giải nén | 14 608 954 byte (~13,9 MB) | ≤ 250 MB |
| Số file | 419 | ≤ 1.500 |
| Tải ban đầu theo script (trang + CSS + khối mã + chuỗi tiếng Anh) | ~2,49 MB | ≤ 50 MB (≤ 20 MB cho trang chủ mobile) |
| Tải ban đầu đo bằng Chromium: tổng byte tới khi bàn cờ chơi được | 2 818 KB / 64 yêu cầu | như trên |
| Thời gian tới Trang chủ / tới ván với máy (máy nhanh, mạng cục bộ) | 0,28 giây / 0,72 giây | ≤ 20 giây tới gameplay |
| Như trên, CPU chậm 4×, mạng 10 Mbps, trễ 40 ms | 2,8 giây / 3,6 giây | |
| Như trên, CPU chậm 6×, mạng 4 Mbps, trễ 150 ms | 6,7 giây / 7,6 giây | |

Cách đo Chromium: phục vụ tĩnh thư mục gói trên máy (không nén gzip / brotli – CDN của cổng thường nén nên byte thật ít hơn),
không có máy chủ online, SDK bị chặn (không tính), giả lập máy yếu bằng CDP (`Emulation.setCPUThrottlingRate`,
`Network.emulateNetworkConditions`); "tới ván" = bấm "Play the computer" → "Play" ngay khi Trang chủ hiện, bàn cờ trống sẵn
sàng nhận nước. Nặng nhất: 10 khối mã `b/core-*.js` (170–230 KB mỗi khối), gói chuỗi tiếng Anh 232 KB, `index.html` 92 KB.
Không tải lúc mở: máy cờ Rapfi (~1,3 MB WASM, trong gói) và mạng NNUE (~10 MB, tải từ jsDelivr / GitHub) – chỉ khi đấu
nhân vật mạnh nhất (BOAT, phải mở khoá) hoặc phân tích bằng Rapfi.

Đây là số đo trên máy của Claude, **không thay** số đo trong QA Tool (mục 9) – CrazyGames chấm theo môi trường của họ.

## 3. Danh sách kiểm trước khi nộp

| # | Mục | Trạng thái |
| --- | --- | --- |
| 1 | Khai thanh toán (payment onboarding qua Tipalti) xong trong Developer Portal – bắt buộc **trước khi nộp**, kể cả Basic Launch | Minh làm |
| 2 | Tổng gói ≤ 250 MB, tải đầu ≤ 50 MB (nên ≤ 20 MB để đủ điều kiện trang chủ mobile), ≤ 1.500 file | Đạt (mục 2) |
| 3 | Mọi đường dẫn trong gói là tương đối | Đạt – `build-portal.js` kiểm, sai thì báo lỗi |
| 4 | Chơi khách mặc định, không đăng nhập ngoài (Google, email…) | Đạt – `portal.js` + `portal.e2e.js` |
| 5 | Không quảng cáo ngoài | Đạt – game không có quảng cáo |
| 6 | Không link ra ngoài, không quảng bá chéo / link cửa hàng ứng dụng | Đạt – link ẩn + bấm bị chặn; trang tĩnh: link thành chữ |
| 7 | Có tiếng Anh (mặc định khi mở) | Đạt – vẫn đổi được 8 ngôn ngữ |
| 8 | Nội dung đạt PEGI 12 (13+) | Minh tự khai; không bạo lực, chat chỉ câu mẫu, tên khách lọc từ tục |
| 9 | Chạy trên Chrome + Edge; kiểm Safari (chạy kém sẽ bị tắt trên Safari) | Chrome đạt (e2e); Edge, Safari: Laplace kiểm (mục 9) |
| 10 | Mượt trên Chromebook RAM 4 GB (không thì bị tắt trên ChromeOS) | Giả lập CPU chậm 4–6× đạt (mục 2); máy thật: Laplace |
| 11 | Tới được gameplay ≤ 20 giây (file tải ngoài chấm theo thời gian) | Đạt cục bộ (≤ 7,6 giây khi giả lập máy yếu); QA Tool: Laplace |
| 12 | SDK v3: `SDK.init()`, `loadingStart` / `loadingStop`, `gameplayStart` khi vào ván / `gameplayStop` khi hết ván, tôn trọng `muteAudio` | Đạt – `portal-crazygames.js` + `portal.e2e.js` (SDK giả) |
| 13 | Gói dựng với `--server` đúng tên miền máy chủ thật (https), máy chủ cho phép Origin `https://*.game-files.crazygames.com` | Minh kiểm khi dựng; log máy chủ báo "Origin lạ" thì thêm `PORTAL_WS_ORIGINS` |
| 14 | Ảnh bìa + video bìa đúng cỡ biểu mẫu | Công cụ có; **kiểm cỡ trong biểu mẫu** |
| 15 | Đã hỏi support về WebSocket tới máy chủ riêng (mục 7) | Minh gửi (nên làm trước khi nộp) |

Hai điểm nên sửa trước khi nộp (Claude chưa sửa – thuộc `caro/`, phiên chính quyết): chân Trang chủ của bản cổng vẫn có câu
"Google Sign-In is used only to create and log in to your player account" (bản cổng không có đăng nhập – QA có thể hỏi), và
dòng ghi đơn vị chủ quản. Nên ẩn hai dòng này khi `html.portal`.

## 4. Metadata (tiếng Anh – Minh dán vào biểu mẫu)

Mọi tính năng dưới đây đã đối chiếu với bản cổng: chơi khách được, không cần đăng nhập. **Không** nhắc: đăng nhập, xếp hạng
Elo có tính điểm (khách chơi không tính điểm), tham gia giải đấu (cần tài khoản – bản cổng không có), CLB, chat tự do,
link chia sẻ ra ngoài.

**Tên (chọn 1 – giữ thương hiệu "Caro x Gomoku"):**

1. `Caro x Gomoku` – đúng tên trong game, ngắn.
2. `Caro x Gomoku: Five in a Row` – có từ khoá người nước ngoài hay tìm.
3. `Caro – Vietnamese Gomoku` – nhấn điểm khác biệt (luật Việt Nam); nếu chọn, mô tả vẫn ghi "Caro x Gomoku".

Giới hạn độ dài tên / mô tả: **[CHƯA XÁC MINH]** – xem bộ đếm trong biểu mẫu.

**Mô tả ngắn:**

```
Get five in a row – Vietnamese Caro, Gomoku and Renju against 30+ computer opponents, daily puzzles and online games.
```

**Mô tả dài:**

```
Caro x Gomoku is classic five-in-a-row on an open board, with the rule sets serious players use:

- Vietnamese Caro: a line of five wins only if at least one end is open – five blocked at both ends does not count. An open four (both ends empty) wins on the spot.
- Freestyle and Standard Gomoku: five or more in a row wins (Standard: exactly five).
- Renju: forbidden moves for the first player (double three, double four, overline), RIF-style.

Play the computer: 30+ characters with their own styles – attacker, defender, double threat, trickster, all-round – from beginner to a final boss powered by the Rapfi engine. Beat a level to unlock the next one.

Improve your game: a daily puzzle, rated puzzles, Puzzle Storm (solve as many as you can in 3 minutes), short lessons from the basics to winning tricks, and move-by-move game analysis.

Play people online as a guest: quick pairing with time controls from bullet to classical, or create a room and share the room code. Rooms can use the Swap2 opening to balance the first-move advantage. You can also watch live games.

Also: 2 players on one device, board and piece styles, 8 languages (English, Tiếng Việt, Русский, 简体中文, 繁體中文, 日本語, 한국어, Čeština).
```

Kiểm từng ý (Claude đã đối chiếu mã, 25/11/2026): 4 luật trong bảng "Game setup" (vn / free / std / renju); Renju có nước
cấm cho X (`engine-renju.js`); 31 nhân vật máy (6 mức × 5 lối + trùm cuối BOAT chạy Rapfi – `bots.js`), mở sẵn 3 mức đầu;
câu đố, Puzzle Storm, bài học chạy không cần máy chủ (đã thử khi máy chủ tắt); ghép trận nhanh và tạo phòng mở với khách
(`matchmaking.js`, `rooms.js` – không đòi tài khoản); Swap2 là tuỳ chọn khai cuộc của phòng online; giải đấu cần tài khoản
nên **không** đưa vào mô tả. Online cần máy chủ cho phép (mục 7) – nếu CrazyGames cấm WebSocket ra ngoài, bỏ đoạn
"Play people online…" và câu "watch live games".

**Hướng dẫn điều khiển:**

```
Mouse / touch: click or tap an empty cell to place your stone. Drag to move the board; mouse wheel or pinch to zoom.
Keyboard: arrow keys move the board, + / - zoom, C centers the board, N starts a new game, Ctrl+Z undoes a move (vs. computer).
Press Tab to select the board, then use the arrow keys and Enter to play without a mouse (? shows all shortcuts).
Goal: make five in a row (in Vietnamese Caro the line must not be blocked at both ends).
```

**Thể loại / tag gợi ý** (chọn theo danh sách thật của biểu mẫu – danh sách hiện tại **[CHƯA XÁC MINH]**): thể loại chính
Board (hoặc Puzzle / Strategy nếu không có Board); tag: gomoku, five in a row, tic tac toe, board, strategy, 2 player,
multiplayer, logic, puzzle.

## 5. Ghi chú cho QA (tiếng Anh – dán vào ô ghi chú nếu biểu mẫu có)

```
Notes for QA:
- The game has its own multiplayer backend: it connects over a secure WebSocket (wss) to the developer's server (<domain>) for online games. Playing the computer, puzzles and lessons work without that connection.
- Guest play is the default. This build has no sign-in or account creation and no external login (no Google, no email).
- No third-party ads, no external links, no cross-promotion. Static info pages (privacy policy, open-source licenses) are included in the package.
- Chat is limited to preset quick messages/emotes in a game room. There is no free-text chat and no user-generated text content; the only text a player can set is their guest display name, which is filtered for offensive words.
- No personal data is collected besides the guest display name the player chooses. Guests are identified by a random key stored in the browser.
- The main game engine runs in the browser (JavaScript, Web Worker). The strongest computer opponent and engine analysis load a WebAssembly engine (Rapfi, included in the package) on demand, and its neural network file (~10 MB) is fetched at runtime from a public CDN (jsDelivr, with GitHub as fallback) only when that opponent or analysis is used.
- CrazyGames SDK v3 (basic level): SDK.init, loadingStart/loadingStop, gameplayStart when a game starts and gameplayStop when it ends or the player leaves it; the platform muteAudio setting is respected.
- English is the default language; the player can switch between 8 languages in Settings.
```

## 6. Thư hỏi support (tiếng Anh – Minh gửi qua Developer Portal, nên trước khi nộp)

```
Subject: Question about a game with its own multiplayer server (WebSocket)

Hello CrazyGames team,

I am preparing to submit "Caro x Gomoku", an HTML5 five-in-a-row game (Vietnamese Caro, Gomoku, Renju), for Basic Launch.

Besides single-player content (computer opponents, puzzles, lessons), the game offers online games between players. For this it opens a secure WebSocket (wss) connection from the game to my own server at <domain>. Players join as guests by default; there is no external login, no ads and no free-text chat.

Could you please confirm:
1. Is a WebSocket connection from the game to the developer's own server allowed on CrazyGames (Basic Launch, and later Full Launch)?
2. Is there any domain, protocol or connection requirement I should follow for it?
3. The strongest computer opponent downloads a ~10 MB neural network file at runtime from a public CDN (jsDelivr). Is that acceptable, or should all files be inside the uploaded package?

If online play is not allowed, I can submit a version with only the single-player modes.

Thank you,
<name>
```

### Phương án dự phòng nếu bị cấm WebSocket ra ngoài [ƯỚC LƯỢNG – Claude CHƯA làm]

Bản "chỉ đấu máy + câu đố + bài học" – phần chơi đơn hiện đã chạy được khi không có máy chủ (đã thử bằng `portal-media.js`).
Cần sửa:

1. `server/scripts/build-portal.js`: thêm biến thể, ví dụ cổng `crazygames-solo` (hoặc cờ `--solo`) ghi
   `window.CARO_SOLO = true` vào `portal-config.js`, `CARO_SERVER` rỗng.
2. `caro/online.js`: có `CARO_SOLO` thì không mở WebSocket, không hiện trạng thái "đang kết nối lại" / lỗi kết nối.
3. `caro/host.css` (lớp `html.portal-solo`): ẩn phần cần máy chủ – thẻ "Quick pairing" / "Lobby" ở Trang chủ (mở sẵn thẻ
   "Computer"), "Create a room", "Challenge a friend", "Tournaments & clubs", tab Watch, ô tìm kỳ thủ, bạn bè, bảng xếp hạng.
4. Rà các chỗ gọi máy chủ ngầm: đánh giá đám mây (`eval-cloud.js`), đồng bộ tiến độ, link chia sẻ ván, trang hồ sơ – tắt
   hoặc ẩn khi `CARO_SOLO`.
5. Mô tả + ghi chú QA bỏ phần online; trường `src` không còn gửi (không có `hello`) nên bảng "Nguồn người chơi" sẽ không thấy
   người chơi CrazyGames – chỉ còn số liệu trong bảng của CrazyGames.
6. Bài thử: biến thể `portal.e2e.js` cho bản solo (không mở WebSocket, không nút online nào hiện, vẫn chơi trọn ván).

Ước lượng: một PR vừa (~150–300 dòng kể cả bài thử), căn cứ số chỗ phải ẩn ở trên và cách bản cổng hiện có đã làm tương tự.
**Có chấp nhận bản rút gọn hay không là quyết định của Minh** sau khi có câu trả lời thật của support / QA.

## 7. Theo dõi sau khi nộp

- Basic Launch chỉ kết thúc khi đủ **cả hai**: ≥ 7 ngày **và** ≥ 500 lượt chơi; cửa sổ tham chiếu 7–21 ngày. Sau đó
  CrazyGames xét chỉ số (thời gian chơi, giữ chân) để mời Full Launch hay không.
- Số của mình: tab Xem thêm → **Nguồn người chơi** (chỉ quản trị viên) → hàng `crazygames`: người mới, D1, D7, số ván online
  mỗi người mới, theo ngày. Người chơi CrazyGames vào là kết nối máy chủ (kể cả chỉ đấu máy) nên được đếm là người mới;
  ván với máy không tính vào "số ván online".
- Số của CrazyGames (lượt chơi, thời gian chơi, giữ chân): trong Developer Portal **[CHƯA XÁC MINH tên mục]**. Ghi lại hai
  nguồn số vào cùng một bảng mỗi tuần (ngày, lượt chơi CG, người mới `crazygames`, D1, D7).
- Mọi phản hồi QA / support: chép **nguyên văn** vào báo cáo (mục 9), Claude xử lý từng ý.
- Nấc Full (quảng cáo qua SDK, tài khoản CrazyGames, yêu cầu multiplayer mức Full) chỉ làm khi được mời – Đợt 3.

## 8. Điều chưa xác minh

1. CrazyGames có cho WebSocket tới máy chủ riêng không (mục 6, chốt bằng support / QA).
2. Mạng NNUE tải từ jsDelivr lúc chạy có được chấp nhận không (câu 3 của thư).
3. Cỡ ảnh bìa / video bìa, độ dài video, giới hạn chữ của tên / mô tả, danh sách thể loại / tag trên biểu mẫu hiện tại.
4. Thời gian tới gameplay và hiệu năng trong QA Tool, trên Edge, Safari, Chromebook 4 GB thật.
5. Tỉ lệ chia doanh thu (không công bố) – không đưa vào dự toán nào.

## 9. Laplace nghiệm thu trong QA Tool

Sau khi Minh tải gói lên (chưa bấm phát hành hoặc ở bước xem trước), Laplace mở bản xem trước trong **QA Tool** của
CrazyGames và kiểm (theo A5 của kế hoạch):

1. Nạp thành công, console không có lỗi chặn chơi (chụp console).
2. Thời gian từ lúc mở tới lúc chơi được ván với máy (bấm "Play the computer" → "Play" → đánh được nước đầu): đo 3 lần, lấy
   trung bình; mốc ≤ 20 giây. Ghi máy, trình duyệt, mạng.
3. Không có nút đăng nhập Google / đăng nhập ngoài; vào là chơi khách; đổi được ngôn ngữ (Cài đặt).
4. Sự kiện SDK: `gameplayStart` khi vào ván, `gameplayStop` khi hết ván / về Trang chủ (xem bằng công cụ debug SDK của QA
   Tool); bật tắt tiếng của cổng thì game tắt tiếng.
5. Online: ghép trận nhanh hoặc tạo phòng từ hai máy – **được hay không, ghi nguyên văn** lỗi nếu có (log máy chủ có dòng
   "Chặn kết nối WebSocket vì Origin lạ: …" thì gửi Claude tên miền đó).
6. Chrome, Edge, Safari (nếu có máy Mac / iPhone): chơi trọn một ván với máy, mở một câu đố.
7. Máy yếu (Chromebook 4 GB nếu có; không thì máy cũ nhất có): độ mượt khi kéo / phóng bàn cờ, thời gian máy nghĩ.
8. Bản web chính production không đổi hành vi (đăng nhập Google còn, service worker còn) – kiểm nhanh.

Mẫu báo cáo:

```
Ngày / giờ kiểm:            Người kiểm: Laplace
Bản gói (ngày dựng, commit):
Trạng thái nộp:             (chưa nộp / đang QA / đạt / bị từ chối)
1. Nạp + console:           Đạt / Không – ảnh:
2. Tới lúc chơi được:       lần 1 … s, lần 2 … s, lần 3 … s (máy …, trình duyệt …, mạng …)
3. Không đăng nhập / ngôn ngữ: Đạt / Không – ghi chú:
4. SDK (gameplayStart / Stop, mute): Đạt / Không – ảnh công cụ debug:
5. Online từ CrazyGames:    Được / Không – lỗi nguyên văn:
6. Chrome / Edge / Safari:  … / … / …
7. Máy yếu:                 máy …, nhận xét:
8. Bản web chính:           Không đổi / Có đổi – chi tiết:
Phản hồi QA / support của CrazyGames (chép NGUYÊN VĂN, kể cả khi bị từ chối):
<dán vào đây>
Đề xuất của Laplace:
```
