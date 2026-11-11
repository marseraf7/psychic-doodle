/*
 * Kiểm thử trình duyệt – đợt 9: vòng tranh hạt giống + cơ hội cuối (kiểu MOBA di động) và match point từ trận thứ N.
 *   1. Form: giai đoạn giữa chọn được "Vòng tranh hạt giống + cơ hội cuối" (giai đoạn cuối thì không), có Bo nửa dưới;
 *      sơ đồ + mô tả bằng lời; sinh tồn match point có ô "chỉ tính từ trận thứ".
 *   2. Giải 10 đội: bảng GSL → tranh hạt giống → loại trực tiếp có 2 đội vào thẳng; trang giải vẽ hai nửa, nhóm hạt giống.
 *   node caro/tests/e2e/otour-formats9.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');
const ST = require('../../../server/src/hub/stages.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8842;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_ewc9', 1100);
  const S = (i, k) => `#otf-stages [data-i="${i}"][data-k="${k}"]`;
  const newForm = async (name, sport, preset) => {
    await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
    await boss.fill('#otf input[name=name]', name);
    await boss.selectOption('#otf select[name=sport]', sport); await sleep(200);
    await boss.selectOption('#otf select[name=preset]', preset); await sleep(300);
  };
  const opts = (i) => boss.$$eval(`${S(i, 'type')} option`, (os) => os.map((o) => o.value));
  // ---------- 1. Form
  await newForm('MOBA di động', 'esports', 'groups_single');
  await boss.click('#otf-stages [data-sact="add"]'); await sleep(300);
  ok((await opts(1)).includes('kings') && !(await opts(2)).includes('kings'), 'Chỉ giai đoạn giữa chọn được vòng tranh hạt giống');
  await boss.selectOption(S(0, 'type'), 'gsl'); await sleep(300);
  await boss.selectOption(S(1, 'type'), 'kings'); await sleep(300);
  ok(await boss.isVisible(S(1, 'boLow')) && !(await boss.$(S(1, 'advance'))), 'Tranh hạt giống: có Bo nửa dưới, không có ô số đội đi tiếp');
  await boss.selectOption(S(1, 'boLow'), '5'); await sleep(300);
  await boss.fill(S(2, 'direct'), '2'); await boss.press(S(2, 'direct'), 'Tab'); await sleep(300);
  ok(/3\/4 số đội đi tiếp/.test(await boss.textContent('#otf-stages .flow')) && /vòng tranh hạt giống/.test(await boss.textContent('#otf-desc')) && /nửa dưới Bo5/.test(await boss.textContent('#otf-desc')), 'Sơ đồ + mô tả bằng lời');
  const teams = Array.from({ length: 10 }, (_, i) => 'Đội ' + (i + 1));
  await boss.fill('#otf textarea[name=teams]', teams.join('\n')); await boss.press('#otf textarea[name=teams]', 'Tab'); await sleep(300);
  await shot(boss, 'ot-kings-form.png');
  await boss.click('#otf button.primary.wide'); await sleep(900);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  ok(t.stages.map((c) => c.type).join() === 'gsl,kings,single' && t.stages[1].boLow === 5 && t.stages[2].direct === 2, 'Tạo giải: GSL → tranh hạt giống (nửa dưới Bo5) → loại trực tiếp, 2 đội vào thẳng');
  // ---------- 2. Đấu bảng GSL qua máy chủ, xem vòng tranh hạt giống
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1200);
  const seedOf = app.hub.otSeedOf(t);
  const play = async (m) => {
    const bo = ST.boOf(t.st[t.stage], m), w = seedOf(m.a) < seedOf(m.b);
    await boss.evaluate(([tid, mid, s]) => window.CaroTourKit.O.send({ t: 'otScore', id: tid, match: mid, sets: s }), [id, m.id, Array.from({ length: (bo + 1) / 2 }, () => (w ? [1, 0] : [0, 1]))]);
    await sleep(350);
  };
  for (let g = 0; t.stage === 0 && g < 5; g++) for (const m of ST.playable(t.st[0])) await play(m);
  ok(t.stage === 1, 'Xong bảng GSL: sang vòng tranh hạt giống');
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(500);
  const body = await boss.textContent('.ot-tab');
  ok(/Tranh hạt giống \(nửa trên\)/.test(body) && /Cơ hội cuối \(nửa dưới\) · Bo5/.test(body), 'Trang giải: hai nửa, nửa dưới Bo5');
  for (const m of ST.playable(t.st[1])) await play(m);
  await sleep(500);
  ok(t.stage === 2 && t.st[2].entrants.length === 5, 'Sang loại trực tiếp: 2 đội vào thẳng + 3 đội');
  await boss.click('[data-act="otTab"][data-tab="stages"]').catch(() => {}); await sleep(400);
  await boss.$$eval('details.fold', (ds) => ds.forEach((d) => { d.open = true; })); await sleep(300);
  const pills = await boss.$$eval('.kings-tab .pill', (xs) => xs.map((x) => x.textContent.trim()));
  ok(pills.filter((x) => x === 'Nhóm hạt giống 1').length === 1 && pills.filter((x) => x === 'Nhóm hạt giống 2').length === 2 && pills.includes('Bị loại'), 'Nhãn nhóm hạt giống / bị loại: ' + pills.join(', '));
  await shot(boss, 'ot-kings.png');

  // ---------- 3. Match point từ trận thứ N
  await newForm('Đua xe ảo', 'esports', 'race_single');
  await boss.fill(S(0, 'events'), '8'); await boss.press(S(0, 'events'), 'Tab'); await sleep(300);
  await boss.selectOption(S(0, 'mpMode'), 'at'); await sleep(300);
  await boss.fill(S(0, 'mpAt'), '50'); await boss.press(S(0, 'mpAt'), 'Tab'); await sleep(300);
  await boss.fill(S(0, 'mpMin'), '4'); await boss.press(S(0, 'mpMin'), 'Tab'); await sleep(300);
  ok(/chỉ tính từ trận 4/.test(await boss.textContent('#otf-desc')), 'Mô tả: match point chỉ tính từ trận 4');
  await finish();
})();
