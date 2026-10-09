# Ngữ pháp cảnh: 9 loại cảnh trong bộ khung Remotion

Mọi cảnh được khai báo trong `src/kich-ban.json` → mảng `canh`. Trường chung:

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `loai` | chuỗi | Một trong 9 loại dưới đây |
| `giay` | số | Thời lượng cảnh (giây, cho phép số lẻ như 1.8) |
| `chuyen` | `"cat"` \| `"loe-sang"` \| `"zoom-mo"` | Hiệu ứng **vào** cảnh. Mặc định cắt thẳng |
| `ghiChu` | chuỗi | Mô tả cú máy cần tìm; hiện trên khung giữ chỗ khi chưa có tư liệu |

Đường dẫn ảnh, video, logo đều tương đối so với `public/`. Trường tư liệu để trống thì cảnh hiện khung "[ ẢNH / VIDEO ]" kèm `ghiChu`, để duyệt bố cục trước khi có tư liệu thật.

---

## `mo-dau`: Mở đầu (5–8 giây)
Nền đỏ có vòng cung, biểu tượng bật ra, tiêu đề vụt vào kèm nhòe, thành phố vàng mọc lên, cuối cảnh chữ lao vào máy.
```json
{ "loai": "mo-dau", "giay": 6, "bieuTuong": ["logo-dang.png"], "tieuDe": "NGHỊ QUYẾT", "phuDe": "ĐẠI HỘI ĐẠI BIỂU TOÀN QUỐC LẦN THỨ XIV CỦA ĐẢNG" }
```
Tiêu đề nên ≤ 18 ký tự. Phụ đề ≤ 50 ký tự.

## `footage`: Cú máy tư liệu (1–3 giây)
```json
{ "loai": "footage", "giay": 1.8, "nguon": "footage/flycam-cau.mp4", "chuyenDong": "zoom-ra", "chuyen": "loe-sang" }
```
`chuyenDong`: `zoom-vao` | `zoom-ra` | `lia-trai` | `lia-phai`. Đổi hướng xen kẽ giữa các cú liền nhau. `chuTren` (tùy chọn) là chữ lớn mờ chạy ngang trên footage.
Montage minh họa một câu lời dẫn: 3–6 cú × 1–2 giây. Dùng `"chuyen": "loe-sang"` cho cú đầu tiên sau một cảnh đồ họa.

## `van-ban`: Trích văn bản (8–20 giây)
Pha 1 (~42% thời lượng): trang giấy bay vào cạnh logo và tên văn bản. Pha 2: cận cảnh, các đoạn khác tối đi, đoạn `toSang` được soi sáng.
```json
{ "loai": "van-ban", "giay": 14, "logo": "logo-doan.png", "tieuDe": "Chương trình hành động của Đoàn TNCS Hồ Chí Minh…", "dong": ["…", "1. Chương trình 1: …", "- Mục tiêu: …"], "toSang": [1] }
```
Chép **nguyên văn** từ văn bản thật. 4–7 đoạn là đẹp. Mỗi đoạn ≤ 300 ký tự.

## `tu-khoa`: Từ khóa (5–8 giây)
Cột ô kính xanh ngọc trượt vào lần lượt, chữ nghiêng gõ từng ký tự; tranh minh họa bên phải (tùy chọn).
```json
{ "loai": "tu-khoa", "giay": 6, "bangRon": "THANH NIÊN VIỆT NAM", "tuKhoa": ["Lý tưởng cách mạng", "Lòng yêu nước", "Khát vọng cống hiến", "Trách nhiệm với đất nước, xã hội"], "anhMinhHoa": "minh-hoa/thanh-nien-cam-co.png" }
```
Tối đa 5 từ khóa, mỗi từ khóa ≤ 32 ký tự. Thời điểm các ô xuất hiện tự chia đều trong 55% đầu cảnh. Nên khớp với lúc giọng đọc nói từ đó.

## `so-lieu`: Thẻ số liệu (4–7 giây mỗi chỉ tiêu)
```json
{ "loai": "so-lieu", "giay": 5, "nam": "2026", "so": 100, "donVi": "%", "chuThich": "Đoàn viên học tập Nghị quyết của Đảng", "anh": "anh/hoi-nghi-1.jpg" }
```
Số đếm lên trong khoảng 1 giây đầu. Dùng một ảnh hoạt động khác nhau cho mỗi thẻ. `chuThich` ≤ 60 ký tự (tối đa 2 dòng). Chỉ đưa số liệu có nguồn.

## `chuong`: Thẻ chuyển chương (3–4 giây)
```json
{ "loai": "chuong", "giay": 3.5, "chu": "16 nội dung, giải pháp" }
```
Chữ tự in hoa. Rời cảnh bằng vòng xoáy trắng, nên cảnh sau thường là footage cắt thẳng.

## `luoi-anh`: Lưới ảnh (2–4 giây)
```json
{ "loai": "luoi-anh", "giay": 3, "anh": ["a.jpg", "b.jpg", "c.jpg", "d.jpg"] }
```
4 ảnh thành lưới 2×2, từ 6 ảnh trở lên thành lưới 3×2. Hợp với các câu liệt kê nhiều hoạt động cùng lúc.

## `tuong-anh`: Tường ảnh 3D (5–8 giây, dùng ở phần tổng kết)
```json
{ "loai": "tuong-anh", "giay": 6, "anh": ["anh/1.jpg", "anh/2.jpg", "…"], "noiBat": [9, 11, 17, 23] }
```
Lưới 7×5 = 35 ô; ảnh được lặp vòng nếu thiếu. `noiBat` là chỉ số các ô nổi lên có màu. Càng nhiều ảnh khác nhau càng đẹp (≥ 12 ảnh).

## `ket`: Cảnh kết (4–6 giây)
```json
{ "loai": "ket", "giay": 5, "logo": "logo-doan.png", "khauHieu": "Vững lý tưởng – Giàu khát vọng – Trách nhiệm – Cống hiến", "chuyen": "loe-sang" }
```

---

## Mở rộng
- Cảnh mới: tạo `src/canh/TenCanh.tsx` nhận `{ c, dur }`, thêm kiểu vào `types.ts` và một nhánh `case` trong `Video.tsx`.
- `dur` là số khung hình của cảnh. Đừng dùng `useVideoConfig().durationInFrames` trong cảnh, vì giá trị đó là độ dài **cả video**.
- Mọi chuyển động phải tính từ `useCurrentFrame()`. Không dùng `Math.random()`, CSS transition hay animation, vì Remotion render từng khung độc lập.
