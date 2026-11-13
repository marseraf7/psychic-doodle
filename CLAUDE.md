# Ghi nhớ cho repo Cờ Caro

- **Đầu mỗi việc mới: kiểm model + effort** theo skill `.claude/skills/chon-model-effort/SKILL.md`. Đặt sai (yếu quá
  cho việc khó / bảo mật, hoặc `xhigh`/`max` cho việc vặt) thì **không làm**, cảnh báo ngay và chỉ cách đổi `/model`, `/effort`.
  Chỉ làm khi người dùng đã đổi hoặc nói "cứ làm". Áp dụng cho mọi model, kể cả model ra sau này.
- Trả lời / báo cáo bằng tiếng Việt; chú thích code bằng tiếng Việt.
- **Luôn chia file và gom qua hub** khi viết hoặc sửa code: làm theo skill `.claude/skills/chia-file-hub/SKILL.md`
  (một file một việc, ~400 dòng; máy chủ gom ở `server/src/hub/index.js`; trình duyệt mỗi tính năng một module
  `window.CaroXxx`, không dồn vào `app.js`; chuỗi dịch theo chủ đề `caro/i18n-<chủ đề>.js`).
- Chuỗi giao diện luôn đủ 4 ngôn ngữ: vi, en, ru, zh. Viết theo `docs/van-phong-4-ngon-ngu.md` (văn phong + bảng thuật
  ngữ); bài thử `server/test/i18n-quality.test.js` báo đỏ nếu lệch. Soát en/ru/zh: `node server/scripts/i18n-lt.js`.
- **Không dùng `confirm()` / `prompt()` / `alert()` gốc** của trình duyệt trong `caro/` (bị chặn / tự đóng trong Zalo,
  Messenger…). Luôn dùng hộp trong app: `await window.CaroConfirm.ask(…)` (Đồng ý / Huỷ), `CaroConfirm.prompt(…, giá trị)`
  (hỏi chữ, Huỷ = null), `CaroConfirm.info(…)` (thông báo). Unit test `server/test/no-native-dialogs.test.js` báo đỏ nếu lỡ dùng.
- **Chuẩn giao diện**: viết / sửa HTML, CSS, chuỗi giao diện thì theo skill `.claude/skills/chuan-giao-dien/SKILL.md`
  (`docs/chuan-giao-dien.md`: chữ cắt có "…", nút không đè chữ, thanh dính không che, đủ biến `{x}`, kiểm ở 390px).
  Bài thử: `server/test/css-rules.test.js`, `server/test/i18n-vars.test.js`, `caro/tests/e2e/otour-ui.e2e.js` (0 lỗi).
- Văn bản người dùng tự viết (mô tả giải / CLB, giới thiệu bản thân…): dùng trình soạn có định dạng `CaroRich.editor`
  và hiện bằng `CaroRich.render` (`caro/rich-text.js`) – không tự chèn HTML.
- Đổi file trong `caro/` thì tăng `CACHE` trong `caro/sw.js`; thêm file thì thêm vào `FILES`.
- Chia việc với Antigravity: làm theo skill `.claude/skills/giao-viec-antigravity/SKILL.md` (việc lặp lại / tốn token như chạy test N lần,
  đọc log dài, kiểm trên máy thật, soát dịch, audit chỉ đọc → giao Issue `agent:agy`; việc khó / quan trọng → tự làm).
- Kiểm thử: `cd server && npm run coverage` (unit + độ phủ), `node caro/tests/e2e/<tên>.e2e.js` (trình duyệt).
- **Merge PR**: người dùng cho phép (5/11/2026) tự merge PR của Claude khi CI xanh và không xung đột, không cần hỏi
  (kiểu merge commit). Sau merge: `git merge --ff-only origin/<base>` rồi push nhánh làm việc.
