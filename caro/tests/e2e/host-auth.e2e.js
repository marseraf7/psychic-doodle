/*
 * Đăng nhập bằng Telegram / VK Mini App (caro/host-auth.js; máy chủ: server/src/host-auth.js, server/src/hub/host-login.js).
 * Máy chủ thử được cấu hình token bot / khoá VK GIẢ (biến môi trường đặt trước khi bật máy chủ); trang được mở như Mini App:
 *  – Telegram: /?host=tg#tgWebAppData=… với window.Telegram.WebApp giả (chặn yêu cầu tới telegram.org) có initData ký bằng
 *    token giả; VK: /?vk_…&sign=… ký bằng khoá giả, VK Bridge giả.
 * Kiểm: khách chưa liên kết thấy nút "Lưu tiến độ bằng Telegram" → tạo tài khoản, tiến độ Giải đố trên máy mang sang; mở lại
 * ở trình duyệt mới (mất dữ liệu) → đăng nhập im lặng đúng tài khoản; đăng xuất thì không tự vào lại; tài khoản Caro có sẵn →
 * nút Liên kết + hộp xác nhận; huỷ liên kết ở Cài đặt tài khoản (tài khoản chỉ có Telegram: cảnh báo rõ); VK: tạo tài khoản,
 * sign bị bỏ khỏi địa chỉ (giữ trong sessionStorage), mở lại đăng nhập im lặng; ngoài Mini App không có nút, không gửi gì;
 * 0 lỗi hiển thị ở 390px.
 *   node caro/tests/e2e/host-auth.e2e.js
 */
'use strict';
const crypto = require('crypto');
const { setup, gotoRetry } = require('./helpers');
const { audit } = require('./ui-audit');

// Bí mật GIẢ của bài thử – máy chủ thử đọc từ biến môi trường như máy chủ thật
const TG_TOKEN = '987654321:E2E-fake-bot-token_abcdefghijklmn';
const VK_SECRET = 'e2eFakeVkSecret';
const VK_APP = '51234567';
process.env.TELEGRAM_BOT_TOKEN = TG_TOKEN;
process.env.VK_APP_SECRET = VK_SECRET;
process.env.VK_APP_ID = VK_APP;

const sec = () => Math.floor(Date.now() / 1000);
function tgInit(id, first) {
  const f = { query_id: 'AAE' + id, user: JSON.stringify({ id, first_name: first, username: 'u' + id, language_code: 'en' }), auth_date: String(sec()), signature: 'c2ln' };
  const dcs = Object.keys(f).sort().map((k) => k + '=' + f[k]).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TG_TOKEN).digest();
  const q = new URLSearchParams(f);
  q.append('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'));
  return q.toString();
}
function vkSearch(id) {
  const p = { vk_access_token_settings: '', vk_app_id: VK_APP, vk_are_notifications_enabled: '0', vk_is_app_user: '1', vk_language: 'en', vk_platform: 'desktop_web', vk_ref: 'other', vk_ts: String(sec()), vk_user_id: String(id) };
  const str = Object.keys(p).sort().map((k) => k + '=' + encodeURIComponent(p[k])).join('&');
  return '?' + Object.keys(p).map((k) => k + '=' + encodeURIComponent(p[k])).join('&') + '&sign=' + crypto.createHmac('sha256', VK_SECRET).update(str).digest('base64url');
}
const tgStub = (init) => `(function () {
  window.Telegram = { WebApp: { initData: ${JSON.stringify(init)}, platform: 'android', version: '8.0', colorScheme: 'light', themeParams: {},
    isVersionAtLeast: function () { return true; }, ready: function () {}, expand: function () {}, disableVerticalSwipes: function () {},
    setHeaderColor: function () {}, setBackgroundColor: function () {}, setBottomBarColor: function () {}, onEvent: function () {},
    enableClosingConfirmation: function () {}, disableClosingConfirmation: function () {}, openLink: function () {}, openTelegramLink: function () {},
    BackButton: { show: function () {}, hide: function () {}, onClick: function () {} } } };
})();`;
const VK_STUB = `(function () {
  window.vkBridge = { send: function (m) { return m === 'VKWebAppGetUserInfo' ? Promise.resolve({ id: 1, first_name: 'Pyotr' }) : Promise.resolve({ result: true }); },
    subscribe: function () {} };
})();`;

(async () => {
  const PORT = 8174;
  const { app, browser, ok, shot, sleep, finish } = await setup(PORT);
  const base = `http://localhost:${PORT}/`;

  /** Mở trang (hồ sơ trình duyệt mới). init: initData Telegram giả; puzzles: tiến độ Giải đố khách sẵn trên máy. */
  async function open(url, { init = '', puzzles = null } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript((pz) => {
      if (!localStorage.getItem('caro.lang')) localStorage.setItem('caro.lang', 'en');
      if (pz && !localStorage.getItem('caro.puzzles')) localStorage.setItem('caro.puzzles', pz);
    }, puzzles);
    const p = await ctx.newPage();
    p.errs = []; p.out = [];
    p.on('pageerror', (e) => p.errs.push(e.message));
    p.on('websocket', (ws) => ws.on('framesent', (f) => { if (typeof f.payload === 'string') p.out.push(f.payload); }));
    await ctx.route('https://telegram.org/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: tgStub(init) }));
    await ctx.route('**/vendor/vk-bridge.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: VK_STUB }));
    await gotoRetry(p, url);
    await p.waitForFunction(() => window.CaroApp && window.CaroShell && window.CaroOnline, null, { timeout: 15000 });
    await p.waitForFunction(() => window.CaroOnline.connected, null, { timeout: 15000 });
    return p;
  }
  const me = (p) => p.evaluate(() => window.CaroOnline.state.me);
  const toMore = async (p) => { await p.click('#tabbar [data-tab="more"]'); await sleep(500); };
  const waitFor = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 10000 }).then(() => true, () => false);
  const confirmOk = async (p) => { await waitFor(p, () => document.getElementById('confirm-dlg').open); await p.click('#confirm-ok'); };
  const tgUrl = (init) => base + '?host=tg#tgWebAppData=' + encodeURIComponent(init) + '&tgWebAppVersion=8.0&tgWebAppPlatform=android';

  // ---------------------------------------------------------------- Telegram: khách chưa liên kết → tạo tài khoản
  const init1 = tgInit(424242, 'Masha');
  const a = await open(tgUrl(init1), { init: init1, puzzles: JSON.stringify({ r: 1234, n: 7, ok: 5, best: 3 }) });
  ok(await waitFor(a, () => window.CaroHostAuth && window.CaroHostAuth.state === 'unlinked'), 'khách chưa liên kết: thử im lặng → máy chủ báo chưa liên kết (không tự tạo tài khoản)');
  ok(a.out.some((s) => s.includes('"t":"hostLogin"') && s.includes('"mode":"auto"')), 'gửi hostLogin mode auto kèm initData');
  await toMore(a);
  ok(await a.isVisible('#host-auth-save') && /Save progress with Telegram/.test(await a.textContent('#host-auth-save')), 'thẻ tài khoản: nút "Save progress with Telegram"');
  ok((await audit(a)).length === 0, 'thẻ tài khoản có nút Telegram ở 390px: 0 lỗi hiển thị');
  await a.evaluate(() => document.getElementById('host-auth-save').scrollIntoView({ block: 'center' }));
  await a.screenshot({ path: require('path').join(process.env.E2E_OUT || require('os').tmpdir(), 'hostauth-guest.png') });
  await a.click('#host-auth-save');
  ok(await waitFor(a, () => window.CaroOnline.state.me && !window.CaroOnline.state.me.guest), 'bấm nút: tạo tài khoản, đăng nhập');
  const m1 = await me(a);
  ok(/^tg_[a-z0-9]{8}$/.test(m1.username) && m1.name === 'Masha' && !m1.hasPassword && (m1.hosts || []).includes('telegram'), `tài khoản mới không mật khẩu, tên từ Telegram, username tự sinh (@${m1.username})`);
  ok(await waitFor(a, () => document.querySelector('#host-auth-row .tag')), 'thẻ tài khoản: "✓ Telegram linked"');
  await sleep(1500);
  const pr = app.store.progressGet(m1.uid);
  ok(pr && pr.pz && pr.pz.n >= 7, 'tiến độ Giải đố của khách mang sang tài khoản mới (' + JSON.stringify(pr && pr.pz && pr.pz.n) + ')');
  // Đăng xuất trong Mini App: không tự đăng nhập lại ngay
  await a.evaluate(() => window.CaroOnline.send({ t: 'logout' }));
  await sleep(2500);
  ok((await me(a)).guest && await a.evaluate(() => sessionStorage.getItem('caro.hostNoAuto') === '1'), 'đăng xuất: phiên này không tự đăng nhập lại');
  ok(await a.isVisible('#host-auth-save'), 'sau đăng xuất: nút Telegram vẫn có để tự đăng nhập lại');
  ok(!a.errs.length, 'Telegram (tạo tài khoản): không lỗi JS' + (a.errs.length ? ': ' + a.errs.join(' | ') : ''));
  await a.context().close();

  // Mở lại ở hồ sơ trình duyệt mới (như xoá dữ liệu trình duyệt) → đăng nhập im lặng đúng tài khoản
  const init1b = tgInit(424242, 'Masha');
  const b = await open(tgUrl(init1b), { init: init1b });
  ok(await waitFor(b, (uid) => window.CaroOnline.state.me && window.CaroOnline.state.me.uid === uid, m1.uid), 'mở lại (mất dữ liệu trình duyệt): đăng nhập im lặng đúng tài khoản');
  await toMore(b);
  ok(!(await b.$('#host-auth-save')), 'đã đăng nhập: không còn nút Lưu tiến độ');
  // Huỷ liên kết (tài khoản chỉ có Telegram): cảnh báo rõ, bấm Huỷ thì giữ nguyên
  await b.evaluate(() => window.CaroSocial.open('account'));
  ok(await waitFor(b, () => !document.getElementById('hostlinks-card').hidden), 'Cài đặt tài khoản: mục Telegram và VK');
  ok(await b.isVisible('#hostlinks-note'), 'tài khoản chỉ có Telegram: ghi chú nên đặt mật khẩu');
  await b.click('[data-host-unlink="telegram"]');
  await waitFor(b, () => document.getElementById('confirm-dlg').open);
  ok(/only way to log in/.test(await b.textContent('#confirm-q')), 'huỷ liên kết cách đăng nhập duy nhất: hộp cảnh báo rõ');
  await b.click('#confirm-no');
  await sleep(400);
  ok(app.store.hlOwner('telegram', '424242') === m1.uid, 'bấm Huỷ ở hộp cảnh báo: vẫn liên kết');
  await b.evaluate(() => window.CaroOnline.closeDlg('account-dlg'));
  ok(!b.errs.length, 'Telegram (đăng nhập im lặng): không lỗi JS' + (b.errs.length ? ': ' + b.errs.join(' | ') : ''));
  await b.context().close();

  // ---------------------------------------------------------------- Tài khoản Caro có sẵn → liên kết, rồi huỷ liên kết
  const init2 = tgInit(515151, 'Olga');
  const c = await open(tgUrl(init2), { init: init2 });
  await waitFor(c, () => window.CaroHostAuth.state === 'unlinked');
  await c.evaluate(() => window.CaroOnline.send({ t: 'register', username: 'olga_caro', password: 'caro-pass1', name: 'Olga' }));
  ok(await waitFor(c, () => window.CaroOnline.state.me && !window.CaroOnline.state.me.guest), 'đăng ký tài khoản Caro trong Mini App');
  await toMore(c);
  ok(await waitFor(c, () => document.getElementById('host-auth-link')), 'tài khoản chưa liên kết: nút "Link Telegram"');
  await c.click('#host-auth-link');
  await waitFor(c, () => document.getElementById('confirm-dlg').open);
  ok(/@olga_caro/.test(await c.textContent('#confirm-q')), 'hỏi xác nhận trong app: liên kết với @olga_caro?');
  await c.click('#confirm-ok');
  ok(await waitFor(c, () => (window.CaroOnline.state.me.hosts || []).includes('telegram')), 'đồng ý: đã liên kết Telegram');
  ok(app.store.hlOwner('telegram', '515151') === (await me(c)).uid, 'máy chủ lưu liên kết đúng tài khoản');
  await c.evaluate(() => window.CaroSocial.open('account'));
  await waitFor(c, () => !document.getElementById('hostlinks-card').hidden);
  ok(!(await c.isVisible('#hostlinks-note')), 'còn mật khẩu: không có ghi chú cảnh báo');
  const issues = await audit(c, '#account-dlg');
  await c.evaluate(() => document.getElementById('hostlinks-card').scrollIntoView({ block: 'center' }));
  await c.screenshot({ path: require('path').join(process.env.E2E_OUT || require('os').tmpdir(), 'hostauth-settings.png') });
  ok(issues.length === 0, 'Cài đặt tài khoản (mục Telegram và VK) ở 390px: 0 lỗi hiển thị' + (issues.length ? ': ' + JSON.stringify(issues.slice(0, 3)) : ''));
  await c.click('[data-host-unlink="telegram"]');
  await waitFor(c, () => document.getElementById('confirm-dlg').open);
  ok(!/only way/.test(await c.textContent('#confirm-q')), 'còn mật khẩu: hộp hỏi thường');
  await c.click('#confirm-ok');
  ok(await waitFor(c, () => !(window.CaroOnline.state.me.hosts || []).length && document.getElementById('hostlinks-card').hidden), 'huỷ liên kết: mục ẩn, máy chủ xoá liên kết');
  ok(app.store.hlOwner('telegram', '515151') === null, 'máy chủ không còn id Telegram');
  ok(!c.errs.length, 'Telegram (liên kết): không lỗi JS' + (c.errs.length ? ': ' + c.errs.join(' | ') : ''));
  await c.context().close();

  // ---------------------------------------------------------------- VK
  const v = await open(base + vkSearch(777001));
  const vs = await v.evaluate(() => ({ search: location.search, saved: sessionStorage.getItem('caro.vkLaunch') }));
  ok(!/sign=/.test(vs.search) && /host=vk/.test(vs.search) && /sign=/.test(vs.saved || '') && /^vk_/.test(vs.saved), 'VK: sign bỏ khỏi địa chỉ (thêm host=vk), tham số có chữ ký giữ trong sessionStorage');
  ok(await waitFor(v, () => window.CaroHostAuth.state === 'unlinked'), 'VK: khách chưa liên kết');
  await toMore(v);
  ok(/Save progress with VK/.test(await v.textContent('#host-auth-save')), 'VK: nút "Save progress with VK"');
  await v.click('#host-auth-save');
  ok(await waitFor(v, () => window.CaroOnline.state.me && !window.CaroOnline.state.me.guest), 'VK: tạo tài khoản');
  const mv = await me(v);
  ok(/^vk_[a-z0-9]{8}$/.test(mv.username) && mv.name === 'Pyotr', `VK: username tự sinh, tên từ VK Bridge (@${mv.username}, ${mv.name})`);
  ok(!v.errs.length, 'VK: không lỗi JS' + (v.errs.length ? ': ' + v.errs.join(' | ') : ''));
  await v.context().close();
  const v2 = await open(base + vkSearch(777001));
  ok(await waitFor(v2, (uid) => window.CaroOnline.state.me && window.CaroOnline.state.me.uid === uid, mv.uid), 'VK mở lại (hồ sơ mới): đăng nhập im lặng đúng tài khoản');
  await v2.context().close();
  // Chữ ký sai: im lặng, không nút, không thông báo lỗi
  const bad = await open(base + vkSearch(777002).replace(/sign=.{5}/, 'sign=AAAAA'));
  ok(await waitFor(bad, () => window.CaroHostAuth.state === 'failed'), 'VK chữ ký sai: thử im lặng thất bại');
  await toMore(bad);
  ok(!(await bad.$('#host-auth-save')) && !(await bad.$('.toast')), 'chữ ký sai: không nút, không thông báo lỗi');
  await bad.context().close();

  // ---------------------------------------------------------------- Ngoài Mini App
  const w = await open(base);
  await toMore(w);
  await sleep(500);
  const ws = await w.evaluate(() => ({ host: window.CaroHostAuth && window.CaroHostAuth.host, row: !!document.getElementById('host-auth-row') }));
  ok(ws.host === null && !ws.row && !w.out.some((s) => s.includes('hostLogin')), 'trang web thường: không nút Telegram / VK, không gửi hostLogin');
  await w.context().close();

  await finish();
})();
