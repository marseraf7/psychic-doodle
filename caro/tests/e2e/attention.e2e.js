/*
 * Kiểm thử trình duyệt: tiêu đề tab báo lượt trong ván online, hết ván; giữ màn hình sáng (attention.js);
 * kết nối "chết lặng" (ping không được trả lời) thì tự kết nối lại (online.js).
 *   node caro/tests/e2e/attention.e2e.js
 */
'use strict';
const { setup, play, roomOf } = require('./helpers');

(async () => {
  const { app, browser, user, ok, sleep, finish } = await setup(8101);
  const a = await user('vi', 'tab_a');
  const b = await user('en', 'tab_b');
  ok(await a.title() === 'Caro x Gomoku', 'chưa có ván: tiêu đề gốc');
  await a.click('#tabbar [data-tab="home"]');
  await a.click('.home-tabs [data-hpane="lobby"]');
  await a.check('#room-public');
  await a.click('#create-room');
  await sleep(600);
  const r0 = await roomOf(a);
  await a.keyboard.press('Escape');
  ok(await a.title() === 'Caro x Gomoku', 'chờ người vào phòng: chưa đổi tiêu đề');
  await b.evaluate((code) => window.CaroOnline.send({ t: 'joinRoom', code }), r0.code);
  await sleep(700);
  const r = await roomOf(a);
  const [xp, op] = r.seats.x === a.uid ? [a, b] : [b, a];
  const tx = await xp.title(), to = await op.title();
  ok(/^(Đến lượt bạn|Your turn) – /.test(tx), 'bên X (tới lượt): ' + tx);
  ok(/^(Đang chờ đối thủ|Waiting for opponent) – /.test(to), 'bên O (chờ): ' + to);
  await play(xp, op); // X thắng
  await sleep(500);
  ok(/^Hết ván – Caro x Gomoku$/.test(await a.title()) && /^Game over – /.test(await b.title()), 'hết ván: "Hết ván" / "Game over" theo ngôn ngữ từng người');
  // Rời phòng: về tiêu đề gốc
  await a.evaluate(() => window.CaroOnline.send({ t: 'leave' }));
  await sleep(500);
  ok(!/^(Đến lượt|Đang chờ)/.test(await a.title()), 'rời phòng: không còn báo lượt');
  // Đổi ngôn ngữ giữa chừng: tiêu đề gốc đổi theo
  await b.evaluate(() => window.I18N.setLang('vi'));
  await sleep(200);
  ok(/^Hết ván – Caro x Gomoku$/.test(await b.title()), 'đổi ngôn ngữ: tiêu đề đổi theo – ' + await b.title());
  // Với máy (trang khách mới, chưa vào phòng): không đổi tiêu đề; giữ màn hình sáng khi ở bàn cờ, thôi khi sang menu
  const c = await (await browser.newContext({ viewport: { width: 430, height: 860 } })).newPage();
  await c.goto('http://localhost:8101/');
  await sleep(500);
  await c.evaluate(() => window.CaroApp.startPreset({ mode: 'ai', human: 1, moves: [[0, 0]] }));
  await sleep(300);
  ok(!/Đến lượt/.test(await c.title()), 'ván với máy: giữ tiêu đề gốc');
  ok(await c.evaluate(() => window.CaroAttention.wanted), 'ván dở, đang ở bàn cờ: muốn giữ màn hình sáng');
  await c.evaluate(() => window.CaroShell.open('home'));
  await sleep(200);
  ok(!(await c.evaluate(() => window.CaroAttention.wanted)), 'sang Trang chủ (ván vẫn dở): thôi giữ màn hình sáng');
  await c.click('#home-resume, [data-home="resume"]').catch(() => c.evaluate(() => window.dispatchEvent(new Event('caro:board'))));
  await sleep(300);
  ok(await c.evaluate(() => window.CaroAttention.wanted), 'quay lại bàn cờ: giữ màn hình sáng lại');
  await c.context().close();

  // Kết nối chết lặng: mọi tin gửi đi bị nuốt (như đổi mạng di động) → hết hạn ping thì tự kết nối lại
  const sock0 = await b.evaluate(() => {
    window.__wsCount = 0;
    const orig = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) { if (window.__mute) return; return orig.call(this, d); };
    window.__mute = true;
    return window.CaroOnline.state.status;
  });
  ok(sock0 === 'online', 'trước khi mất mạng: online');
  let st = '';
  for (let k = 0; k < 80 && st !== 'offline' && st !== 'connecting'; k++) { await sleep(500); st = await b.evaluate(() => window.CaroOnline.state.status); }
  ok(st === 'offline' || st === 'connecting', 'không nghe thấy pong: tự nhận ra mất kết nối (' + st + ')');
  await b.evaluate(() => { window.__mute = false; });
  for (let k = 0; k < 70 && st !== 'online'; k++) { await sleep(300); st = await b.evaluate(() => window.CaroOnline.state.status); }
  ok(st === 'online', 'mạng trở lại: tự kết nối lại');
  // Máy chủ cũ chưa có lệnh ping (bản web được cập nhật trước máy chủ): không hiện lỗi cho người chơi, thôi ping
  const handle = app.hub.handle.bind(app.hub);
  app.hub.handle = (conn, raw) => (String(raw).includes('"t":"ping"') ? conn.send({ t: 'error', code: 'unsupported', msg: 'Lệnh không hỗ trợ' }) : handle(conn, raw));
  await a.evaluate(() => { window.__toasts = 0; new MutationObserver((l) => l.forEach((m) => { window.__toasts += m.addedNodes.length; })).observe(document.getElementById('toasts'), { childList: true }); });
  await sleep(12000); // ít nhất một lần ping
  ok((await a.evaluate(() => window.__toasts)) === 0, 'máy chủ cũ trả "Lệnh không hỗ trợ" cho ping: không hiện thông báo lỗi');
  ok((await a.evaluate(() => window.CaroOnline.state.status)) === 'online', 'máy chủ cũ: vẫn online, không bị ngắt');
  app.hub.handle = handle;
  await finish();
})().catch((e) => { console.error(e); process.exit(1); });
