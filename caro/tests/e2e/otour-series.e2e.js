/*
 * Kiểm thử trình duyệt – loạt Bo ở loại trực tiếp với kiểu tỉ số (bóng đá, vd. vòng 1 playoff MLS Bo3): khung nhập
 * mỗi dòng một trận + ô luân lưu; trận hoà thiếu luân lưu thì báo lỗi; lưu xong hiện tỉ số từng trận kèm luân lưu.
 *   node caro/tests/e2e/otour-series.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8834;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_bo3', 1100);
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.fill('#otf input[name=name]', 'Cúp Bo3');
  await boss.selectOption('#otf select[name=sport]', 'football'); await sleep(200);
  await boss.selectOption('#otf select[name=preset]', 'single'); await sleep(200);
  await boss.selectOption('#otf-stages [data-k="bestOf"]', '3'); await sleep(200);
  await boss.fill('#otf textarea[name=teams]', 'FC Một\nFC Hai');
  await boss.click('#otf button.primary.wide'); await sleep(800);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  ok(t && t.result === 'score' && t.stages[0].bestOf === 3, 'Tạo giải bóng đá, loại trực tiếp Bo3');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1200);
  await boss.click('[data-act="otTab"][data-tab="stages"]').catch(() => {}); await sleep(300);
  const m = Object.values(t.st[0].matches)[0];
  await boss.click(`.scorable[data-mid="${m.id}"]`); await sleep(300);
  ok(/Bo3 · mỗi dòng là tỉ số một trận/.test(await boss.textContent('.score-panel')) && await boss.isVisible('#ots-sets [data-pen="0"]'), 'Khung nhập loạt trận có ô luân lưu');
  // Trận 1 hoà 1–1 chưa nhập luân lưu → lỗi
  const fill = async (sel, v) => { await boss.fill(sel, v); };
  await fill('#ots-sets [data-set="0"][data-side="0"]', '1');
  await fill('#ots-sets [data-set="0"][data-side="1"]', '1');
  await boss.click('[data-act="otSetAdd"]'); await sleep(200);
  await fill('#ots-sets [data-set="1"][data-side="0"]', '2');
  await fill('#ots-sets [data-set="1"][data-side="1"]', '0');
  await boss.click('#ots button.primary'); await sleep(600);
  ok(/luân lưu/i.test(await boss.textContent('#ots-err')) && !m.done, 'Trận hoà thiếu luân lưu: báo lỗi');
  await fill('#ots-sets [data-pen="0"][data-side="0"]', '4');
  await fill('#ots-sets [data-pen="0"][data-side="1"]', '3');
  await boss.click('#ots button.primary'); await sleep(800);
  ok(m.done && m.winner === m.a && m.pens && m.pens[0][0] === 4, 'Lưu loạt: đội trên thắng 2–0 (trận 1 thắng luân lưu)');
  ok(/1-1 \(4-3\) · 2-0/.test(await boss.textContent(`.b-match[data-mid="${m.id}"]`)), 'Nhánh hiện tỉ số từng trận kèm luân lưu');
  await shot(boss, 'ot-series.png');
  await finish();
})();
