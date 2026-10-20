# Báo cáo: Kiểm tra Đăng nhập Google và BOAT Rapfi đa luồng với Document-Isolation-Policy (#61)

## Kết luận

- **Header `Document-Isolation-Policy: isolate-and-credentialless` (PR #60) hoạt động hoàn hảo và an toàn**:
  - **Trên Chrome và Edge máy tính (≥ 137)**: `crossOriginIsolated` đạt **`true`**, kích hoạt thành công `SharedArrayBuffer` giúp BOAT chạy Rapfi đa luồng (**3 luồng**). Đấu 10+ nước trên cả luật Việt Nam và luật Tự do mượt mà, `0` lỗi Console; tính năng nghĩ trước (Ponder) phản hồi nhanh trong **2.6 giây** sau 30 giây chờ.
  - **Trên Firefox, Safari (WebKit) và Android Mobile Chrome**: Trang không bật cô lập (`crossOriginIsolated: false`), BOAT tự động fallback về Rapfi **đơn luồng (1 luồng)** an toàn, không có lỗi.
  - **Đối chứng `RAPFI_THREADS=0`**: Header DIP được tắt hoàn toàn (`none`), Chrome chạy đơn luồng (`threads: 1`).
- **Khả năng tương thích với Google Sign-In & Avatar Google**:
  - Header DIP **hoàn toàn không chặn** Google Identity Services (GSI): script `https://accounts.google.com/gsi/client` tải thành công, `window.google.accounts` sẵn sàng, hộp thoại và nút iframe Google Sign-In được render đầy đủ trên cả Chrome và Edge.
  - Ảnh đại diện Google từ `https://*.googleusercontent.com` tải bình thường qua CSP (`true`).

---

## 1. Bảng kết quả kiểm thử BOAT Rapfi trên các trình duyệt thực tế

- **Nhánh kiểm tra**: `claude/elegant-volta-l9vci2` (PR #60, commit `721390832be769b4f95b566dfcdbd75da7bf1fda`).
- **Hệ điều hành**: Windows 11 Home x64.

| Môi trường / Trình duyệt | Phiên bản | `crossOriginIsolated` | Số luồng Rapfi (`threads`) | Kết quả đấu BOAT (VN & Free) | Phản hồi Ponder (sau 30s) | Lỗi Console |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Google Chrome (máy thật)** | 155.0.8059.82 | **`true`** | **3** (đa luồng) | **Đạt** (rapfi: 5, fallback: 0) | **~2.6s** | **0** |
| **Microsoft Edge (máy thật)** | 155.0.4283.62 | **`true`** | **3** (đa luồng) | **Đạt** (rapfi: 5, fallback: 0) | **~2.8s** | **0** |
| **Chrome (`RAPFI_THREADS=0`)** | 155.0.8059.82 | **`false`** | **1** (đơn luồng) | **Đạt** (rapfi: 3, fallback: 0) | — | **0** |
| **Mozilla Firefox** | 130.0 (Playwright) | **`false`** | **1** (đơn luồng) | **Đạt** (rapfi: 3, fallback: 0) | — | **0** |
| **WebKit (Safari engine)** | 18.0 (Playwright) | **`false`** | **1** (đơn luồng) | **Đạt** (rapfi: 3, fallback: 0) | — | **0** |
| **Android Mobile Chrome** | Pixel 7 Emulation | **`false`** | **1** (đơn luồng) | **Đạt** (rapfi: 3, fallback: 0) | — | **0** |

---

## 2. Bảng kiểm tra Đăng nhập Google & Tài nguyên Google

- **Cấu hình máy chủ**: Khởi động với `GOOGLE_CLIENT_ID` (ẩn danh tính theo quy tắc bảo mật).

| Hạng mục kiểm tra | Google Chrome (155) | Microsoft Edge (155) | Nhận xét kỹ thuật |
| :--- | :---: | :---: | :--- |
| **Header DIP máy chủ gửi** | `isolate-and-credentialless` | `isolate-and-credentialless` | Header có mặt đầy đủ trong HTTP Response |
| **Nạp GSI SDK (`gsi/client`)** | **Đạt** (`true`) | **Đạt** (`true`) | Script tải thành công, không bị CSP / DIP chặn |
| **Khởi tạo `google.accounts`** | **Đạt** (`true`) | **Đạt** (`true`) | SDK khởi tạo sẵn sàng cho luồng OAuth |
| **Hiển thị hộp thoại & iframe Google** | **Đạt** (1 iframe) | **Đạt** (1 iframe) | Nút bấm Google Sign-In hiển thị trong `#google-box` |
| **Tải ảnh `googleusercontent.com`** | **Đạt** (`true`) | **Đạt** (`true`) | CSP `img-src` cho phép ảnh avatar hiển thị chuẩn |
| **Chế độ đối chứng `RAPFI_THREADS=0`** | Header DIP tắt | Header DIP tắt | GSI SDK và nút đăng nhập vẫn hoạt động tương đương |

*Ghi chú về Origin*: Khi kiểm thử cục bộ qua địa chỉ IP thử nghiệm, Google GSI ghi nhận log cấu hình `[GSI_LOGGER]: The given origin is not allowed for the given client ID`, điều này phản ánh đúng cơ chế bảo vệ phía Google Cloud Console (cần thêm origin cụ thể vào Authorized JavaScript Origins). Header DIP của máy chủ không gây cản trở kết nối hay chặn tài nguyên.

---

## 3. Nhật ký và Số liệu Console thực tế

### 3.1. Google Chrome (v155.0.8059.82)

```text
> window.crossOriginIsolated
true

> window.CaroRapfi.stats
{
  "rapfi": 5,
  "fallback": 0,
  "fixed": 0,
  "ponder": 0,
  "aux": 0,
  "threads": 3
}

- Thời gian phản hồi BOAT sau 30 giây Ponder: ~2.6 giây.
- Số lỗi Console đỏ: 0 lỗi.
```

### 3.2. Microsoft Edge (v155.0.4283.62)

```text
> window.crossOriginIsolated
true

> window.CaroRapfi.stats
{
  "rapfi": 5,
  "fallback": 0,
  "fixed": 0,
  "ponder": 0,
  "aux": 0,
  "threads": 3
}

- Số lỗi Console đỏ: 0 lỗi.
```

### 3.3. Đối chứng khi đặt `RAPFI_THREADS=0` trên Chrome

```text
> window.crossOriginIsolated
false

> window.CaroRapfi.stats
{
  "rapfi": 3,
  "fallback": 0,
  "fixed": 0,
  "ponder": 0,
  "aux": 0,
  "threads": 1
}
```

---

## 4. Danh sách hình ảnh bằng chứng

Toàn bộ ảnh chụp màn hình kiểm thử thực tế được lưu tại thư mục `reports/61/`:

1. [`reports/61/chrome-console-stats.png`](reports/61/chrome-console-stats.png): Bằng chứng Console trên Google Chrome (`crossOriginIsolated: true`, `threads: 3`).
2. [`reports/61/chrome-rapfi-board.png`](reports/61/chrome-rapfi-board.png): Bàn cờ đấu BOAT Rapfi đa luồng trên Google Chrome.
3. [`reports/61/edge-console-stats.png`](reports/61/edge-console-stats.png): Bằng chứng Console trên Microsoft Edge (`crossOriginIsolated: true`, `threads: 3`).
4. [`reports/61/edge-rapfi-board.png`](reports/61/edge-rapfi-board.png): Bàn cờ đấu BOAT Rapfi đa luồng trên Microsoft Edge.
5. [`reports/61/chrome-google-login.png`](reports/61/chrome-google-login.png): Hộp thoại đăng nhập và nút Google Sign-In trên Chrome.
6. [`reports/61/edge-google-login.png`](reports/61/edge-google-login.png): Hộp thoại đăng nhập và nút Google Sign-In trên Edge.
