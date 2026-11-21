/*
 * Hạng đấu tuần (league.js): hai tài khoản đấu một ván online tính điểm (ghép nhanh, ≥ 10 nước) → cả hai vào nhóm tuần này,
 * người thắng 4 điểm; trang Hạng đấu tuần hiện bậc, nhóm, vùng lên / xuống bậc; chốt tuần → thông báo + huy hiệu ở hồ sơ.
 * Soát giao diện ở 390 px.
 *   node caro/tests/e2e/league.e2e.js
 */
'use strict';
const { setup, sleep, play } = require('./helpers');
const { audit } = require('./ui-audit');

(async () => {
  const PORT = 8122;
  const { app, user, ok, shot, finish } = await setup(PORT, { FIRST_MOVE_MS: 5000 });
  const a = await user('vi', 'lg_ann', 390);
  const b = await user('vi', 'lg_ben', 390);
  const quick = (p) => p.evaluate(() => window.CaroOnline.send({ t: 'quickMatch', timeLimit: -1 }));
  await quick(a); await quick(b);
  await sleep(1200);
  // Hai bên đánh rải rác vài nước trước (ván ≥ 10 nước mới có điểm), rồi một bên xếp 5 quân
  const r0 = await a.evaluate(() => window.CaroOnline.state.room);
  ok(!!r0 && r0.players.length === 2, 'ghép nhanh xong');
  const xIsA = r0.seats.x === a.uid;
  const [px, po] = xIsA ? [a, b] : [b, a];
  const send = (p, m) => p.evaluate((x) => window.CaroOnline.send(x), m);
  for (let i = 0; i < 3; i++) {
    await send(px, { t: 'move', x: 20 + i * 3, y: 20 }); await sleep(200);
    await send(po, { t: 'move', x: -20 - i * 3, y: -20 }); await sleep(200);
  }
  await play(px, po);
  await sleep(800);
  const r1 = await a.evaluate(() => window.CaroOnline.state.room);
  ok(!!(r1 && r1.winner), 'ván kết thúc');

  await px.evaluate(() => window.CaroLeague.open());
  await px.waitForSelector('#league-dlg[open] .feat-list li', { timeout: 5000 });
  const info = await px.evaluate(() => ({
    rows: [...document.querySelectorAll('#league-dlg .feat-list li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
    head: document.querySelector('#league-dlg .lg-head').textContent,
  }));
  ok(info.rows.length === 2, `nhóm tuần này có 2 người (${info.rows.length})`);
  ok(/Đồng/.test(info.head) && /Tuần \d{4}-W\d{2}/.test(info.head), 'hiện bậc Đồng + tuần ISO');
  ok(/ 4$/.test(info.rows[0]), `người thắng đứng đầu với 4 điểm (${info.rows[0]})`);
  ok((await audit(px, '#league-dlg')).length === 0, 'soát giao diện 390 px: 0 lỗi hiển thị');
  await shot(px, 'league-390.png');

  // ---------------------------------------------------------------- Chốt tuần (giả sang tuần sau)
  const toasts = px.evaluate(() => new Promise((res) => {
    const box = document.getElementById('toasts');
    new MutationObserver(() => { if (/Hạng đấu tuần/.test(box.textContent)) res(box.textContent); }).observe(box, { childList: true, subtree: true });
    setTimeout(() => res(''), 4000);
  }));
  await sleep(300);
  app.hub.leagueTick(Date.now() + 8 * 86400000);
  const t = await toasts;
  ok(/Hạng đấu tuần: bạn xếp thứ 1/.test(t), 'thông báo kết quả tuần');
  const uid = await px.evaluate(() => window.CaroOnline.state.me.uid);
  await po.evaluate((id) => window.CaroProfile.open(id), uid);
  await po.waitForSelector('#profile-body .pf-league', { timeout: 5000 });
  const badge = await po.evaluate(() => document.querySelector('#profile-body .pf-league').textContent);
  ok(/Đồng|Bạc/.test(badge), `huy hiệu bậc ở hồ sơ (${badge})`);
  await finish();
})();
