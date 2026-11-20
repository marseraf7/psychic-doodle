# Thí điểm Rust cho lõi luật chơi (bước 5 của lộ trình)

Ngày: 19/11/2026. Lộ trình gốc: [nghien-cuu-viet-lai-rust-17-11-2026.md](nghien-cuu-viet-lai-rust-17-11-2026.md), bước 5.
Mã nguồn: `core/caro-rules/`. Trò chơi vẫn chạy hoàn toàn bằng `caro/rules.js`. Từ 20/11/2026 máy chủ **chạy bóng**
bản Rust trên ván thật (chỉ so, không quyết định gì): xem mục 8.

## 1. Đã port những gì

Port nguyên ý từ `caro/rules.js`. File JS là bản đặc tả và không bị sửa. Crate không dùng crate ngoài nào (chỉ `std`),
nên dựng được khi không có mạng.

| JS (`caro/rules.js`) | Rust (`core/caro-rules/src/`) |
|---|---|
| `EMPTY, X, O, DIRS, RULES, ruleOf, key, other` | `board.rs`: hằng số, `Rule` (vn/free/std/renju, mã 0..3), `rule_of`, `key`, `other` |
| `Board` (`get/put/remove/play/undo`, chặn `out_of_range` / `occupied`) | `board.rs`: `Board` (HashMap khóa i64 cùng công thức khóa số với JS) |
| `winLen, lineWin, checkWin, winsIfPlaced` | `win.rs` |
| `runLen, fiveSpots, foursOnLine, threeOnLine, forbiddenAt, runLen2, mayForbid, forbidden` | `renju.rs` (`runLen` và `runLen2` giống hệt nhau nên gộp thành một hàm) |
| (không có) | `ffi.rs`: giao diện C cho WebAssembly |

Giữ đúng các điểm tinh tế của bản JS:

- Luật Việt Nam 'vn': 4 quân trống hai đầu là thắng; 5 quân trở lên cần ít nhất một đầu trống; chuỗi bị chặn hai đầu
  không thắng, kể cả 6 quân. Chỉ luật này hỏi hai đầu.
- `checkWin` xét hướng theo đúng thứ tự `DIRS`, nên khi có nhiều đường thắng thì trả về cùng một đường với JS. Mảng ô
  cũng theo cùng thứ tự.
- Renju: năm được ưu tiên hơn cấm; quá năm; 4-4 (kể cả hai bốn trên một đường, X_XXX_X); 3-3 thật / giả theo RIF 9.3
  (ô bốn phải hợp lệ, xét đệ quy tới độ sâu 2 như JS); bước lọc nhanh `mayForbid`.
- Khóa số `(x + 2^20)·2^21 + (y + 2^20)`, kể cả chỗ hai ô ngoài khoảng hợp lệ trùng khóa (chú thích H-E1). Toạ độ bên
  trong dùng `i64` nên `x + k·dx` không tràn, giống số thực JS với mọi toạ độ i32.

Khác biệt có chủ ý, chỉ ở giao diện C: quân phải là 1 hoặc 2. Với quân 0, bản JS `checkWin` lặp vô hạn; giao diện C
từ chối luôn.

## 2. Dựng và kiểm thử

```bash
rustup target add wasm32-unknown-unknown         # một lần
cd core/caro-rules
cargo test                                       # 25 bài thử: tests/win.rs, tests/renju.rs, tests/ffi.rs
bash build-wasm.sh                               # ra js/caro_rules.wasm (opt-level "s", LTO, strip, panic=abort)
node diff/diff.js                                # đối chiếu JS ↔ Rust, phải 0 sai khác (~40 s)
node diff/bench.js                               # đo nhanh JS ↔ WASM
```

CI: `.github/workflows/rust-rules.yml` chạy khi đổi `core/**`, `caro/rules.js`, `caro/puzzles.json` hoặc
`server/scripts/openings.json`. Các bước: `dtolnay/rust-toolchain@stable` + đích wasm32, `cargo fmt --check`,
`clippy -D warnings`, `cargo test`, dựng wasm, `diff.js`, rồi `bench.js` (chỉ để xem số).

Nạp từ JS (`core/caro-rules/js/rules-wasm.js`, chạy cả Node lẫn trình duyệt):

```js
const R = await CaroRulesWasm.load('caro_rules.wasm');  // Node: require(...).load() đọc file cạnh loader,
                                                         // chưa dựng thì đọc server/vendor/caro_rules.wasm
const R2 = require('./core/caro-rules/js/rules-wasm.js').loadSync();  // Node: nạp đồng bộ
const b = new R.Board('renju');
b.play(0, 0, R.X);
R.checkWin(b, 0, 0, R.X); R.winsIfPlaced(b, 1, 1, R.O); R.forbidden(b, 2, 2, R.X);
b.free();                                                // bàn nằm trong bộ nhớ WASM; có FinalizationRegistry dự phòng
R.checkWinMoves('vn', [[0, 0], [5, 5], [1, 0]]);         // kiểu không trạng thái: dãy (x,y), X đi trước
```

Tên API giống `rules.js`: `EMPTY, X, O, DIRS, RULES, ruleOf, key, other, Board, lineWin, checkWin, winsIfPlaced,
forbidden, winLen`. Giao diện C trao dữ liệu qua một vùng đệm i32 cố định trong bộ nhớ tuyến tính. File .wasm không
cần import gì. Loader tự tạo lại view khi bộ nhớ WASM lớn lên. Đã thử nhánh trình duyệt (`fetch` +
`instantiateStreaming`, cả khi máy chủ trả sai MIME) qua máy chủ HTTP cục bộ trên Node, chưa thử trong trình duyệt thật.

## 3. Kết quả đối chiếu (bài thử chính)

`core/caro-rules/diff/diff.js` giữ hai bàn (JS và WASM) giống hệt nhau. Ở mỗi thế, script so:

- `checkWin` của nước vừa đánh: người thắng và đúng từng ô của chuỗi.
- `winsIfPlaced` cho X và O ở mọi ô trống trong bán kính 2 quanh nước vừa đánh.
- Cờ cấm Renju cho X ở **mọi** ô trống cách bất kỳ quân nào tối đa 2 ô. Với O, và với ba luật còn lại, script kiểm các
  ô quanh nước vừa đánh; kết quả phải cùng là null.
- Lỗi của `play` (thử cố ý nước trùng ô và nước ngoài khoảng), `undo`, danh sách `moves`, và bàn còn nguyên sau các
  phép đặt thử.
- Các hàm nhỏ: `ruleOf` (chuỗi lạ, chữ hoa, tiếng Việt, tiếng Trung, không phải chuỗi), `key` (cả biên i32), `winLen`
  (mọi luật × quân × độ dài 1–9 × hai đầu).

Nguồn thế cờ:

- 363 bài đố `caro/puzzles.json`, chạy với cả 4 luật; 384 khai cuộc `server/scripts/openings.json`, mỗi khai cuộc
  chạy với luật của nó.
- 26 thế đặt tay chép từ `caro/tests/rules.test.js`, chạy với cả 4 luật. Trong `caro/tests` và `server/test` không có
  file ván ghi sẵn (fixture) riêng.
- Ván ngẫu nhiên có hạt giống (mulberry32). Mỗi ván dài 6–120 nước, gồm nối dài đường, đánh gần quân mình và đánh gần
  quân bất kỳ. Một nửa số ván dừng khi có người thắng, nửa kia đánh tiếp để có quá năm và chuỗi bị chặn hai đầu.
  Khoảng 20 % ván bắt đầu sát mép khoảng hợp lệ ±2^20 hoặc ở vị trí ngẫu nhiên.
- 1 500 "đám quân" dày đặc ngẫu nhiên mỗi luật, đặt bằng `put`, để có nhiều thế cấm Renju.

Kết quả với `node core/caro-rules/diff/diff.js` (hạt giống mặc định 20261119):

| Luật | Thế | checkWin | Thắng | winsIfPlaced | forbidden | Cấm quá năm / 4-4 / 3-3 | Sai khác |
|---|---:|---:|---:|---:|---:|---|---:|
| vn | 26 231 | 74 484 | 10 973 | 1 218 502 | 1 218 502 | – | **0** |
| free | 26 266 | 72 977 | 5 730 | 1 209 744 | 1 209 744 | – | **0** |
| std | 26 296 | 72 561 | 3 674 | 1 212 620 | 1 212 620 | – | **0** |
| renju | 26 211 | 73 298 | 3 898 | 1 214 942 | 2 873 310 | 26 945 / 15 394 / 11 588 | **0** |
| **Tổng** | **105 004** | 293 320 | 24 275 | 4 855 808 | 6 514 176 | 53 927 nước cấm | **0** |

Chạy thêm các hạt giống 1, 2, 3 (mỗi lần khoảng 105 000 thế): cũng **0 sai khác**. Một lượt mất khoảng 37 s trên
máy dựng (Xeon 2,1 GHz, Node 22).

**Bài thử có bắt được lỗi thật không?** Đã cố ý cài 6 lỗi vào bản Rust, rồi chạy `diff.js --positions=2000`:

| Lỗi cài vào | Kết quả |
|---|---|
| vn: chuỗi 5 bị chặn hai đầu vẫn thắng | bắt được, 314 sai khác |
| Renju: độ sâu đệ quy 1 thay vì 2 | bắt được, 62 sai khác |
| Renju: nhận sai "bốn thẳng" | bắt được, 9 565 sai khác |
| Đổi thứ tự `DIRS` | bắt được, 347 sai khác (chọn sai đường thắng) |
| std: ≥ 5 thay vì đúng 5 | bắt được, 3 721 sai khác |
| `mayForbid`: `n >= 3` thành `n >= 4` | không đổi kết quả |

Lỗi cuối cùng không làm đổi kết quả vì nhánh `n >= 3` chỉ là đường tắt. Một hướng có 3 quân đen gần mà các hướng khác
có ít hơn 2 thì không thể tạo hai bốn hay hai ba, nên nhánh đó không ảnh hưởng kết quả cuối. Phần soát bước lọc dưới
đây cũng xác nhận điều này.

**Soát `rules.js` (phụ):** bản Rust có thêm `forbiddenAt` không qua bước lọc nhanh. Script so nó với kết quả có lọc ở
607 471 ô Renju và không thấy ô cấm nào bị `mayForbid` bỏ sót. **Không tìm thấy lỗi nào trong `rules.js`.**

## 4. Kích thước WASM

`opt-level = "s"`, `lto = true`, `codegen-units = 1`, `panic = "abort"`, `strip = true`, rustc 1.97.0:
**41 748 byte** (gzip -9: **16 256 byte**). Phần lớn là HashMap của std và bộ cấp phát. Chưa chạy `wasm-opt` (máy dựng
không có). So sánh: `rules.js` khoảng 10 KB chưa nén.

## 5. Đo tốc độ (`node core/caro-rules/diff/bench.js`)

Cùng 600 thế: 150 ván ngẫu nhiên mỗi luật, lấy thế cuối, trung bình 44 nước. 26 465 truy vấn `checkWin`, 16 116 truy
vấn `forbidden` (Renju). Số là trung vị 7 lượt, hai lần chạy, Node 22, Xeon 2,1 GHz.

| Phép | ns / lần gọi |
|---|---:|
| Gọi một export rỗng (một lần vượt ranh giới JS ↔ WASM) | 3,3–3,6 |
| `checkWin` JS (`rules.js`) | 592–614 |
| `checkWin` WASM qua lớp bọc (tạo mảng ô như JS) | 292–322 |
| `checkWin` WASM gọi thẳng export | 259–272 |
| `checkWin` WASM lặp ngay trong WASM (bộ nhớ đệm nóng, gần như chỉ còn phần tính) | 84–88 |
| `forbidden` JS, mọi ô trống gần quân | 10 908–10 937 |
| `forbidden` WASM qua lớp bọc | 2 754–2 974 |
| `forbidden` JS, chỉ các ô qua được bước lọc (3 632 ô, phần nặng) | 40 442–43 355 |
| `forbidden` WASM, cùng các ô đó | 9 481–10 851 |
| Không trạng thái: JS dựng lại bàn + `checkWin` | 5 492–6 915 |
| Không trạng thái: WASM `checkWinMoves` (chép dãy nước + dựng bàn) | 2 934–4 270 |

Nhận xét thẳng:

- Gọi một hàm qua ranh giới rất rẻ (khoảng 3,5 ns). Lớp bọc tốn thêm khoảng 30–50 ns, vì phải dựng mảng ô và tra số
  hiệu bàn. Chi phí ranh giới không ăn hết phần lợi.
- Bản WASM nhanh hơn khoảng **2 lần ở `checkWin`** và **3,7–4 lần ở `forbidden`**. Lý do chính: `Map` của JS với khóa
  số thực lớn hơn 2^31 khá chậm, còn bản Rust dùng HashMap khóa i64 với hàm băm viết tay.
- Về độ lớn tuyệt đối, `checkWin` chỉ chạy một lần mỗi nước, mất 0,6 µs, người chơi không thấy khác biệt. `forbidden`
  có ý nghĩa hơn: khi tô ô cấm trên cả bàn hoặc khi AI Renju sinh nước (khoảng 300 ô mỗi thế), JS mất khoảng 3,3 ms
  còn WASM khoảng 0,9 ms. Nhưng engine đã có bản cài nước cấm riêng (`caro/engine-renju.js`), nên lợi này chỉ đến nếu
  engine cũng chuyển sang dùng crate.
- Phép đo "lặp trong WASM" lặp lại cùng một thế nên bộ nhớ đệm luôn nóng. Đó là cận dưới, không phải số thực tế.

## 6. Đối chiếu điều kiện dừng của lộ trình

| Điều kiện dừng (bước 5) | Kết quả | Đánh giá |
|---|---|---|
| Không đạt 0 sai khác trong khung thời gian | 0 sai khác trên khoảng 105 000 thế × 4 hạt giống; 5/6 lỗi cài vào bị bắt | **Đạt** |
| Chi phí ranh giới nuốt hết lợi | Ranh giới khoảng 3,5 ns mỗi lần gọi; WASM vẫn nhanh hơn 2–4 lần kể cả lớp bọc | **Đạt**, nhưng lợi về tốc độ chưa ai cảm nhận được. Chi phí thật nằm chỗ khác: nạp không đồng bộ (`await load()`) trong khi `rules.js` đang được gọi đồng bộ ở rất nhiều nơi, thêm 16 KB gzip, và phải tự `free()` bàn |
| Vòng sửa-biên dịch-kiểm thử chậm hơn khoảng 3 lần | Sửa một file Rust: `cargo test` 0,4 s (dựng sạch 1,1 s), dựng wasm 0,6 s. JS: `node caro/tests/rules.test.js` 1,4 s (có cả bài thử AI). Riêng `diff.js` đầy đủ mất 37 s, nhưng đó là bước của CI, ở máy thì chạy `--positions=4000` | **Đạt**: không chậm hơn đáng kể |
| Cần WASM threads mà Zalo/Messenger không có | Không cần: luật chơi chạy một luồng, file .wasm không import gì, không dùng bộ nhớ chia sẻ hay atomics, chạy được trên mọi engine WebAssembly 1.0 | **Đạt** (chưa thử trên Zalo/Messenger thật) |

## 7. Khuyến nghị

**Đi tiếp, nhưng hẹp: chạy bóng ở máy chủ trước, chưa thay `rules.js` ở trình duyệt.**

1. Bước tiếp theo nên làm (**đã làm 20/11/2026, mục 8**): chạy bóng (shadow) ở máy chủ. `server/src/room.js` / `room-clock.js` đã dùng `rules.js` để
   xác nhận thắng. Có thể nạp cùng file `.wasm` trong Node (không cần napi-rs, `diff.js` đã chạy được như vậy). Mỗi nước
   chạy cả hai bản, chỉ ghi log khi khác nhau, kết quả vẫn lấy từ JS. Chạy vài tuần trên ván thật. Nếu vẫn 0 sai khác
   thì đó là bằng chứng mạnh hơn cả bài thử ngẫu nhiên. Việc này cỡ 1–2 ngày.
2. Lợi thật của crate là **một nguồn luật duy nhất**. Hiện có ít nhất hai bản cài nước cấm: `rules.js` và
   `engine-renju.js`. Nếu sau này có thêm nơi dùng luật (ứng dụng desktop Tauri ở bước 4, công cụ dựng sách khai cuộc,
   bot), crate tránh được việc ba bản lệch nhau. Không có nhu cầu đó thì tốc độ một mình không đủ để thay.
3. Chưa nên thay `rules.js` ở trình duyệt. Muốn thay thì phải đổi mọi chỗ gọi sang chờ nạp WASM, quản lý vòng đời bàn,
   và thêm 16 KB. Đổi lại người chơi không thấy nhanh hơn.
4. Dừng hẳn nếu chạy bóng ở máy chủ phát hiện sai khác mà không sửa được trong khoảng một tuần, hoặc sau bước 4 vẫn
   không có nơi thứ hai cần dùng chung luật.

Chưa làm trong thí điểm này: phần "đọc ký hiệu" (notation) mà lộ trình nhắc tới; bản napi-rs (cần crate ngoài, mà file
`.wasm` đã chạy được trong Node nên chưa cần); `wasm-opt`; thử trên trình duyệt / Zalo / Messenger thật. Việc thử trên
máy thật có thể giao Antigravity theo skill `giao-viec-antigravity`.

## 8. Chạy bóng ở máy chủ (20/11/2026)

Làm khuyến nghị 1 ở mục 7. Máy chủ vẫn quyết định mọi thứ bằng `caro/rules.js`. Bản Rust chỉ tính lại cùng kết quả
rồi so. Khác nhau thì đếm và ghi lại, ván không đổi gì.

### 8.1. Thiết kế

- **File .wasm của máy chủ**: `server/vendor/caro_rules.wasm` (41 748 byte), đã commit. VPS không có Rust, còn
  `core/caro-rules/js/caro_rules.wasm` bị gitignore. Loader (`core/caro-rules/js/rules-wasm.js`) có thêm `loadSync()`
  cho Node. `load()` / `loadSync()` không truyền đường dẫn thì đọc file vừa dựng cạnh loader, chưa dựng thì đọc bản
  trong `server/vendor/`.
- **CI** (`.github/workflows/rust-rules.yml`): ghim rustc **1.97.0**, dựng lại crate rồi `cmp` với
  `server/vendor/caro_rules.wasm`. Khác một byte là đỏ. Bản dựng tái lập được từng byte: hai lần dựng ở hai thư mục
  khác nhau cho cùng sha256 `d9bc714d…5b83c99`. File chỉ chứa đường dẫn tương đối của crate (`src/ffi.rs`) và đường
  dẫn cố định của std (`/rustc/<mã phiên bản>/…`), không có thư mục máy dựng. Vì vậy phải ghim phiên bản rustc: lên
  rustc mới thì đổi số trong workflow, dựng lại, chép file sang `server/vendor/` và commit cùng lúc. Không cần so
  hành vi thay cho so byte, vì `diff.js` chạy trên chính bản vừa dựng, và bản này giống hệt bản đã commit.
- **Chỗ móc** (`server/src/room.js`, `move()`): sau `checkWin` của JS gọi `observe(...)` với nước vừa đặt. Nước bị
  JS từ chối vì cấm Renju cũng được so (lý do `'overline'` / `'44'` / `'33'` phải trùng), trước khi ném
  `forbidden_move`. Mỗi lần so gồm:
  - cờ cấm của bản Rust cho quân vừa đi, tính **trước khi đặt**. Với nước được đặt, JS đã cho qua nên Rust phải trả
    `null`. Ba luật kia luôn `null`;
  - `checkWin` sau khi đặt: cùng có / không thắng, cùng từng ô của chuỗi, đúng thứ tự (như `room.winCells`).
- **Dựng lại bàn mỗi lần** (`server/src/rules-shadow.js`): mỗi lần so tạo một bàn Rust, đặt lại các nước từ
  `board.moves` của JS (có ghi quân từng nước), tính, rồi giải phóng ngay. Không giữ bàn Rust theo phòng, nên đi lại,
  Swap2 (một người đặt cả X lẫn O), tái đấu, ván tiếp của Bo3/Bo5, làm mới phòng đều không cần xử lý riêng, và không rò
  bộ nhớ WASM. Đổi lại, chi phí tăng theo số nước (mục 8.2). Ván thật vẫn rẻ nên không cần giữ bàn theo phòng.
- **An toàn**: `observe` bọc toàn bộ trong `try/catch`. Lỗi (kể cả khi chính hàm log hỏng) chỉ tăng `errors` và ghi
  `lastError`, không ném vào phần xử lý ván. File .wasm được nạp đồng bộ ở nước đầu tiên. Nạp không được (thiếu file,
  file hỏng) thì `state = 'unavailable'`, ghi log đúng một lần, rồi tắt chạy bóng. `CARO_RULES_SHADOW=0` tắt hẳn
  (`state = 'off'`). Mặc định bật.
- **Log**: mỗi chỗ khác nhau ghi `console.error` (lên journald), tối đa 1 dòng mỗi 10 giây. Dòng sau ghi thêm số lần
  đã bỏ qua: "(+N lần chưa báo)".

### 8.2. Chi phí đo được

Đo trên máy dựng (Xeon 2,1 GHz, Node 22). Thời gian là thời gian của một lần `observe`: dựng bàn, tính, so.

| Số nước trên bàn | vn: p50 / p95 (µs) | renju: p50 / p95 (µs) |
|---:|---:|---:|
| 20 | 3,9 / 7,6 (lần đo đầu, còn khởi động JIT) | 1,4 / 1,6 |
| 40 | 4,6 / 9,7 | 2,3 / 2,4 |
| 80 | 4,8 / 6,4 | 4,0 / 4,7 |
| 200 | 9,4 / 13,9 | 8,7 / 9,8 |
| 500 | 23 / 41 | 23 / 30 |
| 1 000 | 46 / 61 | 46 / 70 |
| 2 000 (trần `MAX_MOVES`) | 94 / 125 | 93 / 120 |

- Một ván thật dài 30–80 nước, nên mỗi nước tốn khoảng **2–5 µs**. Ván dài nhất máy chủ cho phép (2 000 nước) tốn
  khoảng 0,1 ms. Cả hai đều **dưới 1 ms rất xa**. Dựng lại bàn tốn khoảng 0,045 µs mỗi nước có sẵn.
- 300 ván ngẫu nhiên mỗi luật đi qua `Room.move` thật (238 036 nước, trung bình 115–230 nước mỗi ván vì đánh ngẫu
  nhiên): trung bình 4,8 µs (vn), 8,1 µs (free), 8,2 µs (std), 9,7 µs (renju) mỗi nước. Đã có 207 nước cấm bị từ chối
  và 812 nước thắng. **0 sai khác, 0 lỗi.** Cả `Room.move` (kèm chạy bóng) mất 6–14 µs mỗi nước, so với 0,8–4,2 µs
  khi tắt. `maxMicros` có lúc lên 1–5 ms. Đó là lúc V8 dọn rác hoặc tối ưu lại mã, không phải phần tính.
- Đo lại: chạy `observe` trên bàn có N nước, lặp 500 lần, lấy trung vị (script đo không đưa vào repo).

### 8.3. Đọc số đo

`GET /api/rum` có thêm mục `rulesShadow`. Số được giữ 10 giây như phần còn lại và mất khi khởi động lại máy chủ:

```json
"rulesShadow": { "enabled": true, "state": "on", "checked": 1234, "rejected": 3, "wins": 41, "mismatches": 0,
  "errors": 0, "avgMicros": 3.1, "maxMicros": 820.4, "since": 1763600000000, "lastError": null, "recent": [] }
```

- `state`: `on` (đang chạy), `idle` (bật nhưng chưa có nước nào nên chưa nạp WASM), `off` (`CARO_RULES_SHADOW=0`),
  `unavailable` (nạp WASM hỏng, lý do ở `lastError`, log máy chủ có một dòng `[rules-shadow] không nạp được…`).
- `checked`: số lần đã so. `rejected` là số nước JS từ chối vì cấm. `wins` là số nước thắng, đã so cả chuỗi ô.
- `mismatches`: số lần JS và Rust khác nhau. Phải luôn là **0**.
- `errors`: số lần đường chạy bóng tự lỗi (ví dụ dựng lại bàn không được). Cũng phải là 0. Khác 0 thì xem `lastError`.
- `avgMicros` / `maxMicros`: thời gian trung bình / lớn nhất mỗi lần so.
- `recent`: tối đa 20 chỗ khác nhau gần nhất. Mỗi chỗ có `{ at, rule, moves, move, side, applied, js, rust }`.
  `moves` là các nước **trước** nước đang xét, dạng `[x, y]`, X đi trước, xen kẽ. `js` / `rust` là
  `{ forbidden, cells }`. Không có tên hay id người chơi. Muốn tái hiện thì nạp `moves` vào `caro/rules.js` và
  `rules-wasm.js` rồi gọi cùng hàm.
- Số đếm mất khi khởi động lại. Muốn theo dõi một tuần thì chụp `curl -s https://<máy chủ>/api/rum | jq .rulesShadow`
  mỗi ngày (trước mỗi lần cập nhật / khởi động lại), rồi cộng dồn. Nếu có chỗ khác nhau thì đọc thêm dòng
  `[rules-shadow]` trong `journalctl -u caro`.

### 8.4. Kết quả nào đủ để đi bước tiếp

- **Đủ**: chạy liên tục ít nhất **7 ngày** trên máy chủ thật, cộng dồn **≥ 20 000 nước** đã so, trong đó **≥ 1 000
  nước Renju** và **≥ 500 nước thắng**, đủ cả 4 luật, có ván Swap2 và ván có đi lại. Kèm theo `mismatches = 0` và
  `errors = 0` suốt thời gian đó. Ván ngẫu nhiên của `diff.js` đã phủ phần luật, nên số nước ván thật chủ yếu để thấy
  các tình huống người thật tạo ra (đi lại, Swap2, ván rất dài, toạ độ xa).
  Nếu lượng ván thật ít hơn mức này thì kéo dài thời gian chạy, không hạ ngưỡng.
- **Bước tiếp khi đủ**: cho một nơi thứ hai dùng crate (ứng dụng desktop Tauri ở bước 4, hoặc công cụ sách khai
  cuộc), hoặc cho máy chủ dùng kết quả Rust làm bản quyết định và giữ JS chạy bóng ngược lại một thời gian. Vẫn chưa
  thay `rules.js` ở trình duyệt (lý do ở mục 7).
- **Dừng / sửa**: có dù chỉ một chỗ khác nhau. Lấy chỗ đó trong `recent`, thêm vào `core/caro-rules/diff/fixtures.js`
  làm thế cố định, sửa bản sai (Rust, hoặc `rules.js` nếu JS sai), rồi chạy lại từ đầu. Sai khác không sửa được trong
  khoảng một tuần thì dừng hướng này (khuyến nghị 4).
- **Bài thử** (`server/test/rules-shadow.test.js`): ván thật qua máy chủ và client WebSocket ở cả 4 luật, có đi lại,
  tái đấu, Swap2 và nước 3-3 bị từ chối, phải 0 sai khác và `checked > 0`. Bộ tính giả trả kết quả sai thì sai khác
  được đếm và ghi lại, kết quả ván vẫn theo JS. Bộ tính ném lỗi thì lỗi được đếm. Thiếu file .wasm thì tự tắt, log một
  lần. `CARO_RULES_SHADOW=0` tắt hẳn.
