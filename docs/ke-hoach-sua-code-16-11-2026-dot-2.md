# Kế hoạch sửa lỗi đợt 2 (mục 34–62 + nghi ngờ bổ sung)

> **Đây là bản soát cần model lớn kiểm lại trước khi sửa các mục quyền / bảo mật** (mục 47, 27, 67, 29, nhóm CLB của mục 15).
> Tôi chưa đối chiếu được mọi ý trong mỗi mục; mục nào thiếu bằng chứng code được ghi "CHƯA KIỂM".

- Commit đối chiếu: `afb318a` (merge PR #217). Working tree sạch. Không sửa file nào trong repo.
- Nguồn: danh sách lỗi rà soát code 16/11/2026 (bản 2) do Minh gửi (319 dòng; đã đọc đủ).
- Quyết định của Minh được giữ: **không xoá `m.events` / `m.esp` khi huỷ kết quả trận**. Mọi đề xuất bên dưới đều theo quyết định này.
- Ký hiệu: **Cao / TB / Thấp**. "Cần Minh" = phải chốt ý đồ trước khi sửa.

---

## 1. Bảng tổng

### 1a. Mục 34–62 (29 mục)

| # | Tóm tắt | Trạng thái | Ưu tiên | Đợt |
|---|---|---|---|---|
| 34 | Kings nhận đội lệch khi đi tiếp Swiss record → 0 trận, giải kẹt | Còn lỗi (code xác nhận) | TB | 3 |
| 35 | Graph không kiểm lại cỡ lúc chuyển giai đoạn → throw | Còn lỗi | TB | 3 |
| 36 | Massstart: trần hạng cố định 48, không theo cỡ đua | Còn lỗi | TB | 4 |
| 37 | Pursuit nhánh 'time': người thiếu thời gian nhận gap 0 | Còn lỗi | TB | 4 |
| 38 | Omnium: vắng mặt đua cuối không bị xếp cuối như DNF | Còn lỗi, **mô tả trong danh sách hơi lệch** (xem 4) | TB | 4 (sau Minh) |
| 39 | Playoff số miền không phải luỹ thừa 2 → nửa nhánh BYE | Còn lỗi (hiếm) | Thấp | 3 |
| 40 | Weekly thiếu ngưỡng đội: cần 2×seats−1+sit, code chỉ kiểm seats+1 | Còn lỗi | TB | 3 |
| 41 | The Split: ≤3 đội đi tiếp thì split mất | Còn lỗi, **CHƯA KIỂM đủ đường** | Thấp | 3 |
| 42 | Graph gắn cờ `final` sai trận (compass8) | Còn lỗi | Thấp | 5 (cần Minh nhẹ) |
| 43 | Skijump view: người không nhảy đồng hạng 2 với người 0.0; tổng null | Còn lỗi | Thấp | 4 |
| 44 | Massstart view: thứ bậc xuyên heat khi hoà theo thứ tự nhập | **CHƯA KIỂM** | Thấp | 4 |
| 45 | Khiếu nại: server cắt 20, client vẽ 10 → khiếu nại cũ nhất bị giấu | Còn lỗi | TB | 2 |
| 46 | Đồng hồ "tự công nhận sau n phút" không đếm | Còn lỗi | Thấp | 2 |
| 47 | Danh sách khiếu nại lộ cho người không phải BTC (giải thường) | Còn lỗi, **cần Minh** | TB | 2 |
| 48 | Nút xử lý khiếu nại disabled vĩnh viễn khi server từ chối | Còn lỗi (đọc code) | TB | 2 |
| 49 | local-games: vòng `for(;;)` treo trang khi localStorage đầy | Còn lỗi (đọc code) | **Cao** | 1 |
| 50 | Xuất PNG/GIF ván có nước hỏng → TypeError (trái comment H-E1) | Còn lỗi | TB | 1 |
| 51 | learn.js load() không khử `null`/số → TypeError khi mở Học | Còn lỗi | TB | 1 |
| 52 | Storm: timer `next` cũ thay bài của phiên mới | Còn lỗi | Thấp | 1 |
| 53 | Danh sách câu đố rỗng → undefined (hiện không chạm được) | Còn (tiềm ẩn) | Thấp | 1 |
| 54 | rapfi-analysis: huỷ khi chờ auxReady không gọi auxDone | Còn lỗi, **CHƯA CHẠY** | TB/Thấp | 5 |
| 55 | local-games.add(): chống trùng không so nước đi | Còn lỗi | Thấp | 1 |
| 56 | buildSeason ném TypeError khi 0–1 đội (qua được hub) | Còn lỗi (đọc code) | TB | 3 |
| 57 | Giai đoạn single+playoff+draft: nhánh plan bỏ qua bốc ghế | Còn lỗi | TB | 3 |
| 58 | Play-in NBA với per=2: hạt giống 1 và 2 cùng đấu pi_78 | Còn lỗi, **cần Minh** | Thấp | 5 (sau Minh) |
| 59 | Omnium: DNF đua cuối vẫn cộng sprint/lap | Còn lỗi, **cần Minh** | Thấp | 4 (sau Minh) |
| 60 | Skijump: một lượt DNF làm tổng null | Còn lỗi, **cần Minh** | TB | 4 (sau Minh) |
| 61 | Massstart: DSQ chung kết xếp trên người bị loại bán kết | Còn lỗi, **cần Minh** | Thấp | 4 (sau Minh) |
| 62 | Backyard: trần 300 yard làm giải kẹt running | Còn lỗi (rất hiếm) | Thấp | 4 |

Kết quả 34–62: **0 đã sửa**; 1 CHƯA KIỂM (44); 1 phần chưa kiểm đủ (41); 7 cần Minh quyết (38, 42*, 47, 58, 59, 60, 61); còn lại sửa được ngay.
(*42 chỉ là metadata cờ, sửa được nhưng tác động thấp.)

### 1b. Nghi ngờ bổ sung (phần 34–62)

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Play-in NBA per=2 | = mục 58 | gộp |
| Knock bounty pick hoà | Không phải lỗi | vô hại, bỏ qua |
| submitDeck TypeError | Không tới được hub | thêm chốt phòng thủ 1 dòng (Thấp, đợt 3) |
| buildSeason TypeError | = mục 56 | gộp |
| Omnium DNF | = mục 59 | gộp |
| Skijump dnf | = mục 60 | gộp |
| Massstart dsq | = mục 61 | gộp |
| Backyard cap | = mục 62 | gộp |

### 1c. Mục cũ còn "chưa kiểm / chưa làm" (không lập kế hoạch lại, chỉ ghi trạng thái)

| Mục cũ | Trạng thái mới (đã đối chiếu code) | Ghi chú |
|---|---|---|
| Nghi ngờ 5 (`on_tourScore` không kiểm `m.hold`) = mục 67 | **Còn lỗi, Cao** (grep `hold` trong tour-score.js: 0) | xem đợt 2 |
| Nghi ngờ 7 (`vcf()` sót chuỗi) | **Còn lỗi, TB** | đợt 5 |
| Nghi ngờ 9 (`an-pool` không onerror/timeout) | **Còn lỗi, Thấp** (grep: không có onerror/timeout) | đợt 5 |
| Nghi ngờ 10 (trường số không esc) | Bác bỏ (server ép số); giữ phòng thủ thấp | không làm |
| Nghi ngờ 12 (lời mời ma) | Bác bỏ bằng kiểm trực tiếp production v200 (F2) | không làm |
| Nghi ngờ 14 (tourpush diffParts) | Bác bỏ; phát hiện phụ: snap cập nhật trước diff | không làm |
| Nghi ngờ 15 (nhóm nhỏ CLB/giải) | **Còn một số ý**: (a) trần 20 CLB khi duyệt, (b) trần spam yêu cầu, (c) giải tán không huỷ giao hữu, (d) uninvite ở giải running, (e) hoàn quota AI, (f) LIVE_OPTS, (g) đổi tên giải running, (h) tự báo bằng slug | đợt 5; (e), (g) cần Minh |
| Nghi ngờ 16 (store.close, mask 'İ', hit()) | Còn lỗi, Thấp (hit() chỉ là CPU, không rò rỉ) | đợt 5 |
| Mục 29 (streak Arena khi huỷ) | **Còn lỗi, Thấp** (`disputes.js:87` trừ streak theo hiện tại) | đợt 2 |
| Mục 31 (Position.pack tràn) | Còn lỗi, Thấp | đợt 5 |
| Mục 33 (chuỗi tiếng Việt `online-auth.js:121`) | Còn lỗi, Thấp | đợt 5 |
| Mục 18 (cache ô cấm Renju) | **Đã sửa trong code** (khoá theo đối tượng bàn + nước cuối); **thiếu bài thử** | đợt 5 |
| Mục 24 (topicDirty rò rỉ) | **Đã sửa** (lọc theo `canForum`) | không cần làm |
| Mục 32 (colName từ cột 702) | **Đã sửa trong code** (đọc lại: bijective base-26 đúng; c=702 → "aaa"); thiếu bài thử | đợt 5 |
| Link trang nhúng (thiếu bài thử) | **CHƯA KIỂM** (không rõ phạm vi) | hỏi Minh |

Đã sửa khi kiểm nhanh (không cần làm thêm): 1 (chỉ thêm kiểm `banned`/`members` ở `clubs.js:234`), 2 (tự báo là đề xuất, cần đối thủ trùng hoặc BTC; phần sửa sau finished còn → Minh, mục 66), 3 (`stages-groups.js:190` đã dùng `min`), 5 (`importLegacy` try/catch, đổi tên file hỏng; `store.js:43` bỏ qua dòng hỏng), 6 (`validResult` kiểm `validMoves`), 7 (`disputes.js:24` chỉ cắt khiếu nại đã xử lý, commit 7c6fda0), 12 (`CaroConfirm.ask`), 13a (chat: có kiểm `banned`; **diễn đàn CHƯA KIỂM**), 13b (`clubInbox` chỉ đánh dấu tin đã gửi), 13c (`talkMuted` giữ lại), 14 (`checkSlug`), 15 (Bo: `sets.length > boOf`), 16 (podium đồng hạng 3 sắp theo `seedOf`), 19 (`LC.rewind` ở nhánh thường), 20 (`canManageTour` 'run' có 'all'), 21 (`declineDraw` đặt `drawWait`), 25 (kick kiểm trạng thái), 26 (log sau `regAdmit`), 30 (test đã phủ HTML, `//` trong chuỗi, `window[...]`), 9a (`on_otEdit` kiểm trước khi ghi), 8a (`otSeriesView` kiểm quyền).
Gần đủ: 10 (`otMultiQuota` kiểm trước khi lưu giải tổng; còn ca lỗi khác trong `otMultiGames` làm lại giải tổng "ma" — **CHƯA KIỂM đủ**).
Còn: 8b (`otMultiShown` không xét người xem; đợt 2/5), 8c (thấp).

---

## 2. Các đợt sửa (mỗi đợt một PR)

Thứ tự: đợt 1 là lỗi Cao và rẻ nhất (sửa cục bộ, ít đụng nhau); đợt 2 gom khiếu nại / giải online (cùng vùng hub); đợt 3 gom cỡ giai đoạn (cùng `otour-run.js`); đợt 4 gom xếp hạng đua; đợt 5 là phần lẻ.

### Đợt 1 — Client rìa: treo trang và dữ liệu hỏng (PR "client: chống treo và dữ liệu hỏng")
Gom vì đều là client, mỗi việc vài dòng, không đụng server.

**Mục 49 — Cao. `caro/local-games.js:61-87`**
- Trạng thái: còn lỗi. Đọc code: `freeSome` nhánh `g.an` ghi cờ qua `saveIndex(list)`, mà `saveIndex` nuốt lỗi khi đầy → lần sau `index()` đọc lại cờ cũ, chọn đúng ván đó, trả `true` mãi → `writeFreeing` lặp vô hạn.
- Nguyên nhân: tiến triển của vòng lặp chỉ nằm ở một lần ghi có thể thất bại.
- Cách sửa: trong `freeSome`, nếu không ghi được index thì **xoá hẳn** khoá phân tích (`drop(K.game(g.id))`, `removeItem` luôn giải phóng chỗ) và trả `true` chỉ khi thực sự giảm số ván; thêm giới hạn số vòng (ví dụ 2 × độ dài danh sách) rồi trả `false`.
- Bài thử: `caro/tests/` (file local-games, tạo mới nếu chưa có): storage giả mà `setItem` luôn ném `QuotaExceededError` còn `removeItem` hoạt động, kho có ≥1 ván. Kỳ vọng: `add()` trả về trong <1 giây, không treo. **Trên code cũ phải đỏ (treo / quá thời gian).**
- Rủi ro: `local-games` có test hiện có (kiểm tra trước khi sửa); không đổi định dạng dữ liệu.

**Mục 55 — Thấp. `caro/local-games.js:120`** (`add()`)
- Trạng thái: còn lỗi. Chống trùng nhánh không-share chỉ so `at`, số nước, luật.
- Cách sửa: thêm trường băm nội dung nước (ví dụ chuỗi nước rút gọn) vào `META` của chỉ mục, so với `g.h` khi trùng `at`.
- Bài thử: hai ván khác nhau cùng `at` mili-giây và cùng số nước → hai id khác nhau. Đỏ trên code cũ.

**Mục 50 — TB. `caro/share.js:57-58`**
- Trạng thái: còn lỗi. `if (final && n)` dùng `b.moves[n-1]`; khi nước cuối bị bỏ, `last` là `undefined` → `last.x` ném TypeError.
- Cách sửa: `const last = b.moves[b.moves.length - 1]; if (final && last) {…}`.
- Bài thử: `share` với `moves = [[0,0],[1,1],[0,0]]` và `final = true` → không ném, vẽ được phần còn lại. Đỏ trên code cũ.

**Mục 51 — TB. `caro/learn.js:195`** (`load()`)
- Trạng thái: còn lỗi. `JSON.parse` thành công nhưng là `null`/số → `load().done` ném lỗi (`doneSet`, `markDone`).
- Cách sửa: `const v = JSON.parse(…); return v && typeof v === 'object' && !Array.isArray(v) ? v : {};`
- Bài thử: `localStorage` có `'null'` và `'5'` → mở Học và `markDone` không ném. Đỏ trên code cũ.

**Mục 52 — Thấp. `caro/storm.js:75, 84`**
- Trạng thái: còn lỗi. `setTimeout(next, …)` không gắn phiên; `next()` chỉ kiểm `s` toàn cục, nên timer cũ chạy trên phiên mới.
- Cách sửa: chụp `const cur = s` khi đặt timer, rồi `if (s === cur) next();`; hoặc huỷ timer trong `stop()`.
- Bài thử: start → đúng/sai → stop → start trong 350 ms; đếm lần gọi `next` = 1 cho phiên mới. Đỏ trên code cũ.

**Mục 53 — Thấp (tiềm ẩn). `caro/puzzles.js:45-58, 95`, `caro/puzzle-home.js:31-32`**
- Trạng thái: còn (hiện không chạm được vì dữ liệu đủ 363 bài).
- Cách sửa: `loadPuzzles` không lưu đệm `[]`; `nextPuzzle` kiểm `q` trước khi đọc `q.id`.
- Bài thử: danh sách rỗng → không ném, hiện thông báo trống.

### Đợt 2 — Khiếu nại và giải online (PR "giải online: khiếu nại, hold, quyền xem")
Gom vì cùng `disputes.js`, `tour-disputes.js`, `tour-score.js`, `tour-opts.js`.

**Mục 67 (= nghi ngờ 5) — Cao. `server/src/hub/tour-score.js` (đường nhập tỉ số, `scoreTarget` và các nhánh ghi)**
- Trạng thái: còn lỗi. Grep `hold` trong `tour-score.js`: 0 kết quả. BTC ghi đè được tỉ số lên trận đang chờ xử khiếu nại; khiếu nại kẹt `open`; khi hết hạn `tickDisputes` tự công nhận theo tỉ số mới, `m.hold` không bao giờ gỡ.
- Cách sửa: trong đường ghi tỉ số (cả BTC lẫn tự báo), `if (m.hold) throw E('tour_match_held')`; thêm chuỗi dịch `tour_match_held` đủ vi/en/ru/zh (theo `docs/van-phong-4-ngon-ngu.md`).
- Bài thử: `server/test/` (cạnh `tour-*` hiện có): tạo trận có `m.hold`, gọi nhập tỉ số → lỗi `tour_match_held`, tỉ số không đổi. Đỏ trên code cũ.
- Rủi ro: cần chốt Q2 (chặn hay cho ghi và huỷ hold). Khuyến nghị: chặn.

**Mục 45 — TB. `server/src/hub/disputes.js:47` và `caro/tour-disputes.js:19`**
- Trạng thái: còn lỗi. Server gửi tối đa 20 (`slice(-20)`), client vẽ `slice(0, 10)` → 10 khiếu nại cũ nhất trong 20 bị giấu, huy hiệu đếm vẫn 20.
- Cách sửa: client vẽ toàn bộ danh sách gửi về (hoặc phân trang có nút "xem thêm"); server tăng giới hạn đủ cho mọi khiếu nại mở (`open` không bị cắt, như mục 7 đã làm với đã xử lý).
- Bài thử: 25 khiếu nại open → client hiển thị đủ 25 nút xử lý. Đỏ trên code cũ.

**Mục 46 — Thấp. `caro/tour-disputes.js:23` và `caro/tour.js:174-178`**
- Trạng thái: còn lỗi. Chữ "tự công nhận sau n phút" có `wait` nhưng không có class `cd` nên `tick()` không cập nhật.
- Cách sửa: bọc thời gian trong `<span class="cd" data-at="${d.deadline}" data-prefix="dispute_auto_in_prefix">` và thêm khoá i18n tương ứng vi/en/ru/zh (hoặc cập nhật tiêu đề mỗi giây theo cùng `tick()`).
- Bài thử: DOM test (caro/tests): đổi thời gian giả lập → chữ đếm lùi. Thấp, có thể gộp với kiểm tra thủ công.

**Mục 48 — TB. `caro/tour-disputes.js:42-43`**
- Trạng thái: còn lỗi (đọc code). `b.disabled = true` rồi gửi; khi server trả `dispute_gone`/`dispute_closed` không có cập nhật nào → nút xám tới lần vẽ lại kế tiếp không liên quan.
- Cách sửa: bỏ `b.disabled`, dùng cờ "đang gửi" trong bộ nhớ và tự mở lại sau ~3 giây hoặc khi nhận `tour_dispute_saved`/lỗi; khi lỗi thì vẽ lại trang giải.
- Bài thử: giả lập lỗi `dispute_gone` → nút bấm lại được. Đỏ trên code cũ.

**Mục 47 — TB, CẦN MINH. `server/src/hub/tournaments.js:163` (trong `tourShared`), `tourpush.js:120`, `caro/tour.js:234`**
- Trạng thái: còn lỗi. `tourShared` gửi `disputes` cho mọi người xem, và `tourpush` đẩy `shared` cho tất cả kết nối đang mở trang giải. API công khai (`api.js:81`) đã bỏ đúng trường này, nhưng đường trang giải thì không. **Chưa tái hiện với khách thật (CHƯA KIỂM hành vi).**
- Cách sửa đề xuất (nếu chọn "riêng BTC"): chuyển `disputes` từ `tourShared` sang `tourMine` (theo uid) và cho phép BTC; đẩy riêng cho người quản lý qua `tourpush`. Đây là thay đổi cấu trúc nhỏ nhưng dính tới đẩy dữ liệu; cần model lớn kiểm lại.
- Bài thử: `server/test/`: `tourShared(t)` không chứa `disputes`; người không phải BTC qua `tourView(t, uid)` không nhận `disputes`. Đỏ trên code cũ.
- Cần Minh: Q1.

**Mục 27 — TB. `server/src/hub/tour-opts.js:99-127`** (`attachTarget`)
- Trạng thái: còn lỗi. Không kiểm `t.status`: đính kèm vào giải đã kết thúc được.
- Cách sửa: `if (['finished','cancelled','rejected'].includes(t.status)) throw E('tour_closed');` trong `attachTarget`, dùng khoá `tour_closed` sẵn có.
- Bài thử: giải `finished`, người chơi đính kèm → lỗi. Đỏ trên code cũ.
- Lưu ý: mục này đang chạm quyền (model lớn kiểm lại).

**Mục 29 — Thấp. `server/src/hub/disputes.js:84-95`** (`resolveArena`)
- Trạng thái: còn lỗi. `p.streak = max(0, p.streak - 1)` trừ theo trạng thái hiện tại, không theo lúc ván diễn ra.
- Cách sửa: lưu `streakBefore` của người thắng khi settle ván Arena (cần kiểm `settle()` — **CHƯA KIỂM chi tiết**), khi huỷ thì khôi phục đúng giá trị đó. Nếu không muốn đụng dữ liệu cũ: chấp nhận Thấp, ghi chú.
- Bài thử: sau khi thắng 2 ván liên tiếp, huỷ ván đầu → streak đúng.

**Mục 66 & 65 (phần giải Offline, nếu gom vào đợt này)** — xem đợt 3 và Q-section, không đưa vào đợt 2.

### Đợt 3 — Cỡ giai đoạn và chuyển giai đoạn (PR "giải offline: kiểm cỡ khi chuyển giai đoạn")
Gom vì đều chạm `otour-run.js` (`otNextStage`) và các `stages-*.js` có hàm `error(cfg, n)`.

**Chung cho 34, 35, 56, 40, 39, 41 — gốc: `checkSize` (`server/src/hub/otour-spec.js:54-72`) kiểm bằng số ƯỚC TÍNH, còn `otNextStage` (`otour-run.js:144-186`) không kiểm lại số thực tế.**
- Cách sửa chung (khuyến nghị): trong `otNextStage`, **trước khi** `t.stage++` và trước khi `buildStage`, chạy lại kiểm cỡ trên số đội thực (`seeds.length`) bằng đúng danh sách của `checkSize` (`ST.Kinds.sizeError`, `ST.leagueError`, `ST.seasonError`, `Race.raceError`, `ST.REP.error`, và kiểm `< 2`). Nếu lỗi: ném `SpecError` để BTC thấy, giữ nguyên `t.stage`. Lưu ý: kết quả trận vừa nhập đã được ghi; cần xác nhận hành vi đó với Minh (xem Q3).
- Bài thử chung: giải với spec gây lệch → sau nhập kết quả chốt giai đoạn, giai đoạn không chuyển và trả lỗi `ot_*` (không throw TypeError). Đỏ trên code cũ.

**Mục 34 — TB. `server/src/hub/stages-kings.js:28-32`, `otour-run.js:176-185`**
- Trạng thái: còn lỗi. Spec Swiss record thắng 3 thua 2 → kings chạy thật cho 3 đội đi tiếp → `buildKings` n=3 → `h = 0`, không trận nào.
- Cách sửa: kiểm lại `kingsError(cfg, seeds.length)` trong `otNextStage` như trên. Thêm ràng buộc ở `normalizeSpec`: giai đoạn sau Swiss record không được là kings/graph khi số đi tiếp không cố định (cùng cách với `directTotal`).
- Bài thử: spec [swiss record 3-2, kings, single] với 10 đội → chuyển giai đoạn trả lỗi, không có trận 0. Đỏ trên code cũ.

**Mục 35 — TB. `server/src/hub/stages-graph.js:43-44`**
- Trạng thái: còn lỗi. `build` ném `Error('graph size')` khi `G.make` không có khuôn cho `seeds.length`.
- Cách sửa: như chung; đổi thông điệp lỗi thành `SpecError('ot_graph_size', …)` (khoá đã có, `stages-graph.js:error`).
- Bài thử: page 5 đội và afl8 9 đội qua chuyển giai đoạn → lỗi có mã, không throw. Đỏ trên code cũ.

**Mục 56 — TB. `server/src/hub/stages-season.js:68-79` và `:127` (`buildSeason`)**
- Trạng thái: còn lỗi (đọc code; chuỗi hub chưa chạy lại). Với 0–1 đội, `seasonInfo` lỗi → fallback → `info.levels[...]` undefined → TypeError.
- Cách sửa: như chung (kiểm `< 2` trước khi dựng); không cần sửa `buildSeason` nếu chặn ở `otNextStage`. Thêm guard `if (seeds.length < 2) throw new SpecError('ot_stage_few', …)` ở đầu `buildSeason` như phòng thủ.
- Bài thử: spec [swiss record 1-1, season, single], 1 đội đi tiếp → lỗi có mã. Đỏ trên code cũ (TypeError).

**Mục 57 — TB. `server/src/hub/otour-run.js:169-179`**
- Trạng thái: còn lỗi. Nhánh `if (plan)` trả về trước khi gọi `ST.DRF.seatStage(…)` (có ở `:186` cho nhánh thường) → draft không bốc ghế, `deckMissing` luôn false.
- Cách sửa: trong nhánh `plan`, gọi `ST.DRF.seatStage(next)` ngay sau `buildStage`/`attachPre`, trước `return`.
- Bài thử: giai đoạn single có playoff + draft → sau chuyển, `t.st[t.stage]` có ghế; nộp decklist được. Đỏ trên code cũ.

**Mục 40 — TB. `server/src/hub/stages-weekly.js:52-56`** (`weeklyError`)
- Trạng thái: còn lỗi. Code: `need = max(seats+sit, bottom && weeks>1 ? seats+2 : 0, seats+1)`; với `{weeks:2,seats:4,final:2,bottom:1,sit:1}` cho `need = 6`, phòng Survival teo tới 2 đội (đã tái hiện).
- Cách sửa: `need = 2*seats - 1 + sit` (kết quả 8 với cấu hình trên), giữ thông điệp `ot_weekly_few`.
- Bài thử: 6 đội với cấu hình đó → lỗi `ot_weekly_few` với `n: 8`. Đỏ trên code cũ.
- Rủi ro: cần chạy lại test weekly hiện có (có test phủ nhóm này theo báo cáo); kiểm các preset có sẵn không bị vượt ngưỡng mới.

**Mục 39 — Thấp. `server/src/hub/stages-playoff.js:81-86`** (`size = pow2(C) * half`)
- Trạng thái: còn lỗi, hiếm (cần spec tuỳ chỉnh 3 miền).
- Cách sửa: từ chối số miền không phải luỹ thừa 2 ở `normalize` (hoặc `checkSize`), thông điệp mã lỗi mới `ot_playoff_conf` (cần thêm khoá vi/en/ru/zh).
- Bài thử: `confs: 3` → lỗi khi chuẩn hoá. Đỏ trên code cũ.

**Mục 41 — Thấp (CHƯA KIỂM đủ). `server/src/hub/stages-splits.js:35-50`, `stages.js:158`**
- Trạng thái: cơ chế xác nhận một phần: `splitGroups` cắt `top = min(top, seeds-2)`, với ≤3 đội nhóm trên rỗng/1 đội; nhưng chưa đọc hết `drawGroups` để biết tác động cuối.
- Cách sửa đề xuất: kiểm `splitError` trong `checkSize` (cần ≥2 đội mỗi nhóm), mã mới `ot_split_few`.
- Bài thử: vòng tròn split với 3 đội đi tiếp → lỗi có mã.

**Phòng thủ phụ — submitDeck (`server/src/hub/stages-draft.js:80`)**: không tới được hub hiện tại; thêm chốt `if (!…) return/throw` giống hai hàm anh em, Thấp, gộp vào đợt này.

### Đợt 4 — Xếp hạng và tính điểm cuộc đua (PR "giải offline: xếp hạng đua")
Gom vì cùng thư mục `stages-*.js` đua (massstart, pursuit, omnium, skijump, backyard). Phần cần Minh để sau.

**Mục 36 — TB. `server/src/hub/stages-massstart.js:14, 69-73`**
- Trạng thái: còn lỗi. Trần `k <= MAX_HEAT * 2 = 48` cố định trong `record()` (dòng 73); với chung kết 72 người thì hạng 49–72 bị `ot_race_rank`.
- Cách sửa: thay trần bằng số người thực của cuộc đua: `k <= membersOf(st, i).length` (truyền `st, i` vào `record`), giữ kiểm `ranks` trùng.
- Bài thử: chung kết 72 người, nhập hạng 72 → hợp lệ; heat 6 người, nhập hạng 7 → lỗi. Đỏ trên code cũ.

**Mục 37 — TB. `server/src/hub/stages-pursuit.js:39`**
- Trạng thái: còn lỗi. Nhánh 'time': `time[u] != null ? time[u] - best : 0` → người thiếu thời gian nhận gap 0, trong khi nhánh 'jump' (dòng 33–34) dùng `worst`.
- Cách sửa: tính `worst = max(gap đã có)` rồi dùng `worst` cho người thiếu thời gian, như nhánh 'jump'.
- Bài thử: một người không có thời gian Sprint → gap lớn nhất, có test khẳng định (như nhánh jump). Đỏ trên code cũ.

**Mục 43 — Thấp. `server/src/hub/stages-skijump.js:73-76`** (view)
- Trạng thái: còn lỗi. `key = s.out ? null : s.t` → người không nhảy (`t = 0`, `fin = 0`) cùng khoá 0 với người 0.0 → đồng hạng 2; `total` null.
- Cách sửa: `key` riêng cho `fin === 0` (không gộp với người 0.0), ví dụ `key = s.out || !s.fin ? null : s.t` và đẩy người không nhảy về cuối nhóm chưa xong.
- Bài thử: người 0.0 và người không nhảy → hạng khác nhau. Đỏ trên code cũ.

**Mục 38 — TB, sau Minh (Q4). `server/src/hub/stages-omnium.js:54-68, 69-79` (`calc`)**
- Trạng thái: còn lỗi, **nhưng mô tả trong danh sách lệch**: code không gán "như về đích" cho người vắng mặt. Người không có dòng ở đua cuối không được gắn `dnf`, nên không bị xếp cuối như DNF (`order` sort `dnf` trước). Với người vắng mặt, `total` không đổi nhưng vẫn xếp theo tổng. Nghĩa là: vắng mặt không bị phạt như DNF, dù tổng hiện có có thể cao nhất. Tái hiện (đội dẫn 120 điểm vắng mặt → vô địch) **dựa trên đọc code, chưa chạy**.
- Cách sửa (nếu Minh chọn "vắng mặt = DNF"): trong `calc`, với sự kiện cuối (`ev.i === EVENTS-1`) gán `dnf = true` cho mọi thành viên không có dòng trong `ev.rows`.
- Bài thử: đội dẫn vắng mặt đua cuối → không vô địch. Đỏ trên code cũ.

**Mục 59 — Thấp, sau Minh (Q3). `server/src/hub/stages-omnium.js:45-47`**
- Trạng thái: còn lỗi. DNF ở đua cuối vẫn cộng `sp` và `lap` (`s.parts[3] = s.sp + s.lap*O.lap`), trong khi ba đua đầu tính DNF = 0.
- Cách sửa (nếu chọn đồng nhất): khi `x.dnf` thì `sp = lap = 0` cho đua cuối.
- Bài thử: DNF sp=50, lap=1 → tổng không cộng. Đỏ trên code cũ.

**Mục 60 — TB, sau Minh (Q-skijump). `server/src/hub/stages-skijump.js:59, 67`**
- Trạng thái: còn lỗi. Một lượt `dnf` làm `s.out = 'dnf'` và `jump = null` cho cả người có lượt khác hợp lệ (100 điểm + DNF xếp dưới 50+50).
- Cách sửa (khuyến nghị): `dnf` của một lượt chỉ tính 0 cho lượt đó, tổng giữ các lượt hợp lệ; `out` chỉ khi không có lượt nào hợp lệ.
- Bài thử: 100 + dnf → tổng 100, xếp trên 50+50. Đỏ trên code cũ.

**Mục 61 — Thấp, sau Minh (Q-dsq). `server/src/hub/stages-massstart.js:98-108, 116`**
- Trạng thái: còn lỗi. `final` được gắn cho dsq ở chung kết nên dsq đứng trên người bị loại bán kết; trong cùng cuộc đua thì dsq xếp cuối.
- Cách sửa (khuyến nghị): nhóm `dsq` đứng dưới mọi người không dsq trong chung kết và dưới người bị loại bán kết cùng hạng.
- Bài thử: dsq chung kết hạng 4 toàn giải không đứng trên hạng 3 bán kết. Đỏ trên code cũ.

**Mục 44 — Thấp. `server/src/hub/stages-massstart.js` (view, `rankRace` khi hoà)**
- Trạng thái: **CHƯA KIỂM** đủ (chưa đọc `rankRace` ở phần hoà; có nghi ngờ thứ bậc theo thứ tự nhập).
- Cách sửa đề xuất: sắp hoà theo `seedOf` như `podium`.

**Mục 62 — Rất thấp. `server/src/hub/stages-backyard.js:14, 63-65`**
- Trạng thái: còn lỗi (đã kiểm: `st.events.length < MAX_YARDS` là điểm dừng cứng).
- Cách sửa: khi chạm trần 300 yard mà chưa xong, chốt giải theo bảng hiện tại (`done = true`, trạng thái `capped`).
- Bài thử: 300 yard chưa xong → giải không còn `running`. Đỏ trên code cũ.

### Đợt 5 — Phần lẻ (PR riêng hoặc gộp theo khu vực)

- **Mục 54 — TB/Thấp (CHƯA CHẠY). `caro/rapfi-analysis.js:129`**: nhánh `if (my !== job) return null;` sau `auxReady` không gọi `R().auxDone()` (các nhánh 169, 187 có). Sửa: `if (my !== job) { if (two) R().auxDone(); return null; }`. Bài thử: huỷ khi đang chờ `auxReady` → worker phụ được hẹn dừng. Cần xác minh lại trên máy (boat-rapfi có hẹn dừng 60 giây).
- **Nghi ngờ 7 (vcf) — TB. `caro/rules-ai.js:196-230`**: dùng `put/remove` làm quân thử không vào `board.moves`, vùng sinh nước không mở rộng quanh quân thử. Sửa theo mẫu `analysis.js:60-61` (đi/huỷ thật, mở rộng vùng). Bài thử: thế luật Việt Nam mà `vcf` gốc độ sâu 5 trả null nhưng phải tìm được (cần thế cụ thể từ báo cáo `phu-nghi-ngo-doi-chinh.md`, không nằm trong repo: **CHƯA CÓ THẾ CỤ THỂ**).
- **Nghi ngờ 9 (an-pool) — Thấp. `caro/an-pool.js:80-90`**: không có `onerror`/timeout. Sửa: `worker.onerror` và watchdog reject, rồi fallback. Bài thử bằng Worker giả trong caro/tests.
- **Nghi ngờ 15 (CLB/giải nhóm nhỏ) — TB**: (a) trần 20 CLB khi duyệt yêu cầu (kiểm trong `clubs.js`, cạnh `:234`), (b) trần yêu cầu toàn cục, (c) giải tán CLB huỷ giao hữu pending, (d) `on_otUninvite` kiểm `draft` / không đổi quyền giữa giải, (f) `LIVE_OPTS` khoá `quickAdvance`/`arrangeNext` khi giải chạy, (h) tự báo bằng slug. (e) và (g) cần Minh. Bài thử: `server/test/club-security.test.js`, `otour-*.test.js`.
- **Nghi ngờ 16 — Thấp**: `store.close()` flush trước khi đóng và thử lại; `moderation.mask()` dùng chỉ số trên chuỗi đã chuẩn hoá cùng độ dài (vd `İ`), bài thử `mask('İ fuck')` → `'İ f***'`; bác rò rỉ `hit()`.
- **Mục 31 (pack) — Thấp**: `engine-position.js:81` chặn hoặc mở rộng y; bài thử roundtrip y ±40000 (đã có số liệu 342/342 lỗi).
- **Mục 33 — Thấp**: `online-auth.js:121` đổi `Error('Không tải được Google')` thành mã không phải tiếng Việt (ví dụ `google_load_fail`), không đổi thông báo người dùng.
- **Bài thử còn thiếu**: mục 18 (cache ô cấm: bài thử thế A → thế B cùng `n` và cùng nước cuối phải không còn dấu cấm của A), 32 (colName c=702 → "aaa", c=26 → "aa"), 24 (topicDirty không gửi cho người không có quyền), link trang nhúng (**CHƯA KIỂM phạm vi**).

---

## 3. Câu hỏi cần Minh quyết

- **Q1 (mục 47): ai được thấy danh sách khiếu nại?**
  - (A) Chỉ BTC và người quản lý giải (khuyến nghị: lộ tên hai người và link replay cho khách là không cần thiết).
  - (B) Công khai như hiện tại (ghi rõ trong trang giải).
- **Q2 (mục 67): nhập tỉ số vào trận đang chờ xử khiếu nại?**
  - (A) Chặn với `tour_match_held` (khuyến nghị).
  - (B) Cho ghi, rồi tự huỷ hold và đánh dấu khiếu nại `superseded`.
- **Q3 (cỡ giai đoạn, đợt 3): kiểm lại cỡ khi chuyển giai đoạn thất bại thì sao?**
  - (A) Kết quả trận vừa nhập vẫn giữ, giai đoạn không chuyển, BTC thấy lỗi có mã (khuyến nghị; nhất quán với "huỷ kết quả" đang có).
  - (B) Từ chối luôn việc nhập kết quả chốt giai đoạn (cần rollback trận).
- **Q4 (mục 38): người vắng mặt đua cuối omnium?**
  - (A) Coi như DNF: xếp cuối, không tính điểm đua (khuyến nghị, đồng nhất với DNF).
  - (B) Giữ như hiện tại.
- **Q5 (mục 58): play-in NBA khi per nhỏ?**
  - (A) Cấm play-in khi per < 4 (khuyến nghị; per=4 mới cho s3–s4).
  - (B) Cho phép, chấp nhận nhánh thoái hoá.
- **Q6 (mục 59, 60, 61): thống nhất DNF/DSQ?** Khuyến nghị: DNF = 0 điểm đua và xếp cuối; DSQ xếp dưới mọi người không DSQ; skijump tính lượt hợp lệ (xem từng mục).
- **Q7 (mục 64, đã có từ đợt trước): nhãn Race "Cộng/trừ" hay server "tổng ghi đè"?** Khuyến nghị: sửa nhãn thành "ghi đè tổng" (server và test đã khoá hành vi ghi đè).
- **Q8 (mục 65, theo quyết định của Minh về `m.esp`/`m.events`): khi huỷ kết quả, Fearless và treo giò còn khoá?** Khuyến nghị: giữ `m.esp` và `m.events` nguyên (đúng quyết định), nhưng loại trận đã huỷ khỏi thống kê tổng hợp và mở khoá Fearless của trận đó.
- **Q9 (nghi ngờ 15e): hoàn quota AI khi lỗi nhà cung cấp?** Khuyến nghị: hoàn khi lỗi phía dịch vụ, không hoàn khi người dùng gửi sai.
- **Q10 (nghi ngờ 15g): đổi tên/mô tả giải đang chạy có cần duyệt lại?** Khuyến nghị: không cần duyệt lại với mô tả, vẫn qua lọc từ tục.
- **Q11 (mục 63 Glicko NaN): có cho đọc dữ liệu production (chỉ đọc) để đếm pool thiếu trường không?** Nếu không, mục 63 giữ ở mức Nghi ngờ.
- **Q12 (mục 29 streak): sửa đúng (ghi streak trước ván) hay chấp nhận Thấp?**

---

## 4. Mục mô tả sai, chưa kiểm được, và điều bất ngờ

- **Mục 38 (omnium vắng mặt)**: danh sách nói "tính như về đích"; code thì người vắng mặt không bị gắn dnf, nên không bị xếp cuối, chứ không phải được "tính như về đích". Kết luận vẫn là lỗi, nhưng nên mô tả lại trước khi làm PR.
- **Mục 41 (Split)**: chưa đọc `drawGroups`, chưa biết tác động cuối.
- **Mục 44 (massstart view)**: CHƯA KIỂM.
- **Mục 10 (otour multi)**: đã sửa phần lớn (pre-check quota); còn ca lỗi khác chưa kiểm.
- **Mục 13a (CLB)**: đã sửa chat; **diễn đàn chưa kiểm**.
- **Mục 29**: chưa đọc `settle()` nên chưa biết chỗ ghi streak trước ván.
- **Mục 47**: chưa tái hiện với khách; kết luận dựa trên đọc `tourShared`/`tourpush`.
- **Mục 54**: chưa chạy; cần kiểm worker có tự dừng không.
- **Mục 4 (PNG DoS)**: không nằm trong danh sách đợt này, **không kiểm lại** trong đợt này.
- **Mục 1–3 (phần cũ)**: không kiểm lại đầy đủ; chỉ kiểm nhanh trạng thái (xem 1c).
- **Mục F (kiểm thử hai phía trên production v200, dòng 293–319)**: 7 quan sát (F1 phía rời không nhận thông báo bị xử thua; F3 xin hoà bị từ chối không báo phía xin; F4 undo lúc lượt đối thủ im lặng; F5 đồng hồ hai phía lệch; F6 link phòng công khai đặt khách vào ghế; F7 nhãn "mất kết nối" tắt sớm). **Tất cả CHƯA KIỂM code**. Chỉ là quan sát từ production; cần đối chiếu riêng.
- **Mục 72 (lời mời ma)** đã đóng bằng kiểm production (F2): không phải lỗi như mô tả.
- **Bất ngờ**: nhiều mục trong danh sách đã được sửa ở PR #216/#217 mà danh sách không cập nhật (đặc biệt 2, 5, 7, 12, 14, 15, 16, 19, 20, 21, 25, 26, 30). Tôi đã đối chiếu bằng code hiện tại, không dựa vào commit message ngoài commit 7c6fda0.
- **Nhóm quyền cần model lớn kiểm lại** trước khi sửa: 47, 27, 67, 29, và nhóm CLB của nghi ngờ 15.
- Cảnh báo thêm: nhiều mục ở đợt 3–4 mới chỉ **đọc code, chưa chạy lại** (34, 35, 56, 57, 36, 37). Trước khi sửa, nên chạy harness trên commit `afb318a` để xác nhận đỏ.

---

## 5. Kết quả thực hiện (17/11/2026)

Quyết định của Minh áp dụng xuyên suốt: **không xoá diễn biến trận (`m.events`) / chi tiết ván (`m.esp`) khi huỷ kết quả**.

### Đã sửa (có bài thử, đỏ trên mã cũ)

| Đợt | Mục | Nội dung | Bài thử |
| --- | --- | --- | --- |
| 1 | 49, 55 | Lưu ván trên máy: `freeSome` chỉ báo thành công khi dọn được thật; khử trùng ván theo mã băm nước đi | `caro/tests/local-games.test.js` |
| 1 | 50, 51, 52, 53 | `share.js` (ván rỗng), `learn.js` (dữ liệu hỏng), `storm.js` (hẹn giờ của phiên cũ, hết bài) | chưa có bài thử riêng |
| 2 | 45, 46, 47, 48 | Khiếu nại: chỉ người quản lý và người trong cuộc thấy; đủ danh sách; đồng hồ đếm ngược; nút không kẹt | `server/test/tour.test.js` |
| 2 | 67 | Trận đang chờ xử khiếu nại không nhập tỉ số được (`tour_match_held`) | `server/test/tour.test.js` |
| 3 | 34, 35, 56, 57 | Chuyển giai đoạn kiểm cỡ theo số đội thực; không vừa thì báo lỗi có mã, kết quả vừa nhập vẫn lưu | `server/test/integrity-1611.test.js` |
| 3 | 40 | Weekly Finals: ngưỡng số đội tính cả suất ngồi ngoài | `server/test/otour-pgc21.test.js` |
| 4 | 36, 44, 61 | Mass start: trần hạng theo số người của lượt; hoà theo hạt giống; truất quyền xếp sau cùng | `server/test/race-rank-1611.test.js` |
| 4 | 37 | Đuổi bắt: thiếu thời gian thì xuất phát cùng người thua xa nhất | như trên |
| 4 | 38, 59 | Omnium: vắng mặt / bỏ cuộc points race xếp sau, không có điểm đua đó | như trên |
| 4 | 43, 60 | Nhảy cầu: bỏ một lượt chỉ mất điểm lượt đó; chưa nhảy không đồng hạng với 0,0 | như trên |
| 4 | 62 | Backyard: chạm trần 300 yard thì chốt giải (không có nhà vô địch) | như trên |
| 5 | 54 | Phân tích Rapfi: huỷ lúc đang chờ Worker phụ vẫn hẹn dừng nó | chưa có bài thử riêng |
| 5 | Nghi ngờ 9 | Bộ Worker phân tích: Worker sập không làm treo lượt, lượt sau tạo lại | `caro/tests/an-pool.test.js` |
| 5 | Nghi ngờ 16 | `moderation.mask`: chữ viết thường ra 2 ký tự không làm lệch chỗ che | `server/test/batchd.test.js` |

### Mục "cần Minh quyết" đã làm theo khuyến nghị (đổi lại được nếu Minh muốn khác)

- Q1 (47): chỉ ban tổ chức và người trong cuộc thấy khiếu nại.
- Q2 (67): chặn nhập tỉ số vào trận đang chờ xử.
- Q3 (đợt 3): kết quả vừa nhập vẫn giữ, giai đoạn không chuyển, báo lỗi có mã.
- Q4 (38): vắng mặt đua cuối omnium = bỏ cuộc.
- Q6 (59, 60, 61): bỏ cuộc = 0 điểm đua đó; truất quyền xếp dưới mọi người không bị truất quyền; nhảy cầu tính các lượt hợp lệ.

### Chưa làm

- 27 (tệp đính kèm sau khi giải kết thúc), 17 (Buchholz Cut): giữ nguyên theo quyết định đợt trước.
- 29 / Q12 (streak), 39 (playoff theo liên đoàn phải là luỹ thừa 2 – cần chuỗi mới), 58 / Q5 (play-in khi `per` nhỏ), 64 / Q7 (nhãn "Cộng/trừ"), 65 / Q8 (Fearless sau khi huỷ kết quả), Q9, Q10: chờ Minh quyết.
- 63 / Q11 (Glicko NaN): cần số liệu production, vẫn ở mức nghi ngờ.
- Nghi ngờ 7 (`vcf` luật Việt Nam): chưa có thế cờ cụ thể để tái hiện.
- Nghi ngờ 15 (a–h), 31 (pack toạ độ lớn), 33 (chuỗi lỗi Google trong mã), bài thử bổ sung cho 18 / 24 / 32 / link trang nhúng: chưa làm trong đợt này.
