/*
 * Kiểm thử trình duyệt: Lớp học / Nghiên cứu (C2 – classroom.js, class-view.js).
 *   node caro/tests/e2e/classroom.e2e.js
 *  - Giáo viên: Xem thêm › Lớp học → tạo bài → bàn cờ + khung bài; bấm bàn cờ = thêm nước; lời bình (trình soạn có định dạng),
 *    dấu ô; tự lưu lên máy chủ.
 *  - Học viên (khách, mở link /?cls=<mã> ở 390 px): thấy cây nước + lời bình; "Theo giáo viên": giáo viên lùi nước → bàn học
 *    viên đi theo; giáo viên đi biến mới ngay sau khi lùi → học viên nhận phần đổi (clsDelta) và đi theo; học viên tự thử
 *    nước → chỉ trên máy mình (máy chủ không đổi). 0 lỗi hiển thị.
 */
'use strict';
const { setup, sleep } = require('./helpers');
const { audit } = require('./ui-audit');

(async () => {
  const PORT = 8139;
  const { browser, user, ok, shot, finish, app } = await setup(PORT);
  const t = await user('vi', 'thay_giao', 1200);
  await t.click('#tabbar [data-tab="more"]');
  await sleep(300);
  await t.click('#more-cls');
  await sleep(300);
  await t.fill('#cls-dlg input[name=title]', 'Thế hoa mai');
  await t.click('#cls-dlg button[type=submit]');
  for (let i = 0; i < 30 && !(await t.evaluate(() => !!(window.CaroClassView.state.id))); i++) await sleep(200);
  const id = await t.evaluate(() => window.CaroClassView.state.id);
  ok(/^[0-9a-f]{12}$/.test(id || ''), 'tạo bài: mở ngay bàn cờ của bài ' + id);
  ok(await t.evaluate(() => !document.getElementById('cls-panel').hidden && document.body.classList.contains('ext')), 'khung bài + bàn cờ');
  const click = async (p, x, y) => { const [sx, sy] = await p.evaluate(([a, b]) => window.CaroApp.screenOf(a, b), [x, y]); await p.mouse.click(sx, sy); await sleep(250); };
  await click(t, 0, 0); await click(t, 1, 1); await click(t, 1, 0);
  ok((await t.textContent('#cls-panel .cls-tree')).replace(/\s+/g, ' ').includes('1.h8 i7 2.i8'), 'cây nước: "1.h8 i7 2.i8"');
  // Lời bình cho nước đang chọn (trình soạn CaroRich)
  await t.fill('#cls-panel textarea[name=c]', 'Nước **then chốt**');
  await t.click('#cls-panel .cls-cform button[type=submit]');
  await sleep(200);
  ok((await t.innerHTML('#cls-panel .cls-c')).includes('<b>then chốt</b>'), 'lời bình hiện bằng CaroRich.render');
  // Dấu ô
  await t.selectOption('#cls-panel select[data-k=mode]', 'mark');
  await click(t, 3, 3);
  ok(await t.evaluate(() => (window.CaroApp.marks || []).some((m) => m.x === 3 && m.y === 3)), 'chế độ Dấu ô: ô được đánh dấu trên bàn');
  await t.selectOption('#cls-panel select[data-k=mode]', 'move');
  await sleep(700); // tự lưu (gom 400 ms)
  const saved = app.hub.store.clsGet(id);
  ok(saved.chapters[0].root.ch[0].ch[0].ch[0].c === 'Nước **then chốt**' && saved.chapters[0].root.ch[0].ch[0].ch[0].s.length === 1, 'máy chủ đã lưu nước, lời bình, dấu ô');
  await t.selectOption('#cls-panel select[data-k=vis]', 'public');

  // Học viên là khách, mở link ở 390 px
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { localStorage.setItem('caro.lang', 'vi'); });
  const s = await ctx.newPage();
  const errs = [];
  s.on('pageerror', (e) => errs.push(e.message));
  await s.goto(`http://localhost:${PORT}/?cls=${id}`);
  for (let i = 0; i < 40 && !(await s.evaluate(() => window.CaroClassView && window.CaroClassView.state.id)); i++) await sleep(200);
  ok((await s.evaluate(() => window.CaroClassView.state.id)) === id, 'học viên (khách) mở link: vào đúng bài');
  ok(await s.evaluate(() => window.CaroApp.board.moves.length === 3), 'học viên thấy đúng chỗ giáo viên đang đứng (3 nước)');
  ok((await s.textContent('#cls-panel .cls-c')).includes('then chốt'), 'học viên thấy lời bình');
  await shot(s, 'class-student-390.png');
  ok((await audit(s, '#cls-panel')).length === 0, 'khung bài của học viên 390px: 0 lỗi hiển thị');
  // Giáo viên lùi 1 nước → học viên đi theo
  await t.click('#cls-panel [data-a="prev"]');
  for (let i = 0; i < 20 && (await s.evaluate(() => window.CaroApp.board.moves.length)) !== 2; i++) await sleep(150);
  ok(await s.evaluate(() => window.CaroApp.board.moves.length === 2), 'theo giáo viên: bàn học viên lùi theo (2 nước)');
  // Giáo viên đi biến mới: học viên nhận phần đổi (clsDelta – chỉ chương vừa sửa) rồi đi theo tới nước mới
  await click(t, 2, 2); // ngay sau khi lùi (dưới 80 ms): tin clsSync cuối vẫn tới học viên
  for (let i = 0; i < 20 && (await s.evaluate(() => window.CaroApp.board.moves.length)) !== 3; i++) await sleep(150);
  ok(await s.evaluate(() => window.CaroApp.board.moves.length === 3 && window.CaroApp.board.moves[2].x === 2 && window.CaroApp.board.moves[2].y === 2), 'biến mới của giáo viên: học viên nhận phần đổi và đi theo');
  // Học viên tự thử nước: không đổi bài trên máy chủ, thôi đi theo
  await click(s, 2, -2); // ô ở nửa trên (khung bài che nửa dưới màn hình điện thoại)
  ok(await s.evaluate(() => window.CaroApp.board.moves.length === 4 && !window.CaroClassView.state.follow), 'học viên tự thử nước: chỉ trên máy mình, tắt "Theo giáo viên"');
  await sleep(300);
  ok(app.hub.store.clsGet(id).chapters[0].root.ch[0].ch[0].ch.length === 2, 'máy chủ không nhận nước thử của học viên (chỉ biến của giáo viên)');
  ok((await audit(t, '#cls-panel')).length === 0, 'khung bài của giáo viên (1200px): 0 lỗi hiển thị');
  ok(!errs.length, 'học viên: không có lỗi JS ' + errs.join(' | '));
  await ctx.close();
  await finish();
})();
