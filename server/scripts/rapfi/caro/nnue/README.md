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
bash server/scripts/rapfi/caro/nnue/setup.sh                          # một lần, ~5–15 phút
tmux new -s caro 'bash server/scripts/rapfi/caro/nnue/run.sh'           # chạy liên tục; Ctrl-b d để rời tmux
```

- Xem tiến độ: `tail -f ~/caro-nnue/logs/progress.log` (mỗi vòng một dòng: loss, kết quả đấu với mạng cũ, có thay mạng
  không, và tỉ lệ thắng engine của game sau mỗi lần thay). Quay lại tmux: `tmux attach -t caro`.
- Dừng: tạo file `~/caro-nnue/STOP` (dừng sau vòng đang chạy) hoặc Ctrl-C trong tmux. Chạy lại `run.sh` thì tiếp tục từ
  vòng cuối (dữ liệu, mạng, điểm kiểm tra đều giữ trong `~/caro-nnue`). Máy bị dừng giữa lúc huấn luyện (Spot): vòng
  đó học nốt từ lần lưu tạm cuối (`TEMP_SAVE`, mặc định mỗi 100 bước trên CPU ≈ 10–15 phút), không phải học lại từ đầu.
- Đổi tham số bằng biến môi trường, vd. `SP_PROCS=6 TRAIN_THREADS=2 bash run.sh` (đầu `run.sh` có danh sách và giá trị
  mặc định theo phần cứng: số tiến trình tự đấu, số nút mỗi nước, số bước mỗi vòng, cỡ lô, ngưỡng thay mạng…).
- VPS khởi động lại: chỉ cần chạy lại lệnh tmux ở trên – hoặc cài thành dịch vụ (`install-service.sh`, mục dưới) để máy
  bật lại là tự luyện tiếp.

## Chạy phân tán: repo dữ liệu chung, trợ lý sinh ván, GPU Kaggle

Khâu chậm nhất là **huấn luyện** (CPU ~15 thế / giây trên 4 lõi). Chia việc qua repo dữ liệu private
`marseraf7/caro-nnue-data` (bố cục: đầu `lib.sh`):

| Nơi | Việc | Lệnh |
|---|---|---|
| Trợ lý Muse (mỗi máy 2+ vCPU) | Rapfi-CARO tự đấu bằng mạng tốt nhất, đẩy từng lô 200 ván lên `data/<tên>/` | `WORKER=<tên> bash server/scripts/rapfi/caro/nnue/worker.sh` |
| Máy luyện (Google Cloud, Spot) | Thôi tự đấu, dồn mọi lõi cho huấn luyện trên ván của cả nhóm; đấu chọn mọi mạng ứng viên; đẩy mạng tốt nhất lên `best/` | `DATA_REPO=… bash install-service.sh` |
| Kaggle (GPU miễn phí ~30 giờ / tuần) | Huấn luyện GPU tới 9 giờ mỗi phiên, đẩy mạng ứng viên lên `cand/` | notebook: `kaggle-train.py` |

Mọi mạng (luyện ở máy luyện hay Kaggle) đều qua **cùng một vòng đấu chọn** trên máy luyện (128 ván, ≥ 57%, khai cuộc để
riêng) rồi mới thành mạng tốt nhất; mỗi lần thay thì đo với engine của game.

**Quyền git:** mọi nơi cần đẩy được lên repo dữ liệu. Tạo một *fine-grained personal access token* chỉ cho repo
`caro-nnue-data`, quyền *Contents: Read and write*. Token chỉ đặt tại chỗ (không gửi qua chat, không ghi vào repo):
- máy luyện: `git config --global credential.helper store` rồi `git clone https://github.com/marseraf7/caro-nnue-data.git /tmp/t`
  (nhập tên GitHub + token một lần, git lưu ở `~/.git-credentials`), xoá `/tmp/t`;
- Kaggle: *Add-ons → Secrets*, tên `GITHUB_TOKEN`;
- trợ lý Muse: theo cách trợ lý đó vẫn đẩy commit lên GitHub (quyền ghi repo `caro-nnue-data`).

**Máy luyện** (thay cho lệnh tmux; dừng tmux cũ trước – `tmux kill-session -t caro`):
```bash
cd ~/psychic-doodle && git pull
DATA_REPO=https://github.com/marseraf7/caro-nnue-data.git bash server/scripts/rapfi/caro/nnue/install-service.sh
```
Lần đầu nó đẩy mạng tốt nhất sẵn có lên `best/` để các trợ lý dùng ngay. Khi Kaggle luyện ổn định, có thể để máy luyện
chỉ đấu chọn và tự đấu: thêm `TRAIN=0 SP_PROCS=$(nproc)` vào lệnh cài.

**Trợ lý:** `WORKER=laplace bash server/scripts/rapfi/caro/nnue/worker.sh` (mỗi trợ lý một tên). Máy bị thay giữa chừng
thì chạy lại lệnh; lô dở bị bỏ, lô xong đã ở trên repo. Xem: `tail -f ~/caro-nnue/logs/worker.log`.

**Kaggle:** notebook mới → *Settings*: Accelerator **GPU**, Internet **On**; Secrets `GITHUB_TOKEN`; một ô:
```
!git clone -q --depth 1 https://github.com/marseraf7/psychic-doodle /kaggle/temp/pd
!python /kaggle/temp/pd/server/scripts/rapfi/caro/nnue/kaggle-train.py
```
*Save Version → Save & Run All* (chạy nền, tắt trình duyệt được). Phiên sau muốn học tiếp: *Add Input* → đầu ra của phiên
trước (script tự học tiếp từ điểm kiểm tra cuối). Cuối phiên script tự thu gọn đầu ra (chỉ giữ điểm kiểm tra mới nhất +
mạng vừa xuất, bỏ dữ liệu ván và điểm kiểm tra cũ) để Kaggle lưu Output trong vài phút.

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
| `setup.sh` | Cài gói, dựng Rapfi-CARO bản gốc (`-march=native`), tải + vá bộ huấn luyện, tạo môi trường Python (`--engine-only`: chỉ Rapfi-CARO, cho trợ lý) |
| `run.sh` | Vòng luyện liên tục: tự đấu nền, huấn luyện, xuất, đấu chọn mạng (cả mạng Kaggle), đo với engine của game, đẩy mạng tốt nhất lên repo dữ liệu |
| `install-service.sh` | Cài `run.sh` thành dịch vụ systemd: máy bật lại là tự luyện tiếp |
| `worker.sh` | Trợ lý sinh ván: tự đấu bằng mạng tốt nhất, đẩy từng lô lên repo dữ liệu |
| `kaggle-train.py` | Huấn luyện GPU trên Kaggle, đẩy mạng ứng viên lên repo dữ liệu |
| `lib.sh` | Hàm dùng chung: tự đấu một lô, kiểm Rapfi nạp mạng, đồng bộ repo dữ liệu |
| `make-train-config.py` | `config.yaml` của bộ huấn luyện (mix9svq) – dùng chung cho máy luyện và Kaggle |
| `trainer-add-caro.py` | Thêm luật caro vào bộ huấn luyện (mã luật 7 trong dữ liệu, bit 8 trong file mạng) |
| `make-config.js` | `config.toml` cho Rapfi-CARO (giống app: `caro/rapfi/worker.js`), có / không mạng NNUE |
| `make-openings.js` | Khai cuộc cho tự đấu: sách luật Việt Nam, ván Gomocup (tuỳ chọn); loại mọi thế trùng `openings.json` (bộ đo) |
| `arena.js` | Đấu hai bản Rapfi-CARO (khai cuộc 32+; 0–31 để dành đo với engine của game) |
