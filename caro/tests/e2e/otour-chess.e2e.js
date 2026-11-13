/*
 * Kiểm thử trình duyệt – đợt 22 (chỉ mô phỏng thể thức):
 *   1. Mẫu FIDE World Cup: ô thang ván = kiểu FIDE; mô tả bằng lời.
 *   2. Mẫu Norway Chess: nhập ván tiêu chuẩn hoà + Armageddon hoà cờ → Đen (ô dưới) thắng, 1,5 điểm.
 *   3. Mẫu OWL: đủ 4 map + map 5 quyết định + playoff từng chặng; mô tả.
 *   4. Mẫu darts / Davis Cup: mô tả luật set đua tới 3 leg và rubber.
 *   node caro/tests/e2e/otour-chess.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');
const ST = require('../../../server/src/hub/stages.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8848;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_chess', 1100);
  const S = (i, k) => `#otf-stages [data-i="${i}"][data-k="${k}"]`;
  const desc = () => boss.textContent('#otf-desc');
  const tpl = async (id) => { await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300); await boss.click(`.tpl-card[data-id="${id}"]`); await sleep(500); };

  // ---------- 1. FIDE World Cup
  await tpl('fide_world_cup');
  ok(await boss.inputValue(S(0, 'ladPreset')) === 'fide', 'Thang ván kiểu FIDE World Cup');
  ok(/thang ván: 2 ván Tiêu chuẩn → 2 ván Rapid/.test(await desc()) && /Armageddon/.test(await desc()), 'Mô tả thang ván');

  // ---------- 2. Norway Chess: nhập thang ván
  await tpl('norway_chess');
  ok(await boss.inputValue(S(0, 'ladPreset')) === 'norway', 'Thang ván kiểu Norway Chess');
  await boss.click('[data-act="otTplTeams"]'); await sleep(400);
  await boss.click('#otf button.primary.wide'); await sleep(1200);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1500);
  const t = app.hub.otGet(id), st = t.st[0], m = ST.playable(st)[0];
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(700);
  await boss.click(`[data-mid="${m.id}"]`); await sleep(500);
  ok((await boss.$$('#ots select[data-lv]')).length === 2 && /Hoà \(Đen thắng\)/.test(await boss.textContent('#ots')), 'Khung nhập: 2 cấp, Armageddon ghi hoà là Đen thắng');
  await boss.selectOption('#ots select[data-lv="0"]', '0');
  await boss.selectOption('#ots select[data-lv="1"]', '0');
  await boss.click('#ots button.primary'); await sleep(1000);
  const S0 = ST.standings(st, app.hub.otSeedOf(t))[0].stats;
  ok(m.done && m.winner === m.b && S0[m.b].pts === 1.5 && S0[m.a].pts === 1, 'Hoà + Armageddon hoà cờ: Đen (ô dưới) 1,5, Trắng 1');
  await shot(boss, 'ot-chess-norway.png');

  // ---------- 3. OWL
  await tpl('owl_season');
  ok(await boss.isChecked(S(0, 'fixedOn')) && await boss.isChecked(S(0, 'deciderOn')) && await boss.isChecked(S(0, 'splitsOn')) && await boss.inputValue(S(0, 'spTake')) === '3', 'OWL: đủ 4 map, map 5 quyết định, playoff từng chặng 3 đội');
  ok(/luôn đấu đủ 4 ván, hoà thì đấu thêm một ván quyết định/.test(await desc()) && /chia 4 chặng, mỗi chặng 3 đội đầu đấu playoff Bo5/.test(await desc()), 'Mô tả OWL');

  // ---------- 4. Darts, Davis Cup
  await tpl('pdc_worlds');
  ok(/mỗi set đua tới 3 leg/.test(await desc()) && /set quyết định phải hơn 2 leg, 5–5 thì đấu một leg quyết định/.test(await desc()), 'Mô tả darts');
  await tpl('davis_finals');
  ok(/mỗi trận gồm các rubber Bo3/.test(await desc()), 'Mô tả Davis Cup');
  await finish();
})();
