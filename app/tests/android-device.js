/*
 * Điều khiển máy ảo Android cho kiểm thử app/tests/android-e2e.js: lệnh adb có hạn giờ, chờ máy ảo khởi động xong,
 * dẹp hộp thoại hệ thống, chạm / Back thật, đọc trạng thái màn hình, logcat, thanh hệ thống, khung WebView.
 */
'use strict';
const { execFileSync } = require('child_process');
const { sleep } = require('./android-attach');

/**
 * Lệnh adb có giới hạn thời gian: trên máy ảo CI yếu, một lệnh (dumpsys, uiautomator…) có lúc treo mãi – lệnh đồng bộ
 * treo thì chặn cả tiến trình Node (không hẹn giờ nào chạy được), job bị huỷ sau 45 phút mà không có thông tin gì.
 * Quá 30 giây: thử lại 1 lần rồi báo lỗi.
 */
function adb(...args) {
  for (let i = 0; ; i++) {
    try { return execFileSync('adb', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 64 << 20 }); } catch (e) {
      if (e.code !== 'ETIMEDOUT' || i >= 1) throw e;
      console.log('adb treo quá 30 giây, thử lại: adb ' + args.join(' '));
    }
  }
}
/**
 * Máy ảo khởi động nguội trên CI có lúc báo "device offline" vài lần rồi mới xong: chờ adb thấy máy, sys.boot_completed=1
 * và trình quản lý gói trả lời (tối đa ~3 phút) trước khi làm gì – không thì lệnh adb đầu tiên hỏng, test dừng không lý do.
 */
function waitBoot(pkg, ms = 180000) {
  const t0 = Date.now();
  try { execFileSync('adb', ['wait-for-device'], { timeout: ms }); } catch (e) { console.log('adb wait-for-device: ' + e.message.split('\n')[0]); }
  for (let i = 0; Date.now() - t0 < ms; i++) {
    try {
      const boot = execFileSync('adb', ['shell', 'getprop', 'sys.boot_completed'], { encoding: 'utf8', timeout: 15000 }).trim();
      const pm = execFileSync('adb', ['shell', 'pm', 'path', pkg], { encoding: 'utf8', timeout: 15000 });
      if (boot === '1' && /package:/.test(pm)) { if (i) console.log(`Máy ảo sẵn sàng sau ${Math.round((Date.now() - t0) / 1000)} giây`); return; }
    } catch (e) { if (i % 10 === 0) console.log('Chờ máy ảo khởi động xong: ' + e.message.split('\n')[0]); }
    execFileSync('sleep', ['2']);
  }
  console.log('Máy ảo chưa báo khởi động xong sau ' + ms / 1000 + ' giây – vẫn chạy tiếp');
}

/**
 * Máy ảo trên CI rất yếu: ngay sau khi khởi động, màn hình chính (Pixel Launcher) có lúc bị treo và Android hiện hộp
 * thoại "… isn't responding" đè lên app. Khi đó chạm / Back thật (adb input) rơi vào hộp thoại chứ không tới app
 * (bàn phím không hiện, Back không đóng được hộp thoại của app…). Trước mỗi thao tác thật: bấm "Wait" để dẹp hộp thoại.
 */
const SYS_DIALOG = /Application Not Responding|isn't responding|has stopped|keeps stopping/;
/**
 * Dòng mCurrentFocus của hộp thoại hệ thống đang hiện ('' nếu không có). dumpsys có thể in NHIỀU dòng mCurrentFocus (mỗi màn
 * hình một dòng – Android 34: dòng đầu là "mCurrentFocus=null", hộp treo nằm ở dòng sau): phải xét mọi dòng, không chỉ dòng đầu
 * (lỗi CI 13/11/2026: hộp "Pixel Launcher isn't responding" không được dẹp nên bàn phím không hiện / không tìm được trận).
 */
function systemDialogLine() {
  try { return (adb('shell', 'dumpsys', 'window').match(/mCurrentFocus=[^\n]*/g) || []).find((l) => SYS_DIALOG.test(l)) || ''; } catch (e) { return ''; }
}
const systemDialog = () => !!systemDialogLine();
function dismissSystemDialogs() {
  for (let i = 0; i < 5 && systemDialog(); i++) {
    console.log('Dẹp hộp thoại hệ thống: ' + systemDialogLine().trim());
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
    const lines = adb('logcat', '-d', '-v', 'time', '-t', '4000').split('\n').filter((l) => re.test(l));
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

module.exports = { adb, waitBoot, SYS_DIALOG, systemDialogLine, systemDialog, dismissSystemDialogs, realTap, pressBack, screenState,
  dumpLogcat, systemBars, webViewFromUiautomator, webViewFromDumpsys, webViewBounds, stableTapPoint, screenRect };
