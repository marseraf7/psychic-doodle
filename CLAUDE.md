# Ghi nhớ cho repo Cờ Caro

- **Đầu mỗi việc mới: kiểm model + effort** theo skill `.claude/skills/chon-model-effort/SKILL.md`. Đặt sai (yếu quá
  cho việc khó / bảo mật, hoặc `xhigh`/`max` cho việc vặt) thì **không làm**, cảnh báo ngay và chỉ cách đổi `/model`, `/effort`.
  Chỉ làm khi người dùng đã đổi hoặc nói "cứ làm". Áp dụng cho mọi model, kể cả model ra sau này.
- Trả lời / báo cáo bằng tiếng Việt; chú thích code bằng tiếng Việt.
- **Luôn chia file và gom qua hub** khi viết hoặc sửa code: làm theo skill `.claude/skills/chia-file-hub/SKILL.md`
  (một file một việc, ~400 dòng; máy chủ gom ở `server/src/hub/index.js`; trình duyệt mỗi tính năng một module
  `window.CaroXxx`, không dồn vào `app.js`; chuỗi dịch theo chủ đề `caro/i18n-<chủ đề>.js`).
- Chuỗi giao diện luôn đủ 4 ngôn ngữ: vi, en, ru, zh.
- Đổi file trong `caro/` thì tăng `CACHE` trong `caro/sw.js`; thêm file thì thêm vào `FILES`.
- Chia việc với Antigravity: làm theo skill `.claude/skills/giao-viec-antigravity/SKILL.md` (việc lặp lại / tốn token như chạy test N lần,
  đọc log dài, kiểm trên máy thật, soát dịch, audit chỉ đọc → giao Issue `agent:agy`; việc khó / quan trọng → tự làm).
- Kiểm thử: `cd server && npm run coverage` (unit + độ phủ), `node caro/tests/e2e/<tên>.e2e.js` (trình duyệt).
