/*
 * Kiểm thử trình duyệt: Hộp thư + Thông báo trên thanh trên (topbar-inbox.js) và ẩn bong bóng chat (chat-bubbles.js).
 *   node caro/tests/e2e/inbox.e2e.js
 *  - Khách: không có nút Hộp thư / Thông báo. Đã đăng nhập: hai nút nằm giữa ảnh đại diện và bánh răng Cài đặt.
 *  - Lời mời kết bạn: Thông báo có số 1, mở ra Chấp nhận ngay tại chỗ; người gửi nhận thông báo "đã chấp nhận".
 *  - Tin nhắn mới: số trên Hộp thư; mở Hộp thư → bấm tên bạn → cửa sổ chat.
 *  - Ẩn bong bóng chat (nút ×): nút tròn biến mất, nhớ sau khi tải lại; tin mới không bật chat head; Hộp thư vẫn mở được
 *    cửa sổ chat; "Hiện lại bong bóng chat" đưa nút tròn về.
 *  - Mọi bề rộng 360 → 1920 px: thanh trên không tràn ngang, bánh răng trong màn hình.
 */
'use strict';
const { setup } = require('./helpers');

(async () => {
  const PORT = 8137;
  const { browser, user, ok, shot, sleep, finish } = await setup(PORT);
  const until = async (p, fn, arg, ms = 6000) => { try { await p.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { return false; } };
  const home = (p) => p.click('#tabbar [data-tab="home"]').catch(() => {});

  // ---------------------------------------------------------------- Khách: không có hai nút
  const gctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  await gctx.addInitScript(() => localStorage.setItem('caro.lang', 'vi'));
  const g = await gctx.newPage();
  await g.goto(`http://localhost:${PORT}/`);
  await sleep(1200);
  ok(await g.evaluate(() => document.getElementById('tb-inbox').hidden), 'khách: không có nút Hộp thư / Thông báo');
  await gctx.close();

  // ---------------------------------------------------------------- Đã đăng nhập: vị trí
  const a = await user('vi', 'ib_an', 1280);
  const b = await user('vi', 'ib_binh', 1280);
  await home(a); await home(b);
  const order = await a.evaluate(() => {
    const x = (id) => { const r = document.querySelector(id).getBoundingClientRect(); return r.width ? r.left : -1; };
    return { me: x('#tb-auth .tb-me'), msg: x('#tb-msg'), bell: x('#tb-bell'), gear: x('#tb-gear'), shown: !document.getElementById('tb-inbox').hidden };
  });
  ok(order.shown && order.me < order.msg && order.msg < order.bell && order.bell < order.gear, 'đã đăng nhập: ảnh đại diện → Hộp thư → Thông báo → Cài đặt – ' + JSON.stringify(order));

  // ---------------------------------------------------------------- Lời mời kết bạn → Thông báo
  await a.evaluate(() => window.CaroOnline.send({ t: 'friendAdd', username: 'ib_binh' }));
  ok(await until(b, () => !document.querySelector('#tb-bell .tb-count').hidden && document.querySelector('#tb-bell .tb-count').textContent === '1'), 'người được mời: Thông báo có số 1');
  await b.click('#tb-bell');
  ok(await until(b, () => /ib_an muốn kết bạn với bạn|muốn kết bạn/.test(document.getElementById('tb-pop').textContent)), 'mở Thông báo: "… muốn kết bạn với bạn"');
  await shot(b, 'inbox-notif.png');
  await b.click('#tb-pop [data-accept]');
  ok(await until(b, () => (window.CaroOnline.state.friends.friends || []).some((f) => f.username === 'ib_an')), 'Chấp nhận ngay trong Thông báo: thành bạn bè');
  ok(await until(a, () => !document.querySelector('#tb-bell .tb-count').hidden), 'người gửi: có thông báo mới');
  await a.click('#tb-bell');
  ok(await until(a, () => /đã chấp nhận lời mời kết bạn/.test(document.getElementById('tb-pop').textContent)), 'người gửi: "… đã chấp nhận lời mời kết bạn"');
  await a.keyboard.press('Escape');
  ok(await until(a, () => document.querySelector('#tb-bell .tb-count').hidden), 'đã xem thông báo: hết số');

  // ---------------------------------------------------------------- Tin nhắn → Hộp thư
  const bId = await b.evaluate(() => window.CaroOnline.state.me.uid);
  const aId = await a.evaluate(() => window.CaroOnline.state.me.uid);
  await b.evaluate((id) => window.CaroOnline.send({ t: 'dmSend', to: id, text: 'chào bạn' }), aId);
  ok(await until(a, () => document.querySelector('#tb-msg .tb-count').textContent === '1' && !document.querySelector('#tb-msg .tb-count').hidden), 'tin nhắn mới: Hộp thư có số 1');
  await a.click('#tb-msg');
  ok(await until(a, () => !!document.querySelector('#tb-pop [data-chat]')), 'mở Hộp thư: danh sách bạn bè');
  await shot(a, 'inbox-msg.png');
  await a.click('#tb-pop [data-chat]');
  ok(await until(a, (id) => !!document.querySelector(`.cb-win[data-id="${id}"]`) && /chào bạn/.test(document.querySelector('.cb-win').textContent), bId), 'bấm tên bạn: cửa sổ chat có tin nhắn');
  ok(await until(a, () => document.querySelector('#tb-msg .tb-count').hidden), 'đọc rồi: Hộp thư hết số');
  await a.evaluate(() => document.querySelectorAll('.cb-win [data-close]').forEach((x) => x.click()));

  // ---------------------------------------------------------------- Ẩn bong bóng chat
  await a.hover('.cb-launch');
  await sleep(150);
  ok(await a.isVisible('.cb-hide'), 'rê chuột vào bong bóng: hiện nút ×');
  await a.click('.cb-hide');
  ok(await until(a, () => document.getElementById('cb').hidden || document.querySelector('.cb-lw').hidden), 'bấm ×: bong bóng chat biến mất');
  ok(await a.evaluate(() => [...document.querySelectorAll('.toast')].some((x) => /Đã ẩn bong bóng chat/.test(x.textContent))), 'thông báo cách mở lại');
  await a.reload();
  await sleep(1500);
  await home(a);
  ok(await until(a, () => !document.getElementById('tb-inbox').hidden), 'tải lại: thanh trên có Hộp thư');
  ok(await a.evaluate(() => document.getElementById('cb').hidden || document.querySelector('.cb-lw').hidden), 'tải lại: bong bóng vẫn ẩn');
  await b.evaluate((id) => window.CaroOnline.send({ t: 'dmSend', to: id, text: 'tin thứ hai' }), aId);
  ok(await until(a, () => document.querySelector('#tb-msg .tb-count').textContent === '1'), 'đã ẩn: tin mới vẫn đếm ở Hộp thư');
  ok(await a.evaluate(() => !document.querySelector('.cb-head')), 'đã ẩn: không bật chat head');
  await a.click('#tb-msg');
  await a.click('#tb-pop [data-chat]');
  ok(await until(a, () => !!document.querySelector('.cb-win') && /tin thứ hai/.test(document.querySelector('.cb-win').textContent)), 'đã ẩn: mở chat từ Hộp thư vẫn ra cửa sổ chat');
  await a.evaluate(() => document.querySelectorAll('.cb-win [data-close]').forEach((x) => x.click()));
  await a.click('#tb-msg');
  await a.click('#tb-pop [data-showcb]');
  ok(await until(a, () => !document.getElementById('cb').hidden && !document.querySelector('.cb-lw').hidden), '"Hiện lại bong bóng chat": nút tròn trở lại');
  await a.keyboard.press('Escape');

  // ---------------------------------------------------------------- Mọi bề rộng
  for (const w of [1920, 1536, 1366, 1280, 1100, 1024, 900, 820, 768, 430, 390, 360]) {
    await a.setViewportSize({ width: w, height: 760 });
    await sleep(150);
    const r = await a.evaluate(() => {
      const gr = document.getElementById('tb-gear').getBoundingClientRect();
      const bell = document.getElementById('tb-bell').getBoundingClientRect();
      return { gear: gr.width > 0 && gr.right <= innerWidth, bell: bell.width > 0 && bell.right <= gr.left + 1, wide: document.documentElement.scrollWidth <= innerWidth + 1 };
    });
    ok(r.gear && r.bell && r.wide, `${w}px: Hộp thư / Thông báo / Cài đặt gọn trong màn hình – ` + JSON.stringify(r));
    if (w === 360) {
      await a.click('#tb-bell');
      await sleep(150);
      const pop = await a.evaluate(() => { const p = document.getElementById('tb-pop').getBoundingClientRect(); return p.left >= 0 && p.right <= innerWidth; });
      ok(pop, '360px: bảng Thông báo nằm gọn màn hình');
      await shot(a, 'inbox-360.png');
      await a.keyboard.press('Escape');
    }
  }
  await finish();
})();
