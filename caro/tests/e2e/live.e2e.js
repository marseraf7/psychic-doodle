/*
 * Kiểm thử trình duyệt: phân tích ngầm lúc chơi (live-analysis.js) và phân tích hai lượt (study.js).
 *   node caro/tests/e2e/live.e2e.js
 */
'use strict';
const { setup } = require('./helpers');

// X xếp 4 quân hàng 0; O bỏ mặc thế ba mở, X thắng ở nước 7.
const GAME = [[0, 0], [0, 5], [1, 0], [1, 5], [2, 0], [5, 5], [3, 0]];
// Ván dài chưa phân tích ngầm: các quân cách nhau 3 ô, không ai thắng
const LONG = Array.from({ length: 36 }, (_, i) => [(i % 6) * 3, Math.floor(i / 6) * 3]);

(async () => {
  const { browser, ok, shot, sleep, finish } = await setup(8098);
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 430, height: 860 } });
  // Kiểm luồng phân tích bằng engine của game (iOS / máy không có WebAssembly SIMD); phân tích bằng Rapfi /
  // Rapfi-CARO kiểm ở boat-rapfi.e2e.js
  await ctx.addInitScript(() => { window.CARO_NO_RAPFI = true; });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', 1); localStorage.clear(); localStorage.setItem('caro.lang', 'vi'); } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.goto('http://localhost:8098/');
  await sleep(500);

  // ---------------------------------------------------------------- Phân tích ngầm trong lúc chơi
  ok(await p.evaluate(() => window.CaroLive.on), 'phân tích ngầm bật sẵn');
  await p.evaluate((moves) => window.CaroApp.startPreset({ mode: 'pvp', moves }), GAME);
  for (let k = 0; k < 40 && (await p.evaluate(() => window.CaroLive.done)) < GAME.length; k++) await sleep(150);
  ok((await p.evaluate(() => window.CaroLive.done)) === GAME.length, 'đã chấm sẵn mọi thế của ván (trừ thế sau nước thắng)');
  for (let k = 0; k < 40 && (await p.evaluate(() => window.CaroLive.alts)) < 1; k++) await sleep(150);
  ok((await p.evaluate(() => window.CaroLive.alts)) >= 1, 'nước sai cũng được chấm sẵn thế sau nước tốt nhất (hết ván xếp loại ngay)');
  const t0 = Date.now();
  await p.click('#btn-analyze');
  await p.waitForSelector('#an-body .an-players', { timeout: 5000 });
  const ms = Date.now() - t0;
  ok(ms < 1500, `hết ván bấm Phân tích là có ngay (${ms} ms)`);
  ok(!(await p.$('#an-refine')), 'không cần lượt tinh chỉnh');
  ok((await p.$$eval('#an-moves .an-mv b', (els) => els.map((e) => e.textContent))).includes('??'), 'vẫn chỉ ra sai lầm nặng của O');
  await shot(p, 'live-analysis-430.png');
  await p.click('#rp-close');
  await sleep(300);

  // ---------------------------------------------------------------- Ván chưa phân tích ngầm: lượt nhanh rồi lượt kỹ
  await p.evaluate((moves) => { window.CaroApp.openReplay({ local: true, x: 'A', o: 'B', winner: 0, reason: 'draw', moves, rule: 'vn' }); window.CaroStudy.analyze(); }, LONG);
  await p.waitForSelector('#an-refine', { timeout: 8000 });
  ok(true, 'lượt nhanh hiện kết quả trước, kèm dòng "đang phân tích kỹ hơn"');
  ok((await p.$$('#an-moves .an-mv[data-i]')).length === LONG.length, 'lượt nhanh đã có đủ danh sách nước đi');
  await p.waitForSelector('#an-refine', { state: 'detached', timeout: 30000 });
  ok((await p.$$('#an-moves .an-mv[data-i]')).length === LONG.length, 'lượt kỹ xong: thay kết quả, bỏ dòng tinh chỉnh');
  await p.click('#rp-close');
  await sleep(200);

  // ---------------------------------------------------------------- Mở phân tích ván khác khi ván trước đang chạy
  const LONG2 = LONG.map(([x, y]) => [y + 1, x]);
  await p.evaluate((moves) => { window.CaroApp.openReplay({ local: true, x: 'A', o: 'B', winner: 0, reason: 'draw', moves, rule: 'vn' }); window.CaroStudy.analyze(); }, LONG.map(([x, y]) => [x + 40, y]));
  await sleep(400);
  await p.evaluate((moves) => { window.CaroApp.openReplay({ local: true, x: 'C', o: 'D', winner: 0, reason: 'draw', moves, rule: 'vn' }); window.CaroStudy.analyze(); }, LONG2);
  await p.waitForSelector('#an-moves', { timeout: 15000 });
  const first = await p.$eval('#an-moves .an-mv[data-i="1"]', (e) => e.textContent).catch(() => '');
  const want = await p.evaluate(([x, y]) => window.CaroApp.cellName(x, y), LONG2[0]);
  ok(first.startsWith(want), `ván thứ hai: bảng hiện đúng nước của ván đó (${first} ~ ${want}), không lẫn ván trước`);
  await p.waitForSelector('#an-refine', { state: 'detached', timeout: 30000 });
  ok((await p.$$('#an-moves .an-mv[data-i]')).length === LONG2.length, 'ván thứ hai phân tích xong, không phải chờ ván trước');
  await p.click('#rp-close');
  await sleep(200);

  // ---------------------------------------------------------------- Đi lại / rẽ nhánh liên tục trong lúc đang chấm
  const storm = await p.evaluate(async () => {
    const L = window.CaroLive;
    let s = 11;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const moves = [];
    const used = new Set();
    for (let step = 0; step < 300; step++) {
      if (moves.length > 2 && rnd() < 0.45) { const m = moves.pop(); used.delete(m.x + ',' + m.y); } // đi lại
      else {
        let x, y;
        do { x = Math.floor(rnd() * 13) - 6; y = Math.floor(rnd() * 13) - 6; } while (used.has(x + ',' + y));
        used.add(x + ',' + y);
        moves.push({ x, y, p: moves.length % 2 ? 2 : 1 });
      }
      L.sync({ moves: moves.slice(), rule: 'vn' }, {});
      await new Promise((r) => setTimeout(r, rnd() * 120)); // lúc nhanh lúc chậm, xen giữa các lần chấm
      if (!L.consistent()) return { ok: false, step };
    }
    await new Promise((r) => setTimeout(r, 4000));
    const ev = L.evalsFor(moves.map((m) => [m.x, m.y]), 'vn');
    return { ok: L.consistent(), n: moves.length, have: ev ? ev.filter(Boolean).length : 0 };
  });
  ok(storm.ok, `300 lần đánh / đi lại / rẽ nhánh xen lúc đang chấm: không thế nào bị gắn nhầm kết quả (${JSON.stringify(storm)})`);
  ok(storm.have > 0, 'sau khi dừng: các thế của ván cuối vẫn được chấm và dùng được');

  // ---------------------------------------------------------------- Chơi với máy: máy nghĩ xong mới chấm tiếp
  await p.evaluate(() => window.CaroApp.startPreset({ mode: 'ai', human: 1, moves: [[7, 7]] }));
  for (let k = 0; k < 60 && (await p.evaluate(() => window.CaroApp.board.moves.length)) < 2; k++) await sleep(100);
  ok((await p.evaluate(() => window.CaroApp.board.moves.length)) === 2, 'máy vẫn đi bình thường khi phân tích ngầm bật');
  for (let k = 0; k < 40 && (await p.evaluate(() => window.CaroLive.done)) < 3; k++) await sleep(150);
  ok((await p.evaluate(() => window.CaroLive.done)) === 3, 'ván với máy: đã chấm cả 3 thế (trước nước 1, 2 và thế hiện tại)');

  // ---------------------------------------------------------------- Tắt trong Cài đặt
  await p.evaluate(() => document.getElementById('btn-settings').click()); // như bấm Xem thêm › Cài đặt
  await sleep(200);
  await p.click('#settings-form [data-go="board"]');
  await sleep(150);
  ok(await p.isChecked('#settings-form [name=liveAn]'), 'Cài đặt bàn cờ: công tắc phân tích ngầm đang bật');
  await p.click('#settings-form label:has([name=liveAn])');
  ok(!(await p.evaluate(() => window.CaroLive.on)) && (await p.evaluate(() => localStorage.getItem('caro.liveAn'))) === '0', 'tắt được và nhớ lựa chọn');

  ok(!errors.length, 'không có lỗi JS trên trang' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
  await finish();
})().catch((e) => { console.error(e); process.exit(1); });
