/*
 * Kiểm thử trình duyệt – thư viện mẫu giải nổi tiếng (otour-tpl.js): bấm mẫu Champions League → bộ môn + league phase +
 * 2 lượt được điền, mô tả bằng lời, ước tính 144 trận league phase; "Điền 36 đội mẫu" → tạo, bắt đầu → 144 trận, không
 * gặp đội cùng quốc gia. Mẫu LoL Worlds / F1 điền đúng thể thức; đổi môn thì bỏ đánh dấu mẫu.
 *   node caro/tests/e2e/otour-tpl.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8813;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_mau', 1100);
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  ok(await boss.isVisible('.tpl-card[data-id="champions_league"]'), 'Form tạo giải có thư viện mẫu');
  await boss.click('.tpl-card[data-id="champions_league"]'); await sleep(300);
  ok(await boss.$eval('#otf select[name=sport]', (e) => e.value) === 'football', 'Mẫu CL: bộ môn bóng đá');
  ok(await boss.isChecked('#otf-stages [data-k="league"]') && await boss.isChecked('#otf-stages [data-k="legs"]'), 'Mẫu CL: league phase + loại trực tiếp 2 lượt');
  ok(/36 đội/.test(await boss.textContent('.tpl-desc')), 'Có mô tả bằng lời');
  ok(await boss.$eval('#otf input[name=name]', (e) => e.value) === 'Kiểu Champions League', 'Tên giải tạm theo mẫu');
  await boss.click('[data-act="otTplTeams"]'); await sleep(300);
  const n = await boss.$eval('#otf textarea[name=teams]', (e) => e.value.split('\n').length);
  // 144 trận league phase + 23 trận loại trực tiếp 24 đội (8 đội miễn vòng đầu)
  ok(n === 36 && /Khoảng 167 trận/.test(await boss.textContent('#otf-est')), 'Điền 36 đội mẫu, ước tính 144 + 23 = 167 trận');
  await shot(boss, 'ot-tpl.png');
  await boss.click('#otf button.primary.wide'); await sleep(900);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot && window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  ok(t && t.stages[0].league && t.stages[1].legs && t.players.length === 36 && t.players[0].country === 'ENG', 'Tạo giải theo mẫu CL (có quốc gia)');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(300);
  // hộp xác nhận: helpers.js tự bấm Đồng ý
  await sleep(1200);
  const ms = t.st ? Object.values(t.st[0].matches) : [];
  const cty = new Map(t.players.map((p) => [p.uid, p.country]));
  ok(ms.length === 144 && ms.every((m) => cty.get(m.a) !== cty.get(m.b)), 'Bắt đầu: 144 trận league phase, không gặp đội cùng quốc gia');
  // Mẫu khác
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.click('.tpl-card[data-id="lol_worlds"]'); await sleep(300);
  ok(await boss.isChecked('#otf-stages [data-k="record"]') && await boss.$eval('#otf select[name=sport]', (e) => e.value) === 'esports', 'Mẫu LoL: Thụy Sĩ theo thắng / thua, thể thao điện tử');
  await boss.click('.tpl-card[data-id="f1"]'); await sleep(300);
  ok(await boss.$eval('#otf-stages [data-k="events"]', (e) => e.value) === '24' && await boss.isChecked('#otf-stages [data-k="teams"]'), 'Mẫu F1: 24 chặng, bảng đội');
  await boss.selectOption('#otf select[name=sport]', 'badminton'); await sleep(400);
  ok(!(await boss.$('.tpl-card.on')), 'Đổi môn: bỏ đánh dấu mẫu');
  await finish();
})();
