# Tự kiểm tra luận văn tiếng Nga trước khi nộp Antiplagiat

Công cụ giúp bài **thực sự nguyên bản và trích dẫn đúng**, không phải để lách Antiplagiat.
Antiplagiat tách riêng *«цитирования»* (trích dẫn hợp lệ) khỏi *«заимствования»* (mượn không
dẫn nguồn). Vì vậy dẫn nguồn đúng và tự viết phần phân tích là cách đạt tỷ lệ nguyên bản tốt.

## Cài đặt

Python 3.8+ và 2 thư viện:

```
pip install python-docx pypdf
```

Trên Windows chỉ cần double-click `chay_kiem_tra.bat`, thư viện sẽ tự được cài ở lần chạy đầu.

## Chuẩn bị thư mục

```
kiem_tra_luan_van/
├── ban_thao.docx      ← bản thảo của bạn (.docx / .txt / .pdf)
├── nguon/             ← các tài liệu bạn đã đọc/tham khảo (.docx / .txt / .pdf)
├── tai_lieu.csv       ← thông tin tài liệu để tạo danh mục (mẫu: vi_du/tai_lieu.csv)
└── ket_qua/           ← báo cáo được ghi ra đây
```

Các file luận văn và nguồn đã nằm trong `.gitignore`, không bị đẩy lên git.

## 1. Kiểm tra trùng lặp: `trung-lap`

```
python kiem_tra_luan_van.py trung-lap --ban-thao ban_thao.docx --nguon nguon [--nguong 0.5]
```

Kết quả là file `ket_qua/BAO_CAO_TRUNG_LAP.html`. Mỗi câu trùng với nguồn được tô màu, rê chuột lên để xem câu gốc:

| Màu | Ý nghĩa | Nên làm gì |
|---|---|---|
| Đỏ | Trùng nguồn, **không có trích dẫn** | Thêm `[N, с. X]`. Tốt nhất là tóm ý bằng lời của bạn rồi phân tích thêm |
| Vàng | Có dẫn nguồn nhưng chép gần nguyên văn, không có ngoặc kép | Đặt trong `«...»` kèm số trang, hoặc tóm lược bằng lời của bạn |
| Xanh | Trích dẫn trực tiếp đúng cách | Không cần sửa, nhưng đừng để trích dẫn chiếm quá nhiều |

Cách hoạt động: công cụ so các cụm 3 từ có nghĩa liên tiếp sau khi đưa từ về gốc
(`психологии`, `психология` và `психологию` được coi là một). Nhờ vậy câu chỉ đổi cách, giống
hoặc số của từ vẫn bị nhận ra là trùng. Phần «Список литературы» không bị đem đi so.

Báo cáo còn liệt kê **ký tự bất thường**: chữ Latin lẫn trong từ Nga (thường do chép từ PDF),
ký tự ẩn (zero-width, soft hyphen), chữ trắng hoặc chữ cỡ rất nhỏ trong .docx. Antiplagiat gắn
cờ *«подозрительный документ»* với những thứ này ngay cả khi chúng xuất hiện do vô tình,
nên hãy sửa lại.

> Công cụ chỉ so với **những nguồn bạn đưa vào**. Antiplagiat so với cơ sở dữ liệu lớn hơn
> nhiều, nên kết quả ở đây chỉ để biết chỗ cần sửa, không dự đoán được con số của Antiplagiat.

## 2a. Kiểm tra trích dẫn: `kiem-tra-dan`

```
python kiem_tra_luan_van.py kiem-tra-dan --ban-thao ban_thao.docx
```

Công cụ tìm tiêu đề `Список литературы` / `Список использованных источников` / `Библиографический
список` (tiêu đề phải đứng riêng một dòng) rồi báo:

- `[N]` trỏ tới số không có trong danh mục
- mục trong danh mục chưa được dẫn lần nào
- trích nguyên văn `«...»` (từ 6 từ trở lên) nhưng thiếu tham chiếu, hoặc thiếu số trang `с.`
- mục thiếu năm, thiếu số trang, thiếu `URL:` hoặc `дата обращения`, hoặc dùng `-` thay cho ` – `

## 2b. Tạo danh mục theo ГОСТ Р 7.0.100-2018: `dinh-dang`

```
python kiem_tra_luan_van.py dinh-dang --csv tai_lieu.csv [--giu-thu-tu]
```

Kết quả gồm `ket_qua/DANH_MUC_TAI_LIEU.docx` (Times New Roman 14, giãn dòng 1,5) và bản `.txt`.
Mặc định danh mục được sắp theo bảng chữ cái, tài liệu tiếng Nga trước, tiếng nước ngoài sau.

Các cột CSV (dấu phân cách `,` hoặc `;` đều được):

| Cột | Dùng cho | Ví dụ |
|---|---|---|
| `loai` | tất cả | `sach`, `bai_bao`, `luan_an`, `tom_tat` (автореферат), `web` |
| `tac_gia` | tất cả | `Выготский Л. С.; Лурия А. Р.` (Họ trước, cách nhau bằng `;`) |
| `ten`, `thong_tin_them` | tất cả | `Психология деятельности`, `учебное пособие` |
| `bien_tap` | sách | `под редакцией А. Б. Смирнова` |
| `thanh_pho`, `nha_xb`, `nam`, `so_trang`, `isbn` | sách, luận án | `Москва`, `Смысл`, `2005`, `431` |
| `tap_chi`, `tap`, `so`, `trang` | bài báo | `Вопросы психологии`, `66`, `3`, `10-20` |
| `chuyen_nganh`, `bac`, `nganh`, `noi_bao_ve` | luận án | `5.3.1`, `кандидата`, `психологических`, `МГУ` |
| `url`, `ngay_truy_cap`, `ten_trang_web` | web | `https://...`, `12.09.2026` |

Quy tắc đã áp dụng: tài liệu có 1–3 tác giả thì mục bắt đầu bằng tên tác giả đầu; từ 4 tác giả
thì bắt đầu bằng tên tài liệu; từ 5 tác giả thì ghi 3 người đầu kèm `[и др.]`. Sách tiếng nước
ngoài ghi số trang bằng `p.`.

Mỗi trường có thể có yêu cầu riêng (ví dụ bắt buộc ghi `– Текст : непосредственный`). Hãy
đối chiếu với hướng dẫn trình bày của khoa.

## Chạy thử và test

```
python kiem_tra_luan_van.py trung-lap --ban-thao vi_du/ban_thao.txt --nguon vi_du/nguon
python kiem_tra_luan_van.py kiem-tra-dan --ban-thao vi_du/ban_thao.txt
python kiem_tra_luan_van.py dinh-dang --csv vi_du/tai_lieu.csv
python -m pytest tests
```
