/*
 * Kiểm thử trình duyệt: trang tài liệu API công khai (caro/api.html – C4).
 *   node caro/tests/e2e/api-docs.e2e.js
 *  - Cài đặt có link "API công khai cho nhà phát triển" tới api.html.
 *  - api.html: 4 ngôn ngữ (theo ngôn ngữ đang dùng trong game, đổi bằng VI / EN / RU / ZH), bảng đủ 10 đường dẫn khớp
 *    /api/v1/openapi.json; ở 390 px không lỗi hiển thị, không cuộn ngang cả trang.
 *  - Gọi thử API kèm Origin nguồn khác: có CORS * và JSON.
 */
'use strict';
const { setup } = require('./helpers');
const { audit } = require('./ui-audit');

(async () => {
  const PORT = 8133;
  const { browser, ok, sleep, shot, finish } = await setup(PORT);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { localStorage.setItem('caro.lang', 'ru'); });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  await p.goto(`http://localhost:${PORT}/`);
  await sleep(500);
  const href = await p.evaluate(() => [...document.querySelectorAll('.api-link')].map((a) => a.getAttribute('href')));
  ok(href.length >= 1 && href.every((h) => /api\.html$/.test(h)), 'Cài đặt / Xem thêm có link tới api.html: ' + href.join(', '));
  ok(await p.evaluate(() => document.querySelector('.api-link .li-t').textContent === 'Открытый API для разработчиков'), 'link có chữ theo ngôn ngữ đang dùng (ru)');

  await p.goto(`http://localhost:${PORT}/api.html`);
  await sleep(300);
  ok(await p.evaluate(() => !document.getElementById('ru').hidden && document.getElementById('vi').hidden), 'mở trang: hiện bản tiếng Nga (ngôn ngữ trong game)');
  const spec = await p.evaluate(() => fetch('/api/v1/openapi.json').then((r) => r.json()));
  for (const l of ['vi', 'en', 'ru', 'zh']) {
    await p.click(`.langs a[href="#${l}"]`);
    await sleep(150);
    const paths = await p.evaluate((id) => [...document.querySelectorAll(`#${id} .api-table td:first-child code`)].map((c) => c.textContent.replace('GET /api/v1', '')), l);
    ok(JSON.stringify(paths) === JSON.stringify(Object.keys(spec.paths)), `${l}: bảng đủ ${paths.length} đường dẫn, khớp OpenAPI`);
    ok((await audit(p, '#' + l)).length === 0, `${l}: soát giao diện 390px – 0 lỗi`);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${l}: không cuộn ngang cả trang`);
  }
  await shot(p, 'api-docs-zh-390.png');

  // CORS: câu trả lời cho trang ở nguồn khác (Origin lạ) có access-control-allow-origin: *
  const lb = await ctx.request.get(`http://localhost:${PORT}/api/v1/leaderboard`, { headers: { origin: 'https://example.org' } });
  ok(lb.headers()['access-control-allow-origin'] === '*' && Array.isArray((await lb.json()).players), 'gọi API kèm Origin nguồn khác: CORS * + JSON bảng xếp hạng');
  ok(!errs.length, 'không có lỗi JS / console: ' + errs.join(' | '));
  await ctx.close();
  await finish();
})();
