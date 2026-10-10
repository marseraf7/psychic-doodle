/*
 * Kiểm thử trình duyệt đợt D (học từ Lichess): huỷ ván, đếm ngược nước đầu, xin đi lại, thêm giờ,
 * thống kê sâu trên hồ sơ, số liệu máy chủ cho quản trị viên, Puzzle Storm + độ khó, ảnh xem trước link chia sẻ.
 *   node caro/tests/e2e/batchd.e2e.js
 */
'use strict';
const { setup, play } = require('./helpers');

(async () => {
  const PORT = 8098;
  // Mất kết nối 2 giây thì bị xử thua (thật: 90 giây) để thử phần ban tổ chức xử lý ván mất kết nối
  const { browser, user, ok, shot, sleep, finish } = await setup(PORT, { OFFLINE_FORFEIT_MS: 2000 });
  const room = (p) => p.evaluate(() => window.CaroOnline.state.room);
  const send = (p, m) => p.evaluate((m) => window.CaroOnline.send(m), m);
  const closeDialogs = (p) => p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));

  const a = await user('vi', 'dd_an');
  const b = await user('vi', 'dd_binh');
  // ---------------------------------------------------------------- Phòng riêng: huỷ ván, đi lại
  await send(a, { t: 'createRoom' });
  await sleep(500);
  const r0 = await room(a);
  await send(b, { t: 'joinRoom', code: r0.code, password: r0.password });
  await sleep(600);
  await closeDialogs(a); await closeDialogs(b);
  ok((await a.textContent('#btn-resign-label')) === 'Huỷ ván', 'chưa đi nước nào: nút đầu hàng thành "Huỷ ván"');
  await a.click('#btn-resign');
  await sleep(500);
  ok((await a.textContent('#banner-title')) === 'Ván đã bị huỷ', 'thẻ kết quả: ván đã bị huỷ');
  await send(a, { t: 'rematch' }); await send(b, { t: 'rematch' });
  await sleep(600);
  const r1 = await room(a);
  const [x, o] = r1.seats.x === a.uid ? [a, b] : [b, a];
  await send(x, { t: 'move', x: 0, y: 0 }); await sleep(300);
  await send(o, { t: 'move', x: 3, y: 3 }); await sleep(400);
  ok((await a.textContent('#btn-resign-label')) === 'Đầu hàng', 'đã đi 2 nước: nút trở lại "Đầu hàng"');
  ok(await o.isVisible('[data-gx="tb"]'), 'phòng riêng: có nút xin đi lại');
  await o.click('[data-gx="tb"]');
  await sleep(500);
  ok(await x.isVisible('[data-gx="tb-yes"]'), 'đối thủ thấy lời xin đi lại');
  await shot(x, 'batchd-takeback-430.png');
  await x.click('[data-gx="tb-yes"]');
  await sleep(500);
  ok((await room(a)).moves.length === 1, 'đồng ý: lùi 1 nước');
  await send(a, { t: 'leaveRoom' }); await send(b, { t: 'leaveRoom' });
  await sleep(500);

  // ---------------------------------------------------------------- Phòng công khai có đồng hồ: đếm ngược, +15 giây
  await send(a, { t: 'createRoom', clock: '3+2', public: true });
  await sleep(500);
  await send(b, { t: 'joinRoom', code: (await room(a)).code });
  await sleep(700);
  await closeDialogs(a); await closeDialogs(b);
  const r2 = await room(a);
  const xa = r2.seats.x === a.uid ? a : b;
  ok(/Hãy đi nước đầu trong \d+ giây/.test(await xa.textContent('#invites')), 'người đi trước thấy đếm ngược nước đầu');
  ok(await a.isVisible('[data-gx="more"]') && !(await a.isVisible('[data-gx="tb"]')), 'phòng công khai: có +15 giây, không có đi lại');
  await shot(xa, 'batchd-firstmove-430.png');
  const before = (await room(b)).clocks;
  await a.click('[data-gx="more"]');
  await sleep(500);
  const after = (await room(b)).clocks;
  const bSide = r2.seats.x === b.uid ? 'x' : 'o';
  ok(after[bSide] > before[bSide] + 10000, '+15 giây cho đối thủ');
  await send(a, { t: 'leaveRoom' }); await send(b, { t: 'leaveRoom' });
  await sleep(500);

  // ---------------------------------------------------------------- Ván tính điểm -> hồ sơ có thống kê sâu
  await send(a, { t: 'createRoom' });
  await sleep(500);
  const r3 = await room(a);
  await send(b, { t: 'joinRoom', code: r3.code, password: r3.password });
  await sleep(600);
  await play(a, b);
  await sleep(600);
  const share = (await room(a)).share; // dùng ở phần ảnh xem trước
  await closeDialogs(b);
  await b.evaluate((id) => window.CaroProfile.open(id), a.uid.replace(/^u_/, ''));
  await sleep(800);
  const pf = await b.textContent('#profile-body');
  ok(/Điểm cao nhất/.test(pf) && /Thắng đẹp nhất/.test(pf), 'hồ sơ: điểm cao nhất, thắng đẹp nhất');
  ok(/Hoạt động 30 ngày/.test(pf) && /1 ván/.test(pf), 'hồ sơ: hoạt động 30 ngày');
  await shot(b, 'batchd-profile-430.png');
  await closeDialogs(b);

  // ---------------------------------------------------------------- Quản trị: số liệu máy chủ
  const boss = await user('vi', 'boss', 1200);
  await closeDialogs(boss);
  await boss.evaluate(() => window.CaroTour.page('admin'));
  await sleep(800);
  const adm = await boss.textContent('#tour-dlg');
  ok(/Số liệu máy chủ/.test(adm) && /Kết nối/.test(adm) && /hello/.test(adm), 'quản trị viên thấy số liệu máy chủ');
  await shot(boss, 'batchd-admin-1200.png');

  // ---------------------------------------------------------------- Giải đấu: ván mất kết nối, ban tổ chức huỷ kết quả
  await send(a, { t: 'leaveRoom' }); await send(b, { t: 'leaveRoom' });
  await sleep(400);
  const tourId = await boss.evaluate(() => new Promise((resolve) => {
    window.CaroOnline.on('tourCreated', (m) => resolve(m.id));
    window.CaroOnline.send({ t: 'tourCreate', name: 'Cúp mất mạng', format: 'knockout', startsAt: Date.now() + 600000, timeLimit: 30, bestOf: 1, checkin: false });
  }));
  await send(a, { t: 'tourJoin', id: tourId });
  await send(b, { t: 'tourJoin', id: tourId });
  await sleep(400);
  await send(boss, { t: 'tourStart', id: tourId });
  await sleep(1000);
  ok((await room(b))?.tour?.id === tourId, 'giải bắt đầu: hai người vào ván');
  await b.close(); // b mất kết nối
  await sleep(3500);
  await boss.evaluate((id) => window.CaroTour.open(id), tourId);
  await sleep(800);
  ok(await boss.isVisible('.disputes [data-v="annul"]'), 'ban tổ chức thấy ván mất kết nối và các nút xử lý');
  ok(/dd_binh mất kết nối, thua dd_an/.test(await boss.textContent('.disputes')), 'ghi rõ ai mất kết nối');
  ok(await boss.isVisible('.pill.held'), 'nhánh đấu hiện trận đang chờ ban tổ chức');
  await shot(boss, 'batchd-dispute-1200.png');
  await boss.click('.disputes [data-v="annul"]');
  await sleep(800);
  ok(/Đã huỷ kết quả/.test(await boss.textContent('.disputes')), 'đã huỷ kết quả');

  // ---------------------------------------------------------------- Puzzle Storm + độ khó
  const p = await browser.newContext({ viewport: { width: 430, height: 900 } }).then(async (ctx) => {
    await ctx.addInitScript(() => localStorage.setItem('caro.lang', 'vi'));
    const pg = await ctx.newPage();
    await pg.goto(`http://localhost:${PORT}/`);
    await sleep(500);
    return pg;
  });
  await p.click('#btn-puzzle');
  await sleep(400);
  await p.selectOption('#pz-diff', '300');
  ok(JSON.parse(await p.evaluate(() => localStorage.getItem('caro.puzzles'))).diff === 300, 'chọn độ khó: lưu lại');
  await p.click('[data-storm]');
  await sleep(800);
  const s1 = await p.textContent('#score');
  ok(/⚡ 0/.test(s1) && /[23]:\d\d/.test(s1), 'Storm: hiện số bài + đồng hồ 3 phút — ' + s1);
  ok(!(await p.isVisible('#ext-bar [data-act="hint"]')), 'Storm: không có gợi ý');
  ok(await p.evaluate(() => window.CaroStorm.active && window.CaroStudy.Trainer.active), 'Storm đang chạy');
  await shot(p, 'batchd-storm-430.png');
  await p.click('#ext-bar [data-act="exit"]');
  await sleep(300);
  ok(!(await p.evaluate(() => window.CaroStorm.active)), 'dừng Storm');

  // ---------------------------------------------------------------- Ảnh xem trước link chia sẻ
  const html = await (await fetch(`http://localhost:${PORT}/?replay=${share}`)).text();
  ok(html.includes('og:image') && html.includes(`/api/replay/${share}.png`), 'link chia sẻ có thẻ og:image');
  const img = await fetch(`http://localhost:${PORT}/api/replay/${share}.png`);
  ok(img.status === 200 && img.headers.get('content-type') === 'image/png', 'ảnh PNG xem trước');
  await finish();
})();
