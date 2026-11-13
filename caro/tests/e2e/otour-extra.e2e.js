/*
 * Kiểm thử trình duyệt – đợt 26 (chỉ mô phỏng thể thức):
 *   1. Mẫu Nordic combined: form nhảy cầu + đuổi bắt (mỗi điểm = 4 giây); bắt đầu → nhập điểm lượt nhảy trên trang → máy chủ ghi.
 *   2. Mẫu MTG: ô draft (số gói, nộp danh sách bài, ghép đối diện bàn); bắt đầu → trang có thứ tự ghế, chiều chuyền gói;
 *      nộp danh sách bài trên trang → máy chủ lưu số lá.
 *   3. Backyard Ultra: nhà vô địch có người "assist".
 *   node caro/tests/e2e/otour-extra.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8852;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_extra', 1100);
  const S = (i, k) => `#otf-stages [data-i="${i}"][data-k="${k}"]`;
  const desc = () => boss.textContent('#otf-desc');
  const tab = () => boss.textContent('.ot-tab');
  const tpl = async (id) => { await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300); await boss.click(`.tpl-card[data-id="${id}"]`); await sleep(500); };
  const create = async () => {
    await boss.click('[data-act="otTplTeams"]'); await sleep(400);
    await boss.click('#otf button.primary.wide'); await sleep(1200);
    const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
    await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1500);
    await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(700);
    return app.hub.otGet(id);
  };

  // ---------- 1. Nordic combined
  await tpl('nordic_combined');
  ok(await boss.inputValue(S(0, 'score')) === 'skijump' && await boss.inputValue(S(1, 'score')) === 'pursuit' && await boss.inputValue(S(1, 'puPer')) === '4', 'Nordic combined: nhảy cầu → đuổi bắt, 1 điểm = 4 giây');
  ok(/nhảy cầu 1 lượt/.test(await desc()) && /mỗi điểm thua = 4 giây/.test(await desc()), 'Mô tả Nordic combined');
  const nc = await create();
  const pts = await boss.$$('.plug-form .p-pts');
  ok(pts.length === 50, 'Khung nhập điểm nhảy: 50 người');
  for (let k = 0; k < pts.length; k++) await pts[k].fill(String(140 - k * 0.5));
  await boss.click('.plug-form button.primary'); await sleep(1200);
  ok(nc.st[0].done && nc.stage === 1 && nc.st[1].gapsBy === 'jump', 'Xong nhảy cầu, sang đuổi bắt theo điểm');
  ok(/mỗi điểm thua nhảy cầu = 4 giây/.test(await tab()), 'Trang đuổi bắt ghi cách đổi điểm');
  await shot(boss, 'ot-extra-nordic.png');

  // ---------- 2. MTG draft
  await tpl('mtg_gp');
  ok(await boss.isChecked(S(0, 'mtgOn')) && await boss.inputValue(S(0, 'mtgPacks')) === '3' && await boss.isChecked(S(0, 'mtgDeck')) && await boss.isChecked(S(0, 'mtgCross')), 'MTG: draft 3 gói, nộp danh sách bài, ghép đối diện bàn');
  ok(await boss.isChecked(S(1, 'mtgOn')), 'Top 8 draft lại');
  ok(/mỗi pod là một phiên draft 3 gói/.test(await desc()) && /draft lại 3 gói trước giai đoạn/.test(await desc()), 'Mô tả draft');
  const mt = await create();
  ok(/Phiên draft 1/.test(await tab()) && /Gói 1: chuyền trái · Gói 2: chuyền phải · Gói 3: chuyền trái/.test(await tab()), 'Trang: phiên draft, chiều chuyền gói');
  ok((await boss.$$('.mtg-pod')).length === 8 && /chưa nộp bộ bài/.test(await tab()), 'Thứ tự ghế 8 pod, chưa ai nộp');
  const uid = await boss.inputValue('.mtg-form select[name="uid"]');
  await boss.fill('.mtg-form textarea[name="list"]', '17 Island\n23 Plains');
  await boss.click('.mtg-form button.primary'); await sleep(900);
  ok(mt.st[0].drafts[0].decks[uid] && mt.st[0].drafts[0].decks[uid].n === 40, 'Nộp danh sách bài → máy chủ lưu số lá');
  ok(/40 lá/.test(await tab()), 'Trang hiện số lá');
  await shot(boss, 'ot-extra-mtg.png');

  // ---------- 3. Backyard Ultra – assist (nhập qua giao diện: vòng 1 cả đoàn về kịp, vòng 2 chỉ người đầu, vòng 3 chạy một mình)
  await tpl('backyard_ultra');
  const by = await create();
  const yard = async (keep) => {
    const boxes = await boss.$$('.plug2-form [data-by]');
    for (let k = keep; k < boxes.length; k++) await boxes[k].uncheck();
    await boss.click('.plug2-form button.primary'); await sleep(900);
  };
  await yard(99); await yard(1); await yard(1);
  ok(by.st[0].done && by.st[0].backyard.status === 'champion', 'Backyard: có nhà vô địch sau vòng một mình');
  const t3 = await tab();
  ok(/Vô địch:/.test(t3) && (await boss.$$('.pill[title]')).length === 29 && /assist/.test(t3), 'Backyard: 29 người dừng ở vòng 2 được ghi assist');
  await shot(boss, 'ot-extra-backyard.png');
  await finish();
})();
