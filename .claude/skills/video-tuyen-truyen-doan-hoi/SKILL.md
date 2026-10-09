---
name: video-tuyen-truyen-doan-hoi
description: Dựng video tuyên truyền phong cách Đoàn Thanh niên / Hội Sinh viên Việt Nam (nền đỏ cờ, huy hiệu, thành phố vàng, số liệu %, montage hoạt động đoàn viên, lời dẫn chính luận) bằng Remotion. Có sẵn bộ khung 9 loại cảnh lấy từ video mẫu. Dùng skill này bất cứ khi nào người dùng muốn làm video, clip, phóng sự ngắn, video giới thiệu, video tổng kết, video tuyên truyền nghị quyết hoặc chương trình hành động cho Đoàn, Hội, Đảng, chi đoàn, liên chi, Hội Sinh viên (trong nước hay ở nước ngoài, ví dụ tại Nga), kể cả khi họ chỉ nói "làm video giống mẫu", "dựng clip đỏ kiểu Đoàn", "video số liệu 100% đoàn viên" hoặc gửi một video mẫu để học phong cách.
---

# Video tuyên truyền phong cách Đoàn – Hội

Skill này đóng gói phong cách của một video tuyên truyền chuẩn của Trung ương Đoàn thành quy trình và bộ khung Remotion. Nhờ đó Claude dựng được video mới cùng chất lượng: chỉ cần viết kịch bản dạng JSON và đặt tư liệu vào đúng chỗ, không phải lập trình hiệu ứng lại từ đầu.

## Tài nguyên

| Đường dẫn | Dùng khi |
|---|---|
| `references/phan-tich-video-mau.md` | Trước khi viết kịch bản: dòng thời gian, bảng màu, nhịp dựng, cấu trúc lời dẫn của video mẫu |
| `references/ngu-phap-canh.md` | Khi viết `kich-ban.json`: 9 loại cảnh, trường dữ liệu, độ dài khuyến nghị, cách thêm cảnh mới |
| `references/loi-dan-va-am-thanh.md` | Khi viết lời dẫn, chọn giọng đọc, khớp thời lượng, chuẩn hóa âm lượng |
| `assets/template/` | Bộ khung Remotion: chép ra thư mục dự án rồi sửa `src/kich-ban.json` |
| `scripts/phan_tich_video.sh` | Người dùng gửi thêm video mẫu mới: trích tấm ghép khung hình, điểm cắt, độ to, phiên âm |
| `scripts/phien_am.py` | Lấy mốc thời gian từng câu của file giọng đọc để khớp cảnh |

## Quy trình

### 1. Nắm yêu cầu
Hỏi gọn trong một lượt (bỏ qua câu đã rõ):
- Chủ đề và văn bản gốc (nghị quyết, chương trình, báo cáo). Xin file hoặc đường link: số liệu và trích dẫn phải lấy từ đây.
- Đơn vị thực hiện và đối tượng xem: logo nào xuất hiện.
- Thời lượng (mặc định 2–3 phút), khung hình (16:9; 9:16 nếu đăng Reels hoặc TikTok).
- Tư liệu sẵn có: ảnh, video hoạt động, logo PNG chính thức, giọng đọc, nhạc.

Nếu người dùng gửi video mẫu mới, chạy `scripts/phan_tich_video.sh <video> <thư-mục> --phien-am`. Xem các tấm ghép khung hình, rồi ghi khác biệt so với `phan-tich-video-mau.md` trước khi dựng.

### 2. Viết lời dẫn và bảng phân cảnh
Viết theo cấu trúc 7 bước trong `loi-dan-va-am-thanh.md`, độ dài ≈ số giây × 3,7 âm tiết. Sau đó lập bảng cho người dùng duyệt:

| # | Lời dẫn | Loại cảnh | Tư liệu cần | Giây |
|---|---|---|---|---|

Lý do nên chốt bảng trước khi dựng: sửa chữ trong bảng rẻ hơn nhiều so với render lại. Đồng thời người dùng biết chính xác cần gom ảnh hay video gì cho từng câu.

Nguyên tắc chọn cảnh (rút từ video mẫu):
- Câu nêu văn bản → `van-ban`. Câu nêu giá trị hay phẩm chất → `tu-khoa`. Câu có con số → `so-lieu` (mỗi chỉ tiêu một thẻ). Sang phần mới → `chuong`.
- Câu kể hoạt động → montage `footage` 1–2 giây mỗi cú, hoặc `luoi-anh` khi liệt kê nhiều hoạt động.
- Mở đầu bằng `mo-dau`, tổng kết bằng `tuong-anh`, khép bằng `ket`.
- Xen kẽ cảnh đồ họa (đỏ) và footage (màu thật) để nhịp không đơn điệu. Không đặt quá 2 cảnh đồ họa đỏ liền nhau, trừ chuỗi thẻ số liệu.

### 3. Dựng dự án
```bash
cp -r <đường-dẫn-skill>/assets/template <thư-mục-dự-án>/video-<chu-de>
cd <thư-mục-dự-án>/video-<chu-de> && npm install
```
- Ghi bảng phân cảnh vào `src/kich-ban.json` (cú pháp từng cảnh: `references/ngu-phap-canh.md`).
- Đặt tư liệu vào `public/`. Trường nào chưa có tư liệu thì để trống: cảnh sẽ hiện khung giữ chỗ kèm `ghiChu`, đủ để duyệt bố cục.
- Muốn đổi màu, phông chữ: sửa `src/theme.ts`. Muốn thêm loại cảnh: làm theo mục "Mở rộng" trong `ngu-phap-canh.md`.

Trên máy không có Chrome cho Remotion, đặt `REMOTION_BROWSER` trỏ tới Chromium có sẵn. Ví dụ trên Claude Code web: `export REMOTION_BROWSER=/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell`.

### 4. Kiểm tra trước khi render cả video
```bash
npx tsc --noEmit
npx remotion still Video out/kiem-tra.png --frame=<khung giữa mỗi loại cảnh>
```
Mở ảnh và tự soát: chữ tiếng Việt đủ dấu, không tràn khung hay xuống dòng xấu, logo không méo, chữ vẫn đọc được trên nền. Ghép nhiều khung thành một tấm (ffmpeg `tile`) để soát nhanh. Sửa xong mới render cả video, vì render cả video tốn vài phút.

### 5. Giọng đọc, nhạc, render
- Khớp `giay` với file giọng đọc bằng `scripts/phien_am.py` (chi tiết trong `loi-dan-va-am-thanh.md`).
- `npm run render` → `out/video.mp4`, rồi chuẩn hóa về −15 LUFS.
- Gửi video cho người dùng kèm danh sách: cảnh nào còn khung giữ chỗ, số liệu nào cần xác minh.

## Những điều không làm
- **Không tự vẽ lại** búa liềm, huy hiệu Đoàn, logo Hội, Quốc kỳ. Chỉ dùng file PNG chính thức người dùng cung cấp. Khi chưa có, bộ khung hiện ngôi sao vàng giữ chỗ để nhắc. Vẽ sai tỉ lệ, sai màu biểu tượng là lỗi nghiêm trọng với loại video này.
- **Không bịa số liệu, trích dẫn, tên người, chức danh.** Thiếu nguồn thì ghi rõ "(cần xác minh)" trong bảng phân cảnh và hỏi người dùng.
- **Không dùng ảnh người thật lấy ngẫu nhiên trên mạng** làm tư liệu chính. Dùng ảnh của đơn vị, hoặc ảnh, video stock có giấy phép.
- Không clone giọng người thật khi chưa có sự đồng ý của họ.
