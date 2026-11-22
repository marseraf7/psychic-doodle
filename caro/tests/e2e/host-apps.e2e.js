/*
 * Mini App Telegram / VK (caro/host-detect.js, host.js, host-telegram.js, host-vk.js; máy chủ: server/src/host-embed.js).
 * Thư viện của nền tảng được thay bằng bản giả (chặn yêu cầu tới telegram.org / vendor/vk-bridge.js) ghi lại lệnh gọi:
 *  – Telegram (/?host=tg#tgWebAppData=…, ?tgWebAppStartParam=replay-…): thư viện chính thức được CSP cho nạp, ready / expand /
 *    disableVerticalSwipes, không toàn màn hình nếu không có ?fs=1, giao diện theo colorScheme + màu nút, màu khung theo nền app,
 *    CARO_SRC = telegram, link sâu → ?replay=, nút Back của Telegram hiện / ẩn theo bước lùi và bấm thì lùi, link ra ngoài
 *    qua openLink; giao diện đã tự chọn thì giữ; 0 lỗi hiển thị ở 390px.
 *  – VK (/?vk_app_id=…&sign=…&hash=room-…): VKWebAppInit, giao diện theo VKWebAppGetConfig / VKWebAppUpdateConfig,
 *    CARO_SRC = vk, link sâu → ?room=; bản VK Bridge thật (vendor/) nạp được.
 *  – Trang chính không có dấu hiệu: không nạp gì của Telegram / VK, CaroHost.on = false, CSP vẫn frame-ancestors 'none'.
 *   node caro/tests/e2e/host-apps.e2e.js
 */
'use strict';
const { setup, gotoRetry } = require('./helpers');
const { audit } = require('./ui-audit');

const TG_STUB = `(function () {
  var ev = window.__tg = [];
  var bb = { shown: false, cb: null, show: function () { this.shown = true; }, hide: function () { this.shown = false; }, onClick: function (f) { this.cb = f; } };
  window.Telegram = { WebApp: { platform: 'android', version: '8.0', colorScheme: 'light', themeParams: { button_color: '#2481cc', bg_color: '#ffffff' },
    isVersionAtLeast: function (v) { var a = String(v).split('.'), b = '8.0'.split('.'); return +a[0] < +b[0] || (+a[0] === +b[0] && +(a[1] || 0) <= +b[1]); },
    ready: function () { ev.push('ready'); }, expand: function () { ev.push('expand'); }, requestFullscreen: function () { ev.push('fullscreen'); },
    disableVerticalSwipes: function () { ev.push('noSwipe'); },
    setHeaderColor: function (c) { ev.push('header:' + c); }, setBackgroundColor: function (c) { ev.push('bg:' + c); }, setBottomBarColor: function () {},
    onEvent: function (n, f) { if (n === 'themeChanged') window.__tgTheme = f; },
    enableClosingConfirmation: function () {}, disableClosingConfirmation: function () {},
    openLink: function (u) { ev.push('open:' + u); }, openTelegramLink: function (u) { ev.push('tglink:' + u); }, BackButton: bb } };
})();`;
const VK_STUB = `(function () {
  var ev = window.__vk = [], subs = [];
  window.vkBridge = { send: function (m) { ev.push(m); return Promise.resolve(m === 'VKWebAppGetConfig' ? { appearance: 'dark', app_id: '1' } : { result: true }); },
    subscribe: function (f) { subs.push(f); }, __emit: function (d) { subs.forEach(function (f) { f({ detail: d }); }); } };
})();`;

(async () => {
  const PORT = 8173;
  const { browser, ok, sleep, finish } = await setup(PORT);
  const base = `http://localhost:${PORT}/`;
  const TG_HASH = '#tgWebAppData=' + encodeURIComponent('query_id=AA&user=%7B%22id%22%3A1%7D&auth_date=1&hash=x') + '&tgWebAppVersion=8.0&tgWebAppPlatform=android';

  async function open(url, { stubs = true, theme = null } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript((t) => { localStorage.setItem('caro.lang', 'en'); if (t) localStorage.setItem('caro.theme', t); }, theme);
    const p = await ctx.newPage();
    p.errs = []; p.reqs = []; p.csp = [];
    p.on('pageerror', (e) => p.errs.push(e.message));
    p.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) p.csp.push(m.text()); });
    p.on('request', (r) => p.reqs.push(r.url()));
    await ctx.route('https://telegram.org/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: TG_STUB }));
    if (stubs) await ctx.route('**/vendor/vk-bridge.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: VK_STUB }));
    const res = await gotoRetry(p, url);
    p.headers = res ? await res.allHeaders() : {};
    await p.waitForFunction(() => window.CaroApp && window.CaroShell, null, { timeout: 15000 });
    await sleep(900);
    return p;
  }

  // ---------------------------------------------------------------- Telegram
  const p = await open(base + '?host=tg&tgWebAppStartParam=replay-AbC123' + TG_HASH);
  ok(/frame-ancestors https:\/\/web\.telegram\.org/.test(p.headers['content-security-policy'] || '') && !p.headers['x-frame-options'], 'máy chủ: trang mở làm Mini App được nhúng trong Telegram Web / VK');
  ok(p.reqs.some((u) => u.startsWith('https://telegram.org/js/telegram-web-app.js')) && !p.csp.length, 'nạp thư viện chính thức telegram-web-app.js, CSP cho phép' + (p.csp.length ? ': ' + p.csp[0] : ''));
  const st = await p.evaluate(() => ({ host: window.CARO_HOST, src: window.CARO_SRC, cls: document.documentElement.className, ev: window.__tg.slice(),
    theme: document.documentElement.getAttribute('data-theme'), accent: document.documentElement.style.getPropertyValue('--accent'),
    landing: window.CaroShareLink && window.CaroShareLink.landing, on: window.CaroHost.on }));
  ok(st.host === 'telegram' && st.src === 'telegram' && /\bhost-telegram\b/.test(st.cls) && st.on, 'nhận ra Telegram trước khi thư viện nạp: CARO_HOST / CARO_SRC = telegram');
  ok(['ready', 'expand', 'noSwipe'].every((x) => st.ev.includes(x)) && !st.ev.includes('fullscreen'), 'gọi ready, expand, disableVerticalSwipes; không toàn màn hình khi không có ?fs=1 (' + st.ev.join() + ')');
  ok(st.theme === 'light' && st.accent === '#2481cc', 'giao diện theo Telegram: sáng (colorScheme), màu nút → --accent (' + st.theme + ', ' + st.accent + ')');
  ok(st.ev.some((x) => /^header:#[0-9a-f]{6}$/i.test(x)) && st.ev.some((x) => /^bg:#/.test(x)), 'báo màu nền app cho khung Telegram (setHeaderColor / setBackgroundColor)');
  ok(st.landing === 'replay', 'link sâu startapp=replay-AbC123 → ?replay= (' + st.landing + ')');
  ok(!(await p.evaluate(() => window.Telegram.WebApp.BackButton.shown)), 'Trang chủ: nút Back của Telegram ẩn (nút đóng của Telegram thoát app)');
  await p.click('#tabbar [data-tab="more"]');
  await sleep(700);
  ok(await p.evaluate(() => window.Telegram.WebApp.BackButton.shown), 'trang Xem thêm: nút Back hiện');
  await p.evaluate(() => window.Telegram.WebApp.BackButton.cb());
  await sleep(700);
  ok(await p.evaluate(() => window.CaroShell.current === 'home' && !window.Telegram.WebApp.BackButton.shown), 'bấm Back: về Trang chủ, nút Back ẩn');
  await p.evaluate(() => window.CaroApp.startPreset({ mode: 'ai', moves: [] }));
  await sleep(700);
  ok(await p.evaluate(() => !window.CaroShell.visible && window.Telegram.WebApp.BackButton.shown), 'vào bàn cờ: nút Back hiện');
  await p.evaluate(() => window.Telegram.WebApp.BackButton.cb());
  await sleep(500);
  ok(await p.evaluate(() => window.CaroShell.visible), 'Back trên bàn cờ: về trang đang xem dở');
  const link = await p.evaluate(() => {
    const a = document.createElement('a'); a.href = 'https://example.org/x'; a.textContent = 'x'; document.body.appendChild(a);
    const e = new MouseEvent('click', { bubbles: true, cancelable: true }); a.dispatchEvent(e); a.remove();
    return { prevented: e.defaultPrevented, ev: window.__tg.slice() };
  });
  ok(link.prevented && link.ev.includes('open:https://example.org/x'), 'link ra ngoài: mở bằng Telegram.WebApp.openLink');
  await p.evaluate(() => { window.Telegram.WebApp.colorScheme = 'dark'; window.__tgTheme(); });
  ok(await p.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark' && localStorage.getItem('caro.theme') === null), 'Telegram đổi sang tối: app đổi theo, không lưu vào cài đặt');
  ok((await audit(p)).length === 0, 'Telegram ở 390px: 0 lỗi hiển thị');
  ok(!p.errs.length, 'Telegram: không lỗi JS' + (p.errs.length ? ': ' + p.errs.join(' | ') : ''));
  await p.context().close();

  // ?fs=1: toàn màn hình (Bot API 8.0, điện thoại); giao diện đã tự chọn thì giữ
  const f = await open(base + '?host=tg&fs=1' + TG_HASH, { theme: 'dark' });
  ok(await f.evaluate(() => window.__tg.includes('fullscreen')), '?fs=1: requestFullscreen');
  ok(await f.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark'), 'người chơi đã chọn giao diện tối: giữ, không theo Telegram');
  await f.context().close();

  // ---------------------------------------------------------------- VK
  const VK = '?vk_access_token_settings=&vk_app_id=51234567&vk_are_notifications_enabled=0&vk_is_app_user=1&vk_language=ru&vk_platform=desktop_web&vk_ref=other&vk_ts=1700000000&vk_user_id=1&sign=abcDEF&hash=room-123456';
  const v = await open(base + VK);
  const vs = await v.evaluate(() => ({ host: window.CARO_HOST, src: window.CARO_SRC, ev: window.__vk.slice(), theme: document.documentElement.getAttribute('data-theme'), landing: window.CaroShareLink && window.CaroShareLink.landing, tg: !!window.Telegram }));
  ok(vs.host === 'vk' && vs.src === 'vk' && !vs.tg, 'nhận ra VK (vk_app_id + sign): CARO_HOST / CARO_SRC = vk, không nạp thư viện Telegram');
  ok(vs.ev.includes('VKWebAppInit') && vs.ev.includes('VKWebAppGetConfig'), 'gửi VKWebAppInit (' + vs.ev.join() + ')');
  ok(vs.theme === 'dark', 'giao diện theo VK (VKWebAppGetConfig: tối)');
  ok(vs.landing === 'room', 'link sâu vk.com/app…#room-123456 → ?room=');
  await v.evaluate(() => window.vkBridge.__emit({ type: 'VKWebAppUpdateConfig', data: { appearance: 'light', scheme: 'bright_light' } }));
  ok(await v.evaluate(() => document.documentElement.getAttribute('data-theme') === 'light'), 'VKWebAppUpdateConfig: đổi sang sáng');
  await v.reload();
  await v.waitForFunction(() => window.CaroApp, null, { timeout: 15000 });
  await sleep(500);
  ok(await v.evaluate(() => window.CARO_HOST === 'vk' && sessionStorage.getItem('caro.hostRoute') === 'room-123456'), 'tải lại trong VK: vẫn nhận ra, link sâu đã ghi nhớ (không mở lại)');
  ok(!v.errs.length, 'VK: không lỗi JS' + (v.errs.length ? ': ' + v.errs.join(' | ') : ''));
  await v.context().close();

  // Bản VK Bridge thật (vendor/) nạp được ở trang thường (không trong VK: không gửi được lệnh, nhưng không lỗi)
  const real = await open(base + VK, { stubs: false });
  ok(await real.evaluate(() => typeof window.vkBridge.send === 'function' && typeof window.vkBridge.subscribe === 'function'), 'vendor/vk-bridge.js (bản thật) nạp được, có vkBridge.send / subscribe');
  ok(!real.errs.length, 'VK Bridge thật: không lỗi JS' + (real.errs.length ? ': ' + real.errs.join(' | ') : ''));
  await real.context().close();

  // ---------------------------------------------------------------- Trang chính: không đổi
  const m = await open(base);
  const ms = await m.evaluate(() => ({ host: window.CARO_HOST, src: window.CARO_SRC, on: window.CaroHost.on, cls: document.documentElement.className }));
  ok(!ms.host && !ms.src && !ms.on && !/\bhost\b|portal/.test(ms.cls), 'trang chính: không CARO_HOST / CARO_SRC, không lớp host / portal');
  ok(!m.reqs.some((u) => /telegram\.org|vk-bridge|crazygames/.test(u)), 'trang chính: không tải thư viện Telegram / VK / CrazyGames');
  ok(/frame-ancestors 'none'/.test(m.headers['content-security-policy'] || '') && m.headers['x-frame-options'] === 'DENY', "trang chính: CSP vẫn frame-ancestors 'none', X-Frame-Options DENY");
  await m.context().close();

  await finish();
})();
