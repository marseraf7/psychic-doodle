/*
 * Kiểm thử chơi chéo trên máy ảo Android thật (chạy trong GitHub Actions):
 *   ứng dụng Android (bản thử nghiệm, máy chủ http://10.0.2.2:8790)  ⟷  bản web trên Chromium (http://localhost:8790)
 * Điều khiển WebView của app qua Playwright (_android), chạm thật vào bàn cờ và bấm nút Back thật.
 * Cần: máy ảo đang chạy, app đã cài, máy chủ đang chạy ở cổng 8790.
 */
'use strict';
const { _android: android, chromium } = require('playwright');
const { execFileSync } = require('child_process');

const PKG = 'io.github.marseraf7.caro';
const SHOTS = process.env.SHOTS_DIR || '.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' | ' + extra : ''}`);
  if (!ok) failed++;
};
async function until(fn, ms = 15000, step = 250) {
  const t0 = Date.now();
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch (e) { /* thử lại */ }
    if (Date.now() - t0 > ms) return null;
    await sleep(step);
  }
}
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' });

(async () => {
  const [device] = await android.devices();
  if (!device) throw new Error('Không thấy máy ảo Android');
  console.log('Thiết bị:', device.model(), device.serial());
  await device.shell(`am force-stop ${PKG}`);
  await device.shell(`monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`);
  const webview = await device.webView({ pkg: PKG }, { timeout: 60000 });
  const app = await webview.page();
  const errors = [];
  app.on('pageerror', (e) => errors.push('APP ' + e.message));
  app.on('console', (m) => m.type() === 'error' && errors.push('APP console ' + m.text()));
  await until(() => app.evaluate(() => !!window.CaroApp && !!window.CaroOnline), 30000);

  const info = await app.evaluate(() => ({ native: !!window.CaroNative, platform: window.CaroNative && window.CaroNative.platform,
    server: window.CARO_SERVER, plugins: Object.keys(window.Capacitor.Plugins), lang: window.I18N.lang }));
  console.log('App:', JSON.stringify(info));
  check('chạy trong app Android thật (Capacitor native)', info.native && info.platform === 'android');
  check('các plugin gốc có mặt', ['App', 'Share', 'Clipboard', 'Haptics', 'SocialLogin'].every((p) => info.plugins.includes(p)), info.plugins.join(','));
  check('Chia sẻ dùng bảng chia sẻ gốc', await app.evaluate(() => typeof navigator.share === 'function' && window.Capacitor.isPluginAvailable('Share')));

  // Bản web trên máy chạy CI
  const browser = await chromium.launch();
  const web = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  web.on('pageerror', (e) => errors.push('WEB ' + e.message));
  await web.goto('http://localhost:8790/');
  await until(() => web.evaluate(() => !!window.CaroOnline));

  // App: tạo tài khoản bằng giao diện (gõ vào ô nhập trong WebView)
  await app.click('#btn-online');
  check('app kết nối máy chủ', !!(await until(() => app.evaluate(() => window.CaroOnline.connected))));
  await app.click('#go-register');
  await app.fill('#auth-form input[name=name]', 'Android');
  await app.fill('#auth-form input[name=username]', 'android_1');
  await app.fill('#auth-form input[name=password]', '123456');
  await app.click('#auth-submit');
  const appMe = await until(() => app.evaluate(() => { const m = window.CaroOnline.state.me; return m && !m.guest && m; }));
  check('app đăng ký tài khoản', !!appMe && appMe.username === 'android_1');

  // Web: tài khoản + kết bạn + nhắn tin
  await web.click('#btn-online');
  await until(() => web.evaluate(() => window.CaroOnline.connected));
  await web.click('#go-register');
  await web.fill('#auth-form input[name=username]', 'web_1');
  await web.fill('#auth-form input[name=password]', '123456');
  await web.click('#auth-submit');
  await until(() => web.evaluate(() => { const m = window.CaroOnline.state.me; return m && !m.guest; }));
  await web.fill('#add-friend input', 'android_1');
  await web.click('#add-friend button');
  await until(() => app.$('#friends [data-accept]'));
  await app.click('#friends [data-accept]');
  check('web và app là bạn bè, thấy nhau online', !!(await until(() => web.evaluate(() =>
    window.CaroOnline.state.friends.friends.some((f) => f.username === 'android_1' && f.status === 'online')))));
  await web.evaluate(() => window.CaroOnline.send({ t: 'dmSend', to: window.CaroOnline.state.friends.friends[0].id, text: 'Hello from web' }));
  check('app nhận tin nhắn từ web', !!(await until(() => app.evaluate(() =>
    [...document.querySelectorAll('#toasts .toast')].some((t) => t.textContent.includes('Hello from web'))))));

  // App tạo phòng, đi trước; web vào bằng mã phòng
  await app.check('input[name="room-side"][value="first"]');
  await app.click('#create-room');
  const room = await until(() => app.evaluate(() => window.CaroOnline.state.room));
  check('app tạo phòng', !!room && /^\d{6}$/.test(room.code));
  // Bảng thông tin phòng tự mở sau ~0,2 giây: chờ nó mở rồi đóng bằng nút Back thật
  check('bảng thông tin phòng tự mở', !!(await until(() => app.evaluate(() => document.getElementById('room-info').open), 5000)));
  adb('shell', 'input', 'keyevent', '4');
  await until(() => app.evaluate(() => !document.getElementById('room-info').open), 5000);
  await web.evaluate(([c, p]) => window.CaroOnline.send({ t: 'joinRoom', code: c, password: p }), [room.code, room.password]);
  check('web vào phòng của app', !!(await until(() => app.evaluate(() => window.CaroOnline.state.room.players.length === 2))));
  await sleep(600); // camera về giữa bàn cờ

  // Chạm thật vào giữa bàn cờ trên điện thoại = ô (0, 0). Màn hình cảm ứng mặc định "chạm 2 lần để đánh".
  const box = await app.evaluate(() => { const r = document.getElementById('board').getBoundingClientRect(); return { x: r.width / 2, y: r.height / 2 }; });
  await app.touchscreen.tap(box.x, box.y);
  await sleep(300);
  await app.touchscreen.tap(box.x, box.y);
  check('chạm trên app → web thấy nước đi (0,0)', !!(await until(() => web.evaluate(() => {
    const r = window.CaroOnline.state.room; return r && r.moves.length === 1 && r.moves[0][0] === 0 && r.moves[0][1] === 0;
  }))));

  // Chat nhanh từ web → app (dịch theo ngôn ngữ trên app)
  await web.evaluate(() => window.CaroOnline.send({ t: 'quick', id: 'nice' }));
  const appLangQuick = await app.evaluate(() => window.I18N.t('q_nice'));
  check('app thấy chat nhanh từ web', !!(await until(() => app.evaluate((q) =>
    [...document.querySelectorAll('#toasts .toast')].some((t) => t.textContent.includes(q)), appLangQuick))));

  // Đánh tiếp tới khi app (X) thắng: X ở hàng 0, O rải rác ở hàng 5
  const send = (p, x, y) => p.evaluate(([x, y]) => window.CaroOnline.send({ t: 'move', x, y }), [x, y]);
  const moves = (p) => p.evaluate(() => window.CaroOnline.state.room.moves.length);
  for (let i = 1; i <= 3; i++) {
    const n = await moves(web);
    await send(web, i * 3, 5);
    await until(() => app.evaluate((n) => window.CaroOnline.state.room.moves.length > n, n));
    const m = await moves(app);
    await send(app, i, 0);
    await until(() => web.evaluate((m) => window.CaroOnline.state.room.moves.length > m || !!window.CaroOnline.state.room.winner, m));
  }
  const winApp = await until(() => app.evaluate(() => window.CaroOnline.state.room.winner));
  const winWeb = await until(() => web.evaluate(() => window.CaroOnline.state.room.winner));
  check('app thắng, cả hai thấy cùng kết quả', winApp === 1 && winWeb === 1);
  check('app hiện thẻ kết quả', !!(await until(() => app.isVisible('#banner'))));
  await sleep(800);
  execFileSync('sh', ['-c', `adb exec-out screencap -p > ${SHOTS}/android-win.png`]);

  // Nút Back thật của Android: đóng thẻ kết quả, mở Cài đặt rồi Back đóng Cài đặt
  adb('shell', 'input', 'keyevent', '4');
  check('Back ẩn thẻ kết quả', !!(await until(() => app.evaluate(() => document.getElementById('banner').hidden))));
  await app.evaluate(() => window.CaroApp && document.getElementById('btn-room').click());
  check('mở thông tin phòng', !!(await until(() => app.evaluate(() => document.getElementById('room-info').open))));
  adb('shell', 'input', 'keyevent', '4');
  check('Back đóng hộp thoại, app vẫn mở', !!(await until(() => app.evaluate(() => !document.getElementById('room-info').open))) &&
    adb('shell', 'dumpsys', 'activity', 'activities').includes(PKG));

  // Tái đấu: cả hai bấm
  await app.evaluate(() => window.CaroOnline.send({ t: 'rematch' }));
  await web.evaluate(() => window.CaroOnline.send({ t: 'rematch' }));
  check('tái đấu giữa app và web', !!(await until(() => app.evaluate(() => window.CaroOnline.state.room.gameNo === 2))));

  // Xếp hạng / lịch sử có dữ liệu ván vừa đánh
  const hist = await (async () => {
    const p = new Promise((resolve) => web.exposeFunction('__h', resolve).then(() => web.evaluate(() => {
      window.CaroOnline.on('history', (m) => window.__h(m.games.length));
      window.CaroOnline.send({ t: 'history' });
    })));
    return Promise.race([p, sleep(5000).then(() => -1)]);
  })();
  check('lịch sử web có ván với app', hist >= 1, 'số ván ' + hist);

  execFileSync('sh', ['-c', `adb exec-out screencap -p > ${SHOTS}/android-rematch.png`]);
  await web.screenshot({ path: `${SHOTS}/web-vs-android.png` });
  console.log('Lỗi JS:', errors.length ? errors : 'không có');
  if (errors.some((e) => !/Failed to load resource/.test(e))) failed++;
  await browser.close();
  await device.close();
  console.log(failed ? `✗ ${failed} kiểm tra thất bại` : '✓ Tất cả kiểm tra đều đạt');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
