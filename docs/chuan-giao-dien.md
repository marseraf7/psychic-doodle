# Chuẩn giao diện – chống lặp lại lỗi hiển thị

Tài liệu này rút ra từ đợt kiểm thử 12–13/11/2026 (danh sách lỗi của Laplace: E1–E3, L1–L7, N1–N6, A1). Mỗi mục gồm
**quy tắc**, **vì sao** (lỗi đã gặp), và **cái gì tự kiểm** (bài thử báo đỏ nếu vi phạm). Việc nào đụng tới `caro/`
(HTML, CSS, chuỗi giao diện) đều phải theo – skill `.claude/skills/chuan-giao-dien/SKILL.md` tóm tắt để làm nhanh.

## 1. Chữ không bị cắt cụt

| Quy tắc | Lỗi đã gặp | Tự kiểm |
|---|---|---|
| Chữ một dòng có thể dài (tên giải, tên đội, tên miền…) phải cắt **có "…"**: `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` trên **phần tử chữ**, không phải trên khung `display: flex / grid` (ở đó trình duyệt không vẽ "…"). Khung flex thì bọc chữ trong `<span class="ellip">` | E1: tên giải trên thanh tiêu đề bị cắt, không có "…" | `server/test/css-rules.test.js` (luật 1), `ui-audit.js` → `clip` |
| Không cắt dữ liệu ở máy chủ ngắn hơn chỗ hiện: độ dài tối đa của tên (`cleanName(s, max)`) đặt theo từng loại (giải 60, CLB / mẫu 40), giao diện tự cắt có "…" | E1: máy chủ cắt tên còn 24 ký tự, giải cũ không lấy lại được tên đầy đủ | `otour-ui.e2e.js` (tên 59 ký tự lưu đủ) |
| Ô nhập không cố định bề rộng nhỏ hơn chữ gợi ý (placeholder). Tiếng Việt / Nga dài hơn tiếng Anh 30–60% – không đo bằng mắt ở một ngôn ngữ. Trang giải đã gọi `CaroFit.fit(body)` (`caro/fit-input.js`) sau mỗi lần vẽ: tự nới ô nhập / hộp chọn vừa chữ | L6 / N1: "Hạng" → "Hạ", "Cộng / trừ điểm" → "Cộng / trừ đ" | `ui-audit.js` → `placeholder` |
| Hộp chọn (`<select>`) không hẹp hơn lựa chọn đang chọn. Không bóp hộp chọn trong hàng flex (`flex: 1 1 100%; min-width: 0` hoặc để `CaroFit` nới). Lựa chọn dài hơn ~25 ký tự: viết ngắn trong hộp, giải thích ở dòng gợi ý bên dưới (vd. Fearless "Cứng" / "Mềm") | L7: tên ảnh chặng bị cắt; ô luật treo giò 40px trên điện thoại | `ui-audit.js` → `select` |
| Giá trị bên phải hàng cài đặt (`.qs-v`, `.li-v`) được xuống dòng hoặc có "…", không cắt cụt | E3: "Giấy (theo giao …" | `ui-audit.js` → `clip` |

## 2. Không đè, không che

| Quy tắc | Lỗi đã gặp | Tự kiểm |
|---|---|---|
| Nút đứng cạnh chữ phải có khoảng cách (≥ 8px, `gap` hoặc `margin`) | L5: nút "Sửa đội hình" dính chữ "0 cầu thủ" | `ui-audit.js` → `overlap` (cùng khối) |
| Cột lưới chứa nút không cố định bề rộng nhỏ hơn nút: dùng `minmax(48px, auto)` thay `48px`; cột chữ dùng `minmax(0, 1fr)` để chữ dài cắt có "…" thay vì tràn | Thanh tiêu đề trang giải trên điện thoại: nút "Giải đấu" (76px) tràn khỏi cột 48px, đè tên giải | `ui-audit.js` → `overlap` (khác khối – dò bằng `elementsFromPoint`) |
| Khung cuộn có thanh dính (`position: sticky`) phải có `scroll-padding-top` ≥ chiều cao thanh – `scrollIntoView` / `focus()` mới không đưa ô nhập xuống dưới thanh | L1: thanh tab giải che khung nhập kết quả, nút "Huỷ kết quả chặng", bục vinh danh | `css-rules.test.js` (luật 3), `otour-ui.e2e.js` (`coverAt` sau khi mở trận) |
| Không đổi `display` của ô bảng (`td`, `th`) sang flex / grid – ô rời khỏi lưới bảng. Bọc nội dung ô trong `<span>` inline-flex | L2: cột "Phong độ" lệch khỏi bảng | `css-rules.test.js` (luật 2) |
| Khối có ô nhập vẽ lại theo cập nhật từ máy chủ (danh sách bạn bè, bảng giải…) phải giữ **chữ và con trỏ riêng rẽ** – ô còn trống mà đang được bấm vào cũng giữ focus, nếu không chữ gõ ngay sau đó rơi mất | Ô thêm bạn mất chữ khi bạn bè đổi trạng thái (chập chờn CI 13/11) | `friends-chat.e2e.js` (M-F6) |
| Hai phần chữ liền nhau (người ghi + nội dung, nhãn + giá trị) tách bằng `gap` / `margin` của khung, **không** dựa vào một dấu cách giữa hai thẻ | R4 16/11: nhật ký giải hiện "gayaĐội 11 – …" | `ui-audit.js` → `glue`, `otour-ui.e2e.js` (nhật ký) |
| Ô văn bản đứng ngay trước ô mật khẩu / khoá API: ô khoá `autocomplete="new-password"`, ô văn bản có `name` riêng + `autocomplete="off"` (Chrome tự điền tên đăng nhập vào ô văn bản trước ô mật khẩu) | 16/11: ô "Model" hiện sẵn "gaya" | kiểm tay trên Chrome |

## 3. Không lộ chuỗi mẫu, không đọc thông báo cũ

| Quy tắc | Lỗi đã gặp | Tự kiểm |
|---|---|---|
| Mọi `T('khoá', {...})` truyền đủ biến mà chuỗi dùng – kể cả khi khoá được chọn bằng điều kiện `T(x ? 'a' : 'b', {...})` | N4: "Bo{bo}" trong hộp nhập loạt Bo9 / Bo13 | `server/test/i18n-vars.test.js` (đọc tĩnh), `ui-audit.js` → `token` (trên trang) |
| Không bao giờ hiện `undefined`, `NaN`, `[object Object]`, `{x}` – thiếu dữ liệu thì để trống hoặc "–" | – | `ui-audit.js` → `token` |
| Vùng đọc màn hình (`#sr-live`, `aria-live`) chỉ đọc thông báo của trang đang mở; rời bàn cờ sang trang khác thì xoá | E2 / N5: "Lượt X (bạn)", "X thắng!" nằm cuối mọi trang | `ui-audit.js` → `stale-sr` |

## 4. Hiển thị đúng điều sẽ xảy ra

| Quy tắc | Lỗi đã gặp | Tự kiểm |
|---|---|---|
| Phần mô tả / tổng quan đọc **cấu hình hiệu lực** (đã kẹp theo số đội thật), không đọc thẳng số cấu hình thô: `K.effSpec(t)` / `K.effStage(t, i)` (`caro/tour-stages.js`) | L3: Thụy Sĩ ghi "5 vòng" nhưng chỉ đấu 3; L4: "8 đội đi tiếp" khi giải có 4 đội | bài thử e2e của từng thể thức |
| Kết quả đi tiếp phải có **chữ**, không chỉ màu (người mù màu, ảnh chụp đen trắng): nhãn "Vào giai đoạn N" | N2: hàng 1–8 PGC 2023 GĐ4 chỉ tô xanh | – |
| Bố cục nhiều nhánh (loại kép: nhánh thắng, nhánh thua, chung kết tổng) có câu nối giải thích ai gặp ai khi không vẽ đường nối | A1 | – |
| Giải con / mục bị ẩn vì quyền xem: người quản lý vẫn thấy (kèm nhãn "Riêng tư"); không để trang báo "0 mục" trong khi có mục ẩn | N6: giải tổng EWC "0 giải con", không mở được giải con | `server/test/otour-multi.test.js` |

## 4b. Thao tác xoá / đặt lại luôn hỏi lại

| Quy tắc | Lỗi đã gặp | Tự kiểm |
|---|---|---|
| Mọi nút xoá, đặt lại, huỷ dữ liệu (kể cả dữ liệu chỉ lưu trên máy) hỏi xác nhận bằng `await CaroConfirm.ask(…)` trước khi làm; nút trong `index.html` mang class `danger` / `danger-li` | R2 16/11: "Xoá tỉ số" xoá ngay | `server/test/danger-confirm.test.js`, `confirm-dlg.e2e.js` |
| Trạng thái "đã xong / đã duyệt ✓" liệt kê **đúng các trạng thái đạt**, không viết kiểu "khác nháp là đạt" (trạng thái mới như "bị từ chối" sẽ lọt) | 16/11: checklist giải bị từ chối vẫn ✓ "Được quản trị viên duyệt" | `confirm-dlg.e2e.js` (`mgReviewed`) |

## 4c. Kết luận lỗi hiển thị dựa trên ảnh chụp

Văn bản trích từ DOM / cây trợ năng có thể thiếu chữ, thiếu dấu cách hoặc bị cắt dù màn hình hiển thị đủ (N3, các "dị thường DOM"
16/11). Chỉ ghi nhận là lỗi hiển thị khi có ảnh chụp tại vị trí lỗi. Nội dung trôi dưới thanh dính **trong lúc đang cuộn** là bình
thường; chỉ là lỗi khi app tự đưa tới (focus, `scrollIntoView`) mà phần tử vẫn nằm dưới thanh.

## 4d. Sẵn sàng cho chữ viết từ phải sang trái (RTL)

Ngôn ngữ RTL (Ả Rập, Do Thái…) đặt `<html dir="rtl">` (i18n.js); bố cục tự lật nhờ thuộc tính **logic**.

| Quy tắc | Tự kiểm |
|---|---|
| Trong `caro/*.css` không dùng thuộc tính vật lý trái/phải: `margin-inline-start/end` thay `margin-left/right` (tương tự `padding`, `border`), `inset-inline-start/end` thay `left/right`, `text-align: start/end`, `float: inline-start`, `border-start-start-radius`…; viết tắt 4 giá trị trái ≠ phải tách thành `margin-block` + `margin-inline` (`inset`, `border-radius` cũng vậy) | `css-rules.test.js` (luật 4) |
| Chỗ buộc giữ vật lý ghi `/* ltr-ok: lý do */` cùng dòng: căn giữa bằng `left: 50%` + `translateX(-50%)`; phần tử JS đặt `style.left` / `style.right` (nếu để logic, RTL sẽ có cả hai cạnh → phần tử bị kéo dãn); toạ độ bàn cờ / đồ thị; vị trí trái/phải người dùng tự chọn | `css-rules.test.js` |
| Thứ phải lật hoặc giữ LTR bằng tay đặt trong `caro/lang-scripts.css` (bộ chọn gốc kèm `[dir="rtl"]`): mũi tên `#i-chev`, `#i-chevl`, `#i-back`, `#i-exit`, `#i-undo` lật `scaleX(-1)`; SVG đồ thị, nhánh đấu, ký hiệu nước đi, đồng hồ, ô nhập mã số, nhóm nút xem lại giữ `direction: ltr`; vạch màu bằng `box-shadow` đổi cạnh. Biểu tượng không có hướng không lật | `rtl-layout.e2e.js` (ép `dir="rtl"`, 390px + 1280px) |

## 5. Cách kiểm trước khi đẩy code giao diện

1. `cd server && npm run coverage` – gồm `css-rules`, `i18n-vars`, `i18n-quality`, `no-native-dialogs`.
2. `node caro/tests/e2e/otour-ui.e2e.js` – tạo giải từ 6 mẫu đại diện, mở mọi tab ở **1920px và 390px** (điện thoại), mở
   cả khối thu gọn, `ui-audit.js` phải báo **0 lỗi**; mở một trận và kiểm khung nhập không bị thanh tab che.
3. Thêm trang / tính năng mới: gọi `audit(page)` từ `caro/tests/e2e/ui-audit.js` ở bài e2e của tính năng (ít nhất một lần ở
   màn hẹp) – một dòng: `ok((await audit(page)).length === 0, '…')`.
4. Đổi `caro/` thì tăng `CACHE` trong `caro/sw.js` – phiên bản hiện ở cuối trang Cài đặt ("Phiên bản v…"), người kiểm thử
   ghi kèm khi báo lỗi.

## 6. Những gì `ui-audit.js` kiểm

| Loại | Ý nghĩa |
|---|---|
| `clip` | Chữ tràn ngang trong khung `overflow: hidden` mà không có "…", hoặc "…" đặt trên khung flex / grid |
| `placeholder` | Chữ gợi ý dài hơn ô nhập |
| `select` | Lựa chọn đang chọn dài hơn hộp chọn |
| `glue` | Chữ của hai phần liền nhau dính vào nhau (kết thúc và bắt đầu bằng chữ cái, cùng dòng, hở dưới 2px) |
| `overlap` | Nút / ô nhập đè hoặc dính (< 3px) chữ cùng khối; hoặc nằm trên chữ của khối khác (bỏ qua lớp nổi có chủ ý: thanh cố định, thanh dính, huy hiệu absolute; tiền tố ô nhập `.addon` / `.slug-pre`) |
| `token` | `{x}`, `%s`, `undefined`, `NaN`, `[object Object]` trong chữ, `placeholder`, `title`, `aria-label` |
| `stale-sr` | `#sr-live` còn thông báo bàn cờ khi đang ở một trang |
| `coverAt(page, sel)` | Phần tử dính / cố định đang che phần tử `sel` |
