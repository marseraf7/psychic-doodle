# Rapfi-CARO: thêm luật Việt Nam (chặn hai đầu) vào Rapfi

`rapfi-caro.patch` – bản vá trên Rapfi commit `3c94c2a` (GPL-3, như Rapfi; mã gốc: `caro/rapfi/build/rapfi-src-3c94c2a.tar.gz`).
Thêm luật `CARO` (giao thức Gomocup: `INFO rule 8`) đúng luật Việt Nam của game (`caro/rules.js`, luật `vn`):

- **Thắng**: ≥ 5 quân liền có ít nhất một đầu trống, hoặc 4 quân liền trống **cả hai** đầu. Năm quân bị chặn hai đầu: không thắng.
- Nhận dạng mẫu hình (`game/pattern.cpp`): cửa sổ 11 ô; phân loại **có tính phòng thủ** – một đường có nhiều ô thắng
  nhưng một quân chặn diệt được hết (vd. ba mở `__XXX__`: chặn một đầu là hết) chỉ là "bốn thường" (B4/B4S), "bốn mở"
  (F4, không chặn nổi) chỉ khi không quân chặn nào diệt hết.
- Bảng "ô diệt ô thắng" (`FIVEKILLCaro`) + `generateCaroFiveDefence` (`game/movegen.cpp`): chặn ô thắng của đối thủ được ở
  chính ô đó **hoặc** ô đầu bên kia; nhiều ô thắng thì lấy giao. Dùng ở bộ chọn nước, kiểm thắng nhanh, VCF phòng thủ.
- Tìm kiếm: VCF phòng thủ thử mọi cách chặn; giới hạn 6 nước công trong VCF (cây nổ vì nhiều cách chặn); tắt các phép tỉa /
  nhận định "chỉ một nước chặn" của Gomoku; thế đối thủ đe doạ "bốn mở" / B4+F3 thì xét mọi nước.
- Đánh giá cổ điển: khe bảng thứ 5 (`CARO_SLOT`), mặc định chép bảng luật tự do; `caro_binary_file` trong `[model]`
  nạp bảng học riêng cho caro. Tuner (`tuning -r caro`) học khe này, xuất ra file có bảng caro ở khe tự do. Dữ liệu
  `.binpack` ghi luật caro = 7 (trường 3 bit). Tự đấu: `selfplay --rule caro`. MCTS không hỗ trợ caro.

## Dựng và kiểm

```bash
mkdir rapfi-src && tar xzf caro/rapfi/build/rapfi-src-3c94c2a.tar.gz -C rapfi-src --strip-components=1
cd rapfi-src && patch -p1 < ../server/scripts/rapfi/caro/rapfi-caro.patch
cd Rapfi && cmake --preset x64-clang-AVX2 && cmake --build build/x64-clang-AVX2 -j4
# thư mục chạy: pbrain-rapfi + config.toml (chỉ mô hình cổ điển model210901.bin, không mạng NNUE)
RAPFI_DIR=<thư mục chạy> node server/scripts/rapfi/caro/caro-diff.js 1500 11
```

Kết quả kiểm (10/2026): 245.048 lần so ô thắng ngay trên 1.500 thế ngẫu nhiên (3.438 ô thắng thật) – **0 sai khác** với
`rules.js`; 992 thế phải chặn / có nước thắng – 0 lần bỏ lỡ thắng, 0 lần chặn sai.

## Sức mạnh (chưa dùng trong app)

Với bảng đánh giá mượn của luật tự do, Rapfi-CARO 1 giây **thua** engine của game 3 giây ở luật Việt Nam (2/7 ván; thêm
engine kiểm chuỗi ép: 2/8): tìm kiếm nhanh nhưng "khẩu vị" thế cờ sai luật. Đang học bảng đánh giá riêng cho caro bằng
Rapfi tự đấu + tuner; chỉ đưa vào app (BOAT / phân tích luật Việt Nam) khi thắng rõ engine của game.
