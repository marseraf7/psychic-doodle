/*
 * Kiểm thử trình duyệt: trợ năng (C5) – chơi chỉ bằng bàn phím, chế độ không nhìn bàn, phím tắt, ở ván 2 người chung máy,
 * ván với máy và ván online.
 *   node caro/tests/e2e/a11y.e2e.js
 * Mọi nước đi trong bài này đều gõ bằng bàn phím (mũi tên + Enter, hoặc gõ tên ô ở chế độ không nhìn bàn); chỉ phần dựng
 * ván (bày sẵn quân, ghép trận online) dùng lệnh trong trang.
 */
'use strict';
const { setup } = require('./helpers');
const { audit } = require('./ui-audit');

(async () => {
  const PORT = 8131;
  const { browser, user, ok, sleep, shot, finish } = await setup(PORT);
  const live = (p) => p.evaluate(() => document.getElementById('a11y-live').textContent);
  const moves = (p) => p.evaluate(() => window.CaroApp.board.moves.map((m) => [m.x, m.y, m.p]));
  async function waitLive(p, re, what) {
    for (let i = 0; i < 40; i++) { const t = await live(p); if (re.test(t)) return t; await sleep(100); }
    const t = await live(p);
    ok(false, what + ': "' + t + '"');
    return t;
  }

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { localStorage.setItem('caro.lang', 'vi'); });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://localhost:${PORT}/`);
  await sleep(500);

  // ---- 2 người chung máy: Tab vào bàn cờ, mũi tên + Enter
  await p.evaluate(() => window.CaroApp.startPreset({ mode: 'pvp', moves: [] }));
  await sleep(300);
  await p.focus('#board');
  await waitLive(p, /h8: ô trống/, 'chọn bàn cờ: đọc ô đang chọn');
  ok(await p.evaluate(() => !document.getElementById('a11y-cursor').hidden), 'bàn cờ được chọn: hiện khung viền ô đang chọn');
  await p.keyboard.press('Enter');
  await waitLive(p, /X đánh h8/, 'Enter: X đánh h8 và được đọc ra');
  ok(JSON.stringify(await moves(p)) === '[[0,0,1]]', 'Enter đánh đúng ô h8');
  await p.keyboard.press('ArrowRight');
  await waitLive(p, /i8: ô trống/, 'mũi tên phải: đọc i8');
  await p.keyboard.press('ArrowLeft');
  await waitLive(p, /h8: quân X/, 'quay lại h8: đọc "quân X"');
  await p.keyboard.press('ArrowUp');
  await p.keyboard.press(' ');
  await waitLive(p, /O đánh h9/, 'Space: O đánh h9');
  await p.keyboard.press('Shift+ArrowRight');
  await waitLive(p, /m9: ô trống/, 'Shift + mũi tên: dời 5 ô');
  await shot(p, 'a11y-cursor-390.png');
  ok((await audit(p)).length === 0, 'soát giao diện 390px (bàn cờ + khung viền): 0 lỗi');

  // Phím tắt: ? (bảng phím tắt), Esc, U (đi lại), F (quay bàn), L (nước vừa đi)
  await p.keyboard.press('?');
  await sleep(200);
  ok(await p.evaluate(() => document.getElementById('a11y-help').open), '? mở bảng phím tắt');
  ok((await audit(p, '#a11y-help')).length === 0, 'bảng phím tắt 390px: 0 lỗi hiển thị');
  await p.keyboard.press('Escape');
  await sleep(150);
  ok(await p.evaluate(() => !document.getElementById('a11y-help').open), 'Esc đóng bảng phím tắt');
  await p.focus('#board');
  await p.keyboard.press('l');
  await waitLive(p, /O đánh h9/, 'L: đọc nước vừa đi');
  await p.keyboard.press('u');
  await sleep(300);
  ok((await moves(p)).length === 1, 'U: đi lại một nước');
  const rot0 = await p.evaluate(() => window.CaroApp.getRotation());
  await p.keyboard.press('f');
  await sleep(400);
  ok((await p.evaluate(() => window.CaroApp.getRotation())) === (rot0 + 90) % 360, 'F: quay bàn 90°');
  await p.keyboard.press('f'); await p.keyboard.press('f'); await p.keyboard.press('f');
  await sleep(500);

  // ---- Chọn bàn bằng chuột (kéo) rồi bấm mũi tên: dời bàn như cũ; gõ K trên bàn mới sang chế độ bàn phím
  const h8 = () => p.evaluate(() => window.CaroApp.screenOf(0, 0));
  const cursor = () => p.evaluate(() => window.CaroA11y.cursor());
  const ringOn = () => p.evaluate(() => !document.getElementById('a11y-cursor').hidden);
  const nMv = (await moves(p)).length;
  const bb = await p.locator('#board').boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.mouse.down();
  await p.mouse.move(bb.x + bb.width / 2 + 30, bb.y + bb.height / 2, { steps: 4 });
  await sleep(120); // dừng tay trước khi thả: không trượt theo quán tính
  await p.mouse.up();
  await sleep(100);
  const curA = await cursor();
  const sA = await h8();
  await p.keyboard.press('ArrowRight');
  await sleep(100);
  const sB = await h8();
  ok(await p.evaluate(() => document.activeElement === document.getElementById('board')), 'kéo bàn bằng chuột: bàn cờ được chọn');
  ok(sB[0] < sA[0] - 10 && Math.abs(sB[1] - sA[1]) < 1 && JSON.stringify(await cursor()) === JSON.stringify(curA) && !(await ringOn()),
    'bàn chọn bằng chuột: mũi tên → dời bàn (bàn trôi sang trái; không dời ô đang chọn, không hiện khung viền) – ' + JSON.stringify({ sA, sB }));
  await p.keyboard.press('k');
  await waitLive(p, /: (ô trống|quân [XO])/, 'K: đọc ô đang chọn');
  ok(await ringOn(), 'K: sang chế độ bàn phím, hiện khung viền');
  const curK = await cursor();
  await p.keyboard.press('ArrowLeft');
  await sleep(100);
  const sC = await h8();
  const curL = await cursor();
  ok(curL[0] === curK[0] - 1 && curL[1] === curK[1] && Math.abs(sC[0] - sB[0]) < 1, 'chế độ bàn phím: mũi tên ← dời ô đang chọn sang trái, bàn đứng yên – ' + JSON.stringify({ curK, curL, sB, sC }));
  // Bàn đã quay 90° (theo chiều kim đồng hồ): mũi tên dời ô theo hướng trên màn hình như khi dời bàn
  await p.keyboard.press('f');
  await sleep(400);
  await p.keyboard.press('ArrowRight');
  await sleep(100);
  const curR = await cursor();
  const [ra, rb] = [await p.evaluate((c) => window.CaroApp.screenOf(c[0], c[1]), curL), await p.evaluate((c) => window.CaroApp.screenOf(c[0], c[1]), curR)];
  ok(rb[0] - ra[0] > 10 && Math.abs(rb[1] - ra[1]) < 1, 'bàn đã quay: mũi tên → dời ô đang chọn sang phải màn hình – ' + JSON.stringify({ curL, curR, ra, rb }));
  await p.keyboard.press('f'); await p.keyboard.press('f'); await p.keyboard.press('f');
  await sleep(500);
  ok((await moves(p)).length === nMv && (await p.evaluate(() => window.CaroApp.getRotation())) === rot0, 'dời bàn / ô bằng phím không đánh thêm nước; quay đủ 4 lần về như cũ');

  // ---- Chế độ không nhìn bàn: B, gõ lệnh, đọc nước đe doạ
  await p.evaluate(() => window.CaroApp.startPreset({ mode: 'pvp', rule: 'free', moves: [[0, 0], [0, 3], [1, 0], [1, 3], [2, 0], [2, 3]] }));
  await sleep(300);
  await p.focus('#board');
  await p.keyboard.press('b');
  await sleep(300);
  ok(await p.evaluate(() => document.body.classList.contains('a11y-blind') && getComputedStyle(document.getElementById('board')).visibility === 'hidden'), 'B: bật chế độ không nhìn bàn, bàn cờ ẩn');
  ok(await p.evaluate(() => document.activeElement && document.activeElement.id === 'a11y-cmd'), 'chế độ không nhìn bàn: ô gõ lệnh được chọn sẵn');
  ok((await p.textContent('#a11y-panel .a11y-moves')).includes('6. O j5'), 'danh sách nước đi có đủ các nước đã bày');
  await p.keyboard.type('k8');
  await p.keyboard.press('Enter');
  const said = await waitLive(p, /X đánh k8/, 'gõ "k8": X đánh k8');
  ok(/Đe doạ: X thắng nếu đánh/.test(said), 'sau nước 4 quân: đọc nước đe doạ – ' + said);
  await p.keyboard.type('h9');
  await p.keyboard.press('Enter');
  await waitLive(p, /Chưa đánh được h9|O đánh h9/, 'gõ ô tiếp');
  await p.keyboard.type('xyz');
  await p.keyboard.press('Enter');
  await waitLive(p, /Không hiểu lệnh/, 'lệnh lạ: báo không hiểu');
  await p.keyboard.type('threats');
  await p.keyboard.press('Enter');
  await waitLive(p, /Đe doạ/, 'lệnh "threats": đọc nước đe doạ');
  await shot(p, 'a11y-blind-390.png');
  ok((await audit(p, '#a11y-panel')).length === 0, 'khung không nhìn bàn 390px: 0 lỗi hiển thị');

  // ---- Đánh với máy (vẫn ở chế độ không nhìn bàn): nước của máy được đọc ra
  await p.evaluate(() => window.CaroApp.startPreset({ mode: 'ai', human: 1, bot: 'tit', moves: [] }));
  await sleep(300);
  await p.focus('#a11y-cmd');
  await p.keyboard.type('h8');
  await p.keyboard.press('Enter');
  await waitLive(p, /O đánh/, 'ván với máy: đọc nước của máy');
  ok((await moves(p)).length >= 2, 'máy đã đi sau nước gõ bằng bàn phím');
  // Tắt chế độ không nhìn bàn bằng nút trong khung (Tab tới nút rồi Enter)
  await p.focus('#a11y-panel [data-a11y="off"]');
  await p.keyboard.press('Enter');
  await sleep(300);
  ok(await p.evaluate(() => !document.body.classList.contains('a11y-blind') && document.getElementById('a11y-panel').hidden), 'nút "Tắt chế độ không nhìn bàn": về bàn cờ thường');

  // ---- Cài đặt › Trợ năng: bật "Luôn dùng phím mũi tên", lưu lại
  await p.evaluate(() => window.CaroA11y.open());
  await sleep(200);
  ok((await audit(p, '#a11y-dlg')).length === 0, 'hộp Trợ năng 390px: 0 lỗi hiển thị');
  await p.check('#a11y-dlg input[name=kb]');
  await p.keyboard.press('Escape');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('caro.a11y')).kb === true), 'lưu cài đặt "Luôn dùng phím mũi tên"');
  ok(!errs.length, 'không có lỗi JS (khách): ' + errs.join(' | '));
  await ctx.close();

  // ---- Online: hai tài khoản, người đi trước đánh bằng bàn phím, người kia nghe nước của đối thủ
  const a = await user('vi', 'kb_a');
  const b = await user('vi', 'kb_b');
  await a.evaluate(() => window.CaroOnline.send({ t: 'quickMatch', timeLimit: -1 }));
  await b.evaluate(() => window.CaroOnline.send({ t: 'quickMatch', timeLimit: -1 }));
  let room = null;
  for (let i = 0; i < 40 && !(room && room.players.length === 2); i++) { await sleep(250); room = await a.evaluate(() => window.CaroOnline.state.room); }
  const first = room.actor === a.uid ? a : b;
  const second = first === a ? b : a;
  for (const q of [first, second]) { await q.evaluate(() => window.CaroApp.toBoard()); await sleep(200); }
  await second.focus('#board'); // người kia cũng dùng bàn phím (K: đọc ô đang chọn) → được đọc nước đối thủ
  await second.keyboard.press('k');
  await first.focus('#board');
  await first.keyboard.press('Enter');
  await waitLive(second, /X đánh h8/, 'online: người kia nghe "X đánh h8"');
  await second.keyboard.press('ArrowDown');
  await second.keyboard.press('Enter');
  await waitLive(first, /O đánh h7/, 'online: người đi trước nghe nước của đối thủ (O đánh h7)');
  ok((await first.evaluate(() => window.CaroOnline.state.room.moves.length)) === 2, 'máy chủ nhận đủ hai nước gõ bằng bàn phím');

  await finish();
})();
