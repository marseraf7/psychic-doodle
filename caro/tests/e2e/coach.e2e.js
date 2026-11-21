/*
 * Huấn luyện viên (coach.js, coach-ui.js): phân tích một ván có nước bỏ mặc 3 mở → nước bị đánh dấu có đoạn giải thích
 * bằng lời trong bảng phân tích; "Tìm nước tốt hơn" đi chưa đạt thì có gợi ý. Soát giao diện ở 390 px.
 *   node caro/tests/e2e/coach.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers');
const { audit } = require('./ui-audit');

(async () => {
  const PORT = 8123;
  const { browser, ok, shot, finish } = await setup(PORT);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  await ctx.addInitScript(() => localStorage.setItem('caro.lang', 'vi'));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://localhost:${PORT}/`);
  await sleep(600);
  // X có 3 mở (0..2, 0); O bỏ mặc (đánh ở xa) → X thành 4 mở rồi thắng
  const moves = [[0, 0], [5, 5], [1, 0], [5, 7], [2, 0], [-8, -8], [3, 0], [4, 0], [-1, 0]];
  await p.evaluate((mv) => {
    const id = window.CaroLocalHist.store.add({ at: Date.now(), kind: 'pvp', me: 0, x: 'A', o: 'B', winner: 1, reason: 'win', rule: 'free', moves: mv });
    window.CaroLocalHist.openGame(id, true);
  }, moves);
  await p.waitForSelector('#an-moves .an-mv', { timeout: 60000 });
  await p.waitForFunction(() => !document.getElementById('an-refine'), null, { timeout: 90000 }).catch(() => {});
  // Tua qua từng nước, gom các đoạn giải thích
  const found = await p.evaluate(async (n) => {
    const out = [];
    for (let i = 1; i <= n; i++) {
      window.CaroApp.seek(i);
      await new Promise((r) => setTimeout(r, 120));
      const c = document.querySelector('#an-now .an-coach');
      if (c) out.push({ i, text: c.textContent });
    }
    return out;
  }, moves.length);
  const o6 = found.find((f) => f.i === 6);
  ok(!!o6, `nước 6 (O bỏ mặc 3 mở) có lời giải thích (${found.map((f) => f.i).join(',')})`);
  ok(o6 && /Huấn luyện viên: .*(3 mở|chuỗi bốn|VCF|Nước tốt nhất)/.test(o6.text), `nội dung giải thích (${o6 && o6.text})`);
  ok(found.every((f) => !/\{\w+\}|undefined|NaN/.test(f.text)), 'không lộ chuỗi mẫu / undefined');
  await p.evaluate(() => window.CaroApp.seek(6));
  await sleep(200);
  // Soát phần nhận xét nước đang xem (#an-now – nơi có đoạn giải thích). Danh sách nước đi (#an-moves) ở 390 px có sẵn
  // chồng chữ số thứ tự / tên ô từ trước (không thuộc phần này) – thử riêng bằng cách tắt huấn luyện viên rồi soát lại.
  const au = await audit(p, '#an-now'); if (au.length) console.log(JSON.stringify(au));
  ok(au.length === 0, 'soát giao diện phần nhận xét 390 px: 0 lỗi hiển thị');
  const before = await p.evaluate(() => { const ui = window.CaroCoachUI; window.CaroCoachUI = null; window.CaroApp.seek(5); window.CaroApp.seek(6); window.__coach = ui; return true; });
  const listOnly = (await audit(p, '#an-moves')).length;
  await p.evaluate(() => { window.CaroCoachUI = window.__coach; window.CaroApp.seek(5); window.CaroApp.seek(6); });
  ok(before && (await audit(p, '#an-moves')).length === listOnly, `đoạn giải thích không làm thêm lỗi ở danh sách nước đi (${listOnly} chỗ có sẵn)`);
  await shot(p, 'coach-390.png');

  // "Tìm nước tốt hơn" (an-explore.js): đi một nước tệ → thông báo chưa đạt kèm gợi ý của huấn luyện viên (không lộ đáp án)
  await p.evaluate((mv) => {
    const base = mv.slice(0, 5);
    const hint = window.CaroCoachUI.hint(base, 2, 'free');
    window.CaroExplore.start({ base, backTo: 6, rule: 'free', goal: 'better', p: 2, best: [3, 0], hint });
  }, moves);
  await sleep(400);
  await p.evaluate(() => { const ext = window.CaroApp.ext; if (ext && ext.onMove) ext.onMove(30, 30); });
  await p.waitForFunction(() => /Gợi ý:/.test(document.body.textContent), null, { timeout: 20000 }).catch(() => {});
  const txt = await p.evaluate(() => document.body.textContent);
  ok(/Gợi ý: đối thủ đang có 3 mở/.test(txt), 'chưa đạt: có gợi ý của huấn luyện viên');
  await shot(p, 'coach-better-390.png');
  ok(!errors.length, 'không có lỗi JS trang khách' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
  await finish();
})();
