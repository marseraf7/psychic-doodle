# Luyện mạng NNUE luật Việt Nam cho Rapfi-CARO

Mục tiêu: BOAT luật Việt Nam thắng engine của game **trên 90%** (hiện tại, bảng đánh giá cổ điển: ~73–78% – xem
`../README.md`). Ba luật kia mạnh nhờ mạng NNUE "mix9svq" của Rapfi; luật Việt Nam chưa có mạng nào nên phải tự luyện:
Rapfi-CARO tự đấu sinh ván → bộ huấn luyện [pytorch-nnue-trainer](https://github.com/dhbloo/pytorch-nnue-trainer) (của tác
giả Rapfi; tải về khi cài, thêm luật caro bằng `trainer-add-caro.py`) học mạng mix9svq → mạng mới đấu với mạng tốt nhất,
thắng ≥ 57% trong 128 ván (khai cuộc 32–95 của `openings.json`, không có trong dữ liệu tự đấu) thì thay và tự đấu
tiếp bằng mạng mới (càng về sau dữ liệu càng tốt); tốc độ học giảm dần theo vòng. Đã kiểm trọn vòng trên máy 4 lõi: Rapfi-CARO nạp
và chơi được bằng mạng luyện ra.

## Cần gì

- Máy Linux x86-64 chạy liên tục (VPS), Ubuntu 22.04+ / Debian 12+, tài khoản có `sudo`, ~20 GB đĩa trống.
- CPU càng nhiều lõi càng tốt (tự đấu dùng mọi lõi). **GPU NVIDIA giúp phần huấn luyện nhanh ~100 lần** – không có thì
  vẫn chạy được bằng CPU, chỉ chậm hơn.
- Ước tính trên CPU (đo trên máy 4 lõi, cả khâu nạp dữ liệu): tự đấu ~10 ván / phút / lõi (~14.000 ván / lõi / ngày);
  huấn luyện ~15 thế / giây (4 lõi, ~4,5 giây mỗi bước lô 64). Một mạng khá cần vài trăm nghìn ván và vài chục triệu lượt
  thế → **một đến vài tháng trên VPS chỉ có CPU** (tuỳ số lõi), vài ngày nếu có GPU.
- Sau `git pull` chạy lại `setup.sh`: Rapfi-CARO được dựng lại nếu bản vá đổi. Dữ liệu tự đấu không bao giờ bị xoá (vài MB
  mỗi ngày); muốn dọn thì xoá bớt file cũ trong `~/caro-nnue/data`.

## Chạy

```bash
git clone https://github.com/marseraf7/psychic-doodle.git && cd psychic-doodle
git checkout claude/adoring-ritchie-ra610s
bash server/scripts/rapfi/caro/nnue/setup.sh                          # một lần, ~5–15 phút
tmux new -s caro 'bash server/scripts/rapfi/caro/nnue/run.sh'           # chạy liên tục; Ctrl-b d để rời tmux
```

- Xem tiến độ: `tail -f ~/caro-nnue/logs/progress.log` (mỗi vòng một dòng: loss, kết quả đấu với mạng cũ, có thay mạng
  không, và tỉ lệ thắng engine của game sau mỗi lần thay). Quay lại tmux: `tmux attach -t caro`.
- Dừng: tạo file `~/caro-nnue/STOP` (dừng sau vòng đang chạy) hoặc Ctrl-C trong tmux. Chạy lại `run.sh` thì tiếp tục từ
  vòng cuối (dữ liệu, mạng, điểm kiểm tra đều giữ trong `~/caro-nnue`).
- Đổi tham số bằng biến môi trường, vd. `SP_PROCS=6 TRAIN_THREADS=2 bash run.sh` (đầu `run.sh` có danh sách và giá trị
  mặc định theo phần cứng: số tiến trình tự đấu, số nút mỗi nước, số bước mỗi vòng, cỡ lô, ngưỡng thay mạng…).
- VPS khởi động lại: chỉ cần chạy lại lệnh tmux ở trên.

## Gửi mạng về để đưa vào app

Mạng tốt nhất luôn ở `~/caro-nnue/nets/best.bin.lz4` (vài MB). Khi `progress.log` báo tỉ lệ thắng engine của game cao
(mục tiêu > 90%), chép file đó vào repo rồi đẩy lên nhánh, ví dụ:

```bash
mkdir -p server/scripts/rapfi/caro/nnue/nets
cp ~/caro-nnue/nets/best.bin.lz4 server/scripts/rapfi/caro/nnue/nets/caro-nnue-$(date +%Y%m%d).bin.lz4
cp ~/caro-nnue/logs/progress.log server/scripts/rapfi/caro/nnue/nets/
git add server/scripts/rapfi/caro/nnue/nets && git commit -m "Mạng NNUE luật Việt Nam" && git push
```

Sau đó Claude đo lại (bản WebAssembly như trên điện thoại), dựng WASM, cho `rapfi/worker.js` tải mạng ở luật Việt Nam
(như mạng của 3 luật kia) và cập nhật SOURCE / trang Giấy phép. Mạng do mình luyện – phát hành CC0 như `model-caro.bin`.

## Các file

| File | Việc |
|---|---|
| `setup.sh` | Cài gói, dựng Rapfi-CARO bản gốc (`-march=native`), tải + vá bộ huấn luyện, tạo môi trường Python |
| `run.sh` | Vòng luyện liên tục: tự đấu nền, huấn luyện, xuất, đấu chọn mạng, đo với engine của game |
| `trainer-add-caro.py` | Thêm luật caro vào bộ huấn luyện (mã luật 7 trong dữ liệu, bit 8 trong file mạng) |
| `make-config.js` | `config.toml` cho Rapfi-CARO (giống app: `caro/rapfi/worker.js`), có / không mạng NNUE |
| `make-openings.js` | Khai cuộc cho tự đấu: sách luật Việt Nam, ván Gomocup (tuỳ chọn); loại mọi thế trùng `openings.json` (bộ đo) |
| `arena.js` | Đấu hai bản Rapfi-CARO (khai cuộc 32+; 0–31 để dành đo với engine của game) |
