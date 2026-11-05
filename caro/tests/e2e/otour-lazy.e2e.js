/*
 * Kiểm thử trình duyệt – Giải đấu Offline tải lười (otour-lazy.js): giải 64 đội chia 16 bảng – trang giải chỉ có bảng
 * xếp hạng; mở bảng → tải các trận; ban tổ chức nhập kết quả trong bảng đã mở, người xem (đã mở bảng đó) thấy cập nhật;
 * tiến độ giải đúng; xuất CSV kết quả tải đủ mọi bảng.
 *   node caro/tests/e2e/otour-lazy.e2e.js
 */
'use strict';
const { setup, sleep, gotoRetry } = require('./helpers.js');

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8818;
  const { app, user, ok, shot, finish, browser } = await setup(PORT);
  const boss = await user('vi', 'ban_lon', 1100);
  await boss.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await boss.fill('#otf input[name=name]', 'Giải 16 bảng');
  await boss.fill('#otf input[name=slug]', 'giai-16-bang');
  await boss.selectOption('#otf-stages [data-k="gmode"]', 'size'); await sleep(200);
  await boss.fill('#otf textarea[name=teams]', Array.from({ length: 64 }, (_, i) => `Đội ${i + 1}`).join('\n'));
  await boss.click('#otf button.primary.wide'); await sleep(900);
  const id = await boss.evaluate(() => window.CaroTourKit.D.ot.id);
  const t = app.hub.otGet(id);
  ok(t.stages[0].groupSize === 4, 'Chia bảng 4 đội');
  await boss.evaluate(() => window.CaroTourKit.acts.otStart()); await sleep(1200);
  ok(t.status === 'running' && t.st[0].groups.length === 16, 'Bắt đầu: 16 bảng');
  ok(await boss.evaluate(() => window.CaroTourKit.D.ot.stageViews[0].lazy === true && window.CaroTourKit.D.ot.stageViews[0].groups[0].rounds === null), 'Trang giải: các bảng chưa có trận (tải lười)');
  // Người xem mở bằng link riêng, mở bảng C
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('caro.lang', 'vi'));
  const guest = await ctx.newPage();
  await gotoRetry(guest, `http://localhost:${PORT}/?o=giai-16-bang`);
  await guest.waitForFunction(() => window.CaroTourKit && window.CaroTourKit.D.ot, null, { timeout: 10000 }).catch(() => {});
  const key = `${id}:0:gg2`, inner = `details[data-k="${id}:0:g2"] > summary`; // bảng C, rồi khung "Các trận" của bảng
  await guest.click(`details[data-k="${key}"] > summary`); await sleep(800);
  await guest.click(inner); await sleep(300);
  ok(await guest.$$eval(`details[data-k="${key}"] .mrow`, (x) => x.length) === 6, 'Người xem mở bảng C: tải 6 trận');
  // Ban tổ chức mở bảng C, nhập kết quả trận đầu
  await boss.click(`details[data-k="${key}"] > summary`); await sleep(800);
  await boss.click(inner); await sleep(300);
  const m = Object.values(t.st[0].matches).find((x) => x.group === 2);
  await boss.click(`.scorable[data-mid="${m.id}"]`); await sleep(300);
  await boss.fill('#ots-a', '4'); await boss.fill('#ots-b', '0');
  await boss.click('#ots button.primary'); await sleep(900);
  ok(m.done, 'Nhập kết quả trận trong bảng tải lười');
  ok(await guest.waitForFunction((mid) => { const e = document.querySelector(`.mrow[data-mid="${mid}"]`); return e && /4–0/.test(e.textContent); }, m.id, { timeout: 8000 }).then(() => true, () => false), 'Người xem thấy kết quả trong bảng đã mở');
  // Tiến độ (K.statsHtml – dùng ở trang nhúng) đếm cả các bảng chưa tải các trận: 1 / 96 trận vòng bảng (+ loại trực tiếp)
  ok(await guest.evaluate(() => /<b>1\/(\d+)<\/b>/.exec(window.CaroTourKit.statsHtml(window.CaroTourKit.D.ot))?.[1]) === '96', 'Tiến độ: 1/96 trận dù chưa tải các bảng');
  // Xuất CSV kết quả: tải đủ mọi bảng
  await boss.click('[data-act="otTab"][data-tab="more"]'); await sleep(300); // tab Khác
  await boss.$eval('details[data-k$=":export"]', (d) => { d.open = true; }).catch(() => {}); await sleep(300);
  const [dl] = await Promise.all([boss.waitForEvent('download', { timeout: 10000 }), boss.click('[data-act="otExport"][data-kind="matches"]')]);
  const csvText = require('fs').readFileSync(await dl.path(), 'utf8');
  ok(csvText.split('\r\n').length === 97 && /4-0/.test(csvText), 'CSV kết quả đủ 96 trận (tải đủ các bảng)');
  // Tab Lịch thi đấu: trận ở bảng chưa ai mở (bảng H) có giờ / sân → người xem mới vẫn thấy (tải đủ các bảng)
  const mh = Object.values(t.st[0].matches).find((x) => x.group === 7);
  await boss.evaluate(([tid, mid]) => window.CaroTourKit.O.send({ t: 'otMatchInfo', id: tid, match: mid, when: Date.UTC(2026, 10, 21, 12), venue: 'Sân Bảng H' }), [id, mh.id]); await sleep(600);
  const ctx2 = await browser.newContext({ viewport: { width: 430, height: 900 } });
  await ctx2.addInitScript(() => localStorage.setItem('caro.lang', 'vi'));
  const late = await ctx2.newPage();
  await gotoRetry(late, `http://localhost:${PORT}/?o=giai-16-bang`);
  await late.waitForFunction(() => window.CaroTourKit && window.CaroTourKit.D.ot, null, { timeout: 10000 }).catch(() => {});
  await late.click('[data-act="otTab"][data-tab="sched"]');
  ok(await late.waitForFunction(() => /Sân Bảng H/.test((document.querySelector('.ot-sched') || {}).textContent || ''), null, { timeout: 8000 }).then(() => true, () => false), 'Tab Lịch: có cả trận ở bảng chưa mở (tải đủ các bảng)');
  await ctx2.close();
  // Báo cáo PDF (otour-pdf.js): tải đủ các bảng rồi dàn trang – 16 bảng × (bảng xếp hạng + 6 trận) → nhiều trang
  const [pdf] = await Promise.all([boss.waitForEvent('download', { timeout: 30000 }), boss.click('[data-act="otPdf"]')]);
  const ptxt = require('fs').readFileSync(await pdf.path(), 'latin1');
  const npages = Number((/\/Type \/Pages \/Count (\d+)/.exec(ptxt) || [])[1]);
  const nmatch = await boss.evaluate(() => window.CaroOTourPdf.layout(window.CaroTourKit.D.ot).pages.flat().filter((x) => x.b.mid).length);
  ok(npages >= 5 && ptxt.endsWith('%%EOF\n') && nmatch === 96, `PDF giải 16 bảng: ${npages} trang, đủ các trận (tải đủ các bảng trước)`);
  await shot(guest, 'ot-lazy.png');
  await ctx.close();
  await finish();
})();
