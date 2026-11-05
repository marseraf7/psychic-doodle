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
  // Mẫu giải Mỹ: NBA – bóng rổ, mỗi "set" là một trận trong loạt (form ghi "Trận 1"), playoff Bo7
  for (const [tid, sport] of [['nfl', 'amfootball'], ['mlb', 'baseball'], ['nhl', 'hockey'], ['mls', 'football']]) {
    await boss.click(`.tpl-card[data-id="${tid}"]`); await sleep(250);
    ok(await boss.$eval('#otf select[name=sport]', (e) => e.value) === sport, `Mẫu ${tid.toUpperCase()}: bộ môn ${sport}`);
  }
  await boss.click('.tpl-card[data-id="nba"]'); await sleep(300);
  ok(await boss.$eval('#otf select[name=sport]', (e) => e.value) === 'basketball' && await boss.$eval('#otf select[name=result]', (e) => e.value) === 'sets', 'Mẫu NBA: bóng rổ, ghi theo từng trận của loạt');
  ok(/Kiểu NBA/.test(await boss.textContent('.tpl-card.on')) && /Bo7/.test(await boss.textContent('.tpl-desc')), 'Mẫu NBA: thẻ đang chọn + mô tả có Bo7');
  await boss.fill('#otf input[name=name]', 'Bóng rổ kiểu NBA');
  await boss.click('[data-act="otTplTeams"]'); await sleep(300);
  await boss.click('#otf button.primary.wide'); await sleep(900);
  const tn = app.hub.otGet(await boss.evaluate(() => window.CaroTourKit.D.ot && window.CaroTourKit.D.ot.id));
  ok(tn && tn.sport === 'basketball' && tn.result === 'sets' && tn.set == null && tn.players.length === 30 && tn.stages[1].bestOf === 7, 'Tạo giải NBA: 30 đội, không luật set, playoff Bo7');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1500);
  await boss.click('[data-act="otTab"][data-tab="stages"]').catch(() => {}); await sleep(300);
  await boss.$$eval('details.fold', (ds) => ds.forEach((d) => { d.open = true; })); await sleep(1200);
  const sc = await boss.$('.scorable');
  if (sc) { await sc.click(); await sleep(400); }
  ok(!!sc && /Trận 1/.test(await boss.textContent('.score-panel').catch(() => '')) && /Nhập tỉ số của trận/.test(await boss.textContent('.score-panel').catch(() => '')), 'Khung nhập mùa giải (Bo1): "Trận 1", "Nhập tỉ số của trận"');
  ok(/🏀 Ghi điểm/.test(await boss.textContent('#otm-type').catch(() => '')) && !/Phản lưới/.test(await boss.textContent('#otm-type').catch(() => '')), 'Diễn biến trận bóng rổ: 🏀 Ghi điểm, không có phản lưới nhà');
  await shot(boss, 'ot-tpl-nba.png');
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.click('.tpl-card[data-id="f1"]'); await sleep(300);
  await boss.selectOption('#otf select[name=sport]', 'badminton'); await sleep(400);
  ok(!(await boss.$('.tpl-card.on')), 'Đổi môn: bỏ đánh dấu mẫu');
  await finish();
})();
