/*
 * Kiểm thử trình duyệt – Đợt 7: câu lạc bộ có biểu tượng + giới thiệu ngắn, yêu cầu vào kèm lời nhắn, từ chối → không
 * gửi lại được → duyệt lại, trang Quản lý (cài đặt, mô tả chỉ thành viên thấy, ẩn danh sách thành viên), thăng quản lý +
 * tick quyền, quản lý gửi tin toàn CLB → thành viên nhận trong chuông thông báo, lọc thành viên online, mời ra kèm chặn.
 *   node caro/tests/e2e/club-admin.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8800;
  const { user, ok, shot, finish } = await setup(PORT);
  const boss = await user('vi', 'boss', 1280); // quản trị viên: CLB được duyệt ngay
  const an = await user('vi', 'an_clb', 430);
  const binh = await user('vi', 'binh_clb', 430);
  const AN = an.uid.replace(/^u_/, ''), BINH = binh.uid.replace(/^u_/, ''); // mã tài khoản (state.me.id là mã kết nối u_…)
  const club = (p) => p.evaluate(() => window.CaroTourKit.D.club);
  const openClubs = async (p) => { await p.evaluate(() => document.getElementById('open-clubs').click()); await sleep(400); };

  // ---------------------------------------------------------------- Tạo CLB: biểu tượng, giới thiệu ngắn
  await openClubs(boss);
  await boss.click('[data-act="clubNew"]'); await sleep(200);
  await boss.fill('#cf input[name=name]', 'CLB Rồng Lửa');
  await boss.fill('#cf input[name=intro]', 'Sinh hoạt tối thứ 7 tại nhà văn hoá');
  await boss.click('#cf .icon-pick label:has(input[value="🐉"])');
  await boss.check('#cf input[value=request]');
  await boss.click('#cf button.primary'); await sleep(600);
  let c = await club(boss);
  ok(c && c.icon === '🐉' && c.intro === 'Sinh hoạt tối thứ 7 tại nhà văn hoá', 'Tạo CLB có biểu tượng 🐉 và giới thiệu ngắn');
  const id = c.id;
  // ---------------------------------------------------------------- Xin vào kèm lời nhắn → từ chối → duyệt lại
  await openClubs(an);
  ok(/Sinh hoạt tối thứ 7/.test(await an.textContent('.tlist')), 'Danh sách CLB hiện giới thiệu ngắn');
  await an.evaluate((i) => window.CaroTour.openClub(i), id); await sleep(500);
  await an.fill('#club-msg', 'Em là An lớp 10A1');
  await an.click('[data-act="clubJoin"]'); await sleep(500);
  ok(/Đã gửi yêu cầu/.test(await an.textContent('.tactions')), 'An gửi yêu cầu kèm lời nhắn');
  await boss.evaluate((i) => window.CaroTour.openClub(i), id); await sleep(500);
  ok(/1/.test(await boss.textContent('[data-act="clubAdmin"] .count')), 'Nút Quản lý CLB có số yêu cầu chờ');
  await boss.click('[data-act="clubAdmin"]'); await sleep(400);
  ok(/Em là An lớp 10A1/.test(await boss.textContent('#tour-body')), 'Trang Quản lý: thấy lời nhắn của An');
  await boss.click('[data-act="clubReq"][data-v="0"]'); await sleep(400);
  ok((await club(boss)).declined.length === 1, 'Từ chối: An vào danh sách đã từ chối');
  await an.evaluate((i) => window.CaroOnline.send({ t: 'clubJoin', id: i }), id); await sleep(400);
  ok(/bị từ chối/.test(await an.textContent('#toasts')), 'An không gửi lại được (báo đã bị từ chối)');
  await boss.click('#tour-body details.fold summary'); await sleep(150);
  await boss.click('[data-act="clubRecon"][data-v="1"]'); await sleep(400);
  ok((await club(boss)).members.length === 2, 'Duyệt lại từ danh sách đã từ chối: An vào CLB');
  // ---------------------------------------------------------------- Cài đặt: mô tả riêng, ẩn thành viên, vào tự do
  await boss.fill('#club-set textarea[name=privDesc]', 'Nhóm Zalo: zalo.me/g/abc');
  await boss.check('#club-set input[name=hideMembers]');
  await boss.selectOption('#club-set select[name=join]', 'open');
  await boss.click('#club-set button.primary'); await sleep(500);
  c = await club(boss);
  ok(c.hideMembers && c.join === 'open' && /zalo/.test(c.privDesc), 'Lưu cài đặt: ẩn thành viên, vào tự do, mô tả riêng');
  await shot(boss, 'club-admin.png');
  await openClubs(binh);
  await binh.evaluate((i) => window.CaroTour.openClub(i), id); await sleep(500);
  ok(!/zalo/.test(await binh.textContent('#tour-body')) && /ẩn danh sách thành viên/.test(await binh.textContent('#tour-body')), 'Người ngoài: không thấy mô tả riêng, danh sách thành viên bị ẩn');
  await binh.click('[data-act="clubJoin"]'); await sleep(500);
  ok(/zalo/.test(await binh.textContent('.note.priv')), 'Vào CLB: thấy mô tả chỉ thành viên thấy');
  // ---------------------------------------------------------------- Thăng quản lý, chỉ để quyền Gửi tin
  await boss.click('#tour-back'); await sleep(400);
  await boss.selectOption(`select.mops[data-uid="${AN}"]`, 'officer'); await sleep(500);
  await boss.click('[data-act="clubAdmin"]'); await sleep(400);
  for (const p of ['public', 'settings', 'tours', 'requests', 'kick']) { await boss.uncheck(`[data-cperm="${p}"][data-uid="${AN}"]`); await sleep(150); }
  await boss.check(`[data-cperm="broadcast"][data-uid="${AN}"]`); await sleep(400);
  c = await club(boss);
  ok(c.members.find((m) => m.id === AN).perms.join() === 'broadcast', 'Tick quyền: An chỉ còn quyền Gửi tin');
  // ---------------------------------------------------------------- An gửi tin toàn CLB → Bình nhận trong chuông
  await an.evaluate((i) => window.CaroTour.openClub(i), id); await sleep(500);
  await an.click('[data-act="clubAdmin"]'); await sleep(400);
  ok(!(await an.$('#club-set')) && !(await an.$('[data-cperm]')) && await an.isVisible('#club-bc'), 'Trang Quản lý của An: chỉ có khu Gửi tin');
  await an.fill('#club-bc', 'Tối nay 20h đấu giải nội bộ!');
  await an.click('[data-act="clubBroadcast"]'); await sleep(600);
  await binh.setViewportSize({ width: 1100, height: 900 }); await sleep(200); // màn hẹp: thanh trên thu gọn, không có chuông
  ok(await binh.evaluate(() => !document.querySelector('#tb-bell .tb-count').hidden), 'Bình: chuông thông báo có số');
  await binh.evaluate(() => { const d = document.getElementById('tour-dlg'); if (d.open) d.close(); });
  await binh.click('#tb-bell'); await sleep(200);
  ok(/Tin từ CLB Rồng Lửa/.test(await binh.textContent('#tb-pop')) && /20h đấu giải/.test(await binh.textContent('#tb-pop')), 'Chuông: "Tin từ CLB Rồng Lửa" + nội dung');
  await shot(binh, 'club-bell.png');
  await binh.click('#tb-pop [data-item="0"]'); await sleep(600);
  ok(await binh.evaluate(() => window.CaroTourKit.V.page) === 'club' && /20h đấu giải/.test(await binh.textContent('.club-msgs')), 'Bấm vào tin: mở trang CLB, có mục Tin của CLB');
  ok(/12 giờ|giờ/.test(await an.textContent('#tour-body')), 'An: gửi xong thì chờ 12 giờ mới gửi tiếp');
  // ---------------------------------------------------------------- Lọc online, mời ra kèm chặn
  await binh.check('input[name="clubfilter"][value="online"]'); await sleep(200);
  ok((await binh.$$('.ranks li')).length === 3, 'Lọc "Đang online": 3 người đang online');
  await boss.click('#tour-back'); await sleep(400);
  await boss.selectOption(`select.mops[data-uid="${BINH}"]`, 'ban'); await sleep(600);
  c = await club(boss);
  ok(!c.members.some((m) => m.id === BINH), 'Mời Bình ra và chặn');
  await binh.evaluate((i) => window.CaroOnline.send({ t: 'clubJoin', id: i }), id); await sleep(400);
  ok(/bị chặn/.test(await binh.textContent('#toasts')), 'Bình bị chặn: không vào lại được');
  // Điện thoại: trang Quản lý không tràn ngang
  await boss.setViewportSize({ width: 360, height: 800 }); await sleep(200);
  await boss.click('[data-act="clubAdmin"]'); await sleep(400);
  ok(await boss.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '360 px: trang Quản lý CLB không tràn ngang');
  await shot(boss, 'club-admin-360.png');
  await finish();
})();
