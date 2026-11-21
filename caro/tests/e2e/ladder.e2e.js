/*
 * Thang nhân vật máy (bot-ladder.js): mở từ tab Xem thêm → 31 bậc, thắng một ván với máy → lên bậc + đồng bộ tài khoản
 * (cùng đường tiến độ A5: progress-sync.js → progressSync),
 * "Thử thách tiếp" mở ván mới với nhân vật kế tiếp; thiết bị khác của cùng tài khoản nhận tiến độ. Soát giao diện 390 px.
 *   node caro/tests/e2e/ladder.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers');
const { audit } = require('./ui-audit');

(async () => {
  const PORT = 8124;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const p = await user('vi', 'lad_user', 390);
  await p.click('#tabbar [data-tab="more"]');
  await sleep(300);
  await p.click('#more-ladder');
  await p.waitForSelector('#ladder-dlg[open] .lad-list li', { timeout: 5000 });
  ok((await p.$$('#ladder-dlg .lad-list li')).length === 31, 'thang có 31 bậc');
  ok((await audit(p, '#ladder-dlg')).length === 0, 'soát giao diện 390 px: 0 lỗi hiển thị');
  await shot(p, 'ladder-390.png');

  // Thắng nhân vật bậc 1 (giả sự kiện hết ván của app-ai.js)
  const first = await p.evaluate(() => window.CaroBotLadder.ids[0]);
  await p.evaluate((bot) => window.dispatchEvent(new CustomEvent('caro:gameover', { detail: { mode: 'ai', won: true, bot, record: { rule: 'vn' } } })), first);
  await sleep(1500);
  const txt = await p.evaluate(() => document.getElementById('ladder-dlg-body').textContent);
  ok(/Đã thắng tới bậc 1\/31/.test(txt), 'thắng bậc 1: tiến độ 1/31');
  // Đồng bộ cùng tiến độ A5 (progress-sync.js gom ~4 giây rồi gửi progressSync) → user_progress.ladder
  const uid = app.store.byUsername.get('lad_user').id;
  let lad = null;
  for (let i = 0; i < 40 && !(lad && lad.r.vn === 1); i++) { await sleep(250); lad = (app.store.progressGet(uid) || {}).ladder; }
  ok(lad && lad.r && lad.r.vn === 1, 'đã đồng bộ lên tài khoản (tiến độ chung user_progress)');

  // Thử thách tiếp → ván mới với nhân vật bậc 2
  const second = await p.evaluate(() => window.CaroBotLadder.ids[1]);
  await p.click('#ladder-dlg-body .lad-sum + .row [data-lgo], #ladder-dlg-body > .row [data-lgo]');
  await sleep(600);
  const local = await p.evaluate(() => window.CaroApp.local);
  ok(local.mode === 'ai' && local.bot === second && local.moves === 0, `"Thử thách tiếp" mở ván với ${second}`);

  // Thiết bị khác cùng tài khoản: đăng nhập → nhận tiến độ
  const ctx = await p.context().browser().newContext({ viewport: { width: 390, height: 860 } });
  const q = await ctx.newPage();
  await q.goto(`http://localhost:${PORT}/`);
  await sleep(500);
  await q.click('#tabbar [data-tab="more"]');
  await sleep(300);
  await q.click('#go-login').catch(() => {});
  await sleep(200);
  await q.fill('#auth-form input[name=username]', 'lad_user');
  await q.fill('#auth-form input[name=password]', 'caro-pass1');
  await q.click('#auth-submit');
  await q.waitForFunction(() => window.CaroBotLadder.state.r.vn === 1, null, { timeout: 8000 }).catch(() => {});
  ok(await q.evaluate(() => window.CaroBotLadder.state.r.vn === 1), 'thiết bị khác nhận tiến độ sau khi đăng nhập');
  await ctx.close();
  await finish();
})();
