# Báo cáo #96 — Đo độ ổn định `boat-rapfi.e2e.js` trên WebKit (10 × 2 lượt)

Người đo: Baxter · Ngày: 23/10/2026

## Kết luận

- Nhánh chính hiện tại (`bae2ba5`, sau PR #88): **9/10 lượt đạt**, 1 lượt trượt ở bước chờ Rapfi-CARO (luật Việt Nam) sẵn sàng, kéo theo 5 bước sau — không sập trang, không lỗi JS.
- Nhánh trước PR #88 (`6c73db6`): **10/10 lượt đạt**.
- Nhận định: đây là **chập chờn ở bước khởi động/chờ Rapfi sẵn sàng trên WebKit**, không phải hồi quy của PR #88 và không phải lỗi code sản phẩm — bước trượt mỗi lần một khác (đối chiếu lịch sử CI), trang tự hồi phục ngay trong cùng lượt trượt sau khi tải lại. Không chặn phát hành; đề xuất ở cuối báo cáo.

## Môi trường và cách chạy

| Hạng mục | Giá trị |
|---|---|
| Máy | Máy ảo Linux x86_64 (kernel 7.0.0-39), Node v24.22.1 |
| Trình duyệt | Playwright WebKit build 2215 (`E2E_BROWSER=webkit`), chạy trực tiếp, **không** qua `retry-crash.js` |
| Mạng Rapfi | Thư mục local `RAPFI_NETS` (4 file theo commit `e32ad77`, đúng công thức CI trong `.github/workflows/test.yml`) — bài e2e tự sao vào chỗ khi chạy WebKit |
| Lệnh mỗi lượt | `E2E_BROWSER=webkit RAPFI_NETS=$HOME/rapfi-nets E2E_OUT=<thư mục riêng> /usr/bin/time -v node caro/tests/e2e/boat-rapfi.e2e.js` |
| Trạng thái đo | `bae2ba5` (nhánh chính tại thời điểm đo) và `6c73db6` (trước PR #88), mỗi trạng thái một worktree riêng, máy không chạy việc nặng nào khác trong lúc đo |
| Ghi nhận | Mã thoát, thời gian tường + RAM đỉnh (cột của tiến trình node, theo `/usr/bin/time -v`), dòng kết luận của bài, bước lỗi từng lượt |

## Kết quả tổng hợp

| Trạng thái | Đạt | Trượt | Thời gian/lượt | RAM đỉnh |
|---|---|---|---|---|
| `bae2ba5` (mới) | 9/10 | 1 (lượt 10) | 57–81 giây, trung bình 63 | 1,24–1,43 GB |
| `6c73db6` (cũ) | 10/10 | 0 | 59–67 giây, trung bình 63 | 1,31–1,40 GB |

- **Sập trang (crash): 0/20 lượt.**
- Thời gian và RAM hai trạng thái tương đương — không thấy hồi quy hiệu năng sau PR #88.

## Lượt trượt duy nhất: mới, lượt 10

Bước OK cuối trước khi trượt: `Renju: BOAT đi nước trong sách renju-rapfi` (hai luật trước — tiêu chuẩn, Renju — Rapfi đều sẵn sàng và đi bình thường ngay trong lượt này).

6 bước KHÔNG đạt, tất cả bắt đầu từ một gốc:

```
FAIL luật Việt Nam: Rapfi-CARO sẵn sàng
FAIL luật Việt Nam: Rapfi-CARO đi (rapfi 5, nhường 1)
FAIL luật Việt Nam: BOAT đi nước trong sách vn-rapfi — {"got":[0,-1],"want":[1,1]}
FAIL Rapfi-CARO biết luật Việt Nam: ba mở → thắng — null
FAIL phân tích: Worker Rapfi thứ hai sẵn sàng
FAIL phân tích hai Worker: đủ 9 thế, Worker phụ chấm 0 thế (0 ms)
```

Ngay sau đó, vẫn trong lượt này: `OK sau khi tải lại trang: Rapfi sẵn sàng từ bộ nhớ đệm`, và các bước cuối (`không lỗi JS / CSP`, `không có lỗi JS`) đều đạt — tức Worker Rapfi-CARO không lên kịp trong cửa sổ chờ của bài ở lần khởi động đó, các bước phụ thuộc sập dây chuyền, sản phẩm tự hồi phục khi tải lại.

Đối chiếu lịch sử CI khiến Issue này ra đời: các lần đỏ trên CI trượt ở *các bước khác nhau* ("phân tích: lượt kỹ do Rapfi chấm", "luật tiêu chuẩn: mạng sẵn sàng", "Rapfi đi", một lần sập trang) và xanh khi chạy lại. Lượt trượt lần này rơi vào bước "luật Việt Nam: Rapfi-CARO sẵn sàng" — lại một bước khác, cùng một họ: **chờ Rapfi sẵn sàng trên WebKit**.

## Nhận định: test, code hay môi trường?

- **Không phải hồi quy code sau PR #88:** cùng bài, cùng máy — trạng thái mới đạt 9/10 và trạng thái cũ 10/10; khác biệt 1 lượt nằm trong nhiễu của hiện tượng chập chờn (cả hai trạng thái đều có thể trượt ở các bước chờ Rapfi này; CI từng đỏ ở cả hai phía của mốc #88). Các chỉ số thời gian/RAM không đổi.
- **Không phải lỗi sản phẩm:** khi Rapfi-CARO không sẵn sàng, BOAT vẫn đi bằng engine dự phòng (bước `luật Việt Nam: BOAT đi` đạt), và sau tải lại trang Rapfi lên bình thường từ bộ nhớ đệm. Hành vi người dùng thật gặp phải là đúng thiết kế.
- **Là chập chờn của bài kiểm trên WebKit:** điểm chung của mọi lần trượt (lần này + lịch sử CI) là các bước *chờ Worker Rapfi sẵn sàng* — khởi động WASM + nạp mạng NNUE trong WebKit có phương sai lớn, thỉnh thoảng vượt cửa sổ chờ của bài. Bài hiện không ghi lại lỗi/cảnh báo từ Worker khi chờ thất bại nên không truy được sâu hơn từ log.

## Đề xuất

1. **CI giữ nguyên cơ chế chạy lại cho job `rapfi-e2e (webkit)`** (đã có `retry-crash.js`): một lượt đỏ đơn lẻ ở họ bước chờ Rapfi được coi là chập chờn đã biết, chạy lại trước khi điều tra. Không cần đổi code vì kết quả đo này.
2. **Nâng cấp bài kiểm (việc nhỏ, làm sau 1.0 cũng được):** khi bước "sẵn sàng" trượt, bài nên ghi kèm thông điệp lỗi gần nhất của Worker Rapfi và thời gian đã chờ — để lần trượt sau truy được nguyên nhân thay vì chỉ biết "không sẵn sàng". Có thể cân nhắc cho riêng bước nạp mạng luật Việt Nam một lần chờ lại sau khi tải lại trang (đúng cách sản phẩm tự hồi phục), nhưng phải ghi rõ trong log là đã dùng lần chờ lại, tránh che giấu chập chờn.
3. **Không chặn phát hành 1.0** vì kết quả này.

## Số liệu từng lượt

| Trạng thái | Lượt | Kết quả | Thời gian | RAM đỉnh |
|---|---|---|---|---|
| mới `bae2ba5` | 1 | đạt | 1:20.91 | 1.240.680 KB |
| mới | 2 | đạt | 1:04.18 | 1.432.168 KB |
| mới | 3 | đạt | 0:59.61 | 1.378.736 KB |
| mới | 4 | đạt | 1:01.78 | 1.398.308 KB |
| mới | 5 | đạt | 0:58.58 | 1.367.424 KB |
| mới | 6 | đạt | 1:01.03 | 1.359.116 KB |
| mới | 7 | đạt | 1:00.53 | 1.358.316 KB |
| mới | 8 | đạt | 1:00.15 | 1.359.964 KB |
| mới | 9 | đạt | 1:03.83 | 1.368.200 KB |
| mới | 10 | **trượt (6 bước, xem trên)** | 0:57.38 | 1.395.348 KB |
| cũ `6c73db6` | 1 | đạt | 1:06.83 | 1.393.612 KB |
| cũ | 2 | đạt | 0:59.91 | 1.383.800 KB |
| cũ | 3 | đạt | 1:01.04 | 1.379.452 KB |
| cũ | 4 | đạt | 0:59.36 | 1.355.536 KB |
| cũ | 5 | đạt | 1:04.78 | 1.400.116 KB |
| cũ | 6 | đạt | 1:04.31 | 1.310.020 KB |
| cũ | 7 | đạt | 1:00.99 | 1.373.544 KB |
| cũ | 8 | đạt | 1:06.78 | 1.354.108 KB |
| cũ | 9 | đạt | 1:01.19 | 1.377.892 KB |
| cũ | 10 | đạt | 1:00.46 | 1.380.264 KB |

Log đầy đủ từng lượt và ảnh chụp của lượt trượt Baxter giữ ở máy local (`~/workspace/caro-review/logs/96/`), cung cấp khi cần.
