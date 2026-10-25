/*
 * Kiểm thử trình duyệt: phân tích sau ván – phần thêm (an-graph.js, an-explore.js, an-banner.js).
 *   node caro/tests/e2e/analysis-plus.e2e.js
 *  - Thời điểm quan trọng: có nút cho nước lật cán cân (nước 6 – sai lầm nặng), bấm là tới.
 *  - Kéo trên biểu đồ để tua: bàn cờ chạy theo, nhãn nổi hiện số nước.
 *  - Dòng máy gợi ý: lùi về thế trước nước, hiện quân mờ đánh số + tên ô; "Đi thử từ đây" vào chế độ đi thử.
 *  - Đi thử: chạm ô trống khi đang xem lại → đi thử từ thế đang xem; máy chấm (khả năng thắng); Đi nước gợi ý, Lùi,
 *    Quay về ván đúng nước cũ.
 *  - Tìm nước tốt hơn: nước kém → "Chưa tốt hơn"; nước của máy → "Tốt!".
 *  - Thẻ kết quả ván với máy: dòng "Phân tích nhanh" (độ chính xác, số nước sai), bấm mở bảng phân tích.
 */
'use strict';
const { setup } = require('./helpers');

// X xếp 4 quân hàng 0; O bỏ mặc thế ba mở (nước 6 là sai lầm nặng), X thắng ở nước 7.
const GAME = [[0, 0], [0, 5], [1, 0], [1, 5], [2, 0], [5, 5], [3, 0]];

(async () => {
  const port = 8133;
  const { browser, ok, shot, sleep, finish } = await setup(port);
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(() => { window.CARO_NO_RAPFI = true; }); // phân tích bằng engine của game (như study.e2e.js)
  await ctx.addInitScript((g) => {
    localStorage.setItem('caro.lang', 'vi');
    localStorage.setItem('caro.v1', JSON.stringify({ mode: 'pvp', human: 1, bot: 'mai', moves: g }));
  }, GAME);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.goto(`http://localhost:${port}/`);
  await sleep(800);
  await p.evaluate(() => window.CaroApp.toBoard());
  await p.click('#banner-analyze');
  await p.waitForSelector('.an-acc', { timeout: 15000 });
  await p.waitForFunction(() => !document.getElementById('an-refine'), null, { timeout: 30000 });
  const n = () => p.evaluate(() => window.CaroApp.board.moves.length);

  // ---------------------------------------------------------------- Thời điểm quan trọng
  const kms = await p.$$eval('.an-km', (els) => els.map((e) => ({ i: +e.dataset.i, t: e.textContent.replace(/\s+/g, ' ').trim() })));
  ok(kms.length >= 1 && kms.length <= 3 && kms.some((k) => k.i === 6), 'thời điểm quan trọng: có nước 6 – ' + JSON.stringify(kms));
  await p.click('.an-km[data-i="6"]');
  await sleep(200);
  ok((await n()) === 6, 'bấm thời điểm quan trọng: tới nước 6');

  // ---------------------------------------------------------------- Kéo trên biểu đồ
  const g = await p.$eval('.an-graph', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await p.mouse.move(g.x + 2, g.y + g.h / 2);
  await p.mouse.down();
  await sleep(100);
  const atStart = await n();
  await p.mouse.move(g.x + g.w * 0.45, g.y + g.h / 2, { steps: 6 });
  await sleep(100);
  const mid = await n();
  const tip = await p.evaluate(() => { const t = document.getElementById('an-tip'); return t && !t.hidden ? t.textContent : ''; });
  await p.mouse.up();
  ok(atStart === 0 && mid >= 2 && mid <= 4 && /Nước \d+ · X \d+%/.test(tip), `kéo trên biểu đồ: tua theo (0 → ${mid}), nhãn "${tip}"`);
  await shot(p, 'analysis-plus-graph.png');

  // ---------------------------------------------------------------- Dòng máy gợi ý
  await p.click('.an-mv[data-i="6"]');
  await sleep(200);
  await p.click('#an-now [data-pv]');
  await p.waitForFunction(() => /Dòng máy:/.test((document.querySelector('.an-pv') || {}).textContent || ''), null, { timeout: 15000 });
  const pv = await p.evaluate(() => ({ n: window.CaroApp.board.moves.length, marks: (window.CaroApp.marks || []).filter((m) => /^\d$/.test(m.text || '')).map((m) => m.text), txt: document.querySelector('.an-pv').textContent.replace(/\s+/g, ' ').trim() }));
  ok(pv.n === 5 && pv.marks.length >= 1 && pv.marks[0] === '1', 'dòng máy gợi ý: lùi về thế trước nước 6, quân mờ đánh số – ' + JSON.stringify(pv));
  await shot(p, 'analysis-plus-pv.png');
  await p.click('.an-pv [data-pvtry]');
  await sleep(400);
  ok(await p.evaluate(() => document.body.classList.contains('ext') && window.CaroExplore.active), '"Đi thử từ đây": vào chế độ đi thử');
  await p.click('#ext-bar [data-ex="exit"]');
  await sleep(400);

  // ---------------------------------------------------------------- Đi thử bằng cách chạm bàn
  await p.click('.an-mv[data-i="4"]');
  await sleep(200);
  ok(/Chạm một ô trống/.test(await p.textContent('#an-now')), 'bảng phân tích nhắc: chạm ô trống để đi thử');
  const [sx, sy] = await p.evaluate(() => window.CaroApp.screenOf(6, 3));
  await p.mouse.click(sx, sy);
  await sleep(300);
  const ex = await p.evaluate(() => ({ ext: document.body.classList.contains('ext'), active: window.CaroExplore.active, n: window.CaroApp.board.moves.length, bar: [...document.querySelectorAll('#ext-bar [data-ex]')].map((b) => b.dataset.ex) }));
  ok(ex.ext && ex.active && ex.n === 5 && ex.bar.join() === 'undo,best,exit', 'chạm ô trống khi xem lại: đi thử nước đó từ thế đang xem – ' + JSON.stringify(ex));
  await p.waitForFunction(() => /X \d+% · O \d+%|thắng chắc/.test(document.getElementById('turn').textContent), null, { timeout: 10000 });
  ok(true, 'máy chấm thế đi thử: ' + (await p.textContent('#turn')).replace(/\s+/g, ' ').trim());
  await shot(p, 'analysis-plus-explore.png');
  await p.click('#ext-bar [data-ex="best"]');
  await sleep(300);
  ok((await n()) === 6, 'Đi nước gợi ý: thêm một nước');
  await p.click('#ext-bar [data-ex="undo"]');
  await sleep(200);
  await p.click('#ext-bar [data-ex="undo"]');
  await sleep(200);
  ok((await n()) === 4 && (await p.$eval('#ext-bar [data-ex="undo"]', (b) => b.disabled)), 'Lùi: về đúng thế bắt đầu đi thử, không lùi quá');
  await p.click('#ext-bar [data-ex="exit"]');
  await sleep(400);
  const back = await p.evaluate(() => ({ ext: document.body.classList.contains('ext'), n: window.CaroApp.board.moves.length, panel: !document.getElementById('an-panel').hidden, cur: !!document.querySelector('.an-mv.cur[data-i="4"]') }));
  ok(!back.ext && back.n === 4 && back.panel && back.cur, 'Quay về ván: xem lại đúng nước 4, bảng phân tích còn – ' + JSON.stringify(back));

  // ---------------------------------------------------------------- Tìm nước tốt hơn (nước 2 của O: sai lầm chấm theo khả năng thắng)
  await p.click('.an-mv[data-i="2"]');
  await sleep(200);
  ok(await p.isVisible('#an-now [data-better]'), 'nước 2 (sai lầm theo khả năng thắng): có nút Tìm nước tốt hơn');
  await p.click('#an-now [data-better]');
  await sleep(300);
  ok(/Tìm nước tốt hơn/.test(await p.textContent('#turn')), 'Tìm nước tốt hơn: hiện yêu cầu');
  await p.evaluate(() => window.CaroApp.ext.onMove(12, -9)); // nước ở rất xa, không liên quan
  await p.waitForFunction(() => /Chưa tốt hơn|khó cứu|Tốt!/.test(document.getElementById('turn').textContent), null, { timeout: 15000 });
  const far = (await p.textContent('#turn')).trim();
  ok(/Chưa tốt hơn/.test(far) && await p.isVisible('#ext-bar [data-ex="again"]'), 'nước kém: "Chưa tốt hơn" + nút Thử lại – ' + far);
  await p.click('#ext-bar [data-ex="again"]');
  await p.waitForFunction(() => !document.querySelector('#ext-bar [data-ex="best"]').disabled, null, { timeout: 15000 });
  await p.click('#ext-bar [data-ex="best"]'); // đi đúng nước gợi ý của máy
  await p.waitForFunction(() => /Tốt!/.test(document.getElementById('turn').textContent), null, { timeout: 15000 });
  ok(true, 'đi nước gợi ý của máy: ' + (await p.textContent('#turn')).trim());
  await shot(p, 'analysis-plus-better.png');
  await p.click('#ext-bar [data-ex="exit"]');
  await sleep(300);
  ok((await n()) === 2, 'Quay về ván: đúng nước 2');
  await p.evaluate(() => document.getElementById('rp-close').click()); // màn rộng: thanh xem lại nhường chỗ cho bảng phân tích
  await sleep(300);

  // ---------------------------------------------------------------- Thẻ kết quả ván với máy: Phân tích nhanh
  await p.evaluate((g) => {
    window.CaroApp.showBanner && window.CaroApp.showBanner();
    document.getElementById('banner').hidden = false;
    window.dispatchEvent(new CustomEvent('caro:gameover', { detail: { mode: 'ai', won: false, bot: 'mai', record: { at: Date.now(), kind: 'bot', bot: 'mai', me: 2, x: '', o: '', winner: 1, reason: 'win', rule: 'vn', timeLimit: 0, clock: null, moves: g } } }));
  }, GAME);
  await p.waitForFunction(() => !document.getElementById('banner-an').hidden, null, { timeout: 20000 });
  const bn = await p.textContent('#banner-an');
  ok(/Phân tích nhanh: độ chính xác \d+%/.test(bn) && /sai lầm nặng/.test(bn), 'thẻ kết quả: dòng Phân tích nhanh – ' + bn);
  await shot(p, 'analysis-plus-banner.png');
  await p.click('#banner-an');
  await p.waitForSelector('.an-acc', { timeout: 15000 });
  ok(await p.evaluate(() => !document.getElementById('an-panel').hidden), 'bấm dòng Phân tích nhanh: mở bảng phân tích');

  ok(!errors.length, 'không có lỗi JS' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
  await finish();
})();
