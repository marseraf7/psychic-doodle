# Báo cáo: Tìm bài unit test chập chờn (npm run coverage × 20) (#41)

**Kết luận**: Qua 20 lần chạy `npm run coverage` độc lập trên cùng commit, phát hiện **3 bài kiểm thử bị chập chờn (flaky)**. Nguyên nhân chủ yếu do biến động thời gian tìm kiếm của engine cờ khi chấm thế cờ khiến phân loại nước đi thay đổi giữa `inacc` và `mistake` (`caro/tests/study.test.js`), cùng 2 bài liên quan đến race condition thời gian đóng phòng/chống spam (`server/test/tour.test.js`).

---

### 1. Bảng tổng hợp các bài test chập chờn

| STT | Tên bài kiểm thử | File | Số lần fail / 20 | Tỉ lệ lỗi | Thời lượng (duration_ms) |
|:---:|---|---|:---:|:---:|:---:|
| 1 | ..\\caro\\tests\\study.test.js | `caro/tests/study.test.js` | **7/20** | 35% | N/A |
| 2 | Arena: mất kết nối -> điểm tính ngay; ban tổ chức cho đấu lại -> trả lại điểm, ghép lại hai người | `server/test/tour.test.js` | **4/20** | 20% | N/A |
| 3 | chống spam mở trang giải: dùng lại phần chung đã lưu, giới hạn lượt theo IP, hết lượt thì nhận ở nhịp sau | `server/test/tour.test.js` | **1/20** | 5% | N/A |

---

### 2. Trích đoạn lỗi chi tiết (Tối đa 20 dòng mỗi lỗi)

#### Bài: `..\\caro\\tests\\study.test.js` (7/20 lần fail)
```tap
not ok 8 - ..\\caro\\tests\\study.test.js
  ---
  duration_ms: 146586.8932
  location: 'C:\\Users\\HP\\.gemini\\antigravity-ide\\scratch\\psychic-doodle\\caro\\tests\\study.test.js:1:1'
  failureType: 'testCodeFailure'
  exitCode: 1
  signal: ~
  error: 'test failed'
  code: 'ERR_TEST_FAILURE'
  ...
```

#### Bài: `Arena: mất kết nối -> điểm tính ngay; ban tổ chức cho đấu lại -> trả lại điểm, ghép lại hai người` (4/20 lần fail)
```tap
not ok 105 - Arena: mất kết nối -> điểm tính ngay; ban tổ chức cho đấu lại -> trả lại điểm, ghép lại hai người
  ---
  duration_ms: 636886.5205
  location: 'C:\\Users\\HP\\.gemini\\antigravity-ide\\scratch\\psychic-doodle\\server\\test\\tour.test.js:575:1'
  failureType: 'testCodeFailure'
  error: 'Hết giờ chờ welcome () => true | lỗi: []'
  code: 'ERR_TEST_FAILURE'
  stack: |-
    Timeout._onTimeout (C:\Users\HP\.gemini\antigravity-ide\scratch\psychic-doodle\server\test\tour.test.js:63:45)
    listOnTimeout (node:internal/timers:594:17)
    process.processTimers (node:internal/timers:529:7)
  ...
```

#### Bài: `chống spam mở trang giải: dùng lại phần chung đã lưu, giới hạn lượt theo IP, hết lượt thì nhận ở nhịp sau` (1/20 lần fail)
```tap
not ok 103 - chống spam mở trang giải: dùng lại phần chung đã lưu, giới hạn lượt theo IP, hết lượt thì nhận ở nhịp sau
  ---
  duration_ms: 825.7403
  location: 'C:\\Users\\HP\\.gemini\\antigravity-ide\\scratch\\psychic-doodle\\server\\test\\tour.test.js:471:1'
  failureType: 'testCodeFailure'
  error: 'trả ngay khoảng 40 lần (hết lượt theo IP): 47'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: true
  actual: false
  operator: '=='
  stack: |-
    TestContext.<anonymous> (C:\Users\HP\.gemini\antigravity-ide\scratch\psychic-doodle\server\test\tour.test.js:495:12)
    runNextTicks (node:internal/process/task_queues:65:5)
    process.processTimers (node:internal/timers:526:9)
    async Test.run (node:internal/test_runner/test:932:9)
    async Test.processPendingSubtests (node:internal/test_runner/test:629:7)
  ...
```


---

### 3. Phân tích nguyên nhân gốc rễ & Gợi ý cho Claude Code sửa

1. **`study.test.js` (Dòng 120)**:
   - Đoạn kiểm tra: `assert.deepStrictEqual(A.keyMoments(r).filter((m) => m.cls !== 'inacc').map((m) => m.i), [5]);`
   - Cơ chế lỗi: Nước 1, 2, 3 khi engine phân tích có thể bị phân loại là `mistake` (thay vì `inacc`) tuỳ theo tốc độ CPU và độ sâu duyệt trong thời gian `ms: 60`. Khi đó mảng trả về là `[1, 2, 3, 5]` hoặc `[2, 5]` thay vì `[5]`.
   - Đề xuất sửa: Kiểm tra riêng `r.moves[5].cls === 'blunder'` và đảm bảo `A.keyMoments(r)` chứa nước 5, hoặc nới bộ lọc loại bỏ cả `mistake` nhẹ ở các nước khai cuộc.

2. **`server/test/tour.test.js` (Arena mất kết nối & Chống spam)**:
   - Cơ chế lỗi: Race condition thời gian chờ WebSocket ngắt kết nối (`TOUR_NOSHOW_MS`) và cửa sổ giới hạn lượt IP (`RATE_LIMIT`) khi máy chạy dồn tải đo coverage.
   - Đề xuất sửa: Tăng nhẹ khoảng chờ timeout hoặc dùng đồng hồ giả (fake timers / mock clock) trong unit test máy chủ.

---

### Môi trường & Commit kiểm thử
- **Commit**: `a3c3a575d41708993206657a940cccd020d38575` (`claude/vibrant-dirac-222bq2`)
- **Hệ điều hành**: Windows_NT 10.0.19045 x64
- **CPU**: 4 cores, Intel(R) Core(TM) m7-6Y75 CPU @ 1.20GHz
- **Node**: v22.13.1
- **Lệnh chạy**: `npm run coverage` (15 file test, 112 bài kiểm thử)

---
_Thực hiện bởi Antigravity (Agent: agy)_
