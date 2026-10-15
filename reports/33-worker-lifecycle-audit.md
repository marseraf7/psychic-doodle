# Báo cáo Audit vòng đời Web Worker trong `caro/`

**Kết luận**: Toàn bộ dự án `caro/` có 6 vị trí khởi tạo Web Worker. Trong tình huống cao điểm (vừa chơi BOAT vừa bật phân tích ngầm và mở xem lại ván), số lượng Worker có thể lên tới 8–9 tiến trình cùng lúc, tích luỹ các Transposition Table trong JavaScript và WebAssembly linear memory lên đến ~1.5 GB RAM. Đã xác định 5 điểm cải thiện để giảm tiêu thụ RAM trên thiết bị di động (Safari iPhone).

---

### 1. Bảng tổng hợp vòng đời Web Worker

| STT | Web Worker | File & Dòng khởi tạo | Điều kiện tắt (`terminate`) | Ngắt khi đang bận? | Giữ sống khi rảnh (Idle)? | Bộ nhớ đặc thù |
|:---:|---|---|---|:---:|:---:|---|
| **1** | **Local AI Bot** (`ai-worker.js`) | `caro/app.js:178` | **Không bao giờ tắt** (Singleton) | ❌ Không | ⚠️ Có | Scripts engine + Book + TT đơn ván |
| **2** | **Live Analysis** (`ai-worker.js`) | `caro/live-analysis.js:27` | Khi bot bắt đầu nghĩ (`sync:62`) hoặc `stop:70` | 🔴 Có (`inflight`) | ⚠️ Có | Transposition Table (`tt`, `qtt`, `vtt`) Map tích luỹ |
| **3** | **Single Study** (`ai-worker.js`) | `caro/study.js:35` | Khi người dùng huỷ (`cancel:100`) | 🔴 Có | ⚠️ Có | Scripts engine + kết quả phân tích |
| **4** | **Analysis Pool** (`ai-worker.js` x1..4) | `caro/an-pool.js:22` | Khi gọi `cancel:29` | 🔴 Có | ⚠️ Có | 1–4 workers giữ Map TT riêng (`pool${my}_${k}`) |
| **5** | **Rapfi WASM** (`rapfi/worker.js`) | `caro/boat-rapfi.js:75` | Đổi luật / ván mới $\rightarrow$ `retire()` (sau #30) | 🟢 Chờ xong / 30s timeout | ⚠️ Có | WebAssembly Memory + NNUE weights (~15–25 MB) |
| **6** | **Rapfi Edge Checker** (`ai-worker.js`) | `caro/boat-rapfi.js:171` | **Không bao giờ tắt** | ❌ Không | ⚠️ Có | Engine Transposition Table cho `rapfi-check-${rule}` |

---

### 2. Số lượng Web Worker tối đa cùng tồn tại
- `app.js`: 1
- `live-analysis.js`: 1
- `boat-rapfi.js` (Rapfi WASM): 1 (cộng 0-1 worker cũ đang `retire`)
- `boat-rapfi.js` (Edge Checker): 1
- `an-pool.js`: 1–4 (theo `hardwareConcurrency - 1`, max 4)
- `study.js` (fallback): 0–1
👉 **Tối đa 8 – 9 Web Worker sống đồng thời**.

---

### 3. Nguyên nhân tiêu thụ RAM cao (~1.5 GB trên WebKit)
1. **Bảng nhớ Transposition Table không có LRU eviction**: Các Map `live.shared.tt` trong `ai-worker.js` tích luỹ không giới hạn số lượng thế cờ trong ván dài hoặc qua nhiều ván.
2. **Pool Worker và Checker không giải phóng khi xong việc**: Sau khi hoàn thành phân tích, 4 Worker của `an-pool.js` và Worker `checker` vẫn duy trì trong RAM vĩnh viễn.
3. **WebAssembly Linear Memory của Rapfi**: Chiếm 20–30 MB cố định cho mỗi instance, không giải phóng ngay nếu người dùng đổi luật liên tục.

---

### 4. Đề xuất giải pháp tối ưu RAM (Khuyến nghị)
1. **Auto-terminate cho `an-pool.js`**: Thêm timer dọn dẹp (idle timeout 15s) sau khi hoàn tất phân tích ván để thu hồi 4 Worker.
2. **Thêm cơ chế xoá cache thế cờ**: Đặt ngưỡng tối đa (ví dụ 20,000 thế cờ) cho `live.shared.tt` trong `ai-worker.js`.
3. **Dọn dẹp `checker`**: Gọi `terminate()` cho `checker` trong `CaroRapfi.stop()`.
4. **Giới hạn Worker trên thiết bị di động**: Trên trình duyệt di động / cảm ứng, giới hạn kích thước pool ở mức tối đa 2 Worker thay vì 4.

---
_Thực hiện bởi Antigravity_
