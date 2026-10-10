/*
 * Dùng chung cho các kịch bản kiểm thử trình duyệt (Playwright + Chromium):
 * tự bật máy chủ trên thư mục dữ liệu tạm, mở trình duyệt, tạo người chơi đã đăng ký tài khoản.
 *   node caro/tests/e2e/tour-basic.e2e.js     (CLB, Arena, loại trực tiếp)
 *   node caro/tests/e2e/tour-stages.e2e.js    (vòng bảng → playoff, xếp bảng, Thụy Sĩ → nhánh thắng – thua)
 * Ảnh chụp màn hình lưu ở E2E_OUT (mặc định: thư mục tạm, in ra khi chạy xong).
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

async function setup(port) {
  const { start } = require('../../../server/server.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-e2e-'));
  const app = start({ port, dataFile: path.join(dir, 'caro.db'), admins: ['boss'],
    timers: { TOUR_MIN_LEAD_MS: 0, ARENA_REST_MS: 1500, TOUR_NOSHOW_MS: 60000 } });
  await new Promise((r) => (app.server.listening ? r() : app.server.once('listening', r)));
  const out = process.env.E2E_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'caro-e2e-shots-'));
  fs.mkdirSync(out, { recursive: true });
  const browser = await loadPlaywright().chromium.launch({ args: ['--no-sandbox'] });
  const errors = [];
  let failed = 0;
  const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) { failed++; process.exitCode = 1; } };
  const shot = (page, name) => page.screenshot({ path: path.join(out, name), fullPage: true });

  /** Người chơi mới: mở trang, vào Online, đăng ký tài khoản. */
  async function user(lang, name, width = 430) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.addInitScript((l) => { localStorage.setItem('caro.lang', l); }, lang);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
    p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Tên chưa phù hợp' : undefined));
    // Đếm số bản vá trang giải nhận được (cập nhật chỉ gửi phần đổi)
    p.patches = 0;
    p.on('websocket', (ws) => ws.on('framereceived', (f) => { if (typeof f.payload === 'string' && f.payload.startsWith('{"t":"tourPatch"')) p.patches++; }));
    await p.goto(`http://localhost:${port}/`);
    await sleep(400);
    await p.click('#btn-online');
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

module.exports = { setup, play, roomOf, sleep };
