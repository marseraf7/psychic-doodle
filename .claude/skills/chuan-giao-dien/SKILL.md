---
name: chuan-giao-dien
description: Chuẩn giao diện chống lặp lỗi hiển thị trong repo Cờ Caro (caro/) – chữ không bị cắt cụt, nút không đè chữ, thanh dính không che ô nhập, không lộ chuỗi mẫu {x}, ô bảng không flex, mô tả theo cấu hình hiệu lực. Dùng mỗi khi viết hoặc sửa HTML / CSS / chuỗi giao diện / bố cục trang, thêm ô nhập, hộp chọn, nút cạnh chữ, bảng, thanh dính, hoặc khi nhận danh sách lỗi giao diện từ người kiểm thử.
---

# Chuẩn giao diện (tóm tắt – đầy đủ ở `docs/chuan-giao-dien.md`)

## Khi viết

- **Chữ dài một dòng** → `text-overflow: ellipsis` trên phần tử chữ (span), **không** trên khung `display: flex / grid`.
  Khung flex thì `<span class="ellip">…</span>`. Không cắt dữ liệu ở máy chủ ngắn hơn chỗ hiện (`cleanName(s, max)`).
- **Ô nhập / hộp chọn** → không cố định bề rộng theo một ngôn ngữ (vi / ru dài hơn en). Trang giải đã có `CaroFit.fit`
  nới vừa chữ; trang khác gọi `window.CaroFit.fit(vùng)` sau khi vẽ. Lựa chọn dài → chữ ngắn trong hộp + dòng gợi ý.
- **Nút cạnh chữ** → `gap` / `margin` ≥ 8px. Cột lưới chứa nút: `minmax(48px, auto)`, cột chữ `minmax(0, 1fr)`.
- **Thanh dính** (`position: sticky`) → khung cuộn của nó có `scroll-padding-top` ≥ chiều cao thanh.
- **Bảng** → không `display: flex / grid` trên `td` / `th`; bọc nội dung trong span.
- **Chuỗi** → `T(key, {...})` truyền đủ mọi `{biến}` của chuỗi, kể cả `T(x ? 'a' : 'b', {...})`. Không hiện `undefined` / `NaN`.
- **Mô tả số liệu** (số vòng, số đội đi tiếp…) → đọc cấu hình hiệu lực (`K.effSpec`, `K.effStage`), không đọc số thô.
- **Màu có nghĩa** (đi tiếp, bị loại) → luôn kèm chữ / nhãn.
- **Mục ẩn vì quyền xem** → người quản lý vẫn thấy, có nhãn; không báo "0 mục" khi có mục ẩn.
- **`aria-live`** → chỉ thông báo của trang đang mở.
- **Trái / phải (RTL)** → thuộc tính logic: `margin-inline-start`, `padding-inline-end`, `border-inline-start`,
  `inset-inline-end`, `text-align: start/end`, `border-start-start-radius`; viết tắt 4 giá trị trái ≠ phải → `*-block` + `*-inline`.
  Buộc giữ vật lý (căn giữa `left: 50%` + `translateX`, JS đặt `style.left/right`, toạ độ bàn cờ / đồ thị) → ghi
  `/* ltr-ok: lý do */` cùng dòng. Lật / giữ LTR bằng tay (mũi tên, đồ thị…) → `caro/lang-scripts.css` với `[dir="rtl"]`.

## Trước khi đẩy

1. `cd server && npm run coverage` (có `css-rules.test.js` – cả luật trái/phải RTL, `i18n-vars.test.js`).
2. `node caro/tests/e2e/otour-ui.e2e.js` → "Soát giao diện: 0 lỗi hiển thị" (1920px + 390px).
3. Đổi bố cục chung (thanh, trang chủ, bàn cờ): `node caro/tests/e2e/rtl-layout.e2e.js` (ép `dir="rtl"`).
4. Trang / tính năng mới: thêm `ok((await audit(page)).length === 0, …)` (từ `caro/tests/e2e/ui-audit.js`) vào e2e của nó, ít nhất ở màn hẹp.
5. Tăng `CACHE` trong `caro/sw.js`.

## Khi nhận báo lỗi giao diện

- Tìm **nguyên nhân gốc** (CSS / dữ liệu máy chủ / biến thiếu), không vá riêng chỗ được báo; dò cùng mẫu lỗi ở chỗ khác.
- Mỗi lỗi mới thuộc kiểu chưa có trong bảng → thêm quy tắc vào `docs/chuan-giao-dien.md` và, nếu dò được tự động,
  thêm luật vào `ui-audit.js` hoặc `css-rules.test.js` (kèm ca thử bắt đúng lỗi cũ).
