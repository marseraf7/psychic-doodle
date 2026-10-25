/*
 * Kiểm thử trình duyệt: hàng chờ xếp cặp tự tắt lặng lẽ khi rớt kết nối (Issue #144 mục 7).
 *   node caro/tests/e2e/queue-resume.e2e.js
 * Giả thuyết trong Issue đã kiểm chứng đúng: WebSocket rớt → máy chủ wentOffline → dequeue; máy khách
 * nối lại nhận welcome thì setSearching(false) vì tưởng máy chủ sẽ gửi lại trạng thái (không hề — hàng
 * chờ đã bị bỏ). Nay máy khách còn ý định tìm trận thì tự gửi lại quickMatch đúng ô đã chọn khi nối lại;
 * đã bấm Huỷ thì thôi.
 * Rớt mạng được mô phỏng bằng routeWebSocket: đóng kết nối phía máy chủ (setOffline của Chromium không
 * đóng WebSocket đang mở nên không dùng được cho ca này). Hồ sơ trình duyệt riêng như mọi bài khác.
 */
'use strict';
const { setup } = require('./helpers');

(async () => {
  const PORT = 8120;
  const { app, browser, ok, sleep, finish } = await setup(PORT);
  const errs = [];

  // Người chơi trong hồ sơ riêng, có móc cắt WebSocket phía máy chủ theo yêu cầu.
  async function user(name) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
    await ctx.addInitScript((l) => { localStorage.setItem('caro.lang', l); }, 'vi');
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(name + ': ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(name + ' console: ' + m.text()); });
    p.on('dialog', (d) => d.accept());
    let kill = null;
    await p.routeWebSocket(/\/ws$/, (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((m) => server.send(m));
      server.onMessage((m) => ws.send(m));
      server.onClose(() => ws.close());
      ws.onClose(() => server.close());
      kill = () => server.close();
    });
    p.killWs = () => { if (kill) kill(); };
    await p.goto(`http://localhost:${PORT}/`);
    await sleep(400);
    await p.click('#tabbar [data-tab="more"]');
    await sleep(500);
    await p.click('#go-register');
    await sleep(150);
    await p.fill('#auth-form input[name=username]', name);
    await p.fill('#auth-form input[name=password]', 'caro-pass1');
    await p.click('#auth-submit');
    await sleep(700);
    return p;
  }

  const a = await user('hq_a');
  const pid = await a.evaluate(() => window.CaroOnline.state.me.id);
  const inQueue = () => app.hub.queue.has(pid);
  async function waitFor(fn, what, tries = 80) {
    for (let i = 0; i < tries; i++) { if (fn()) return true; await sleep(250); }
    throw new Error('quá hạn chờ: ' + what);
  }

  // Bấm ô 3+2 trên lưới Chơi nhanh ở Trang chủ (đường bấm thật — bật ý định tìm trận)
  await a.evaluate(() => window.CaroShell.open('home'));
  await sleep(400);
  await a.click('#qm-grid .qm-tile[data-clock="3+2"]');
  await sleep(800);
  ok(await a.evaluate(() => window.CaroMatch.searching), 'bấm ô 3+2: đang tìm trận');
  ok(inQueue(), 'máy chủ có người chơi trong hàng chờ');

  // Rớt kết nối: máy chủ bỏ hàng chờ, phía khách cũng thôi hiện "đang tìm"
  await a.killWs();
  await waitFor(() => !inQueue(), 'máy chủ bỏ hàng chờ khi rớt kết nối');
  ok(true, 'rớt kết nối: máy chủ bỏ hàng chờ (wentOffline → dequeue)');
  await sleep(600);
  ok(!(await a.evaluate(() => window.CaroMatch.searching)), 'rớt kết nối: phía khách thôi hiện "đang tìm"');

  // Máy khách tự nối lại (retry 1 giây) → welcome → tự gửi lại yêu cầu tìm đúng ô đã chọn
  await waitFor(() => inQueue(), 'tự tìm lại sau khi nối lại');
  ok(true, 'nối lại: máy khách tự gửi lại yêu cầu tìm trận (không cần bấm gì)');
  ok(await a.evaluate(() => window.CaroMatch.searching), 'nối lại: giao diện hiện "đang tìm" trở lại');
  const e = app.hub.queue.get(pid);
  ok(e && e.clock === '3+2', 'nối lại: hàng chờ giữ đúng ô đã chọn (3+2)');

  // Đã huỷ tìm thì rớt + nối lại không tự tìm lại nữa
  await a.evaluate(() => window.CaroOnline.send({ t: 'quickCancel' }));
  await sleep(700);
  ok(!inQueue(), 'bấm huỷ: ra khỏi hàng chờ');
  await a.killWs();
  await sleep(4000); // đủ lâu cho kết nối lại + welcome
  ok(!inQueue(), 'đã huỷ: nối lại KHÔNG tự tìm lại');
  ok(!(await a.evaluate(() => window.CaroMatch.searching)), 'đã huỷ: giao diện không hiện "đang tìm"');
  ok(!errs.length, 'không có lỗi JS phía khách' + (errs.length ? ': ' + errs.join(' | ') : ''));

  await finish();
})();
