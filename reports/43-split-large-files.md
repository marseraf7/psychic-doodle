# Báo cáo: Audit file quá ~400 dòng & Đề xuất phương án chia file (#43)

**Kết luận**: Dự án hiện có 13 file vượt ngưỡng ~400 dòng của skill `chia-file-hub` (lớn nhất là `caro/i18n.js` 4.232 dòng và `caro/app.js` 1.564 dòng). Đã lập phương án kiến trúc bóc tách theo nguyên tắc "Một file - Một việc" và gom module qua Hub/Mixin/UMD, phân nhóm mức độ ưu tiên: 4 file ưu tiên **Cao** (thường xuyên sửa, dễ xung đột merge), 4 file ưu tiên **Trung bình**, và 5 file ưu tiên **Thấp** (ít sửa hoặc thuần dữ liệu từ điển).

---

### 1. Bảng tổng hợp đề xuất chia file

| STT | File hiện tại | Số dòng | Số file đề xuất tách | Danh sách file mới đề xuất | Mức ưu tiên |
|:---:|---|:---:|:---:|---|:---:|
| 1 | `caro/i18n.js` | 4.232 | 5 | `i18n.js` (lõi), `i18n-online.js`, `i18n-tour.js`, `i18n-study.js`, `i18n-settings.js` | **Cao** |
| 2 | `caro/app.js` | 1.564 | 4 | `app.js` (điều phối), `board-view.js`, `board-camera.js`, `board-replay.js` | **Cao** |
| 3 | `caro/style.css` | 1.325 | 5 | `style.css` (gốc), `style-shell.css`, `style-online.css`, `style-tour.css`, `style-study.css` | **Cao** |
| 4 | `caro/online.js` | 816 | 3 | `online.js` (kết nối lõi), `online-auth.js`, `online-room.js` | **Cao** |
| 5 | `caro/study.js` | 703 | 2 | `study.js` (phân tích ván), `puzzles.js` (giải đố & daily) | **Trung bình** |
| 6 | `caro/rules.js` | 570 | 2 | `rules.js` (luật cờ thuần), `rules-ai.js` (heuristic & tìm nước) | **Trung bình** |
| 7 | `server/src/hub/stages.js` | 533 | 3 | `stages.js` (playoff/vòng đời), `stages-swiss.js`, `stages-groups.js` | **Trung bình** |
| 8 | `server/src/hub/tournaments.js` | 479 | 2 | `tournaments.js` (API handlers), `tournaments-match.js` (timer/ghép cặp) | **Trung bình** |
| 9 | `caro/i18n-bots.js` | 475 | 1 | Giữ nguyên (thuần dữ liệu dịch cho 31 bot máy qua 4 ngôn ngữ) | **Thấp** |
| 10 | `server/src/store.js` | 469 | 2 | `store.js` (CRUD), `store-schema.js` (DDL schema & migrations) | **Thấp** |
| 11 | `server/src/hub/rooms.js` | 456 | 2 | `rooms.js` (phòng chơi & ván cờ), `challenges.js` (thách đấu & quick play) | **Thấp** |
| 12 | `caro/i18n-rules.js` | 441 | 1 | Giữ nguyên (thuần dữ liệu dịch 4 luật qua 4 ngôn ngữ) | **Thấp** |
| 13 | `caro/tour.js` | 423 | 2 | `tour.js` (giao diện giải/CLB), `tour-admin.js` (duyệt giải & số liệu) | **Thấp** |

---

### 2. Chi tiết từng file, bằng chứng dòng code & phương án kiến trúc

#### 1. `caro/i18n.js` (4.232 dòng) – Ưu tiên: CAO
* **Khối chức năng chính**:
  - `DICT.vi`: L12–L1058 (1.047 dòng) – Từ điển gốc tiếng Việt cho toàn app.
  - `DICT.en`: L1059–L2105 (1.047 dòng) – Tiếng Anh tương ứng.
  - `DICT.ru`: L2106–L3152 (1.047 dòng) – Tiếng Nga tương ứng.
  - `DICT.zh`: L3153–L4175 (1.023 dòng) – Tiếng Trung tương ứng.
  - Core API (`t`, `extend`, `setLang`, `tc`, `apply`): L4176–L4232 (57 dòng).
* **Đề xuất tách**:
  - Giữ `caro/i18n.js` (~200 dòng): Chỉ chứa Core API + chuỗi shell dùng chung.
  - Tách theo chủ đề gọi `window.I18N.extend()`:
    - `caro/i18n-online.js` (~1.200 dòng/4 thứ tiếng): Phòng chơi, thách đấu, tài khoản, chat, thông báo máy chủ `srv_*`.
    - `caro/i18n-tour.js` (~800 dòng/4 thứ tiếng): Giải đấu, CLB, vòng bảng, playoff, Thụy Sĩ.
    - `caro/i18n-study.js` (~600 dòng/4 thứ tiếng): Phân tích ván, giải đố, đồ thị thế cờ.
    - `caro/i18n-settings.js` (~400 dòng/4 thứ tiếng): Cài đặt, âm thanh, bàn cờ, phím bấm.
* **Phụ thuộc chéo**: `<script src="i18n.js">` phải nạp đầu tiên trước các file vệ tinh; khai báo trong `FILES` của `sw.js`.

#### 2. `caro/app.js` (1.564 dòng) – Ưu tiên: CAO
* **Khối chức năng chính**:
  - Khởi tạo & Game State: L1–L155 (155 dòng).
  - Quản lý Bot AI: L156–L277 (122 dòng) – `botGameOver`, `askAI`, `askEngine`, `undo`, `newGame`.
  - Đồng hồ: L278–L380 (103 dòng) – `syncTotalClock`, `renderClocks`, `tickClock`.
  - Điều phối Online: L381–L543 (163 dòng) – `applyRoom`, `enterOnline`, `leaveOnline`.
  - Chế độ Replay: L614–L767 (154 dòng) – `openReplay`, `fitReplayView`, `seekReplay`, `closeReplay`.
  - Canvas Rendering: L768–L996 (229 dòng) – `draw`, `drawStone`, `drawMarks`, `drawForbidden`, `resize`.
  - Camera & Zoom: L997–L1067 (71 dòng) – `animateCamera`, `centerView`, `zoomAt`.
  - Input Pointer/Touch: L1068–L1228 (161 dòng) – Pan, pinch, tap detection.
  - API bên ngoài & Export: L1229–L1564 (336 dòng) – `enterExt`, `extSet`, `extPlace`, export `window.CaroApp`.
* **Đề xuất tách**:
  - `caro/board-view.js` (`window.CaroBoardView`, ~350 dòng): Phụ trách Canvas drawing (`draw`, `drawStone`, `drawMarks`, `drawForbidden`, `resize`).
  - `caro/board-camera.js` (`window.CaroCamera`, ~220 dòng): Quản lý ma trận toạ độ, zoom, pan, cử chỉ pinch và hoạt ảnh camera.
  - `caro/board-replay.js` (`window.CaroReplay`, ~180 dòng): Quản lý phát lại ván cờ, tua nước đi, timeline.
  - `caro/app.js` (còn lại ~400 dòng): Giữ vai trò Controller trung tâm (`window.CaroApp`), kết nối Bot và Online.
* **Phụ thuộc chéo**: Thứ tự nạp: `board-camera.js` → `board-view.js` → `board-replay.js` → `app.js`; thêm vào `sw.js`.

#### 3. `caro/style.css` (1.325 dòng) – Ưu tiên: CAO
* **Khối chức năng chính**:
  - Variables & Shell Layout: L1–L306 (306 dòng) – Biến màu, reset, tabbar 5 tab, dialog.
  - Giao diện Online & Room: L307–L630 (324 dòng) – Thẻ phòng, tìm trận, chat, đồng hồ.
  - Giải đấu & CLB: L631–L796 (166 dòng) – Nhánh playoff, bảng xếp hạng.
  - Study & Puzzles: L797–L994 (198 dòng) – Bảng phân tích Lichess, giải đố.
  - Responsive & Căn lề: L995–L1325 (331 dòng) – Swap2, hồ sơ, bài học, media queries di động.
* **Đề xuất tách**:
  - `caro/style-shell.css` (~350 dòng), `caro/style-online.css` (~350 dòng), `caro/style-tour.css` (~250 dòng), `caro/style-study.css` (~250 dòng).
  - `caro/style.css` (~120 dòng): Chỉ giữ các biến CSS root variables và `@import` các file con.
* **Phụ thuộc chéo**: Thêm `<link>` vào `caro/index.html` hoặc `@import`, khai báo trong `sw.js`.

#### 4. `caro/online.js` (816 dòng) – Ưu tiên: CAO
* **Khối chức năng chính**:
  - WebSocket & Dispatcher: L1–L219 (219 dòng) – `connect`, `dropped`, `send`, xử lý gói tin.
  - Giao diện Tab Online & Friends: L220–L380 (161 dòng) – `render`, `renderAccount`, `renderFriends`.
  - Thách đấu & Auth: L381–L507 (127 dòng) – `renderInvites`, `openAuth`, Google Sign-In.
  - Quản lý phòng chơi: L508–L654 (147 dòng) – `openJoin`, `inviteLink`, `fillRoomInfo`, `leaveRoom`.
  - Banner & Server Replays: L655–L816 (162 dòng) – `showBanner`, `replayLink`, `checkReplayLink`.
* **Đề xuất tách**:
  - `caro/online-auth.js` (`window.CaroAuth`, ~180 dòng): Đăng nhập thường, Google OAuth, thẻ tài khoản.
  - `caro/online-room.js` (`window.CaroRoomUI`, ~250 dòng): Hộp thoại phòng, chia sẻ link mời, thông tin phòng.
  - `caro/online.js` (còn lại ~380 dòng): Lõi WebSocket và sự kiện `CaroOnline`.
* **Phụ thuộc chéo**: Giao tiếp qua `CaroOnline.send()` và sự kiện `CaroOnline.on('room')`.

#### 5. `caro/study.js` (703 dòng) – Ưu tiên: TRUNG BÌNH
* **Khối chức năng chính**:
  - Phân tích ván cờ: L1–L355 (355 dòng) – Worker, đồ thị eval, danh sách nước đi, phím tắt.
  - Trình chơi Giải đố (Puzzle Player): L356–L567 (212 dòng) – `start`, `renderCard`, `onMove`, `solved`, `hint`.
  - Kho & Thống kê đố: L568–L703 (136 dòng) – `loadPz`, `savePz`, `dailyPuzzle`, `openPuzzles`.
* **Đề xuất tách**:
  - `caro/puzzles.js` (`window.CaroPuzzles`, ~320 dòng): Tách toàn bộ phần giải đố.
  - `caro/study.js` (còn lại ~380 dòng): Tập trung vào tính năng phân tích ván đấu.
* **Phụ thuộc chéo**: Cả 2 đều mượn bàn cờ qua `window.CaroApp.enterExt()`.

#### 6. `caro/rules.js` (570 dòng) – Ưu tiên: TRUNG BÌNH
* **Khối chức năng chính**:
  - Board & Check Win: L1–L90 (90 dòng) – `Board`, `winLen`, `checkWin`.
  - Nước cấm Renju: L91–L192 (102 dòng) – `threeOnLine`, `foursOnLine`, `forbiddenAt`, `forbidden`.
  - Heuristic AI & Chấm điểm: L193–L337 (145 dòng) – `candidates`, `shapeScore`, `cellScore`, `forcesWin`.
  - VCF & Lối đánh: L338–L463 (126 dòng) – `blockingReplies`, `vcf`, `styleBonus`.
  - Chọn nước: L464–L570 (107 dòng) – `legal`, `chooseMove`.
* **Đề xuất tách**:
  - `caro/rules.js` (~190 dòng): Giữ phần luật thuần túy (`Board`, `checkWin`, `forbidden`).
  - `caro/rules-ai.js` (~380 dòng): Heuristic và chọn nước bot cục bộ.
* **Phụ thuộc chéo**: Nạp trong cả Browser, Worker (`ai-worker.js`) và Node.js (`server/test/`).

#### 7. `server/src/hub/stages.js` (533 dòng) – Ưu tiên: TRUNG BÌNH
* **Khối chức năng chính**:
  - Nhánh Playoff / Loại trực tiếp: L1–L216 (216 dòng).
  - Vòng tròn chia bảng: L217–L290 (74 dòng).
  - Hệ Thụy Sĩ: L291–L357 (67 dòng).
  - Bảng điểm & Xếp hạng: L358–L441 (84 dòng).
  - Vòng đời giai đoạn: L442–L533 (92 dòng).
* **Đề xuất tách**:
  - `server/src/hub/stages-swiss.js` (~100 dòng), `server/src/hub/stages-groups.js` (~120 dòng).
  - `server/src/hub/stages.js` (còn lại ~310 dòng): Điều phối chung và nhánh playoff.

#### 8. `server/src/hub/tournaments.js` (479 dòng) – Ưu tiên: TRUNG BÌNH
* **Khối chức năng chính**:
  - Trạng thái giải & Timer: L1–L163 (163 dòng) – Vòng lặp ghép cặp, xử thua bỏ cuộc.
  - API Handlers: L164–L479 (316 dòng) – `on_tourCreate`, `on_tourJoin`, `on_tourStart`...
* **Đề xuất tách**:
  - `server/src/hub/tournaments-match.js` (~180 dòng): Logic vòng lặp timer và ghép trận.
  - `server/src/hub/tournaments.js` (còn lại ~300 dòng): Các handler tin nhắn API.

#### 9–13. Các file còn lại – Ưu tiên: THẤP
* `caro/i18n-bots.js` (475 dòng) & `caro/i18n-rules.js` (441 dòng): Thuần dữ liệu từ điển 4 ngôn ngữ cân xứng (~110–120 dòng/ngôn ngữ), không chứa mã lệnh. **Khuyến nghị giữ nguyên**.
* `server/src/store.js` (469 dòng): Tách `server/src/store-schema.js` (~150 dòng DDL bảng/migrations), `store.js` còn lại ~320 dòng CRUD.
* `server/src/hub/rooms.js` (456 dòng): Tách `server/src/hub/challenges.js` (~100 dòng thách đấu/quick play), `rooms.js` còn ~355 dòng.
* `caro/tour.js` (423 dòng): Tách `caro/tour-admin.js` (~100 dòng xem số liệu admin), `tour.js` còn ~320 dòng.

---

### Môi trường & Commit kiểm thử
- **Commit**: `a3c3a575d41708993206657a940cccd020d38575` (`claude/vibrant-dirac-222bq2`)
- **Tài liệu tham chiếu**: `.claude/skills/chia-file-hub/SKILL.md` và `AGENTS.md`
- **Công cụ phân tích**: Đoạn script Node.js AST/Line Scanner quét độc lập toàn bộ 13 file.

---
_Thực hiện bởi Antigravity (Agent: agy)_
