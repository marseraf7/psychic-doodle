/*
 * Kiểm thử trình duyệt – mô tả có định dạng (như Challonge) ở CLB và mục "Giới thiệu" của trang cá nhân:
 * thanh công cụ ở form tạo CLB / Quản lý CLB, hiện đúng định dạng, mô tả riêng chỉ thành viên thấy, không chèn được mã;
 * hồ sơ: chính chủ Sửa → Lưu, người khác thấy phần giới thiệu.
 *   node caro/tests/e2e/rich-desc.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8808;
  const { app, user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'boss', 1100);
  const an = await user('vi', 'an_xem', 430);

  // ---------------------------------------------------------------- CLB: tạo với mô tả có định dạng
  await boss.evaluate(() => document.getElementById('open-clubs').click()); await sleep(400);
  await boss.click('[data-act="clubNew"]'); await sleep(200);
  ok(!!(await boss.$('#cf .rt-ed .rt-bar')), 'Form tạo CLB: mô tả có thanh định dạng');
  await boss.fill('#cf input[name=name]', 'CLB Định Dạng');
  await boss.fill('#cf textarea[name=desc]', 'Sinh hoạt tối thứ 7');
  await boss.$eval('#cf textarea[name=desc]', (e) => e.setSelectionRange(0, e.value.length));
  await boss.click('#cf .rt-bold'); await sleep(80);
  await boss.$eval('#cf textarea[name=desc]', (e) => { e.value += '\n- Bàn 1\n- Bàn 2\n<img src=x onerror=alert(1)>'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await boss.click('#cf button.primary'); await sleep(600);
  const c = await boss.evaluate(() => window.CaroTourKit.D.club);
  ok(c && /^\*\*Sinh hoạt tối thứ 7\*\*\n- Bàn 1/.test(c.desc), 'Máy chủ giữ xuống dòng và đánh dấu');
  ok(await boss.$eval('#tour-body .tdesc.rich', (e) => !!e.querySelector('b') && e.querySelectorAll('li').length === 2 && !e.querySelector('img')),
    'Trang CLB: chữ đậm + danh sách, thẻ <img> người dùng gõ chỉ hiện thành chữ');
  // Quản lý CLB: cả mô tả và mô tả riêng đều có thanh định dạng
  await boss.click('[data-act="clubAdmin"]'); await sleep(400);
  ok((await boss.$$('#tour-body .rt-ed')).length === 2, 'Quản lý CLB: mô tả + mô tả riêng có thanh định dạng');
  await boss.fill('#tour-body textarea[name=privDesc]', '## Lịch tập\n*Chỉ thành viên*');
  await boss.click('#tour-body form button.primary'); await sleep(500);
  ok(/## Lịch tập/.test(app.hub.clubs.get(c.id).privDesc), 'Lưu mô tả riêng có định dạng');
  await an.evaluate((i) => window.CaroTour.openClub(i), c.id); await sleep(500);
  ok(!/Lịch tập/.test(await an.textContent('#tour-body')) && /Sinh hoạt/.test(await an.textContent('#tour-body')), 'Người ngoài: thấy mô tả, không thấy mô tả riêng');
  await shot(boss, 'rich-club.png');

  // ---------------------------------------------------------------- Hồ sơ: Giới thiệu
  await boss.evaluate(() => { document.getElementById('tour-dlg').close(); window.CaroProfile.open(window.CaroOnline.state.me.id.replace(/^u_/, '')); }); await sleep(600);
  ok(/Chưa có giới thiệu/.test(await boss.textContent('#profile-body .pf-bio')), 'Hồ sơ của mình: mục Giới thiệu trống + nút Sửa');
  await boss.click('#profile-body [data-bio="edit"]'); await sleep(200);
  ok(!!(await boss.$('#bio-form .rt-bar')), 'Sửa giới thiệu: có thanh định dạng');
  await boss.fill('#bio-form textarea[name=bio]', 'Kỳ thủ **Caro** từ 2010\n- Thích khai cuộc Swap2');
  await boss.click('#bio-form button.primary'); await sleep(600);
  ok(await boss.$eval('#profile-body .pf-bio .rich', (e) => e.querySelector('b').textContent === 'Caro' && !!e.querySelector('li')), 'Lưu xong: hiện giới thiệu có định dạng');
  const uid = await boss.evaluate(() => window.CaroOnline.state.me.id.replace(/^u_/, ''));
  ok(app.hub.store.users.get(uid).bio.startsWith('Kỳ thủ **Caro**'), 'Máy chủ lưu giới thiệu');
  await an.evaluate(() => document.getElementById('tour-dlg').close());
  await an.evaluate((i) => window.CaroProfile.open(i), uid); await sleep(600);
  ok(await an.$eval('#profile-body .pf-bio', (e) => /Swap2/.test(e.textContent) && !e.querySelector('[data-bio="edit"]')), 'Người khác: thấy giới thiệu, không có nút Sửa');
  await shot(an, 'rich-profile.png');
  await finish();
})();
