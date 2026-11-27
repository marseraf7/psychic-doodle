'use strict';
// Trợ giúp của kiểm thử Android trên máy ảo (app/tests/android-attach.js, android-diag.js): hạn giờ từng bước, gắn WebView
// có thử lại (pid mới, socket đã có), chẩn đoán khi lỗi. Máy ảo chỉ chạy được trên CI – ở đây thử logic bằng đồ giả.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const APP = path.join(__dirname, '..', '..', 'app');
const A = require(path.join(APP, 'tests', 'android-attach.js'));
const D = require(path.join(APP, 'tests', 'android-diag.js'));
const PKG = 'io.github.marseraf7.caro';
const never = () => new Promise(() => {});

test('withTimeout: trả kết quả, chuyển lỗi, quá hạn thì báo tên bước', async () => {
  assert.strictEqual(await A.withTimeout(Promise.resolve(7), 100, 'x'), 7);
  assert.strictEqual(await A.withTimeout(5, 100, 'không phải promise'), 5);
  await assert.rejects(A.withTimeout(Promise.reject(new Error('hỏng')), 100, 'x'), /hỏng/);
  await assert.rejects(A.withTimeout(never(), 30, 'webview.page()'), (e) =>
    e instanceof A.StepTimeout && e.step === 'webview.page()' && e.ms === 30 && /«webview\.page\(\)»/.test(e.message));
});

test('until: lần gọi treo không giữ vòng chờ mãi (lỗi CI: evaluate treo → test treo 30 phút)', async () => {
  const t0 = Date.now();
  assert.strictEqual(await A.until(never, 80, 10), null);
  assert.ok(Date.now() - t0 < 1000);
  let n = 0;
  assert.strictEqual(await A.until(() => (++n >= 3 ? 'xong' : 0), 1000, 5), 'xong');
  let k = 0;
  assert.strictEqual(await A.until(() => { if (++k < 2) throw new Error('chưa'); return true; }, 1000, 5), true);
  assert.strictEqual(await A.until(() => false, 30, 5), null);
});

test('parseDevtoolsSockets / parsePidof', () => {
  const unix = [
    'Num       RefCount Protocol Flags    Type St Inode Path',
    '0000000000000000: 00000002 00000000 00010000 0001 01 23145 @webview_devtools_remote_4321',
    '0000000000000000: 00000002 00000000 00010000 0001 01 23146 @webview_devtools_remote_4321',
    '0000000000000000: 00000002 00000000 00010000 0001 01 23147 @chrome_devtools_remote',
    '0000000000000000: 00000002 00000000 00010000 0001 01 23148 @playwright_x_devtools_remote',
    '0000000000000000: 00000002 00000000 00010000 0001 01 23149 /dev/socket/zygote',
  ].join('\n');
  assert.deepStrictEqual(A.parseDevtoolsSockets(unix), [
    { socketName: 'webview_devtools_remote_4321', pid: 4321 },
    { socketName: 'chrome_devtools_remote', pid: null },
    { socketName: 'playwright_x_devtools_remote', pid: null },
  ]);
  assert.deepStrictEqual(A.parseDevtoolsSockets(''), []);
  assert.deepStrictEqual(A.parseDevtoolsSockets(undefined), []);
  assert.strictEqual(A.parsePidof('4321\n'), 4321);
  assert.strictEqual(A.parsePidof('4321 999'), 4321);
  assert.strictEqual(A.parsePidof(''), null);
});

test('createStepWatch: bước quá hạn báo đúng tên, một lần; sang bước mới thì huỷ hạn cũ', async () => {
  const fired = [], logs = [];
  const w = A.createStepWatch({ onTimeout: (s) => fired.push(s), log: (m) => logs.push(m) });
  assert.strictEqual(w.current(), null);
  w.step('mở app', 30);
  w.step('gắn WebView', 40); // huỷ hạn của "mở app"
  assert.strictEqual(w.current().name, 'gắn WebView');
  await A.sleep(90);
  assert.deepStrictEqual(fired, [{ name: 'gắn WebView', ms: 40 }]);
  w.step('bước sau', 10);
  await A.sleep(40);
  assert.strictEqual(fired.length, 1, 'chỉ báo lần đầu (đang chẩn đoán / thoát)');
  w.done();
  assert.strictEqual(w.current(), null);
  assert.ok(logs[0].includes('mở app'));
  // done() trước hạn: không báo
  const f2 = [];
  const w2 = A.createStepWatch({ onTimeout: (s) => f2.push(s), log: () => {} });
  w2.step('x', 20); w2.done();
  await A.sleep(40);
  assert.deepStrictEqual(f2, []);
});

/** Máy ảo giả: mỗi lần mở lại app thì pid mới; webview.page() treo ở các pid trong `stuck`. */
function fakeDevice({ pids, stuck = [], noSocket = [], changeAfterAttach = false }) {
  let i = 0, pid = pids[0], relaunches = 0, attached = false;
  const pages = [];
  return {
    get relaunches() { return relaunches; },
    pages,
    pidOf: () => (attached && changeAfterAttach ? pid + 1 : pid),
    sockets: () => (pid && !noSocket.includes(pid) ? [{ socketName: `webview_devtools_remote_${pid}`, pid }] : []),
    relaunch: async () => { relaunches++; pid = pids[++i] || null; attached = false; },
    device: {
      webView: async ({ socketName }) => ({
        page: () => {
          const p = Number(socketName.split('_').pop());
          if (stuck.includes(p)) return never();
          const page = { pid: p, evaluate: async () => { attached = true; return 'complete'; } };
          pages.push(page);
          return Promise.resolve(page);
        },
      }),
    },
  };
}
const quick = { pidMs: 60, socketMs: 60, pageMs: 60, readyMs: 60, log: () => {} };

test('attachWebView: máy chạy tốt thì gắn ngay lần đầu, không mở lại app', async () => {
  const f = fakeDevice({ pids: [100] });
  const r = await A.attachWebView({ ...quick, device: f.device, pidOf: f.pidOf, sockets: f.sockets, relaunch: f.relaunch });
  assert.strictEqual(r.pid, 100);
  assert.strictEqual(r.socketName, 'webview_devtools_remote_100');
  assert.strictEqual(r.attempt, 1);
  assert.strictEqual(f.relaunches, 0);
  assert.strictEqual(r.page.pid, 100);
});

test('attachWebView: webview.page() treo → mở lại app, gắn vào tiến trình mới (pid mới)', async () => {
  const logs = [];
  const f = fakeDevice({ pids: [100, 200], stuck: [100] });
  const r = await A.attachWebView({ ...quick, log: (m) => logs.push(m), device: f.device, pidOf: f.pidOf, sockets: f.sockets, relaunch: f.relaunch });
  assert.strictEqual(r.pid, 200);
  assert.strictEqual(r.attempt, 2);
  assert.strictEqual(f.relaunches, 1);
  assert.ok(logs.some((l) => /webview\.page\(\).*quá/.test(l)), logs.join('\n'));
});

test('attachWebView: socket chưa có / không có tiến trình → thử lại; hết lượt thì báo lý do từng lần', async () => {
  const f = fakeDevice({ pids: [100, null, 300], noSocket: [100, 300] });
  await assert.rejects(A.attachWebView({ ...quick, device: f.device, pidOf: f.pidOf, sockets: f.sockets, relaunch: f.relaunch }), (e) => {
    assert.strictEqual(e.reasons.length, 3);
    assert.match(e.reasons[0], /lần 1: chưa có socket webview_devtools_remote_100/);
    assert.match(e.reasons[1], /lần 2: app không có tiến trình/);
    assert.match(e.reasons[2], /lần 3: chưa có socket webview_devtools_remote_300/);
    return /sau 3 lần/.test(e.message);
  });
  assert.strictEqual(f.relaunches, 2);
});

test('attachWebView: tiến trình đổi pid ngay sau khi gắn (app bị giết / khởi động lại) thì không nhận', async () => {
  const f = fakeDevice({ pids: [100, 200, 300], changeAfterAttach: true });
  await assert.rejects(A.attachWebView({ ...quick, attempts: 2, device: f.device, pidOf: f.pidOf, sockets: f.sockets, relaunch: f.relaunch }),
    (e) => /pid 100 → 101/.test(e.reasons[0]) && /pid 200 → 201/.test(e.reasons[1]));
});

test('attachWebView: trang không trả lời (evaluate treo) cũng tính là gắn hỏng', async () => {
  const f = fakeDevice({ pids: [100, 200] });
  let n = 0;
  const r = await A.attachWebView({ ...quick, device: f.device, pidOf: f.pidOf, sockets: f.sockets, relaunch: f.relaunch,
    ready: () => (++n === 1 ? never() : 'complete') });
  assert.strictEqual(r.attempt, 2);
  assert.strictEqual(r.pid, 200);
});

test('logcatFilter / deathLines: bắt dòng app bị giết vì phụ thuộc FontsProvider của GMS', () => {
  const lines = [
    '11-21 13:20:01.000 I/ActivityManager( 512): Process com.google.android.gms.persistent (pid 1200) has died: fg  SVC',
    '11-21 13:20:01.010 I/ActivityManager( 512): Killing 4321:io.github.marseraf7.caro/u0a190 (adj 0): depends on provider com.google.android.gms/.fonts.provider.FontsProvider in dying proc com.google.android.gms.persistent (adj 100)',
    '11-21 13:20:02.000 E/AndroidRuntime(4321): FATAL EXCEPTION: main',
    '11-21 13:20:03.000 I/SomethingElse( 99): không liên quan',
  ];
  const re = D.logcatFilter(PKG);
  assert.deepStrictEqual(lines.filter((l) => re.test(l)).length, 3);
  const dead = D.deathLines(lines, PKG);
  assert.strictEqual(dead.length, 2);
  assert.match(dead[0], /depends on provider .*FontsProvider/);
});

test('providerDependents: đọc kết nối provider của app trong dumpsys activity providers', () => {
  const dump = [
    'ACTIVITY MANAGER CONTENT PROVIDERS (dumpsys activity providers)',
    '  Published single-user content providers (by class):',
    '  * ContentProviderRecord{a1b2c3 u0 com.google.android.gms/.fonts.provider.FontsProvider}',
    '    package=com.google.android.gms process=com.google.android.gms.persistent',
    '    authority=com.google.android.gms.fonts',
    '    Connections:',
    '      -> 4321:io.github.marseraf7.caro/u0a190 s1/1 u0/0 +3s',
    '      -> 777:com.other.app/u0a1 s0/0 u1/1 +1m',
    '  * ContentProviderRecord{d4e5f6 u0 io.github.marseraf7.caro/androidx.core.content.FileProvider}',
    '    package=io.github.marseraf7.caro process=io.github.marseraf7.caro',
    '    authority=io.github.marseraf7.caro.fileprovider',
  ].join('\n');
  assert.deepStrictEqual(D.providerDependents(dump, PKG), [{ provider: 'com.google.android.gms/.fonts.provider.FontsProvider',
    authority: 'com.google.android.gms.fonts', process: 'com.google.android.gms.persistent', pid: 4321, stable: 1, unstable: 0 }]);
  assert.deepStrictEqual(D.providerDependents('', PKG), []);
});

test('createDiagnose: ghi file chẩn đoán, đọc target CDP qua cổng chuyển tiếp, phần hỏng không làm mất phần khác', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-diag-'));
  const srv = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/json/version') return res.end(JSON.stringify({ Browser: 'Chrome/140.0' }));
    res.end(JSON.stringify([{ type: 'page', url: 'https://localhost/', title: 'Cờ Caro', attached: false }]));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const calls = [];
  const adb = (...args) => {
    calls.push(args.join(' '));
    const c = args.join(' ');
    if (c === `shell pidof ${PKG}`) return '4321\n';
    if (c === 'shell cat /proc/net/unix') return '0: 00000002 0 0 0001 01 1 @webview_devtools_remote_4321\n';
    if (c.startsWith('forward tcp:0')) return `${port}\n`;
    if (c.startsWith('forward --remove')) return '';
    if (c === 'shell dumpsys activity providers') return '';
    if (c === 'shell dumpsys activity top') return 'TASK io.github.marseraf7.caro\n  ACTIVITY io.github.marseraf7.caro/.MainActivity';
    if (c === 'logcat -d -v time') return 'I/ActivityManager( 1): Killing 4321:io.github.marseraf7.caro/u0a1 (adj 0): depends on provider x\nI/Khác: bỏ\n';
    throw new Error('lệnh lạ ' + c);
  };
  const log = console.log;
  const printed = [];
  console.log = (m) => printed.push(String(m));
  let file;
  try {
    const diagnose = D.createDiagnose({ adb, pkg: PKG, dir, prefix: 'api34', parseDevtoolsSockets: A.parseDevtoolsSockets,
      screenState: () => 'topResumedActivity=MainActivity',
      screencap: () => { throw new Error('máy ảo đã tắt'); }, // phần hỏng
      webPage: () => null, extra: async () => ({ ok: 1 }) });
    file = await diagnose('bước «gắn WebView» treo', 'gắn WebView');
  } finally { console.log = log; srv.close(); }
  const txt = fs.readFileSync(file, 'utf8');
  assert.match(txt, /CHẨN ĐOÁN #1: bước «gắn WebView» treo \(bước «gắn WebView»\)/);
  assert.match(txt, /\[ảnh màn hình máy ảo\] lỗi: máy ảo đã tắt/);
  assert.match(txt, /webview_devtools_remote_4321/);
  assert.match(txt, /"version":"Chrome\/140\.0"/);
  assert.match(txt, /"url":"https:\/\/localhost\/"/);
  assert.match(txt, /TIẾN TRÌNH CHẾT \/ BỊ GIẾT:\n {2}.*depends on provider/);
  assert.match(txt, /không có kết nối provider nào từ app/);
  assert.match(txt, /\{"ok":1\}/);
  assert.ok(fs.existsSync(path.join(dir, 'api34-loi1-logcat.txt')));
  assert.ok(fs.existsSync(path.join(dir, 'api34-loi1-activity-top.txt')));
  assert.ok(calls.includes(`forward --remove tcp:${port}`), 'gỡ cổng chuyển tiếp');
  assert.ok(printed.some((l) => l.includes('HẾT CHẨN ĐOÁN #1')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('AndroidManifest: tắt EmojiCompat tự khởi động (không phụ thuộc FontsProvider của GMS)', () => {
  const xml = fs.readFileSync(path.join(APP, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
  assert.match(xml, /xmlns:tools="http:\/\/schemas\.android\.com\/tools"/);
  assert.match(xml, /<provider\s+android:name="androidx\.startup\.InitializationProvider"[\s\S]*?tools:node="merge"[\s\S]*?<meta-data\s+android:name="androidx\.emoji2\.text\.EmojiCompatInitializer"\s+tools:node="remove"\s*\/>/);
  // Không tự xin phông tải về từ GMS (chỉ xét mã, bỏ chú thích)
  assert.doesNotMatch(xml.replace(/<!--[\s\S]*?-->/g, ''), /com\.google\.android\.gms\.fonts|preloaded_fonts|font_certs/);
});

test('android-provider-watch: dời mốc giờ, lọc nhật ký theo khoảng, báo kết nối Play Services mới kèm nhật ký quanh mốc', async () => {
  const W = require(path.join(APP, 'tests', 'android-provider-watch.js'));
  assert.strictEqual(W.shift('11-27 07:43:49.840', -8), '11-27 07:43:41.840');
  assert.strictEqual(W.shift('11-27 07:43:59.500', 2), '11-27 07:44:01.500');
  assert.strictEqual(W.stampOf('rác'), null);
  const log = '11-27 07:43:40.000 I/FontLog ( 1180): sớm quá\n11-27 07:43:49.840 I/FontLog ( 1180): Received query Google Sans\n'
    + '11-27 07:43:50.100 I/chromium ( 4321): app đang làm gì đó\n11-27 07:44:30.000 I/FontLog ( 1180): muộn quá';
  assert.deepStrictEqual(W.linesBetween(log, '11-27 07:43:45.000', '11-27 07:43:55.000', (l) => /FontLog/.test(l)).length, 1);
  // Đồ giả adb: lượt đọc thứ hai mới có kết nối tới FontsProvider
  let n = 0;
  const block = `\n  * ContentProviderRecord{abc u0 com.google.android.gms/.fonts.provider.FontsProvider}\n    package=com.google.android.gms process=com.google.android.gms.persistent\n    authority=com.google.android.gms.fonts\n    Connections:\n      -> 4321:${PKG}/u0a209 s1/1 u0/0 +3s\n`;
  const adb = (...a) => {
    if (a.includes('providers')) return ++n >= 2 ? 'ACTIVITY MANAGER CONTENT PROVIDERS' + block : 'ACTIVITY MANAGER CONTENT PROVIDERS\n';
    if (a.includes('date')) return '11-27 07:43:52.000\n';
    if (a.includes('pidof')) return '4321\n';
    if (a[0] === 'logcat') return log;
    return '';
  };
  const out = [], orig = console.log;
  console.log = (s) => out.push(String(s));
  try {
    const w = W.createProviderWatch({ adb, pkg: PKG, providerDependents: D.providerDependents, stepName: () => 'mở app', everyMs: 10 });
    w.start();
    await new Promise((r) => setTimeout(r, 60));
    w.stop();
  } finally { console.log = orig; }
  const text = out.join('\n');
  assert.match(text, /\+ com\.google\.android\.gms\/\.fonts\.provider\.FontsProvider \(com\.google\.android\.gms\.persistent\) stable 1/);
  assert.match(text, /bước «mở app», pid 4321/);
  assert.match(text, /Received query Google Sans/);
  assert.match(text, /app đang làm gì đó/);
  assert.doesNotMatch(text, /sớm quá|muộn quá/);
  assert.match(text, /dừng theo dõi .*1 lần đổi/);
});
