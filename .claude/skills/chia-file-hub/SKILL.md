---
name: chia-file-hub
description: Quy tắc chia file và gom qua "hub" khi viết hoặc sửa code trong repo Cờ Caro (caro/ và server/). Dùng mỗi khi thêm tính năng, sửa một file lớn, thêm chuỗi dịch, thêm dữ liệu, hay thấy một file sắp vượt ~400 dòng – để code sau này dễ tìm, dễ sửa.
---

# Chia file và hub

Mục tiêu: mỗi tính năng nằm ở chỗ dễ đoán, sửa một chỗ không phải lục cả file nghìn dòng. Trước khi viết code, tự hỏi:
"phần này thuộc file nào? nếu thêm vào file đó thì file có còn một việc duy nhất và dưới ~400 dòng không?"

## 1. Một file – một việc

- File logic nên dưới ~400 dòng. Vượt thì tách theo chủ đề (không tách máy móc theo số dòng).
- Một tính năng mới thêm hơn ~150 dòng vào file đã lớn (`app.js`, `online.js`, `i18n.js`, `study.js`…)
  → viết thành file mới, file cũ chỉ gọi sang.
- Dữ liệu tách khỏi logic: bảng số liệu (`bots.js`), bài đố (`puzzles.json`), chuỗi dịch (`i18n-*.js`).
- Đầu mỗi file có chú thích tiếng Việt: file làm gì, nối với ai.

## 2. Hub: một chỗ gom, nhiều phần nhỏ

**Máy chủ** – `server/src/hub/index.js` gom các lớp theo chủ đề vào `Hub.prototype`:
- Mỗi chủ đề một file trong `server/src/hub/` (auth, social, rooms, matchmaking, tournaments, watch…),
  xuất một lớp chỉ có phương thức; tin nhắn loại `X` do `on_X` xử lý.
- Thêm chủ đề mới: tạo file, thêm vào danh sách `for (const part of [...])` và chú thích đầu `index.js`.
  Trùng tên phương thức sẽ báo lỗi ngay khi khởi động.
- Phòng chơi cũng vậy: `room.js` + các mixin `room-clock.js`, `room-swap2.js`, `room-extras.js`.
- Hằng số / hàm làm sạch dữ liệu dùng chung để ở `hub/shared.js`.

**Trình duyệt** – không dồn code vào `app.js`:
- Mỗi module là một IIFE gắn `window.CaroXxx` (vd. `swap.js`, `watch.js`, `tour-*.js`, `learn.js`, `habits.js`).
- Giao tiếp qua API sẵn có: `window.CaroApp` (bàn cờ, `enterExt`, `openReplay`…), `CaroOnline` (`N.on('room', …)`,
  `N.send`), sự kiện `caro:gameover`, `caro:seek`, `caro:lesson`, `langchange`. Cần thêm móc nối thì thêm một hàm /
  sự kiện nhỏ ở `app.js`, phần còn lại viết trong module mới.
- Logic dùng chung trình duyệt + Web Worker + Node (`rules.js`, `engine.js`, `analysis.js`, `bots.js`) viết dạng UMD
  (`module.exports` hoặc `global.Xxx`), không đụng DOM.
- Hộp hỏi / báo dùng chung `window.CaroConfirm` (`confirm.js`): `ask` (Đồng ý / Huỷ), `prompt` (hỏi chữ), `info`
  (thông báo) – **không** dùng `confirm()` / `prompt()` / `alert()` gốc (unit test `no-native-dialogs.test.js` chặn).
- Ô văn bản dài người dùng tự viết (mô tả, giới thiệu): `CaroRich.editor(tên ô, giá trị)` + hiện bằng
  `CaroRich.render(văn bản)` (`rich-text.js`), máy chủ làm sạch bằng `cleanRich` (`hub/shared.js`).

**Chuỗi dịch** – `i18n.js` là lõi; chủ đề mới dùng file riêng `i18n-<chủ đề>.js` gọi `I18N.extend(lang, {...})`
(vd. `i18n-rules.js`, `i18n-bots.js`). Đủ 4 ngôn ngữ vi / en / ru / zh cho mọi khoá.

## 3. Việc phải làm khi thêm file

Trình duyệt (`caro/`):
1. `<script src>` trong `index.html` đúng thứ tự phụ thuộc (i18n → rules → bots → engine → analysis → app → module).
2. Thêm vào `FILES` trong `sw.js` và tăng `CACHE` (`caro-vNN`) – nếu không, máy người chơi còn bản cũ.
3. Worker cần thì thêm vào `importScripts` của `ai-worker.js`.
4. Thêm dòng vào bảng "Cấu trúc" trong `caro/README.md`.

Máy chủ (`server/`): đăng ký ở `hub/index.js`, kiểm thử trong `server/test/`.

Kiểm thử: module logic mới có `caro/tests/<module>.test.js` và được thêm vào lệnh `coverage` trong
`server/package.json` (ngưỡng 90% dòng). Giao diện mới có bước trong `caro/tests/e2e/*.e2e.js`.

## 4. Khi tách file đang có

- Giữ nguyên hành vi: chỉ di chuyển code, không sửa logic cùng lúc.
- So sánh trước / sau (vd. tập khoá i18n giống hệt, kết quả kiểm thử giống hệt), rồi mới dọn tham chiếu cũ
  (`grep` tên file cũ trong `caro/`, `server/`, README).
- Chạy lại unit test + e2e liên quan.
