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
/**
 * Máy ảo trên CI rất yếu: ngay sau khi khởi động, màn hình chính (Pixel Launcher) có lúc bị treo và Android hiện hộp
 * thoại "… isn't responding" đè lên app. Khi đó chạm / Back thật (adb input) rơi vào hộp thoại chứ không tới app
 * (bàn phím không hiện, Back không đóng được hộp thoại của app…). Trước mỗi thao tác thật: bấm "Wait" để dẹp hộp thoại.
 */
const SYS_DIALOG = /Application Not Responding|isn't responding|has stopped|keeps stopping/;
function systemDialog() {
  try { return (adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=[^\n]*/) || [''])[0].match(SYS_DIALOG) ? true : false; } catch (e) { return false; }
}
function dismissSystemDialogs() {
  for (let i = 0; i < 5 && systemDialog(); i++) {
    console.log('Dẹp hộp thoại hệ thống: ' + (adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=[^\n]*/) || [''])[0].trim());
    let done = false;
    try {
      adb('shell', 'uiautomator', 'dump', '/sdcard/sys.xml');
      const xml = adb('shell', 'cat', '/sdcard/sys.xml');
      // "Wait" giữ ứng dụng bị treo lại (không đóng Launcher); không có thì "Close app" / "OK"
      const node = ['Wait', 'Close app', 'OK'].map((t) => xml.match(new RegExp(`text="${t}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`))).find(Boolean);
      if (node) {
        const [, l, t, r, b] = node.map(Number);
        adb('shell', 'input', 'tap', String((l + r) >> 1), String((t + b) >> 1));
        done = true;
      }
    } catch (e) { /* thử cách khác */ }
    if (!done) adb('shell', 'input', 'keyevent', '4'); // không gọi pressBack(): tránh gọi lại chính hàm này
    execFileSync('sleep', ['1']);
  }
}
/** Chạm thật (màn hình máy ảo) – dẹp hộp thoại hệ thống trước. */
function realTap(x, y) { dismissSystemDialogs(); adb('shell', 'input', 'tap', String(x), String(y)); }
/** Nút Back thật – dẹp hộp thoại hệ thống trước (không thì Back chỉ đóng hộp thoại đó). */
function pressBack() { dismissSystemDialogs(); adb('shell', 'input', 'keyevent', '4'); }
/** Màn hình đang hiện gì – activity trên cùng, cửa sổ giữ focus, các gói / chữ trên màn hình (in khi kiểm tra thất bại). */
function screenState() {
  const out = [];
  try { out.push((adb('shell', 'dumpsys', 'activity', 'activities').match(/topResumedActivity[^\n]*/) || [''])[0].trim()); } catch (e) { /* bỏ qua */ }
  try { out.push(...(adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=[^\n]*|mFocusedApp=[^\n]*/g) || []).map((x) => x.trim())); } catch (e) { /* bỏ qua */ }
  try {
    adb('shell', 'uiautomator', 'dump', '/sdcard/kb.xml');
    const xml = adb('shell', 'cat', '/sdcard/kb.xml');
    const pk = [...new Set([...xml.matchAll(/package="([^"]+)"/g)].map((m) => m[1]))];
    const tx = [...new Set([...xml.matchAll(/text="([^"]{2,60})"/g)].map((m) => m[1]))].slice(0, 25);
    out.push('gói trên màn hình: ' + pk.join(', '), 'chữ: ' + tx.join(' | '));
  } catch (e) { out.push('uiautomator lỗi: ' + e.message.slice(0, 120)); }
  return out.join('\n  ');
}
/** In nhật ký hệ thống Android liên quan tới app / WebView / bàn phím / cửa sổ (khi test dừng vì lỗi). */
function dumpLogcat(reason) {
  try {
    const re = /caro|chromium|cr_|AndroidRuntime|ActivityManager|ActivityTaskManager|WindowManager|InputMethod|ImeTracker|InputDispatcher|DEBUG|libc|WebView|died|ANR|lowmemory|lmkd|Capacitor/i;
    const lines = execFileSync('adb', ['logcat', '-d', '-v', 'time', '-t', '4000'], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').filter((l) => re.test(l));
    console.log(`LOGCAT (${reason}) – ${lines.length} dòng liên quan, 200 dòng cuối:`);
    for (const l of lines.slice(-200)) console.log('  ' + l);
  } catch (e) { console.log('LOGCAT lỗi: ' + e.message); }
}

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
/** Khung của WebView trên màn hình (pixel).
 *  Cách 1: uiautomator (cần màn hình "đứng yên", đôi khi không chụp được cây giao diện).
 *  Cách 2: cây View của activity trong `dumpsys activity top` – toạ độ tương đối với view cha, cộng dồn lên. */
function webViewFromUiautomator() {
  try { adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml'); } catch (e) { return null; }
  let xml = '';
  try { xml = adb('shell', 'cat', '/sdcard/ui.xml'); } catch (e) { return null; }
  adb('shell', 'rm', '-f', '/sdcard/ui.xml'); // không đọc nhầm file cũ ở lần sau
  const m = xml.match(/class="android\.webkit\.WebView"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  return m ? { l: +m[1], t: +m[2], r: +m[3], b: +m[4] } : null;
}
function webViewFromDumpsys() {
  const lines = adb('shell', 'dumpsys', 'activity', 'top').split('\n');
  const stack = []; // [{ indent, x, y }] tổ tiên của dòng đang xét, toạ độ tuyệt đối
  for (const line of lines) {
    const m = line.match(/^(\s*)([\w.$]+)\{[^}]*?\s(-?\d+),(-?\d+)-(-?\d+),(-?\d+)/);
    if (!m) continue;
    const indent = m[1].length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const px = stack.length ? stack[stack.length - 1].x : 0, py = stack.length ? stack[stack.length - 1].y : 0;
    const l = px + +m[3], t = py + +m[4], r = px + +m[5], b = py + +m[6];
    if (/WebView$/.test(m[2]) && b > t) return { l, t, r, b };
    stack.push({ indent, x: l, y: t });
  }
  return null;
}
function webViewBounds() {
  for (let i = 0; i < 3; i++) {
    const wv = webViewFromUiautomator() || webViewFromDumpsys();
    if (wv) return wv;
    execFileSync('sleep', ['1']);
  }
  throw new Error('Không đo được khung WebView (uiautomator và dumpsys activity top)');
}
/**
 * Điểm chạm (pixel màn hình) vào giữa một phần tử, chỉ trả về khi hình học đã ổn định: chiều cao trang khớp khung
 * WebView và vị trí phần tử không đổi giữa 2 lần đo liền nhau. Sau khi bàn phím mở / đóng, khung WebView co giãn
 * và bố cục trang cập nhật lệch nhau một lúc – đo đúng lúc đó thì chạm trượt khỏi phần tử.
 */
async function stableTapPoint(app, sel, ms = 10000) {
  const t0 = Date.now();
  let prev = null, cur = null;
  while (Date.now() - t0 < ms) {
    const wv = webViewBounds();
    const r = await app.evaluate((q) => {
      const b = document.querySelector(q).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, ih: innerHeight, dpr: devicePixelRatio };
    }, sel);
    cur = { x: Math.round(wv.l + r.x * r.dpr), y: Math.round(wv.t + r.y * r.dpr), wv, css: { x: Math.round(r.x), y: Math.round(r.y), ih: r.ih } };
    const fits = Math.abs(r.ih * r.dpr - (wv.b - wv.t)) <= 3 * r.dpr; // trang và khung WebView cùng kích thước
    if (fits && prev && prev.x === cur.x && prev.y === cur.y) return cur;
    prev = fits ? cur : null;
    await sleep(300);
  }
  return { ...cur, unstable: true };
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
  // Không để hộp thoại báo lỗi / "không phản hồi" của hệ thống che app (máy ảo CI chậm, vừa khởi động xong)
  try { adb('shell', 'settings', 'put', 'global', 'hide_error_dialogs', '1'); } catch (e) { /* bản Android cũ */ }
  // Mở app: dẹp hộp thoại hệ thống, mở, kiểm tra app đã lên trên cùng (thử tối đa 3 lần)
  const onTop = () => { try { return adb('shell', 'dumpsys', 'activity', 'activities').match(/topResumedActivity[^\n]*/)?.[0].includes(PKG); } catch (e) { return false; } };
  for (let i = 0; i < 3; i++) {
    dismissSystemDialogs();
    await device.shell(`am force-stop ${PKG}`);
    await device.shell(`monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`);
    if (await until(() => onTop() && !systemDialog(), 20000, 500)) break;
    console.log('App chưa lên màn hình – mở lại:\n  ' + screenState());
  }
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
  check('app kết nối máy chủ', !!(await until(() => app.evaluate(() => window.CaroOnline.connected), 45000)));
  await app.click('#go-register');
  await app.fill('#auth-form input[name=name]', 'Android');
  await app.fill('#auth-form input[name=username]', 'android_1');
  await app.fill('#auth-form input[name=password]', 'caro-pass1');
  await app.click('#auth-submit');
  const appMe = await until(() => app.evaluate(() => { const m = window.CaroOnline.state.me; return m && !m.guest && m; }));
  check('app đăng ký tài khoản', !!appMe && appMe.username === 'android_1');

  // Web: tài khoản + kết bạn + nhắn tin
  await web.click('#btn-online');
  await until(() => web.evaluate(() => window.CaroOnline.connected));
  await web.click('#go-register');
  await web.fill('#auth-form input[name=username]', 'web_1');
  await web.fill('#auth-form input[name=password]', 'caro-pass1');
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
    // Ghi lại mọi lần mất focus (kèm nơi gọi) để biết do mã JS hay do WebView mất focus
    await app.evaluate(() => {
      window.__blur = [];
      document.addEventListener('focusout', (e) => window.__blur.push({
        t: Math.round(performance.now()), from: e.target.tagName + (e.target.name ? '[' + e.target.name + ']' : ''),
        to: e.relatedTarget ? e.relatedTarget.tagName : null, doc: document.hasFocus(),
        stack: (new Error().stack || '').split('\n').slice(2, 5).map((l) => l.trim()).join(' < '),
      }), true);
      window.addEventListener('blur', () => window.__blur.push({ t: Math.round(performance.now()), from: 'window' }));
    });
    await app.click('#friends [data-chat]');
    await until(() => app.evaluate(() => document.getElementById('chat').open));
    // Hộp chat tự focus ô nhập sau 50ms: chờ xong rồi mới chạm (chạm trùng lúc tự focus thì focus rơi về BODY
    // và bàn phím đóng lại – người thật không chạm nhanh tới mức đó)
    await until(() => app.evaluate(() => document.activeElement && document.activeElement.name === 'text'), 3000, 100);
    await sleep(300);
    // Chạm thật của Android (adb input tap) vào giữa ô nhập: chạm giả lập qua DevTools đôi khi không
    // mở được bàn phím trên Android 15 (WebView bỏ qua hoặc chỉ làm mất focus), người dùng thật thì không gặp
    const pt = await stableTapPoint(app, '#chat-form input');
    const inBox = pt.css;
    const tapInput = () => realTap(pt.x, pt.y);
    // Bàn phím thật sự đang hiện (mInputShown=true) – khung "ime" trong dumpsys window có thể là số liệu cũ
    const imeShownNow = () => /mInputShown=true/.test(adb('shell', 'dumpsys', 'input_method')) && systemBars().ime;
    tapInput();
    let ime = await until(imeShownNow, 8000, 400);
    // Chưa hiện thì chạm thêm 1 lần (người dùng thật cũng chạm lại)
    if (!ime) { console.log('Bàn phím chưa hiện sau lần chạm đầu – chạm lại'); tapInput(); ime = await until(imeShownNow, 8000, 400); }
    // Chẩn đoán: phần tử dưới điểm chạm, phần tử đang focus, Android có đang hiện bàn phím không
    const diag = await app.evaluate((p) => {
      const e = document.elementFromPoint(p.x, p.y), a = document.activeElement;
      const d = (n) => n ? n.tagName + (n.id ? '#' + n.id : '') + (n.name ? '[name=' + n.name + ']' : '') : null;
      return { at: d(e), focus: d(a), open: [...document.querySelectorAll('dialog[open]')].map((x) => x.id) };
    }, inBox);
    let imeShown = '';
    try { imeShown = (adb('shell', 'dumpsys', 'input_method').match(/mInputShown=\w+|mIsInputViewShown=\w+/g) || []).join(' '); } catch (e) { /* bỏ qua */ }
    console.log('Chạm ô nhập:', JSON.stringify(inBox), JSON.stringify(diag), imeShown);
    console.log('Mất focus:', JSON.stringify(await app.evaluate(() => ({ now: Math.round(performance.now()), hasFocus: document.hasFocus(), ev: window.__blur.slice(-6) }))));
    if (!ime) { console.log('MÀN HÌNH lúc bàn phím không hiện:\n  ' + screenState()); dumpLogcat('bàn phím không hiện'); }
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
      pressBack(); // Back lần 1: ẩn bàn phím
      await sleep(600);
    }
    // Back: đóng hộp chat. Bàn phím có thể hiện muộn (máy ảo Android 15 chậm) – khi đó lần Back đầu chỉ ẩn bàn phím,
    // nên bấm lại tối đa 3 lần tới khi hộp chat đóng (người dùng thật cũng bấm Back lần nữa)
    for (let k = 0; k < 3 && await app.evaluate(() => document.getElementById('chat').open); k++) {
      pressBack();
      await until(() => app.evaluate(() => !document.getElementById('chat').open), 2500);
    }
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
  pressBack();
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
  pressBack();
  check('Back ẩn thẻ kết quả', !!(await until(() => app.evaluate(() => document.getElementById('banner').hidden))));
  await app.evaluate(() => window.CaroApp && document.getElementById('btn-room').click());
  check('mở thông tin phòng', !!(await until(() => app.evaluate(() => document.getElementById('room-info').open))));
  pressBack();
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
  pressBack();
  check('Back đóng bảng, thẻ đang tìm hiện trên màn chơi', !!(await until(() => app.isVisible('.qm-float'))));
  shot('searching');
  await web.evaluate(() => window.CaroOnline.send({ t: 'quickMatch', timeLimit: -1 }));
  // Web vừa rời phòng công khai trước nước đầu (= huỷ ván, bị ghi là bỏ ván) nên được ưu tiên ghép với người hay bỏ ván:
  // ghép với app sau khi chờ quá 20 giây
  check('tìm trận nhanh ghép app với web', !!(await until(() => app.evaluate(() => {
    const r = window.CaroOnline.state.room; return !!(r && r.quick && r.players.length === 2);
  }), 40000)));
  check('hết thẻ đang tìm sau khi ghép', !!(await until(() => app.isHidden('.qm-float'))));
  shot('matched');

  // Giải đấu: web (quản trị viên, ADMIN_USERNAMES=web_1 trong CI) tạo giải Arena; app mở trang giải bằng giao diện,
  // bấm Tham gia; bắt đầu giải -> app tự vào ván của giải
  await web.evaluate(() => window.CaroOnline.send({ t: 'leaveRoom' }));
  await app.evaluate(() => window.CaroOnline.send({ t: 'leaveRoom' }));
  await until(() => app.evaluate(() => !window.CaroOnline.state.room));
  const tourId = await web.evaluate(() => new Promise((resolve) => {
    window.CaroOnline.on('tourCreated', (m) => resolve(m.id));
    window.CaroOnline.send({ t: 'tourCreate', name: 'Arena CI', format: 'arena', startsAt: Date.now() + 120000, timeLimit: 30, minutes: 15 });
  }));
  check('quản trị viên tạo giải (duyệt luôn)', !!tourId);
  await app.evaluate(() => { if (!document.getElementById('online').open) document.getElementById('btn-online').click(); });
  await app.locator('#open-tours').scrollIntoViewIfNeeded();
  await app.click('#open-tours');
  check('app thấy giải trong danh sách', !!(await until(() => app.isVisible(`[data-act="tour"][data-id="${tourId}"]`))));
  await app.click(`[data-act="tour"][data-id="${tourId}"]`);
  await until(() => app.isVisible('[data-act="join"]'));
  await app.click('[data-act="join"]');
  check('app tham gia giải', !!(await until(() => app.evaluate(() => !!document.querySelector('[data-act="leave"]')))));
  shot('tour');
  await web.evaluate((id) => window.CaroOnline.send({ t: 'tourJoin', id }), tourId);
  await sleep(500);
  await web.evaluate((id) => window.CaroOnline.send({ t: 'tourStart', id }), tourId);
  check('bắt đầu giải: app tự vào ván với web', !!(await until(() => app.evaluate((id) => {
    const r = window.CaroOnline.state.room; return !!(r && r.tour && r.tour.id === id && r.players.length === 2);
  }, tourId))));
  check('hộp thoại giải tự đóng để vào bàn cờ', !!(await until(() => app.evaluate(() => !document.getElementById('tour-dlg').open))));
  shot('tour-game');
  await web.screenshot({ path: `${SHOTS}/api${API}-web-vs-android.png` });
  console.log('Lỗi JS:', errors.length ? errors : 'không có');
  if (errors.some((e) => !/Failed to load resource/.test(e))) failed++;
  await browser.close();
  await device.close();
  console.log(failed ? `✗ ${failed} kiểm tra thất bại` : '✓ Tất cả kiểm tra đều đạt');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); dumpLogcat('lỗi dừng test'); process.exit(1); });
