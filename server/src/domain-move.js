/*
 * Chuyển tên miền không mất dữ liệu (docs/doi-ten-mien.md). Bật khi máy chủ đặt MOVED_TO=https://tên-miền-mới (site.js);
 * cả tên cũ lẫn tên mới cùng trỏ về máy chủ này, phân biệt theo header Host.
 * Tên miền CŨ:
 *   - Người mở trang bằng trình duyệt (GET trang, Accept: text/html, không phải máy đọc link): trang chuyển nhỏ (không phải
 *     app) nạp /migrate-out.js – gỡ service worker + bộ nhớ đệm của tên cũ, đọc các khoá caro.* trong localStorage (đăng
 *     nhập, khoá khách, cài đặt, tiến độ, ván lưu trên máy – tối đa 512 KB), gửi POST /api/migrate, rồi sang
 *     https://tên-mới/<cùng đường dẫn + tham số>&mig=<mã>.
 *   - /sw.js: service worker "nghỉ hưu" – xoá bộ nhớ đệm, tự gỡ, tải lại trang (app cũ trong bộ nhớ đệm không còn chạy).
 *   - Máy đọc link, file / ảnh / API (GET), trang nhúng: 301 sang tên mới (kèm CORS để app gọi API theo được).
 *   - Giữ nguyên, không chuyển: /healthz, /mcp (connector cũ), /.well-known/* (link sâu của app), yêu cầu không phải
 *     GET / HEAD (app cũ POST), yêu cầu có Origin của trang khác (app Android / iOS / desktop, bản GitHub Pages) – app cũ trỏ
 *     tên cũ vẫn chạy; WebSocket /ws không qua đây.
 * Tên miền MỚI: GET /api/migrate/<mã> trả dữ liệu MỘT lần rồi xoá (caro/migrate-in.js khôi phục các khoá chưa có).
 * Bảo mật: mã 128 bit ngẫu nhiên, dùng một lần, hết hạn sau 10 phút, không gắn với gì bí mật; mỗi IP tối đa 10 lần gửi /
 * 10 phút và 60 lần lấy / phút; tổng bộ nhớ ≤ 32 MB; thân ≤ 512 KB; chỉ nhận khoá caro.* là chuỗi; KHÔNG ghi log nội dung.
 */
'use strict';
const crypto = require('crypto');
const Site = require('./site.js');
const { pickLang, escHtml } = require('./og-meta.js');

const MAX_BODY = 512 * 1024;
const TTL_MS = 10 * 60 * 1000;
const MAX_TOTAL = 32 * 1024 * 1024;
const PUT_PER_IP = 10; // lần gửi / 10 phút / IP
const GET_PER_IP = 60; // lần lấy / phút / IP
const KEY_RE = /^caro\.[\w.-]{1,80}$/;
const CODE_RE = /^[A-Za-z0-9_-]{22}$/;
// Máy đọc link / máy tìm kiếm: nhận 301 thẳng (thấy ngay tên mới). Không có "zalo" / "telegram": trình duyệt trong app có chữ đó
const BOT_RE = /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|facebot|embedly|vkshare|whatsapp|preview|lighthouse/i;

const TEXT = {
  vi: ['Caro x Gomoku đã chuyển sang địa chỉ mới. Đang mang dữ liệu của bạn (đăng nhập, tiến độ, cài đặt) sang…', 'Mở {host}'],
  en: ['Caro x Gomoku has moved to a new address. Bringing your data (sign-in, progress, settings) along…', 'Open {host}'],
  ru: ['Caro x Gomoku переехал на новый адрес. Переносим ваши данные (вход, прогресс, настройки)…', 'Открыть {host}'],
  zh: ['Caro x Gomoku 已迁移到新地址。正在转移你的数据（登录、进度、设置）…', '打开 {host}'],
};

// Service worker thay cho bản cũ ở tên miền cũ: xoá bộ nhớ đệm, chiếm các tab, tải lại chúng (ra mạng → trang chuyển), tự gỡ
const RETIRE_SW = `// Tên miền đã chuyển (server/src/domain-move.js): gỡ bản app cũ khỏi máy
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.clients.claim();
  const tabs = await self.clients.matchAll({ type: 'window' });
  await Promise.allSettled(tabs.map((c) => c.navigate(c.url)));
  await self.registration.unregister();
})()));
`;

/** Làm sạch dữ liệu gửi lên: chỉ khoá caro.* có giá trị chuỗi. → { keys } hoặc null. */
function cleanPayload(obj) {
  if (!obj || typeof obj !== 'object' || !obj.keys || typeof obj.keys !== 'object' || Array.isArray(obj.keys)) return null;
  const keys = {};
  let n = 0;
  for (const [k, v] of Object.entries(obj.keys)) {
    if (!KEY_RE.test(k) || typeof v !== 'string') continue;
    keys[k] = v;
    if (++n >= 2000) break;
  }
  return n ? { v: 1, keys } : null;
}

function makeDomainMove({ clientIp, now = () => Date.now() } = {}) {
  const box = new Map(); // mã -> { buf, exp }
  let total = 0;
  const hits = new Map(); // 'p:' / 'g:' + ip -> { n, reset }

  function sweep(t) {
    for (const [code, e] of box) if (e.exp <= t) { box.delete(code); total -= e.buf.length; }
    if (hits.size > 10000) for (const [k, h] of hits) if (h.reset <= t) hits.delete(k);
  }
  function over(key, limit, windowMs, t) {
    let h = hits.get(key);
    if (!h || h.reset <= t) { h = { n: 0, reset: t + windowMs }; hits.set(key, h); }
    return ++h.n > limit ? Math.ceil((h.reset - t) / 1000) : 0;
  }
  const send = (res, status, obj, extra = {}) => {
    const body = Buffer.from(JSON.stringify(obj));
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length, 'cache-control': 'no-store', ...extra });
    res.end(body);
  };

  /** POST /api/migrate (tên cũ): cất dữ liệu, trả mã. */
  function put(req, res) {
    const t = now();
    sweep(t);
    const wait = over('p:' + clientIp(req), PUT_PER_IP, TTL_MS, t);
    if (wait) return send(res, 429, { error: 'too_many_requests' }, { 'retry-after': String(wait) });
    if (Number(req.headers['content-length']) > MAX_BODY) { send(res, 413, { error: 'too_large' }, { connection: 'close' }); return req.destroy(); }
    const parts = [];
    let size = 0, done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > MAX_BODY) { done = true; send(res, 413, { error: 'too_large' }, { connection: 'close' }); req.destroy(); return; }
      parts.push(c);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      let data = null;
      try { data = cleanPayload(JSON.parse(Buffer.concat(parts).toString('utf8'))); } catch (e) { data = null; }
      if (!data) return send(res, 400, { error: 'bad_request' });
      const buf = Buffer.from(JSON.stringify(data));
      if (total + buf.length > MAX_TOTAL) return send(res, 503, { error: 'busy' }, { 'retry-after': '60' });
      const code = crypto.randomBytes(16).toString('base64url');
      box.set(code, { buf, exp: now() + TTL_MS });
      total += buf.length;
      send(res, 200, { code });
    });
    req.on('error', () => { done = true; });
  }

  /** GET /api/migrate/<mã> (tên mới): trả một lần rồi xoá. */
  function take(code, req, res) {
    const t = now();
    sweep(t);
    const wait = over('g:' + clientIp(req), GET_PER_IP, 60000, t);
    if (wait) return send(res, 429, { error: 'too_many_requests' }, { 'retry-after': String(wait) });
    const e = CODE_RE.test(code) && box.get(code);
    if (!e) return send(res, 404, { error: 'not_found' });
    box.delete(code);
    total -= e.buf.length;
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': e.buf.length, 'cache-control': 'no-store' });
    res.end(e.buf);
  }

  /** Trang chuyển (tên cũ, người dùng mở bằng trình duyệt). */
  function handoff(req, res, u, to) {
    const L = TEXT[pickLang(u.searchParams, req.headers['accept-language'])];
    const host = new URL(to).host;
    const dest = to + u.pathname + u.search;
    const body = Buffer.from(`<!doctype html>
<html lang="${escHtml(pickLang(u.searchParams, req.headers['accept-language']))}" data-to="${escHtml(to)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <link rel="canonical" href="${escHtml(dest)}">
  <title>Caro x Gomoku</title>
  <style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;box-sizing:border-box;font:16px/1.5 system-ui,sans-serif;background:#f6f3ec;color:#262421;text-align:center}
  @media (prefers-color-scheme:dark){body{background:#161512;color:#e8e6e3}a{color:#8cb4ff}}p{max-width:32em;overflow-wrap:anywhere}</style>
</head>
<body>
  <main><p id="mv-msg">${escHtml(L[0])}</p><p><a id="mv-link" href="${escHtml(dest)}">${escHtml(L[1].replace('{host}', host))}</a></p></main>
  <script src="/migrate-out.js"></script>
</body>
</html>
`);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.length, 'cache-control': 'no-store', vary: 'accept, accept-language, user-agent' });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  /** → true nếu đã trả lời yêu cầu. url: đường dẫn đã giải mã; u: URL của yêu cầu. */
  function handle(req, res, url, u) {
    if (url.startsWith('/api/migrate/') && req.method === 'GET') { take(url.slice(13), req, res); return true; }
    const old = Site.isOldHost(req.headers.host);
    if (url === '/api/migrate' && req.method === 'POST') {
      if (!old) { send(res, 404, { error: 'not_found' }); return true; }
      put(req, res);
      return true;
    }
    if (!old) return false;
    const to = Site.movedTo();
    if (req.method !== 'GET' && req.method !== 'HEAD') return false; // app cũ gửi POST: vẫn phục vụ
    if (url === '/healthz' || url === '/mcp' || url.startsWith('/.well-known/') || url === '/migrate-out.js') return false;
    const origin = String(req.headers.origin || '');
    if (origin && origin !== 'null') { try { if (new URL(origin).host !== req.headers.host) return false; } catch (e) { return false; } } // app / trang khác gọi API
    if (url === '/sw.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : RETIRE_SW);
      return true;
    }
    const page = url === '/' || /\.html$/.test(url) || (!/\.[a-z0-9]{1,12}$/i.test(url) && !/^\/(api|b|rapfi|fonts|img)\//.test(url));
    const framed = url === '/embed.html' || url === '/broadcast.html' || u.searchParams.has('bc'); // trang nhúng được (iframe)
    // Trình duyệt mở trang (Accept: text/html) hoặc chính trang / service worker cũ của tên cũ hỏi trang (Sec-Fetch-Site:
    // same-origin – bước lưu sẵn của sw.js cũ): trang chuyển. 301 của trang không cho lưu: một lần service worker cũ nhận 301
    // thì trình duyệt không được dùng lại 301 đó cho lần mở trang sau (sẽ sang tên mới mà không kèm dữ liệu).
    const browser = /text\/html/i.test(String(req.headers.accept || '')) || req.headers['sec-fetch-site'] === 'same-origin';
    if (page && !framed && browser && !BOT_RE.test(String(req.headers['user-agent'] || ''))) {
      handoff(req, res, u, to);
      return true;
    }
    res.writeHead(301, { location: to + u.pathname + u.search, 'cache-control': page ? 'no-store' : 'public, max-age=86400', 'access-control-allow-origin': '*' });
    res.end();
    return true;
  }
  handle.size = () => box.size;
  return handle;
}

module.exports = { makeDomainMove, cleanPayload, RETIRE_SW, MAX_BODY, TTL_MS };
