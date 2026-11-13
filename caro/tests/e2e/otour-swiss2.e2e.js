/*
 * Kiểm thử trình duyệt – đợt 21: các cách ghép cặp Thụy Sĩ mới (chỉ mô phỏng thể thức).
 *   1. Mẫu Scrabble: ô King of the Hill + Gibsonization; mô tả bằng lời.
 *   2. Mẫu kiểu VGC: ô cắt theo số thua (ẩn ô số người đi tiếp); mô tả.
 *   3. Mẫu Monrad: ô cách ghép có Monrad / Danish / Baku; vòng cuối Danish.
 *   4. Mẫu Baku: bắt đầu giải, trang giải ghi chú điểm ảo của vòng; chỉ số phụ tỉ lệ thắng của đối thủ chọn được.
 *   node caro/tests/e2e/otour-swiss2.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8847;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_swiss2', 1100);
  const S = (i, k) => `#otf-stages [data-i="${i}"][data-k="${k}"]`;
  const desc = () => boss.textContent('#otf-desc');
  const tpl = async (id) => { await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300); await boss.click(`.tpl-card[data-id="${id}"]`); await sleep(500); };

  // ---------- 1. Scrabble: King of the Hill + Gibsonization
  await tpl('scrabble_koth');
  ok(await boss.isChecked(S(0, 'kothOn')) && await boss.inputValue(S(0, 'kothRounds')) === '2' && await boss.isChecked(S(0, 'gibOn')) && await boss.inputValue(S(0, 'gibSpots')) === '2', 'Scrabble: King of the Hill 2 vòng cuối, Gibsonization 2 suất');
  ok(/2 vòng cuối King of the Hill/.test(await desc()) && /Gibsonization/.test(await desc()), 'Mô tả: King of the Hill, Gibsonization');
  await boss.uncheck(S(0, 'gibOn')); await sleep(300);
  ok(!(await boss.$(S(0, 'gibSpots'))) && !/Gibsonization/.test(await desc()), 'Tắt Gibsonization: ẩn ô, bỏ khỏi mô tả');

  // ---------- 2. VGC: cắt theo số thua
  await tpl('vgc_worlds');
  ok(await boss.isChecked(S(0, 'cutOn')) && await boss.inputValue(S(0, 'cutLosses')) === '2' && !(await boss.$(S(0, 'advance'))), 'VGC: cắt theo số thua 2, không có ô số người đi tiếp');
  ok(/mọi người thua không quá 2 trận đi tiếp/.test(await desc()), 'Mô tả: cắt X-2');
  await shot(boss, 'ot-swiss2-vgc.png');

  // ---------- 3. Monrad, vòng cuối Danish
  await tpl('monrad_club');
  const opts = await boss.$$eval(`${S(0, 'pairing')} option`, (os) => os.map((o) => o.value));
  ok(['monrad', 'danish', 'baku'].every((x) => opts.includes(x)) && await boss.inputValue(S(0, 'pairing')) === 'monrad', 'Ô cách ghép có Monrad / Danish / Baku');
  ok(await boss.isChecked(S(0, 'danishLast')) && /vòng 7 ghép kiểu Danish/.test(await desc()), 'Vòng cuối Danish');

  // ---------- 4. Baku: ghi chú điểm ảo trên trang giải; chỉ số phụ OWP
  await tpl('baku_open');
  const tbs = await boss.$$eval(`${S(0, 'tbAdd')} option`, (os) => os.map((o) => o.value));
  ok(tbs.includes('oppWinPct') && tbs.includes('oppOppWinPct'), 'Chọn được chỉ số phụ tỉ lệ thắng của đối thủ');
  await boss.click('[data-act="otTplTeams"]'); await sleep(400);
  await boss.click('#otf button.primary.wide'); await sleep(1200);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1500);
  ok(app.hub.otGet(id).st[0].pp.v === 1, 'Máy chủ: vòng 1 cộng 1 điểm ảo cho nửa trên');
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(700);
  ok(/Vòng 1: nửa trên \(theo hạt giống\) được cộng 1 điểm ảo/.test(await boss.textContent('.ot-tab')), 'Trang giải ghi chú điểm ảo Baku');
  await shot(boss, 'ot-swiss2-baku.png');
  await finish();
})();
