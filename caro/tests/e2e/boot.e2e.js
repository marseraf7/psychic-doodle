/*
 * Kiểm thử trình duyệt: mở / tải lại trang khi mạng chậm (người chơi ở xa máy chủ, vd. từ Nga tới máy chủ ở Mỹ).
 *   - Trang chủ hiện sẵn từ HTML (index.html): script chưa chạy xong thì vẫn thấy Trang chủ, không phải bàn cờ trống.
 *   - Service worker (sw.js) lấy file từ bộ nhớ đệm trước: đã cài rồi thì tải lại trang không phải chờ mạng
 *     (mạng chậm 4 giây / file mà Trang chủ vẫn hiện ngay). Phần này chỉ chạy trên Chromium (Playwright chặn được
 *     yêu cầu mạng của service worker trên Chromium).
 *   node caro/tests/e2e/boot.e2e.js
 */
'use strict';
// Cho Playwright thấy (và làm chậm được) yêu cầu mạng của chính service worker – phải đặt trước khi mở trình duyệt
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { setup, gotoRetry } = require('./helpers');

const PORT = 8121;

(async () => {
  const { browser, user, ok, shot, sleep, finish } = await setup(PORT);
  const errors = [];
  const URL = `http://localhost:${PORT}/`;
  const ctx = await browser.newContext({ viewport: { width: 430, height: 860 } });
  await ctx.addInitScript(() => { if (!localStorage.getItem('e2e.init')) { localStorage.clear(); localStorage.setItem('e2e.init', '1'); localStorage.setItem('caro.lang', 'vi'); } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  const shellState = () => p.evaluate(() => {
    const board = document.getElementById('board');
    return {
      shell: !document.getElementById('shell').hidden,
      home: !document.getElementById('page-home').hidden,
      boardHidden: !board || getComputedStyle(board).visibility === 'hidden',
    };
  });
  const waitHome = async (ms) => {
    const t = Date.now();
    while (Date.now() - t < ms) {
      if (await p.evaluate(() => !!(window.CaroShell && window.CaroShell.current === 'home')).catch(() => false)) return Date.now() - t;
      await sleep(100);
    }
    return -1;
  };

  // 1. Script chạy chậm (home.js tới sau 3 giây): trong lúc chờ đã thấy Trang chủ, bàn cờ ẩn
  const slow = (route) => setTimeout(() => route.continue().catch(() => {}), 3000);
  await p.route('**/home.js', slow);
  await p.goto(URL, { waitUntil: 'commit' });
  await sleep(1200);
  const s = await shellState();
  ok(s.shell && s.home && s.boardHidden, `script chưa chạy xong: đã thấy Trang chủ, bàn cờ ẩn (${JSON.stringify(s)})`);
  await shot(p, 'boot-1-cho-script.png');
  ok(await waitHome(15000) >= 0, 'script chạy xong: Trang chủ (CaroShell.current = home)');
  await p.unroute('**/home.js', slow);

  // 2. Đang chơi với máy rồi tải lại: vẫn về Trang chủ (không mở thẳng vào bàn cờ)
  await p.click('#tabbar [data-tab="home"]').catch(() => {});
  await p.evaluate(() => { window.CaroShell.hide(); window.CaroApp.place && window.CaroApp.place(0, 0); });
  await sleep(300);
  await gotoRetry(p, URL);
  ok(await waitHome(15000) >= 0, 'tải lại khi đang ở bàn cờ: về Trang chủ');

  // 3. Service worker đã cài: tải lại với mạng rất chậm (4 giây / file JS) – Trang chủ vẫn hiện nhanh nhờ bộ nhớ đệm
  if ((process.env.E2E_BROWSER || 'chromium') === 'chromium') {
    const ready = await p.evaluate(async () => {
      if (!navigator.serviceWorker) return false;
      await navigator.serviceWorker.ready;
      for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 100));
      const keys = await caches.keys();
      const c = await caches.open(keys.find((k) => /^caro-v\d+$/.test(k)));
      return !!navigator.serviceWorker.controller && !!(await c.match('app.js'));
    });
    ok(ready, 'service worker đã cài và lưu sẵn file (app.js)');
    let slowHits = 0;
    const lag = (route) => { slowHits++; setTimeout(() => route.continue().catch(() => {}), 4000); };
    await ctx.route(/\.js(\?|$)/, lag); // gồm cả yêu cầu mạng của chính service worker
    const t0 = Date.now();
    await p.reload({ waitUntil: 'commit' }).catch(() => {});
    const took = await waitHome(30000);
    ok(took >= 0 && Date.now() - t0 < 5000, `mạng chậm, tải lại: Trang chủ sau ${Date.now() - t0} ms (< 5000), ${slowHits} file JS phải chờ mạng`);
    await shot(p, 'boot-2-tai-lai-mang-cham.png');
    await ctx.unroute(/\.js(\?|$)/, lag);

    // 3b. Có bản mới (service worker đổi bộ điều khiển) trong lúc đang gõ dở: chưa tải lại; gõ xong, chuyển trang thì tải lại (app.js)
    await p.evaluate(() => { window.__noReload = 1; });
    const typed = await p.evaluate(() => {
      // ô nhập thử trên Trang chủ (như ô chat / form đăng ký đang gõ dở)
      const i = document.createElement('input');
      i.id = 'e2e-typing';
      document.querySelector('#page-home .pg-body, #page-home').appendChild(i);
      i.focus(); i.value = 'đang gõ dở';
      navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
      return true;
    });
    await sleep(800);
    ok(typed && await p.evaluate(() => window.__noReload === 1).catch(() => false), 'có bản mới khi đang gõ dở: chưa tải lại trang');
    await p.evaluate(() => { document.getElementById('e2e-typing').remove(); });
    await p.click('#tabbar [data-tab="more"]').catch(() => {});
    let reloaded = false;
    for (let i = 0; i < 50 && !reloaded; i++) { await sleep(100); reloaded = await p.evaluate(() => window.__noReload !== 1).catch(() => false); }
    ok(reloaded, 'gõ xong, chuyển trang: tải lại dùng bản mới');
    await waitHome(15000);
  }

  // 4. Đã đăng nhập, script phía sau tải chậm: tin bạn bè từ máy chủ tới trước khi player-search.js chạy (trình duyệt xử lý
  //    tin WebSocket trong lúc chờ thẻ <script>) – không lỗi JS, ô kết bạn vẫn có gợi ý khi trang nạp xong (online-friends.js)
  const u = await user('vi', 'boot_an', 430, { serviceWorkers: 'block' }); // lỗi JS của trang này: finish() kiểm
  const lateSearch = (route) => setTimeout(() => route.continue().catch(() => {}), 3000);
  await u.route('**/player-search.js', lateSearch);
  await gotoRetry(u, URL);
  await sleep(1500);
  ok(await u.evaluate(() => { const f = document.getElementById('add-friend'); return !!(f && f.u && f.u.parentElement.classList.contains('ps-wrap')); }),
    'player-search.js tải chậm: ô kết bạn vẫn gắn gợi ý kỳ thủ, không lỗi JS');
  await u.unroute('**/player-search.js', lateSearch);

  // 5. Worker của máy không nạp được (vd. giao thức capacitor:// của app iOS không cho): bot vẫn đi (tính trên luồng chính),
  //    không treo "đang nghĩ" mãi (app.js – Worker lỗi thì bỏ Worker)
  const wctx = await browser.newContext({ viewport: { width: 430, height: 860 }, serviceWorkers: 'block' });
  await wctx.addInitScript(() => { localStorage.setItem('caro.lang', 'vi'); });
  await wctx.route('**/ai-worker.js', (route) => route.abort());
  const wp = await wctx.newPage();
  const wErr = [];
  wp.on('pageerror', (e) => wErr.push(e.message));
  await gotoRetry(wp, URL);
  await waitHome(1); // trang đã nạp
  await sleep(800);
  await wp.evaluate(() => window.CaroApp.startPreset({ mode: 'ai', human: 1, moves: [[0, 0]] }));
  let botMoved = false;
  for (let i = 0; i < 100 && !botMoved; i++) { await sleep(100); botMoved = await wp.evaluate(() => window.CaroApp.local.moves >= 2); }
  ok(botMoved && !wErr.length, 'Worker máy không nạp được: bot vẫn đi nước' + (wErr.length ? ' – lỗi JS: ' + wErr.join(' | ') : ''));
  await wctx.close();

  ok(!errors.length, 'không có lỗi JS' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
  await finish();
})();
