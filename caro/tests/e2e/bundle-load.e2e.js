/*
 * Trang chính dạng gộp (server/src/web-bundle.js – bước 1 của docs/nghien-cuu-viet-lai-rust-17-11-2026.md):
 *  - Đã chọn tiếng Nga: chỉ tải gói chuỗi tiếng Nga, giao diện hiện tiếng Nga ngay lần nạp đầu, không lỗi JS.
 *  - Đổi sang tiếng Trung lúc đang dùng: tải thêm đúng gói tiếng Trung rồi mới đổi chữ.
 *  - Đo thực địa: rum.js gửi số đo, /api/rum có số của lượt mở trang.
 *  - ?perf=1: ô số đo hiện "Bản gộp"; ?bundle=0&perf=1: trang gốc từng file, ô số đo hiện "Từng file".
 *  - A2: CPU chậm 4× – việc CPU dài nhất dưới ngưỡng; service worker đăng ký sau khi tải xong, lúc rảnh lưu nốt, mất mạng vẫn chơi.
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

  // 4. Tải nguội trên máy chậm (A2): CPU chậm 4 lần (CDP) – việc CPU dài nhất dưới ngưỡng rộng (đo thật ~60–85 ms; ngưỡng
  //    rộng để không chập chờn trên máy CI), trang vẫn dựng xong. Chỉ Chromium (CDP).
  if ((process.env.E2E_BROWSER || 'chromium') === 'chromium') {
    const longest = [];
    for (let i = 0; i < 3; i++) {
      const c = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      await c.addInitScript(() => {
        localStorage.setItem('caro.lang', 'vi');
        window.__lt = 0;
        try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt = Math.max(window.__lt, e.duration); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* không hỗ trợ */ }
      });
      const pg = await c.newPage();
      await (await c.newCDPSession(pg)).send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await gotoRetry(pg, URL, { waitUntil: 'load' });
      await sleep(2000);
      longest.push(await pg.evaluate(() => (window.CaroShell && window.CaroShell.current === 'home' ? Math.round(window.__lt) : -1)));
      await c.close();
    }
    longest.sort((a, b) => a - b);
    ok(longest[0] >= 0 && longest[1] < 250, `CPU chậm 4×: việc CPU dài nhất (trung vị 3 lần) ${longest[1]} ms < 250 ms – [${longest.join(', ')}]`);

    // 5. Service worker (A2): chỉ đăng ký sau khi trang tải xong; lúc rảnh lưu nốt phần còn lại (gói chuỗi dịch, dữ liệu
    //    câu đố…) → lần sau mất mạng vẫn mở được và chơi được
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await c.addInitScript(() => {
      localStorage.setItem('caro.lang', 'vi');
      document.addEventListener('DOMContentLoaded', () => {
        window.__regAtDcl = 'pending';
        navigator.serviceWorker.getRegistration().then((r) => { window.__regAtDcl = r ? 'yes' : 'no'; });
      });
    });
    const pg = await c.newPage();
    const pErr = [];
    pg.on('pageerror', (e) => pErr.push(e.message));
    await gotoRetry(pg, URL);
    let st = null;
    for (let i = 0; i < 100; i++) {
      await sleep(200);
      st = await pg.evaluate(async () => {
        const keys = await caches.keys();
        const k = keys.find((x) => /^caro-v\d+/.test(x));
        if (!k || !navigator.serviceWorker.controller) return null;
        const urls = (await (await caches.open(k)).keys()).map((r) => r.url);
        const files = JSON.parse(/const FILES = (\[[^\]]*\]);/.exec(await (await fetch('sw.js')).text())[1]);
        const miss = files.filter((f) => !urls.includes(new URL(f, location.href).href));
        return { n: files.length - miss.length, all: files.length, miss: miss.slice(0, 3), pack: ['vi', 'en', 'ru', 'zh'].every((l) => urls.some((u) => u.includes('/b/i18n-' + l + '-'))), puzzles: urls.some((u) => u.endsWith('/puzzles.json')), reg: window.__regAtDcl, sw: window.CaroSW.status() };
      });
      if (st && st.pack && st.puzzles && st.n >= st.all) break;
    }
    ok(st && st.reg === 'no', 'lần mở đầu: chưa đăng ký service worker lúc DOMContentLoaded (' + (st && st.reg) + ')');
    ok(st && st.pack && st.puzzles && st.n >= st.all, 'lúc rảnh: service worker lưu nốt cả 4 gói chuỗi dịch, câu đố… (' + (st && st.n + '/' + st.all + (st.miss.length ? ', thiếu ' + st.miss.join(' ') : '')) + ' file)');
    ok(st && st.sw.state === 'active' && st.sw.controller && /\/$/.test(st.sw.scope), 'CaroSW.status(): active, có controller, scope ' + (st && st.sw.scope));
    await c.setOffline(true);
    await pg.reload().catch(() => {});
    let offOk = false;
    for (let i = 0; i < 40 && !offOk; i++) { await sleep(200); offOk = await pg.evaluate(() => !!(window.CaroShell && window.CaroShell.current === 'home' && window.I18N.t('home_resume') !== 'home_resume')).catch(() => false); }
    ok(offOk, 'mất mạng, tải lại: Trang chủ hiện đủ chữ từ bộ nhớ đệm');
    await pg.evaluate(() => window.CaroApp.startPreset({ mode: 'ai', human: 1, moves: [[0, 0]] }));
    let moved = false;
    for (let i = 0; i < 60 && !moved; i++) { await sleep(100); moved = await pg.evaluate(() => window.CaroApp.local.moves >= 2); }
    ok(moved, 'mất mạng: vẫn chơi được với máy');
    ok(!pErr.length, 'offline: không lỗi JS' + (pErr.length ? ': ' + pErr.join(' | ') : ''));
    await c.close();
  }
  await finish();
})();
