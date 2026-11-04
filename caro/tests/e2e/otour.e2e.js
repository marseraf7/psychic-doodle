/*
 * Kiểm thử trình duyệt – Giải đấu Offline (mọi bộ môn): lối vào từ trang Giải đấu, tạo giải cầu lông (bộ môn tự điền kiểu
 * kết quả / Bo), bắt đầu, nhập điểm từng set, huỷ kết quả, khách mở bằng link riêng (không đăng nhập) và thấy cập nhật.
 *   node caro/tests/e2e/otour.e2e.js
 */
'use strict';
const { setup, sleep, gotoRetry } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8809;
  const { app, user, ok, shot, finish, browser } = await setup(PORT);
  const boss = await user('vi', 'ban_to_chuc', 1100);

  await boss.evaluate(() => document.getElementById('open-tours').click()); await sleep(300);
  ok(await boss.isVisible('[data-act="otours"]'), 'Trang Giải đấu có lối vào "Giải đấu Offline"');
  await boss.click('[data-act="otours"]'); await sleep(400);
  await boss.click('[data-act="otNew"]'); await sleep(300);
  await boss.fill('#otf input[name=name]', 'Cầu lông phường 2026');
  await boss.fill('#otf input[name=slug]', 'cau-long-phuong');
  await boss.selectOption('#otf select[name=sport]', 'badminton'); await sleep(150);
  ok(await boss.$eval('#otf select[name=result]', (e) => e.value) === 'sets', 'Chọn cầu lông: tự điền "Điểm từng set"');
  await boss.selectOption('#otf select[name=preset]', 'single'); await sleep(150);
  ok(await boss.$eval('#otf-stages [data-k="bestOf"]', (e) => e.value) === '3', 'Cầu lông: Bo3');
  await boss.fill('#otf textarea[name=teams]', 'An\nBình\nChi\nDũng');
  await boss.$eval('#otf textarea[name=teams]', (e) => e.dispatchEvent(new Event('change', { bubbles: true }))); await sleep(150);
  ok(/4 trận/.test(await boss.textContent('#otf-est')), 'Ước tính: 4 người loại trực tiếp + tranh hạng ba = 4 trận');
  await shot(boss, 'ot-new.png');
  await boss.click('#otf button.primary'); await sleep(800);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot && window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  ok(t && t.sport === 'badminton' && t.players.length === 4 && t.slug === 'cau-long-phuong', 'Tạo giải: 4 người, link riêng');
  await boss.click('[data-act="otStart"]'); await sleep(800);
  ok(t.status === 'running', 'Bắt đầu giải');

  // Khách (không đăng nhập) mở bằng link riêng
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('caro.lang', 'vi'));
  const guest = await ctx.newPage();
  await gotoRetry(guest, `http://localhost:${PORT}/?o=cau-long-phuong`);
  // Chờ trang giải tải xong (kết nối + mở link) – máy chậm có thể lâu hơn vài giây
  await guest.waitForFunction(() => window.CaroTourKit && window.CaroTourKit.D.ot, null, { timeout: 10000 }).catch(() => {});
  ok(await guest.evaluate(() => window.CaroTourKit.D.ot && window.CaroTourKit.D.ot.name) === 'Cầu lông phường 2026', 'Khách mở bằng link riêng ?o=…');
  ok(!(await guest.$('[data-act="otStart"], .scorable')), 'Khách không có nút quản lý / nhập kết quả');

  // Nhập điểm từng set
  const m = Object.values(t.st[0].matches).find((x) => typeof x.a === 'string' && typeof x.b === 'string' && x.a !== '-' && x.b !== '-' && !x.done);
  await boss.click(`.scorable[data-mid="${m.id}"]`); await sleep(300);
  ok(/tới 21 điểm/.test(await boss.textContent('.score-panel')), 'Khung nhập nhắc luật set cầu lông');
  await boss.fill('[data-set="0"][data-side="0"]', '21'); await boss.fill('[data-set="0"][data-side="1"]', '15');
  await boss.click('[data-act="otSetAdd"]'); await sleep(150);
  await boss.fill('[data-set="1"][data-side="0"]', '21'); await boss.fill('[data-set="1"][data-side="1"]', '18');
  await boss.click('#ots button.primary'); await sleep(800);
  ok(m.done && m.winner === m.a && m.wins[m.a] === 2, 'Lưu 2 set: người ô trên thắng 2–0');
  ok(await guest.waitForFunction((mid) => { const e = document.querySelector(`[data-mid="${mid}"]`); return e && /2/.test(e.textContent); }, m.id, { timeout: 8000 }).then(() => true, () => false),
    'Khách thấy kết quả cập nhật (bản vá)');
  // Huỷ kết quả rồi nhập lại
  await boss.click(`.scorable[data-mid="${m.id}"]`); await sleep(300);
  await boss.click('[data-act="otUndo"]'); await sleep(600);
  ok(!m.done, 'Huỷ kết quả');
  await shot(boss, 'ot-view.png');
  await shot(guest, 'ot-guest.png');
  await ctx.close();
  await finish();
})();
