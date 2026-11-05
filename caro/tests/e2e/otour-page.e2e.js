/*
 * Kiểm thử trình duyệt – Giải đấu Offline là trang riêng (kiểu Challonge / MyLeague, không phải hộp thoại) + ảnh chia sẻ:
 *   - ?ot=new mở thẳng form tạo giải ở trang riêng (#page-otour), hộp thoại giải đấu đóng; tạo xong địa chỉ thành ?o=<link>;
 *   - các tab (Tổng quan / Thể thức…), tự sang tab Thể thức khi giải chạy, về Tổng quan khi xong;
 *   - nút ‹ lùi lên trang trên (giải → danh sách giải offline → Trang chủ); nút "Giải đấu"; nút Back / Forward của trình duyệt;
 *   - ảnh bảng xếp hạng, bục trao giải, ảnh kết quả một trận (hộp xem trước có ảnh PNG).
 *   node caro/tests/e2e/otour-page.e2e.js
 */
'use strict';
const { setup, sleep, gotoRetry } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8819;
  const { app, user, ok, shot, finish, browser } = await setup(PORT);
  const boss = await user('vi', 'ban_trang', 1100);
  const visible = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.offsetParent !== null; }, sel);
  const tab = (p, k) => p.click(`[data-act="otTab"][data-tab="${k}"]`).then(() => sleep(300));

  // Mở thẳng ?ot=new: form tạo giải ở trang riêng
  await gotoRetry(boss, `http://localhost:${PORT}/?ot=new`);
  await boss.waitForSelector('#page-otour #otf', { timeout: 10000 }).catch(() => {});
  ok(await visible(boss, '#page-otour') && !(await boss.evaluate(() => document.getElementById('tour-dlg').open)), '?ot=new: form tạo giải ở trang riêng, không phải hộp thoại');
  await boss.fill('#otf input[name=name]', 'Bóng đá khu phố');
  await boss.fill('#otf input[name=slug]', 'bong-da-khu-pho');
  await boss.selectOption('#otf select[name=sport]', 'football'); await sleep(150);
  await boss.selectOption('#otf select[name=preset]', 'roundrobin'); await sleep(150);
  await boss.fill('#otf textarea[name=teams]', 'Sao Mai\nBến Nghé\nPhú Mỹ\nTân Định');
  await boss.click('#otf button.primary.wide'); await sleep(900);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot && window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  ok(t && t.players.length === 4, 'Tạo giải 4 đội');
  ok(/[?&]o=bong-da-khu-pho/.test(boss.url()), 'Địa chỉ trang thành ?o=<link riêng>');
  ok(await boss.$$eval('[data-act="otTab"]', (x) => x.length) >= 5, 'Trang giải chia tab');
  // ‹ : về danh sách giải (không về lại form đã gửi); bấm vào giải; Back / Forward của trình duyệt
  await boss.click('#otp-back'); await sleep(500);
  const pg = () => boss.evaluate(() => window.CaroTourKit.V.page);
  ok(await pg() === 'otours' && /[?&]ot=list/.test(boss.url()) && await boss.$(`[data-act="ot"][data-id="${id}"]`) !== null, 'Nút ‹: về danh sách giải offline (?ot=list)');
  await boss.click(`[data-act="ot"][data-id="${id}"]`); await sleep(600);
  ok(await pg() === 'ot' && /[?&]o=bong-da-khu-pho/.test(boss.url()), 'Bấm vào giải: mở trang giải');
  await boss.goBack(); await sleep(600);
  ok(await pg() === 'otours' && await visible(boss, '#page-otour'), 'Nút Back của trình duyệt: về danh sách');
  await boss.goForward(); await sleep(800);
  ok(await pg() === 'ot' && await boss.$('[data-act="otStart"]') !== null, 'Nút Forward: lại trang giải');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(900);
  ok(t.status === 'running', 'Bắt đầu giải');
  ok(await boss.$eval('[data-act="otTab"][data-tab="stages"]', (b) => b.classList.contains('on')), 'Giải đang chạy: tự mở tab Thể thức');
  // Nhập kết quả mọi trận
  const ms = Object.values(t.st[0].matches);
  for (const [i, m] of ms.entries()) {
    await boss.evaluate(([tid, mid, s]) => window.CaroTourKit.O.send({ t: 'otScore', id: tid, match: mid, score: s }), [id, m.id, [3 - (i % 3), i % 2]]);
    await sleep(150);
  }
  await sleep(900);
  ok(t.status === 'finished', 'Nhập đủ 6 trận: giải kết thúc');
  ok(await boss.$eval('[data-act="otTab"][data-tab="overview"]', (b) => b.classList.contains('on')) && await boss.$('.podium') !== null, 'Giải xong: tự về tab Tổng quan, có bục trao giải');

  // Ảnh bảng xếp hạng + bục
  const imgOk = async (p) => {
    const ok2 = await p.waitForSelector('.mx-img img', { timeout: 5000 }).then(() => p.$eval('.mx-img img', (e) => e.src.startsWith('data:image/png') && e.naturalWidth > 0), () => false);
    await p.click('.mx-img .mx-x').catch(() => {}); await sleep(200);
    return ok2;
  };
  await boss.click('[data-act="otImgTable"]');
  ok(await imgOk(boss), 'Ảnh bảng xếp hạng: hộp xem trước có ảnh');
  const size = await boss.evaluate(() => { const t = window.CaroTourKit.D.ot, S = window.CaroOTourShare, c = S.drawTable(t, S.tablesOf(t)[0]); return [c.width, c.height]; });
  ok(size[0] === 1080 && size[1] === 1350, 'Ảnh bảng xếp hạng khổ dọc 1080×1350');
  await boss.click('[data-act="otImgPodium"]');
  ok(await imgOk(boss), 'Ảnh bục trao giải');
  // Ảnh kết quả một trận (nút trên ô trận – tab Thể thức)
  await tab(boss, 'stages');
  await boss.$$eval('details.fold', (ds) => ds.forEach((d) => { d.open = true; })); await sleep(400);
  const btn = await boss.$('[data-act="matchImg"]');
  ok(!!btn, 'Ô trận đã xong có nút ảnh kết quả');
  if (btn) { await btn.click(); ok(await imgOk(boss), 'Ảnh kết quả trận'); }
  await shot(boss, 'ot-page.png');

  // Khách (điện thoại) mở bằng link: trang riêng, nút ‹ về Trang chủ
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => localStorage.setItem('caro.lang', 'vi'));
  const guest = await ctx.newPage();
  await gotoRetry(guest, `http://localhost:${PORT}/?o=bong-da-khu-pho`);
  await guest.waitForFunction(() => window.CaroTourKit && window.CaroTourKit.D.ot, null, { timeout: 10000 }).catch(() => {});
  ok(await visible(guest, '#page-otour') && /Bóng đá khu phố/.test(await guest.textContent('#otp-title')), 'Khách mở link: trang riêng có tên giải');
  ok(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Điện thoại: không cuộn ngang');
  await shot(guest, 'ot-page-phone.png');
  await tab(guest, 'stages');
  ok(await guest.$eval('[data-act="otTab"][data-tab="stages"]', (b) => b.classList.contains('on')), 'Khách đổi tab');
  await guest.click('#otp-back'); await sleep(500);
  ok(await guest.evaluate(() => window.CaroTourKit.V.page === 'otours') && await visible(guest, '#page-otour'), 'Khách bấm ‹: về danh sách giải offline');
  await guest.click('#otp-back'); await sleep(500);
  ok(await guest.evaluate(() => window.CaroShell.current === 'home') && !/[?&]o=|[?&]ot=/.test(guest.url()), 'Bấm ‹ lần nữa (hết lịch sử): về Trang chủ, bỏ ?o= / ?ot= khỏi địa chỉ');
  // Nút "Giải đấu" ở đầu trang riêng: mở trang Giải đấu (hộp thoại)
  await gotoRetry(guest, `http://localhost:${PORT}/?ot=list`);
  await guest.waitForSelector('#page-otour [data-act="ot"]', { timeout: 10000 }).catch(() => {});
  await guest.click('#otp-tours'); await sleep(500);
  ok(await guest.evaluate(() => document.getElementById('tour-dlg').open && !window.CaroShell.visible || window.CaroShell.current === 'home') && !/[?&]ot=/.test(guest.url()), 'Nút "Giải đấu": mở trang Giải đấu, bỏ ?ot=');
  await ctx.close();
  await finish();
})();
