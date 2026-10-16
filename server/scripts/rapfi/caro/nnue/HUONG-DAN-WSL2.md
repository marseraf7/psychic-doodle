# Chạy bộ luyện NNUE trên laptop Windows (WSL2)

Không cần cài lại máy sang Linux: WSL2 chạy Ubuntu ngay trong Windows, `setup.sh` / `run.sh` chạy trong đó như trên Linux
thật. Hướng dẫn này viết cho laptop 2 lõi / 4 luồng (Core m7-6Y75) – máy yếu, nên **dùng để sinh ván (`MODE=gen`)**; phần
học nên chạy trên máy có GPU (xem `HUONG-DAN-TACH-MAY.md`).

## 1. Bật ảo hóa (một lần)

Task Manager → CPU đang ghi "Virtualization: Disabled" → WSL2 chưa chạy được. Khởi động lại vào BIOS / UEFI (cách vào
tuỳ hãng máy, thường giữ F2 / Del / Volume Up lúc bật), tìm mục **Intel Virtualization Technology (VT-x)** → **Enabled**,
lưu và thoát. Mở lại Task Manager: phải thấy "Virtualization: Enabled".

## 2. Cài WSL2 + Ubuntu 22.04

PowerShell **chạy bằng quyền Administrator** (cần Windows 10 bản 2004 trở lên hoặc Windows 11):

```powershell
wsl --install -d Ubuntu-22.04
```

Khởi động lại máy nếu được yêu cầu; lần mở Ubuntu đầu tiên sẽ hỏi tên người dùng và mật khẩu Linux (mật khẩu này chỉ
dùng cho `sudo` trong Ubuntu, không cần trùng mật khẩu Windows).

## 3. Giới hạn tài nguyên của WSL

Tạo file `C:\Users\<tên bạn>\.wslconfig` (Notepad):

```ini
[wsl2]
memory=10GB
processors=4
swap=4GB
```

Rồi trong PowerShell: `wsl --shutdown` và mở lại Ubuntu để áp dụng. (16 GB RAM: 10 GB cho WSL, còn lại cho Windows.)

## 4. Để máy không tự ngủ / tự khởi động lại

- Cắm sạc liên tục. Nếu máy có tuỳ chọn giới hạn pin ~80% thì bật.
- PowerShell (Administrator): `powercfg /change standby-timeout-ac 0` và `powercfg /change hibernate-timeout-ac 0`.
- Control Panel → Power Options → "Choose what closing the lid does" → khi cắm sạc: **Do nothing**.
- Settings → Windows Update → Active hours rộng nhất, hoặc "Pause updates", để Windows không tự khởi động lại giữa đêm.

## 5. Cài bộ luyện (trong cửa sổ Ubuntu)

```bash
sudo apt update && sudo apt install -y git tmux
cd ~                                   # làm trong thư mục home của Ubuntu, KHÔNG làm trong /mnt/c (chậm hơn nhiều)
git clone https://github.com/marseraf7/psychic-doodle.git && cd psychic-doodle
bash server/scripts/rapfi/caro/nnue/setup.sh       # ~10–30 phút trên máy yếu (dựng Rapfi, tải PyTorch)
```

## 6. Đo tốc độ thật trước khi chạy lâu

```bash
SP_PROCS=3 bash server/scripts/rapfi/caro/nnue/bench.sh
```

Lệnh in ra số ván mỗi ngày và số ngày cần cho 1 triệu ván (đổi `TARGET=300000` để tính mục tiêu khác). Chạy lại sau
1–2 giờ khi máy đã nóng: nếu tốc độ tụt nhiều là máy đang giảm xung → hạ `SP_PROCS` xuống 2.

## 7. Chạy liên tục

```bash
tmux new -s caro 'MODE=gen SP_PROCS=3 bash server/scripts/rapfi/caro/nnue/run.sh'
```

- Rời tmux mà vẫn chạy: `Ctrl-b` rồi `d`. Quay lại: `tmux attach -t caro`.
- **Đừng đóng cửa sổ Ubuntu / Windows Terminal** (thu nhỏ thì được): đóng hết cửa sổ, WSL có thể tự tắt và dừng luôn tiến
  trình đang chạy.
- Xem tiến độ: `tail -f ~/caro-nnue/logs/progress.log` (mỗi giờ một dòng số ván đã sinh).
- Dừng: `touch ~/caro-nnue/STOP`. Windows khởi động lại: mở Ubuntu, chạy lại đúng lệnh `tmux new …` ở trên – ván cũ giữ
  nguyên, tự đấu chạy tiếp.
- Đang dùng máy làm việc khác thì tạm hạ: `touch ~/caro-nnue/STOP`, rồi chạy lại với `SP_PROCS=1`.

## 8. Nhiệt độ và độ bền

Máy mỏng chạy đầy tải liên tục sẽ nóng: kê cao cho thoáng gió (đế tản nhiệt nếu có), không đặt trên chăn / đệm, cắm
sạc. Thấy quá nóng hoặc quạt gào liên tục thì giảm `SP_PROCS`. Ít ván hơn mỗi ngày vẫn tốt hơn máy hỏng.

## 9. Lấy dữ liệu ra khỏi WSL

Từ Windows Explorer gõ vào thanh địa chỉ: `\\wsl$\Ubuntu-22.04\home\<tên Linux>\caro-nnue`. Việc gói và gửi dữ liệu sang máy
GPU làm bằng `chuyen.sh` – xem `HUONG-DAN-TACH-MAY.md`.

## Nếu không bật được ảo hóa

Có thể thử WSL1 (`wsl --set-default-version 1` trước khi cài Ubuntu): không cần ảo hóa, đủ để chạy `MODE=gen`. Mình chưa
thử trường hợp này; nếu `setup.sh` hay `bench.sh` báo lỗi, gửi log trong `~/caro-nnue/logs/`.
