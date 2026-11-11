/*
 * Kiểm thử trình duyệt – đợt 16: thể thức kiểu LoL MSI và các mẫu PGS (chỉ mô phỏng thể thức).
 *   1. Mẫu kiểu MSI 2021–2022: ô "bảng ít đội hơn gặp nhau" = 4 lượt, trận phụ cả ở hạng nhất, hạt giống 1 chọn đối thủ
 *      bán kết; mô tả bằng lời.
 *   2. Mẫu kiểu MSI 2018: chạy tới vòng loại trực tiếp; trang giải hỏi hạt giống 1 chọn đối thủ (2 nút), bấm chọn hạt
 *      giống 3 → nhánh 1 gặp 3, ghi lại lựa chọn.
 *   3. Mẫu kiểu PGS 2023: dải hạng "sau nhóm đi tiếp", đổi cặp bảng sau 6 trận; Thụy Sĩ có thêm kiểu CS Major cũ.
 *   node caro/tests/e2e/otour-msi.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');
const ST = require('../../../server/src/hub/stages.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8845;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_msi', 1100);
  const S = (i, k, n) => `#otf-stages [data-i="${i}"][data-k="${k}"]${n != null ? `[data-n="${n}"]` : ''}`;
  const desc = () => boss.textContent('#otf-desc');
  const tpl = async (id) => { await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300); await boss.click(`.tpl-card[data-id="${id}"]`); await sleep(500); };

  // ---------- 1. Form mẫu kiểu MSI 2021–2022
  await tpl('msi21');
  ok(await boss.inputValue(S(0, 'meetSmall')) === '4' && await boss.inputValue(S(1, 'tbmLines')) === '1 2' && await boss.isChecked(S(2, 'pick')), 'MSI 2021: bảng 3 đội 4 lượt, trận phụ ở vạch hạng 1 và 2, chọn đối thủ bán kết');
  const d = await desc();
  ok(/bảng ít đội hơn gặp nhau 4 lượt/.test(d) && /trận phụ cả ở vạch hạng 1, 2/.test(d) && /hạt giống 1 chọn đối thủ bán kết/.test(d), 'Mô tả bằng lời');
  await shot(boss, 'ot-msi21-form.png');

  // ---------- 2. MSI 2018: chọn đối thủ bán kết
  await tpl('msi18');
  ok(await boss.inputValue(S(1, 'freshMode')) === 'draw' && /bốc thăm đội đi tiếp gặp đội vào thẳng/.test(await desc()), 'MSI 2018: bốc thăm vòng 2 (đội đi tiếp gặp đội vào thẳng)');
  await boss.click('[data-act="otTplTeams"]'); await sleep(400);
  await boss.click('#otf button.primary.wide'); await sleep(1200);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1500);
  const so = app.hub.otSeedOf(t);
  for (let g = 0; t.stage < 3 && g < 40; g++) {
    const st = t.st[t.stage];
    for (const m of ST.playable(st)) {
      const bo = ST.boOf(st, m), w = so(m.a) < so(m.b);
      await boss.evaluate(([tid, mid, s]) => window.CaroTourKit.O.send({ t: 'otScore', id: tid, match: mid, sets: s }), [id, m.id, Array.from({ length: (bo + 1) / 2 }, () => (w ? [1, 0] : [0, 1]))]);
      for (let k = 0; !m.done && k < 40; k++) await sleep(50);
    }
  }
  ok(t.stage === 3 && t.st[3].entrants.length === 4, 'Sang vòng loại trực tiếp 4 đội');
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(600);
  const btns = await boss.$$eval('[data-act="otPick"]', (bs) => bs.map((b) => b.dataset.uid));
  ok(btns.length === 2 && btns[0] === t.st[3].entrants[2] && btns[1] === t.st[3].entrants[3], 'Hỏi hạt giống 1 chọn đối thủ: 2 nút (hạt giống 3, 4)');
  const s3 = btns[0];
  await boss.click(`[data-act="otPick"][data-uid="${s3}"]`); await sleep(1200);
  ok(t.st[3].picked === s3 && t.st[3].rounds[0].some((mid) => { const m = t.st[3].matches[mid]; return [m.a, m.b].includes(t.st[3].entrants[0]) && [m.a, m.b].includes(s3); }), 'Chọn hạt giống 3: nhánh 1 gặp 3');
  ok(/đã chọn/.test(await boss.textContent('.ot-tab')) && !(await boss.$('[data-act="otPick"]')), 'Ghi lại lựa chọn, hết nút chọn');
  await shot(boss, 'ot-msi18-pick.png');

  // ---------- 3. PGS 2023: dải hạng sau nhóm đi tiếp, đổi cặp bảng sau 6 trận; Thụy Sĩ kiểu CS Major cũ
  await tpl('pgs23');
  ok(await boss.inputValue(S(0, 'rtAfter', 0)) === '1' && await boss.inputValue(S(0, 'rtN', 0)) === '8' && await boss.inputValue(S(0, 'rotBlock')) === '6', 'PGS 2023: 8 đội sau nhóm đi tiếp vào thẳng giai đoạn 3; đổi cặp bảng sau 6 trận');
  ok(/hạng 17–24 vào thẳng giai đoạn 3/.test(await desc()) && /hạng 1–16 đi tiếp giai đoạn 2/.test(await desc()), 'Mô tả: thứ tự dải hạng');
  await tpl('cs_major');
  const pairs = await boss.$$eval(`${S(0, 'pairing')} option`, (os) => os.map((o) => o.value));
  ok(pairs.includes('valve16') && pairs.includes('draw') && pairs.includes('faceit'), 'Thụy Sĩ: có kiểu CS Major trước 11/2023, kiểu 2017 và FACEIT 2018');

  // ---------- 4. Đợt 18: PGC 2021 (vòng tuần), PGC 2022 (sát thương), xếp hạt giống tự động
  await tpl('pgc21');
  ok(await boss.isChecked(S(1, 'wkOn')) && await boss.inputValue(S(1, 'wkWeeks')) === '3' && await boss.inputValue(S(1, 'wkSit')) === '1' && /vòng tuần 3 tuần/.test(await desc()), 'PGC 2021: vòng tuần 3 tuần, hạng 32 nghỉ tuần 1');
  await tpl('pgc22');
  ok(await boss.isChecked(S(0, 'dmg')) && /tổng sát thương/.test(await desc()), 'PGC 2022: nhập tổng sát thương');
  await tpl('cs_major');
  await boss.click('[data-act="otTplTeams"]'); await sleep(400);
  await boss.click('#otf button.primary.wide'); await sleep(1200);
  const sid = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const st2 = app.hub.otGet(sid);
  await boss.click('[data-act="otTab"][data-tab="teams"]').catch(() => {}); await sleep(500);
  await boss.$eval('details.ot-seedtool', (d) => { d.open = true; });
  await boss.fill('#ot-seed-text', 'Đội 32: 2000\nĐội 31: 1990\nĐội XYZ: 5'); await sleep(100);
  await boss.click('[data-act="otSeedApply"]'); await sleep(900);
  ok(st2.players[0].name === 'Đội 32' && st2.players[1].name === 'Đội 31', 'Xếp hạt giống theo điểm xếp hạng: Đội 32 thành hạt giống 1');
  ok(/Không tìm thấy đội: Đội XYZ/.test(await boss.textContent('body')), 'Báo tên đội không khớp');
  await shot(boss, 'ot-seedtool.png');
  await finish();
})();
