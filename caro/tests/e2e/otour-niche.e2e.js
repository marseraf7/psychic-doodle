/*
 * Kiểm thử trình duyệt – đợt 25 (chỉ mô phỏng thể thức):
 *   1. Mẫu BLAST Bounty: form loại trực tiếp có bounty; bắt đầu → bảng tiền thưởng tổng 500.000, chọn đối thủ đổi cặp trên máy chủ.
 *   2. Mẫu Snooker Shoot Out: mô tả bốc thăm lại mỗi vòng.
 *   3. Mẫu poker PKO: bắt đầu → ghi một lần loại người trên trang → máy chủ ghi, bảng có cột bounty.
 *   4. Mẫu Backyard Ultra: bắt đầu → nhập vòng 1 (bỏ chọn một người) → người đó dừng.
 *   5. Mẫu bridge: bắt đầu → mở trận, nhập điểm ván → IMP / VP tính ngay → lưu → máy chủ ghi VP.
 *   6. Mẫu MTG: ô pod 8 người, 3 vòng; mô tả.
 *   node caro/tests/e2e/otour-niche.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');
const ST = require('../../../server/src/hub/stages.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8851;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_niche', 1100);
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

  // ---------- 1. BLAST Bounty
  await tpl('blast_bounty');
  ok(await boss.inputValue(S(0, 'type')) === 'knock' && await boss.inputValue(S(0, 'knMode')) === 'bounty' && await boss.inputValue(S(0, 'knClaim')) === '50', 'Bounty: loại trực tiếp dựng từng vòng, nhận 50%');
  ok(/đội nồi dưới chọn đối thủ ở nồi trên mỗi vòng, thắng nhận 50% bounty/.test(await desc()), 'Mô tả BLAST Bounty');
  const bt = await create();
  ok(/Tiền thưởng/.test(await tab()) && /60\.000|60,000/.test(await tab()), 'Bảng tiền thưởng');
  const st = bt.st[0], m0 = st.matches[st.rounds[0][0]];
  const target = st.matches[st.rounds[0][15]].a;
  await boss.selectOption(`select[data-kn-picker="${m0.b}"]`, target); await sleep(800);
  ok(m0.a === target, 'Chọn đối thủ → máy chủ đổi cặp');
  await shot(boss, 'ot-niche-bounty.png');

  // ---------- 2. Shoot Out
  await tpl('snooker_shootout');
  ok(/bốc thăm lại cặp đấu sau mỗi vòng/.test(await desc()), 'Mô tả Shoot Out');

  // ---------- 3. Poker PKO
  await tpl('poker_pko');
  ok(await boss.inputValue(S(0, 'score')) === 'poker' && await boss.inputValue(S(0, 'pkType')) === 'pko', 'Poker: PKO');
  const pk = await create();
  await boss.click('.plug2-form button.primary'); await sleep(900);
  ok(pk.st[0].events[0].done && pk.st[0].events[0].rows[0].by, 'Ghi lần loại người');
  ok(/Bounty/.test(await tab()) && /150/.test(await tab()), 'Bảng: bounty của người loại tăng lên 150');

  // ---------- 4. Backyard Ultra
  await tpl('backyard_ultra');
  const by = await create();
  const boxes = await boss.$$('.plug2-form [data-by]');
  await boxes[boxes.length - 1].uncheck();
  await boss.click('.plug2-form button.primary'); await sleep(900);
  ok(by.st[0].events[0].done && by.st[0].events.length === 2, 'Xong vòng 1, tự thêm vòng 2');
  ok(by.st[0].events[0].rows.filter((x) => !x.done).length === 1, 'Một người dừng');
  await shot(boss, 'ot-niche-backyard.png');

  // ---------- 5. Bridge
  await tpl('bridge_teams');
  ok(await boss.inputValue(S(0, 'brBoards')) === '16', 'Bridge: 16 ván mỗi trận');
  const br = await create();
  const bm = ST.playable(br.st[0])[0];
  await boss.click(`[data-mid="${bm.id}"]`); await sleep(500);
  const ins = await boss.$$('form[data-bridge] tr[data-b="0"] input');
  await ins[0].fill('620'); await ins[1].fill('0');
  await sleep(300);
  ok(/IMP 12–0 · VP/.test(await boss.textContent('.br-sum')), 'Tính IMP / VP ngay khi gõ');
  await boss.click('form[data-bridge] button.primary'); await sleep(900);
  ok(bm.done && bm.vp && bm.vp[0] + bm.vp[1] === 20 && bm.vp[0] > 10, 'Máy chủ ghi VP (tổng 20)');
  await shot(boss, 'ot-niche-bridge.png');

  // ---------- 6. MTG
  await tpl('mtg_gp');
  ok(await boss.isChecked(S(0, 'podOn')) && await boss.inputValue(S(0, 'podSize')) === '8' && await boss.inputValue(S(0, 'podRounds')) === '3', 'MTG: pod 8 người, 3 vòng');
  ok(/ghép cặp trong pod 8 người, đổi pod sau mỗi 3 vòng/.test(await desc()), 'Mô tả pod');
  await finish();
})();
