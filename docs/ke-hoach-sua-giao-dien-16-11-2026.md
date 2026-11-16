# Kế hoạch sửa – rà soát giao diện toàn app 16/11/2026 (bản v199)

Nguồn: `DANH-SACH-LOI-RA-SOAT-GIAO-DIEN-TOAN-APP-16-11-2026.md` (Laplace) + phần còn dở của phiên 13/11.
Mỗi mục: **kết luận sau khi kiểm lại trong mã / trình duyệt** → việc cần làm → cách kiểm. Làm theo
`docs/chuan-giao-dien.md`; đổi `caro/` thì tăng `CACHE` (hiện `caro-v199`) và thêm file mới vào `FILES`.
Quy ước: mỗi lỗi sửa kèm bài thử **đỏ trên code cũ**, rồi mới sửa.

## A. Lỗi thật, sửa ngay

### A1 (R2) – "Xoá tỉ số" không hỏi xác nhận  ✔ đã tái xác nhận trong mã
- `caro/app-dialogs.js:108` – `$('reset-score').onclick` đặt `state.score = {1:0, 2:0}` ngay.
- Sửa: `if (!(await window.CaroConfirm.ask(T('reset_score_confirm')))) return;` trước khi xoá. Thêm chuỗi
  `reset_score_confirm` đủ vi/en/ru/zh (vi: "Xoá tỉ số loạt ván trên máy này về 0–0?").
- Quét cả các nút `danger` / hành động xoá khác trong `index.html` (4 chỗ có `class="… danger"`) và các `acts.*Delete/Clear/Reset`:
  cái nào chưa qua `CaroConfirm` thì bọc luôn. Ghi lại danh sách đã soát vào mô tả PR.
- Bài thử: e2e nhỏ (hoặc thêm vào `confirm-dlg.e2e.js`): bấm "Xoá tỉ số" → hộp xác nhận hiện, Huỷ thì tỉ số giữ nguyên, Đồng ý thì về 0–0.
- Quy tắc mới cho `docs/chuan-giao-dien.md` + test tĩnh `server/test/danger-confirm.test.js`: mọi `<button … danger>` trong
  `index.html` có `id` thì handler của id đó (tìm trong `caro/*.js`) phải gọi `CaroConfirm.` trong cùng khối.

### A2 (mới) – Checklist giải Online coi giải bị từ chối là "đã duyệt ✓"  ✔ phát hiện khi kiểm R-điểm nghi ngờ
- `caro/tour-manage.js:54`: `!['draft','pending'].includes(t.status)` → giải `rejected` (và có thể `cancelled`) cũng thành ✓,
  mâu thuẫn với huy hiệu "Không duyệt" (đúng như ảnh i21 của Laplace: "Được quản trị viên duyệt ✓" + banner "Giải không được duyệt").
- Sửa: ✓ chỉ khi `['running','finished'].includes(t.status)` (kiểm lại các trạng thái khác ở `server/src/hub/tournaments.js`);
  `rejected` hiện ✗ kèm gợi ý "Sửa rồi gửi duyệt lại" nếu luồng đó có.
- Bài thử: unit test trên hàm dựng checklist (tách ra thành hàm thuần nếu cần) – mọi trạng thái → ✓ / ✗ đúng.

### A3 (R4) – Nhật ký giải: "gayaĐội 11 – …"  ◐ chưa tái hiện (DOM có dấu cách, đo khoảng hở 0px = có chữ cách)
- `caro/otour.js:218`: `<small>giờ · người</small> chữ` chỉ dựa vào một dấu cách giữa thẻ inline; nơi nào bị `display:flex` /
  trình duyệt gộp khoảng trắng thì dính. Sửa chắc chắn (không phụ thuộc dấu cách): bọc hai phần thành hai `span`, `li` dùng
  `display: flex; gap: 8px; flex-wrap: wrap` (hoặc `margin-inline-end: .5em` cho `small`). Thêm CSS `.ot-log` vào `style-tour.css`.
- Xin Laplace ảnh i38 nếu sau sửa vẫn dính (có thể do tên người có ký tự đặc biệt).
- Kiểm: `ui-audit.js` thêm loại `glue` – hai nút / hai phần tử con liền nhau trong một dòng không có khoảng hở ≥ 3px giữa chữ
  (đo bằng `Range.getClientRects`); chạy ở tab "Khác" của `otour-ui.e2e.js` sau khi nhập một trận.

### A4 – Ô "Model (tuỳ chọn)" hiện sẵn "gaya"  ◐ gần như chắc là autofill của Chrome
- `caro/otour-ai.js:52–55`: ô văn bản đứng ngay trước ô `type=password` → Chrome điền *tên đăng nhập* vào ô văn bản đó, bỏ qua
  `autocomplete="off"`. Sửa: ô khoá `autocomplete="new-password"`, ô model thêm `name="otai-model"`, `autocomplete="off"`
  giữ nguyên + `data-lpignore="true"` `data-1p-ignore`.
- Kiểm: không tự động hoá được autofill của Chrome → Laplace kiểm lại trên bản mới (đã ghi trong checklist cuối).

### A5 (R3) – Tên giải bị cắt trong danh sách (`?ot=list`)  ✔ là dữ liệu cũ, không phải lỗi mã
- "…Vòng bản" = đúng 24 ký tự: giải tạo **trước v197** bị máy chủ cắt sẵn khi lưu; "Nhánh th…" là tên đã cắt ở 24 + CSS cắt có "…".
  Bản v197+ lưu đủ 60 ký tự và có "…" (đã có trong `otour-ui.e2e.js`).
- Việc cần làm: **không sửa mã**; thêm 1 dòng vào ghi chú phát hành / báo Minh: giải cũ phải đổi tên lại (không khôi phục được).
  Tuỳ chọn: ở trang quản lý giải, nếu tên đúng 24 ký tự thì gợi ý "Tên có thể đã bị cắt – đổi tên?" (nhỏ, chỉ chủ giải thấy).

## B. Không phải lỗi mã / chỉ ghi nhận

### B1 (R1) – "Thanh tab dính che nội dung khi cuộn"  ◐ phần lớn là cách cuộn của công cụ kiểm thử
- Cuộn bằng con lăn ở 1920×755 (đã đo): thanh tab dính đứng yên ở y=130–186, hàng chỉ bị cắt ở mép dưới thanh khi đang cuộn –
  đây là hành vi bình thường của `position: sticky` (nội dung trôi dưới thanh), không phải che vĩnh viễn.
- Phần thật (đã sửa ở v197): nhảy tới ô nhập bằng `scrollIntoView` / `focus()` → `scroll-padding-top` cho `.otp-body, #tour-body`.
- Việc thêm (rẻ, an toàn): đặt `scroll-padding-top` cho **mọi** khung `.pg-body` có thanh dính (trang Cài đặt, form tạo giải), rồi
  bổ sung vào `css-rules.test.js` quy tắc tổng quát: khung cuộn nào chứa phần tử `sticky; top: 0` thì có `scroll-padding-top`.
- Xin Laplace: nêu rõ có dùng `scrollIntoView` / phím Tab để tới ô không; nếu chỉ cuộn con lăn thì đóng R1.

### B2 – "Khá Bảnh" xuống 2 dòng (tab "Với máy")
- Cột hẹp, thẩm mỹ. Việc làm tuỳ chọn: `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` cho tên máy, tên đầy đủ ở `title`.

### B3 – Các "dị thường DOM" (đoạn bị cắt khi trích văn bản)
- Đã đọc cây trợ năng ở lượt trước: đủ chữ, đủ "0". Không sửa. Ghi vào `docs/chuan-giao-dien.md` (mục 6): kết luận lỗi hiển thị chỉ dựa trên
  ảnh chụp, không dựa trên văn bản trích từ DOM.

## C. Việc dở của phiên 13/11, làm nốt

1. **M-F6 `friends-chat` còn mất chữ trên CI** (nguyên nhân chưa rõ, local không tái hiện). Thêm vào bài thử: khi một `ok()` về giá trị ô
   hỏng, in giá trị thực tế + `document.activeElement` + số lần `renderFriends` đã chạy (đếm qua `window.__frDraws` chỉ bật khi `E2E`); sau
   đó đọc log CI lần đỏ kế để sửa đúng gốc. Cân nhắc: `renderFriends` bỏ vẽ lại khi ô thêm bạn đang có chữ / đang focus và danh sách không đổi
   về nội dung (so `JSON.stringify(f)` với lần trước) – vừa nhẹ hơn vừa hết nguy cơ.
2. **Android 34 chập chờn (hai bước khác nhau: tìm trận nhanh, bàn phím)** – cả hai lần log có `Application Not Responding: nexuslauncher`.
   Thêm vào đầu bước chạy e2e của job Android: tắt hoạt ảnh (`adb shell settings put global window_animation_scale 0` …), đóng hộp ANR
   (`adb shell input keyevent KEYCODE_HOME` + `am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS`), và bọc bước trong thử lại một lần
   khi log chứa `Application Not Responding` (không thử lại khi lỗi khác).
3. **Kiểm thử tự động cho quy tắc mới** (xem A1, A3, B1): `danger-confirm.test.js`, loại `glue` trong `ui-audit.js`, luật sticky tổng quát.
4. **Cập nhật `docs/chuan-giao-dien.md`**: thêm 3 quy tắc – (a) thao tác xoá/đặt lại luôn qua `CaroConfirm`; (b) không dựa vào dấu cách giữa hai
   phần tử inline để tách chữ – dùng `gap`/`margin`; (c) ô văn bản cạnh ô mật khẩu phải chặn autofill. Mục nguồn lỗi: R1–R4 16/11.
5. **Chưa chốt** (đã hỏi Laplace, chờ trả lời): N3 bản trích văn bản gốc của "Chặng 1"; xác nhận hộp thoại nhập tỉ số tự đóng sau khi lưu là chủ ý.
6. **Thí nghiệm subagent Sonnet đọc phiên** (Minh muốn đo mức tiết kiệm token trước khi ghi vào `CLAUDE.md`): chưa ghi, tiếp tục đo.

## D. Thứ tự làm đề xuất (một PR, commit theo nhóm)

1. A1 + bài thử + test tĩnh `danger-confirm` (ưu tiên – vi phạm quy tắc đứng của dự án).
2. A2 (checklist) + unit test.
3. A3 + A4 + `glue` trong audit.
4. B1 (scroll-padding tổng quát) + luật CSS.
5. C1 (chẩn đoán M-F6 + bỏ vẽ lại thừa) và C2 (làm cứng Android 34).
6. C4 tài liệu; tăng `CACHE`; chạy `npm run coverage`, `node --test caro/tests/*.test.js`, `otour-ui.e2e.js`, `friends-chat.e2e.js`, `confirm-dlg.e2e.js`.

## E. Việc Laplace làm lại sau khi triển khai
- Bấm "Xoá tỉ số": phải hiện hộp xác nhận.
- Giải Online bị từ chối: checklist không còn ✓ "Được quản trị viên duyệt".
- Nhật ký giải: có khoảng cách giữa tên người ghi và tên đội.
- Form Tạo giải Offline → AI → "Model": không tự điền "gaya" (tắt/bật autofill đều thử).
- Giải cũ đổi tên lại (R3).
