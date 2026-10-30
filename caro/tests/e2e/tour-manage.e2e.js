/*
 * Kiểm thử trình duyệt – Đợt 4: tab Quản lý của ban tổ chức (checklist, hạt giống & cặp vòng 1, bốc thăm, lịch theo vòng,
 * thông báo, sửa cài đặt qua trang nâng cao, tạm dừng / chơi tiếp, đặt lại, nhật ký, xoá) và lưu nháp → gửi duyệt.
 *   node caro/tests/e2e/tour-manage.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8796;
  const { user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'boss', 1280);
  const tour = () => boss.evaluate(() => window.CaroTourKit.D.tour);
  const openNew = async () => {
    await boss.evaluate(() => { const d = document.getElementById('tour-dlg'); if (d.open) d.close(); });
    await boss.evaluate(() => document.getElementById('open-tours').click()); await sleep(300);
    await boss.click('[data-act="tourNew"]'); await sleep(300);
  };
  const manageTab = async () => { await boss.check('input[name="tourtab"][value="manage"]'); await sleep(250); };
  const viewTab = async () => { await boss.check('input[name="tourtab"][value="view"]'); await sleep(250); };

  // ---------------------------------------------------------------- Giải offline 4 người
  await openNew();
  await boss.fill('#tf input[name=name]', 'Giải Quản Trị');
  await boss.selectOption('#tf select[name=preset]', 'single'); await sleep(100);
  await boss.check('#tf input[name=offline]');
  await boss.click('#tf button.primary'); await sleep(800);
  await boss.fill('#bulk-names', 'An\nBình\nChi\nDũng');
  await boss.click('[data-act="bulkAdd"]'); await sleep(500);
  ok(await boss.isVisible('input[name="tourtab"][value="manage"]'), 'Ban tổ chức có tab Tổng quan / Quản lý');
  await manageTab();
  ok(await boss.isVisible('.checklist'), 'Tab Quản lý: có checklist');
  ok(await boss.$eval('.checklist li:nth-child(2)', (e) => e.classList.contains('ok')), 'Checklist: đủ người chơi ✓');
  // Hạt giống: đổi thứ tự, xem trước cặp vòng 1, lưu
  const names = () => boss.$$eval('#seed-list li b', (x) => x.map((e) => e.textContent));
  ok(JSON.stringify(await names()) === JSON.stringify(['An', 'Bình', 'Chi', 'Dũng']), 'Hạt giống ban đầu theo thứ tự thêm');
  await boss.click('#seed-list li:nth-child(1) [data-d="1"]'); await sleep(200);
  ok(JSON.stringify(await names()) === JSON.stringify(['Bình', 'An', 'Chi', 'Dũng']), 'Nút ↓: An xuống hạt giống 2');
  ok(/1\. Bình\s*vs\s*4\. Dũng/.test(await boss.textContent('.pairs')), 'Cặp vòng 1 xem trước: 1. Bình vs 4. Dũng');
  await boss.click('[data-act="seedSave"]'); await sleep(400);
  ok(JSON.stringify((await tour()).seedPlan) !== 'null' && (await tour()).seedPlan.length === 4, 'Lưu hạt giống: máy chủ giữ thứ tự');
  await boss.click('[data-act="seedShuffle"]'); await sleep(200);
  ok((await names()).length === 4 && await boss.isEnabled('[data-act="seedSave"]'), 'Bốc thăm ngẫu nhiên: xáo lại, chờ Lưu');
  await shot(boss, 'manage-seeds.png');
  // Bỏ bốc thăm vừa xáo: dùng thứ tự đã lưu
  await viewTab(); await manageTab();
  // Lịch vòng 1
  // Ô ngày giờ: ngày dạng 29/10/2026, giờ 24h (không phụ thuộc ngôn ngữ trình duyệt), không bị cắt chữ
  const dd = await boss.evaluate(() => { const d = new Date(Date.now() + 86400000); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; });
  await boss.fill('.sched-row[data-key="0:0"] .dt-d', dd.slice(0, 5)); // gõ "29/10" (không cần năm)
  await boss.fill('.sched-row[data-key="0:0"] .dt-t', '9:5');
  await boss.press('.sched-row[data-key="0:0"] .dt-t', 'Tab'); await sleep(100);
  ok(await boss.$eval('.sched-row[data-key="0:0"] .dt-d', (e) => e.value) === dd && await boss.$eval('.sched-row[data-key="0:0"] .dt-t', (e) => e.value) === '09:05', 'Ô ngày giờ chuẩn hoá: "' + dd.slice(0, 5) + '" + "9:5" → ' + dd + ' 09:05');
  const fits = await boss.$$eval('.sched-row .dt-d, .sched-row .dt-t', (x) => x.every((e) => e.scrollWidth <= e.clientWidth + 1));
  ok(fits, 'Ô ngày / giờ của lịch đủ rộng, không bị cắt chữ');
  await boss.fill('.sched-row[data-key="0:0"] [data-f="place"]', 'Phòng 204');
  await boss.click('.sched-row[data-key="0:0"] [data-act="schedSave"]'); await sleep(400);
  const sch = (await tour()).schedule['0:0'];
  await (await boss.$('.sched')).screenshot({ path: require('path').join(process.env.E2E_OUT || require('os').tmpdir(), 'manage-sched-1280.png') });
  ok(sch.place === 'Phòng 204' && new Date(sch.at).getHours() === 9 && new Date(sch.at).getMinutes() === 5, 'Lịch vòng 1: lưu giờ 09:05 + địa điểm');
  // Thông báo
  await boss.fill('#news-text', 'Mang theo thẻ học sinh');
  await boss.click('[data-act="newsPost"]'); await sleep(400);
  await viewTab();
  ok(/Mang theo thẻ học sinh/.test(await boss.textContent('.news')), 'Thông báo ghim hiện ở Tổng quan');
  // Sửa cài đặt qua trang nâng cao
  await manageTab();
  await boss.click('[data-act="mgSettings"]'); await sleep(400);
  ok(/Sửa cài đặt giải/.test(await boss.textContent('#tour-title')), 'Mở trang nâng cao ở chế độ sửa');
  ok(await boss.$eval('#ta input[name=name]', (e) => e.value) === 'Giải Quản Trị' && await boss.isChecked('#ta input[name=offline]'), 'Trang sửa nạp đúng cài đặt hiện tại');
  await boss.fill('#ta input[name=name]', 'Giải Quản Trị Mới');
  await boss.fill('#ta input[name=desc]'.replace('input', 'textarea'), 'Điều lệ: Bo3, luân lưu khi hoà');
  await boss.click('.ta-foot button.primary'); await sleep(800);
  let t = await tour();
  ok(t && t.name === 'Giải Quản Trị Mới' && /luân lưu/.test(t.desc) && t.players.length === 4, 'Lưu thay đổi: về trang giải, giữ người chơi');
  // Bắt đầu: hạt giống theo bản đã lưu, lịch hiện trên nhánh đấu
  await boss.click('[data-act="start"]'); await sleep(800);
  t = await tour();
  ok(t.status === 'running' && t.players.find((p) => p.seed === 1).name === 'Bình', 'Bắt đầu: Bình là hạt giống 1 như đã xếp');
  await viewTab();
  ok(/Phòng 204/.test(await boss.textContent('.bracket')), 'Nhánh đấu hiện giờ / địa điểm vòng 1');
  // Tạm dừng / chơi tiếp / đặt lại
  await manageTab();
  ok(/chỉ còn sửa được tên/.test(await boss.textContent('#tour-body')), 'Đang đấu: cài đặt chỉ còn tên và giới thiệu');
  await boss.click('[data-act="mgHold"][data-v="1"]'); await sleep(400);
  ok((await tour()).held, 'Tạm dừng giải');
  await viewTab();
  ok(/tạm dừng/.test(await boss.textContent('#tour-body')), 'Tổng quan ghi "đang tạm dừng"');
  await manageTab();
  await boss.click('[data-act="mgHold"][data-v="0"]'); await sleep(400);
  ok(!(await tour()).held, 'Chơi tiếp');
  await boss.click('[data-act="mgReset"]'); await sleep(600);
  ok((await tour()).status === 'scheduled', 'Đặt lại: giải về trước khi bắt đầu');
  const log = await boss.textContent('.mg-log');
  ok(/Tạo giải/.test(log) && /Thêm 4 người chơi/.test(log) && /Xếp hạt giống thủ công/.test(log) && /Đặt lại giải/.test(log), 'Nhật ký ghi đủ: tạo, thêm người, hạt giống, đặt lại');
  await shot(boss, 'manage-log.png');
  // Xoá (gõ đúng tên)
  const id = (await tour()).id;
  await boss.evaluate(([i]) => window.CaroOnline.send({ t: 'tourDelete', id: i, confirm: 'Giải Quản Trị Mới' }), [id]); await sleep(600);
  ok(await boss.evaluate(() => window.CaroTourKit.V.page) === 'tours', 'Xoá giải: về danh sách giải');

  // ---------------------------------------------------------------- Lưu nháp → gửi duyệt
  await openNew();
  await boss.fill('#tf input[name=name]', 'Giải Nháp');
  await boss.selectOption('#tf select[name=preset]', 'custom'); await sleep(100);
  await boss.click('#tf-adv'); await sleep(300);
  await boss.click('[data-act="tourSaveDraft"]'); await sleep(800);
  t = await tour();
  ok(t && t.status === 'draft', 'Lưu nháp: giải ở trạng thái nháp');
  ok(/chỉ bạn thấy/.test(await boss.textContent('#tour-body')), 'Trang giải nháp: ghi chú "chỉ bạn thấy"');
  await boss.click('[data-act="mgSubmit"]'); await sleep(600);
  ok((await tour()).status === 'scheduled', 'Gửi duyệt (quản trị viên): mở đăng ký luôn');
  // Điện thoại
  await boss.setViewportSize({ width: 360, height: 800 }); await sleep(200);
  await manageTab();
  const fits360 = await boss.$$eval('.sched-row .dt-d, .sched-row .dt-t', (x) => x.length > 0 && x.every((e) => e.scrollWidth <= e.clientWidth + 1 && e.getBoundingClientRect().right <= innerWidth));
  ok(fits360, '360 px: ô ngày / giờ không bị cắt, nằm trong màn hình');
  await (await boss.$('.sched')).screenshot({ path: require('path').join(process.env.E2E_OUT || require('os').tmpdir(), 'manage-sched-360.png') });
  ok(await boss.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '360 px: tab Quản lý không tràn ngang');
  await shot(boss, 'manage-360.png');
  await finish();
})();
