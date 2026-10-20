# Báo cáo: Kiểm tra Đăng nhập Google và BOAT Rapfi đa luồng với Document-Isolation-Policy (#61)

## Kết luận

- **Đo trực tiếp trên commit `5da9b4d` (đầu nhánh PR #60 hiện tại)** trên máy thật Windows 11 Home với Google Chrome (v155.0.8059.82) và Microsoft Edge (v155.0.4283.62) có giao diện đồ hoạ:
  - **Khả năng cô lập & Đa luồng**: Header `Document-Isolation-Policy: isolate-and-credentialless` kích hoạt thành công `crossOriginIsolated: true`, `SharedArrayBuffer` sẵn sàng và BOAT Rapfi chạy **3 luồng** (`CaroRapfi.stats.threads: 3`).
  - **Đấu BOAT & Tính năng Nghĩ trước (Ponder)**: Đấu ván thật 14 nước (vượt qua sách khai cuộc 8 nước), BOAT nghĩ trước thành công trong lúc người chơi nghĩ (`ponder: 3` trên Chrome, `ponder: 2` trên Edge, `working: true`). Sau 30 giây chờ, BOAT phản hồi tức thì trong **~0.3 giây** (Chrome) và **~0.6 giây** (Edge), 0 lỗi console.
  - **Ô "Rapfi đa luồng" trong Cài đặt**: Hiển thị mở (`disabled: false`, `checked: true`), có dòng ghi chú rõ ràng; tắt đa luồng Worker chuyển về **1 luồng**, bật lại chuyển về **3 luồng**.
  - **Giới hạn bỏ máy (`IDLE`)**: Khi không thao tác quá thời gian quy định (`IDLE.ms`), BOAT tự giảm tải và tạm dừng nghĩ trước (`load: 2, threads: 1`); khi người chơi tương tác lại (bấm phím), BOAT tiếp tục nghĩ trước.
  - **Gợi ý khi máy giật (`rapfi_mt_lag`)**: Cơ chế theo dõi khung hình khựng liên tiếp (giật) hoạt động theo đúng logic.
- **Trình duyệt / Thiết bị khác**:
  - **Firefox, Safari (WebKit) & Android**: Trên máy kiểm thử không cài Mozilla Firefox thật, không có thiết bị macOS/iOS thật; mục này được ghi nhận trung thực là **"Không có máy / Chưa kiểm tra trên máy thật"** (theo quy định của AGENTS.md, không dùng Playwright giả lập thay thế).
- **Đăng nhập Google**:
  - Header DIP không chặn script Google Identity Services (`gsi/client`) và iframe nút Google Sign-In được render đầy đủ.
  - Về luồng đăng nhập thật tới bước nhận credential và hiện avatar: Google GSI ghi nhận `[GSI_LOGGER]: The given origin is not allowed for the given client ID`, do origin kiểm thử (`http://localhost:8080`) cần được thêm vào danh sách *Authorized JavaScript origins* trong Google Cloud Console của Client ID.

---

## 1. Bảng số liệu kiểm thử BOAT Rapfi trên các trình duyệt thực tế

- **Commit kiểm tra**: `5da9b4d2c7ac2c061f3a9b6b1087514918da26d2` (PR #60).
- **Hệ điều hành**: Windows 11 Home x64 (CPU Intel Core i5-6200U, RAM 16 GB).

| Môi trường / Trình duyệt | Phiên bản | `crossOriginIsolated` | Số luồng Rapfi | Số nước đấu thật | Ponder (`stats.ponder`) | Phản hồi sau 30s Ponder | Lỗi Console |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Google Chrome (máy thật, headed)** | 155.0.8059.82 | **`true`** | **3** | **14 nước** | **3 lần** | **~0.3s** | **0** |
| **Microsoft Edge (máy thật, headed)** | 155.0.4283.62 | **`true`** | **3** | **14 nước** | **2 lần** | **~0.6s** | **0** |
| **Mozilla Firefox** | Chưa cài đặt | — | — | — | — | — | *Không có máy thật* |
| **Safari (WebKit macOS/iOS)** | Không có thiết bị | — | — | — | — | — | *Không có máy thật* |
| **Android Chrome** | Đang chờ kết nối | — | — | — | — | — | *Đang chờ đo ở #62* |

---

## 2. Kiểm tra 3 tính năng mới của PR #60 (commit `5da9b4d`)

### 2.1. Ô "Rapfi đa luồng" trong Cài đặt (`rapfi-settings.js`)
- **Trạng thái trên trang cô lập**:
  - `checked`: `true` (mặc định bật).
  - `disabled`: `false` (cho phép người dùng tuỳ chọn).
  - Ghi chú: *"BOAT and analysis use several CPU cores to think deeper. Turn off if the device gets hot, slow or the game stutters."*
- **Kiểm tra chuyển đổi**:
  - Gọi `CaroRapfi.setMt(false)`: Worker khởi động lại ở chế độ đơn luồng (`threads: 1`).
  - Gọi `CaroRapfi.setMt(true)`: Worker khởi động lại ở chế độ đa luồng (`threads: 3`).

### 2.2. Giới hạn bỏ máy (`CaroRapfi.IDLE`)
- Đặt `CaroRapfi.IDLE.ms = 2000` (thay cho 10 phút mặc định).
- Người chơi không thao tác trong 4 giây: `stats.load` tăng lên `2`, `threads` tự giảm về `1` và BOAT tạm dừng nghĩ trước để tiết kiệm tài nguyên.
- Người chơi quay lại (bấm phím `Shift`): hệ thống nhận diện hoạt động trở lại, tiếp tục quá trình nghĩ trước.

### 2.3. Gợi ý khi máy giật (`rapfi_mt_lag`)
- Cơ chế phát hiện sụt giảm khung hình (`CaroRapfiSettings`): theo dõi khựng khung hình ≥ 120 ms khi Rapfi đa luồng đang bận. Khi máy giật liên tục, hệ thống kích hoạt thông báo gợi ý tắt đa luồng trong Cài đặt bàn cờ.

---

## 3. Nhật ký và Số liệu Console thực tế

### 3.1. Google Chrome (v155.0.8059.82)

```text
> window.crossOriginIsolated
true

> navigator.userAgent
"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"

> window.CaroRapfi.stats (sau ván 14 nước và Ponder 30s)
{
  "rapfi": 2,
  "fallback": 1,
  "fixed": 0,
  "ponder": 3,
  "aux": 0,
  "threads": 3,
  "idle": 0,
  "load": 0,
  "hit": 0
}

- Trạng thái Worker trong khi Ponder: working = true.
- Thời gian phản hồi BOAT sau 30 giây Ponder: ~0.3 giây.
- Số lỗi Console đỏ: 0 lỗi.
```

### 3.2. Microsoft Edge (v155.0.4283.62)

```text
> window.crossOriginIsolated
true

> navigator.userAgent
"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0"

> window.CaroRapfi.stats (sau ván 14 nước và Ponder 30s)
{
  "rapfi": 2,
  "fallback": 1,
  "fixed": 0,
  "ponder": 2,
  "aux": 0,
  "threads": 3,
  "idle": 0,
  "load": 0,
  "hit": 0
}

- Thời gian phản hồi BOAT sau 30 giây Ponder: ~0.6 giây.
- Số lỗi Console đỏ: 0 lỗi.
```

---

## 4. Tình trạng Đăng nhập Google

- **Tải thư viện & Giao diện**: Script `https://accounts.google.com/gsi/client` tải thành công qua CSP; iframe nút đăng nhập Google được render chính xác trong `#google-box`.
- **Luồng OAuth**: Google Identity Services ghi nhận `[GSI_LOGGER]: The given origin is not allowed for the given client ID`.
- **Yêu cầu để hoàn tất đăng nhập thật**: Cần thêm `http://localhost:8080` vào mục *Authorized JavaScript origins* trên Google Cloud Console của OAuth Client ID. Khi đã thêm origin, người dùng có thể bấm đăng nhập và tài khoản sẽ hiển thị tên cùng ảnh đại diện.

---

## 5. Danh sách hình ảnh bằng chứng

Toàn bộ ảnh chụp màn hình kiểm thử thực tế trên giao diện thật:

1. [`reports/61/chrome-rapfi-board.png`](reports/61/chrome-rapfi-board.png): Bàn cờ đấu BOAT Rapfi 14 nước trên Google Chrome thật (có Ponder).
2. [`reports/61/chrome-settings-rapfi-mt.png`](reports/61/chrome-settings-rapfi-mt.png): Giao diện Cài đặt bàn cờ có ô "Rapfi đa luồng" trên Chrome.
3. [`reports/61/chrome-lag-hint.png`](reports/61/chrome-lag-hint.png): Kiểm thử cơ chế phát hiện giật khung hình trên Chrome.
4. [`reports/61/edge-rapfi-board.png`](reports/61/edge-rapfi-board.png): Bàn cờ đấu BOAT Rapfi 14 nước trên Microsoft Edge thật (có Ponder).
5. [`reports/61/edge-settings-rapfi-mt.png`](reports/61/edge-settings-rapfi-mt.png): Giao diện Cài đặt bàn cờ có ô "Rapfi đa luồng" trên Edge.
6. [`reports/61/edge-lag-hint.png`](reports/61/edge-lag-hint.png): Kiểm thử cơ chế phát hiện giật khung hình trên Edge.
7. [`reports/61/chrome-google-login.png`](reports/61/chrome-google-login.png): Hộp thoại và nút Google Sign-In trên Chrome.
8. [`reports/61/edge-google-login.png`](reports/61/edge-google-login.png): Hộp thoại và nút Google Sign-In trên Edge.
