/*
 * Giải tuần (weekly-cup.js + server/src/hub/weekly-cup.js): máy chủ bật Giải tuần → Trang chủ có thẻ; giờ bắt đầu hiện theo
 * GIỜ THIẾT BỊ (máy ở New York: Chủ nhật 20:00 giờ Việt Nam = 08:00 sáng); đăng ký ngay trên thẻ; khách thấy nút "Đăng nhập để
 * đăng ký"; giải xong: thẻ chuyển sang giải #2, kết quả tuần trước + "Chia sẻ kết quả"; danh hiệu trên hồ sơ; dòng trạng thái ở
 * trang Duyệt của quản trị viên. Soát giao diện ở 390 px.
 *   node caro/tests/e2e/weekly-cup.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers');
const { audit } = require('./ui-audit');

(async () => {
  const PORT = 8177;
  const { app, browser, user, ok, shot, finish } = await setup(PORT);
  // Bật Giải tuần như khi chạy thật (server.js truyền process.env; e2e mặc định tắt) – lịch mặc định Chủ nhật 20:00 giờ VN
  app.hub.weeklyInit({});
  const cup = app.hub.weeklyLive();
  ok(cup && cup.weeklyN === 1, 'máy chủ tạo Giải tuần #1');

  const a = await user('vi', 'wc_ann', 390, { timezoneId: 'America/New_York' });
  await a.click('#tabbar [data-tab="home"]');
  await a.waitForSelector('#weekly-card:not([hidden]) [data-wc="join"]', { timeout: 8000 });
  const txt = await a.evaluate(() => document.getElementById('weekly-card').textContent.replace(/\s+/g, ' '));
  const want = await a.evaluate((at) => new Intl.DateTimeFormat(window.I18N.locale, { weekday: 'short', day: 'numeric', month: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(at), cup.startsAt);
  ok(/Cúp tuần Caro #1/.test(txt), 'thẻ có tên giải (theo ngôn ngữ người xem)');
  ok(txt.includes(want) && /08:00/.test(want) && !/20:00/.test(txt), `giờ theo máy ở New York: ${want}`);
  ok(/Còn \d/.test(txt) && /0 người đã đăng ký/.test(txt), 'đếm ngược + số người đăng ký');
  ok((await audit(a, '#weekly-card')).length === 0, 'soát giao diện thẻ ở 390 px: 0 lỗi hiển thị');
  await a.evaluate(() => document.getElementById('weekly-card').scrollIntoView({ block: 'center' }));
  await shot(a, 'weekly-card-390.png');

  const uidA = app.store.byUsername.get('wc_ann').id;
  await a.click('#weekly-card [data-wc="join"]');
  await a.waitForFunction(() => /Đã đăng ký/.test(document.getElementById('weekly-card').textContent), null, { timeout: 5000 });
  ok(/1 người đã đăng ký/.test(await a.textContent('#weekly-card')), 'đăng ký ngay trên thẻ: 1 người');
  ok(app.hub.player(cup, uidA) && !app.hub.player(cup, uidA).withdrawn, 'máy chủ: đã vào danh sách giải');
  await a.click('#weekly-card [data-wc="open"]');
  await a.waitForFunction(() => /Caro x Gomoku/.test(document.body.textContent) && /Weekly Cup #1/.test(document.body.textContent), null, { timeout: 5000 });
  ok(true, 'Vào giải: mở trang giải, ban tổ chức là hệ thống, mô tả hai thứ tiếng');
  await a.evaluate(() => { const d = document.getElementById('tour-dlg'); if (d && d.open) d.close(); });

  // Khách (chưa đăng nhập, máy ở Tokyo, tiếng Anh): thấy thẻ + nút đăng nhập để đăng ký
  const gctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'Asia/Tokyo' });
  await gctx.addInitScript(() => localStorage.setItem('caro.lang', 'en'));
  const g = await gctx.newPage();
  await g.goto(`http://localhost:${PORT}/`);
  await g.waitForSelector('#weekly-card:not([hidden]) [data-wc="login"]', { timeout: 8000 });
  const gt = await g.textContent('#weekly-card');
  ok(/Weekly Cup #1/.test(gt) && /Sign in to register/.test(gt) && /22:00/.test(gt), 'khách: tiếng Anh, giờ Tokyo (22:00), nút đăng nhập – ' + gt.replace(/\s+/g, ' ').slice(0, 160));
  // Còn dưới một ngày: đếm ngược giờ:phút:giây chạy mỗi giây
  const t0 = Date.now() + 90 * 60000;
  cup.startsAt = t0;
  await g.evaluate(() => window.CaroWeekly.refresh());
  await g.waitForFunction(() => /In 1:\d\d:\d\d/.test(document.getElementById('weekly-card').textContent), null, { timeout: 5000 });
  const cd1 = await g.textContent('[data-wc-cd]');
  await sleep(1300);
  ok(cd1 !== await g.textContent('[data-wc-cd]'), 'đếm ngược chạy mỗi giây: ' + cd1);
  ok((await audit(g, '#weekly-card')).length === 0, 'soát giao diện thẻ (khách, tiếng Anh) ở 390 px');

  // Giải xong (giả lập kết thúc trên máy chủ): giải #2 được tạo, kết quả tuần trước + chia sẻ, danh hiệu trên hồ sơ
  const p = app.hub.player(cup, uidA);
  Object.assign(p, { score: 6, wins: 3, games: 3 });
  cup.status = 'running';
  app.hub.finishTour(cup);
  ok(app.hub.weeklyLive().weeklyN === 2, 'giải xong: máy chủ tạo Giải tuần #2');
  await a.evaluate(() => window.CaroWeekly.refresh());
  await a.waitForFunction(() => /#2/.test(document.getElementById('weekly-card').textContent) && /Tuần trước/.test(document.getElementById('weekly-card').textContent), null, { timeout: 5000 });
  ok(/Tuần trước \(#1\): vô địch wc_ann/.test(await a.textContent('#weekly-card')), 'kết quả tuần trước: vô địch');
  await a.evaluate(() => { window.__shared = null; window.CaroShareLink.send = (o) => { window.__shared = o; return Promise.resolve(true); }; });
  await a.click('#weekly-card [data-wc="share"]');
  const shared = await a.evaluate(() => window.__shared);
  ok(shared && shared.url.includes('?t=' + encodeURIComponent(cup.id)) && /wc_ann/.test(shared.text), 'Chia sẻ kết quả: link /?t=<giải> + nhà vô địch');
  ok((await audit(a, '#weekly-card')).length === 0, 'soát giao diện thẻ có kết quả tuần trước ở 390 px');
  await a.evaluate(() => document.getElementById('weekly-card').scrollIntoView({ block: 'center' }));
  await shot(a, 'weekly-card-last-390.png');

  await a.evaluate((uid) => window.CaroProfile.open(uid), uidA);
  await a.waitForFunction(() => /Vô địch Cúp tuần Caro #1/.test(document.getElementById('profile-body').textContent), null, { timeout: 5000 });
  ok(true, 'hồ sơ: danh hiệu "Vô địch Cúp tuần Caro #1"');
  ok((await audit(a, '#profile-body')).length === 0, 'soát giao diện hồ sơ có danh hiệu ở 390 px');

  // Quản trị viên: dòng trạng thái Giải tuần ở trang Duyệt (số liệu máy chủ)
  const boss = await user('vi', 'boss', 1280);
  await boss.evaluate(() => { window.CaroTour.page('admin'); window.CaroOnline.send({ t: 'adminStats' }); });
  await boss.waitForFunction(() => /Giải tuần: bật · lần kế:/.test(document.body.textContent), null, { timeout: 5000 });
  ok(/sun 20:00 Asia\/Ho_Chi_Minh · arena 60' · vn · 3\+2/.test(await boss.textContent('.wc-adm')), 'quản trị: bật, lần kế, cấu hình hiệu lực');

  await gctx.close();
  await finish();
})();
