/*
 * Kiểm thử trình duyệt – thách đấu kiểu America's Cup (đợt 2): mẫu đua thuyền → form có loại trực tiếp làm giai đoạn giữa
 * (đi tiếp 1) và đội giữ cúp vào thẳng giai đoạn cuối; ước tính 20 + 3 + 1 trận; bắt đầu: đội giữ cúp không đá vòng loại;
 * chi tiết race: bên vào sân (mạn trái / phải), thời gian về đích, cách biệt; không có ô cấm chọn.
 *   node caro/tests/e2e/otour-cup.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');
const ST = require('../../../server/src/hub/stages.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8836;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'ban_thuyen', 1100);
  const tab = (k) => boss.click(`[data-act="otTab"][data-tab="${k}"]`).then(() => sleep(400));
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.click('.tpl-card[data-id="americas_cup"]'); await sleep(300);
  ok(await boss.$eval('#otf select[name=sport]', (e) => e.value) === 'sailing', 'Mẫu America’s Cup: bộ môn đua thuyền');
  ok(await boss.$eval('#otf-stages [data-i="1"][data-k="type"]', (e) => e.value) === 'single' && await boss.$eval('#otf-stages [data-i="1"][data-k="advance"]', (e) => e.value) === '1', 'Giai đoạn 2: loại trực tiếp, 1 đội đi tiếp');
  ok(await boss.$eval('#otf-stages [data-i="2"][data-k="direct"]', (e) => e.value) === '1' && /\+ 1 đội vào thẳng/.test(await boss.textContent('#otf-stages .flow')), 'Giai đoạn 3: đội giữ cúp vào thẳng');
  ok(/đội giữ cúp/.test(await boss.textContent('.tpl-desc')), 'Có mô tả bằng lời');
  await boss.click('[data-act="otTplTeams"]'); await sleep(300);
  ok(/Khoảng 24 trận/.test(await boss.textContent('#otf-est')), 'Ước tính 20 + 3 + 1 = 24 trận');
  await shot(boss, 'ot-cup-form.png');
  await boss.click('#otf button.primary.wide'); await sleep(900);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  ok(t && t.esports && t.esports.sides === 'ps' && t.esports.draft === 'off', 'Tạo giải: chi tiết race kiểu đua thuyền');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1200);
  ok(t.st[0].entrants.length === 5 && !t.st[0].entrants.includes(t.players[0].uid), 'Đội giữ cúp không đá vòng loại');
  // Mở một trận vòng tròn, nhập chi tiết race 1
  const m = Object.values(t.st[0].matches)[0];
  await tab('stages');
  await boss.$$eval('details.fold', (ds) => ds.forEach((d) => { d.open = true; })); await sleep(300);
  await boss.click(`.scorable[data-mid="${m.id}"]`); await sleep(400);
  await boss.click('[data-act="otGameEdit"][data-i="0"]'); await sleep(400);
  const txt = await boss.textContent('#otg-edit');
  ok(/Thuyền vào từ mạn trái/.test(txt) && /Thời gian về đích/.test(txt) && !(await boss.$('#otg-edit .dr-step')) && !/Vàng theo thời gian/.test(txt), 'Khung race: bên vào sân, thời gian về đích; không cấm chọn, không vàng');
  await boss.fill('#otg-edit [data-gk="st.blue.finish"]', '1684');
  await boss.fill('#otg-edit [data-gk="st.red.finish"]', '1702');
  await boss.fill('#otg-edit [data-gk="dur"]', '28:22');
  await boss.click('[data-act="otGameSave"]'); await sleep(800);
  ok(m.esp && m.esp[0] && m.esp[0].st.red.finish === 1702, 'Lưu chi tiết race');
  ok(/Cách biệt về đích: 18 giây/.test(await boss.textContent('.esp-games')) && /Vào từ mạn trái/.test(await boss.textContent('.esp-games')) && /Race 1/.test(await boss.textContent('.esp-games')), 'Thẻ race: "Race 1", cách biệt 18 giây, nhãn mạn trái');
  ok(!/Diễn biến trận/.test(await boss.textContent('.score-panel')), 'Đua thuyền: không có diễn biến kiểu bóng đá (ghi điểm, thẻ)');
  await boss.$eval('.esp-game', (e) => e.scrollIntoView()).catch(() => {}); await sleep(200);
  await shot(boss, 'ot-cup-race.png');
  // Đấu nhanh vòng tròn + vòng loại → trận tranh cúp có đội giữ cúp
  const seedOf = app.hub.otSeedOf(t);
  for (const x of Object.values(t.st[0].matches)) if (!x.done) ST.recordResult(t.st[0], x, seedOf(x.a) < seedOf(x.b) ? x.a : x.b, { seedOf, isActive: () => true });
  await boss.evaluate(([tid]) => window.CaroTourKit.O.send({ t: 'otGet', id: tid }), [id]);
  app.hub.otNextStage(t);
  for (let g = 0; t.stage === 1 && g < 4; g++) {
    for (const x of ST.playable(t.st[1])) {
      const bo = ST.boOf(t.st[1], x), w = seedOf(x.a) < seedOf(x.b);
      await boss.evaluate(([tid, mid, s]) => window.CaroTourKit.O.send({ t: 'otScore', id: tid, match: mid, sets: s }), [id, x.id, Array.from({ length: (bo + 1) / 2 }, () => (w ? [1, 0] : [0, 1]))]);
      await sleep(400);
    }
  }
  ok(t.st[2] && t.st[2].entrants[0] === t.players[0].uid && t.st[2].entrants.length === 2 && ST.boOf(t.st[2], Object.values(t.st[2].matches)[0]) === 13, 'Trận tranh cúp Bo13: đội giữ cúp gặp đội thắng vòng loại');
  await finish();
})();
