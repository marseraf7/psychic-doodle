/*
 * Kiểm thử trình duyệt – thư viện mẫu giải nổi tiếng (otour-tpl.js): bấm mẫu Champions League → bộ môn + league phase +
 * 2 lượt được điền, mô tả bằng lời, ước tính 144 trận league phase; "Điền 36 đội mẫu" → tạo, bắt đầu → 144 trận, không
 * gặp đội cùng quốc gia. Mẫu LoL Worlds / F1 điền đúng thể thức; đổi môn thì bỏ đánh dấu mẫu.
 *   node caro/tests/e2e/otour-tpl.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');
const ST = require('../../../server/src/hub/stages.js');

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
  // Mùa giải đúng như NBA: 2 miền × 3 bảng con, 82 trận mỗi đội, 1 230 trận cả mùa
  ok(await boss.isChecked('#otf-stages [data-k="season"]') && /Mỗi đội 82 trận · cả mùa 1230 trận/.test(await boss.textContent('#otf-stages .sn-sum').catch(() => '')), 'Mẫu NBA: mùa giải 82 trận mỗi đội, 1230 trận');
  // Đổi số lần gặp đội khác miền 2 → 1: còn 67 trận mỗi đội
  await boss.fill('#otf-stages [data-k="sn_inter_m"]', '1'); await boss.$eval('#otf-stages [data-k="sn_inter_m"]', (e) => e.dispatchEvent(new Event('change', { bubbles: true }))); await sleep(300);
  ok(/Mỗi đội 67 trận/.test(await boss.textContent('#otf-stages .sn-sum').catch(() => '')), 'Sửa số lần gặp: số trận cập nhật ngay');
  await boss.fill('#otf-stages [data-k="sn_inter_m"]', '2'); await boss.$eval('#otf-stages [data-k="sn_inter_m"]', (e) => e.dispatchEvent(new Event('change', { bubbles: true }))); await sleep(300);
  // Playoff kiểu NBA: nhánh theo miền, 8 đội mỗi miền + play-in hạt giống 7–10 → mùa giải cho 10 đội mỗi miền đi tiếp
  ok(await boss.isChecked('#otf-stages [data-k="playoff"]') && await boss.$eval('#otf-stages [data-k="poPlayin"]', (e) => e.value) === 'nba'
    && /cho 10 đội mỗi miền đi tiếp/.test(await boss.textContent('#otf-stages .po-need').catch(() => '')), 'Mẫu NBA: playoff theo miền + play-in, mùa giải cho 10 đội mỗi miền đi tiếp');
  await boss.selectOption('#otf-stages [data-k="poPlayin"]', 'one'); await sleep(300);
  ok(await boss.$eval('#otf-stages [data-k="advance"]', (e) => e.value) === '9', 'Đổi play-in một trận: số đội đi tiếp mùa giải tự thành 9');
  await boss.selectOption('#otf-stages [data-k="poPlayin"]', 'nba'); await sleep(300);
  await boss.$eval('#otf-stages [data-k="playoff"]', (e) => e.scrollIntoView()).catch(() => {}); await sleep(200);
  await shot(boss, 'ot-playoff-form.png');
  await shot(boss, 'ot-season-form.png');
  await boss.click('#otf button.primary.wide'); await sleep(900);
  const tn = app.hub.otGet(await boss.evaluate(() => window.CaroTourKit.D.ot && window.CaroTourKit.D.ot.id));
  ok(tn && tn.sport === 'basketball' && tn.result === 'sets' && tn.set == null && tn.players.length === 30 && tn.stages[1].bestOf === 7, 'Tạo giải NBA: 30 đội, không luật set, playoff Bo7');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1500);
  ok(tn.st && Object.keys(tn.st[0].matches).length === 1230 && tn.st[0].groups.length === 2, 'Bắt đầu: 1230 trận, 2 miền');
  await boss.click('[data-act="otTab"][data-tab="stages"]').catch(() => {}); await sleep(300);
  await boss.$$eval('details.fold', (ds) => ds.forEach((d) => { d.open = true; })); await sleep(1200);
  const sc = await boss.$('.scorable');
  if (sc) { await sc.click(); await sleep(400); }
  ok(!!sc && /Trận 1/.test(await boss.textContent('.score-panel').catch(() => '')) && /Nhập tỉ số của trận/.test(await boss.textContent('.score-panel').catch(() => '')), 'Khung nhập mùa giải (Bo1): "Trận 1", "Nhập tỉ số của trận"');
  ok(/🏀 Ghi điểm/.test(await boss.textContent('#otm-type').catch(() => '')) && !/Phản lưới/.test(await boss.textContent('#otm-type').catch(() => '')), 'Diễn biến trận bóng rổ: 🏀 Ghi điểm, không có phản lưới nhà');
  await shot(boss, 'ot-tpl-nba.png');
  // Đấu nhanh cả mùa (đội xếp trên luôn thắng) trừ trận cuối; trận cuối ghi qua giao diện → playoff bốc thăm theo miền
  await boss.click('.score-panel [data-act="otScoreClose"]').catch(() => {});
  const seedOf = app.hub.otSeedOf(tn), all = Object.values(tn.st[0].matches);
  const last = all.pop();
  for (const m of all) ST.recordResult(tn.st[0], m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf, isActive: () => true });
  await boss.evaluate(([tid, mid]) => window.CaroTourKit.O.send({ t: 'otScore', id: tid, match: mid, sets: [[1, 0]] }), [tn.id, last.id]); await sleep(1500);
  const po = tn.st[1];
  ok(po && po.pre && po.pre.length === 6 && po.halves === 2, 'Hết mùa: playoff có 6 trận play-in, mỗi miền một nửa nhánh');
  await boss.click('[data-act="otTab"][data-tab="stages"]').catch(() => {}); await sleep(600);
  ok(/Play-in/.test(await boss.textContent('.bracket.pi').catch(() => '')) && /Nhánh chính/.test(await boss.textContent('body')), 'Nhánh playoff: khối play-in + nhánh chính');
  const labs = await boss.$$eval('.b-p .seed.lab', (xs) => xs.map((x) => x.textContent));
  ok(labs.includes('A1') && labs.includes('B10'), 'Ô trận hiện hạt giống theo miền (A1 … B10)');
  // Play-in miền A: hạt giống 8 thắng 7–8, hạt giống 9 thắng 9–10 → trận quyết định: hạt giống 7 gặp 9
  const [p78, p910, plast] = po.pre.slice(0, 3).map((mid) => po.matches[mid]);
  for (const [m, w] of [[p78, p78.b], [p910, p910.a]]) {
    await boss.evaluate(([tid, mid, s]) => window.CaroTourKit.O.send({ t: 'otScore', id: tid, match: mid, sets: [s] }), [tn.id, m.id, w === m.a ? [1, 0] : [0, 1]]); await sleep(500);
  }
  ok(plast.a === p78.a && plast.b === p910.a && po.matches[po.rounds[0][2]].b === p78.b, 'Play-in: thua 7–8 gặp thắng 9–10; thắng 7–8 vào hạt giống 7');
  await sleep(600);
  ok((await boss.textContent('.bracket.pi').catch(() => '')).includes('trận quyết định'), 'Có cột trận quyết định');
  await boss.$eval('.bracket.pi', (e) => e.scrollIntoView()).catch(() => {}); await sleep(200);
  await shot(boss, 'ot-playoff-nba.png');
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.click('.tpl-card[data-id="f1"]'); await sleep(300);
  await boss.selectOption('#otf select[name=sport]', 'badminton'); await sleep(400);
  ok(!(await boss.$('.tpl-card.on')), 'Đổi môn: bỏ đánh dấu mẫu');
  await finish();
})();
