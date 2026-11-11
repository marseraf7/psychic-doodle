/*
 * Kiểm thử trình duyệt – đợt 8: thể thức giải con Esports còn lại.
 *   1. Form: bảng đấu loại kép chọn cỡ 8 người (4 đội đi tiếp); vòng tròn có lựa chọn "Bo2 (có hoà)".
 *   2. Sinh tồn chia 3 bảng xoay vòng: form có ô đánh dấu; trang giải ghi các bảng, mỗi trận chỉ hai bảng nhập kết quả.
 *   3. Điểm thưởng mang sang: giai đoạn sau có ô điểm thưởng, mô tả bằng lời ghi lại.
 *   node caro/tests/e2e/otour-formats8.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8841;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_ewc8', 1100);
  const S = (i, k) => `#otf-stages [data-i="${i}"][data-k="${k}"]`;
  const newForm = async (name, sport, preset) => {
    await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
    await boss.fill('#otf input[name=name]', name);
    await boss.selectOption('#otf select[name=sport]', sport); await sleep(200);
    await boss.selectOption('#otf select[name=preset]', preset); await sleep(300);
  };
  // ---------- 1. Bảng 8 người + Bo2
  await newForm('Chiến thuật', 'esports', 'groups_single');
  await boss.selectOption(S(0, 'type'), 'gsl'); await sleep(300);
  await boss.selectOption(S(0, 'size'), '8'); await sleep(300);
  ok(/4 người mỗi bảng đi tiếp/.test(await boss.textContent('#otf-stages .flow')) && /8 người/.test(await boss.textContent('#otf-desc')), 'Bảng loại kép 8 người: sơ đồ 4 người đi tiếp + mô tả');
  await boss.selectOption(S(0, 'type'), 'roundrobin'); await sleep(300);
  ok(await boss.$$eval(`${S(0, 'bestOf')} option`, (os) => os.some((o) => o.value === '2' && /có hoà/.test(o.textContent))), 'Vòng tròn có lựa chọn Bo2 (có hoà)');
  await boss.selectOption(S(0, 'bestOf'), '2'); await sleep(300);
  ok(/loạt Bo2/.test(await boss.textContent('#otf-desc')), 'Mô tả: loạt Bo2 có hoà');
  await shot(boss, 'ot-form8.png');

  // ---------- 2. Sinh tồn chia 3 bảng xoay vòng + 3. điểm thưởng mang sang
  await newForm('Sinh tồn 3 bảng', 'esports', 'race_single');
  await boss.fill(S(0, 'events'), '3'); await boss.press(S(0, 'events'), 'Tab'); await sleep(300);
  await boss.check(S(0, 'rot')); await sleep(300);
  ok(/3 bảng xoay vòng/.test(await boss.textContent('#otf-desc')), 'Mô tả: 3 bảng xoay vòng');
  ok(!(await boss.$(S(0, 'head'))), 'Giai đoạn đầu không có ô điểm thưởng');
  await boss.click('#otf-stages [data-sact="add"]'); await sleep(300);
  ok(await boss.isVisible(S(1, 'head')), 'Giai đoạn sau có ô điểm thưởng mang sang');
  await boss.click('#otf-stages [data-sact="del"][data-i="0"]'); await sleep(300);
  const teams = ['Sói', 'Gấu', 'Cáo', 'Hổ', 'Báo', 'Ưng'];
  await boss.fill('#otf textarea[name=teams]', teams.join('\n')); await boss.press('#otf textarea[name=teams]', 'Tab'); await sleep(300);
  await boss.click('#otf button.primary.wide'); await sleep(900);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  ok(t.stages[0].rot === true, 'Tạo giải: chia 3 bảng xoay vòng');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1200);
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(400);
  ok(/Chia 3 bảng/.test(await boss.textContent('.ot-tab')) && /bảng A \+ B đấu/.test(await boss.textContent('.ot-tab')), 'Trang giải ghi các bảng và bảng nào đấu trận 1');
  const uids = await boss.$$eval('.race-form tr[data-uid]', (trs) => trs.map((tr) => tr.dataset.uid));
  ok(uids.length === 4, 'Trận 1: chỉ 4 đội của hai bảng nhập kết quả');
  for (let k = 0; k < uids.length; k++) await boss.fill(`.race-form tr[data-uid="${uids[k]}"] .r-v`, String(k + 1));
  await boss.click('.race-form button.primary'); await sleep(900);
  ok(t.st[0].events[0].done && t.st[0].events[0].rows.length === 4, 'Lưu trận 1 (4 đội)');
  await shot(boss, 'ot-rot.png');
  await finish();
})();
