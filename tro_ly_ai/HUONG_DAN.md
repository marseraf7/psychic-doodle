# Trợ lý AI local — quản lý dữ liệu laptop cá nhân

Trợ lý chạy **hoàn toàn trên máy của bạn**: đọc, lập chỉ mục và trả lời câu hỏi về tài liệu trên
laptop mà **không gửi gì lên Internet**.

| Việc | Cần Ollama? |
|---|---|
| Tìm file theo tên, thư mục, **nội dung** (Word, Excel, PowerPoint, PDF, txt, mã nguồn…), gõ không dấu vẫn ra | Không |
| Tìm theo **ý nghĩa** (vd "tiền điện" ra cả "hóa đơn EVN") | Có (mô hình `bge-m3`) |
| **Hỏi đáp** với tài liệu, có ghi nguồn [1], [2]… | Có (mô hình `qwen2.5`) |
| Thống kê dung lượng, file/thư mục nặng nhất, file lớn lâu không dùng | Không |
| Tìm file **trùng lặp** (so nội dung, không tự xóa) | Không |
| **Sắp xếp** Downloads vào thư mục con theo loại, **hoàn tác** được | Không |
| Giao diện web cục bộ (chỉ mở trên 127.0.0.1) | Hỏi đáp mới cần |

## Cài đặt (Windows)

1. Cài **Python 3.9+**: <https://www.python.org/downloads/> — nhớ tick *Add python.exe to PATH*.
2. Cài **Ollama**: <https://ollama.com/download>, rồi mở Ollama (biểu tượng ở khay hệ thống).
3. Nhấp đúp **`chay_tro_ly_ai.bat`** → chọn **T** để tải mô hình (khoảng 5 GB, chỉ tải một lần).
4. Chọn **1** để quét. Lần đầu có thể mất vài phút đến vài chục phút; các lần sau chỉ đọc file mới hoặc đã sửa.
5. Chọn **4** để mở giao diện web, hoặc **3** để trò chuyện ngay trong cửa sổ đen.

Không cài Ollama vẫn dùng được tìm kiếm, thống kê, trùng lặp và sắp xếp.

### Chọn mô hình theo máy

| RAM | Mô hình trò chuyện (`mo_hinh_chat`) |
|---|---|
| 8 GB | `qwen2.5:3b` |
| 16 GB | `qwen2.5:7b` (mặc định) |
| 32 GB trở lên, có GPU | `qwen2.5:14b` |

Đổi mô hình: sửa `du_lieu/cau_hinh.json`, rồi chạy `ollama pull <tên mô hình>`.

## Cấu hình — `du_lieu/cau_hinh.json`

File được tạo sẵn ở lần chạy đầu:

```json
{
  "thu_muc_quet": ["D:\\TaiLieu", "C:\\Users\\ban\\Documents"],
  "bo_qua_thu_muc": ["AppData", "node_modules", "..."],
  "mo_hinh_chat": "qwen2.5:7b",
  "mo_hinh_nhung": "bge-m3",
  "dung_ngu_nghia": true,
  "kich_thuoc_toi_da_mb": 50,
  "so_doan_ngu_canh": 6,
  "nguong_ngu_nghia": 0.45
}
```

- `thu_muc_quet` để trống thì quét Desktop, Documents, Downloads (kể cả trong OneDrive).
- Thư mục ẩn (bắt đầu bằng `.`), thư mục hệ thống và thư mục có tên trong `bo_qua_thu_muc` bị bỏ qua.
- File lớn hơn `kich_thuoc_toi_da_mb` chỉ được lưu tên, không đọc nội dung.
- `nguong_ngu_nghia` (0 đến 1): tìm theo nghĩa bỏ các kết quả giống ít hơn ngưỡng này. Thấy nhiều file
  không liên quan thì tăng (vd 0.55); tìm theo nghĩa bỏ sót thì giảm (vd 0.35).
- Ghi sai kiểu (vd `"thu_muc_quet": "D:\\TaiLieu"` thay vì `["D:\\TaiLieu"]`) thì chương trình cảnh báo
  và tự sửa hoặc dùng giá trị mặc định, không chạy sai ngầm.

### OneDrive

File OneDrive **chỉ có trên mạng** (biểu tượng đám mây) chỉ được lưu tên: đọc nội dung sẽ khiến Windows
tải cả file về máy. Muốn trợ lý đọc được nội dung: chuột phải thư mục → **Always keep on this device**,
rồi quét lại. Công cụ tìm trùng lặp cũng bỏ qua các file này.

## Dùng bằng dòng lệnh

```bat
python tro_ly_ai.py kiem-tra
python tro_ly_ai.py quet                       :: hoặc: quet D:\TaiLieu E:\Anh
python tro_ly_ai.py tim "hop dong thue nha"
python tro_ly_ai.py tim "bao cao" --loai "Bảng tính" --trong D:\CongViec
python tro_ly_ai.py hoi "Hợp đồng thuê nhà hết hạn khi nào?"
python tro_ly_ai.py chat
python tro_ly_ai.py thong-ke
python tro_ly_ai.py trung-lap --xuat trung_lap.csv
python tro_ly_ai.py sap-xep                    :: chạy thử trên Downloads
python tro_ly_ai.py sap-xep "D:\Lon xon" --thuc-hien --xac-nhan   :: xem kế hoạch, hỏi lại rồi mới làm
python tro_ly_ai.py hoan-tac
python tro_ly_ai.py giao-dien
```

## Quyền riêng tư và an toàn

- Chỉ kết nối Ollama trên **chính máy này**: địa chỉ khác `localhost` bị từ chối, proxy hệ thống bị bỏ qua.
- File có tên hoặc đuôi nhạy cảm (`mat_khau…`, `password…`, `.env`, `id_rsa`, `.pem`, `.key`, `.kdbx`…)
  **chỉ được lưu tên, không đọc nội dung**, nên không bao giờ lọt vào câu trả lời của AI.
- Chỉ mục nằm trong `du_lieu/chi_muc.sqlite3`. Xóa thư mục `du_lieu` là xóa sạch mọi thứ trợ lý đã lưu.
- Giao diện web chỉ nghe trên `127.0.0.1` và từ chối mọi yêu cầu đến từ trang web khác.
- Tìm trùng lặp luôn so lại file **trên đĩa lúc chạy**, nên file đã sửa sau lần quét không bị báo nhầm là trùng.
- Công cụ **không bao giờ xóa file** của bạn. "Sắp xếp" chỉ di chuyển file ở cấp đầu thư mục, không ghi đè
  file trùng tên (tự thêm ` (1)`), và luôn có nhật ký để **hoàn tác**.

## Cách hoạt động

```
File trên máy ──quét──> đọc chữ (docx/xlsx/pptx/pdf/txt…) ──> chia đoạn ~1200 ký tự
                                                             ├─> SQLite FTS5 (tìm từ khóa, bỏ dấu)
                                                             └─> Ollama bge-m3 (vector ngữ nghĩa)
Câu hỏi ──> tìm từ khóa + tìm theo nghĩa ──trộn (RRF)──> 6 đoạn liên quan nhất
        ──> Ollama qwen2.5 (kèm tổng quan kho dữ liệu) ──> câu trả lời có ghi nguồn [1], [2]
```

Chưa đọc được nội dung: file Office đời cũ (`.doc`, `.xls`, `.ppt` — lưu lại thành `.docx`/`.xlsx`/`.pptx`),
PDF dạng ảnh scan (chưa có OCR), ảnh và video. Các file này vẫn tìm được theo tên và thư mục.

Bộ nhớ: tìm theo nghĩa giữ vector trong RAM (khoảng 2 KB mỗi đoạn, vd 100.000 đoạn ≈ 200 MB).
Lệnh `kiem-tra` cảnh báo khi quá 500 MB. Chưa cài numpy thì tìm theo nghĩa tự tắt khi quá 20.000 đoạn
(file `.bat` tự cài numpy).

## Kiểm tra trên máy thật

Chọn **V** trong menu (hoặc `python kiem_tra_may_that.py`). Chương trình kiểm tra Python, SQLite, OneDrive
(chỉ đọc thuộc tính, không làm tải file), Ollama và mô hình, đo ngưỡng tìm theo nghĩa bằng `bge-m3` thật,
rồi thử quét, tìm và hỏi đáp trên **bộ tài liệu mẫu** trong thư mục tạm. Báo cáo ghi vào
`du_lieu/bao_cao_kiem_tra.txt`, chỉ có số liệu (không có tên file hay nội dung của bạn, tên người dùng
Windows được che thành `~`), nên gửi cho người hỗ trợ được.

## Kiểm thử

```bat
cd tro_ly_ai
python -m unittest test_tro_ly_ai -v
```
