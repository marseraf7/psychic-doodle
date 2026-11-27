# Deutsch (de) – ghi chú dịch

Tạo bằng `node server/scripts/new-lang.js add de` (dữ liệu CLDR qua ICU của Node). Quy trình: `docs/quy-trinh-them-ngon-ngu.md`.

| Mục | Giá trị |
| --- | --- |
| Tên tự gọi (CLDR) | Deutsch – **người bản xứ xác nhận** trước khi đổi status |
| Tên tiếng Anh | German |
| Chữ viết (ISO 15924) | Latn |
| Hướng chữ | trái sang phải |
| Loại số nhiều (CLDR) | one, other |
| Intl (ngày giờ, số) | de-DE |
| Trạng thái | hidden (chưa hiện ở ô chọn) |

## Thuật ngữ (điền trước khi dịch)

| Tiếng Anh | Deutsch | Ghi chú |
| --- | --- | --- |
| Caro | Caro | giữ chữ Latin; lần đầu giải thích "Caro (cờ năm quân kiểu Việt Nam)" |
| Gomoku / Renju | | |
| X / O (quân) | X / O | giữ nguyên |
| five in a row | | |
| undo | | nghĩa "hoàn tác nước vừa đi", không phải "chơi lại" |
| resign | | |
| draw | | |
| rematch | | |
| tournament / bracket / round | | |
| rating (Elo) | | |
| puzzle | | |
| room / room code | | |

## Số nhiều

Ngôn ngữ này có các loại: **one, other**. Mặc định viết theo mẫu "Nhãn: {n}" để không phải chia số nhiều. Khi cần đúng ngữ
pháp, thêm dạng riêng cạnh khoá gốc (chỉ với chuỗi có `{n}`): `'khoá|one': '…'`, `'khoá|few': '…'` – i18n.js tự chọn theo
Intl.PluralRules; thiếu dạng thì dùng khoá gốc.

## Danh sách việc

- [ ] Điền bảng thuật ngữ ở trên.
- [ ] Dịch từng file `caro/i18n-<chủ đề>.js` → `caro/i18n/de/<chủ đề>.js`; thêm tên chủ đề vào `i18n_files` của `core.js`.
- [ ] Đủ hết thì `i18n_files: 'all'`.
- [ ] Chữ phía máy chủ `server/src/i18n/de.js` (mẫu `server/src/i18n/ja.js`).
- [ ] Trang tĩnh privacy / connector / licenses / api (xem `docs/van-phong-4-ngon-ngu.md`, mục "Thêm ngôn ngữ").
- [ ] Phông theo chữ viết nếu chữ Latn thiếu trên máy phổ biến (Claude – `caro/lang-scripts.css`).
- [ ] Bài thử: `cd server && node --test test/i18n-langs.test.js test/i18n-script.test.js` xanh.
- [ ] Ảnh chụp 390px: Trang chủ, trong ván, Cài đặt → Ngôn ngữ.
- [ ] Claude đổi status: `node server/scripts/new-lang.js status de mt-draft`; có người bản xứ soát trong game thì `reviewed`.
