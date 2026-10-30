/*
 * Kiểm thử trình duyệt – Đợt 8: chat CLB (tin hiện ngay ở người kia, xoá tin), diễn đàn (chủ đề mới, trả lời hiện ngay
 * ở người đang xem, sửa bài, ghim + khoá), cấm nói, giao diện điện thoại.
 *   node caro/tests/e2e/club-talk.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8801;
  const { app, user, ok, shot, finish } = await setup(PORT);
  app.hub.T.THROTTLE_SCALE = 0; // bỏ giãn cách gửi trong bài thử
  const boss = await user('vi', 'boss', 1280);
  const an = await user('vi', 'an_talk', 430);
  const AN = an.uid.replace(/^u_/, '');
  const openClub = (p, id) => p.evaluate((i) => window.CaroTour.openClub(i), id).then(() => sleep(600));

  await boss.evaluate(() => document.getElementById('open-clubs').click()); await sleep(400);
  await boss.click('[data-act="clubNew"]'); await sleep(200);
  await boss.fill('#cf input[name=name]', 'CLB Trò Chuyện');
  await boss.click('#cf button.primary'); await sleep(600);
  const id = await boss.evaluate(() => window.CaroTourKit.D.club.id);
  await openClub(an, id);
  await an.click('[data-act="clubJoin"]'); await sleep(600);
  // ---------------------------------------------------------------- Chat
  ok(await an.isVisible('#cc-input'), 'Thành viên thấy khung chat CLB');
  await an.fill('#cc-input', 'Chào cả nhà!');
  await an.press('#cc-input', 'Enter'); await sleep(500);
  ok(/Chào cả nhà!/.test(await boss.textContent('#cc-log')), 'Chủ CLB thấy tin ngay (không tải lại trang)');
  await boss.fill('#cc-input', 'Đang gõ dở');
  await an.fill('#cc-input', 'Tin thứ hai');
  await an.press('#cc-input', 'Enter'); await sleep(500);
  ok(await boss.$eval('#cc-input', (e) => e.value) === 'Đang gõ dở' && /Tin thứ hai/.test(await boss.textContent('#cc-log')), 'Tin mới tới khi đang gõ: không mất chữ đang gõ');
  await boss.fill('#cc-input', '');
  await boss.click('#cc-log li:last-child [data-act="ccDel"]'); await sleep(500);
  ok(!/Tin thứ hai/.test(await an.textContent('#cc-log')), 'Chủ CLB xoá tin: biến mất ở người kia');
  // ---------------------------------------------------------------- Diễn đàn
  await an.click('[data-act="ftNew"]'); await sleep(300);
  await an.fill('#ft-title', 'Lịch sinh hoạt tháng 11');
  await an.fill('#ft-text', 'Mọi người rảnh tối nào?\nEm rảnh thứ 7.');
  await an.click('#ft-form button.primary'); await sleep(700);
  ok(await an.evaluate(() => window.CaroTourKit.V.page) === 'clubTopic' && /Em rảnh thứ 7/.test(await an.textContent('.ft-posts')), 'Đăng chủ đề mới: mở trang chủ đề, giữ xuống dòng');
  await boss.evaluate(() => window.CaroTourKit.render(true)); await sleep(300);
  await openClub(boss, id);
  ok(/Lịch sinh hoạt tháng 11/.test(await boss.textContent('.ft-list')), 'Trang CLB: danh sách chủ đề');
  await boss.click('.ft-list [data-act="ftOpen"]'); await sleep(500);
  await boss.fill('#fp-text', 'Thứ 7 lúc 19h nhé');
  await boss.click('#fp-form button.primary'); await sleep(700);
  ok(/Thứ 7 lúc 19h/.test(await an.textContent('.ft-posts')), 'Trả lời: người đang xem chủ đề thấy ngay');
  // Sửa bài của mình
  await an.click('.ft-posts li:first-child [data-act="fpEdit"]'); await sleep(100);
  await an.fill('.fp-edit textarea', 'Mọi người rảnh tối nào? (đã chốt)');
  await an.click('.fp-edit button.primary'); await sleep(600);
  ok(/đã chốt/.test(await an.textContent('.ft-posts')) && /đã sửa/.test(await an.textContent('.ft-posts')), 'Sửa bài của mình: có nhãn "đã sửa"');
  ok(!(await an.$('.ft-posts li:nth-child(2) [data-act="fpEdit"]')), 'Không có nút sửa bài của người khác');
  // Ghim + khoá
  await boss.click('[data-act="ftMod"][data-k="pinned"]'); await sleep(400);
  await boss.click('[data-act="ftMod"][data-k="locked"]'); await sleep(600);
  ok(!(await an.$('#fp-form')) && /đã khoá/.test(await an.textContent('#tour-body')), 'Khoá chủ đề: thành viên không trả lời được');
  await shot(boss, 'club-topic.png');
  // ---------------------------------------------------------------- Cấm nói
  await an.click('#tour-back'); await sleep(500);
  await boss.click('#tour-back'); await sleep(500);
  await boss.selectOption(`select.mops[data-uid="${AN}"]`, 'talkoff'); await sleep(600);
  ok(!(await an.$('#cc-input')) && /cấm nói/.test(await an.textContent('.club-chat')), 'Cấm nói: thành viên không còn ô chat');
  ok(!(await an.$('[data-act="ftNew"]')), 'Cấm nói: không mở chủ đề mới');
  await shot(an, 'club-talk-360.png');
  ok(await an.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '430 px: trang CLB có chat + diễn đàn không tràn ngang');
  await finish();
})();
