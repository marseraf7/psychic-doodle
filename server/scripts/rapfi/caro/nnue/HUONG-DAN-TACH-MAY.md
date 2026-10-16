# Tách việc: laptop sinh ván, máy GPU thuê để học

Tự đấu (sinh ván) chỉ cần CPU và chạy được lâu dài trên laptop; huấn luyện cần GPU mới nhanh (README: ~100 lần). Nên mỗi
việc một máy, chép dữ liệu qua lại bằng `chuyen.sh`. Thuê GPU **theo giờ**, chỉ bật lúc học, học xong thì tắt máy (kiểm
tra trên trang nhà cung cấp là máy đã dừng hẳn – máy thuê còn bật là còn tính tiền).

```
laptop (MODE=gen) ──ván mới (tar)──▶ máy GPU (MODE=train)
        ▲                                   │
        └──────── mạng tốt nhất ◀───────────┘
```

## Máy sinh ván (laptop, xem HUONG-DAN-WSL2.md)

```bash
tmux new -s caro 'MODE=gen SP_PROCS=3 bash server/scripts/rapfi/caro/nnue/run.sh'
```

Khi đã có thêm khoảng 50–100 nghìn ván (xem `logs/progress.log`), gói phần ván mới:

```bash
bash server/scripts/rapfi/caro/nnue/chuyen.sh dong-goi     # → ~/caro-nnue/gui/du-lieu-<giờ>.tar (chỉ ván chưa gửi)
```

Tự đấu vẫn chạy trong lúc gói. File `.tar` chỉ vài chục MB; chép sang máy GPU bằng `scp`, Google Drive… (đừng đưa mật
khẩu hay khoá SSH vào repo / chat).

## Máy học (Ubuntu 22.04, có GPU NVIDIA + driver; ảnh PyTorch / CUDA của nhà cung cấp là tiện nhất)

Lần đầu:

```bash
git clone https://github.com/marseraf7/psychic-doodle.git && cd psychic-doodle
bash server/scripts/rapfi/caro/nnue/setup.sh        # tự nhận GPU, cài PyTorch bản GPU
```

Mỗi đợt:

```bash
bash server/scripts/rapfi/caro/nnue/chuyen.sh nhap du-lieu-XXXX.tar
tmux new -s caro 'MODE=train MAX_ROUNDS=3 bash server/scripts/rapfi/caro/nnue/run.sh'
```

- `MODE=train` không sinh ván; mỗi vòng học tiếp trên dữ liệu đã nhập, xuất mạng, đấu với mạng tốt nhất (128 ván) và
  thay nếu thắng ≥ 57% như bình thường. `MAX_ROUNDS` là **số vòng tính từ đầu** (đã chạy 3 vòng rồi muốn thêm 3 vòng thì
  đặt 6): chạy đủ thì tự dừng.
- Đo thời gian của vòng đầu trong `logs/progress.log`, rồi tính số vòng vừa với số giờ muốn thuê.
- Xong, lấy mạng về và nhớ tắt máy thuê:

```bash
bash server/scripts/rapfi/caro/nnue/chuyen.sh xuat-mang    # → ~/caro-nnue/gui/best.bin.lz4
```

## Đưa mạng mới về laptop

Chép `best.bin.lz4` về laptop rồi:

```bash
bash server/scripts/rapfi/caro/nnue/chuyen.sh nhap-mang best.bin.lz4
```

Tự đấu đang chạy dùng mạng mới từ lô ván sau (không cần dừng). Ván sinh bằng mạng mới tốt hơn, lặp lại vòng này vài lần là
đường đi tới mục tiêu thắng engine của game > 90%.

## Nhịp gợi ý

1. Laptop sinh khoảng 50–100 nghìn ván → gói → thuê GPU học 1–3 vòng → mạng về laptop.
2. Lặp lại; sau mỗi đợt xem dòng "vs engine của game" trong `progress.log`. Khi gần 90% thì dừng, không cần đủ 1 triệu.

## Cách khác: một máy nhiều nhân làm cả hai việc

Thuê máy nhiều nhân theo giờ và chạy `bash run.sh` mặc định (`MODE=all`) như README – đơn giản hơn nhưng không tận dụng
laptop và phần học vẫn chậm nếu máy thuê không có GPU.
