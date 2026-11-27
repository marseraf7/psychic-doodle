/*
 * Bản cổng game (server/scripts/build-portal.js – CrazyGames / itch.io), mở từ một nguồn khác máy chủ game (như khi cổng
 * phục vụ gói từ tên miền của họ): máy chủ game ở localhost:PORT, gói tĩnh ở 127.0.0.1:PORT2.
 *  – CrazyGames: SDK giả (chặn https://sdk.crazygames.com/… và trả bản giả) ghi lại thứ tự sự kiện: loadingStart →
 *    loadingStop → gameplayStart (vào ván với máy) → gameplayStop (hết ván); muteAudio của cổng tắt tiếng game.
 *  – Khách mặc định, kết nối online được (Origin của cổng nằm trong danh sách cho phép), không nút đăng nhập / đăng ký,
 *    không link ra ngoài, không ô chat tự do, không service worker, tiếng Anh mặc định (vẫn đổi được), 0 lỗi hiển thị ở 390px.
 *  – SDK không tải được: game vẫn chơi được. Bản itch.io không nạp SDK.
 *   node caro/tests/e2e/portal.e2e.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { setup, gotoRetry } = require('./helpers');
const { audit } = require('./ui-audit');
const { buildPortal, SDK_URL } = require('../../../server/scripts/build-portal.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.webp': 'image/webp' };
/** Máy chủ tĩnh tối giản cho thư mục gói (như CDN của cổng). */
function serveDir(dir, port) {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(dir, u.endsWith('/') ? u + 'index.html' : u);
    if (!f.startsWith(dir) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r(srv)));
}

// SDK giả: ghi sự kiện vào window.__cg; game.settings.muteAudio đổi được qua window.__cgMute(true)
const STUB = `(function () {
  var ev = window.__cg = [], fns = [];
  var settings = { muteAudio: false, disableChat: false };
  window.__cgMute = function (v) { settings.muteAudio = v; fns.forEach(function (f) { f(settings); }); };
  var game = { settings: settings,
    loadingStart: function () { ev.push('loadingStart'); }, loadingStop: function () { ev.push('loadingStop'); },
    gameplayStart: function () { ev.push('gameplayStart'); }, gameplayStop: function () { ev.push('gameplayStop'); },
    addSettingsChangeListener: function (f) { fns.push(f); } };
  window.CrazyGames = { SDK: { environment: 'crazygames', game: game, init: function () { ev.push('init'); return Promise.resolve(); } } };
})();`;

(async () => {
  const PORT = 8171, PORT2 = 8172;
  process.env.PORTAL_WS_ORIGINS = `http://127.0.0.1:${PORT2}`; // Origin của "cổng" trong bài thử (thật: *.game-files.crazygames.com…)
  const { browser, ok, sleep, finish } = await setup(PORT);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-portal-'));
  const cg = buildPortal({ mode: 'crazygames', server: `http://localhost:${PORT}`, out: path.join(tmp, 'cg'), zip: false, allowHttp: true });
  const it = buildPortal({ mode: 'itch', server: `http://localhost:${PORT}`, out: path.join(tmp, 'itch'), zip: false, allowHttp: true });
  ok(!cg.problems.length && !it.problems.length, 'đóng gói 2 bản cổng đạt giới hạn, đường dẫn tương đối' + [...cg.problems, ...it.problems].join(' | '));
  const srv = await serveDir(tmp, PORT2);
  const base = `http://127.0.0.1:${PORT2}`;

  async function open(dir, { sdk = 'stub', width = 390 } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    const p = await ctx.newPage();
    p.errs = [];
    p.on('pageerror', (e) => p.errs.push(e.message));
    p.ext = [];
    p.on('request', (r) => { const u = r.url(); if (u !== SDK_URL && !u.startsWith(base) && !u.startsWith(`http://localhost:${PORT}`) && !u.startsWith('ws') && !u.startsWith('data:')) p.ext.push(u); });
    await ctx.route(SDK_URL, (route) => (sdk === 'stub' ? route.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }) : route.abort()));
    await gotoRetry(p, `${base}/${dir}/`);
    await p.waitForFunction(() => window.CaroOnline && window.CaroOnline.connected, null, { timeout: 15000 }).catch(() => {});
    await sleep(600);
    return p;
  }
  const visible = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).map((e) => e.id || e.className || e.tagName), sel);

  // ---------------------------------------------------------------- CrazyGames
  const p = await open('cg');
  const st = await p.evaluate(async () => ({
    portal: window.CARO_PORTAL, src: window.CARO_SRC, cls: document.documentElement.className, lang: window.I18N.lang,
    me: window.CaroOnline.state.me, sw: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    install: window.CaroInstall ? window.CaroInstall.kind() : 'none',
  }));
  ok(st.portal === 'crazygames' && st.src === 'crazygames' && /\bportal-crazygames\b/.test(st.cls), 'cờ bản cổng: CARO_PORTAL, CARO_SRC = crazygames, lớp html.portal');
  ok(st.lang === 'en', 'tiếng Anh mặc định (' + st.lang + ')');
  ok(!!st.me && st.me.guest, 'kết nối online từ nguồn của cổng, chơi khách mặc định');
  ok(st.sw === 0 && st.install === 'none', 'không đăng ký service worker, không gợi ý cài ứng dụng');
  ok((await visible(p, '[data-auth], #go-login, #go-register, #google-box, .home-about')).length === 0, 'Trang chủ: không nút đăng nhập / đăng ký');
  await p.click('#tabbar [data-tab="more"]');
  await sleep(400);
  ok((await visible(p, '[data-auth], #go-login, #go-register')).length === 0, 'Xem thêm (thẻ tài khoản): không nút đăng nhập / đăng ký');
  ok(await p.evaluate(() => !!document.querySelector('#account #rename')) && (await visible(p, '#rename, .rename-wrap')).length === 0, 'thẻ tài khoản: khách không có nút Đổi tên');
  const links = await p.evaluate(() => [...document.querySelectorAll('a[href]')].filter((a) => a.getClientRects().length && window.CaroPortal.isExternal(a.href)).map((a) => a.href));
  ok(links.length === 0, 'không link ra ngoài đang hiện' + (links.length ? ': ' + links.slice(0, 3).join(' ') : ''));
  // Mở hộp đăng nhập bằng mã (như các chỗ cần tài khoản): chỉ báo "không có đăng nhập"
  await p.evaluate(() => window.CaroOnline.openAuth('login'));
  await sleep(300);
  const dlg = await p.evaluate(() => ({ auth: document.getElementById('auth').open, info: document.getElementById('confirm-dlg').open ? document.querySelector('#confirm-dlg').textContent : '' }));
  ok(!dlg.auth && /Sign-in is not available/.test(dlg.info), 'cần đăng nhập: báo bản này không có đăng nhập, không mở hộp đăng nhập');
  await p.click('#confirm-ok');
  // Link ra ngoài vẽ thêm lúc chạy, window.open ra ngoài: bị chặn
  const blocked = await p.evaluate(() => {
    const a = document.createElement('a');
    a.href = 'https://example.org/'; a.textContent = 'x'; a.style.cssText = 'display:block!important';
    document.body.appendChild(a);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(ev); a.remove();
    return { nav: !ev.defaultPrevented, win: window.open('https://example.org/') };
  });
  ok(!blocked.nav && blocked.win === null, 'bấm link ra ngoài / window.open ra ngoài: bị chặn');
  ok((await visible(p, '#chat-form input, .cc-form input, #cb')).length === 0 && await p.evaluate(() => !document.querySelector('#cb') || getComputedStyle(document.querySelector('#cb')).display === 'none'), 'không ô chat tự do (bạn bè, CLB)');
  ok((await audit(p)).length === 0, 'Xem thêm ở 390px: 0 lỗi hiển thị');
  await p.click('#tabbar [data-tab="home"]');
  await sleep(300);
  ok((await audit(p)).length === 0, 'Trang chủ ở 390px: 0 lỗi hiển thị');

  // Đấu máy: vào ván → gameplayStart, thắng (luật Việt Nam: 4 mở hai đầu cũng thắng) → gameplayStop
  let ev = await p.evaluate(() => window.__cg.slice());
  ok(ev.join() === 'init,loadingStart,loadingStop', 'SDK: init → loadingStart → loadingStop khi tải xong (' + ev.join() + ')');
  await p.evaluate(() => window.CaroApp.startPreset({ mode: 'ai', human: 1, moves: [[5, 7], [0, 0], [6, 7], [0, 2], [7, 7], [0, 4]] }));
  await sleep(1300);
  ev = await p.evaluate(() => window.__cg.slice());
  ok(ev[ev.length - 1] === 'gameplayStart', 'vào ván với máy: gameplayStart (' + ev.join() + ')');
  await p.evaluate(() => window.__cgMute(true));
  ok(await p.evaluate(() => window.CaroSound.hostMute === true && window.CaroSound.enabled), 'cổng tắt tiếng (muteAudio): game tắt tiếng, không đổi cài đặt của người chơi');
  await p.evaluate(() => window.__cgMute(false));
  await p.evaluate(() => window.CaroApp.tryPlay(8, 7));
  await sleep(1300);
  ev = await p.evaluate(() => window.__cg.slice());
  ok(await p.evaluate(() => !!window.CaroApp.local.winner) && ev.join() === 'init,loadingStart,loadingStop,gameplayStart,gameplayStop', 'thắng ván với máy (khách) → gameplayStop, không gọi trùng (' + ev.join() + ')');
  await p.evaluate(() => window.I18N.setLang('ru'));
  await p.waitForFunction(() => window.I18N.lang === 'ru', null, { timeout: 5000 }).catch(() => {});
  ok(await p.evaluate(() => window.I18N.lang === 'ru'), 'vẫn đổi được ngôn ngữ (gói chuỗi tải theo đường dẫn tương đối)');
  ok(!p.ext.length, 'không tải gì từ nơi khác ngoài gói + máy chủ game' + (p.ext.length ? ': ' + p.ext.slice(0, 3).join(' ') : ''));
  ok(!p.errs.length, 'CrazyGames: không lỗi JS' + (p.errs.length ? ': ' + p.errs.join(' | ') : ''));
  await p.context().close();

  // SDK không tải được: game vẫn chơi được
  const q = await open('cg', { sdk: 'fail' });
  await q.evaluate(() => window.CaroApp.startPreset({ mode: 'ai', human: 1, moves: [[5, 7], [0, 0], [6, 7], [0, 2], [7, 7], [0, 4]] }));
  await sleep(300);
  await q.evaluate(() => window.CaroApp.tryPlay(8, 7));
  await sleep(300);
  ok(await q.evaluate(() => !!window.CaroApp.local.winner && !window.CrazyGames), 'SDK không tải được: vẫn chơi trọn ván với máy');
  ok(!q.errs.length, 'SDK lỗi: không lỗi JS' + (q.errs.length ? ': ' + q.errs.join(' | ') : ''));
  await q.context().close();

  // ---------------------------------------------------------------- itch.io
  const r = await open('itch', { width: 1280 });
  const ist = await r.evaluate(() => ({ portal: window.CARO_PORTAL, src: window.CARO_SRC, sdk: !!document.querySelector('script[src*="crazygames"]'), me: window.CaroOnline.state.me, lang: window.I18N.lang }));
  ok(ist.portal === 'itch' && ist.src === 'itch' && !ist.sdk, 'itch.io: CARO_SRC = itch, không nạp SDK CrazyGames');
  ok(!!ist.me && ist.me.guest && ist.lang === 'en', 'itch.io: khách, online, tiếng Anh');
  ok((await visible(r, '[data-auth], #go-login, #go-register')).length === 0, 'itch.io: thanh trên không có Đăng nhập / Đăng ký');
  ok(!r.errs.length, 'itch.io: không lỗi JS' + (r.errs.length ? ': ' + r.errs.join(' | ') : ''));
  await r.context().close();

  srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  await finish();
})();
