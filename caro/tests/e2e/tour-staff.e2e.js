/*
 * Kiểm thử trình duyệt – Đợt 5: đồng ban tổ chức theo quyền (chủ giải thêm theo tên đăng nhập, tick quyền; người được
 * giao chỉ thấy khu của mình), giải riêng tư (người ngoài mở link không được), ẩn hạt giống, nhãn vòng tuỳ biến.
 *   node caro/tests/e2e/tour-staff.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8797;
  const { user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'boss', 1280);
  const helper = await user('vi', 'tro_ly', 1280);
  const guest = await user('vi', 'nguoi_ngoai', 430);
  const tour = (p) => p.evaluate(() => window.CaroTourKit.D.tour);

  // ---------------------------------------------------------------- Chủ giải: giải riêng tư, ẩn hạt giống
  await boss.evaluate(() => document.getElementById('open-tours').click()); await sleep(300);
  await boss.click('[data-act="tourNew"]'); await sleep(300);
  await boss.fill('#tf input[name=name]', 'Giải Kín');
  await boss.selectOption('#tf select[name=preset]', 'custom'); await sleep(100);
  await boss.click('#tf-adv'); await sleep(300);
  await boss.click('.ta-tab[data-tab="access"]'); await sleep(100);
  await boss.check('#ta input[name=access][value=private]');
  await boss.click('.ta-tab[data-tab="bracket"]'); await sleep(100); // "Ẩn số hạt giống" ở tab Nhánh đấu (như Challonge)
  await boss.check('#ta input[name=hideSeeds]');
  await boss.click('.ta-tab[data-tab="reg"]'); await sleep(100);
  await boss.uncheck('#ta input[name=checkin]');
  await boss.click('.ta-foot button.primary'); await sleep(800);
  let t = await tour(boss);
  ok(t && t.access === 'private' && t.hideSeeds, 'Tạo giải riêng tư, ẩn hạt giống');
  const id = t.id;
  // Người ngoài: mở link không thấy giải
  await guest.evaluate((i) => window.CaroTour.open(i), id); await sleep(700);
  ok(await guest.evaluate(() => window.CaroTourKit.V.page) === 'tours', 'Người ngoài mở link giải riêng tư: không vào được');

  // ---------------------------------------------------------------- Thêm đồng ban tổ chức chỉ có quyền "Kết quả"
  await boss.check('input[name="tourtab"][value="manage"]'); await sleep(250);
  ok(await boss.isVisible('.staff-add'), 'Chủ giải thấy khu Ban tổ chức');
  await boss.fill('#staff-user', 'tro_ly');
  await boss.click('[data-act="staffAdd"]'); await sleep(500);
  t = await tour(boss);
  ok(t.staff.length === 1 && t.staff[0].perms.join() === 'results', 'Thêm đồng ban tổ chức @tro_ly với quyền Kết quả');
  // Đổi quyền: thêm Thông báo
  await boss.check('.staff-row [data-perm="news"]'); await sleep(500);
  ok((await tour(boss)).staff[0].perms.includes('news'), 'Tick thêm quyền Thông báo: lưu ngay');
  // Nhãn vòng
  await boss.fill('.sched-row[data-key="0:0"] [data-f="label"]', 'Vòng sơ loại');
  await boss.click('.sched-row[data-key="0:0"] [data-act="schedSave"]'); await sleep(400);
  await shot(boss, 'staff-owner.png');

  // ---------------------------------------------------------------- Đồng ban tổ chức: chỉ thấy phần được giao
  await helper.evaluate((i) => window.CaroTour.open(i), id); await sleep(700);
  ok(await helper.evaluate(() => window.CaroTourKit.V.page) === 'tour', 'Đồng ban tổ chức mở được giải riêng tư');
  ok(!(await helper.$('[data-act="start"]')) && !(await helper.$('[data-act="cancel"]')), 'Đồng ban tổ chức không có nút Bắt đầu / Huỷ giải');
  await helper.check('input[name="tourtab"][value="manage"]'); await sleep(250);
  ok(await helper.isVisible('#news-text'), 'Có quyền Thông báo: thấy khu đăng thông báo');
  ok(!(await helper.$('.staff-add')) && !(await helper.$('#seed-list')) && !(await helper.$('[data-act="mgSettings"]')), 'Không thấy phân quyền, hạt giống, cài đặt (không được giao)');
  await helper.fill('#news-text', 'Trọng tài: anh Tú');
  await helper.click('[data-act="newsPost"]'); await sleep(500);
  ok((await tour(boss)).news.some((n) => /anh Tú/.test(n.text)), 'Đồng ban tổ chức đăng thông báo được');
  await shot(helper, 'staff-helper.png');
  // Gỡ quyền: hết thấy giải
  await boss.click('[data-act="staffDel"]'); await sleep(600);
  await helper.evaluate(() => { const d = document.getElementById('tour-dlg'); if (d.open) d.close(); });
  await helper.evaluate((i) => window.CaroTour.open(i), id); await sleep(700);
  ok(await helper.evaluate(() => window.CaroTourKit.V.page) === 'tours', 'Bị gỡ khỏi ban tổ chức: không vào giải riêng tư được nữa');
  ok(/Vòng sơ loại/.test(JSON.stringify((await tour(boss)).schedule)), 'Nhãn vòng đã lưu');
  await finish();
})();
