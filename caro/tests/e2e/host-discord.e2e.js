/*
 * Discord Activity bản đầu (caro/host-detect.js, host-discord.js, vendor/discord-sdk.js; máy chủ: server/src/host-embed.js,
 * portal-origins.js). Giả lập đúng đường đi thật:
 *  – trang cha giả ở https://discord.com (chặn yêu cầu, trả HTML) có iframe https://<client_id>.discordsays.com/?frame_id=…
 *    &instance_id=…&platform=desktop; mọi yêu cầu tới discordsays.com được chuyển về máy chủ thử (như proxy của Discord) kèm
 *    nguyên header – Chromium kiểm frame-ancestors thật; WebSocket wss://<id>.discordsays.com/ws được nối tiếp tới máy chủ
 *    với Origin https://<id>.discordsays.com (như proxy) – máy chủ phải nhận;
 *  – trang cha trả lời bắt tay RPC (HANDSHAKE → READY) như Discord và ghi lại lệnh SDK gửi lên.
 * Kiểm: CARO_HOST / CARO_SRC = discord, SDK bắt tay đúng client id (lấy từ tên miền), chế độ khách (nút đăng nhập ẩn, bấm
 * đăng nhập → báo "không có đăng nhập"), link ra ngoài ẩn / còn sót thì qua openExternalLink, tạo phòng: hộp Thông tin phòng
 * có mã + mật khẩu, nút mời của Discord (openInviteDialog), không ô link discordsays; 0 lỗi hiển thị ở 390px; trang lạ
 * (https://evil.example) không nhúng được; mở thẳng với tham số Discord (không qua discordsays): thẻ meta client id của máy
 * chủ, không service worker; WebSocket với Origin discordsays.com của app khác bị từ chối; trang chính không đổi.
 *   node caro/tests/e2e/host-discord.e2e.js
 */
'use strict';
const path = require('path');
const { setup, gotoRetry } = require('./helpers');
const { audit } = require('./ui-audit');
const WS = require(path.join(__dirname, '..', '..', '..', 'server', 'node_modules', 'ws'));

const ID = '123456789012345678';
const DS = `https://${ID}.discordsays.com`;
const LAUNCH = '?instance_id=i-1-gc-111-222&location_id=gc-111-222&launch_id=l-1&channel_id=222&frame_id=f-0a1b&platform=desktop&guild_id=111';

// Trang cha giả của Discord: iframe Activity + trả lời RPC (opcode 0 HANDSHAKE → READY; opcode 1 FRAME → trả kết quả)
const parentHtml = (src) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">
<iframe id="act" src="${src}" style="border:0;width:390px;height:844px"></iframe>
<script>
window.__cmds = []; window.__hs = null;
addEventListener('message', function (e) {
  var m = e.data; if (!Array.isArray(m)) return;
  var f = document.getElementById('act').contentWindow, op = m[0], d = m[1] || {};
  if (op === 0) { window.__hs = d; f.postMessage([1, { cmd: 'DISPATCH', evt: 'READY', nonce: null, data: { v: 1, config: { api_endpoint: '//discord.com/api', environment: 'production' } } }], '*'); }
  else if (op === 1 && d.cmd !== 'CAPTURE_LOG') { window.__cmds.push(d); f.postMessage([1, { cmd: d.cmd, evt: null, nonce: d.nonce, data: d.cmd === 'OPEN_EXTERNAL_LINK' ? { opened: true } : null }], '*'); }
});
</script></body></html>`;

(async () => {
  process.env.DISCORD_CLIENT_ID = ID; // máy chủ đọc lúc phục vụ (host-embed.js, portal-origins.js)
  const PORT = 8179;
  const { browser, ok, sleep, finish } = await setup(PORT);
  const base = `http://localhost:${PORT}`;
  let wsUp = 0, wsRefused = 0;

  async function context() {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { localStorage.setItem('caro.lang', 'en'); } catch (e) { /* trang cha */ } });
    // Proxy của Discord: discordsays.com → máy chủ thử, giữ nguyên header (CSP / X-Frame-Options)
    await ctx.route(DS + '/**', async (route) => {
      const res = await route.fetch({ url: route.request().url().replace(DS, base) });
      await route.fulfill({ response: res });
    });
    await ctx.routeWebSocket(new RegExp('^wss://' + ID + '\\.discordsays\\.com/ws'), (ws) => {
      const up = new WS(`ws://localhost:${PORT}/ws`, { headers: { origin: DS } });
      const queue = [];
      up.on('open', () => { wsUp++; queue.splice(0).forEach((m) => up.send(m)); });
      up.on('unexpected-response', () => { wsRefused++; ws.close(); });
      up.on('error', () => {});
      up.on('message', (data, bin) => ws.send(bin ? data : data.toString()));
      up.on('close', () => ws.close());
      ws.onMessage((m) => (up.readyState === 1 ? up.send(m) : queue.push(m)));
      ws.onClose(() => up.close());
    });
    return ctx;
  }

  async function openInDiscord(parentOrigin) {
    const ctx = await context();
    await ctx.route(parentOrigin + '/activity', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: parentHtml(DS + '/' + LAUNCH) }));
    const p = await ctx.newPage();
    p.errs = []; p.csp = [];
    p.on('pageerror', (e) => p.errs.push(e.message));
    p.on('console', (m) => { if (/Content Security Policy|frame-ancestors/i.test(m.text())) p.csp.push(m.text()); });
    await gotoRetry(p, parentOrigin + '/activity');
    return p;
  }
  const frameOf = (p) => p.frames().find((f) => f.url().startsWith(DS));

  // ---------------------------------------------------------------- Trong Discord (trang cha discord.com)
  const p = await openInDiscord('https://discord.com');
  let f = null;
  for (let i = 0; i < 60 && !(f && await f.evaluate(() => !!(window.CaroApp && window.CaroShell)).catch(() => false)); i++) { await sleep(250); f = frameOf(p); }
  ok(!!f, 'frame-ancestors cho discord.com: Activity nạp được trong iframe' + (p.csp.length ? ' (CSP: ' + p.csp[0] + ')' : ''));
  if (!f) { await finish(); return; }
  await sleep(1200);
  const st = await f.evaluate(() => ({ host: window.CARO_HOST, src: window.CARO_SRC, cls: document.documentElement.className,
    sdk: !!(window.CaroDiscord && window.CaroDiscord.sdk), portal: !!(window.CaroPortal && window.CaroPortal.on),
    sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller), launch: sessionStorage.getItem('caro.discordLaunch') }));
  ok(st.host === 'discord' && st.src === 'discord' && /\bhost-discord\b/.test(st.cls), 'nhận ra Discord: CARO_HOST / CARO_SRC = discord, lớp html.host-discord');
  ok(st.sdk && st.portal && st.launch === LAUNCH, 'tạo SDK, chế độ khách (CaroPortal.on), nhớ tham số khởi chạy');
  const hs = await p.evaluate(() => window.__hs);
  ok(hs && hs.client_id === ID && hs.frame_id === 'f-0a1b' && hs.v === 1, 'bắt tay RPC với Discord: client id lấy từ tên miền discordsays.com (' + JSON.stringify(hs) + ')');
  ok(await f.evaluate(() => window.CaroDiscord.sdk.isReady), 'SDK ready() sau READY của Discord');

  // Chế độ khách
  const guest = await f.evaluate(() => {
    const vis = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none' && e.offsetParent !== null; };
    return { login: vis('go-login'), reg: vis('go-register') };
  });
  ok(!guest.login && !guest.reg, 'không nút Đăng nhập / Đăng ký');
  await f.evaluate(() => document.getElementById('go-login').click());
  await sleep(400);
  const info = await f.evaluate(() => ({ open: document.getElementById('confirm-dlg').open, q: document.getElementById('confirm-q').textContent }));
  ok(info.open && /Sign-in is not available/.test(info.q) && !(await f.evaluate(() => document.getElementById('auth-dlg') && document.getElementById('auth-dlg').open)), 'bấm đăng nhập: báo "bản này không có đăng nhập", không mở hộp đăng nhập (' + info.q + ')');
  await f.evaluate(() => document.getElementById('confirm-ok').click());
  await sleep(300);

  // Link ra ngoài: ẩn; còn sót (vẽ sau) thì Discord mở bằng openExternalLink
  const links = await f.evaluate(() => [...document.querySelectorAll('a[href^="http"]')].filter((a) => a.offsetParent !== null && new URL(a.href).origin !== location.origin).length);
  ok(links === 0, 'không link ra ngoài nào hiện (' + links + ')');
  const ext = await f.evaluate(() => {
    const a = document.createElement('a'); a.href = 'https://example.org/x'; a.style.display = 'inline'; a.textContent = 'x'; document.body.appendChild(a);
    const e = new MouseEvent('click', { bubbles: true, cancelable: true }); a.dispatchEvent(e); a.remove();
    return e.defaultPrevented;
  });
  await f.evaluate(() => window.open('https://example.org/y', '_blank'));
  await sleep(400);
  const cmds = await p.evaluate(() => window.__cmds.map((c) => c.cmd + (c.args && c.args.url ? ':' + c.args.url : '')));
  ok(ext && cmds.includes('OPEN_EXTERNAL_LINK:https://example.org/x') && cmds.includes('OPEN_EXTERNAL_LINK:https://example.org/y'), 'link / window.open ra ngoài → openExternalLink (' + cmds.join() + ')');

  // Phòng chơi: WebSocket qua "proxy" (Origin discordsays.com) được máy chủ nhận; tạo phòng → hộp Thông tin phòng
  for (let i = 0; i < 40 && !(await f.evaluate(() => window.CaroOnline && window.CaroOnline.state.status === 'online')); i++) await sleep(250);
  ok(wsUp > 0 && !wsRefused && await f.evaluate(() => window.CaroOnline.state.status === 'online'), `WebSocket Origin ${DS} được máy chủ nhận, trực tuyến (mở ${wsUp}, từ chối ${wsRefused})`);
  await f.evaluate(() => window.CaroHome && window.CaroHome.open());
  await sleep(300);
  await f.click('.home-tabs [data-hpane="lobby"]');
  await f.click('#create-room');
  let room = null;
  for (let i = 0; i < 20 && !(room = await f.evaluate(() => window.CaroOnline.state.room)); i++) await sleep(250);
  await sleep(500);
  const ri = await f.evaluate(() => {
    const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
    const $ = (id) => document.getElementById(id);
    return { open: $('room-info').open, code: $('ri-code').textContent, pass: $('ri-pass').textContent, btn: vis($('ri-discord')), btnText: $('ri-discord').textContent,
      hint: vis($('ri-discord-hint')) ? $('ri-discord-hint').textContent : '', link: vis($('ri-link')), share: vis($('ri-share')), oldHint: vis($('ri-hint')) };
  });
  ok(room && ri.open && ri.code === room.code && /^\d{4}$/.test(ri.pass), 'tạo phòng: hộp Thông tin phòng có mã ' + ri.code + ' + mật khẩu');
  ok(ri.btn && ri.btnText === 'Invite on Discord' && /Join with code/.test(ri.hint), 'nút "Invite on Discord" + câu hướng dẫn vào bằng mã (' + ri.hint + ')');
  ok(!ri.link && !ri.share && !ri.oldHint, 'không ô link discordsays.com / nút chia sẻ / câu "mở link"');
  ok((await audit(f)).length === 0, 'Thông tin phòng trong Discord ở 390px: 0 lỗi hiển thị');
  await f.click('#ri-discord');
  await sleep(400);
  ok((await p.evaluate(() => window.__cmds.map((c) => c.cmd))).includes('OPEN_INVITE_DIALOG'), 'bấm mời: openInviteDialog');
  await f.evaluate(() => document.getElementById('room-info').close());
  ok((await audit(f)).length === 0, 'Trang chủ trong Discord ở 390px: 0 lỗi hiển thị');
  ok(!p.errs.length, 'không lỗi JS' + (p.errs.length ? ': ' + p.errs.join(' | ') : ''));
  await p.context().close();

  // ---------------------------------------------------------------- Trang lạ không nhúng được
  const e = await openInDiscord('https://evil.example');
  await sleep(2500);
  const ef = frameOf(e);
  const loaded = ef ? await ef.evaluate(() => !!window.CaroApp).catch(() => false) : false;
  ok(!loaded && e.csp.some((x) => /frame-ancestors/.test(x)), 'trang lạ (https://evil.example) không nhúng được Activity – trình duyệt chặn theo frame-ancestors (' + (e.csp[0] || '').slice(0, 90) + '…)');
  await e.context().close();

  // ---------------------------------------------------------------- Mở thẳng với tham số Discord (không qua discordsays)
  const ctx = await context();
  const d = await ctx.newPage();
  d.errs = []; d.reqs = [];
  d.on('pageerror', (x) => d.errs.push(x.message));
  d.on('request', (r) => d.reqs.push(r.url()));
  const res = await gotoRetry(d, base + '/' + LAUNCH);
  await d.waitForFunction(() => window.CaroApp && window.CaroShell, null, { timeout: 15000 });
  await sleep(800);
  const h = res ? await res.allHeaders() : {};
  ok(/frame-ancestors https:\/\/discord\.com /.test(h['content-security-policy'] || '') && !h['x-frame-options'], 'máy chủ: lượt mở Activity có frame-ancestors Discord, bỏ X-Frame-Options');
  const ds = await d.evaluate(() => ({ meta: (document.querySelector('meta[name="caro-discord-client-id"]') || {}).content, sdk: !!(window.CaroDiscord && window.CaroDiscord.sdk),
    lib: typeof window.DiscordSDK, swUsable: window.CaroSW ? window.CaroSW.status().state : 'none' }));
  ok(ds.meta === ID && ds.sdk && ds.lib === 'object', 'thẻ meta client id từ DISCORD_CLIENT_ID → SDK tạo được (' + JSON.stringify(ds) + ')');
  ok(d.reqs.some((u) => u.endsWith('/vendor/discord-sdk.js')) && ds.swUsable !== 'active' && ds.swUsable !== 'installing', 'nạp vendor/discord-sdk.js tự phục vụ; không service worker (' + ds.swUsable + ')');
  ok(!d.errs.length, 'mở thẳng: không lỗi JS' + (d.errs.length ? ': ' + d.errs.join(' | ') : ''));
  await ctx.close();

  // ---------------------------------------------------------------- WebSocket từ Activity của app khác: từ chối
  const other = await new Promise((done) => {
    const w = new WS(`ws://localhost:${PORT}/ws`, { headers: { origin: 'https://111111111111111111.discordsays.com' } });
    w.on('open', () => { w.close(); done('open'); });
    w.on('unexpected-response', (q, r) => done(String(r.statusCode)));
    w.on('error', () => done('error'));
  });
  ok(other !== 'open', 'WebSocket Origin discordsays.com của app khác bị từ chối (' + other + ')');

  // ---------------------------------------------------------------- Trang chính: không đổi
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const m = await mctx.newPage();
  m.reqs = [];
  m.on('request', (r) => m.reqs.push(r.url()));
  const mres = await gotoRetry(m, base + '/?room=123456');
  await m.waitForFunction(() => window.CaroApp, null, { timeout: 15000 });
  await sleep(500);
  const mh = await mres.allHeaders();
  ok(await m.evaluate(() => !window.CARO_HOST && !window.CaroDiscord.on && !document.querySelector('meta[name="caro-discord-client-id"]')), 'trang chính: không Discord, không thẻ meta');
  ok(!m.reqs.some((u) => /discord-sdk/.test(u)) && /frame-ancestors 'none'/.test(mh['content-security-policy']), "trang chính: không tải SDK Discord, CSP vẫn frame-ancestors 'none'");
  await mctx.close();

  await finish();
})();
