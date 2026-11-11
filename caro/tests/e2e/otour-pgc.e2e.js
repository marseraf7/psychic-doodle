/*
 * Kiểm thử trình duyệt – đợt 14: thể thức kiểu PGC 2019 / 2022 (chỉ mô phỏng thể thức).
 *   1. Mẫu kiểu PGC 2022: 6 giai đoạn (hết chỗ thêm), các dải hạng vào thẳng giai đoạn sau nữa (8 đội → giai đoạn 4,
 *      7 đội → giai đoạn 5), cổng thắng trận + đội vào thẳng đứng cuối hàng chờ; mô tả bằng lời; bỏ một dải hạng.
 *   2. Tạo + chạy tới Grand Survival: trang giải có nhãn "Vào thẳng giai đoạn n", ghi chú cổng thắng trận, chỉ trận kế
 *      tiếp có khung nhập (16 đội), lưu xong có nhãn đội thắng trận và phòng đấu trận sau không còn đội đó.
 *   3. Mẫu kiểu PGC 2019: chỉ số phụ PUBG cũ, mang điểm, xoay vòng – đổi sang 4 bảng.
 *   4. Đợt 15 – mẫu kiểu PGC 2024: hệ Circuit (form, mô tả, trang giải: tên trận theo vòng / ngày, đội của ngày 1).
 *   5. Đợt 18 – mẫu kiểu PGC 2021: vòng tuần (tên trận theo tuần, Survival 16 đội, hạt giống cuối nghỉ tuần 1).
 *   node caro/tests/e2e/otour-pgc.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');
const Race = require('../../../server/src/hub/stages-race.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8844;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_pgc', 1100);
  const S = (i, k, n) => `#otf-stages [data-i="${i}"][data-k="${k}"]${n != null ? `[data-n="${n}"]` : ''}`;
  const desc = () => boss.textContent('#otf-desc');

  // ---------- 1. Form mẫu kiểu PGC 2022
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.click('.tpl-card[data-id="pgc22"]'); await sleep(500);
  ok(await boss.$$eval('#otf-stages .stage-card', (xs) => xs.length) === 6 && !(await boss.$('#otf-stages [data-sact="add"]')), 'Mẫu kiểu PGC 2022: 6 giai đoạn, hết chỗ thêm');
  ok(await boss.inputValue(S(1, 'rtN', 0)) === '8' && await boss.inputValue(S(1, 'rtTo', 0)) === '3'
    && await boss.inputValue(S(1, 'rtN', 1)) === '7' && await boss.inputValue(S(1, 'rtTo', 1)) === '4', 'Nhánh thua 1: 8 đội → giai đoạn 4, 7 đội → giai đoạn 5');
  ok(await boss.inputValue(S(1, 'advance')) === '0', 'Nhánh thua 1: 0 đội đi tiếp giai đoạn kế');
  ok(await boss.isChecked(S(4, 'gateOn')) && await boss.inputValue(S(4, 'gateSeats')) === '16' && await boss.isChecked(S(4, 'directLast')), 'Grand Survival: cổng thắng trận 16 đội, đội vào thẳng đứng cuối hàng chờ');
  const d0 = await desc();
  ok(/hạng 9–15 vào thẳng giai đoạn 5/.test(d0) && /hạng 1–8 mỗi bảng vào thẳng giai đoạn 3/.test(d0) && /cổng thắng trận: mỗi trận 16 đội/.test(d0), 'Mô tả bằng lời: dải hạng, cổng thắng trận');
  ok(/8 đội vào thẳng giai đoạn 4/.test(await boss.textContent('#otf-stages .flow')), 'Sơ đồ: dải hạng vào thẳng');
  await boss.$eval(S(1, 'rtN', 0), (el) => el.scrollIntoView({ block: 'center' })); await sleep(200);
  await shot(boss, 'ot-pgc22-form.png');
  await boss.fill(S(1, 'rtN', 1), '0'); await boss.press(S(1, 'rtN', 1), 'Tab'); await sleep(300);
  ok(!/hạng 9–15/.test(await desc()) && !(await boss.$(S(1, 'rtN', 2))), 'Bỏ một dải hạng');
  await boss.click('.tpl-card[data-id="pgc22"]').catch(() => {}); await sleep(300);
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.click('.tpl-card[data-id="pgc22"]'); await sleep(500);
  await boss.click('[data-act="otTplTeams"]'); await sleep(400);
  await boss.click('#otf button.primary.wide'); await sleep(1200);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  ok(t && t.stages.length === 6 && t.players.length === 32 && t.stages[4].gate && t.stages[1].routes.length === 2, 'Tạo giải 32 đội, 6 giai đoạn');

  // ---------- 2. Chạy tới Grand Survival (gửi kết quả qua kết nối của trình duyệt)
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1500);
  const so = app.hub.otSeedOf(t);
  for (let g = 0; t.stage < 4 && g < 80; g++) {
    const st = t.st[t.stage], ev = st.events.find((e) => !e.done);
    const rows = Race.lobby(st, ev.i).slice().sort((a, b) => so(a) - so(b)).map((uid, k) => ({ uid, rank: k + 1 }));
    await boss.evaluate(([tid, i, r]) => window.CaroTourKit.O.send({ t: 'otRace', id: tid, event: i, rows: r }), [id, ev.i, rows]);
    for (let w = 0; !ev.done && w < 50; w++) await sleep(50);
  }
  ok(t.stage === 4 && t.st[4].entrants.length === 19, 'Sang Grand Survival: 19 đội');
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(600);
  const body = await boss.textContent('.ot-tab');
  ok(/Vào thẳng giai đoạn 5/.test(body) && /Vào thẳng giai đoạn 4/.test(body), 'Nhãn "Vào thẳng giai đoạn n"');
  ok(/Cổng thắng trận: mỗi trận 16 đội/.test(body), 'Ghi chú cổng thắng trận');
  ok(await boss.$$eval('.race-form', (fs) => fs.length) === 1 && await boss.$$eval('.race-form tr[data-uid]', (trs) => trs.length) === 16, 'Chỉ trận kế tiếp có khung nhập, 16 đội');
  const first = await boss.$eval('.race-form tr[data-uid]', (tr) => tr.dataset.uid);
  await boss.click('[data-act="otRaceFill"]'); await sleep(200);
  await boss.click('.race-form button.primary'); await sleep(1000);
  ok(t.st[4].events[0].done && Race.gateWinners(t.st[4])[0] === first, 'Lưu trận 1: đội về nhất thắng trận');
  const body2 = await boss.textContent('.ot-tab');
  ok(/Thắng trận:/.test(body2), 'Nhãn đội thắng trận');
  ok(!(await boss.$$eval('.race-form tr[data-uid]', (trs) => trs.map((x) => x.dataset.uid))).includes(first) && await boss.$$eval('.race-form tr[data-uid]', (trs) => trs.length) === 16, 'Trận 2: đội thắng rời phòng, đội kế tiếp vào thay');
  await shot(boss, 'ot-pgc22-gate.png');

  // ---------- 3. Mẫu kiểu PGC 2019
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.click('.tpl-card[data-id="pgc19"]'); await sleep(500);
  ok(await boss.inputValue(S(0, 'tb')) === 'pubg_k' && await boss.isChecked(S(1, 'carry')) && await boss.isChecked(S(2, 'rot')) && await boss.inputValue(S(2, 'rotN')) === '3', 'PGC 2019: chỉ số phụ PUBG cũ, mang điểm, 3 bảng xoay vòng');
  ok(/mang nguyên điểm giai đoạn trước/.test(await desc()) && /kiểu PUBG cũ/.test(await desc()), 'Mô tả: mang điểm, PUBG cũ');
  await boss.fill(S(2, 'rotN'), '4'); await boss.press(S(2, 'rotN'), 'Tab'); await sleep(300);
  ok(/4 bảng xoay vòng/.test(await desc()), 'Đổi sang 4 bảng xoay vòng');
  await shot(boss, 'ot-pgc19-form.png');

  // ---------- 4. Đợt 15 – mẫu kiểu PGC 2024: hệ Circuit
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.click('.tpl-card[data-id="pgc24"]'); await sleep(500);
  ok(await boss.isChecked(S(0, 'ciOn')) && await boss.inputValue(S(0, 'ciN')) === '3' && await boss.inputValue(S(0, 'ciKeep')) === '12' && await boss.inputValue(S(0, 'ciLate')) === '4 4'
    && !(await boss.$(S(0, 'groups'))) && !(await boss.$(S(0, 'gateOn'))), 'PGC 2024: hệ Circuit 3 vòng, giữ 12, vào muộn 4 4; không có ô chia bảng / cổng thắng trận');
  ok(/hệ Circuit 3 vòng × 3 ngày × 6 trận/.test(await desc()), 'Mô tả: hệ Circuit');
  await boss.click('[data-act="otTplTeams"]'); await sleep(400);
  await boss.click('#otf button.primary.wide'); await sleep(1200);
  const cid = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const ct = app.hub.otGet(cid);
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1500);
  ok(ct.status === 'running' && ct.st[0].events.length === 54, 'Bắt đầu: 54 trận (3 vòng × 3 ngày × 6)');
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(600);
  const ctxt = await boss.textContent('.ot-tab');
  ok(/Hệ Circuit: 3 vòng × 3 ngày/.test(ctxt) && /Circuit 1 · Ngày 1 · Chặng 1/.test(ctxt), 'Trang giải: ghi chú hệ Circuit, tên trận theo vòng / ngày');
  const who = await boss.$$eval('.race-form tr[data-uid]', (trs) => trs.map((x) => x.dataset.uid));
  ok(who.length === 16 && !who.includes(ct.players[0].uid), 'Ngày 1: 16 đội, chưa có hạt giống 1');
  await boss.click('[data-act="otRaceFill"]'); await sleep(200);
  await boss.click('.race-form button.primary'); await sleep(1000);
  ok(ct.st[0].events[0].done && /Bảng chung: cộng điểm các ngày Final/.test(await boss.textContent('.ot-tab')), 'Lưu trận 1; bảng chung + bảng ngày');
  await shot(boss, 'ot-pgc24.png');

  // ---------- 5. Đợt 18 – mẫu kiểu PGC 2021: vòng tuần
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.click('.tpl-card[data-id="pgc21"]'); await sleep(500);
  await boss.click('[data-act="otTplTeams"]'); await sleep(400);
  await boss.click('#otf button.primary.wide'); await sleep(1200);
  const wid = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const wt = app.hub.otGet(wid);
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1500);
  const wso = app.hub.otSeedOf(wt);
  for (let g = 0; wt.stage < 1 && g < 40; g++) {
    const st = wt.st[wt.stage], ev = st.events.find((e) => !e.done);
    const rows = Race.lobby(st, ev.i).slice().sort((a, b) => wso(a) - wso(b)).map((uid, k) => ({ uid, rank: k + 1 }));
    await boss.evaluate(([tid, i, r]) => window.CaroTourKit.O.send({ t: 'otRace', id: tid, event: i, rows: r }), [wid, ev.i, rows]);
    for (let w = 0; !ev.done && w < 50; w++) await sleep(50);
  }
  ok(wt.stage === 1 && wt.st[1].events.length === 90, 'Sang vòng tuần: 90 trận');
  await boss.click('[data-act="otTab"][data-tab="stages"]'); await sleep(600);
  const wtxt = await boss.textContent('.ot-tab');
  ok(/Vòng tuần: 3 tuần/.test(wtxt) && /Tuần 1 · Survival · Chặng 1/.test(wtxt), 'Trang giải: ghi chú vòng tuần, tên trận theo tuần');
  const wrows = await boss.$$eval('.race-form tr[data-uid]', (trs) => trs.map((x) => x.dataset.uid));
  ok(wrows.length === 16 && !wrows.includes(wt.st[1].entrants[31]), 'Survival tuần 1: 16 đội, hạt giống cuối nghỉ');
  await boss.click('[data-act="otRaceFill"]'); await sleep(200);
  await boss.click('.race-form button.primary'); await sleep(1000);
  ok(wt.st[1].events[0].done && /Thắng trận:/.test(await boss.textContent('.ot-tab')), 'Lưu trận Survival 1: có đội thắng');
  await shot(boss, 'ot-pgc21.png');
  await finish();
})();
