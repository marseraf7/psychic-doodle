/*
 * Dùng chung cho các kịch bản kiểm thử trình duyệt (Playwright + Chromium):
 * tự bật máy chủ trên thư mục dữ liệu tạm, mở trình duyệt, tạo người chơi đã đăng ký tài khoản.
 *   node caro/tests/e2e/tour-basic.e2e.js     (CLB, Arena, loại trực tiếp)
 *   node caro/tests/e2e/tour-stages.e2e.js    (vòng bảng → playoff, xếp bảng, Thụy Sĩ → nhánh thắng – thua)
 * Mở trang: vào Trang chủ (khung 5 tab – shell.js); bàn cờ hiện khi vào ván. tab(p, id) chuyển tab.
 * Ảnh chụp màn hình lưu ở E2E_OUT (mặc định: thư mục tạm, in ra khi chạy xong). E2E_BROWSER: chromium (mặc định) | firefox | webkit.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* thử bản cài toàn cục */ }
  const root = require('child_process').execSync('npm root -g').toString().trim();
  return require(path.join(root, 'playwright'));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * Trên GitHub Actions: mỗi bước không đạt / trang sập / dừng giữa chừng in thêm một annotation (::error) – đọc nhanh qua
 * API check-runs/<id>/annotations (vài trăm token) thay vì tải cả log job (hàng chục nghìn dòng).
 */
const GH = !!process.env.GITHUB_ACTIONS;
const SCRIPT = path.basename((require.main && require.main.filename) || 'e2e');
const ghEsc = (s, prop) => {
  const t = String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  return prop ? t.replace(/:/g, '%3A').replace(/,/g, '%2C') : t;
};
let lastOk = '(chưa có)';
function annotate(msg) {
  if (GH) console.log(`::error title=${ghEsc(SCRIPT + ' · ' + (process.env.E2E_BROWSER || 'chromium') + (process.env.E2E_MOBILE ? ' · điện thoại' : ''), true)}::${ghEsc(msg)}`);
}
if (GH) {
  const fatal = (e) => {
    annotate(`dừng giữa chừng sau bước "${lastOk}": ${String((e && e.message) || e).split('\n')[0]}`);
    console.error(e);
    process.exit(1);
  };
  process.on('uncaughtException', fatal);
  process.on('unhandledRejection', fatal);
}

/**
 * Mở trang, quá hạn thì thử lại một lần: Firefox (Playwright, CI) đôi khi không xong điều hướng khi đã mở nhiều hồ sơ
 * trình duyệt – lần thử lại vẫn trong cùng hồ sơ nên vẫn kiểm đúng dữ liệu đã lưu.
 */
async function gotoRetry(p, url, opts = {}) {
  try { return await p.goto(url, opts); } catch (e) {
    if (e.name !== 'TimeoutError') throw e;
    console.log('     (mở trang quá hạn – thử lại 1 lần: ' + url + ')');
    return p.goto(url, opts);
  }
}

async function setup(port, timers = {}) {
  const { start } = require('../../../server/server.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-e2e-'));
  const app = start({ port, dataFile: path.join(dir, 'caro.db'), admins: ['boss'],
    timers: { TOUR_MIN_LEAD_MS: 0, ARENA_REST_MS: 1500, TOUR_NOSHOW_MS: 60000, ...timers } });
  await new Promise((r) => (app.server.listening ? r() : app.server.once('listening', r)));
  const out = process.env.E2E_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'caro-e2e-shots-'));
  fs.mkdirSync(out, { recursive: true });
  // E2E_BROWSER=firefox | webkit (WebKit ≈ Safari) để chạy trên trình duyệt khác; mặc định Chromium
  const kind = process.env.E2E_BROWSER || 'chromium';
  // E2E_CHANNEL=chromium: Chromium đầy đủ (chế độ headless mới) thay cho headless shell – shell chưa hỗ trợ
  // Document-Isolation-Policy nên không thử được Rapfi đa luồng (boat-rapfi.e2e.js)
  const chOpt = process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {};
  const browser = await loadPlaywright()[kind].launch(kind === 'chromium' ? { args: ['--no-sandbox'], ...chOpt } : {});
  const errors = [];
  let failed = 0;
  const ok = (c, m) => {
    console.log((c ? 'OK  ' : 'FAIL') + ' ' + m);
    if (c) lastOk = m; else { failed++; process.exitCode = 1; annotate('FAIL ' + m); }
  };
  const shot = (page, name) => page.screenshot({ path: path.join(out, name), fullPage: true });

  /** Người chơi mới: mở trang, vào Online, đăng ký tài khoản. */
  /** ctxOpts: thêm tuỳ chọn hồ sơ trình duyệt (vd. { serviceWorkers: 'block' }). */
  async function user(lang, name, width = 430, ctxOpts = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, ...ctxOpts });
    await ctx.addInitScript((l) => { localStorage.setItem('caro.lang', l); }, lang);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    p.on('crash', () => { errors.push(name + ': trang bị sập (crash)'); annotate(`${name}: trang bị sập (crash) sau bước "${lastOk}"`); });
    p.on('console', (m) => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
    p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Tên chưa phù hợp' : undefined));
    // Hộp xác nhận / hỏi chữ trong app (confirm.js) cũng tự Đồng ý như hộp gốc (hỏi chữ: giữ giá trị sẵn có); bài thử cần bấm tay (Huỷ / Đồng ý)
    // thì đặt p.autoConfirm = false
    p.autoConfirm = true;
    const poll = setInterval(() => {
      if (p.autoConfirm) p.evaluate(() => { const d = document.getElementById('confirm-dlg'); if (d && d.open) document.getElementById('confirm-ok').click(); }).catch(() => {});
    }, 100);
    poll.unref();
    p.on('close', () => clearInterval(poll));
    // Đếm số bản vá trang giải nhận được (cập nhật chỉ gửi phần đổi)
    p.patches = 0;
    p.on('websocket', (ws) => ws.on('framereceived', (f) => { if (typeof f.payload === 'string' && f.payload.startsWith('{"t":"tourPatch"')) p.patches++; }));
    await gotoRetry(p, `http://localhost:${port}/`);
    await sleep(400);
    await p.click('#tabbar [data-tab="more"]'); // thẻ tài khoản nằm ở tab Xem thêm
    await sleep(500);
    await p.click('#go-register');
    await sleep(150);
    await p.fill('#auth-form input[name=username]', name);
    await p.fill('#auth-form input[name=password]', 'caro-pass1');
    await p.click('#auth-submit');
    await sleep(700);
    p.uname = name;
    p.uid = await p.evaluate(() => window.CaroOnline.state.me.id);
    return p;
  }

  async function finish() {
    ok(!errors.length, 'không có lỗi JS' + (errors.length ? ': ' + errors.join(' | ') : ''));
    console.log(failed ? `${failed} bước KHÔNG đạt` : 'Tất cả đạt', '· ảnh chụp:', out);
    await browser.close();
    await app.stop();
  }
  return { app, browser, user, ok, shot, sleep, finish };
}

/** Phòng hiện tại của người chơi (theo client). */
const roomOf = (p) => p.evaluate(() => window.CaroOnline.state.room);

/** Người thắng xếp 5 quân ở hàng 0, người thua đánh rải rác ở hàng 5 (gửi nước như khi bấm bàn cờ). */
async function play(w, l) {
  let i = 0, j = 0;
  const first = await roomOf(w);
  if (!first) return;
  const code = first.code;
  for (let k = 0; k < 40; k++) {
    const r = await roomOf(w);
    if (!r || r.code !== code || r.winner) break;
    const wSide = r.seats.x === w.uid ? 1 : 2;
    const n = r.moves.length;
    if (r.turn === wSide) await w.evaluate(([x]) => window.CaroOnline.send({ t: 'move', x, y: 0 }), [i++]);
    else await l.evaluate(([x]) => window.CaroOnline.send({ t: 'move', x, y: 5 }), [(j++) * 3]);
    for (let q = 0; q < 60; q++) {
      const rr = await roomOf(w);
      if (!rr || rr.code !== code || rr.moves.length > n || rr.winner) break;
      await sleep(30);
    }
  }
}

module.exports = { setup, play, roomOf, sleep, gotoRetry };
