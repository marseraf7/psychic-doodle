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
const API = Number(adb('shell', 'getprop', 'ro.build.version.sdk').trim());
const shot = (name) => execFileSync('sh', ['-c', `adb exec-out screencap -p > ${SHOTS}/api${API}-${name}.png`]);

/** Vị trí thanh hệ thống / bàn phím trên màn hình (pixel), đọc từ dumpsys window. */
function systemBars() {
  const d = adb('shell', 'dumpsys', 'window');
  const frame = (type, needVisible) => {
    const re = new RegExp(`type=${type}[^\\n]*?frame=\\[(-?\\d+),(-?\\d+)\\]\\[(-?\\d+),(-?\\d+)\\][^\\n]*`, 'g');
    let m, best = null;
    while ((m = re.exec(d))) {
      if (needVisible && !/visible=true/.test(m[0])) continue;
      const f = { l: +m[1], t: +m[2], r: +m[3], b: +m[4] };
      if (f.b > f.t) best = f;
    }
    return best;
  };
  return { status: frame('statusBars'), nav: frame('navigationBars'), ime: frame('ime', true) };
}
/** Khung của WebView trên màn hình (pixel), đọc từ uiautomator. */
function webViewBounds() {
  // uiautomator đôi khi chụp cây giao diện lúc màn hình đang vẽ lại (chưa có WebView): thử lại vài lần
  for (let i = 0; ; i++) {
    try { adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml'); } catch (e) { /* "could not get idle state" */ }
    const xml = adb('shell', 'cat', '/sdcard/ui.xml');
    const m = xml.match(/class="android\.webkit\.WebView"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (m) return { l: +m[1], t: +m[2], r: +m[3], b: +m[4] };
    if (i >= 5) throw new Error('Không thấy WebView trong uiautomator dump');
    execFileSync('sleep', ['1']);
  }
}
/** Toạ độ màn hình (pixel) của một phần tử trong app. */
async function screenRect(app, sel) {
  const wv = webViewBounds();
  const r = await app.evaluate((sel) => {
    const b = document.querySelector(sel).getBoundingClientRect();
    return { t: b.top, b: b.bottom, dpr: window.devicePixelRatio };
  }, sel);
  return { top: wv.t + r.t * r.dpr, bottom: wv.t + r.b * r.dpr };
}

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
  console.log(`Android API ${API} · WebView ${await app.evaluate(() => (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1])}`);

  // Tràn viền (Android 15+): thanh trên / dưới của game không được nằm dưới thanh trạng thái / điều hướng
  {
    const bars = systemBars();
    console.log('Thanh hệ thống:', JSON.stringify(bars), '· WebView:', JSON.stringify(webViewBounds()));
    const top = await screenRect(app, '.bar.top');
    const bottom = await screenRect(app, '.bar.bottom.local-only');
    check('thanh trên không bị thanh trạng thái che', !!bars.status && top.top >= bars.status.b - 1,
      `thanh trên y=${Math.round(top.top)}, thanh trạng thái tới y=${bars.status && bars.status.b}`);
    check('thanh dưới không bị thanh điều hướng che', !bars.nav || bottom.bottom <= bars.nav.t + 1,
      `thanh dưới tới y=${Math.round(bottom.bottom)}, thanh điều hướng từ y=${bars.nav && bars.nav.t}`);
    shot('home');
  }

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

  // Bàn phím: mở hộp chat, chạm vào ô nhập → bàn phím hiện, ô nhập phải nằm trên bàn phím
  {
    const cdpK = await app.context().newCDPSession(app);
    await app.click('#friends [data-chat]');
    await until(() => app.evaluate(() => document.getElementById('chat').open));
    const inBox = await app.evaluate(() => {
      const r = document.querySelector('#chat-form input').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await cdpK.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [inBox] });
    await sleep(60);
    await cdpK.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const ime = await until(() => systemBars().ime, 8000, 400);
    check('bàn phím hiện khi chạm ô nhập tin nhắn', !!ime);
    if (ime) {
      // Chờ WebView co lại theo bàn phím (máy ảo chậm có thể mất vài giây), đo lại tới khi ổn định
      let last = null;
      const fit = await until(async () => {
        const kb = systemBars().ime || ime;
        const inp = await screenRect(app, '#chat-form input');
        const vp = await app.evaluate(() => ({ inner: innerHeight, visual: Math.round(visualViewport ? visualViewport.height : 0) }));
        last = { inp, kb, vp };
        return inp.bottom <= kb.t + 1;
      }, 10000, 500);
      check('ô nhập tin nhắn không bị bàn phím che', !!fit,
        `ô nhập tới y=${Math.round(last.inp.bottom)}, bàn phím từ y=${last.kb.t}, viewport ${JSON.stringify(last.vp)}`);
      shot('keyboard');
      await app.fill('#chat-form input', 'Typed on Android');
      await app.click('#chat-form button');
      check('gửi được tin nhắn khi bàn phím đang mở', !!(await until(() => web.evaluate(() =>
        [...document.querySelectorAll('#toasts .toast')].some((t) => t.textContent.includes('Typed on Android'))))));
      adb('shell', 'input', 'keyevent', '4'); // Back lần 1: ẩn bàn phím
      await sleep(600);
    }
    if (await app.evaluate(() => document.getElementById('chat').open)) adb('shell', 'input', 'keyevent', '4'); // Back: đóng hộp chat
    check('Back đóng hộp chat', !!(await until(() => app.evaluate(() => !document.getElementById('chat').open), 5000)));
    await app.evaluate(() => { if (!document.getElementById('online').open) document.getElementById('btn-online').click(); });
  }

  // App tạo phòng, đi trước; web vào bằng mã phòng
  await app.check('input[name="room-side"][value="first"]');
  await app.click('#create-room');
  const room = await until(() => app.evaluate(() => window.CaroOnline.state.room));
  check('app tạo phòng', !!room && /^\d{6}$/.test(room.code));
  // Bảng thông tin phòng tự mở sau ~0,2 giây: chờ nó mở rồi đóng bằng nút Back thật
  check('bảng thông tin phòng tự mở', !!(await until(() => app.evaluate(() => document.getElementById('room-info').open), 5000)));
  // Sao chép link mời bằng bộ nhớ tạm của Android, đọc lại qua plugin Clipboard
  await app.click('#ri-copy');
  const clip = await until(() => app.evaluate(() => window.Capacitor.Plugins.Clipboard.read().then((r) => r.value)), 5000);
  check('sao chép link mời vào bộ nhớ tạm của máy', clip === `http://10.0.2.2:8790/?room=${room.code}`, String(clip));
  adb('shell', 'input', 'keyevent', '4');
  await until(() => app.evaluate(() => !document.getElementById('room-info').open), 5000);
  await web.evaluate(([c, p]) => window.CaroOnline.send({ t: 'joinRoom', code: c, password: p }), [room.code, room.password]);
  check('web vào phòng của app', !!(await until(() => app.evaluate(() => window.CaroOnline.state.room.players.length === 2))));
  await sleep(600); // camera về giữa bàn cờ

  // Chạm thật vào giữa bàn cờ trên điện thoại = ô (0, 0). Màn hình cảm ứng mặc định "chạm 2 lần để đánh".
  // Chạm cảm ứng thật qua Chrome DevTools (Input.dispatchTouchEvent → pointer "touch" trong WebView)
  const box = await app.evaluate(() => { const r = document.getElementById('board').getBoundingClientRect(); return { x: r.width / 2, y: r.height / 2 }; });
  const cdp = await app.context().newCDPSession(app);
  const touch = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await touch(box.x, box.y);
  await sleep(400);
  if (!(await web.evaluate(() => window.CaroOnline.state.room.moves.length))) await touch(box.x, box.y); // chạm lần 2 để xác nhận
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
  shot('win');

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

  shot('rematch');

  // Phòng công khai: web tạo phòng công khai, app thấy trong "Phòng đang chờ" và chạm "Vào" (không cần mật khẩu)
  await web.evaluate(() => window.CaroOnline.send({ t: 'leaveRoom' }));
  await app.evaluate(() => window.CaroOnline.send({ t: 'leaveRoom' }));
  await until(() => app.evaluate(() => !window.CaroOnline.state.room));
  await web.evaluate(() => window.CaroOnline.send({ t: 'createRoom', public: true }));
  await app.evaluate(() => { if (!document.getElementById('online').open) document.getElementById('btn-online').click(); });
  check('app thấy phòng công khai của web', !!(await until(() => app.evaluate(() => !!document.querySelector('[data-lobby-join]')))));
  await app.locator('#lobby-card').scrollIntoViewIfNeeded();
  shot('lobby');
  await app.click('[data-lobby-join]');
  check('app vào phòng công khai không cần mật khẩu', !!(await until(() => app.evaluate(() => window.CaroOnline.state.room?.players.length === 2))));
  await web.evaluate(() => window.CaroOnline.send({ t: 'leaveRoom' }));
  await app.evaluate(() => window.CaroOnline.send({ t: 'leaveRoom' }));
  await until(() => app.evaluate(() => !window.CaroOnline.state.room));

  // Tìm trận nhanh: app bấm "Tìm trận", đóng bảng bằng Back (thẻ "đang tìm" nổi trên màn chơi), web tìm trận → được ghép
  await app.evaluate(() => { if (!document.getElementById('online').open) document.getElementById('btn-online').click(); });
  await app.locator('#qm-start').scrollIntoViewIfNeeded();
  await app.click('#qm-start');
  check('app đang tìm trận', !!(await until(() => app.isVisible('#qm-search'))));
  adb('shell', 'input', 'keyevent', '4');
  check('Back đóng bảng, thẻ đang tìm hiện trên màn chơi', !!(await until(() => app.isVisible('.qm-float'))));
  shot('searching');
  await web.evaluate(() => window.CaroOnline.send({ t: 'quickMatch', timeLimit: -1 }));
  check('tìm trận nhanh ghép app với web', !!(await until(() => app.evaluate(() => {
    const r = window.CaroOnline.state.room; return !!(r && r.quick && r.players.length === 2);
  }))));
  check('hết thẻ đang tìm sau khi ghép', !!(await until(() => app.isHidden('.qm-float'))));
  shot('matched');
  await web.screenshot({ path: `${SHOTS}/api${API}-web-vs-android.png` });
  console.log('Lỗi JS:', errors.length ? errors : 'không có');
  if (errors.some((e) => !/Failed to load resource/.test(e))) failed++;
  await browser.close();
  await device.close();
  console.log(failed ? `✗ ${failed} kiểm tra thất bại` : '✓ Tất cả kiểm tra đều đạt');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
