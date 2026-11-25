/*
 * Phần trình duyệt của công cụ ảnh / video bìa (portal-media.js): phục vụ tĩnh gói cổng trên máy, mở bằng Chromium như một
 * người chơi khách, chơi thật một ván với máy bằng cách BẤM Ô trên bàn cờ, vẽ dải tiêu đề chồng lên ảnh chụp, đo byte tải
 * và thời gian tới lúc chơi được.
 * Nước của người chơi (X, đi trước) do engine của game (caro/engine.js) chọn trên Node rồi bấm đúng ô đó trên màn hình –
 * máy (nhân vật mặc định của bảng "Ván mới") trả lời như khi người thật chơi. Ảnh là màn hình game thật, không dựng giả.
 * Không có máy chủ online: gói trỏ về một cổng cục bộ đã đóng, mọi yêu cầu ra ngoài (SDK CrazyGames…) bị chặn.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const Engine = require('../../caro/engine.js');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.txt': 'text/plain',
};

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* bản cài toàn cục */ }
  for (const p of ['/opt/node-tools/node_modules/playwright', path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')]) {
    try { return require(p); } catch (e) { /* thử chỗ khác */ }
  }
  throw new Error('Không tìm thấy Playwright (cần Playwright + Chromium cài sẵn; công cụ này không tự cài)');
}

/** Máy chủ tĩnh tối giản cho thư mục gói (như CDN của cổng) → { server, base }. */
function serveDir(dir) {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(dir, u.endsWith('/') ? u + 'index.html' : u);
    if (!f.startsWith(dir) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ server: srv, base: `http://127.0.0.1:${srv.address().port}/` })));
}

/** Một cổng cục bộ chắc chắn đang đóng (mượn rồi trả lại): làm "máy chủ online" không tồn tại cho gói. */
function closedPort() {
  return new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
}

/**
 * Hồ sơ trình duyệt + trang khách tiếng Anh. Chặn mọi yêu cầu ra khỏi gói (base). Đếm byte nhận được (bytes.n).
 * opts: { width, height, scale, theme: 'dark' | 'light', look: { board, pieces } | null (kiểu bàn / quân như người chơi đã
 * chọn trong Cài đặt – boardstyle.js), video: { dir, size } | null }
 */
async function openGame(browser, base, { width, height, scale = 1, theme = 'dark', look = null, video = null } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: scale, locale: 'en-US', colorScheme: theme, serviceWorkers: 'block',
    ...(video ? { recordVideo: { dir: video.dir, size: video.size } } : {}),
  });
  if (look) await ctx.addInitScript((s) => { try { localStorage.setItem('caro.style', s); } catch (e) { /* riêng tư */ } }, JSON.stringify(look));
  await ctx.route((u) => !u.href.startsWith(base), (route) => route.abort());
  const page = await ctx.newPage();
  const t0 = Date.now(); // video bắt đầu từ lúc mở trang (xấp xỉ)
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push(e.message));
  page.bytes = { n: 0, files: 0 };
  page.on('requestfinished', async (rq) => {
    try { const s = await rq.sizes(); page.bytes.n += s.responseBodySize + s.responseHeadersSize; page.bytes.files++; } catch (e) { /* trang đã đóng */ }
  });
  return { ctx, page, t0 };
}

/** Mở trang, chờ Trang chủ sẵn sàng → giây từ lúc bắt đầu tải tới khi bấm được "Play the computer". */
async function loadHome(page, base) {
  const t = Date.now();
  await page.goto(base);
  await page.waitForFunction(() => window.CaroApp && window.CaroShell && document.querySelector('[data-home="bot"]')
    && document.querySelector('[data-home="bot"]').getClientRects().length, null, { timeout: 30000 });
  return (Date.now() - t) / 1000;
}

/**
 * Như người chơi: "Play the computer" → bảng Ván mới (mặc định: đấu máy, luật Caro Việt Nam, cầm X), chọn nhân vật máy
 * mạnh nhất đã mở khoá với khách mới (ván dài hơn, nhiều quân hơn trên ảnh) → "Play".
 */
async function startBotGame(page) {
  await page.click('[data-home="bot"]');
  await page.waitForSelector('#newgame-form button[value=start]', { state: 'visible' });
  const cards = page.locator('#newgame-form label.bot-card:not(.locked)');
  if (await cards.count()) await cards.last().click();
  await page.waitForTimeout(500); // để video thấy bảng chọn
  await page.click('#newgame-form button[value=start]');
  await page.waitForFunction(() => window.CaroApp.local.mode === 'ai' && window.CaroApp.board.moves.length === 0
    && document.getElementById('board').getClientRects().length, null, { timeout: 10000 });
  await page.waitForTimeout(300);
}

const movesOf = (page) => page.evaluate(() => window.CaroApp.board.moves.map((m) => [m.x, m.y, m.p]));

/**
 * Bấm ô (x, y) trên bàn cờ bằng chuột thật (toạ độ màn hình của ô qua CaroApp.screenOf + vị trí canvas). Ô bị thẻ người
 * chơi / thanh công cụ che hoặc nằm ngoài khung nhìn: bấm "Center" (mọi quân vào giữa) rồi tính lại; vẫn không được thì
 * dời khung nhìn tới ô đó (CaroApp.show – như con trỏ bàn phím).
 */
async function clickCell(page, x, y) {
  // Toạ độ ô khi khung nhìn đã đứng yên (bàn cờ tự dời theo nước mới của máy ~320 ms – bấm lúc đang dời sẽ trúng ô khác)
  const at = () => page.evaluate(async ([cx, cy]) => {
    const c = document.getElementById('board');
    const pos = () => { const r = c.getBoundingClientRect(), [a, b] = window.CaroApp.screenOf(cx, cy); return [r.left + a, r.top + b]; };
    let p = pos();
    for (let i = 0; i < 30; i++) {
      await new Promise((res) => setTimeout(res, 60));
      const q = pos();
      if (Math.abs(q[0] - p[0]) < 0.5 && Math.abs(q[1] - p[1]) < 0.5) break;
      p = q;
    }
    const [sx, sy] = p;
    const inside = sx > 4 && sy > 4 && sx < innerWidth - 4 && sy < innerHeight - 4;
    return { sx, sy, ok: inside && document.elementFromPoint(sx, sy) === c };
  }, [x, y]);
  let p = await at();
  if (!p.ok) { await centerBoard(page); p = await at(); }
  if (!p.ok) {
    await page.evaluate(([cx, cy]) => window.CaroApp.show(cx, cy), [x, y]);
    p = await at();
  }
  if (!p.ok) throw new Error(`Ô (${x}, ${y}) bị che hoặc ngoài khung nhìn – không bấm được`);
  await page.mouse.move(p.sx, p.sy, { steps: 6 });
  await page.mouse.click(p.sx, p.sy);
}

/**
 * Chơi tới khi có người thắng (hoặc hết maxMoves nước của người chơi). Nước của X: engine trên Node (ms mili-giây mỗi nước).
 * pace: nghỉ trước mỗi nước (ms) cho video dễ xem; before(n, r): gọi trước khi bấm nước thứ n của người chơi, r = kết quả
 * engine ({ move, mate… } – r.mate === 1: nước sắp bấm thắng ngay) – để chụp ảnh giữa ván. → { moves, winner }
 */
async function playToWin(page, { maxMoves = 40, pace = 450, ms = 250, before = null } = {}) {
  for (let n = 0; n < maxMoves; n++) {
    const st = await page.evaluate(() => ({ w: window.CaroApp.local.winner, k: window.CaroApp.board.moves.length }));
    if (st.w) break;
    const r = Engine.analyse(await movesOf(page), { rule: 'vn', ms });
    if (before) await before(n, r);
    await page.waitForTimeout(pace);
    await clickCell(page, r.move[0], r.move[1]);
    await page.waitForFunction((k) => window.CaroApp.board.moves.length > k, st.k, { timeout: 5000 })
      .catch(() => { throw new Error(`Bấm ô (${r.move}) nhưng ván không nhận nước`); });
    const got = await page.evaluate((k) => { const m = window.CaroApp.board.moves[k]; return [m.x, m.y]; }, st.k);
    if (got[0] !== r.move[0] || got[1] !== r.move[1]) throw new Error(`Bấm ô (${r.move}) nhưng ván nhận ô (${got}) – toạ độ bấm lệch`);
    // Chờ máy trả lời (hoặc hết ván)
    await page.waitForFunction((k) => window.CaroApp.local.winner || window.CaroApp.board.moves.length >= k + 2, st.k, { timeout: 30000 });
  }
  return { moves: (await movesOf(page)).length, winner: await page.evaluate(() => window.CaroApp.local.winner) };
}

/**
 * Hết ván: bấm "View board" trên bảng kết quả (như người chơi) để thấy trọn bàn cờ + đường thắng, chờ các thông báo
 * (huy hiệu mới, mở khoá nhân vật…) tự tắt (tối đa maxMs).
 */
async function showFinalBoard(page, maxMs = 9000) {
  await page.waitForTimeout(1200); // bảng kết quả hiện sau hiệu ứng quân cuối
  if (await page.isVisible('#banner-view')) await page.click('#banner-view');
  await page.waitForFunction(() => !document.querySelector('#toasts .toast'), null, { timeout: maxMs }).catch(() => {});
  await mouseAway(page);
}

/**
 * Nút "Center" của thanh công cụ (như người chơi): đưa mọi quân vào giữa khung nhìn, phóng vừa. Không dùng phím tắt C:
 * phím bật chế độ bàn phím (viền sáng quanh bàn cờ – a11y.js).
 */
async function centerBoard(page) {
  for (const sel of ['#btn-center-l', '#btn-center2', '#btn-center']) {
    if (await page.isVisible(sel)) { await page.click(sel); break; }
  }
  await page.waitForTimeout(500); // hiệu ứng dời camera ~320 ms
}

/** Chuột rời bàn cờ (không vẽ quân mờ ở ô đang trỏ) trước khi chụp: đặt lên thẻ nhân vật máy ở trên. */
async function mouseAway(page) {
  const box = await page.locator('#pl-top').boundingBox().catch(() => null);
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  else await page.mouse.move(-5, -5);
  await page.waitForTimeout(250);
}

/**
 * Dải tiêu đề vẽ chồng lên trang (lớp chữ, không đụng tới bàn cờ bên dưới): nền đặc che thanh dưới (thẻ "You" + thanh
 * công cụ, nếu có) rồi mờ dần lên trên, tên game + một dòng phụ ở giữa phần nền đặc.
 * band: { h, title, sub, pad } (px CSS – xem bandFor trong portal-media.js). band = null: gỡ dải.
 */
function overlayTitle(page, band, text) {
  return page.evaluate(([b, t]) => {
    const old = document.getElementById('pm-band');
    if (old) old.remove();
    if (!b) return;
    // Phần nền đặc: tối thiểu 75 % dải, đủ che từ mép trên thẻ người chơi dưới (#pl-bot) xuống đáy
    const pb = document.getElementById('pl-bot');
    const top = pb && pb.getClientRects().length ? pb.getBoundingClientRect().top : innerHeight;
    const solid = Math.min(innerHeight * 0.3, Math.max(b.h * 0.75, innerHeight - top + 6));
    const fade = Math.round(b.h * 0.35);
    const H = Math.round(solid + fade);
    const el = document.createElement('div');
    el.id = 'pm-band';
    el.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${H}px;z-index:2147483647;pointer-events:none;`
      + 'display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;'
      + `padding:${fade}px ${b.pad}px 0;box-sizing:border-box;color:#fff;font-family:system-ui,"Segoe UI",Roboto,sans-serif;`
      + `background:linear-gradient(to top,rgb(14,16,24) 0,rgb(14,16,24) ${Math.round(solid)}px,rgba(14,16,24,0) 100%);`
      + 'text-shadow:0 2px 8px rgba(0,0,0,.6)';
    const h = document.createElement('div');
    h.textContent = t.title;
    h.style.cssText = `font-weight:800;font-size:${b.title}px;line-height:1.1;letter-spacing:.01em;white-space:nowrap`;
    const s = document.createElement('div');
    s.textContent = t.sub;
    s.style.cssText = `font-weight:500;font-size:${b.sub}px;line-height:1.25;margin-top:${Math.round(b.sub * 0.35)}px;opacity:.92;max-width:100%`;
    el.append(h, s);
    document.body.appendChild(el);
  }, [band, text]);
}

module.exports = { loadPlaywright, serveDir, closedPort, openGame, loadHome, startBotGame, playToWin, clickCell, showFinalBoard, centerBoard, mouseAway, overlayTitle, movesOf };
