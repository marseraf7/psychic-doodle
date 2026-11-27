/*
 * Chuyển tên miền không mất dữ liệu (docs/doi-ten-mien.md). Bật khi máy chủ đặt MOVED_TO=https://tên-miền-mới (site.js);
 * cả tên cũ lẫn tên mới cùng trỏ về máy chủ này, phân biệt theo header Host.
 * Tên miền CŨ:
 *   - Người mở trang bằng trình duyệt (GET trang, Accept: text/html, không phải máy đọc link): trang chuyển nhỏ (không phải
 *     app) nạp /migrate-out.js – gỡ service worker + bộ nhớ đệm của tên cũ, lấy vé ở tên mới (begin – xem "Chống đăng nhập
 *     hộ" dưới đây), đọc các khoá caro.* trong localStorage (đăng nhập, khoá khách, cài đặt, tiến độ, ván lưu trên máy –
 *     tối đa 512 KB), gửi POST /api/migrate kèm vé, rồi sang https://tên-mới/<cùng đường dẫn + tham số>&mig=<mã>.
 *   - /sw.js: service worker "nghỉ hưu" – xoá bộ nhớ đệm, tự gỡ, tải lại trang (app cũ trong bộ nhớ đệm không còn chạy).
 *   - Máy đọc link, file / ảnh / API (GET), trang nhúng: 301 sang tên mới (kèm CORS để app gọi API theo được).
 *   - Giữ nguyên, không chuyển: /healthz, /mcp (connector cũ), /.well-known/* (link sâu của app), yêu cầu không phải
 *     GET / HEAD (app cũ POST), yêu cầu có Origin của trang khác (app Android / iOS / desktop, bản GitHub Pages) – app cũ trỏ
 *     tên cũ vẫn chạy; WebSocket /ws không qua đây.
 * Tên miền MỚI: GET /api/migrate/<mã> trả dữ liệu MỘT lần rồi xoá (caro/migrate-in.js khôi phục các khoá chưa có).
 * Chống "đăng nhập hộ" (login CSRF – rà soát 22/11): ai cũng gửi được dữ liệu của mình lên tên cũ để lấy mã, rồi gửi link
 * https://tên-mới/?mig=<mã> cho người khác → máy người đó nhận token / khoá khách của kẻ gửi. Vì vậy mã gắn với MỘT trình
 * duyệt: bước đầu luôn đi qua tên MỚI –
 *   1. trang chuyển (tên cũ) → GET https://tên-mới/api/migrate/begin?from=<tên cũ>&p=<đường dẫn>: máy chủ tạo vé 128 bit,
 *      đặt cookie caro_mig_<8 ký tự đầu>=<vé> (HttpOnly, SameSite=Lax, chỉ đường /api/migrate, 15 phút) ở tên MỚI, rồi 302 về đúng tên
 *      cũ đã khai ở MOVED_FROM (không phải tên lạ – không lộ vé) kèm ?migt=<vé>;
 *   2. trang chuyển đọc vé, gửi POST /api/migrate { t: vé, keys } → mã → sang tên mới ?mig=<mã>;
 *   3. GET /api/migrate/<mã> chỉ trả khi cookie vé của trình duyệt đúng vé đã gắn với mã (sai / thiếu: 403, mã vẫn
 *      giữ cho chủ thật) và xoá cookie. Kẻ gửi link không đặt được cookie ở máy người khác, cũng không đọc được vé của họ.
 * Bảo mật khác: mã 128 bit ngẫu nhiên, dùng một lần, hết hạn sau 10 phút; mỗi IP tối đa 10 lần gửi / 10 phút và 60 lần
 * lấy / phút; tổng bộ nhớ ≤ 32 MB; thân ≤ 512 KB; chỉ nhận khoá caro.* là chuỗi; KHÔNG ghi log nội dung. Đường dẫn mang
 * theo luôn giữ trên tên miền của game ("//tên-lạ/" không thành link sang trang khác).
 */
'use strict';
const crypto = require('crypto');
const Site = require('./site.js');
const { pickLang, escHtml } = require('./og-meta.js');
const Langs = require('./langs.js');

const MAX_BODY = 512 * 1024;
const TTL_MS = 10 * 60 * 1000;
const MAX_TOTAL = 32 * 1024 * 1024;
const PUT_PER_IP = 120; // lần gửi / 10 phút / IP – nhiều máy chung IP (CGNAT nhà mạng di động, trường học) cùng chuyển trong ngày đổi tên miền (rà soát 27/11/2026); bộ nhớ đã có trần MAX_TOTAL
const GET_PER_IP = 60; // lần lấy / phút / IP
const KEY_RE = /^caro\.[\w.-]{1,80}$/;
const CODE_RE = /^[A-Za-z0-9_-]{22}$/; // mã và vé: 128 bit base64url
const COOKIE = 'caro_mig';
// Mỗi lượt một cookie riêng (caro_mig_<8 ký tự đầu của vé>=<vé>): nhiều tab của tên cũ cùng chuyển (service worker nghỉ
// hưu tải lại mọi tab) không ghi đè vé của nhau – không thì tab chậm bị 403, app ở tên mới tạo khoá khách mới trước khi
// tab kia mang khoá khách cũ tới (khoá đã có thì không ghi đè → mất danh tính khách)
const cookieName = (ticket) => COOKIE + '_' + ticket.slice(0, 8);
const COOKIE_S = 15 * 60; // vé sống 15 phút (đủ cho trang chuyển + mã 10 phút)
const FROM_RE = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]{1,253})(:\d{1,5})?$/i;
// Máy đọc link / máy tìm kiếm: nhận 301 thẳng (thấy ngay tên mới). Không có "zalo" / "telegram": trình duyệt trong app có chữ đó
const BOT_RE = /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|facebot|embedly|vkshare|whatsapp|preview|lighthouse/i;

// ja, ko, cs, zh-Hant: mục move trong server/src/i18n/<mã>.js (thiếu thì tiếng Anh)
const TEXT = Langs.withDirLangs('move', {
  vi: ['Caro x Gomoku đã chuyển sang địa chỉ mới. Đang mang dữ liệu của bạn (đăng nhập, tiến độ, cài đặt) sang…', 'Mở {host}'],
  en: ['Caro x Gomoku has moved to a new address. Bringing your data (sign-in, progress, settings) along…', 'Open {host}'],
  ru: ['Caro x Gomoku переехал на новый адрес. Переносим ваши данные (вход, прогресс, настройки)…', 'Открыть {host}'],
  zh: ['Caro x Gomoku 已迁移到新地址。正在转移你的数据（登录、进度、设置）…', '打开 {host}'],
});

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

/** Đường dẫn + tham số + # mang theo khi chuyển, luôn nằm trên tên miền của game: bắt đầu bằng đúng một '/' ('//tên-lạ/'
 *  hay '/\\tên-lạ' thành '/tên-lạ/'), bỏ mig / migt, tối đa 4000 ký tự; sai → '/'. */
function safePath(p) {
  p = String(p || '');
  if (p.length > 4000 || /[\x00-\x1f\x7f]/.test(p)) return '/';
  try {
    const u = new URL('/' + p.replace(/^[/\\]+/, ''), 'http://x');
    if (u.origin !== 'http://x') return '/';
    u.searchParams.delete('mig');
    u.searchParams.delete('migt');
    return u.pathname.replace(/^\/+/, '/') + u.search + u.hash;
  } catch (e) { return '/'; }
}
/** Giá trị cookie name trong header Cookie, hoặc ''. */
function cookieOf(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}
const clearCookie = (ticket) => `${cookieName(ticket)}=; Path=/api/migrate; Max-Age=0; HttpOnly; SameSite=Lax`;

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
      let data = null, ticket = '';
      try {
        const obj = JSON.parse(Buffer.concat(parts).toString('utf8'));
        ticket = obj && typeof obj.t === 'string' && CODE_RE.test(obj.t) ? obj.t : '';
        data = cleanPayload(obj);
      } catch (e) { data = null; }
      if (!data || !ticket) return send(res, 400, { error: 'bad_request' }); // không có vé của tên mới: không nhận
      const buf = Buffer.from(JSON.stringify(data));
      if (total + buf.length > MAX_TOTAL) return send(res, 503, { error: 'busy' }, { 'retry-after': '60' });
      const code = crypto.randomBytes(16).toString('base64url');
      box.set(code, { buf, ticket, exp: now() + TTL_MS });
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
    // Mã chỉ cho đúng trình duyệt đã đi bước begin (cookie vé). Sai / thiếu: không xoá mã (người khác cầm được mã – vd. từ
    // lịch sử trình duyệt – không làm hỏng lượt chuyển của chủ thật), mã vẫn hết hạn sau 10 phút
    const have = Buffer.from(cookieOf(req, cookieName(e.ticket))), want = Buffer.from(e.ticket);
    if (have.length !== want.length || !crypto.timingSafeEqual(have, want)) return send(res, 403, { error: 'wrong_browser' });
    box.delete(code);
    total -= e.buf.length;
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': e.buf.length, 'cache-control': 'no-store',
      'set-cookie': clearCookie(e.ticket) });
    res.end(e.buf);
  }

  /** GET /api/migrate/begin?from=<tên cũ>&p=<đường dẫn> (tên mới): đặt cookie vé rồi 302 về tên cũ kèm ?migt=<vé>. */
  function begin(req, res, u, to) {
    const p = safePath(u.searchParams.get('p'));
    const from = String(u.searchParams.get('from') || '');
    const old = FROM_RE.test(from) ? Site.hostName(from) : '';
    // Chỉ tên cũ đã khai (MOVED_FROM) – không bao giờ gửi vé tới tên máy do link tự đặt
    if (!old || !Site.movedFrom().includes(old)) {
      res.writeHead(302, { location: to + p, 'cache-control': 'no-store' });
      return res.end();
    }
    const ticket = crypto.randomBytes(16).toString('base64url');
    const back = new URL(new URL(to).protocol + '//' + from + p);
    back.searchParams.delete('mig');
    back.searchParams.set('migt', ticket);
    const secure = to.startsWith('https:') ? '; Secure' : '';
    res.writeHead(302, { location: back.href, 'cache-control': 'no-store',
      'set-cookie': `${cookieName(ticket)}=${ticket}; Path=/api/migrate; Max-Age=${COOKIE_S}; HttpOnly; SameSite=Lax${secure}` });
    res.end();
  }

  /** Trang chuyển (tên cũ, người dùng mở bằng trình duyệt). */
  function handoff(req, res, u, to) {
    const lang = pickLang(u.searchParams, req.headers['accept-language']);
    const L = Langs.pick(TEXT, lang);
    const host = new URL(to).host;
    const dest = to + safePath(u.pathname + u.search);
    const body = Buffer.from(`<!doctype html>
<html lang="${escHtml(Langs.BY[lang].html)}" data-to="${escHtml(to)}">
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
    const old = Site.isOldHost(req.headers.host);
    if (url === '/api/migrate/begin' && req.method === 'GET') {
      const to = Site.movedTo();
      if (old || !to) send(res, 404, { error: 'not_found' });
      else begin(req, res, u, to);
      return true;
    }
    if (url.startsWith('/api/migrate/') && req.method === 'GET') { take(url.slice(13), req, res); return true; }
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

module.exports = { makeDomainMove, cleanPayload, safePath, RETIRE_SW, MAX_BODY, TTL_MS };
