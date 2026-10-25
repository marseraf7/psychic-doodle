/*
 * Kiểm thử trình duyệt: Xếp cặp nhanh (báo cáo kiểm thử 25/10 của Laplace, loi-13 / loi-14).
 *   node caro/tests/e2e/quickmatch.e2e.js
 *  - Ghép trận lần 2 khi đang ở Trang chủ (phòng ván trước đã xong): tự vào bàn cờ, thẻ "Quay lại ván" đúng mã phòng mới,
 *    bấm chuột giữa bàn đi được nước đầu (trước đây đứng lại ở Trang chủ, quá hạn nước đầu thì ván bị huỷ).
 *  - Bị cấm tìm trận vì bỏ ván nhiều: ô Chơi nhanh hiện dòng nhắc + đếm ngược và khoá các ô (trước đây không thấy gì).
 * Hai người chơi ở hai hồ sơ trình duyệt riêng (helpers.user mở context mới cho mỗi người).
 */
'use strict';
const { setup } = require('./helpers');

(async () => {
  const PORT = 8102;
  // Hạn nước đầu 2 giây để thử phần cấm tìm trận nhanh
  const { app, user, ok, shot, sleep, finish } = await setup(PORT, { FIRST_MOVE_MS: 2000 });
  const a = await user('vi', 'qm_a');
  const b = await user('vi', 'qm_b');
  const room = (p) => p.evaluate(() => window.CaroOnline.state.room);
  const meId = (p) => p.evaluate(() => window.CaroOnline.state.me.id);
  const inShell = (p) => p.evaluate(() => document.body.classList.contains('shell-on'));
  const quick = (p) => p.evaluate(() => window.CaroOnline.send({ t: 'quickMatch', timeLimit: -1 }));
  const send = (p, m) => p.evaluate((x) => window.CaroOnline.send(x), m);
  async function clickCenter(p) {
    const c = await p.evaluate(() => { const r = document.getElementById('board').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.mouse.click(c.x, c.y);
  }
  const actorOf = async (r) => (r.actor === await meId(a) ? a : b);

  // ---------------------------------------------------------------- Ván 1: ghép, đi 2 nước, một bên đầu hàng
  await quick(a); await quick(b);
  await sleep(1200);
  let r = await room(a);
  ok(r && r.players.length === 2 && !(await inShell(a)) && !(await inShell(b)), 'ván 1: ghép xong cả hai vào bàn cờ');
  let first = await actorOf(r), second = first === a ? b : a;
  await send(first, { t: 'move', x: 0, y: 0 }); await sleep(250);
  await send(second, { t: 'move', x: 5, y: 5 }); await sleep(250);
  await send(second, { t: 'resign' }); await sleep(600);
  ok(!!(await room(a)).winner, 'ván 1 kết thúc');
  const code1 = r.code;

  // ---------------------------------------------------------------- Về Trang chủ, ghép lại (loi-13)
  for (const p of [a, b]) { await p.keyboard.press('Escape'); await p.evaluate(() => window.CaroShell.open('home')); }
  await sleep(400);
  ok(await inShell(a) && await inShell(b), 'cả hai đang ở Trang chủ, máy khách vẫn giữ phòng ván 1');
  await quick(a); await quick(b);
  await sleep(1200);
  r = await room(a);
  ok(r.code !== code1 && r.players.length === 2, 'ván 2: ghép được phòng mới ' + r.code);
  ok(!(await inShell(a)) && !(await inShell(b)), 'ván 2: cả hai TỰ VÀO bàn cờ dù đang ở Trang chủ (loi-13)');
  first = await actorOf(r);
  await clickCenter(first);
  await sleep(600);
  ok((await room(a)).moves.length === 1, 'ván 2: bấm chuột giữa bàn đi được nước đầu');
  await shot(first, 'quickmatch-v2.png');
  // Thẻ "Quay lại ván" ở Trang chủ ghi đúng mã phòng hiện tại (trước đây chậm một ván)
  await first.evaluate(() => window.CaroShell.open('home'));
  await sleep(300);
  const resume = await first.textContent('#home-resume');
  ok(resume.includes(r.code) && !resume.includes(code1), 'thẻ "Quay lại ván" ghi mã phòng mới: ' + resume.replace(/\s+/g, ' ').trim());
  await first.click('#home-resume [data-resume]');
  await sleep(300);
  second = first === a ? b : a;
  await send(second, { t: 'move', x: 5, y: 5 }); await sleep(250);
  await send(second, { t: 'resign' }); await sleep(600);

  // ---------------------------------------------------------------- Cấm tìm trận (loi-14)
  // Ghi thẳng 4 lần "không đi nước đầu" ở máy chủ (playban.js, ngưỡng 3 điểm xấu) – ghép thật thì người vừa bỏ lỡ chỉ được
  // ghép với người khác sau 20 giây chờ, quá chậm cho bài thử. Phần cần kiểm là máy khách hiện lệnh cấm ra sao.
  const pidA = 'u_' + app.store.byUsername.get('qm_a').id;
  for (let k = 0; k < 4; k++) app.hub.recordOutcome(pidA, 'n');
  await sleep(500);
  const banned = (await a.evaluate(() => (window.CaroOnline.state.me.playban || 0) > 0)) ? a : null;
  ok(!!banned, 'bỏ lỡ nước đầu nhiều lần thì bị cấm tìm trận');
  if (banned) {
    await banned.evaluate(() => window.CaroShell.open('home'));
    await sleep(1200);
    const txt = await banned.textContent('#qm-ban');
    ok(await banned.isVisible('#qm-ban') && /\d+:\d\d/.test(txt), 'ô Chơi nhanh hiện dòng cấm kèm đếm ngược: ' + txt);
    ok(await banned.evaluate(() => [...document.querySelectorAll('#qm-grid .qm-tile[data-time]')].every((t) => t.disabled)), 'các ô ghép trận bị khoá trong lúc cấm');
    await shot(banned, 'quickmatch-ban.png');
  }
  await finish();
})();
