/*
 * Kiểm thử trình duyệt: Quay bàn cờ 90° (menu ☰ – bar-menu.js, board-rotate.js) và xoay màn hình điện thoại.
 *   node caro/tests/e2e/rotate.e2e.js
 *  - Giả lập điện thoại (cảm ứng, 390×844, mật độ điểm ảnh 3); Chromium thêm giảm tốc CPU 4× cho giống máy tầm trung.
 *  - Mỗi lần bấm quay 90° theo chiều kim đồng hồ; bàn đã quay vẫn chạm đúng ô, kéo thì bàn bám theo ngón tay,
 *    phím mũi tên dời theo hướng trên màn hình.
 *  - Hoạt ảnh quay mượt: đo khoảng cách giữa các khung hình trong lúc quay.
 *  - Xoay màn hình dọc ↔ ngang: bàn cờ vẽ lại ngay, phủ đúng màn hình, giữ đúng nước đã đi, các khung sau đó vẫn mượt.
 */
'use strict';
const { setup } = require('./helpers');

const GAME = [[0, 0], [1, 0], [0, 1], [1, 1]];

(async () => {
  const port = 8134;
  const { browser, ok, shot, sleep, finish } = await setup(port);
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: process.env.E2E_BROWSER !== 'firefox', hasTouch: true });
  await ctx.addInitScript((g) => {
    localStorage.setItem('caro.lang', 'vi');
    localStorage.setItem('caro.v1', JSON.stringify({ mode: 'pvp', human: 1, bot: 'mai', moves: g }));
  }, GAME);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const chromium = (process.env.E2E_BROWSER || 'chromium') === 'chromium';
  if (chromium) {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await p.goto(`http://localhost:${port}/`);
  await sleep(800);
  await p.evaluate(() => window.CaroApp.toBoard());
  await sleep(400);
  const scr = (x, y) => p.evaluate(([a, b]) => window.CaroApp.screenOf(a, b), [x, y]);
  const nMoves = () => p.evaluate(() => window.CaroApp.board.moves.length);

  // Ghi khoảng cách giữa các khung hình (ms) trong `ms` mili giây kể từ lúc gọi
  const frames = (ms) => p.evaluate((dur) => new Promise((res) => {
    const out = []; let last = performance.now(); const t0 = last;
    const tick = (t) => { out.push(t - last); last = t; if (t - t0 < dur) requestAnimationFrame(tick); else res(out); };
    requestAnimationFrame(tick);
  }), ms);

  // ---------------------------------------------------------------- Quay 90° qua menu ☰
  const openMenu = async () => {
    await p.evaluate(() => [...document.querySelectorAll('.bar-menu-btn')].find((x) => x.offsetParent).click());
    await sleep(200);
  };
  await openMenu();
  const c0 = await scr(0, 0), c1 = await scr(1, 0);
  const fr = frames(400);
  await p.tap('#bar-menu [data-act="rotate"]');
  const gaps = await fr;
  await sleep(200); // xoay xong (220 ms) mới đổi nấc ánh xạ
  const r90 = await p.evaluate(() => window.CaroApp.getRotation());
  const a0 = await scr(0, 0), a1 = await scr(1, 0);
  // Quay 90° theo chiều kim đồng hồ: ô bên phải (x + 1) giờ nằm ngay bên dưới
  ok(r90 === 90 && Math.abs(a1[0] - a0[0]) < 1 && a1[1] - a0[1] > 10 && c1[0] - c0[0] > 10,
    'bấm Quay bàn cờ: quay 90° theo chiều kim đồng hồ – ' + JSON.stringify({ r90, before: [c0, c1], after: [a0, a1] }));
  const moving = gaps.slice(1);
  const worst = Math.max(...moving);
  console.log('  khung hình khi quay:', moving.map((x) => x.toFixed(0)).join(' '));
  ok(moving.length >= 8 && worst < 50, `hoạt ảnh quay mượt (CPU chậm ${chromium ? '4×' : '1×'}): ${moving.length} khung / 400 ms, khung chậm nhất ${worst.toFixed(1)} ms`);
  await p.keyboard.press('Escape');
  await sleep(150);
  await shot(p, 'rotate-90.png');

  // ---------------------------------------------------------------- Chạm đúng ô khi bàn đã quay
  const before = await nMoves();
  const [tx, ty] = await scr(3, -2);
  await p.tap('#board', { position: { x: tx, y: ty } }).catch(async () => p.touchscreen.tap(tx, ty));
  await sleep(300);
  const lastMv = await p.evaluate(() => { const m = window.CaroApp.board.moves; return m[m.length - 1]; });
  ok((await nMoves()) === before + 1 && lastMv.x === 3 && lastMv.y === -2, 'bàn đã quay: chạm ô nào đánh đúng ô đó – ' + JSON.stringify(lastMv));

  // ---------------------------------------------------------------- Kéo bàn theo ngón tay / phím mũi tên
  const k0 = await scr(0, 0);
  await p.mouse.move(195, 420);
  await p.mouse.down();
  await p.mouse.move(255, 380, { steps: 6 });
  await sleep(120); // dừng tay trước khi thả: không trượt theo quán tính
  await p.mouse.up();
  await sleep(50);
  const k1 = await scr(0, 0);
  ok(Math.abs(k1[0] - k0[0] - 60) < 12 && Math.abs(k1[1] - k0[1] + 40) < 12, 'bàn đã quay: kéo thì bàn bám theo tay – ' + JSON.stringify({ k0, k1 }));
  const m0 = await scr(0, 0);
  await p.keyboard.press('ArrowLeft');
  await sleep(50);
  const m1 = await scr(0, 0);
  ok(m1[0] > m0[0] + 10 && Math.abs(m1[1] - m0[1]) < 1, 'phím ←: nhìn sang trái màn hình (bàn trôi sang phải) dù bàn đã quay – ' + JSON.stringify({ m0, m1 }));

  // ---------------------------------------------------------------- Đủ 4 lần thì về như cũ
  await openMenu();
  for (let k = 0; k < 3; k++) { await p.tap('#bar-menu [data-act="rotate"]'); await sleep(280); }
  ok((await p.evaluate(() => window.CaroApp.getRotation())) === 0, 'bấm thêm 3 lần: về 0°');
  await p.keyboard.press('Escape');
  await sleep(150);

  // ---------------------------------------------------------------- Xoay màn hình điện thoại dọc ↔ ngang
  for (const [w, h, name] of [[844, 390, 'ngang'], [390, 844, 'dọc']]) {
    const n = await nMoves();
    const t0 = Date.now();
    await p.setViewportSize({ width: w, height: h });
    const ms = await p.evaluate(() => new Promise((res) => {
      const t = performance.now();
      const c = document.getElementById('board');
      const check = () => (c.width === Math.round(c.clientWidth * devicePixelRatio) && c.clientWidth === innerWidth ? res(performance.now() - t) : requestAnimationFrame(check));
      check();
    }));
    const wall = Date.now() - t0;
    const lay = await p.evaluate(() => ({ cw: document.getElementById('board').clientWidth, vw: innerWidth, sw: document.documentElement.scrollWidth, bar: (() => { const b = [...document.querySelectorAll('.bar.bottom')].find((x) => x.getClientRects().length && getComputedStyle(x).display !== 'none'); if (!b) return null; const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; })() }));
    const g = await frames(300);
    ok(lay.cw === lay.vw && lay.sw <= lay.vw && lay.bar !== false && (await nMoves()) === n,
      `xoay màn hình sang ${name}: bàn cờ phủ đúng màn hình, thanh công cụ nằm gọn, giữ nguyên ${n} nước – ` + JSON.stringify(lay));
    ok(ms < 100 && Math.max(...g.slice(1)) < 50, `xoay sang ${name}: vẽ lại sau ${ms.toFixed(0)} ms (cả bước đổi khung ${wall} ms), sau đó khung chậm nhất ${Math.max(...g.slice(1)).toFixed(1)} ms`);
    await shot(p, `rotate-screen-${name}.png`);
  }

  ok(!errors.length, 'không có lỗi JS' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
  await finish();
})();
