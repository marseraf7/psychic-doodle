/*
 * Kiểm thử trình duyệt – Giải đấu Offline: nhánh loại trực tiếp theo vị trí trong bảng (otour-path.js):
 *   - form tạo giải: ô "Nhánh theo vị trí trong bảng" ở giai đoạn loại trực tiếp sau vòng bảng;
 *   - trước khi vòng bảng xong: trang giải hiện đường đi "1A – 2B"…;
 *   - vòng bảng xong: vòng 1 loại trực tiếp đúng khuôn (nhất A gặp nhì B…); mô tả bằng lời có "theo vị trí trong bảng".
 *   node caro/tests/e2e/otour-path.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8821;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_nhanh', 1100);
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.fill('#otf input[name=name]', 'Giải nhánh theo bảng');
  await boss.selectOption('#otf select[name=sport]', 'football'); await sleep(150);
  await boss.selectOption('#otf select[name=preset]', 'groups_single'); await sleep(150);
  await boss.fill('#otf textarea[name=teams]', Array.from({ length: 16 }, (_, i) => `Đội ${i + 1}`).join('\n'));
  await boss.$eval('#otf textarea[name=teams]', (e) => e.dispatchEvent(new Event('change', { bubbles: true }))); await sleep(200);
  await boss.selectOption('#otf-stages [data-k="gmode"]', 'size').catch(() => {}); await sleep(200);
  const box = await boss.$('#otf-stages [data-i="1"][data-k="path"]');
  ok(!!box, 'Form: ô "Nhánh theo vị trí trong bảng" ở giai đoạn loại trực tiếp');
  if (box) { await box.click(); await sleep(300); } // form vẽ lại sau khi đổi – đọc lại ô mới
  ok(await boss.$eval('#otf-stages [data-i="1"][data-k="path"]', (e) => e.checked).catch(() => false), 'Bật ô nhánh theo vị trí trong bảng');
  ok(/nhánh cố định theo vị trí trong bảng/.test(await boss.textContent('#otf-desc')), 'Mô tả bằng lời có "nhánh cố định theo vị trí trong bảng"');
  await boss.click('#otf button.primary.wide'); await sleep(900);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  ok(t.stages[1].path === 'groups' && t.st == null, 'Tạo giải: giai đoạn 2 có path = groups');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1000);
  const G = t.st[0].groups.length;
  ok(G === 4, 'Vòng bảng 4 bảng');
  await boss.click('[data-act="otTab"][data-tab="stages"]').catch(() => {}); await sleep(300);
  await boss.$$eval('details.fold', (ds) => ds.forEach((d) => { d.open = true; })); await sleep(400);
  ok(/1A – 2B/.test(await boss.textContent('.ot-path').catch(() => '')), 'Trước khi vòng bảng xong: hiện đường đi 1A – 2B…');
  await shot(boss, 'ot-path-preview.png');
  for (const m of Object.values(t.st[0].matches)) {
    if (typeof m.a !== 'string' || typeof m.b !== 'string') continue;
    await boss.evaluate(([tid, mid]) => window.CaroTourKit.O.send({ t: 'otScore', id: tid, match: mid, score: [1, 0] }), [id, m.id]);
    await sleep(40);
  }
  await sleep(1200);
  ok(t.stage === 1, 'Vòng bảng xong: sang loại trực tiếp');
  const ST = require('../../../server/src/hub/stages.js');
  const tables = ST.standings(t.st[0], app.hub.otSeedOf(t));
  const r0 = Object.values(t.st[1].matches).filter((m) => m.round === 0).sort((x, y) => x.id.localeCompare(y.id, undefined, { numeric: true }));
  ok(r0[0].a === tables[0].list[0] && r0[0].b === tables[1].list[1], 'Vòng 1: nhất bảng A gặp nhì bảng B');
  await finish();
})();
