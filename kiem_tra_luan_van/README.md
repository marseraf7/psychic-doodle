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

Một câu được coi là **đã dẫn nguồn** khi có `[N]`, `(Иванов, 2010)`, `Иванов (2010)` hoặc chú
thích chân trang của Word, **hoặc** khi một câu phía sau trong cùng đoạn có tham chiếu (kiểu
viết một `[N]` ở cuối đoạn cho cả đoạn). Trích dẫn `«...»` kéo dài qua nhiều câu vẫn được nhận ra.

Nếu một tài liệu nguồn gần như không có chữ (PDF scan chưa OCR, file lỗi), báo cáo sẽ ghi rõ
tài liệu đó **không được so sánh**. PDF scan cần OCR trước khi đưa vào `nguon/`.

Báo cáo còn liệt kê **ký tự bất thường**: chữ Latin lẫn trong từ Nga (thường do chép từ PDF),
ký tự ẩn (zero-width, soft hyphen), chữ trắng hoặc chữ cỡ rất nhỏ trong .docx. Antiplagiat gắn
cờ *«подозрительный документ»* với những thứ này ngay cả khi chúng xuất hiện do vô tình,
nên hãy sửa lại.

> Công cụ chỉ so với **những nguồn bạn đưa vào**. Antiplagiat so với cơ sở dữ liệu lớn hơn
> nhiều, nên kết quả ở đây chỉ để biết chỗ cần sửa, không dự đoán được con số của Antiplagiat.

**Giới hạn đã biết**

- Chỉ phát hiện đoạn giữ nguyên thứ tự từ. Đoạn đã diễn đạt lại (đổi trật tự, đổi từ) không bị
  tô màu, nhưng nếu ý đó lấy từ tài liệu khác thì **vẫn phải dẫn nguồn**.
- Chỉ phát hiện từ **lẫn** chữ Latin và chữ Nga. Từ viết hoàn toàn bằng chữ Latin trông giống
  chữ Nga (vd. `ccopa`) không bị phát hiện.
- Chữ trong hộp văn bản (text box), header/footer không được đọc.
- File `.txt` bị ngắt dòng cứng được nối lại tự động; nếu kết quả tách câu lạ, hãy dùng `.docx`.

## 2a. Kiểm tra trích dẫn: `kiem-tra-dan`

```
python kiem_tra_luan_van.py kiem-tra-dan --ban-thao ban_thao.docx
```

Công cụ tìm tiêu đề `Список литературы` / `Список использованных источников` / `Библиографический
список` (tiêu đề phải đứng riêng một dòng). Nhận cả 3 kiểu trích dẫn: số `[N]` (số ≥ 1000 như
`[2015]` được coi là năm, bỏ qua), tác giả–năm `(Иванов, 2010)` / `Иванов (2010)`, và chú thích
chân trang/cuối bài của Word (đọc cả nội dung chú thích). Công cụ báo:

- `[N]` trỏ tới số không có trong danh mục
- trích dẫn tác giả–năm mà tác giả không có trong danh mục
- mục trong danh mục chưa được dẫn lần nào (theo số, theo họ tác giả, hoặc theo họ xuất hiện
  trong chú thích chân trang)
- trích nguyên văn `«...»` (từ 6 từ trở lên) nhưng thiếu tham chiếu (trước hoặc ngay sau trích
  dẫn), hoặc thiếu số trang `с.` (với chú thích chân trang: số trang phải có trong chú thích)
- mục thiếu năm, thiếu số trang, thiếu `URL:` hoặc `дата обращения`, hoặc dùng `-` thay cho ` – `

## 2b. Tạo danh mục theo ГОСТ Р 7.0.100-2018: `dinh-dang`

```
python kiem_tra_luan_van.py dinh-dang --csv tai_lieu.csv [--giu-thu-tu]
```

Kết quả gồm `ket_qua/DANH_MUC_TAI_LIEU.docx` (Times New Roman 14, giãn dòng 1,5) và bản `.txt`.
Mặc định danh mục được sắp theo bảng chữ cái, tài liệu tiếng Nga trước, tiếng nước ngoài sau.

Các cột CSV (dấu phân cách `,` hoặc `;`, mã hóa UTF-8 hoặc cp1251 của Excel tiếng Nga đều được).
Dòng thiếu thông tin bắt buộc hoặc ghi loại không hợp lệ sẽ bị **bỏ qua và báo rõ số dòng**,
không tạo mục sai:

| Loại | Cột bắt buộc |
|---|---|
| `sach` | `ten`, `thanh_pho`, `nam`, `so_trang` |
| `bai_bao` | `ten`, `tap_chi`, `nam`, `trang` |
| `luan_an`, `tom_tat` | `tac_gia`, `ten`, `thanh_pho`, `nam`, `so_trang` |
| `web` | `ten`, `url`, `ngay_truy_cap` |

Cột `loai` chấp nhận cả tiếng Việt có dấu (`Sách`, `bài báo`, `luận án`), tiếng Nga (`Книга`,
`Статья`) và tiếng Anh (`book`, `article`).

| Cột | Dùng cho | Ví dụ |
|---|---|---|
| `loai` | tất cả | `sach`, `bai_bao`, `luan_an`, `tom_tat` (автореферат), `web` |
| `tac_gia` | tất cả | `Выготский Л. С.; Лурия А. Р.` (cách nhau bằng `;`; `Л. С. Выготский` cũng được) |
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
