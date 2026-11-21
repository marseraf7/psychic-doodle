/*
 * Trợ giúp cho kiểm thử Android (app/tests/android-e2e.js): giới hạn thời gian từng bước và gắn vào WebView của app
 * qua Chrome DevTools (socket webview_devtools_remote_<pid>, Playwright _android).
 *
 * Vì sao cần (lỗi CI 21/11/2026, máy ảo khởi động nguội): Playwright 1.56 gọi connectToWebView KHÔNG có hạn giờ –
 * webview.page() chờ mãi socket của tiến trình (kể cả tiến trình đã chết / đổi pid), chờ mãi trang đầu tiên và sự kiện
 * "load". Test treo ở "Mở app (lần 1)" tới lưới an toàn 30 phút mà không in gì. Ở đây: mỗi lần gắn có hạn giờ, lấy lại
 * pid mới, kiểm socket đã có, quá hạn thì mở lại app (pid mới) rồi gắn lại; hết lượt thì báo lỗi kèm lý do từng lần.
 *
 * Không require Playwright / adb: mọi thứ truyền vào, để chạy được unit test (server/test/android-attach.test.js).
 */
'use strict';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Lỗi quá hạn của một bước – mang tên bước để biết chỗ treo. */
class StepTimeout extends Error {
  constructor(name, ms) {
    super(`Bước «${name}» quá ${Math.round(ms / 1000)} giây`);
    this.name = 'StepTimeout';
    this.step = name;
    this.ms = ms;
  }
}

/** Chờ một promise tối đa `ms`; quá hạn thì ném StepTimeout(name). Promise gốc vẫn chạy (không huỷ được) nhưng bị bỏ qua. */
function withTimeout(promise, ms, name) {
  let timer;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new StepTimeout(name, ms)), ms); });
  return Promise.race([Promise.resolve(promise), guard]).finally(() => clearTimeout(timer));
}

/**
 * Thử `fn` tới khi trả giá trị truthy hoặc hết `ms`; trả giá trị đó hoặc null. Mỗi lần gọi cũng bị giới hạn bằng thời gian
 * còn lại: một lần `evaluate` treo (trang không trả lời) không giữ vòng chờ mãi như bản cũ.
 */
async function until(fn, ms = 15000, step = 250) {
  const t0 = Date.now();
  for (;;) {
    const left = Math.max(1, ms - (Date.now() - t0));
    try { const v = await withTimeout(fn(), left, 'until'); if (v) return v; } catch (e) { /* thử lại */ }
    if (Date.now() - t0 >= ms) return null;
    await sleep(step);
  }
}

/** Các socket DevTools của WebView trong nội dung /proc/net/unix: [{ socketName, pid }] (pid = null nếu tên không có số). */
function parseDevtoolsSockets(procNetUnix) {
  const out = [], seen = new Set();
  for (const line of String(procNetUnix || '').split('\n')) {
    const m = line.match(/@((?:\S*?_)?webview_devtools_remote(?:_(\d+))?)\s*$/) || line.match(/@(\S*devtools_remote\S*)\s*$/);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ socketName: m[1], pid: m[2] ? Number(m[2]) : null });
  }
  return out;
}

/** pid đầu tiên trong kết quả `pidof <gói>` (null nếu không có tiến trình). */
function parsePidof(out) {
  const m = String(out || '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

/**
 * Đồng hồ canh bước: mỗi bước một hạn giờ; bước nào quá hạn thì gọi onTimeout({ name, ms }) đúng một lần.
 * Dùng cho phần thân dài của test (nhiều lệnh await chưa có hạn giờ riêng, như evaluate): chỗ treo báo ngay tên bước.
 * Hẹn giờ KHÔNG unref: promise treo mà vòng sự kiện trống thì Node sẽ thoát mã 0 (báo xanh giả).
 */
function createStepWatch({ onTimeout, log = console.log, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now } = {}) {
  let cur = null, timer = null, fired = false;
  const stop = () => { if (timer) clearTimer(timer); timer = null; };
  return {
    step(name, ms) {
      stop();
      cur = { name, ms, t0: now() };
      log(`— Bước: ${name} (tối đa ${Math.round(ms / 1000)} giây)`);
      const mine = cur;
      timer = setTimer(() => {
        if (fired || cur !== mine) return;
        fired = true;
        onTimeout({ name: mine.name, ms: mine.ms });
      }, ms);
    },
    current() { return cur && { name: cur.name, ms: cur.ms, elapsed: now() - cur.t0 }; },
    done() { stop(); cur = null; },
  };
}

/**
 * Gắn vào WebView của app, có hạn giờ và thử lại.
 *  device:   AndroidDevice của Playwright (cần webView({ socketName }, { timeout }))
 *  pidOf():  pid hiện tại của app (null nếu chưa chạy) – đọc lại mỗi lần, không dùng pid cũ
 *  sockets(): danh sách socket DevTools (parseDevtoolsSockets)
 *  relaunch(): mở lại app (force-stop + mở) trước lần thử thứ 2 trở đi → tiến trình mới, socket mới
 *  ready(page): kiểm trang đã trả lời (vd. evaluate document.readyState)
 * Trả { page, pid, socketName, attempt }; hết lượt thì ném Error kèm lý do từng lần.
 */
async function attachWebView({ device, pidOf, sockets, relaunch, ready = (p) => p.evaluate(() => document.readyState),
  attempts = 3, pidMs = 20000, socketMs = 45000, pageMs = 60000, readyMs = 15000, log = console.log } = {}) {
  const reasons = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      if (attempt > 1) {
        log(`Gắn WebView lần ${attempt}: mở lại app để có tiến trình mới`);
        await relaunch();
      }
      const pid = await until(() => pidOf(), pidMs, 500);
      if (!pid) throw new Error(`app không có tiến trình sau ${pidMs / 1000} giây`);
      const socketName = `webview_devtools_remote_${pid}`;
      const found = await until(() => (sockets() || []).some((s) => s.socketName === socketName), socketMs, 500);
      if (!found) throw new Error(`chưa có socket ${socketName} sau ${socketMs / 1000} giây (WebView chưa tạo / tiến trình đã đổi)`);
      const webview = await withTimeout(device.webView({ socketName }, { timeout: socketMs }), socketMs + 5000, 'device.webView');
      const page = await withTimeout(webview.page(), pageMs, `webview.page() (${socketName})`);
      if (!page) throw new Error('WebView không có trang nào');
      await withTimeout(Promise.resolve(ready(page)), readyMs, 'trang trả lời');
      const pidNow = await until(() => pidOf(), 5000, 500);
      if (pidNow !== pid) throw new Error(`tiến trình app đổi trong lúc gắn (pid ${pid} → ${pidNow})`);
      log(`Đã gắn WebView: pid ${pid}, socket ${socketName}${attempt > 1 ? ` (lần ${attempt})` : ''}`);
      return { page, pid, socketName, attempt };
    } catch (e) {
      const why = `lần ${attempt}: ${e && e.message ? e.message.split('\n')[0] : e}`;
      reasons.push(why);
      log('Gắn WebView chưa được – ' + why);
    }
  }
  const err = new Error(`Không gắn được WebView của app sau ${attempts} lần: ${reasons.join('; ')}`);
  err.reasons = reasons;
  throw err;
}

module.exports = { StepTimeout, withTimeout, until, parseDevtoolsSockets, parsePidof, createStepWatch, attachWebView, sleep };
