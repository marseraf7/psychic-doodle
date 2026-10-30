/*
 * Kiểm thử trình duyệt – kéo thả xếp nhánh giữa hai giai đoạn (như Challonge): Thụy Sĩ → loại trực tiếp, bật "Dừng lại
 * để xếp nhánh"; ban tổ chức đổi chỗ bằng bấm hai ô và bằng kéo thả, Về mặc định, Bắt đầu giai đoạn 2; người chơi thấy
 * dòng "đang xếp nhánh". Bo tự nhập cho cả giai đoạn.
 *   node caro/tests/e2e/tour-arrange.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8807;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'boss', 1280);
  const viewer = await user('vi', 'nguoi_xem', 430);

  await boss.evaluate(() => document.getElementById('open-tours').click()); await sleep(300);
  await boss.click('[data-act="tourNew"]'); await sleep(300);
  await boss.fill('#tf input[name=name]', 'Cúp Xếp Tay');
  await boss.selectOption('#tf select[name=preset]', 'swiss_single'); await sleep(100);
  await boss.selectOption('#tf select[name=preset]', 'custom'); await sleep(100);
  await boss.click('#tf-adv'); await sleep(300);
  await boss.click('.ta-tab[data-tab="format"]'); await sleep(100);
  // Bo tự nhập cho giai đoạn 2
  await boss.selectOption('#ta-stages [data-i="1"][data-k="bestOf"]', 'c'); await sleep(100);
  await boss.fill('#ta-stages [data-i="1"][data-k="bestOfN"]', '9');
  await boss.$eval('#ta-stages [data-i="1"][data-k="bestOfN"]', (e) => e.dispatchEvent(new Event('change', { bubbles: true }))); await sleep(100);
  await boss.fill('#ta-stages [data-i="0"][data-k="advance"]', '4');
  await boss.$eval('#ta-stages [data-i="0"][data-k="advance"]', (e) => e.dispatchEvent(new Event('change', { bubbles: true }))); await sleep(80);
  await boss.fill('#ta-stages [data-i="0"][data-k="rounds"]', '2');
  await boss.$eval('#ta-stages [data-i="0"][data-k="rounds"]', (e) => e.dispatchEvent(new Event('change', { bubbles: true }))); await sleep(80);
  await boss.click('.ta-tab[data-tab="reg"]'); await sleep(80);
  await boss.check('#ta input[name=offline]'); await sleep(80);
  await boss.click('.ta-tab[data-tab="bracket"]'); await sleep(80);
  await boss.check('#ta input[name=arrangeNext]');
  await boss.click('.ta-foot button.primary'); await sleep(800);
  const id = await boss.evaluate(() => window.CaroTourKit.D.tour && window.CaroTourKit.D.tour.id);
  const t = app.hub.tours.get(id);
  ok(t && t.arrangeNext && t.stages[1].bestOf === 9, 'Tạo giải: bật dừng để xếp nhánh, giai đoạn 2 Bo9 (tự nhập)');
  await boss.fill('#bulk-names', 'An\nBình\nChi\nDũng\nGiang\nHà');
  await boss.click('[data-act="bulkAdd"]'); await sleep(500);
  await boss.click('[data-act="start"]'); await sleep(800);
  // Nhập hết giai đoạn Thụy Sĩ
  for (let i = 0; i < 6 && !t.arrange; i++) {
    for (const x of Object.values(t.st[0].matches)) {
      if (x.done || typeof x.a !== 'string' || typeof x.b !== 'string' || x.a === '-' || x.b === '-') continue;
      await boss.evaluate(([tid, mid]) => window.CaroOnline.send({ t: 'tourScore', id: tid, match: mid, sets: [[2, 0]] }), [id, x.id]);
      await sleep(250);
    }
  }
  await sleep(500);
  ok(!!t.arrange && t.st.length === 1, 'Thụy Sĩ xong: dừng chờ xếp nhánh (chưa bốc thăm giai đoạn 2)');
  ok((await boss.$$('#ar-box .ar-slot')).length === 4 && /#\d/.test(await boss.textContent('#ar-box')), 'Ban tổ chức: 4 ô kèm thứ hạng Thụy Sĩ (#1…)');
  await viewer.evaluate((i) => window.CaroTour.open(i), id); await sleep(600);
  ok(/đang xếp nhánh giai đoạn 2/.test(await viewer.textContent('#tour-body')) && !(await viewer.$('#ar-box')), 'Người xem: dòng "đang xếp nhánh", không có khung kéo thả');
  // Bấm hai ô để đổi chỗ (điện thoại)
  const before = [...t.arrange.slots];
  await boss.click('#ar-box [data-ar="1"]'); await sleep(150);
  await boss.click('#ar-box [data-ar="2"]'); await sleep(500);
  ok(t.arrange.slots[1] === before[2] && t.arrange.slots[2] === before[1], 'Bấm ô 2 rồi ô 3: đổi chỗ, lưu lên máy chủ');
  // Kéo thả (máy tính)
  await boss.dragAndDrop('#ar-box [data-ar="0"]', '#ar-box [data-ar="3"]'); await sleep(500);
  ok(t.arrange.slots[0] === before[3] && t.arrange.slots[3] === before[0], 'Kéo ô 1 thả lên ô 4: đổi chỗ');
  await shot(boss, 'arrange.png');
  await boss.click('[data-act="arrReset"]'); await sleep(500);
  ok(String(t.arrange.slots) === String(before), 'Về mặc định');
  await boss.click('#ar-box [data-ar="0"]'); await sleep(150);
  await boss.click('#ar-box [data-ar="1"]'); await sleep(400);
  const want = [...t.arrange.slots];
  await boss.click('[data-act="arrGo"]'); await sleep(800);
  const r0 = t.st[1] && t.st[1].rounds[0].map((mid) => [t.st[1].matches[mid].a, t.st[1].matches[mid].b]).flat();
  ok(!t.arrange && String(r0) === String(want), 'Bắt đầu giai đoạn 2: vòng 1 đúng thứ tự đã xếp');
  ok(!(await boss.$('#ar-box')), 'Khung xếp nhánh đóng lại');
  await finish();
})();
