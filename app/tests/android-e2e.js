/*
 * Kiểm thử chơi chéo trên máy ảo Android thật (chạy trong GitHub Actions):
 *   ứng dụng Android (bản thử nghiệm, máy chủ http://10.0.2.2:8790)  ⟷  bản web trên Chromium (http://localhost:8790)
 * Điều khiển WebView của app qua Playwright (_android), chạm thật vào bàn cờ và bấm nút Back thật.
 * Cần: máy ảo đang chạy, app đã cài, máy chủ đang chạy ở cổng 8790.
 */
'use strict';
const { _android: android, chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const { until, sleep, parseDevtoolsSockets, parsePidof, createStepWatch, attachWebView } = require('./android-attach');
const { createDiagnose, providerDependents } = require('./android-diag');
const { createProviderWatch } = require('./android-provider-watch');

const PKG = 'io.github.marseraf7.caro';
const SHOTS = process.env.SHOTS_DIR || '.';
try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) { /* bỏ qua */ }
let failed = 0;
let pendingDiag = ''; // kiểm tra đầu tiên thất bại: chẩn đoán ở bước kế tiếp (lúc màn hình còn đúng trạng thái lỗi)
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' | ' + extra : ''}`);
  if (!ok) { failed++; if (!pendingDiag && failed <= 3) pendingDiag = label; }
};
/**
 * Chẩn đoán khi app không vào được ván giải: trạng thái kết nối / phòng của app và web, lỗi máy chủ đã trả về,
 * và người chơi trong giải theo máy chủ (máy chủ chỉ ghép người đang online và không ở phòng khác).
 */
async function tourDiag(app, web, id) {
  const side = (p) => p.evaluate(() => {
    const s = window.CaroOnline.state, r = s.room;
    return { status: s.status, me: s.me && s.me.id, errors: window.__srvErr || [],
      room: r && { code: r.code, tour: r.tour && r.tour.id, players: r.players.length, moves: r.moves && r.moves.length, winner: r.winner || null } };
  }).catch((e) => ({ evalError: String(e) }));
  const tour = await web.evaluate((tid) => new Promise((res) => {
    window.CaroOnline.on('tour', (m) => { if (m.id === tid) res(m.tour); });
    window.CaroOnline.send({ t: 'tourGet', id: tid });
    setTimeout(() => res('không trả lời'), 5000);
  }), id).catch((e) => String(e));
  const brief = tour && typeof tour === 'object'
    ? { status: tour.status, players: (tour.players || []).map((p) => ({ name: p.name, online: p.online, playing: p.playing, paused: p.paused, withdrawn: p.withdrawn, games: p.games })), games: (tour.games || []).length }
    : tour;
  console.log('Chẩn đoán giải:', JSON.stringify({ app: await side(app), web: await side(web), tour: brief }));
}

// Lượt chạy (CI chạy lại cả kịch bản một lần khi Play Services chết kéo app chết – xem die()): tên tài khoản riêng mỗi lượt
const RUN = /^[1-9]$/.test(process.env.E2E_RUN || '') ? process.env.E2E_RUN : '1';
const APP_USER = 'android_' + RUN, WEB_USER = 'web_' + RUN;

const { adb, waitBoot, systemDialog, dismissSystemDialogs, realTap, pressBack, screenState, dumpLogcat, systemBars,
  webViewBounds, stableTapPoint, screenRect } = require('./android-device');

waitBoot(PKG);
const API = Number(adb('shell', 'getprop', 'ro.build.version.sdk').trim());
const shot = (name) => execFileSync('sh', ['-c', `adb exec-out screencap -p > ${SHOTS}/api${API}-${name}.png`], { timeout: 30000 });

let browser = null, web = null, finished = false; // bản web (mở sau) – để chẩn đoán chụp cả trang web
const diagnose = createDiagnose({
  adb, pkg: PKG, dir: SHOTS, prefix: `api${API}`, parseDevtoolsSockets, screenState,
  screencap: (file) => execFileSync('sh', ['-c', `adb exec-out screencap -p > '${file}'`], { timeout: 30000 }),
  webPage: () => web,
});
/** Dừng test vì lỗi / treo: chẩn đoán (có hạn giờ) rồi thoát mã 1. Gọi lần thứ hai thì thoát luôn. */
let dying = false;
async function die(reason, step) {
  if (dying) process.exit(exitCode());
  dying = true;
  watch.done(); // hạn giờ của bước đang chạy không được cắt ngang lúc chẩn đoán
  console.log('FAIL ' + reason);
  setTimeout(() => { console.log('Chẩn đoán quá 4 phút – thoát'); process.exit(exitCode()); }, 4 * 60000);
  fontsProbe('lúc dừng');
  try { await diagnose(reason, step); } catch (e) { console.log('Chẩn đoán lỗi: ' + e.message); }
  process.exit(exitCode());
}
/** Điều tra app phụ thuộc FontsProvider của Play Services: dòng nhật ký về phông (FontLog / FontsProvider / Typeface /
 *  font của Chromium – thường ghi tên phông được xin) + chi tiết provider (kết nối stable/unstable của app). Chỉ in. */
function fontsProbe(when) {
  try {
    const lines = adb('logcat', '-d', '-v', 'time', '-t', '20000').split('\n')
      .filter((l) => /font/i.test(l) && !/fontWeightAdjustment/.test(l));
    console.log(`FONTS (${when}) – ${lines.length} dòng nhật ký có "font", 80 dòng cuối:`);
    for (const l of lines.slice(-80)) console.log('  ' + l);
  } catch (e) { console.log('FONTS: không đọc được logcat: ' + e.message.split('\n')[0]); }
  try {
    // `dumpsys activity provider <tên>` không liệt kê kết nối của app – đọc bảng đầy đủ rồi lọc như chẩn đoán
    const deps = providerDependents(adb('shell', 'dumpsys', 'activity', 'providers'), PKG).filter((d) => /gms/.test(d.provider));
    console.log('FONTS provider Play Services app đang giữ: ' + (deps.length ? JSON.stringify(deps) : 'không có'));
  } catch (e) { console.log('FONTS provider: lỗi ' + e.message.split('\n')[0]); }
}
const exitCode = () => (gmsKilledApp() ? GMS_EXIT : 1);
/** Mã thoát riêng: Android giết app vì tiến trình Play Services (com.google.android.gms.persistent) chết – app (WebView)
 *  giữ kết nối tới FontsProvider của Play Services; Play Services tự khởi động lại trên máy ảo mới (làm mới cấu hình /
 *  cập nhật module) bất kỳ lúc nào. Không phải lỗi của game: CI (.github/workflows/app.yml) chạy lại cả kịch bản MỘT lần. */
const GMS_EXIT = 75;
function gmsKilledApp() {
  try {
    const log = adb('logcat', '-d', '-v', 'brief', '-t', '4000');
    return new RegExp(`Killing \\d+:${PKG.replace(/\./g, '\\.')}/\\S+ .*depends on provider com\\.google\\.android\\.gms/\\S+ in dying proc com\\.google\\.android\\.gms`).test(log);
  } catch (e) { return false; }
}
// Mỗi bước một hạn giờ: bước nào treo (evaluate / kết nối DevTools không trả lời…) thì dừng ngay, báo tên bước + chẩn đoán
const watch = createStepWatch({ onTimeout: ({ name, ms }) => die(`bước «${name}» treo quá ${Math.round(ms / 1000)} giây`, name) });
/** Sang bước mới: nếu kiểm tra trước vừa thất bại thì chẩn đoán trước (màn hình còn ở trạng thái lỗi), rồi đặt hạn giờ. */
async function step(name, ms) {
  if (pendingDiag) {
    const label = pendingDiag;
    pendingDiag = '';
    watch.step('chẩn đoán', 5 * 60000);
    await diagnose('kiểm tra thất bại: ' + label);
  }
  watch.step(name, ms);
}

(async () => {
  watch.step('tìm máy ảo', 120000);
  const [device] = await android.devices();
  if (!device) throw new Error('Không thấy máy ảo Android');
  console.log('Thiết bị:', device.model(), device.serial());
  // Lưới an toàn cuối: cả bài thường xong trong ~10 phút; quá 30 phút thì chẩn đoán rồi dừng (thay vì bị huỷ câm)
  setTimeout(() => die('kiểm thử treo quá 30 phút', watch.current() && watch.current().name), 30 * 60000).unref();
  // Không để hộp thoại báo lỗi / "không phản hồi" của hệ thống che app (máy ảo CI chậm, vừa khởi động xong)
  try { adb('shell', 'settings', 'put', 'global', 'hide_error_dialogs', '1'); } catch (e) { /* bản Android cũ */ }
  // Mở app: dẹp hộp thoại hệ thống, mở, kiểm tra app đã lên trên cùng (thử tối đa 3 lần)
  const onTop = () => { try { return adb('shell', 'dumpsys', 'activity', 'activities').match(/topResumedActivity[^\n]*/)?.[0].includes(PKG); } catch (e) { return false; } };
  const launch = async (tries = 3) => {
    for (let i = 0; i < tries; i++) {
      dismissSystemDialogs();
      console.log(`Mở app (lần ${i + 1})`);
      adb('shell', 'am', 'force-stop', PKG);
      adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
      if (await until(() => onTop() && !systemDialog(), 20000, 500)) return true;
      console.log('App chưa lên màn hình – mở lại:\n  ' + screenState());
    }
    return false;
  };
  await step('mở app', 4 * 60000);
  // Theo dõi kết nối provider của app trong 3 phút đầu: lúc nào, ở bước nào app nối tới FontsProvider của Play Services
  const provWatch = createProviderWatch({ adb, pkg: PKG, providerDependents, stepName: () => watch.current() && watch.current().name });
  provWatch.start();
  await launch();
  // Gắn vào WebView qua DevTools (socket webview_devtools_remote_<pid>): pid đọc lại mỗi lần, có hạn giờ; quá hạn thì mở
  // lại app (tiến trình mới) rồi gắn lại – Playwright tự nó chờ mãi (webview.page() không có hạn giờ)
  await step('gắn WebView của app (DevTools)', 8 * 60000);
  const pidOf = () => { try { return parsePidof(adb('shell', 'pidof', PKG)); } catch (e) { return null; } };
  const sockets = () => { try { return parseDevtoolsSockets(adb('shell', 'cat', '/proc/net/unix')); } catch (e) { return []; } };
  const attached = await attachWebView({
    device, pidOf, sockets, relaunch: () => launch(2),
    ready: (p) => p.evaluate(() => document.readyState),
    attempts: 3, pidMs: 20000, socketMs: 45000, pageMs: 60000, readyMs: 15000,
  });
  const app = attached.page;
  const appPid = attached.pid;
  const errors = [];
  app.on('pageerror', (e) => errors.push('APP ' + e.message));
  app.on('console', (m) => m.type() === 'error' && errors.push('APP console ' + m.text()));
  // App bị Android giết / crash giữa chừng: báo ngay (kèm chẩn đoán) thay vì lỗi "Target page has been closed" khó hiểu
  app.on('close', () => { if (!dying && !finished) die(`trang của app bị đóng (tiến trình pid ${appPid} chết?)`, watch.current() && watch.current().name); });
  app.on('crash', () => { if (!dying && !finished) die('trang của app bị crash (renderer WebView chết)', watch.current() && watch.current().name); });
  await step('app nạp xong mã game', 60000);
  if (!(await until(() => app.evaluate(() => !!window.CaroApp && !!window.CaroOnline), 30000))) throw new Error('App chưa nạp xong mã game (CaroApp / CaroOnline) sau 30 giây');

  await step('thông tin app + plugin gốc', 60000);
  const info = await app.evaluate(() => ({ native: !!window.CaroNative, platform: window.CaroNative && window.CaroNative.platform,
    server: window.CARO_SERVER, plugins: Object.keys(window.Capacitor.Plugins), lang: window.I18N.lang }));
  console.log('App:', JSON.stringify(info));
  // App không được phụ thuộc (kết nối stable) provider ở tiến trình khác, nhất là FontsProvider của GMS: GMS chết là app
  // bị giết theo (AndroidManifest.xml tắt EmojiCompat). Chỉ ghi nhật ký – kết nối ngắn có thể đã nhả lúc đo.
  try {
    const deps = providerDependents(adb('shell', 'dumpsys', 'activity', 'providers'), PKG);
    console.log('Provider app đang phụ thuộc:', deps.length ? JSON.stringify(deps) : 'không có');
  } catch (e) { console.log('Không đọc được dumpsys activity providers: ' + e.message.split('\n')[0]); }
  fontsProbe('sau khi app nạp xong');
  check('chạy trong app Android thật (Capacitor native)', info.native && info.platform === 'android');
  check('các plugin gốc có mặt', ['App', 'Share', 'Clipboard', 'Haptics', 'SocialLogin'].every((p) => info.plugins.includes(p)), info.plugins.join(','));
  check('Chia sẻ dùng bảng chia sẻ gốc', await app.evaluate(() => typeof navigator.share === 'function' && window.Capacitor.isPluginAvailable('Share')));
  console.log(`Android API ${API} · WebView ${await app.evaluate(() => (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1])}`);

  // Tràn viền (Android 15+): thanh trên / dưới của game không được nằm dưới thanh trạng thái / điều hướng
  await step('thanh hệ thống không che thanh của game', 3 * 60000);
  {
    const bars = systemBars();
    console.log('Thanh hệ thống:', JSON.stringify(bars), '· WebView:', JSON.stringify(webViewBounds()));
    const top = await screenRect(app, '.bar.top');
    // Thanh dưới nằm sát đáy (nền kéo xuống dưới thanh điều hướng): đo nút bấm bên trong, là chỗ người dùng chạm
    const bottom = await screenRect(app, '.bar.bottom.local-only button');
    check('thanh trên không bị thanh trạng thái che', !!bars.status && top.top >= bars.status.b - 1,
      `thanh trên y=${Math.round(top.top)}, thanh trạng thái tới y=${bars.status && bars.status.b}`);
    check('thanh dưới không bị thanh điều hướng che', !bars.nav || bottom.bottom <= bars.nav.t + 3,
      `thanh dưới tới y=${Math.round(bottom.bottom)}, thanh điều hướng từ y=${bars.nav && bars.nav.t}`);
    // Thanh 5 tab (đang ở Trang chủ) cũng không bị thanh điều hướng che
    const tabs = await screenRect(app, '#tabbar button');
    // Sai số 3 px máy (làm tròn theo mật độ điểm ảnh): thanh tab nằm sát đáy WebView, ngay trên thanh điều hướng
    check('thanh tab không bị thanh điều hướng che', !bars.nav || tabs.bottom <= bars.nav.t + 3,
      `thanh tab tới y=${Math.round(tabs.bottom)}, thanh điều hướng từ y=${bars.nav && bars.nav.t}`);
    shot('home');
  }

  // Bản web trên máy chạy CI
  await step('mở bản web', 2 * 60000);
  browser = await chromium.launch();
  web = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  web.on('pageerror', (e) => errors.push('WEB ' + e.message));
  await web.goto('http://localhost:8790/');
  await until(() => web.evaluate(() => !!window.CaroOnline));

  // App: tạo tài khoản bằng giao diện (gõ vào ô nhập trong WebView)
  // Mở app là vào Trang chủ (khung 5 tab); thẻ tài khoản nằm ở tab Xem thêm
  await step('app đăng ký tài khoản', 3 * 60000);
  check('mở app vào Trang chủ', await app.isVisible('#page-home'));
  await app.click('#tabbar [data-tab="more"]');
  check('app kết nối máy chủ', !!(await until(() => app.evaluate(() => window.CaroOnline.connected), 45000)));
  await app.click('#go-register');
  await app.fill('#auth-form input[name=name]', 'Android');
  await app.fill('#auth-form input[name=username]', APP_USER);
  await app.fill('#auth-form input[name=password]', 'caro-pass1');
  await app.click('#auth-submit');
  const appMe = await until(() => app.evaluate(() => { const m = window.CaroOnline.state.me; return m && !m.guest && m; }));
  check('app đăng ký tài khoản', !!appMe && appMe.username === APP_USER);

  // Web: tài khoản + kết bạn + nhắn tin
  await step('web đăng ký, kết bạn, nhắn tin', 3 * 60000);
  await web.click('#tabbar [data-tab="more"]');
  await until(() => web.evaluate(() => window.CaroOnline.connected));
  await web.click('#go-register');
  await web.fill('#auth-form input[name=username]', WEB_USER);
  await web.fill('#auth-form input[name=password]', 'caro-pass1');
  await web.click('#auth-submit');
  await until(() => web.evaluate(() => { const m = window.CaroOnline.state.me; return m && !m.guest; }));
  await web.fill('#add-friend input', APP_USER);
  await web.click('#add-friend button');
  await until(() => app.$('#friends [data-accept]'));
  await app.click('#friends [data-accept]');
  check('web và app là bạn bè, thấy nhau online', !!(await until(() => web.evaluate((u) =>
    window.CaroOnline.state.friends.friends.some((f) => f.username === u && f.status === 'online'), APP_USER))));
  await web.evaluate(() => window.CaroOnline.send({ t: 'dmSend', to: window.CaroOnline.state.friends.friends[0].id, text: 'Hello from web' }));
  check('app nhận tin nhắn từ web', !!(await until(() => app.evaluate(() =>
    [...document.querySelectorAll('#toasts .toast')].some((t) => t.textContent.includes('Hello from web'))))));

  // Bàn phím: mở hộp chat, chạm vào ô nhập → bàn phím hiện, ô nhập phải nằm trên bàn phím
  await step('bàn phím + hộp chat + Back', 5 * 60000);
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
      // Web màn hình rộng có bong bóng chat (chat-bubbles.js): tin mới hiện ở chat head (kèm câu xem trước), không bật thông báo nhỏ
      check('gửi được tin nhắn khi bàn phím đang mở', !!(await until(() => web.evaluate(() =>
        [...document.querySelectorAll('#toasts .toast')].some((t) => t.textContent.includes('Typed on Android'))
        || [...document.querySelectorAll('.cb-head')].some((h) => (h.title || '').includes('Typed on Android'))))));
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
    await app.evaluate(() => { window.CaroShell.open('home'); window.CaroHome.pane('lobby'); });
  }

  // App tạo phòng, đi trước; web vào bằng mã phòng
  await step('app tạo phòng, web vào', 3 * 60000);
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

  await step('chạm bàn cờ, chat nhanh, đánh tới khi thắng', 4 * 60000);
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

  await step('Back thẻ kết quả / thông tin phòng, tái đấu, lịch sử', 3 * 60000);
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

  await step('phòng công khai', 3 * 60000);
  // Phòng công khai: web tạo phòng công khai, app thấy trong "Phòng đang chờ" và chạm "Vào" (không cần mật khẩu)
  await web.evaluate(() => window.CaroOnline.send({ t: 'leaveRoom' }));
  await app.evaluate(() => window.CaroOnline.send({ t: 'leaveRoom' }));
  await until(() => app.evaluate(() => !window.CaroOnline.state.room));
  await web.evaluate(() => window.CaroOnline.send({ t: 'createRoom', public: true }));
  await app.evaluate(() => { window.CaroShell.open('home'); window.CaroHome.pane('lobby'); });
  check('app thấy phòng công khai của web', !!(await until(() => app.evaluate(() => !!document.querySelector('[data-lobby-join]')))));
  await app.locator('#lobby-card').scrollIntoViewIfNeeded();
  shot('lobby');
  await app.click('[data-lobby-join]');
  check('app vào phòng công khai không cần mật khẩu', !!(await until(() => app.evaluate(() => window.CaroOnline.state.room?.players.length === 2))));
  await web.evaluate(() => window.CaroOnline.send({ t: 'leaveRoom' }));
  await app.evaluate(() => window.CaroOnline.send({ t: 'leaveRoom' }));
  await until(() => app.evaluate(() => !window.CaroOnline.state.room));

  await step('tìm trận nhanh', 3 * 60000);
  // Tìm trận nhanh: app bấm "Tìm trận", đóng bảng bằng Back (thẻ "đang tìm" nổi trên màn chơi), web tìm trận → được ghép
  await app.evaluate(() => { window.CaroShell.open('home'); window.CaroHome.pane('quick'); });
  await app.locator('#qm-start').scrollIntoViewIfNeeded();
  await app.click('#qm-start');
  check('app đang tìm trận', !!(await until(() => app.isVisible('#qm-search'))));
  pressBack();
  check('Back ở Trang chủ: về bàn cờ, thẻ đang tìm hiện trên màn chơi', !!(await until(() => app.isVisible('.qm-float'))));
  shot('searching');
  await web.evaluate(() => window.CaroOnline.send({ t: 'quickMatch', timeLimit: -1 }));
  // Web vừa rời phòng công khai trước nước đầu (= huỷ ván, bị ghi là bỏ ván) nên được ưu tiên ghép với người hay bỏ ván:
  // ghép với app sau khi chờ quá 20 giây
  check('tìm trận nhanh ghép app với web', !!(await until(() => app.evaluate(() => {
    const r = window.CaroOnline.state.room; return !!(r && r.quick && r.players.length === 2);
  }), 40000)));
  check('hết thẻ đang tìm sau khi ghép', !!(await until(() => app.isHidden('.qm-float'))));
  shot('matched');

  await step('giải đấu Arena', 4 * 60000);
  // Giải đấu: web (quản trị viên, ADMIN_USERNAMES=web_1,web_2 trong CI) tạo giải Arena; app mở trang giải bằng giao diện,
  // bấm Tham gia; bắt đầu giải -> app tự vào ván của giải
  await web.evaluate(() => window.CaroOnline.send({ t: 'leaveRoom' }));
  await app.evaluate(() => window.CaroOnline.send({ t: 'leaveRoom' }));
  await until(() => app.evaluate(() => !window.CaroOnline.state.room));
  const tourId = await web.evaluate(() => new Promise((resolve) => {
    setTimeout(() => resolve(null), 15000); // máy chủ không trả lời: báo thất bại thay vì chờ mãi
    window.CaroOnline.on('tourCreated', (m) => resolve(m.id));
    window.CaroOnline.send({ t: 'tourCreate', name: 'Arena CI', format: 'arena', startsAt: Date.now() + 120000, timeLimit: 30, minutes: 15 });
  }));
  check('quản trị viên tạo giải (duyệt luôn)', !!tourId);
  await app.evaluate(() => window.CaroShell.open('home'));
  await app.locator('#open-tours').scrollIntoViewIfNeeded();
  await app.click('#open-tours');
  check('app thấy giải trong danh sách', !!(await until(() => app.isVisible(`[data-act="tour"][data-id="${tourId}"]`))));
  await app.click(`[data-act="tour"][data-id="${tourId}"]`);
  await until(() => app.isVisible('[data-act="join"]'));
  await app.click('[data-act="join"]');
  check('app tham gia giải', !!(await until(() => app.evaluate(() => !!document.querySelector('[data-act="leave"]')))));
  shot('tour');
  // Ghi lại lỗi máy chủ trả về cho cả hai bên (để chẩn đoán nếu bước dưới trượt)
  for (const p of [app, web]) {
    await p.evaluate(() => {
      window.__srvErr = [];
      window.CaroOnline.on('error', (m) => window.__srvErr.push({ code: m.code, ctx: m.ctx, at: Math.round(performance.now()) }));
    });
  }
  await web.evaluate((id) => window.CaroOnline.send({ t: 'tourJoin', id }), tourId);
  await sleep(500);
  await web.evaluate((id) => window.CaroOnline.send({ t: 'tourStart', id }), tourId);
  const tourOk = !!(await until(() => app.evaluate((id) => {
    const r = window.CaroOnline.state.room; return !!(r && r.tour && r.tour.id === id && r.players.length === 2);
  }, tourId)));
  if (!tourOk) await tourDiag(app, web, tourId);
  check('bắt đầu giải: app tự vào ván với web', tourOk);
  check('hộp thoại giải tự đóng để vào bàn cờ', !!(await until(() => app.evaluate(() => !document.getElementById('tour-dlg').open))));
  shot('tour-game');
  await step('kết thúc', 2 * 60000);
  await web.screenshot({ path: `${SHOTS}/api${API}-web-vs-android.png` });
  console.log('Lỗi JS:', errors.length ? errors : 'không có');
  // Mạng của máy ảo đôi khi mất vài giây (ERR_ADDRESS_UNREACHABLE…): trình duyệt ghi lần kết nối WebSocket hỏng vào console.
  // Đó là mạng, không phải lỗi code (app tự kết nối lại – các bước trên đã kiểm) → không tính là lỗi JS
  const NETWORK = /Failed to load resource|WebSocket connection to .* failed/;
  const net = errors.filter((e) => NETWORK.test(e)).length;
  if (net) console.log(`(mạng máy ảo chập chờn: ${net} lần kết nối hỏng – không tính là lỗi JS)`);
  check('không có lỗi JS', !errors.some((e) => !NETWORK.test(e)));
  if (pendingDiag) { const label = pendingDiag; pendingDiag = ''; await diagnose('kiểm tra thất bại: ' + label); }
  finished = true;
  await browser.close();
  await device.close();
  watch.done();
  fontsProbe('cuối kịch bản');
  console.log(failed ? `✗ ${failed} kiểm tra thất bại` : '✓ Tất cả kiểm tra đều đạt');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); die('lỗi dừng test: ' + String(e && e.message || e).split('\n')[0], watch.current() && watch.current().name); });
