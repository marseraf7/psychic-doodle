/*
 * Theo dõi provider mà app đang giữ kết nối (điều tra Play Services kéo app chết – FontsProvider, 27/11/2026).
 * Mỗi ~1 giây đọc `dumpsys activity providers`, lọc kết nối từ tiến trình app (providerDependents ở android-diag.js).
 * Khi tập kết nối đổi: in giờ máy ảo, bước kịch bản đang chạy, các kết nối mới, rồi in nhật ký quanh mốc đó
 * (dòng FontLog của Play Services + dòng của chính tiến trình app) để biết ai trong app mở kết nối và xin phông gì.
 * Chỉ in, không làm bài thử thất bại. Dùng: const w = createProviderWatch({ adb, pkg, providerDependents, stepName });
 * w.start() lúc mở app, w.stop() khi đã qua phần khởi động (mặc định tự dừng sau 3 phút).
 *
 * Kết quả đo (CI 27/11/2026): ~8 giây sau khi mở app, WebView (bộ tra phông của Chromium, AndroidFontLookup) nối tới
 * FontsProvider và nạp sẵn Google Sans 400/500/700 + Noto Color Emoji Compat, ~22 giây thì nhả. Trên máy ảo vừa khởi
 * động, lần xin phông đầu tiên làm Play Services tải danh mục / tệp phông rồi tự khởi động lại tiến trình persistent –
 * nếu đúng lúc đó app đang giữ kết nối thì Android giết app theo. Không phải mã của game, không tắt được từ app.
 * warmUp(): làm nóng trước kịch bản – mở app một lần, chờ WebView xin phông xong và Play Services ổn định, rồi tắt app.
 */
'use strict';

/** Khoá so sánh một kết nối: provider + số stable / unstable. */
const keyOf = (d) => `${d.provider} s${d.stable} u${d.unstable}`;

/** Dòng logcat "-v time" ('11-27 07:43:49.840 I/FontLog ( 1180): …') → mốc so sánh được 'MM-DD HH:MM:SS.mmm'. */
const stampOf = (line) => (String(line).match(/^(\d\d-\d\d \d\d:\d\d:\d\d\.\d{3})/) || [])[1] || null;

/** Lọc dòng nhật ký trong khoảng [from, to] (mốc dạng stampOf) theo hàm thử. */
function linesBetween(text, from, to, test) {
  return String(text || '').split('\n').filter((l) => {
    const s = stampOf(l);
    return s && s >= from && s <= to && test(l);
  });
}

/** Lùi / tiến mốc 'MM-DD HH:MM:SS.mmm' n giây (không qua nửa đêm trong một lần chạy CI ~10 phút – chấp nhận lệch). */
function shift(stamp, sec) {
  const m = stamp.match(/^(\d\d-\d\d) (\d\d):(\d\d):(\d\d)\.(\d{3})$/);
  if (!m) return stamp;
  let t = Math.max(0, Math.min(86399999, ((+m[2] * 60 + +m[3]) * 60 + +m[4]) * 1000 + +m[5] + sec * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const ms = t % 1000; t = Math.floor(t / 1000);
  return `${m[1]} ${p(Math.floor(t / 3600))}:${p(Math.floor(t / 60) % 60)}:${p(t % 60)}.${p(ms, 3)}`;
}

function createProviderWatch({ adb, pkg, providerDependents, stepName, everyMs = 1000, maxMs = 3 * 60000 }) {
  let timer = null, last = new Set(), t0 = 0, changes = 0;
  // adb shell nối các tham số bằng dấu cách rồi shell máy ảo tách lại – chuỗi định dạng có dấu cách phải nằm trong ngoặc
  const now = () => { try { return adb('shell', "date +'%m-%d %H:%M:%S.000'").trim(); } catch (e) { return null; } };
  const pidOf = () => { try { return adb('shell', 'pidof', pkg).trim().split(/\s+/)[0] || null; } catch (e) { return null; } };

  function context(stamp, pid) {
    try {
      const log = adb('logcat', '-d', '-v', 'time', '-t', '20000');
      const from = shift(stamp, -8), to = shift(stamp, 2);
      const fonts = linesBetween(log, from, to, (l) => /FontLog|FontsProvider|fonts\.provider/i.test(l));
      const own = pid ? linesBetween(log, from, to, (l) => l.includes(`(${pid.padStart(5)})`) || l.includes(`(${pid})`)) : [];
      console.log(`  FontLog quanh mốc (${from} → ${to}): ${fonts.length} dòng`);
      for (const l of fonts.slice(-25)) console.log('    ' + l.slice(0, 220));
      console.log(`  Nhật ký tiến trình app (pid ${pid || '?'}) quanh mốc: ${own.length} dòng, 30 dòng cuối`);
      for (const l of own.slice(-30)) console.log('    ' + l.slice(0, 220));
    } catch (e) { console.log('  không đọc được logcat: ' + e.message.split('\n')[0]); }
  }

  function sample() {
    if (Date.now() - t0 > maxMs) return stop('hết ' + Math.round(maxMs / 1000) + ' giây theo dõi');
    let deps;
    try { deps = providerDependents(adb('shell', 'dumpsys', 'activity', 'providers'), pkg); } catch (e) { return; }
    const cur = new Set(deps.map(keyOf));
    const added = deps.filter((d) => !last.has(keyOf(d)));
    const gone = [...last].filter((k) => !cur.has(k));
    if (!added.length && !gone.length) return;
    last = cur;
    if (++changes > 20) return; // đủ dữ liệu, không in tràn
    const stamp = now(), pid = pidOf();
    const step = (stepName && stepName()) || '?';
    console.log(`PROVIDER (${((Date.now() - t0) / 1000).toFixed(1)} giây sau khi mở app, giờ máy ảo ${stamp}, bước «${step}», pid ${pid}):`);
    for (const d of added) console.log(`  + ${d.provider} (${d.process}) stable ${d.stable} / unstable ${d.unstable}`);
    for (const k of gone) console.log(`  − ${k}`);
    if (stamp && added.some((d) => /gms/.test(d.provider))) context(stamp, pid);
  }

  function start() {
    if (timer) return;
    t0 = Date.now();
    console.log(`PROVIDER: bắt đầu theo dõi, giờ máy ảo ${now()}`);
    sample();
    timer = setInterval(sample, everyMs);
    timer.unref && timer.unref();
  }
  function stop(why) {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    console.log(`PROVIDER: dừng theo dõi (${why || 'xong phần khởi động'}), ${changes} lần đổi`);
  }
  return { start, stop };
}

/**
 * Làm nóng Play Services trước kịch bản (xem đầu file). launch(): mở app (force-stop + monkey). Không bao giờ ném lỗi;
 * trả { fonts: đã thấy kết nối FontsProvider, released: đã nhả, gmsRestarts: số lần pid Play Services persistent đổi,
 * appDied: app chết giữa chừng, ms }. Chờ tối đa maxMs.
 */
async function warmUp({ adb, pkg, providerDependents, launch, sleep, maxMs = 120000, settleMs = 15000 }) {
  const t0 = Date.now();
  const pid = (name) => { try { return adb('shell', 'pidof', name).trim().split(/\s+/)[0] || null; } catch (e) { return null; } };
  const fontsDep = () => {
    try { return providerDependents(adb('shell', 'dumpsys', 'activity', 'providers'), pkg).some((d) => /fonts/.test(d.provider)); } catch (e) { return false; }
  };
  const r = { fonts: false, released: false, gmsRestarts: 0, appDied: false, ms: 0 };
  let gms = pid('com.google.android.gms.persistent'), stableSince = Date.now();
  const watchGms = () => {
    const p = pid('com.google.android.gms.persistent');
    if (p !== gms) { if (gms && p) r.gmsRestarts++; gms = p; stableSince = Date.now(); }
  };
  try {
    launch();
    let appPid = null;
    while (Date.now() - t0 < maxMs) {
      await sleep(1000);
      watchGms();
      const ap = pid(pkg);
      if (appPid && ap !== appPid) r.appDied = true;
      appPid = ap || appPid;
      const dep = fontsDep();
      if (dep) r.fonts = true;
      else if (r.fonts) r.released = true;
      // Xong khi: WebView đã xin phông và nhả (hoặc 40 giây không thấy xin), Play Services không đổi pid trong settleMs
      const fontsDone = r.released || (!r.fonts && Date.now() - t0 > 40000);
      if (fontsDone && Date.now() - stableSince >= settleMs) break;
    }
  } catch (e) { console.log('Làm nóng: lỗi ' + e.message.split('\n')[0]); }
  try { adb('shell', 'am', 'force-stop', pkg); } catch (e) { /* bỏ qua */ }
  r.ms = Date.now() - t0;
  console.log('Làm nóng Play Services: ' + JSON.stringify(r));
  return r;
}

module.exports = { createProviderWatch, warmUp, linesBetween, shift, stampOf };
