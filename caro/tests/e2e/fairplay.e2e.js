/*
 * Soát chơi đẹp: trong ván online, rời tab lúc tới lượt mình được đếm và lưu kèm ván (fairplay.js → hub/fairplay.js);
 * rời tab lúc không phải lượt mình thì không đếm. Quản trị viên mở "Soát chơi đẹp" ở tab Xem thêm → thấy ván trong hàng chờ,
 * "So với máy cờ" chạy trên trình duyệt và lưu kết quả, "Đã xem" chuyển khỏi danh sách chờ. Người thường không có mục này.
 *   node caro/tests/e2e/fairplay.e2e.js
 */
'use strict';
const { setup, sleep, play } = require('./helpers');
const { audit } = require('./ui-audit');

(async () => {
  const PORT = 8125;
  const { app, user, ok, shot, finish } = await setup(PORT, { FIRST_MOVE_MS: 5000 });
  const boss = await user('vi', 'boss', 390);
  const a = await user('vi', 'fp_ann', 390);
  const b = await user('vi', 'fp_ben', 390);
  const quick = (p) => p.evaluate(() => window.CaroOnline.send({ t: 'quickMatch', timeLimit: -1 }));
  await quick(a); await quick(b);
  await sleep(1200);
  const r0 = await a.evaluate(() => window.CaroOnline.state.room);
  ok(!!r0 && r0.players.length === 2, 'ghép nhanh xong');
  const [px, po] = r0.seats.x === a.uid ? [a, b] : [b, a];
  const send = (p, m) => p.evaluate((x) => window.CaroOnline.send(x), m);
  const away = (p, ms) => p.evaluate(async (t) => { window.dispatchEvent(new Event('blur')); await new Promise((r) => setTimeout(r, t)); window.dispatchEvent(new Event('focus')); }, ms);
  await send(px, { t: 'move', x: 20, y: 20 }); await sleep(300);
  // Lượt của O: X rời tab → không đếm
  await away(px, 400);
  await send(po, { t: 'move', x: -20, y: -20 }); await sleep(300);
  // Lượt của X: rời tab 2 lần
  await away(px, 700);
  await sleep(4200);
  await away(px, 500);
  await sleep(4200);
  await play(px, po);
  await sleep(800);
  const row = app.store.db.prepare('SELECT f.* FROM fp_game f ORDER BY at DESC LIMIT 1').get();
  ok(!!row && row.x_n === 2 && row.o_n === 0, `lưu kèm ván: X rời tab 2 lần trong lượt mình, O 0 (${row && row.x_n}/${row && row.o_n})`);
  ok(!!row && row.x_ms >= 1000 && row.x_ms < 5000, `tổng thời gian rời tab hợp lý (${row && row.x_ms} ms)`);
  app.store.fpEnqueue(row.share, 'report');

  // ---------------------------------------------------------------- Trang quản trị
  await boss.click('#tabbar [data-tab="more"]');
  await sleep(400);
  ok(!!(await boss.$('#more-fairplay')), 'quản trị viên có mục Soát chơi đẹp');
  ok(!(await a.$('#more-fairplay')), 'người thường không có mục này');
  await boss.click('#more-fairplay');
  await boss.waitForSelector('#fp-dlg[open] .fp-item', { timeout: 5000 });
  const txt = await boss.evaluate(() => document.getElementById('fp-dlg-body').textContent);
  ok(/Bị báo cáo gian lận/.test(txt) && /rời tab 2 lần/.test(txt), 'hàng chờ: lý do + số lần rời tab');
  ok(!/xử phạt|Khoá tài khoản/i.test(await boss.evaluate(() => [...document.querySelectorAll('#fp-dlg button')].map((x) => x.textContent).join('|'))), 'không có nút xử phạt');
  ok((await audit(boss, '#fp-dlg')).length === 0, 'soát giao diện 390 px: 0 lỗi hiển thị');
  await boss.click('#fp-dlg [data-fpa]');
  await boss.waitForFunction(() => /trùng máy cờ \d+%/.test(document.getElementById('fp-dlg-body').textContent), null, { timeout: 90000 }).catch(() => {});
  ok(/trùng máy cờ \d+%/.test(await boss.evaluate(() => document.getElementById('fp-dlg-body').textContent)), 'So với máy cờ: có tỉ lệ trùng nước');
  const st = app.store.fpQueue('open')[0];
  ok(!!(st && st.stats && st.stats[1]), 'kết quả lưu ở máy chủ');
  await shot(boss, 'fairplay-390.png');
  await boss.click('#fp-dlg [data-fpm="reviewed"]');
  await sleep(500);
  ok(app.store.fpQueue('open').length === 0, 'Đã xem: rời hàng chờ');
  await finish();
})();
