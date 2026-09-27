# PC QuickCheck (v0.1.0, bản Field Test)

Công cụ chẩn đoán nhanh máy Windows 10/11 dành cho kỹ thuật viên và người dùng.
Tool **chỉ đọc dữ liệu**:

- không sửa hệ thống, không format, không repair, không cài hay xóa driver
- không telemetry, không upload: trong mã nguồn không có dòng nào mở kết nối mạng, và có test tự động kiểm tra điều này

## Tính năng

| Mục | Nội dung |
|---|---|
| **Tổng quan máy** | CPU, RAM, mainboard, BIOS, hệ điều hành, uptime, dung lượng trống của các phân vùng, ổ vật lý, VGA, độ chai pin, nhiệt độ ACPI, Secure Boot |
| **Ổ cứng / SSD / NVMe** | SMART của SATA (qua smartctl, hoặc WMI khi không có smartctl), NVMe Health Log (Critical Warning, Media Errors, Percentage Used, Spare, số TB đã ghi), bộ đếm lỗi của Windows, lỗi trong Event Log (7/51/129/153/154, NTFS 55/98), PCIe link của NVMe. Phân biệt SATA HDD / SATA SSD / NVMe / USB |
| **RAM** | Dung lượng, số khe, loại DDR, tốc độ SPD và tốc độ đang chạy, XMP/DOCP/EXPO (đang bật, hoặc hỗ trợ nhưng chưa bật), dual channel (ước tính), RAM lắp lẫn, ECC/Non-ECC, WHEA bộ nhớ, kết quả Windows Memory Diagnostic, BSOD liên quan RAM |
| **VGA / GPU** | VRAM thật (lấy từ registry, không bị giới hạn 4 GB), driver và tuổi driver, DirectX Feature Level, WDDM, PCIe link (x8/x16), đời GPU, snapshot tải GPU, nvidia-smi (nếu có), TDR 4101, nvlddmkm, LiveKernelEvent 141/117, WHEA PCIe, lỗi Code 43, máy chưa cài driver |
| **Crash / Dump** | Metadata minidump (BugCheck + tham số, thời điểm), **driver nghi vấn** tìm theo địa chỉ trên stack và tham số (đọc cấu trúc triage của minidump 64-bit), Kernel-Power 41, 6008, BugCheck 1001, WER, LiveKernelReports, crash/treo ứng dụng. Cuối mục có phần **Nhận định** chấm điểm nhóm nghi vấn: RAM / VGA / ổ cứng / driver / CPU-ép xung / nguồn |
| **Báo cáo HTML** | Mỗi mục một file riêng, kèm một báo cáo tổng hợp. File HTML tự chứa (không tải gì từ Internet), tự đổi sang giao diện tối |
| **Gói QA / Field Test** | File `.zip` đã **ẩn** tên máy, tên người dùng, serial, `C:\Users\<tên>`, IP, MAC, email, SID, product key. Serial được thay bằng mã giả nhất quán, nên vẫn phân tích lại được bằng `--replay`. Tool không tự gửi file này đi đâu |

## Cách chạy

1. Cài Python 3.8 trở lên (nhớ tick *Add python.exe to PATH*). Tool không cần thư viện ngoài.
2. Nhấp đúp `chay_pc_quickcheck.bat`. File này tự xin quyền Administrator (cần để đọc SMART và file dump), rồi hiện menu.

Chạy bằng dòng lệnh:

```
python -m pc_quickcheck                  # menu
python -m pc_quickcheck --all            # chạy tất cả, xuất HTML vào .\bao_cao_pc\<thời gian>\
python -m pc_quickcheck --only disk,crash --days 60
python -m pc_quickcheck --all --qa-zip --symptom "Xanh màn khi chơi game"
python -m pc_quickcheck --all --no-dxdiag   # bỏ dxdiag để chạy nhanh hơn ~20 giây
```

Phân tích lại gói QA trên máy bất kỳ (kể cả Linux/macOS):

```
python -m pc_quickcheck --replay snapshot.json
python -m pc_quickcheck --demo           # dữ liệu mẫu của một máy lỗi giả lập
```

**Nên có smartctl.** Tải [smartmontools](https://www.smartmontools.org/) rồi cài, hoặc chép `smartctl.exe` vào thư mục `bin\` cạnh tool. Có smartctl thì đọc được NVMe Health Log đầy đủ và ổ gắn qua box USB. Không có thì tool dùng WMI và bộ đếm của Windows.

## Cơ chế bảo đảm chỉ đọc

- Mọi script PowerShell đều đi qua `safety.check_ps`. Hàm này chỉ cho phép các động từ `Get / Select / Where / ForEach / Sort / Measure / Group / ConvertTo / Test`, và chặn chuyển hướng ghi file (`>`), `Invoke-*`, `iex`, cùng các phương thức `.Delete() / .Format() / .Terminate()` và tương tự.
- Chương trình ngoài chỉ được chạy theo danh sách cho phép, có kiểm tra tham số:
  - `smartctl`: chỉ `--scan-open`, `-x`, `-a`, `-j`, `-d`. **Không** cho `-t` (self-test), `-s`, `-o`, `--set`.
  - `nvidia-smi`: chỉ `--query-gpu`.
  - `dxdiag /t`: chỉ được ghi vào thư mục tạm của tool.
- Tool **không** chạy `chkdsk`, `sfc`, `DISM`, `mdsched`. Nó chỉ đọc kết quả có sẵn và gợi ý để người dùng tự chạy.
- Nếu ai đó thêm vào code một lệnh ghi hoặc sửa hệ thống, bộ lọc sẽ chặn, và có test tự động để phát hiện.

## Giới hạn

- Phân tích dump chỉ dựa trên metadata và heuristic (tương tự BlueScreenView), **không** thay thế được `!analyze -v` của WinDbg.
- Dual channel và XMP chỉ là **ước tính** từ SMBIOS, vì BIOS mỗi hãng ghi tên khe khác nhau.
- Một số bộ đếm hiệu năng (GPU Engine) mang tên đã dịch trên Windows không phải tiếng Anh, nên có thể không đọc được.

## Phát triển

```
python -m unittest discover -s tests     # chạy được trên mọi HĐH
pyinstaller -F -n PCQuickCheck --uac-admin pc_quickcheck/__main__.py   # đóng gói .exe (tùy chọn)
```
