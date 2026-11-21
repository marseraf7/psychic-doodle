/*
 * Kiểm thử trình duyệt: Tường thuật giải đấu (C3 – broadcast.html / broadcast.js, nút ở trang giải tour-broadcast.js).
 *   node caro/tests/e2e/broadcast.e2e.js
 *  - Giải Arena công khai đang chạy: trang giải có nút "Tường thuật trực tiếp" → /?bc=<mã>.
 *  - Trang tường thuật (390 px): bàn nhỏ của ván đang đấu tự hiện nước mới (không tải lại), ván xong → kết quả gần đây +
 *    bảng xếp hạng, ván của vòng sau tự hiện; bấm bàn nhỏ → mở xem ván (/?room=<mã>). 0 lỗi hiển thị.
 */
'use strict';
const { setup, sleep } = require('./helpers');
const { audit } = require('./ui-audit');

(async () => {
  const PORT = 8137;
  const { browser, user, ok, shot, finish } = await setup(PORT, { ARENA_REST_MS: 500, ARENA_REPEAT_MS: 0 });
  const boss = await user('vi', 'boss');
  const a = await user('vi', 'bc_a');
  const b = await user('vi', 'bc_b');
  const send = (p, m) => p.evaluate((x) => window.CaroOnline.send(x), m);
  const id = await boss.evaluate(() => new Promise((res) => {
    window.CaroOnline.on('tourCreated', (m) => res(m.id));
    window.CaroOnline.send({ t: 'tourCreate', name: 'Cúp Tường Thuật', format: 'arena', startsAt: Date.now() + 6 * 60000, timeLimit: 30, minutes: 30, rated: false });
  }));
  await send(a, { t: 'tourJoin', id }); await send(b, { t: 'tourJoin', id });
  await sleep(300);
  await send(boss, { t: 'tourStart', id });
  await sleep(1200);

  // Trang giải: nút Tường thuật cạnh Chia sẻ
  await boss.evaluate((tid) => window.CaroTour.open(tid), id);
  await sleep(800);
  const href = await boss.evaluate(() => { const el = document.querySelector('.tour-bc'); return el && el.getAttribute('href'); });
  ok(!!href && href.endsWith('/?bc=' + id), 'trang giải có nút "Tường thuật trực tiếp": ' + href);

  // Trang tường thuật ở 390 px
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const v = await ctx.newPage();
  const errs = [];
  v.on('pageerror', (e) => errs.push(e.message));
  await v.goto(`http://localhost:${PORT}/?bc=${id}&lang=vi`);
  await sleep(1200);
  ok((await v.textContent('.bc-head h1')).includes('Cúp Tường Thuật'), 'tiêu đề giải');
  ok((await v.$$('.bc-board')).length === 1, 'một bàn nhỏ cho ván đang đấu');
  const room = await a.evaluate(() => window.CaroOnline.state.room);
  const first = room.seats.x === a.uid ? a : b, second = first === a ? b : a;
  await send(first, { t: 'move', x: 0, y: 0 });
  await send(second, { t: 'move', x: 1, y: 1 });
  let n = 0;
  for (let i = 0; i < 30 && n < 2; i++) { await sleep(400); n = await v.evaluate(() => document.querySelectorAll('.bc-board .bc-x, .bc-board .bc-o').length); }
  ok(n === 2, 'bàn nhỏ tự hiện 2 nước mới (không tải lại trang)');
  ok((await v.textContent('.bc-board small')).includes('2 nước'), 'dưới bàn: "2 nước · lượt …"');
  await shot(v, 'broadcast-390.png');
  ok((await audit(v)).length === 0, 'trang tường thuật 390px: 0 lỗi hiển thị');
  // Ván xong → kết quả gần đây + bảng xếp hạng; vòng sau tự hiện
  await send(second, { t: 'resign' });
  let res = '';
  for (let i = 0; i < 30 && !res.includes('1 – 0'); i++) { await sleep(400); res = await v.evaluate(() => (document.querySelector('.bc-res') || {}).textContent || ''); }
  ok(res.includes('1 – 0'), 'kết quả gần đây: "… – … 1 – 0"');
  ok((await v.$$('.bc-table tr')).length === 2, 'bảng xếp hạng có 2 người');
  let fresh = false;
  for (let i = 0; i < 30 && !fresh; i++) { await sleep(400); fresh = await v.evaluate(() => [...document.querySelectorAll('.bc-board small')].some((s) => /0 nước/.test(s.textContent))); }
  ok(fresh, 'ván của vòng sau tự hiện trên lưới');
  ok((await audit(v)).length === 0, 'sau khi có kết quả: 0 lỗi hiển thị');
  // Bấm bàn nhỏ → xem ván
  const code = await v.evaluate(() => [...document.querySelectorAll('.bc-board')].find((x) => /0 nước/.test(x.textContent)).getAttribute('href'));
  ok(/^\/\?room=\d{6}$/.test(code), 'bàn nhỏ là link xem ván: ' + code);
  ok(!errs.length, 'trang tường thuật không có lỗi JS: ' + errs.join(' | '));
  await ctx.close();
  await finish();
})();
