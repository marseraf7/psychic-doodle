/*
 * Bản CrazyGames FULL LAUNCH (làm sẵn, tắt mặc định – build-portal.js crazygames --full; caro/portal-crazygames-full.js).
 * Máy chủ game bật CRAZYGAMES_GAME_ID với JWKS giả (khoá RSA sinh trong bài thử); SDK giả có module ad / user / game.
 *  – Khách chưa đăng nhập CrazyGames: nút nhỏ "Log in with CrazyGames"; bấm → hộp đăng nhập của CrazyGames → token → tài khoản
 *    Caro mới gắn tài khoản CrazyGames (cg_…), không có nút Đăng xuất; Trang chủ không ghi "no ads".
 *  – Hết ván với máy → quảng cáo midgame: che màn hình + tắt tiếng chỉ khi quảng cáo chạy, xong thì trả lại; ván sau ngay đó
 *    không xin thêm (khoảng cách 3 phút); bị chặn quảng cáo → chơi tiếp bình thường.
 *  – Đổi người dùng CrazyGames trên cùng máy → đăng xuất phiên cũ, vào tài khoản của người mới; CrazyGames đăng xuất → khách.
 *  – Link mời phòng lấy từ SDK; mở từ link mời → vào phòng (xem). 390px: 0 lỗi hiển thị.
 *   node caro/tests/e2e/portal-cg-full.e2e.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { gotoRetry } = require('./helpers');
const { audit } = require('./ui-audit');
const { buildPortal, SDK_URL } = require('../../../server/scripts/build-portal.js');
const { makeHostAuth } = require('../../../server/src/host-auth.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.webp': 'image/webp' };
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

const GAME = 'caro-e2e-game';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWKS = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'ingame-auth', use: 'sig', alg: 'RS256' }] };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(userId, username) {
  const s = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'RS256', typ: 'JWT', kid: 'ingame-auth' });
  const p = b64({ userId, gameId: GAME, username, profilePictureUrl: '', iat: s, exp: s + 3600 });
  return h + '.' + p + '.' + crypto.sign('sha256', Buffer.from(h + '.' + p), privateKey).toString('base64url');
}

// SDK giả: sự kiện vào window.__cg; người dùng / token đặt sẵn qua window.__cgUserObj / __cgToken (addInitScript);
// showAuthPrompt "đăng nhập" bằng __cgPromptUser / __cgPromptToken; quảng cáo: __cgAd = 'play' | 'block'
const STUB = `(function () {
  var ev = window.__cg = [], fns = [], authFns = [];
  var settings = { muteAudio: false, disableChat: false };
  var game = { settings: settings,
    loadingStart: function () { ev.push('loadingStart'); }, loadingStop: function () { ev.push('loadingStop'); },
    gameplayStart: function () { ev.push('gameplayStart'); }, gameplayStop: function () { ev.push('gameplayStop'); },
    addSettingsChangeListener: function (f) { fns.push(f); },
    inviteLink: function (p) { return 'https://www.crazygames.com/game/caro-x-gomoku?room=' + p.room; },
    getInviteParam: function (k) { return (window.__cgInvite || {})[k] || null; } };
  var ad = { requestAd: function (type, cb) {
      ev.push('ad:' + type);
      if ((window.__cgAd || 'play') === 'play') {
        setTimeout(function () { cb.adStarted(); setTimeout(function () { cb.adFinished(); }, 600); }, 50);
      } else setTimeout(function () { cb.adError({ code: 'adblock', message: 'blocked' }); }, 50);
    }, hasAdblock: function () { return Promise.resolve(false); } };
  var user = { isUserAccountAvailable: true,
    getUser: function () { return Promise.resolve(window.__cgUserObj || null); },
    getUserToken: function (o) { ev.push('token:' + (o && o.signingKeyType)); return window.__cgToken ? Promise.resolve(window.__cgToken) : Promise.reject({ code: 'userNotAuthenticated' }); },
    addAuthListener: function (f) { authFns.push(f); },
    showAuthPrompt: function () {
      ev.push('authPrompt');
      window.__cgUserObj = window.__cgPromptUser; window.__cgToken = window.__cgPromptToken;
      setTimeout(function () { authFns.forEach(function (f) { f(window.__cgUserObj); }); }, 0);
      return Promise.resolve(window.__cgUserObj);
    } };
  window.CrazyGames = { SDK: { environment: 'crazygames', game: game, ad: ad, user: user, init: function () { ev.push('init'); return Promise.resolve(); } } };
})();`;

(async () => {
  const PORT = 8181, PORT2 = 8182;
  process.env.PORTAL_WS_ORIGINS = `http://127.0.0.1:${PORT2}`;
  const { start } = require('../../../server/server.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-cgfull-'));
  const hostAuth = makeHostAuth({ CRAZYGAMES_GAME_ID: GAME }, () => {}, { fetchJwks: async () => JWKS });
  const app = start({ port: PORT, dataFile: path.join(tmp, 'caro.db'), admins: ['boss'], hostAuth });
  await new Promise((r) => (app.server.listening ? r() : app.server.once('listening', r)));
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  let failed = 0;
  const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) { failed++; process.exitCode = 1; } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const full = buildPortal({ mode: 'crazygames', full: true, server: `http://localhost:${PORT}`, out: path.join(tmp, 'cg'), zip: false, allowHttp: true });
  ok(!full.problems.length, 'đóng gói bản Full đạt giới hạn' + full.problems.join(' | '));
  const html = fs.readFileSync(path.join(full.out, 'index.html'), 'utf8');
  ok(/portal-crazygames-full\.js/.test(html) && !/ad-free/.test(html) && /CARO_CG_FULL = true/.test(fs.readFileSync(path.join(full.out, 'portal-config.js'), 'utf8')), 'gói Full: có module Full + cờ CARO_CG_FULL, không còn chữ "ad-free"');
  const srv = await serveDir(tmp, PORT2);
  const base = `http://127.0.0.1:${PORT2}/cg/`;

  /** Mở gói Full trong hồ sơ ctx (mới nếu không truyền). init: biến đặt trước khi trang chạy (người dùng CrazyGames…). */
  async function open(init = {}, ctx = null) {
    ctx = ctx || await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route(SDK_URL, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }));
    const p = await ctx.newPage();
    await p.addInitScript((v) => { Object.assign(window, v); }, init);
    p.errs = []; p.out = [];
    p.on('pageerror', (e) => p.errs.push(e.message));
    p.on('websocket', (ws) => ws.on('framesent', (f) => { if (typeof f.payload === 'string') p.out.push(f.payload); }));
    await gotoRetry(p, base);
    await p.waitForFunction(() => window.CaroOnline && window.CaroOnline.connected, null, { timeout: 15000 }).catch(() => {});
    await sleep(800);
    return p;
  }
  const me = (p) => p.evaluate(() => window.CaroOnline.state.me);
  const waitFor = (p, fn, arg, ms = 10000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const visible = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).length, sel);
  const winVsAi = async (p) => {
    await p.evaluate(() => window.CaroApp.startPreset({ mode: 'ai', human: 1, moves: [[5, 7], [0, 0], [6, 7], [0, 2], [7, 7], [0, 4]] }));
    await sleep(900);
    await p.evaluate(() => window.CaroApp.tryPlay(8, 7));
  };

  // ---------------------------------------------------------------- Khách → đăng nhập CrazyGames → tài khoản Caro
  const a = await open({ __cgPromptUser: { username: 'Neko.77', __dangerousUserId: 'cgU1', profilePictureUrl: '' }, __cgPromptToken: token('cgU1', 'Neko.77') });
  ok((await me(a)).guest, 'chưa đăng nhập CrazyGames: chơi khách');
  ok(!/no ads|ad-free/i.test(await a.textContent('.home-intro')), 'Trang chủ: câu giới thiệu không nhắc "không quảng cáo" (' + (await a.textContent('.home-intro')) + ')');
  await a.click('#tabbar [data-tab="more"]');
  ok(await waitFor(a, () => document.getElementById('cg-login')), 'thẻ tài khoản: nút nhỏ "Log in with CrazyGames"');
  ok(/Log in with CrazyGames/.test(await a.textContent('#cg-login')) && await a.evaluate(() => document.getElementById('cg-login').classList.contains('ghost')), 'nút phụ (ghost), đúng chữ');
  ok((await audit(a)).length === 0, 'thẻ tài khoản có nút CrazyGames ở 390px: 0 lỗi hiển thị');
  await a.click('#cg-login');
  ok(await waitFor(a, () => window.CaroOnline.state.me && !window.CaroOnline.state.me.guest), 'đăng nhập CrazyGames → vào tài khoản Caro');
  const m1 = await me(a);
  ok(/^cg_[a-z0-9]{8}$/.test(m1.username) && m1.name === 'Neko.77' && (m1.hosts || []).includes('crazygames'), `tài khoản mới gắn CrazyGames, tên từ username (@${m1.username}, ${m1.name})`);
  ok(await a.evaluate(() => window.__cg.includes('token:IN_GAME_AUTH') && localStorage.getItem('caro.cgUser') === 'cgU1'), 'token lấy bằng IN_GAME_AUTH; nhớ id CrazyGames của phiên');
  await sleep(500);
  ok(await visible(a, '#logout') === 0 && await visible(a, '#cg-login') === 0, 'đã đăng nhập: không có nút Đăng xuất, không còn nút CrazyGames');

  // ---------------------------------------------------------------- Quảng cáo midgame
  await a.click('#tabbar [data-tab="home"]');
  await winVsAi(a);
  ok(await waitFor(a, () => !!document.getElementById('cg-ad-cover'), null, 5000), 'hết ván với máy → quảng cáo midgame: màn che hiện khi quảng cáo chạy');
  ok(await a.evaluate(() => window.CaroSound.hostMute === true), 'đang quảng cáo: tắt tiếng game');
  ok(await waitFor(a, () => !document.getElementById('cg-ad-cover'), null, 5000) && await a.evaluate(() => window.CaroSound.hostMute === false), 'quảng cáo xong: bỏ màn che, trả lại tiếng');
  await winVsAi(a);
  await sleep(2500);
  ok(await a.evaluate(() => window.__cg.filter((e) => e === 'ad:midgame').length === 1), 'ván sau ngay đó: không xin quảng cáo thêm (cách nhau ≥ 3 phút)');
  ok(!a.errs.length, 'tài khoản + quảng cáo: không lỗi JS' + (a.errs.length ? ': ' + a.errs.join(' | ') : ''));
  const ctxA = a.context();
  await a.close();

  // ---------------------------------------------------------------- Đổi người dùng CrazyGames trên cùng máy / đăng xuất CrazyGames
  const b = await open({ __cgUserObj: { username: 'Other_22', __dangerousUserId: 'cgU2' }, __cgToken: token('cgU2', 'Other_22') }, ctxA);
  ok(await waitFor(b, (uid) => { const m = window.CaroOnline.state.me; return m && !m.guest && m.uid !== uid; }, m1.uid, 15000), 'người dùng CrazyGames khác trên cùng máy → đăng xuất phiên cũ, vào tài khoản của người mới');
  const m2 = await me(b);
  ok(m2.name === 'Other_22' && m2.uid !== m1.uid, 'tài khoản của người mới (' + m2.name + ')');
  await b.close();
  const c = await open({}, ctxA);
  ok(await waitFor(c, () => window.CaroOnline.state.me && window.CaroOnline.state.me.guest, null, 15000), 'CrazyGames đăng xuất (không còn người dùng) → game về khách');
  await c.close();
  const d = await open({ __cgUserObj: { username: 'Neko.77', __dangerousUserId: 'cgU1' }, __cgToken: token('cgU1', 'Neko.77') }, ctxA);
  ok(await waitFor(d, (uid) => window.CaroOnline.state.me && window.CaroOnline.state.me.uid === uid, m1.uid, 15000), 'người dùng cũ đăng nhập lại CrazyGames → đúng tài khoản cũ');
  await ctxA.close();

  // ---------------------------------------------------------------- Bị chặn quảng cáo; link mời
  const f = await open({ __cgInvite: { room: '654321' } });
  ok(await waitFor(f, () => window.CaroInvite && window.CaroInvite('123456') === 'https://www.crazygames.com/game/caro-x-gomoku?room=123456'), 'link mời phòng lấy từ SDK (inviteLink)');
  ok(f.out.some((s) => s.includes('"t":"watch"') && s.includes('654321')), 'mở từ link mời (getInviteParam room) → vào phòng (xem)');
  ok(!f.errs.length, 'link mời: không lỗi JS' + (f.errs.length ? ': ' + f.errs.join(' | ') : ''));
  await f.context().close();
  const e = await open({ __cgAd: 'block' });
  await winVsAi(e);
  await sleep(2500);
  ok(await e.evaluate(() => window.__cg.includes('ad:midgame') && !document.getElementById('cg-ad-cover') && window.CaroSound.hostMute === false), 'bị chặn quảng cáo: không màn che, không tắt tiếng, chơi tiếp');
  // Ván mới: app hỏi "Lưu lịch sử đấu?" cho ván vừa xong (#lh-ask) rồi mới tạo ván – trả lời như người chơi
  await e.evaluate(() => window.CaroApp.startPreset({ mode: 'ai', human: 1, moves: [] }));
  await sleep(300);
  await e.evaluate(() => { const d = document.getElementById('lh-ask'); if (d && d.open) d.close(); });
  await sleep(800);
  const st = await e.evaluate(() => ({ w: window.CaroApp.local.winner, cover: !!document.getElementById('cg-ad-cover') }));
  ok(!st.w && !st.cover, 'ván mới chơi được bình thường sau khi quảng cáo lỗi (' + JSON.stringify(st) + ')');
  ok(!e.errs.length, 'chặn quảng cáo: không lỗi JS' + (e.errs.length ? ': ' + e.errs.join(' | ') : ''));
  await e.context().close();

  await browser.close();
  srv.close();
  await app.stop();
  console.log(failed ? `${failed} bước KHÔNG đạt` : 'Tất cả đạt');
  process.exit(failed ? 1 : 0);
})();
