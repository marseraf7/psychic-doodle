/*
 * Trang chính dạng gộp (server/src/web-bundle.js – bước 1 của docs/nghien-cuu-viet-lai-rust-17-11-2026.md):
 *  - Đã chọn tiếng Nga: chỉ tải gói chuỗi tiếng Nga, giao diện hiện tiếng Nga ngay lần nạp đầu, không lỗi JS.
 *  - Đổi sang tiếng Trung lúc đang dùng: tải thêm đúng gói tiếng Trung rồi mới đổi chữ.
 *  - Đo thực địa: rum.js gửi số đo, /api/rum có số của lượt mở trang.
 *  - ?perf=1: ô số đo hiện "Bản gộp"; ?bundle=0&perf=1: trang gốc từng file, ô số đo hiện "Từng file".
 *   node caro/tests/e2e/bundle-load.e2e.js
 */
'use strict';
const { setup, gotoRetry } = require('./helpers');

(async () => {
  const PORT = 8139;
  const { browser, ok, sleep, finish } = await setup(PORT);
  const URL = `http://localhost:${PORT}/`;

  // 1. Tiếng Nga đã lưu: chỉ gói tiếng Nga
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { localStorage.setItem('caro.lang', 'ru'); });
  const p = await ctx.newPage();
  const errs = [], packs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('request', (r) => { const m = /\/b\/i18n-(\w+)-/.exec(r.url()); if (m) packs.push(m[1]); });
  await gotoRetry(p, URL);
  await sleep(1200);
  const ph = () => p.evaluate(() => document.querySelector('#tb-search').placeholder);
  ok(await p.evaluate(() => !!window.CARO_PACKS && window.I18N.lang === 'ru'), 'trang gộp, ngôn ngữ đã lưu: tiếng Nga');
  ok(packs.join() === 'ru', 'chỉ tải gói chuỗi tiếng Nga (đã tải: ' + packs.join() + ')');
  ok(await ph() === 'Поиск игроков…', 'chữ trong file dịch phụ hiện tiếng Nga ngay lần đầu');
  ok(await p.evaluate(() => document.querySelectorAll('body script[src]').length <= 12), 'vài khối thay cho hơn 200 file lẻ');

  // 2. Đổi sang tiếng Trung lúc đang dùng
  await p.evaluate(() => window.I18N.setLang('zh'));
  let zh = false;
  for (let i = 0; i < 30 && !(zh = await ph() === '搜索棋手…'); i++) await sleep(100);
  ok(zh && packs.join() === 'ru,zh', 'đổi ngôn ngữ: tải thêm gói tiếng Trung rồi đổi chữ');
  ok(!errs.length, 'không có lỗi JS' + (errs.length ? ': ' + errs.join(' | ') : ''));
  // Đo thực địa (rum.js → /api/rum): gửi khi trang bị ẩn; ở đây gọi thẳng rồi đọc bảng gộp của máy chủ
  await p.evaluate(() => window.CaroRum.send());
  let rum = null;
  for (let i = 0; i < 20 && !rum; i++) { await sleep(100); rum = await p.evaluate(async () => { const r = await (await fetch('/api/rum')).json(); return Object.entries(r.kinds).find(([k]) => k.endsWith('+b')); }); }
  ok(!!rum && rum[1].dcl && rum[1].dcl.p50 > 0, 'đo thực địa: máy chủ nhận số đo của lượt mở trang (' + (rum ? rum[0] : 'không có') + ')');

  // 3. Ô số đo
  const box = async (q) => {
    const c = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } }); // chuẩn giao diện: kiểm ở 390px
    await c.addInitScript(() => { localStorage.setItem('caro.lang', 'vi'); });
    const pg = await c.newPage();
    await gotoRetry(pg, URL + q);
    let t = '', fits = true;
    for (let i = 0; i < 40 && !t; i++) { await sleep(100); t = await pg.evaluate(() => { const b = document.querySelector('.perf-box pre'); return b ? b.textContent : ''; }); }
    if (t) fits = await pg.evaluate(() => { const r = document.querySelector('.perf-box').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; });
    await c.close();
    ok(fits, 'ô số đo nằm gọn trong màn hình 390px' + (q ? ' (' + q + ')' : ''));
    return t;
  };
  const a = await box('?perf=1');
  ok(/Cách nạp mã: Bản gộp/.test(a) && /DOMContentLoaded: \d+ ms/.test(a), 'ô số đo: bản gộp, có số DOMContentLoaded');
  ok(/Cách nạp mã: Từng file/.test(await box('?bundle=0&perf=1')), '?bundle=0: trang gốc từng file');
  ok(!(await box('')), 'không có ?perf=1: không hiện ô số đo');
  await ctx.close();
  await finish();
})();
