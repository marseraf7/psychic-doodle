/*
 * Chẩn đoán khi kiểm thử Android thất bại / treo (app/tests/android-e2e.js): ghi đủ thông tin để không bao giờ phải
 * kết luận "chập chờn". Mỗi phần có hạn giờ và tự bắt lỗi riêng – phần này hỏng không làm mất phần khác.
 *  - ảnh màn hình máy ảo (và trang web nếu có) vào thư mục workflow tải lên (SHOTS_DIR)
 *  - logcat lọc theo app / chromium / WebView / AndroidRuntime / ActivityManager (+ toàn bộ logcat ra file)
 *  - dumpsys activity top, pid của app, socket DevTools của WebView (/proc/net/unix), danh sách target CDP của từng socket
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { withTimeout } = require('./android-attach');

/** Dòng logcat liên quan (app, WebView, tiến trình chết / bị giết, ANR, GMS…). */
function logcatFilter(pkg) {
  const esc = pkg.replace(/[.]/g, '\\.');
  return new RegExp(`${esc}|caro|chromium|cr_|WebView|webview|AndroidRuntime|ActivityManager|ActivityTaskManager|` +
    'libprocessgroup|lmkd|lowmemory|DEBUG|libc|ANR|died|Killing|depends on provider|FontsProvider|gms\\.persistent|Capacitor', 'i');
}

/** Dòng nói vì sao tiến trình của app chết (bị giết vì phụ thuộc provider, crash, ANR, hết bộ nhớ). */
function deathLines(lines, pkg) {
  const re = new RegExp(`(Killing \\d+:${pkg.replace(/[.]/g, '\\.')}|Process ${pkg.replace(/[.]/g, '\\.')} .*(died|has died)|` +
    'depends on provider|FATAL EXCEPTION|ANR in|Low on memory|lowmemorykiller)', 'i');
  return lines.filter((l) => re.test(l));
}

/**
 * Provider nào đang có kết nối từ app, đọc từ `dumpsys activity providers`: [{ provider, authority, process, pid, stable, unstable }].
 * Kết nối stable (s>0) tới provider ở tiến trình khác = tiến trình đó chết thì Android giết luôn app
 * ("depends on provider … in dying proc"). Dùng để biết app còn phụ thuộc FontsProvider của GMS không.
 */
function providerDependents(text, pkg) {
  const out = [];
  for (const block of String(text || '').split(/\n\s*\* ContentProviderRecord\{/).slice(1)) {
    const head = block.match(/^[^}]*\s(\S+)\}/);
    const authority = (block.match(/\n\s*authority=(\S+)/) || [])[1] || '';
    const proc = (block.match(/\n\s*package=\S+ process=(\S+)/) || [])[1] || '';
    const re = /->\s*(\d+):([^/\s]+)\/\S*\s+s(\d+)\/(\d+)\s+u(\d+)\/(\d+)/g;
    let m;
    while ((m = re.exec(block))) {
      if (m[2] !== pkg) continue;
      out.push({ provider: head ? head[1] : '?', authority, process: proc, pid: +m[1], stable: +m[3], unstable: +m[5] });
    }
  }
  return out;
}

/** GET http://127.0.0.1:<port><p> (JSON), tối đa ms. */
function getJson(port, p, ms = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: p, timeout: ms }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('JSON hỏng: ' + body.slice(0, 200))); } });
    });
    req.on('timeout', () => req.destroy(new Error('quá hạn')));
    req.on('error', reject);
  });
}

/**
 * Tạo hàm chẩn đoán. ctx: { adb(...args): string, adbRaw(cmd): Buffer|void (lệnh sh có chuyển hướng), pkg, dir, prefix,
 * parseDevtoolsSockets, extra: async () => object (trạng thái thêm, vd. trang web), webPage: () => Page|null }
 * Gọi nhiều lần được (mỗi lần một số thứ tự); trả về đường dẫn file chẩn đoán.
 */
function createDiagnose(ctx) {
  let n = 0;
  return async function diagnose(reason, step) {
    const k = ++n;
    const tag = `${ctx.prefix}-loi${k}`;
    const out = [];
    const say = (s) => { out.push(s); console.log(s); };
    const part = async (title, fn, ms = 20000) => {
      try { const v = await withTimeout(Promise.resolve().then(fn), ms, title); if (v !== undefined && v !== '') say(`[${title}]\n${v}`); }
      catch (e) { say(`[${title}] lỗi: ${String(e && e.message || e).split('\n')[0]}`); }
    };
    try { fs.mkdirSync(ctx.dir, { recursive: true }); } catch (e) { /* bỏ qua */ }
    say(`===== CHẨN ĐOÁN #${k}: ${reason}${step ? ` (bước «${step}»)` : ''} =====`);
    await part('ảnh màn hình máy ảo', () => { ctx.screencap(path.join(ctx.dir, `${tag}.png`)); return `${tag}.png`; });
    if (ctx.webPage && ctx.webPage()) {
      await part('ảnh trang web', async () => { await ctx.webPage().screenshot({ path: path.join(ctx.dir, `${tag}-web.png`) }); return `${tag}-web.png`; }, 10000);
    }
    await part('pid app', () => (ctx.adb('shell', 'pidof', ctx.pkg).trim() || 'không có tiến trình'));
    let socks = [];
    await part('socket DevTools (/proc/net/unix)', () => {
      const raw = ctx.adb('shell', 'cat', '/proc/net/unix');
      socks = ctx.parseDevtoolsSockets(raw);
      return raw.split('\n').filter((l) => /devtools/.test(l)).join('\n') || 'không có socket devtools nào';
    });
    for (const s of socks) {
      await part(`target CDP của ${s.socketName}`, async () => {
        const port = ctx.adb('forward', 'tcp:0', `localabstract:${s.socketName}`).trim();
        try {
          const ver = await getJson(port, '/json/version').catch((e) => ({ lỗi: e.message }));
          const list = await getJson(port, '/json/list');
          return JSON.stringify({ version: ver.Browser || ver, targets: list.map((t) => ({ type: t.type, url: t.url, title: t.title, attached: t.attached })) });
        } finally { try { ctx.adb('forward', '--remove', `tcp:${port}`); } catch (e) { /* bỏ qua */ } }
      }, 15000);
    }
    await part('provider app đang phụ thuộc (dumpsys activity providers)', () => {
      const deps = providerDependents(ctx.adb('shell', 'dumpsys', 'activity', 'providers'), ctx.pkg);
      return deps.length ? deps.map((d) => JSON.stringify(d)).join('\n') : 'không có kết nối provider nào từ app';
    });
    await part('activity trên cùng / focus', () => ctx.screenState());
    await part('dumpsys activity top (60 dòng đầu, đủ trong file)', () => {
      const top = ctx.adb('shell', 'dumpsys', 'activity', 'top');
      fs.writeFileSync(path.join(ctx.dir, `${tag}-activity-top.txt`), top);
      return top.split('\n').slice(0, 60).join('\n');
    });
    await part('logcat (lọc, 250 dòng cuối; đủ trong file)', () => {
      const all = ctx.adb('logcat', '-d', '-v', 'time');
      fs.writeFileSync(path.join(ctx.dir, `${tag}-logcat.txt`), all);
      const lines = all.split('\n').filter((l) => logcatFilter(ctx.pkg).test(l));
      const dead = deathLines(lines, ctx.pkg);
      return (dead.length ? 'TIẾN TRÌNH CHẾT / BỊ GIẾT:\n  ' + dead.slice(-20).join('\n  ') + '\n' : '') +
        `${lines.length} dòng liên quan:\n  ` + lines.slice(-250).join('\n  ');
    }, 40000);
    if (ctx.extra) await part('trạng thái thêm', async () => JSON.stringify(await ctx.extra()), 10000);
    const file = path.join(ctx.dir, `${tag}.txt`);
    try { fs.writeFileSync(file, out.join('\n') + '\n'); } catch (e) { console.log('Không ghi được file chẩn đoán: ' + e.message); }
    console.log(`===== HẾT CHẨN ĐOÁN #${k} (file ${file}) =====`);
    return file;
  };
}

module.exports = { createDiagnose, logcatFilter, deathLines, getJson, providerDependents };
