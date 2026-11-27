# Quy trình thêm ngôn ngữ giao diện (27/11/2026)

Nguồn: báo cáo "Caro – mở rộng ra mọi ngôn ngữ" (Duc, 27/11/2026) đối chiếu với repo thật. Chốt:

- **Không hứa "7.000 ngôn ngữ"**, không dùng cờ, không trình bày bản dịch máy / AI như bản người dịch.
- Phạm vi: **Tier 1 = 40 ngôn ngữ** (bảng ở cuối), làm từng lượt 3–5 ngôn ngữ. Lượt thử: es, pt, fr, de, rồi ar (RTL).
  Tier 2–3 (100 / 184 ngôn ngữ) chỉ làm khi có người soát. Không tạo hàng loạt file rỗng.
- Giữ hệ i18n hiện có (`caro/langs.js` + `caro/i18n/<mã>/`), **không** chuyển sang i18next: hệ hiện tại đã tải từng
  ngôn ngữ khi cần, có dự phòng tiếng Anh và bài thử. Thêm ngôn ngữ = một thư mục mới + một dòng trong `langs.js`.
- Khối lượng thật: **~4.500 khoá, ~330 KB chữ mỗi ngôn ngữ** (chưa tính chữ máy chủ, trang tĩnh). Nút thắt là người soát.

## 1. Ai làm gì

| Bước | Ai | Việc |
| --- | --- | --- |
| 1. Tạo khung | Claude | `node server/scripts/new-lang.js add <mã>` – tên tự gọi, chữ viết, hướng chữ, loại số nhiều lấy từ **CLDR** (qua ICU của Node, không gõ tay, không lấy từ dịch máy). Thêm vào `langs.js` với `status: 'hidden'`, tạo `caro/i18n/<mã>/core.js` và `docs/dich/<mã>.md`. Phông theo chữ viết nếu cần (mục 4). Tăng `CACHE`. PR, merge. |
| 2. Giao việc dịch | Claude | Tạo Issue nhãn `agent:agy` theo mẫu mục 5 (3–5 ngôn ngữ / Issue). |
| 3. Dịch | Antigravity | Chỉ sửa file của ngôn ngữ được giao (mục 2). Điền thuật ngữ trước, dịch từ bản tiếng Anh, chạy bài thử, chụp ảnh 390px, PR `Closes #<số>`. |
| 4. Review, sửa lỗi | Claude | Chạy toàn bộ bài thử + e2e; soi ngẫu nhiên ~50 khoá / ngôn ngữ (nghĩa, thuật ngữ, chữ tràn); RTL: e2e `rtl-layout`. Sửa lỗi, merge. |
| 5. Hiện ở ô chọn | Claude | `node server/scripts/new-lang.js status <mã> mt-draft` – ô chọn ghi nhãn "Bản dịch máy". |
| 6. Kiểm máy thật | Laplace | Theo hướng dẫn trong `docs/` (ar / he trong Zalo, Messenger; phông, chữ tràn). |
| 7. Đã soát | Claude | Chỉ khi **người bản xứ đã đọc trong game**: `status <mã> reviewed`, ghi tên + ngày vào `docs/dich/<mã>.md`. |

Antigravity **không** sửa: `caro/langs.js`, `caro/sw.js`, `caro/index.html`, `caro/i18n.js`, `caro/i18n-*.js` (file gốc),
CSS, bài thử. Cần đổi những chỗ đó thì ghi vào PR để Claude làm.

## 2. File của một ngôn ngữ `<mã>` (người dịch được sửa)

| Phần | File |
| --- | --- |
| Chuỗi giao diện | `caro/i18n/<mã>/core.js` (chuỗi lõi + `i18n_files`), `caro/i18n/<mã>/<chủ đề>.js` – soi gương `caro/i18n-<chủ đề>.js` |
| Chữ phía máy chủ (og, thư, widget) | `server/src/i18n/<mã>.js` – mẫu `server/src/i18n/ja.js` |
| Trang tĩnh privacy / connector / licenses | mục `<section id="<mã>" …>` (xem `docs/van-phong-4-ngon-ngu.md`, "Thêm ngôn ngữ") |
| Trang API | `server/scripts/api-html/<mã>.json` rồi `python3 server/scripts/gen-api-html.py caro/api.html` |
| Thuật ngữ, ghi chú | `docs/dich/<mã>.md` |

`i18n_files` trong `core.js`: tên các chủ đề đã dịch, cách nhau dấu cách; đủ hết thì `'all'`. Ngôn ngữ chưa `'all'`
phải để `status: 'hidden'` (bài thử bắt).

## 3. Luật dịch

- Dịch từ **tiếng Anh**, đối chiếu tiếng Việt khi nghĩa chưa rõ. Văn phong chung: `docs/van-phong-4-ngon-ngu.md`.
- Giữ nguyên `{biến}`, thẻ `<b>…</b>` (không thêm thẻ / thuộc tính mới), emoji, chuỗi bắt đầu bằng " · ".
- "Caro" giữ chữ Latin; lần đầu giải thích "Caro (cờ năm quân kiểu Việt Nam)". X / O giữ nguyên. "Undo" = hoàn tác
  nước vừa đi (không phải "chơi lại"). Tên nhân vật máy, tên khai cuộc giữ như bản tiếng Anh.
- **Số nhiều**: mặc định viết mẫu "Nhãn: {n}" để không phải chia. Cần đúng ngữ pháp thì thêm dạng cạnh khoá gốc,
  chỉ với chuỗi có `{n}`: `'k|one': '…'`, `'k|few': '…'`, `'k|many': '…'` (loại theo CLDR, ghi trong `docs/dich/<mã>.md`;
  `other` = khoá gốc). `i18n.js` tự chọn bằng `Intl.PluralRules`, không cần sửa chỗ gọi.
- Không để trống, không chép nguyên tiếng Anh (bài thử bắt chuỗi giống hệt tiếng Anh; chữ viết không phải Latin thì
  bắt chuỗi không có chữ nào của chữ viết đó).
- **RTL** (ar, he, fa, ur…): chỉ dịch chữ; bố cục do CSS lo (`<html dir="rtl">`, thuộc tính logic). Không chèn ký tự
  điều khiển hướng (U+200E/F) trừ khi Claude yêu cầu.

## 4. Nền kỹ thuật (Claude giữ)

- `caro/langs.js`: `script` (ISO 15924), `rtl`, `font`, `status` (`reviewed` / `mt-draft` / `hidden`). `SHOWN` = ngôn ngữ
  đang hiện: ô chọn, tự nhận theo trình duyệt (`fromTag`), hreflang / sitemap. `hidden` vẫn mở được bằng `?lang=<mã>`.
- Hướng chữ: `i18n.js` đặt `<html dir>` ngay khi chọn ngôn ngữ. CSS dùng thuộc tính logic (bài thử `css-rules`
  bắt thuộc tính trái / phải; chỗ phải giữ vật lý ghi `/* ltr-ok: … */`). Lật bằng tay (mũi tên…): `caro/lang-scripts.css`.
- Phông theo chữ viết: máy Android / iOS đã có phông cho hầu hết chữ viết. Chỉ thêm khi Laplace / ảnh chụp thấy ô vuông
  (tofu) hoặc phông xấu: tải Noto Sans <chữ viết> (SIL OFL, từ Fontsource / Google Fonts, bản woff2 cắt theo unicode-range)
  vào `caro/fonts/`, thêm `@font-face` (font-display: swap, unicode-range) + `:lang(<mã>) { --font: '<phông>', … }` vào
  `caro/lang-scripts.css`, thêm `font: '<phông>'` vào `langs.js`, ghi vào trang giấy phép. Trình duyệt chỉ tải tệp khi
  trang ở ngôn ngữ đó. Không gộp mọi phông Noto cho mọi người.
- Ô chọn ngôn ngữ (`caro/lang-picker.js`): tên tự gọi + tên theo ngôn ngữ giao diện (Intl.DisplayNames), nhãn
  "Bản dịch máy" cho `mt-draft`, ô tìm khi trên 20 ngôn ngữ. Không cờ.
- Bài thử: `server/test/i18n-langs.test.js`, `server/test/i18n-script.test.js` (trường langs.js khớp CLDR, ngôn ngữ
  đang hiện phải đủ, phông, số nhiều, HTML nguy hiểm, ô chọn, công cụ tạo khung), `server/test/css-rules.test.js`,
  e2e `caro/tests/e2e/rtl-layout.e2e.js`.
- `ja`, `ko`, `cs`, `zh-Hant` hiện là `mt-draft` (Claude dịch, chưa có người bản xứ soát). Có người soát thì đổi `reviewed`.

## 5. Mẫu Issue giao Antigravity

Nhãn `agent:agy`, mẫu `.github/ISSUE_TEMPLATE/nhiem-vu-agent.yml`, chữ ký `_Generated by [Claude Code](https://claude.ai/code)_`.

```
Mục tiêu: dịch giao diện sang <tên> (<mã>), <tên> (<mã>)… Khung đã có (PR #…), status 'hidden'.
Phạm vi: CHỈ các file ở docs/quy-trinh-them-ngon-ngu.md mục 2 của các mã trên. Không sửa file khác.
Các bước:
  1. Đọc docs/quy-trinh-them-ngon-ngu.md, docs/van-phong-4-ngon-ngu.md, docs/dich/<mã>.md.
  2. Điền bảng thuật ngữ trong docs/dich/<mã>.md (commit riêng, trước khi dịch).
  3. Dịch từng chủ đề; cập nhật i18n_files sau mỗi chủ đề; xong hết thì 'all'.
  4. cd server && node --test test/i18n-langs.test.js test/i18n-script.test.js test/i18n-quality.test.js   (phải xanh)
  5. node server/scripts/i18n-lt.js <mã> (nếu LanguageTool có ngôn ngữ đó) – sửa lỗi chính tả thật.
  6. Ảnh 390px: Trang chủ, trong ván, Cài đặt → Ngôn ngữ (mở bằng ?lang=<mã>) – đính vào PR.
Tiêu chí xong:
  - [ ] i18n_files: 'all' cho mọi mã; bài thử bước 4 xanh (dán dòng cuối từng lệnh vào PR)
  - [ ] Bảng thuật ngữ điền đủ; không đổi {biến}, thẻ HTML
  - [ ] Không sửa file ngoài phạm vi
  - [ ] PR ghi rõ: bản dịch máy / AI (sẽ để status mt-draft)
Nộp: PR "Closes #<số>" từ nhánh agy/lang-<mã>…, định dạng "Báo cáo gọn" (AGENTS.md).
```

## 6. Tier 1 – 40 ngôn ngữ (theo báo cáo; kiểm lại bằng CLDR khi tạo khung)

en ✓, zh ✓ (zh + zh-Hant), es, ar (RTL), hi, pt (pt-BR), fr, bn, ru ✓, ur (RTL), id, de, ja ✓, pa, mr, te, tr, ko ✓,
vi ✓, ta, it, fa (RTL), pl, uk, nl, ms, sw, ha, th, my, km, am, ne, si, gu, jv, yo, ig, fil, he (RTL). (cs ✓ đã có, ngoài danh sách.)
Thứ tự gợi ý: es, pt, fr, de → ar → hi, id, tr, it, pl, uk → he, fa, ur → phần còn lại.
