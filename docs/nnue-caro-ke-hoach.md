# Kế hoạch mạng NNUE cho luật Caro Việt Nam (C6 – 21/11/2026)

Mục tiêu dài hạn: Rapfi-CARO (BOAT luật Việt Nam "chặn hai đầu") có mạng NNUE riêng như ba luật free / std / renju đang dùng
mạng mix9svq của Rapfi. Tài liệu này gom: hiện có gì, việc đã làm trong đợt C6, lệnh chạy chính xác, ước lượng phần cứng /
thời gian, cách đánh giá (SPRT + Elo ± sai số), ai chạy ở đâu. **Chưa có mạng nào được luyện xong; không có số đo nào cho
thấy mạng luyện ra mạnh hơn – mọi con số dưới đây là tốc độ / thống kê dữ liệu, không phải sức cờ.**

## 1. Hiện có (trước C6)

| Phần | Ở đâu | Ghi chú |
|---|---|---|
| Rapfi-CARO (luật vn, bảng đánh giá cổ điển) | `caro/rapfi/rapfi-caro-*.wasm` (app), bản vá + dựng gốc: `server/scripts/rapfi/caro/` | GPL-3, giữ `caro/rapfi/COPYING.txt`, `SOURCE.md` |
| Dây chuyền tự đấu → luyện → đấu chọn | `server/scripts/rapfi/caro/nnue/` (`setup.sh`, `run.sh`, `worker.sh`, `kaggle-train.py`, `arena.js`…) | README cùng thư mục; dùng [pytorch-nnue-trainer](https://github.com/dhbloo/pytorch-nnue-trainer) (tải về khi cài, không chép vào repo) |
| Repo dữ liệu chung (private) | `marseraf7/caro-nnue-data` (`data/`, `best/`, `cand/`) | token chỉ đặt tại máy chạy |
| Mạng CC0 của ba luật kia | ghim commit trong `server/src/csp-nets.js` | tải khi người chơi đấu BOAT, không nằm trong repo |

## 2. Việc làm trong C6 (đều chạy được ngay trong máy này, không cần dựng Rapfi gốc / GPU)

- `server/scripts/rapfi/caro/nnue/selfplay-vn.js` – **(a) sinh dữ liệu**: Rapfi-CARO WebAssembly của app tự đấu luật vn trên bàn
  20×20, khai cuộc 3–5 quân ngẫu nhiên đúng luật (hạt giống cố định), ghi `{"m","w","ev"}` – `ev[i]` là điểm tìm kiếm của
  thế trước nước i (góc nhìn bên tới lượt; ±20000 = thắng / thua chắc).
- `server/scripts/rapfi/caro/games-to-binpack.js` thêm `EVAL=1`: ghi điểm đó vào `.binpack` của Rapfi (PackedMove,
  `isNoEval = 0`, kẹp int16) làm nhãn phụ bên cạnh kết quả ván (luật caro mã 7 trong dữ liệu – như trước).
- `server/scripts/rapfi/caro/nnue/sprt.js` – **(b) đánh giá**: Elo ± khoảng 95 % và SPRT (H0 / H1 / đánh tiếp).
- Kiểm thử: `server/test/nnue-tools.test.js`.

## 3. Số đo trong máy này (4 vCPU, 15 GB RAM, không GPU, không có PyTorch)

Lệnh: 4 tiến trình song song `node selfplay-vn.js 15 100 <hạt giống 11–14>` (100 ms mỗi nước, 1 luồng mỗi tiến trình).

| Đo | Kết quả |
|---|---|
| Tốc độ tự đấu (mỗi tiến trình) | 40–50 ván / phút · 18–20 thế / giây (ván trung bình ~25 nước) |
| Cả máy (4 tiến trình) | ~180 ván / phút ≈ 260.000 ván / ngày ở 100 ms / nước |
| Kết quả 60 ván | **X thắng 49, O thắng 11, hoà 0 (X 81,7 %)** |
| `.binpack` | ~4 byte / thế + 8 byte / ván (60 ván ≈ 6 KB) |

Đọc số: (1) 100 ms / nước là rất nông – dữ liệu nhanh nhưng nhãn kém; dây chuyền chính dùng số nút cố định (README nnue:
~10 ván / phút / lõi với bản gốc). (2) Luật vn lợi thế bên đi trước rất lớn với khai cuộc ngẫu nhiên gần tâm → khi đấu
chọn **bắt buộc đánh cặp đổi bên trên cùng khai cuộc**, và nên lọc khai cuộc cân bằng (|ev| nhỏ sau khai cuộc) cho cả
dữ liệu lẫn đấu chọn. (3) **Không luyện thử mạng ở đây**: không có PyTorch / GPU; README nnue đo huấn luyện CPU ~15 thế /
giây trên 4 lõi – một mạng có ích cần hàng chục triệu thế → nhiều tuần CPU. Một "mạng tí hon" luyện vài phút sẽ gần như
chắc chắn yếu hơn bảng cổ điển, và chưa đo thì không được nói ngược lại.

## 4. Lệnh chạy (máy có GPU – Kaggle / máy của Laplace; hoặc VPS chỉ CPU)

Sinh dữ liệu (máy nào cũng được, nhiều máy cùng lúc, mỗi máy một hạt giống):
```bash
git clone https://github.com/marseraf7/psychic-doodle.git && cd psychic-doodle && (cd server && npm ci)
for s in $(seq 1 $(nproc)); do node server/scripts/rapfi/caro/nnue/selfplay-vn.js 2000 300 $((1000*$(hostname | cksum | cut -c1-4)+s)) > sp-$s.jsonl & done; wait
EVAL=1 node server/scripts/rapfi/caro/games-to-binpack.js data-$(date +%F).bin sp-*.jsonl
```
(Dây chuyền có sẵn dùng bản gốc nhanh hơn + mạng tốt nhất hiện tại: `WORKER=<tên> bash server/scripts/rapfi/caro/nnue/worker.sh`.)

Huấn luyện (GPU): notebook Kaggle, Accelerator GPU, Internet On, Secret `GITHUB_TOKEN` (quyền Contents repo dữ liệu):
```
!git clone -q --depth 1 https://github.com/marseraf7/psychic-doodle /kaggle/temp/pd
!python /kaggle/temp/pd/server/scripts/rapfi/caro/nnue/kaggle-train.py
```
Máy luyện / đấu chọn liên tục: `DATA_REPO=https://github.com/marseraf7/caro-nnue-data.git bash server/scripts/rapfi/caro/nnue/install-service.sh`.

## 5. Ước lượng phần cứng / thời gian

| Việc | CPU (4 lõi) | GPU (Kaggle T4/P100) |
|---|---|---|
| 1 triệu ván tự đấu, số nút như dây chuyền | ~17 ngày (10 ván/phút/lõi) | không dùng GPU |
| 1 triệu ván, 100 ms/nước (WASM, nhãn nông) | ~4 ngày | – |
| Huấn luyện 20 triệu thế | ~15 ngày (15 thế/s) | ~4–8 giờ (≈100× – README nnue) |
| Đấu chọn 400–2000 ván | 1–6 giờ | – |

Gợi ý: tự đấu trên CPU rẻ (VPS / Kaggle CPU / máy Laplace), huấn luyện trên GPU Kaggle (~30 giờ / tuần miễn phí).

## 6. Cách đánh giá (bắt buộc trước khi thay mạng)

1. Bộ khai cuộc để riêng (không có trong dữ liệu luyện), mỗi khai cuộc **2 ván đổi bên**; cùng thời gian / số nút cho hai bên.
2. SPRT: H0 Elo ≤ 0, H1 Elo ≥ 10, α = β = 0,05, tối đa 4000 ván; sau mỗi lô chạy
   `node server/scripts/rapfi/caro/nnue/sprt.js <thắng> <hoà> <thua> 0 10` → "thay mạng" / "bỏ" / "đánh tiếp".
3. Ghi kèm Elo ± 95 % (cùng lệnh in ra). Thay mạng chỉ khi SPRT chấp nhận H1.
4. Sau khi thay: đo thêm với engine của game và với Rapfi-CARO bảng cổ điển (mục tiêu README: BOAT vn thắng > 90 %),
   rồi mới đưa vào app (mạng ghi trong `caro/rapfi/worker.js` + `csp-nets.js`, file mạng không đưa vào repo nếu > 5 MB).

## 7. Giấy phép

Rapfi / Rapfi-CARO: GPL-3 (giữ `COPYING.txt`, `SOURCE.md`, bản vá công khai). pytorch-nnue-trainer: tải từ GitHub khi cài,
không chép mã vào repo – kiểm lại giấy phép của nó trước khi phân phối bản sửa. Mạng của Rapfi cho ba luật kia: CC0.
Mạng vn luyện ra từ dữ liệu tự đấu của chúng ta: quyết định giấy phép khi công bố (đề xuất CC0 như mạng gốc).

## 8. Giao Laplace (máy thật / GPU)

Việc: chạy mục 4 (sinh dữ liệu 2–3 ngày trên máy nhiều lõi, đẩy `.bin` lên repo dữ liệu), một phiên Kaggle GPU, rồi đấu
chọn theo mục 6. Báo cáo: số ván / thế đã sinh, val_loss từng điểm kiểm tra, kết quả SPRT (W / D / L, LLR, Elo ± 95 %),
lệnh + hạt giống đã dùng.
