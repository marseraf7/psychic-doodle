# Báo cáo đo tỉ lệ sập WebKit trên máy thật

**Kết luận**: Trên máy thật Windows 10 x64, trình duyệt WebKit hoạt động hoàn toàn ổn định qua 4 kịch bản kiểm thử (bao gồm `localhist.e2e.js` trên desktop/mobile và `diag-terminate.js` ngắt Worker JS / WebAssembly khi đang tính). Không xảy ra bất kỳ lần sập trang (crash) nào (0/10 lần cho tất cả các bài test).

---

### 1. Môi trường kiểm thử
- **Hệ điều hành**: Windows 10 Pro 22H2 (Build 19045.5487, `win32 x64`)
- **Trình duyệt**: Playwright WebKit 1.56.1 (Build v2215)
- **Node.js**: v22.13.1
- **Commit kiểm thử**: `ca7cbb7` (nhánh `claude/webkit-crash`)

---

### 2. Bảng kết quả tổng hợp

| Lệnh kiểm thử | Tham số / Môi trường | Số lần chạy | Số lần sập | Tỉ lệ sập | Thời gian TB / lần | Ghi chú |
|---|---|:---:|:---:|:---:|:---:|---|
| `caro/tests/e2e/localhist.e2e.js` | `E2E_BROWSER=webkit` (desktop) | 10 | 0 | **0%** | ~151.0s | Vượt qua toàn bộ các bước lưu ván, online, đa ngôn ngữ, thiết bị |
| `caro/tests/e2e/localhist.e2e.js` | `E2E_MOBILE=1 E2E_BROWSER=webkit` | 10 | 0 | **0%** | ~147.0s | Giả lập touch / mobile viewport trên WebKit, không lỗi |
| `caro/tests/e2e/diag-terminate.js` | `E2E_BROWSER=webkit KIEU=A N=300` | 10 | 0 | **0%** | ~29.3s | Ngắt `ai-worker.js` (JS engine) 300 lần khi đang tính thế |
| `caro/tests/e2e/diag-terminate.js` | `E2E_BROWSER=webkit KIEU=B N=300` | 10 | 0 | **0%** | ~451.6s | Ngắt `rapfi/worker.js` (WASM Rapfi) 300 lần khi đang tính nước |

---

### 3. Chi tiết kiểm thử và Phân tích
- **Lỗi `localhist.e2e.js` lúc kết thúc ván online**: Không tái hiện được trên Windows x64. Cả 10 lần chạy trên máy tính và 10 lần chạy trên giả lập điện thoại đều vượt qua mọi assert và kết thúc với exit code 0 (`không có lỗi JS`).
- **Lỗi `terminate()` Worker Rapfi WebAssembly**:
  - Trên Linux CI, Claude Code tái hiện được tỉ lệ sập ~1/1500 (`libWPEWebKit` segfault).
  - Trên Windows x64 thật (`WebKitWebProcess.exe`), tiến trình Web Content tăng dần mức sử dụng RAM từ 200 MB lên đỉnh điểm ~1.58 GB RAM trong quá trình liên tục tạo và huỷ 300 Worker WebAssembly (do GC thu hồi sau khi terminate), nhưng tiến trình không bị crash và tiếp tục hoàn thành bình thường.

---
_Thực hiện bởi Antigravity_
