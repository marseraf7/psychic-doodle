/*
 * Kiểm thử trình duyệt – đợt 24 (chỉ mô phỏng thể thức):
 *   1. Mẫu Modified Stableford: form có cách chấm + bảng điểm 6 mức; mô tả; bắt đầu → nhập vòng 1 từng lỗ → bảng có cột điểm.
 *   2. Mẫu omnium: tạo + bắt đầu → nhập Scratch theo thứ hạng trên trang → máy chủ ghi.
 *   3. Mẫu mass start: ô bán kết; mô tả bảng điểm giữa đua.
 *   4. Mẫu biathlon: giai đoạn 2 đuổi bắt, mốc xuất phát đồng loạt 240 giây.
 *   5. Mẫu giải Scotland: ô chia đôi 6 đội ở giai đoạn 2; mô tả.
 *   node caro/tests/e2e/otour-race2.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8850;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_race2', 1100);
  const S = (i, k) => `#otf-stages [data-i="${i}"][data-k="${k}"]`;
  const desc = () => boss.textContent('#otf-desc');
  const tpl = async (id) => { await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300); await boss.click(`.tpl-card[data-id="${id}"]`); await sleep(500); };
  const create = async () => {
    await boss.click('[data-act="otTplTeams"]'); await sleep(400);
    await boss.click('#otf button.primary.wide'); await sleep(1200);
    const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
    await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1500);
    await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(700);
    return app.hub.otGet(id);
  };

  // ---------- 1. Modified Stableford
  await tpl('barracuda');
  ok(await boss.inputValue(S(0, 'gScoring')) === 'modified' && await boss.inputValue(`${S(0, 'gPts')}[data-n="eagle"]`) === '5' && await boss.inputValue(`${S(0, 'gPts')}[data-n="dbl"]`) === '-3', 'Golf: Modified Stableford, bảng điểm 6 mức');
  ok(/chấm điểm Modified Stableford \(albatross \/ eagle \/ birdie \/ par \/ bogey \/ double bogey: 8 \/ 5 \/ 2 \/ 0 \/ -1 \/ -3\)/.test(await desc()), 'Mô tả Stableford');
  const golf = await create();
  // Nhập lỗ 1 của người đầu: birdie (3 trên par 4)
  const row = '.golf-form tr[data-uid]';
  await boss.fill(`${row} .g-h[data-k="0"]`, String(golf.st[0].cfg.par[0] - 1));
  await boss.click('.golf-form button.primary'); await sleep(900);
  ok(golf.st[0].events[0].rows && golf.st[0].events[0].rows.length === 1, 'Máy chủ lưu vòng đang đánh');
  ok(/Điểm/.test(await boss.textContent('.golf-board thead')) && /Modified Stableford/.test(await boss.textContent('.golf-info')), 'Bảng dẫn đầu có cột điểm');
  await shot(boss, 'ot-race2-golf.png');

  // ---------- 2. Omnium
  await tpl('omnium');
  ok(/omnium 4 đua con/.test(await desc()), 'Mô tả omnium');
  const om = await create();
  const ranks = await boss.$$('.plug-form .p-rank');
  ok(ranks.length === 20, 'Khung nhập Scratch: 20 người');
  for (let k = 0; k < ranks.length; k++) await ranks[k].fill(String(k + 1));
  await boss.click('.plug-form button.primary'); await sleep(900);
  ok(om.st[0].events[0].done, 'Máy chủ ghi Scratch');
  ok(/Scratch/.test(await boss.textContent('.ot-tab')) && /Points race/.test(await boss.textContent('.ot-tab')), 'Bảng tổng: cột 4 đua con');
  await shot(boss, 'ot-race2-omnium.png');

  // ---------- 3. Mass start
  await tpl('massstart');
  ok(await boss.isChecked(S(0, 'msSemis')) && await boss.inputValue(S(0, 'msHeat')) === '18', 'Mass start: bán kết, 18 người mỗi lượt');
  ok(/điểm giữa đua ở vòng 4, 8, 12: 3-2-1/.test(await desc()) && /về đích: 60-40-20-10-6-3/.test(await desc()), 'Mô tả mass start');

  // ---------- 4. Biathlon
  await tpl('biathlon_pursuit');
  ok(await boss.inputValue(S(1, 'score')) === 'pursuit' && await boss.inputValue(S(1, 'puWave')) === '240', 'Biathlon: giai đoạn 2 đuổi bắt, mốc 240 giây');
  ok(/thua quá 240 giây thì xuất phát đồng loạt/.test(await desc()), 'Mô tả đuổi bắt');

  // ---------- 5. Giải Scotland
  await tpl('scottish_split');
  ok(await boss.isChecked(S(1, 'splitOn')) && await boss.inputValue(S(1, 'splitTop')) === '6', 'Chia đôi 6 đội ở giai đoạn 2');
  ok(/tách nhóm trên 6 đội/.test(await desc()), 'Mô tả chia đôi');
  await finish();
})();
