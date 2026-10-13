# Đo sức và học từ Rapfi (chỉ cho người phát triển)

[Rapfi](https://github.com/dhbloo/rapfi) là engine Gomoku / Renju vô địch Gomocup (Alpha-Beta + mạng NNUE "Mix9"). Mã nguồn
GPL-3, trọng số mạng CC0 ([rapfi-networks](https://github.com/dhbloo/rapfi-networks)). Rapfi **không** nằm trong repo hay
app – các script ở đây chỉ chạy nó cục bộ như một chương trình riêng (giao thức Piskvork) để:

- `match.js` – đấu engine của game với Rapfi trên bộ khai cuộc cân bằng (`../openings.json`);
- `selfplay.js` – cho Rapfi tự đấu sinh ván (kèm điểm Rapfi từng thế) để `train-policy.js` / `tune-eval.js` học.

Rapfi hỗ trợ luật tự do, tiêu chuẩn, Renju – **không** có luật Việt Nam (bị chặn hai đầu).

## Dựng Rapfi (Linux, CPU có AVX2)

```bash
git clone --depth 1 https://github.com/dhbloo/rapfi.git && git clone --depth 1 https://github.com/dhbloo/rapfi-networks.git
cd rapfi/Rapfi && cmake --preset x64-clang-AVX2 && cmake --build build/x64-clang-AVX2 -j4
mkdir -p <repo>/server/scripts/rapfi/run
cp build/x64-clang-AVX2/pbrain-rapfi <repo>/server/scripts/rapfi/run/
cp ../../rapfi-networks/config-example/config.toml ../../rapfi-networks/mix9svq/* ../../rapfi-networks/classical/*.bin <repo>/server/scripts/rapfi/run/
```

(Thư mục `run/` bị bỏ qua khi commit. Đặt chỗ khác thì đặt biến `RAPFI_DIR`.)

## Dùng

```bash
# 8 khai cuộc × 2 ván, ta nghĩ 3000 ms / nước (như BOAT), Rapfi 100 ms; chạy 4 mảnh song song rồi cộng
for i in 0 1 2 3; do node server/scripts/rapfi/match.js free 8 3000 100 $i 4 '{"vctDepth":10}' > m$i.out & done; wait
cat m?.out   # mỗi dòng: { k, swap, winner, ourSide, n }

# Rapfi tự đấu 600 ván, 60 ms / nước → dữ liệu học
node server/scripts/rapfi/selfplay.js free 600 60 13 > rapfi-free.jsonl
node server/scripts/train-policy.js free rapfi-free.jsonl
LABEL=ev EVSCALE=150 node server/scripts/tune-eval.js rapfi-free.jsonl free
```

## Lưu ý

- Cho Rapfi ít nhất **40 ms / nước**: thấp hơn (10–30 ms) nó không kịp tìm và trả nước vô nghĩa (đánh tuần tự từ góc bàn).
- Ván hoà (bàn đầy) cuối ván Rapfi cũng đánh lấp chỗ trống – không phải lỗi.

## Kết quả đã đo (10/2026, máy 4 lõi)

BOAT (engine của game, 3 giây / nước) với Rapfi 1 luồng, 16 ván mỗi ô (8 khai cuộc cân bằng × 2 bên):

| Luật | Rapfi 40 ms / nước | Rapfi 100 ms / nước |
|---|---|---|
| Tự do | 19% | 6% |
| Tiêu chuẩn | 38% | 25% |
| Renju | 38% | 19% |

Rapfi chỉ cần ~1/75 thời gian vẫn thắng BOAT – khoảng cách đến từ mạng NNUE và tốc độ C++ / SIMD.

Học hàm đánh giá tuyến tính theo điểm Rapfi (2.400 ván Rapfi tự đấu mỗi luật) khớp điểm Rapfi tốt hơn nhiều (sai số
0,38 → 0,17 luật tự do) nhưng chơi **kém** hơn bản hiện tại (tự do 41%, tiêu chuẩn 33% / 192 ván) – muốn mang được sức của Rapfi vào app cần mạng nơ-ron (NNUE / CNN),
không phải hàm đánh giá tuyến tính. Chính sách nước đi học thêm ván Rapfi cũng không khá hơn (đã bão hoà với bộ đặc trưng).
