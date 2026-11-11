/*
 * Kiểm thử trình duyệt – đợt 10: mẫu kiểu CS Major (4 giai đoạn: 3 giai đoạn Thụy Sĩ + playoff, ghép cặp kiểu CS Major).
 *   1. Thẻ mẫu → form có 4 giai đoạn, không còn nút thêm giai đoạn; mô tả bằng lời ghi ghép cặp kiểu CS Major;
 *      giai đoạn Thụy Sĩ theo thắng / thua có lựa chọn "Kiểu CS Major".
 *   2. Tạo + bắt đầu: giai đoạn 1 là hạt giống 17–32, vòng 1 hạt giống 1 gặp 9 của giai đoạn (Đội 17 – Đội 25).
 *   node caro/tests/e2e/otour-majors.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8843;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_major', 1100);
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.click('.tpl-card[data-id="cs_major"]'); await sleep(500);
  ok(await boss.$$eval('#otf-stages .stage-card', (xs) => xs.length) === 4 && !(await boss.$('#otf-stages [data-sact="add"]')), 'Mẫu kiểu CS Major: 4 giai đoạn, hết chỗ thêm giai đoạn');
  ok(/ghép cặp kiểu CS Major/.test(await boss.textContent('#otf-desc')), 'Mô tả bằng lời: ghép cặp kiểu CS Major');
  ok(await boss.$$eval('#otf-stages [data-i="0"][data-k="pairing"] option', (os) => os.some((o) => o.value === 'valve' && o.selected)), 'Lựa chọn ghép cặp "Kiểu CS Major" đang chọn');
  await boss.click('[data-act="otTplTeams"]'); await sleep(400); // điền 32 đội mẫu
  await shot(boss, 'ot-major-form.png');
  await boss.click('#otf button.primary.wide'); await sleep(1200);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  ok(t && t.stages.length === 4 && t.players.length === 32, 'Tạo giải 32 đội, 4 giai đoạn');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1500);
  ok(t.status === 'running' && t.st[0].entrants.length === 16, 'Bắt đầu: giai đoạn 1 có 16 đội');
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(500);
  const body = await boss.textContent('.ot-tab');
  ok(/Đội 17/.test(body) && /Đội 25/.test(body) && !/Đội 1\b(?!\d)/.test(body.split('Giai đoạn 2')[0]), 'Giai đoạn 1: hạt giống 17–32');
  const m0 = t.st[0].matches[t.st[0].rounds[0][0]];
  ok(t.players.find((p) => p.uid === m0.a).name === 'Đội 17' && t.players.find((p) => p.uid === m0.b).name === 'Đội 25', 'Vòng 1: Đội 17 gặp Đội 25 (1 gặp 9 của giai đoạn)');
  await shot(boss, 'ot-major.png');
  await finish();
})();
