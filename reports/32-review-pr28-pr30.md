# Báo cáo Review chéo PR #28 và PR #30

**Kết luận**: Cả PR #28 và PR #30 của Claude Code đều đạt chất lượng kỹ thuật xuất sắc, không có lỗi chặn (No Blockers) và sẵn sàng tích hợp. PR #28 đưa đầy đủ test ván chờ vào coverage đạt 112/112; PR #30 xử lý dứt điểm nguy cơ sập WebKit khi dừng Rapfi WebAssembly bằng cơ chế `retire()` an toàn.

---

### 1. Bảng tổng hợp Review

| PR | Tiêu đề | Tác giả | Trạng thái | Lỗi chặn 🔴 | Gợi ý 🟡 | Kết luận |
|:---:|---|:---:|:---:|:---:|:---:|:---:|
| **#28** | CI chạy test tái hiện lỗi ván chờ (`local-save.test.js`) | Claude Code | Đã merge | 0 | 1 | **Chấp thuận** (Coverage 96.1% dòng / 88.8% nhánh / 93.4% hàm) |
| **#30** | Rapfi: không `terminate()` Worker đang nghĩ (WebKit/Safari) | Claude Code | Mở | 0 | 1 | **Chấp thuận** (Bảo vệ đa tầng, 30+ assert E2E đạt) |

---

### 2. Chi tiết Review PR #28
- **Mục tiêu**: Bổ sung `caro/tests/local-save.test.js` vào script `coverage` trong `server/package.json`.
- **Kiểm thử thực tế**:
  - `npm run coverage` (Node v22.13.1): 112/112 tests đạt.
  - `local-save.test.js`: 2/2 subtests đạt.
  - Tỉ lệ bao phủ toàn dự án: Line 96.10% (ngưỡng 90%), Branch 88.77% (ngưỡng 80%), Function 93.38% (ngưỡng 85%).
- **Lỗi chặn 🔴**: Không có.
- **Gợi ý 🟡**: Về sau có thể bổ sung mock các trường hợp ngoại lệ của `localStorage` (hết dung lượng, quota exceeded) trong test runner để tăng độ phủ riêng của `local-save.js`.

---

### 3. Chi tiết Review PR #30
- **Mục tiêu**: `caro/boat-rapfi.js` - không gọi `terminate()` Worker Rapfi WebAssembly khi đang bận tính nhằm tránh sập WebKit.
- **Rà soát chuyên sâu**:
  1. *Nguy cơ rò rỉ Worker*: `retire(st)` có chốt chặn cứng 30s (`st.retireTimer = setTimeout(kill, RETIRE_MS)`), đảm bảo Worker chắc chắn bị huỷ dù Wasm có bị treo.
  2. *Biến đếm `busy`*: Được tăng đồng bộ trước Promise và giảm chính xác 1 lần trong cả 2 nhánh (`onMsg` hoặc timeout `timer`). Không thể bị âm hoặc kẹt dương.
  3. *Cách ly thế cờ cũ*: `if (cur !== st) return null;` cùng với kiểm tra `id = ++seq` đảm bảo mọi nước đi cũ trả về muộn đều bị huỷ bỏ, không bao giờ lọt vào ván cờ mới.
- **Kiểm thử E2E**: Chạy `caro/tests/e2e/boat-rapfi.e2e.js` trên Chromium & WebKit: 30+ bài kiểm tra đều đạt 100%.
- **Lỗi chặn 🔴**: Không có.
- **Gợi ý 🟡**: Nên bổ sung `st.worker.addEventListener('error', kill);` trong `retire(st)` để dọn dẹp tức thì nếu Worker phát sinh lỗi runtime thay vì đợi hết 30s.

---
_Thực hiện bởi Antigravity_
