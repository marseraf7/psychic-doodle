# Rapfi-CARO: thêm luật Việt Nam (chặn hai đầu) vào Rapfi

`caro/rapfi/build/rapfi-caro.patch` (đi kèm app cùng gói nguồn Rapfi) – bản vá trên Rapfi commit `3c94c2a` (GPL-3, như Rapfi; mã gốc: `caro/rapfi/build/rapfi-src-3c94c2a.tar.gz`).
Thêm luật `CARO` (giao thức Gomocup: `INFO rule 8`) đúng luật Việt Nam của game (`caro/rules.js`, luật `vn`):

- **Thắng**: ≥ 5 quân liền có ít nhất một đầu trống, hoặc 4 quân liền trống **cả hai** đầu. Năm quân bị chặn hai đầu: không thắng.
- Nhận dạng mẫu hình (`game/pattern.cpp`): cửa sổ 11 ô; phân loại **có tính phòng thủ** – một đường có nhiều ô thắng
  nhưng một quân chặn diệt được hết (vd. ba mở `__XXX__`: chặn một đầu là hết) chỉ là "bốn thường" (B4/B4S), "bốn mở"
  (F4, không chặn nổi) chỉ khi không quân chặn nào diệt hết.
- Bảng "ô diệt ô thắng" (`FIVEKILLCaro`) + `generateCaroFiveDefence` (`game/movegen.cpp`): chặn ô thắng của đối thủ được ở
  chính ô đó **hoặc** ô đầu bên kia; nhiều ô thắng thì lấy giao. Dùng ở bộ chọn nước, kiểm thắng nhanh, VCF phòng thủ.
- Tìm kiếm: VCF phòng thủ thử mọi cách chặn (nước chặn đồng thời tạo đe doạ của mình thử trước); giới hạn 6 nước công
  trong VCF (cây nổ vì nhiều cách chặn); tắt các phép tỉa / nhận định "chỉ một nước chặn" của Gomoku. Gomoku cộng thêm
  độ sâu (+1,3) cho nước chặn "năm" vì chỉ có một cách chặn – ở caro thường có 2–3 cách nên chỉ cộng khi chặn duy nhất
  (`CARO_MULTI_DEFENCE_EXT`), không thì cây nổ: độ sâu 1 giây tăng từ 7–9 lên 14–21. Đối thủ có ô "bốn mở" (B_FLEX4):
  chỉ xét các nước làm ô đó hết là bốn mở (`generateCaroFourDefence`, thử bằng cách đặt quân) cùng các nước tạo bốn;
  đối thủ đe doạ B4+F3 thì xét mọi nước.
- Đánh giá cổ điển: khe bảng thứ 5 (`CARO_SLOT`), mặc định chép bảng luật tự do; `caro_binary_file` trong `[model]`
  nạp bảng học riêng cho caro. Tuner (`tuning -r caro`) học khe này, xuất ra file có bảng caro ở khe tự do. Dữ liệu
  `.binpack` ghi luật caro = 7 (trường 3 bit). Tự đấu: `selfplay --rule caro`. MCTS không hỗ trợ caro.

## Dựng và kiểm

```bash
mkdir rapfi-src && tar xzf caro/rapfi/build/rapfi-src-3c94c2a.tar.gz -C rapfi-src --strip-components=1
cd rapfi-src && patch -p1 < ../caro/rapfi/build/rapfi-caro.patch
cd Rapfi && cmake --preset x64-clang-AVX2 && cmake --build build/x64-clang-AVX2 -j4
# thư mục chạy: pbrain-rapfi + config.toml (chỉ mô hình cổ điển model210901.bin, không mạng NNUE)
RAPFI_DIR=<thư mục chạy> node server/scripts/rapfi/caro/caro-diff.js 1500 11
```

Kết quả kiểm (10/2026): 245.048 lần so ô thắng ngay trên 1.500 thế ngẫu nhiên (3.438 ô thắng thật) – **0 sai khác** với
`rules.js`; 992 thế phải chặn / có nước thắng – 0 lần bỏ lỡ thắng, 0 lần chặn sai.

## Sức mạnh

Bản đầu (độ sâu 7–9 trong 1 giây) **thua** engine của game: 2/7 ván (bảng của luật tự do), 1/16 (bảng học từ 1.000 ván
tự đấu). Sau khi sửa độ sâu (ở trên) – Rapfi-CARO 1 giây vs engine của game 3 giây, bàn vô hạn như trong app
(`boat-match.js vn`, `CHECK=0`), theo bảng đánh giá:

| Bảng | Dữ liệu tự đấu | Kết quả |
|---|---|---|
| mượn của luật tự do | – | 17/32 (53%) |
| c1 | 1.000 ván của bản cũ (nông) | 75/112 (67%) |
| c2 | 2.000 ván của bản cũ | 16/32 (50%) |
| c3 | 1.000 ván của bản đã sửa độ sâu (ván dài gấp đôi: 45 nửa nước) | 22/32 (69%) |
| **c4 – trong app** | c1 + c3 (2.000 ván) | **47/64 (73%)**; cùng khai cuộc c1 được 41/64 |

Bản WebAssembly của app (`RAPFI=wasm`) 0,6 giây – ≈ BOAT 2,5 giây trên điện thoại – vs engine 3 giây: **25/32 (78%)**
với c4 (c1: 18/32). Thêm engine của game kiểm mọi nước (`CHECK=1`, bảng c1): 23/32 (72%) – không hơn, nên app chỉ kiểm
khi sát mép như 3 luật kia. **Đã dùng cho BOAT và phân tích luật Việt Nam.**

Học bảng đánh giá (`model-caro.bin` trong `caro/rapfi/`):

```bash
pbrain-rapfi selfplay --rule caro -n 250 --boardsize-min 20 --boardsize-max 20 --budget-unit nodes \
  --budget-distribution fixed --budget-value 20000 --seed <hạt giống> -o <thư mục dữ liệu>/<tên>.binpack.lz4
pbrain-rapfi tuning -d <thư mục dữ liệu> -r caro -o <thư mục ra> -n c -e 3000 -i 1000   # → c-e03000.bin
```
