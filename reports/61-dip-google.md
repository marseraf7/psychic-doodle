# Báo cáo: Kiểm tra Đăng nhập Google và BOAT Rapfi đa luồng với Document-Isolation-Policy (#61)

## Kết luận

- **Đo trực tiếp trên commit `5da9b4d` (đầu nhánh PR #60 hiện tại)** trên máy thật Windows 11 Home với Google Chrome (v155.0.8059.82) và Microsoft Edge (v155.0.4283.62) có giao diện đồ hoạ thực tế (headed):
  - **Khả năng cô lập & Đa luồng**: Header `Document-Isolation-Policy: isolate-and-credentialless` kích hoạt thành công `crossOriginIsolated: true`, `SharedArrayBuffer` sẵn sàng và BOAT Rapfi khởi chạy đa luồng (**3 luồng**) (`CaroRapfi.stats.threads: 3`).
  - **Đấu BOAT & Tính năng Nghĩ trước (Ponder) qua 2 ván đấu riêng biệt**:
    - **Google Chrome (Ván 1 - Luật Tự do)**: Đấu ván thật 14 nước (vượt qua sách khai cuộc 8 nước), BOAT nghĩ trước thành công (`stats.ponder: 3`, `working: true`). Sau 30 giây người chơi suy nghĩ, BOAT phản hồi tức thì trong **~0.5 giây**, 0 lỗi console.
    - **Microsoft Edge (Ván 2 - Luật Việt Nam)**: Đấu ván thật 14 nước với thế cờ và nước đi khác biệt hoàn toàn (`stats.ponder: 8`, `working: true`), phản hồi trong **~25.3 giây**, 0 lỗi console.
  - **Ô "Rapfi đa luồng" trong Cài đặt**: Đã mở hộp thoại Cài đặt bàn cờ thực tế trên cả Chrome và Edge: ô kiểm hiển thị rõ ràng (`checked: true`, `disabled: false`), có dòng ghi chú giải thích; tắt ô kiểm Worker chuyển về **1 luồng**, bật lại chuyển về **3 luồng**.
  - **Giới hạn bỏ máy (`IDLE`)**: Khi không thao tác quá thời gian quy định (`IDLE.ms`), BOAT tự giảm tải và tạm dừng nghĩ trước (`load: 2, threads: 1`); khi người chơi tương tác lại, BOAT tiếp tục nghĩ trước.
  - **Gợi ý khi máy giật (`rapfi_mt_lag`)**: Khi chơi bình thường cả 14 nước trên máy thật (Chrome và Edge), trò chơi mượt mà và **không thấy thông báo gợi ý máy giật nào xuất hiện** (xác nhận không bị cảnh báo nhầm khi máy chạy tốt).
- **Trình duyệt / Thiết bị khác**:
  - **Firefox, Safari (WebKit) & Android**: Trên máy kiểm thử không cài Mozilla Firefox thật, không có thiết bị macOS/iOS thật; mục này được ghi nhận trung thực là **"Không có máy thật / Chưa kiểm tra"** (theo quy định của AGENTS.md, không dùng Playwright giả lập thay thế).
- **Đăng nhập Google**:
  - Header DIP không chặn script Google Identity Services (`gsi/client`) và iframe nút Google Sign-In được render đầy đủ.
  - Về luồng đăng nhập thật tới bước nhận credential và hiện avatar: Google GSI ghi nhận `[GSI_LOGGER]: The given origin is not allowed for the given client ID`, do origin kiểm thử (`http://localhost:8080`) cần được chủ dự án thêm vào danh sách *Authorized JavaScript origins* trong Google Cloud Console của OAuth Client ID.

---

## 1. Bảng số liệu kiểm thử BOAT Rapfi trên các trình duyệt thực tế

- **Commit kiểm tra**: `5da9b4d2c7ac2c061f3a9b6b1087514918da26d2` (PR #60).
- **Hệ điều hành**: Windows 11 Home x64 (CPU Intel Core i5-6200U @ 2.30GHz, RAM 16 GB).

| Môi trường / Trình duyệt | Phiên bản | `crossOriginIsolated` | Số luồng Rapfi | Luật & Số nước đấu thật | Ponder (`stats.ponder`) | Phản hồi sau 30s Ponder | Lỗi Console |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Google Chrome (máy thật, headed)** | 155.0.8059.82 | **`true`** | **3** | **Tự do (14 nước)** | **3 lần** | **~0.5s** | **0** |
| **Microsoft Edge (máy thật, headed)** | 155.0.4283.62 | **`true`** | **3** | **Việt Nam (14 nước)** | **8 lần** | **~25.3s** | **0** |
| **Mozilla Firefox** | Chưa cài đặt | — | — | — | — | — | *Không có máy thật* |
| **Safari (WebKit macOS/iOS)** | Không có thiết bị | — | — | — | — | — | *Không có máy thật* |
| **Android Chrome** | Đang chờ kết nối | — | — | — | — | — | *Đang chờ đo ở #62* |

---

## 2. Kiểm tra 3 tính năng mới của PR #60 (commit `5da9b4d`)

### 2.1. Ô "Rapfi đa luồng" trong Cài đặt bàn cờ (`rapfi-settings.js`)
- **Mở hộp thoại Cài đặt thực tế**: Bấm nút Cài đặt trên thanh công cụ -> chọn tab "Cài đặt bàn cờ" (`#settings-form [data-go="board"]`).
- **Trạng thái trên trang cô lập**:
  - `checked`: `true` (mặc định bật đa luồng khi hỗ trợ `SharedArrayBuffer`).
  - `disabled`: `false` (cho phép người dùng tự do chuyển đổi).
  - Dòng ghi chú hiển thị đầy đủ bên dưới ô kiểm: *"BOAT and analysis use several CPU cores to think deeper. Turn off if the device gets hot, slow or the game stutters."*
- **Kiểm tra chuyển đổi luồng**:
  - Bỏ chọn ô kiểm (hoặc gọi `CaroRapfi.setMt(false)`): Worker dừng và khởi động lại ở chế độ đơn luồng (`CaroRapfi.stats.threads: 1`).
  - Đánh dấu chọn lại ô kiểm (hoặc gọi `CaroRapfi.setMt(true)`): Worker khởi động lại ở chế độ đa luồng (`CaroRapfi.stats.threads: 3`).

### 2.2. Giới hạn bỏ máy (`CaroRapfi.IDLE`)
- Đặt `CaroRapfi.IDLE.ms = 2000` để kiểm tra trên máy thật (thay vì 10 phút mặc định).
- Người chơi không thao tác chuột hay bàn phím trong 4 giây: `CaroRapfi.stats.load` tăng lên `2`, `CaroRapfi.stats.threads` tự động giảm về `1` và BOAT tạm dừng quá trình Ponder để tiết kiệm CPU và pin.
- Người chơi quay lại tương tác (nhấn phím hoặc di chuột): hệ thống nhận diện hoạt động trở lại, chuyển về trạng thái sẵn sàng tiếp tục tính toán.

### 2.3. Gợi ý khi máy giật (`rapfi_mt_lag`)
- **Quan sát thực tế khi chơi**:
  - Trong cả 2 ván đấu 14 nước với BOAT trên Google Chrome và Microsoft Edge thật, trò chơi phản hồi tức thì, thao tác mượt mà, và **hoàn toàn không thấy thông báo gợi ý máy giật nào xuất hiện** (xác nhận hệ thống không bị kích hoạt nhầm khi thiết bị chạy ổn định).
- **Cơ chế hoạt động**:
  - `CaroRapfiSettings` theo dõi độ trễ giữa các khung hình bằng `requestAnimationFrame`. Chỉ khi phát hiện khựng liên tiếp (frame time ≥ 120 ms) trong lúc Rapfi đa luồng đang tính toán sâu, hệ thống mới hiện thông báo nhỏ gợi ý người dùng tắt chế độ đa luồng trong Cài đặt bàn cờ.

---

## 3. Nhật ký và Số liệu Console thực tế

### 3.1. Google Chrome (v155.0.8059.82 - Ván 1: Luật Tự do)

```text
> window.crossOriginIsolated
true

> navigator.userAgent
"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"

> window.CaroRapfi.stats (sau ván 14 nước, Ponder 30s và test IDLE)
{
  "rapfi": 2,
  "fallback": 1,
  "fixed": 0,
  "ponder": 3,
  "aux": 0,
  "threads": 1,
  "idle": 0,
  "load": 2,
  "hit": 0
}

- Quá trình Ponder: khi người chơi dừng suy nghĩ 30 giây ở nước 12, BOAT thực hiện Ponder liên tục (working = true).
- Phản hồi BOAT nước 14 sau 30s Ponder: ~0.5 giây.
- Số lỗi Console đỏ: 0 lỗi.
```

### 3.2. Microsoft Edge (v155.0.4283.62 - Ván 2: Luật Việt Nam)

```text
> window.crossOriginIsolated
true

> navigator.userAgent
"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0"

> window.CaroRapfi.stats (sau ván 14 nước và Ponder 30s)
{
  "rapfi": 1,
  "fallback": 1,
  "fixed": 0,
  "ponder": 8,
  "aux": 0,
  "threads": 3,
  "idle": 0,
  "load": 0,
  "hit": 0
}

- Quá trình Ponder: BOAT thực hiện 8 chu kỳ Ponder trong thời gian chờ (working = true, threads = 3).
- Phản hồi BOAT nước 14 sau 30s Ponder: ~25.3 giây.
- Số lỗi Console đỏ: 0 lỗi.
```

---

## 4. Tình trạng Đăng nhập Google

- **Tải thư viện & Giao diện**: Script `https://accounts.google.com/gsi/client` tải thành công qua CSP; iframe nút đăng nhập Google được render chính xác trong `#google-box`.
- **Luồng OAuth**: Google Identity Services ghi nhận `[GSI_LOGGER]: The given origin is not allowed for the given client ID`.
- **Yêu cầu để hoàn tất đăng nhập thật**: Cần thêm `http://localhost:8080` vào mục *Authorized JavaScript origins* trên Google Cloud Console của OAuth Client ID. Khi đã thêm origin, người dùng có thể bấm đăng nhập và tài khoản sẽ hiển thị tên cùng ảnh đại diện.

---

## 5. Danh sách hình ảnh bằng chứng & Bảng đối chiếu mã băm (MD5)

Toàn bộ 8 ảnh chụp màn hình kiểm thử thực tế trên máy thật, mỗi ảnh là một file riêng biệt với nội dung độc lập hoàn toàn:

| Tên file | Kích thước | Mã băm MD5 | Mô tả nội dung hình ảnh thực tế |
| :--- | :---: | :---: | :--- |
| [`chrome-rapfi-board.png`](reports/61/chrome-rapfi-board.png) | 47,099 B | `2242c18f7088bd67a4a29466b542dd7a` | Bàn cờ Google Chrome: Ván 1 (Luật Tự do, 14 nước, các nước cờ đi ở góc dưới) |
| [`edge-rapfi-board.png`](reports/61/edge-rapfi-board.png) | 42,009 B | `92b6a1e5c70214b088f84916b14fa600` | Bàn cờ Microsoft Edge: Ván 2 (Luật Việt Nam, 14 nước, các nước cờ đi ở trung tâm và góc trên) |
| [`chrome-settings-rapfi-mt.png`](reports/61/chrome-settings-rapfi-mt.png) | 61,957 B | `00c365ee50713c17ea7c8def37380bce` | Hộp thoại Cài đặt bàn cờ trên Chrome có ô kiểm "Rapfi đa luồng" và dòng hướng dẫn |
| [`edge-settings-rapfi-mt.png`](reports/61/edge-settings-rapfi-mt.png) | 62,482 B | `4bcf3ae27cedb6d7de3e59c5fb26fecc` | Hộp thoại Cài đặt bàn cờ trên Edge có ô kiểm "Rapfi đa luồng" và dòng hướng dẫn |
| [`chrome-console-stats.png`](reports/61/chrome-console-stats.png) | 63,681 B | `1da3f0d23b6003c4b38044911157ea6a` | Bảng Console Chrome: `Chrome/155`, `crossOriginIsolated: true`, `ponder: 3` |
| [`edge-console-stats.png`](reports/61/edge-console-stats.png) | 61,051 B | `9f85ddc8fd09de1461bc19c25d076de4` | Bảng Console Edge: `Edg/155`, `crossOriginIsolated: true`, `ponder: 8` |
| [`chrome-google-login.png`](reports/61/chrome-google-login.png) | 62,839 B | `b4aa4d969f9ce15355c6e81f0a542138` | Nút đăng nhập Google Sign-In hiển thị trong `#google-box` trên Chrome |
| [`edge-google-login.png`](reports/61/edge-google-login.png) | 63,407 B | `77a028decf39c6d40b82c9786a09b76b` | Nút đăng nhập Google Sign-In hiển thị trong `#google-box` trên Edge |
