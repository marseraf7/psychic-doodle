/*
 * Kiểm thử trình duyệt: mở link phòng CÔNG KHAI vào vai khán giả trước (F6).
 *   node caro/tests/e2e/link-watch.e2e.js
 * Trước đây khách mở ?room= của phòng công khai còn trống ghế bị đặt thẳng vào ghế người
 * chơi (ghế O) dù chỉ định xem/chia sẻ link. Nay: mở link -> xem trực tiếp (khán giả),
 * thanh xem hiện nút "Vào chơi" khi phòng còn một ghế trống và ván chưa bắt đầu; bấm nút
 * đó mới ngồi ghế. Link phòng riêng vẫn hỏi mật khẩu (xem watch-fix144.e2e.js mục A).
 */
'use strict';
const { setup } = require('./helpers');

(async () => {
  const PORT = 8135;
  const { browser, user, ok, sleep, finish } = await setup(PORT);
  const send = (p, m) => p.evaluate((x) => window.CaroOnline.send(x), m);
  const room = (p) => p.evaluate(() => window.CaroOnline.state.room);
  async function waitRoom(p, pred, what) {
    for (let i = 0; i < 40; i++) { const r = await room(p); if (r && pred(r)) return r; await sleep(250); }
    throw new Error('quá hạn chờ: ' + what);
  }

  // Chủ phòng tạo phòng CÔNG KHAI, đang chờ một mình.
  const host = await user('vi', 'lk_host');
  await send(host, { t: 'createRoom', public: true });
  const hr = await waitRoom(host, (r) => r.players.length === 1 && r.public, 'chủ tạo phòng công khai');

  // Khách (chưa đăng nhập) mở link phòng: phải vào XEM, không ngồi ghế.
  const gtx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const g = await gtx.newPage();
  await g.goto(`http://localhost:${PORT}/?room=${hr.code}`);
  let watching = false;
  for (let i = 0; i < 40 && !watching; i++) { watching = await g.evaluate(() => !!window.CaroApp.watching); if (!watching) await sleep(250); }
  ok(watching, 'khách mở link phòng công khai: vào vai khán giả (đang xem), không vào ván');
  ok((await room(g)) === null, 'khách: không có phòng người chơi (chưa ngồi ghế)');
  const hr2 = await room(host);
  ok(hr2.players.length === 1, 'chủ phòng: vẫn chỉ 1 người chơi — khách không bị ghế vào ghế O');
  ok(await g.evaluate(() => !document.getElementById('wt-join').hidden), 'thanh xem: nút "Vào chơi" hiện vì còn một ghế trống');

  // Bấm "Vào chơi": lúc này mới ngồi ghế.
  await g.click('#wt-join');
  const gr = await waitRoom(g, (r) => r.players.length === 2, 'khách ngồi ghế sau khi bấm Vào chơi');
  ok(gr.players.length === 2, 'bấm Vào chơi: khách thành người chơi, phòng đủ 2 người');
  const hr3 = await waitRoom(host, (r) => r.players.length === 2, 'chủ thấy khách vào ghế');
  ok(hr3.players.length === 2, 'chủ phòng: thấy người thứ hai vào ghế sau khi khách chủ động bấm');

  await finish();
})();
