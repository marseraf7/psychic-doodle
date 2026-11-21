# Điều tra mạng NNUE luật Việt Nam (21/11/2026)

Câu hỏi của chủ dự án: vì sao các lần luyện mạng NNUE cho Rapfi-CARO (10/2026) thử nhiều cách mà không ra mạng tốt. Kết
luận ngắn: **lỗi nằm ở dữ liệu và cách chấm, không ở bộ huấn luyện hay ở chỗ khớp luật**. Luật caro, mã luật, cỡ bàn, góc
nhìn kết quả đều khớp từ đầu tới cuối (đã kiểm bằng chạy thật). Nhưng có ba lỗi làm hỏng mọi lần thử:

1. Một phần ván bị **gán nhãn sai**: Rapfi-CARO chưa xong độ sâu 1 thì trả điểm VALUE_NONE, và Rapfi xử thua bên tới lượt.
2. **Ván trùng hàng loạt**: tự đấu với số nút cố định là tất định, nên một khai cuộc chỉ cho ra đúng một ván.
3. **Khai cuộc lệch**: đấu chọn vì vậy chỉ đo được nhiễu, còn dữ liệu chủ yếu dạy "ai đi trước thì thắng".

Thêm vào đó, lượng ván thật sự khác nhau quá ít so với cỡ mạng mix9svq. Tài liệu này **thay cho `docs/nnue-caro-ke-hoach.md`**
(đợt C6, nhánh `worktree-agent-a75127213286eb43e`, commit `bfd09b4`). Mục 6 ghi file nào của C6 nên giữ, file nào nên bỏ.

Chưa luyện mạng mới (máy này không có GPU). **Chưa có số đo nào cho thấy mạng mạnh hơn.** Mọi con số dưới đây là số về dữ
liệu và về cách chấm.

## 1. Lịch sử các lần thử

| Ngày | Cách làm | Kết quả ghi được | Vì sao không thành (theo điều tra này) |
|---|---|---|---|
| 13/10 | Bảng đánh giá cổ điển c1–c8 (`tuning -r caro` trên 1.000–17.000 ván tự đấu, ván engine cũ, ván Gomocup) | c4 thắng engine của game 47/64 (73 %); c5–c8 ngang c4 trong mức nhiễu (±5–6 / 64) | Bảng tuyến tính đã bão hoà. App vẫn dùng c4. |
| 13/10 | Dây chuyền NNUE v1 (`setup.sh` / `run.sh` trên VPS): tự đấu **20.000 nút cố định**, nửa số lô từ sách (~600 thế), nửa từ khai cuộc Rapfi tự sinh; mix9svq học trên CPU; đấu chọn 128 ván / 57 % | Chạy trọn một vòng với tham số thu nhỏ. Không có số sức cờ trong repo. | Lỗi 1–3 có từ đầu. CPU học ~15 thế / giây. |
| 24–25/10 | Luyện phân tán: trợ lý sinh ván → repo `caro-nnue-data`, GPU Kaggle (lô 1024 hết bộ nhớ → 256; sửa KeOps; lưu tạm) | Phiên 9 giờ ra `k-20261025-1822` trên 338 file (~67.600 ván) | Lượng dữ liệu nhỏ, nửa là ván trùng (mục 2.2). |
| 26–27/10 | val_loss + dừng sớm; sửa lỗi chấm val trên GPU | val_loss thấp nhất **0,447 ở bước 5.000** (lô 256 ≈ 1,28 triệu thế, **chưa hết một epoch**), sau đó 0,52–0,54 | Quá khớp trước khi hết một epoch là dấu hiệu dữ liệu lặp lại. |
| 25–27/10 | 9 ứng viên đấu mạng tốt nhất | 50–55,5 %, không ai đạt 57 % → hạ ngưỡng còn 400 ván / 52 %; r8 được nhận ngày 27/10 (dòng log bị mất) | Bộ khai cuộc đấu chọn lệch: 68 % cặp ván không mang thông tin (mục 2.3). |
| 29/10 | NODES 20.000 → 40.000 | – | Không chạm tới gốc vấn đề. Ván ít đi, mà tự đấu vẫn tất định. |
| 21/11 | C6 (agent khác): tự đấu bằng bản WASM 100 ms / nước, `sprt.js` mới | X thắng 49/60 (81,7 %); chưa luyện | Chậm hơn bản gốc, nhãn nông, khai cuộc lệch, trùng `server/scripts/sprt.js` (mục 6). |

Lịch sử lấy từ `git log` của `server/scripts/rapfi/caro/` và commit message (repo shallow, đã `git fetch --deepen`).
`progress.log` của máy luyện và nội dung repo dữ liệu (private) không có ở đây. **Không đọc và không cần token.**

## 2. Nguyên nhân (xếp theo mức nặng, kèm chứng cứ)

Cách đo: dựng Rapfi-CARO bản gốc (`x64-clang-Native`) từ `rapfi-src-3c94c2a.tar.gz` + `rapfi-caro.patch`, tự đấu đúng lệnh
của `lib.sh`, đọc `.binpack` bằng script theo đúng cấu trúc `dataset/packed_binary.py` của bộ huấn luyện (ghim `ed6ff57`),
rồi đối chiếu với `caro/rules.js`.

### 2.1 Nhãn sai vì VALUE_NONE (lỗi của Rapfi-CARO trong lúc tự đấu)

- Ở luật caro, có thế mà tìm kiếm tiêu hết 40.000 nút trước khi xong **độ sâu 1**: tìm đe doạ phòng thủ phải thử mọi cách
  chặn. Log ghi `Depth 0-0 | Eval VAL_NONE | Node 40K`.
- Rapfi gốc (`command/selfplay.cpp`) khi đó có hai việc sai:
  - Kiểm `|điểm| ≥ mate_in(1)`. Vì VALUE_NONE = −30002, ván dừng ngay và bị **xử thua cho bên tới lượt**.
  - Ghi vào dữ liệu nước `rootMoves[0]` chưa sắp xếp, vd. (1,0) hay (5,5) ở góc bàn. Nước vô nghĩa đó thành nhãn
    policy.
- Đo được:
  - 11/340 ván tự đấu thường (3,2 %) kết thúc kiểu này. Ở mỗi ván, nước cuối không có điểm, bên đi nước đó bị xử thua.
  - Thế `l9j9k9j11j10h12m11` lặp lại được 8/8 lần: bản cũ ghi **"X thua" 8/8 ván**. Cùng thế đó, tìm với 160.000 nút ra
    O bị chiếu hết sau 12 nước. Bản đã sửa ghi **"X thắng" 8/8**. Nhãn bị đảo ngược hẳn.
- Tác hại không dừng ở 3 % số ván. Đây là đúng loại thế chiến thuật mà mạng cần học nhất, và nhãn sai lệch về một phía.

### 2.2 Ván trùng: tự đấu số nút cố định là tất định

- `lib.sh` gọi `--budget-distribution fixed`, một luồng, và Rapfi xoá bảng băm trước mỗi ván. Vì vậy cùng một thế khởi
  đầu luôn cho đúng một ván. Đo: 16 ván từ một khai cuộc chỉ ra **4 ván khác nhau**, đúng bằng số phép xoay / lật làm bàn
  20×20 đổi khác.
- Hệ quả: lô từ sách (~600 thế × ≤ 8 phép biến đổi) **cho tối đa ~4.800 ván khác nhau ứng với mỗi mạng tốt nhất**, dù
  chạy bao nhiêu máy, bao nhiêu ngày. Một cửa sổ 3.000 file × 200 ván có ~300.000 ván từ sách, nên **≥ 98 % số ván đó là
  bản sao**.
- val_loss tăng từ trước khi hết một epoch là hệ quả của việc này. File val (chọn theo mã băm tên file) cũng chứa bản sao
  của ván đã học, nên val_loss **đánh giá quá tốt** mức tổng quát hoá thật.
- Sau khi sửa (số nút ngẫu nhiên trong [¾, 5⁄4] × NODES): 200 ván từ **một** khai cuộc ra 196 ván khác nhau. 200 ván từ bộ
  khai cuộc mới: 0 ván trùng.

### 2.3 Khai cuộc lệch: đấu chọn chỉ đo nhiễu, dữ liệu học "đi trước là thắng"

- Ở luật Việt Nam, bên đi trước được lợi rất lớn. Đo bằng bản cũ:
  - Tự đấu từ sách: X thắng 143/200 (71,5 %).
  - Khai cuộc 3–7 quân ngẫu nhiên: Rapfi-CARO nghĩ 100 ms thấy **26 % đã thắng / thua chắc**. Chỉ 13 % có |điểm| ≤ 150.
- Đấu chọn kiểu cũ (`openings.json` 32+ cùng khai cuộc 5 quân ngẫu nhiên), đo bằng bảng c4 với bảng tự do, 120 cặp,
  100 ms:
  - **82/120 cặp (68 %) "chia đôi"**: mỗi bên thắng ván mình cầm X. Các cặp này không nói gì về sức mạnh.
  - X thắng 74 % số ván. Chỉ 38 cặp mang thông tin.
  - Hai bảng cách nhau ~+76 Elo (95 %: 43…111) mà 400 ván vẫn chỉ đủ độ chính xác khoảng ±35 Elo.
- Vì vậy các ứng viên 50–55,5 % ngày 25–27/10 **không phân biệt được với nhiễu**. Mạng được nhận hay bị loại gần như ngẫu
  nhiên.
- Khai cuộc do Rapfi tự sinh (nửa số lô cũ) được cân bằng, nhưng **đặt ở bất kỳ đâu trên bàn**: 21/60 ván (35 %) có quân
  ở hàng sát mép. App chơi bàn vô hạn và đặt thế vào giữa bàn Rapfi. Ở mép bàn Rapfi-CARO coi tường là quân chặn, nên các
  thế đó dạy mạng những điều không có trong app.

### 2.4 Quá ít ván khác nhau so với cỡ mạng

- Rapfi chỉ nạp mix9svq với kích thước cố định (`eval/mix9svqnnue.cpp`: FeatureDim 64, codebook 2 × 65.536 × 64). Mạng
  này không thu nhỏ được.
- Mạng chính thức của Rapfi được luyện trên lượng thế lớn hơn nhiều bậc. Ở đây: ~67.600 ván, khoảng 2,5 triệu thế, nửa
  trong số đó là bản sao.
- Từ sau r8, tự đấu chạy bằng mạng NNUE yếu (~10 ván / phút / lõi). Bảng cổ điển c4 ở cùng 40.000 nút cho **~60 ván /
  phút / lõi** (đo: 60 ván trong 58 giây, 1 lõi) và là nguồn thế hệ 0 tốt hơn.

### 2.5 Đã kiểm và khớp (không phải nguyên nhân)

- Mã luật: dữ liệu ghi `rule = 7`, `boardSize = 20` (mọi ván đã đọc đều vậy).
- Bộ huấn luyện: `Rule.CARO = 7`, chỉ số 3 (`trainer-add-caro.py`). Mạng là `basicns`, không có đầu vào luật. Khi xuất,
  mặt nạ luật bit 8 khớp với `eval/weightloader.h` (bit 8 = CARO). `config.toml` của app và của dây chuyền đều là bàn 20,
  luật 8.
- Góc nhìn kết quả: 654/654 ván thường kết thúc bằng nước có điểm chiếu hết dương của bên được ghi là thắng. Ván kết thúc
  khi còn 1–2 nước là chiếu hết, nên `rules.js` chưa thấy năm quân; nhãn vẫn đúng. Mã hoá nước `x << 5 | y` giống nhau ở
  Rapfi và ở bộ huấn luyện.
- Luật ở `rapfi-caro.patch` (năm quân bị chặn hai đầu không thắng, bốn mở thắng) khớp `rules.js`: 0 sai khác theo
  `caro-diff.js` (10/2026).
- Đấu chọn: đổi bên trong mỗi cặp, hai bên cùng thời gian, cùng bản Rapfi. Sai ở bộ khai cuộc, không ở cách đấu.
- Cảnh báo cho việc dùng điểm làm nhãn phụ: `ScalingFactor` của `model-caro.bin` là **400**, trong khi bộ huấn luyện
  mặc định 200 (mạng NNUE và `model210901.bin` cũng là 200). Vì vậy `VALUE_LAMBDA` (mục 3) đi kèm `WINRATE_SCALE`.

## 3. Đã sửa

| Sửa | File |
|---|---|
| Tự đấu gặp VALUE_NONE thì tìm lại với số nút × 4 (tối đa 3 lần). Vẫn không có điểm thì **bỏ ván**, không xử thua. Bản vá riêng cho bản dựng luyện mạng; app và WASM không đổi. Đo: 9 lần thử lại trên 200 ván, 0 ván nhãn lỗi. | `server/scripts/rapfi/caro/nnue/rapfi-caro-selfplay.patch`, `setup.sh` (áp sau `rapfi-caro.patch`, đưa vào mã băm dựng lại) |
| Số nút mỗi nước ngẫu nhiên trong [¾, 5⁄4] × NODES. Mọi lô dùng bộ khai cuộc cân bằng. Bỏ khai cuộc Rapfi tự sinh (sát mép). | `lib.sh`, `run.sh`, `worker.sh` |
| Bộ khai cuộc cân bằng dựng sẵn (bàn 20×20, khung bao các quân ở giữa bàn): **6.409 thế tự đấu** (sách + 30.000 thế ngẫu nhiên, lọc \|điểm\| ≤ 250, 100 ms) và **406 thế đấu chọn để riêng** (hạt giống khác, \|điểm\| ≤ 150). Không thế nào trùng nhau, kể cả sau xoay / lật, và không trùng `openings.json`. | `openings/selfplay.txt`, `openings/arena.txt`, `make-openings.js` (`RANDOM`, `SEED`, `EXCLUDE`, `NO_BOOK`), `balance-openings.js`, `openings-lib.js` |
| Đấu chọn trên `openings/arena.txt` với SPRT [0, 15] (dùng `server/scripts/sprt.js` có sẵn, theo cặp). Thay mạng khi nhận H1. Log ghi số cặp chia đôi. | `arena.js` (`ARENA_OPENINGS_FILE`, `ARENA_SPRT`), `run.sh`, `install-service.sh` |
| Làm sạch dữ liệu trước khi học: bỏ ván trùng sau xoay / lật (val đặt trước, nên ván trùng với val bị bỏ khỏi tập học), bỏ ván lỗi VALUE_NONE, bỏ ván khác luật / cỡ bàn. Kaggle và máy luyện tự gọi. | `clean-binpack.py` (`--self-test`), `kaggle-train.py` (`CLEAN=1` mặc định), `run.sh` |
| Tuỳ chọn trộn nhãn giá trị với điểm tìm kiếm (`VALUE_LAMBDA`, `WINRATE_SCALE` = 400 cho dữ liệu của bảng cổ điển). Mặc định tắt vì chưa đo. | `make-train-config.py` |
| Bài thử | `server/test/nnue-caro.test.js` |

Đo trước / sau trên cùng máy (bảng cổ điển c4, 40.000 nút):

| | Bản cũ (sách) | Bản cũ (Rapfi tự sinh) | Bản mới (bộ cân bằng, số nút ngẫu nhiên, bản vá) |
|---|---|---|---|
| X thắng | 143/200 (71,5 %) | 26/60 (43 %) | 96/200 (48 %) |
| Ván kết thúc vì VALUE_NONE (nhãn có thể sai) | 6/260 ván của cả hai cột bản cũ (2,3 %; mẫu đầu 5/80) | (gộp ở cột trái) | 0 (9 lần tìm lại) |
| Ván chạm hàng sát mép | 8/200 | 21/60 | 2/200 |
| Ván khác nhau / 200 ván từ **một** khai cuộc | 4 / 16 | – | 196 / 200 |


## 4. Số đo đấu chọn

| Bộ khai cuộc | Cặp | Cặp chia đôi | X thắng | Kết quả c4 với bảng tự do |
|---|---|---|---|---|
| Cũ: `openings.json` 32–95 + 5 quân ngẫu nhiên | 120 | 82 (68 %) | 74 % | 146/240 (61 %), Elo +76 [43, 111] |
| Mới: `openings/arena.txt` (200 thế đầu) | 200 | 100 (50 %) | 63,5 % | 284/400 (71 %), Elo +156 [124, 190] |

Cùng hai bảng, cùng 100 ms / nước. Phần cặp mang thông tin tăng từ 32 % lên 50 %: cùng số ván thì SPRT kết luận nhanh hơn.
Nhưng bộ mới **vẫn còn lệch** (X thắng 63,5 %, một nửa số cặp chia đôi). Muốn tốt hơn nữa thì lọc chặt hơn (cửa sổ < 150,
Rapfi nghĩ lâu hơn 100 ms) – để lần sau. Hai ước lượng Elo khác nhau vì hai bộ khai cuộc khác nhau. Elo đo trên khai cuộc
lệch bị kéo về 0, vì cặp chia đôi luôn tính là hoà.

## 5. Lần chạy tới (giao chủ dự án / Laplace – cần GPU)

1. **Cài lại**: `git pull && bash server/scripts/rapfi/caro/nnue/setup.sh` trên máy luyện. Trợ lý tự cài khi chạy
   `worker.sh`.
2. **Bỏ dữ liệu cũ**:
   - Trong `caro-nnue-data`, chuyển `data/` sang `old/` và xoá `best/` để trợ lý tự đấu bằng bảng cổ điển.
   - Điểm kiểm tra Kaggle cũ học trên dữ liệu hỏng: **không** Add Input.
3. **Thế hệ 0, ≥ 1.000.000 ván** (~38 nước / ván ≈ 38 triệu thế):
   - Lệnh: `WORKER=<tên> bash server/scripts/rapfi/caro/nnue/worker.sh`, hoặc Kaggle CPU
     `WORKER=kaggle-cpuN python …/cloud-selfplay.py`. NODES để mặc định 40.000.
   - Tốc độ đo được: ~60 ván / phút / lõi, tức ~85.000 ván / lõi / ngày. Một máy 4 lõi cần ~3 ngày; 3 notebook Kaggle CPU
     cần ~1–2 ngày.
4. **Huấn luyện** (Kaggle GPU T4, phiên mới): `%env WINDOW=6000` rồi
   `!python /kaggle/temp/pd/server/scripts/rapfi/caro/nnue/kaggle-train.py`. Các giá trị mặc định: lô 256, LR 0.001,
   `CLEAN=1`, lưu và chấm val mỗi 5.000 bước, dừng sớm sau 2 lần val không giảm, tối đa 9 giờ (~45.000 bước ≈ 11,5 triệu
   thế).
   - Ghi lại số ván trước và sau làm sạch, cùng val_loss ở từng điểm kiểm tra.
   - Nếu val_loss vẫn thấp nhất ngay ở 5.000 bước, cần thêm ván. Không phải đổi tham số.
5. **Nghiệm thu**:
   - Máy luyện tự đấu chọn ứng viên `cand/` với mạng tốt nhất. Lần đầu so với bảng cổ điển c4: SPRT H0 = 0, H1 = +15
     Elo, α = β = 0,05, tối đa 400 cặp trên `openings/arena.txt`, 300 ms / nước, cùng bản Rapfi-CARO gốc, 1 luồng.
   - Chỉ khi **nhận H1** mới thay mạng. Sau đó đo `boat-match.js vn` với engine của game (mức c4 hiện tại: 73 %).
   - Báo cáo: W / D / L, LLR, Elo ± 95 %, số cặp chia đôi.
6. **Thế hệ 1**: nhận mạng xong thì trợ lý tự đấu bằng mạng đó, thêm ≥ 1.000.000 ván, rồi luyện tiếp từ điểm kiểm tra tốt
   nhất, LR 0.0003. Thử `VALUE_LAMBDA=0.3` chỉ khi có SPRT so với mạng không dùng nó (dữ liệu của mạng NNUE:
   `WINRATE_SCALE=200`).

## 6. Hợp nhất với đợt C6 (commit `bfd09b4`)

Chỉ giữ một dây chuyền: bản gốc `pbrain-rapfi selfplay` (nhanh hơn WASM – ×1,4 với bảng cổ điển theo `docs/thi-diem-desktop-tauri.md` –, có điểm thật của Rapfi) qua `worker.sh` / `run.sh` /
`kaggle-train.py`.

| File của C6 | Đề xuất | Lý do |
|---|---|---|
| `server/scripts/rapfi/caro/nnue/selfplay-vn.js` | **Bỏ** | Trùng việc với `worker.sh`. Bản WASM chậm hơn bản gốc. Số ms cố định cho nhãn nông. Khai cuộc ngẫu nhiên lệch (C6 tự đo được X thắng 81,7 %). Điểm chiếu hết bị đổi thành ±20.000 (driver), không theo thang của Rapfi. |
| `server/scripts/rapfi/caro/nnue/sprt.js` | **Bỏ** | Trùng `server/scripts/sprt.js`. Bản có sẵn tính theo cặp (pentanomial), có bài thử, và đã được `arena.js` dùng. |
| `server/scripts/rapfi/caro/games-to-binpack.js` (`EVAL=1`) | **Bỏ phần EVAL** | Điểm lấy từ driver (chiếu hết = ±20.000, thang 400 của bảng cổ điển) lệch với ngưỡng chiếu hết 29.000 và thang 200 của bộ huấn luyện. Phần chuyển ván cũ giữ nguyên. |
| `server/test/nnue-tools.test.js` | **Bỏ** | Chỉ thử các phần trên. Bài thử mới: `server/test/nnue-caro.test.js`. |
| `docs/nnue-caro-ke-hoach.md`, đoạn "Công cụ thêm (C6)" trong README nnue | **Bỏ**, thay bằng tài liệu này | Lệnh và ước lượng ở đó dựa trên dây chuyền chưa sửa. |

## 7. Còn chưa chắc

- Chưa luyện thử được ở đây. Trên CPU của máy này mix9svq chậm hơn 9 giây / bước: 15 phút chưa xong 100 bước lô 64. Vì
  vậy chưa kiểm lại lần nữa việc mạng xuất ra nạp được vào Rapfi-CARO. Việc này đã kiểm ở 10/2026 (`run.sh` có
  `net_loads`).
- Không đo được mạng NNUE hiện có (ở repo private, cần token của chủ dự án). Không có số nào nói nó mạnh hay yếu hơn c4.
- Ngoài tự đấu, trong lúc chơi theo thời gian (đấu chọn, app) Rapfi-CARO cũng có thể hết giờ trước khi xong độ sâu 1 và
  trả một nước chưa xếp hạng. Với bảng cổ điển ở 0,1–2,5 giây chưa thấy chuyện này. Với mạng NNUE (chậm hơn ~6 lần) cần
  theo dõi khi đưa vào app.
- Một triệu ván có đủ cho mix9svq không là ước lượng. Dấu hiệu cần theo dõi: val_loss tiếp tục giảm sau 1 epoch.
- Cửa sổ cân bằng 250 / 150 chọn theo phân bố đo được (đánh đổi giữa số thế và độ cân bằng), chưa tối ưu.
