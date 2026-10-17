# Báo cáo: Đo tỉ lệ lỗi 'app kết nối máy chủ' của bài máy ảo Android trên CI (#50)

## Kết luận

- **Tỉ lệ lỗi 'app kết nối máy chủ' (nhóm a) rất thấp**: Chỉ xuất hiện **2/120 job (1,67%)** tổng cộng (hoặc **2/104 = 1,92%** nếu loại trừ 16 job bị huỷ do concurrency).
- **Chỉ xuất hiện trên Android API 35**, hoàn toàn **không xuất hiện trên Android API 34** (0/60 job).
- **Về phía máy chủ**: Máy chủ đã khởi động xong (`Cờ Caro đang chạy: http://localhost:8790`), tuy nhiên hiện tại **chưa xác định được** máy chủ có nhận được yêu cầu kết nối TCP hay không do `server.js` không ghi log khi có kết nối WebSocket mới.
- Nguyên nhân lớn nhất gây đỏ CI Android thực tế là **nhóm (b) bàn phím / ô nhập (7/120 = 5,83%)** và **nhóm (c) máy ảo / adb treo (5/120 = 4,17%)**.

---

## Bảng tổng quan theo API (60 lượt chạy gần nhất)

- **Số lượt chạy workflow đã xét**: 60 lượt chạy của workflow `App Caro (Android / iOS)` (`app.yml`).
- **Khoảng thời gian**: Từ `2026-10-15T21:24:55Z` đến `2026-10-16T23:46:45Z` (~26 giờ).
- **Tổng số job Android E2E**: 120 job (60 job Android 34, 60 job Android 35).

| Nhóm kết quả / Nhóm lỗi | Android 34 (API 34) | Android 35 (API 35) | Toàn bộ (120 job) | Tỉ lệ (% trên 120 job) | Tỉ lệ (% trên job chạy xong) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Xanh (PASS)** | 42 | 46 | 88 | 73,33% | 84,62% |
| **Bị huỷ (e: cancelled)** | 7 | 9 | 16 | 13,33% | — |
| **Đỏ (a): Kết nối máy chủ** | **0** | **2** | **2** | **1,67%** | **1,92%** |
| **Đỏ (b): Bàn phím / Ô nhập** | 6 | 1 | 7 | 5,83% | 6,73% |
| **Đỏ (c): Máy ảo / ADB treo** | 3 | 2 | 5 | 4,17% | 4,81% |
| **Đỏ (d): Khác (Timeout mở app)** | 2 | 0 | 2 | 1,67% | 1,92% |
| **Tổng cộng** | **60** | **60** | **120** | **100%** | **100%** |

---

## Bảng tra cứu Job ID theo phân loại để đối chiếu

| Nhóm | Số lượng | Danh sách Job ID |
| :--- | :---: | :--- |
| **(a) Kết nối máy chủ** | 2 | `116930414869` (API 35), `116890600397` (API 35) |
| **(b) Bàn phím / Ô nhập** | 7 | `117233505514`, `117000460131`, `116992084205`, `116890600472`, `116697817871`, `116684180992`, `116684650975` |
| **(c) Máy ảo / ADB treo** | 5 | `116895237048` (treo > 30p), `116723353781` (adb exit 1), `116715257255` (adb exit 1), `116705437025` (adb exit 1), `116684748669` (adb exit 1) |
| **(d) Timeout mở app** | 2 | `116861566999`, `116723903381` |
| **(e) Bị huỷ (cancelled)** | 16 | `117245281796`, `117245281894`, `116991359711`, `116991360095`, `116865244552`, `116861577075`, `116861577423`, `116861566943`, `116719159860`, `116719159889`, `116683988744`, `116683988793`, `116683879529`, `116683879676`, `116680362401`, `116680362660` |
| **Xanh (PASS)** | 88 | *88 job IDs chi tiết có trong issue50_ci_data.json* (tiêu biểu: `117248557461`, `117248557688`, `116930516877`, `116895236686`...) |

---

## Bảng chi tiết các job nhóm (a) – Lỗi kết nối máy chủ

| Run ID | Job ID | API | Thời gian chạy (UTC) | Nhánh / Commit | PASS cuối cùng | Số lần thử lại WS | Dòng logcat Capacitor/Console liên quan |
| :--- | :--- | :---: | :--- | :--- | :--- | :---: | :--- |
| **38875851037** | 116890600397 | API 35 | 2026-10-16 08:45:46 | `agy/report-41`<br>`a23ebc9` | `PASS mở app vào Trang chủ` | 5 | `Mixed Content: The page at 'https://localhost/' was loaded over HTTPS, but attempted to connect to the insecure WebSocket endpoint 'ws://10.0.2.2:8790/ws'`<br>`Connecting to a non-secure WebSocket server from a secure origin is deprecated.` |
| **38888016220** | 116930414869 | API 35 | 2026-10-16 10:33:29 | `claude/scrypt-async`<br>`2467d16` | `PASS mở app vào Trang chủ` | 5 | `Mixed Content: The page at 'https://localhost/' was loaded over HTTPS, but attempted to connect to the insecure WebSocket endpoint 'ws://10.0.2.2:8790/ws'`<br>`Connecting to a non-secure WebSocket server from a secure origin is deprecated.` |

---

## Lần đầu tiên xuất hiện lỗi nhóm (a)

- **Thời điểm**: Ngày **2026-10-16 08:45:46 UTC** tại Run **#38875851037** (PR #47).
- Trước thời điểm này (từ ngày 2026-10-15 trở về trước trong mẫu khảo sát), hoàn toàn không có job nào dính lỗi nhóm (a).
- Cả hai lần xuất hiện đều cùng xảy ra trong ngày 2026-10-16, cách nhau khoảng 1 giờ 48 phút.

---

## Trích xuất nhật ký thực tế (Log nguyên văn)

### 1. Job 116890600397 (Run #38875851037, API 35)

```text
2026-10-16T08:50:12.3620843Z PASS mở app vào Trang chủ
2026-10-16T08:50:57.995 W/Capacitor/Console( 2099): File: https://localhost/online.js - Line 51 - Msg: Connecting to a non-secure WebSocket server from a secure origin is deprecated.
2026-10-16T08:50:58.1270504Z FAIL app kết nối máy chủ
2026-10-16T08:51:13.040 W/Capacitor/Console( 2099): File: https://localhost/online.js - Line 51 - Msg: Mixed Content: The page at 'https://localhost/' was loaded over HTTPS, but attempted to connect to the insecure WebSocket endpoint 'ws://10.0.2.2:8790/ws'. This endpoint should be available via WSS. Insecure access is deprecated.
2026-10-16T08:51:28.102 W/Capacitor/Console( 2099): File: https://localhost/online.js - Line 51 - Msg: Mixed Content: The page at 'https://localhost/' was loaded over HTTPS, but attempted to connect to the insecure WebSocket endpoint 'ws://10.0.2.2:8790/ws'. This endpoint should be available via WSS. Insecure access is deprecated.
```

### 2. Bước 'Nhật ký máy chủ' của job 116890600397 (`cat "$RUNNER_TEMP/server.log"`)

```text
Cờ Caro đang chạy: http://localhost:8790
(Chưa đặt GOOGLE_CLIENT_ID – nút đăng nhập Google sẽ được ẩn)
(Chưa đặt SMTP_URL – tính năng quên mật khẩu qua email sẽ tắt)
```

*(Ghi chú: `server.js` hiện tại không in log khi có kết nối WebSocket mới, do đó từ log server không thể khẳng định máy chủ có nhận được packet TCP/WS từ emulator hay không).*

---

## Giả thuyết và Bằng chứng

### Giả thuyết 1: Cạc mạng ảo (QEMU loopback 10.0.2.2) của máy ảo Android 35 bị nghẽn ngắt quãng

- **Bằng chứng thuận**: 
  - Trong mẫu khảo sát chưa có lượt re-run trên cùng commit; tuy nhiên ở các lượt chạy sau trên cùng nhánh (commit tiếp theo) thì bài Android 35 đều PASS bình thường:
    - Nhánh `claude/scrypt-async`: Run #38888016220 (commit `2467d16`) job API 35 đỏ, nhưng ở commit kế tiếp `73069cf` (Run #38888049420) job `Android 35` (Job ID `116930516877`) **PASS xanh**.
    - Nhánh `agy/report-41`: Run #38875851037 (commit `a23ebc9`) job API 35 đỏ, nhưng ở commit kế tiếp `719aeb6` (Run #38877259408) job `Android 35` (Job ID `116895236686`) **PASS xanh**.
  - Hoàn toàn không xuất hiện trên API 34 (0/60 job).
- **Bằng chứng nghịch**: Chưa xác định được phía máy chủ có nhận được packet hay bị drop ở tầng TCP do `server.js` không ghi log socket handshake.

### Giả thuyết 2: Chromium WebView trên Android 35 siết cảnh báo Mixed Content (`https://` gọi `ws://`)

- **Bằng chứng thuận**: 
  - Logcat ở cả 2 lần đều ghi nhận 5 dòng cảnh báo `Mixed Content: The page at 'https://localhost/' was loaded over HTTPS, but attempted to connect to the insecure WebSocket endpoint 'ws://10.0.2.2:8790/ws'`.
  - Android 35 sử dụng phiên bản WebView hệ thống mới hơn Android 34.
- **Bằng chứng nghịch**: 46 lượt chạy khác của API 35 vẫn kết nối thành công tới `ws://10.0.2.2:8790` dù có cùng dòng cảnh báo deprecation này, chứng tỏ cảnh báo không chặn cứng kết nối mà chỉ có thể gây delay trong một số điều kiện tải CPU cao.

---

## Môi trường kiểm thử

- **Workflow**: `App Caro (Android / iOS)` (`.github/workflows/app.yml`).
- **Runner**: `ubuntu-latest` (GitHub Actions hosted runner).
- **Target Images**:
  - Android 34: `system-images;android-34;google_apis;x86_64`
  - Android 35: `system-images;android-35;google_apis;x86_64`
