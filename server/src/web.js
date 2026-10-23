/*
 * Phần HTTP của máy chủ:
 *  - File tĩnh của trò chơi (../caro), kèm header bảo mật.
 *  - /api/replay/<mã>      : ván đã lưu (JSON) – dùng cho link xem lại.
 *  - /api/replay/<mã>.png  : ảnh xem trước bàn cờ (1200×630, giữ trong bộ nhớ 300 ảnh gần nhất; vẽ ảnh mới bị
 *    giới hạn 20 ảnh / phút mỗi IP và 10 ảnh / giây cả máy chủ để không ai làm treo máy chủ bằng cách xin ảnh liên tục).
 *  - /?replay=<mã>         : trang chính kèm thẻ og:* (tiêu đề, ảnh) để link chia sẻ hiện ảnh xem trước.
 *  - /api/avatar/<id tài khoản>?v=<phiên bản> : ảnh đại diện (đã kiểm khi tải lên – avatar.js); đúng phiên bản thì
 *    trình duyệt giữ lâu (đường dẫn đổi khi người chơi đổi ảnh).
 *  - /api/stats            : số kỳ thủ đang kết nối và số ván đang đấu (số thật – hub/lobby.js); update.sh --auto
 *    dùng để không khởi động lại máy chủ khi đang có ván.
 *  - API công khai chỉ đọc (như Lichess API): /api/player/<tên đăng nhập>, /api/leaderboard?pool=blitz
 *    – cho phép gọi từ trang khác (CORS), giữ kết quả 60 giây, mỗi IP tối đa 60 lần / phút.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { boardPng } = require('./png.js');

const STATIC_DIR = path.resolve(__dirname, '..', '..', 'caro');
const PNG_CACHE = 300;
const API_RATE = 60; // lần / phút / IP
const API_CACHE_MS = 60 * 1000;
// Vẽ ảnh mới (chưa có trong bộ nhớ) tốn ~20–30 ms CPU: mỗi IP tối đa 20 ảnh / phút, cả máy chủ tối đa 10 ảnh / giây
const PNG_PER_IP = 20;
const PNG_GLOBAL_PER_S = 10;

// Chính sách bảo mật nội dung: chỉ chạy script của chính trang (và Google khi bật đăng nhập Google).
// 'wasm-unsafe-eval': cho phép biên dịch WebAssembly (Rapfi của BOAT – caro/rapfi/), không mở eval cho JavaScript.
// connect-src thêm 2 CDN của repo mạng Rapfi (CC0): mạng ~10 MB tải khi người chơi đấu BOAT (caro/rapfi/worker.js).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "img-src 'self' data: https://*.googleusercontent.com",
  "connect-src 'self' ws: wss: https://accounts.google.com/gsi/ https://cdn.jsdelivr.net https://raw.githubusercontent.com",
  'frame-src https://accounts.google.com/gsi/',
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');
const SECURITY_HEADERS = {
  'content-security-policy': CSP,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'cross-origin-opener-policy': 'same-origin-allow-popups', // cần cho cửa sổ đăng nhập Google
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  // Chỉ có hiệu lực khi trang chạy qua HTTPS (sau Caddy / nginx): trình duyệt nhớ 180 ngày, không bị hạ xuống HTTP
  'strict-transport-security': 'max-age=15552000',
};
// Cô lập trang theo Document-Isolation-Policy (Chrome / Edge ≥ 137): có SharedArrayBuffer → BOAT chạy Rapfi đa luồng
// (caro/rapfi/worker.js). Khác COOP / COEP, không ràng buộc cửa sổ bật lên (đăng nhập Google vẫn chạy) hay iframe con;
// tài nguyên khác nguồn tải không kèm cookie (credentialless). Trình duyệt chưa hỗ trợ: bỏ qua, Rapfi chạy 1 luồng.
// RAPFI_THREADS=0: tắt.
if (process.env.RAPFI_THREADS !== '0') SECURITY_HEADERS['document-isolation-policy'] = 'isolate-and-credentialless';

/** Địa chỉ IPv4 có nằm trong CIDR (vd. 172.17.0.0/16) hay bằng đúng IP đơn lẻ không.
 *  IPv6 chỉ so khớp đúng chuỗi (đủ cho địa chỉ proxy cụ thể). */
function ipInCidr(addr, cidr) {
  const c = String(cidr || '').trim();
  if (!c) return false;
  if (!c.includes('/')) return addr === c;
  const [base, bitsStr] = c.split('/');
  const bits = Number(bitsStr);
  const v4 = (s) => { const p = String(s).split('.').map(Number); return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? p.reduce((v, n) => v * 256 + n, 0) : null; };
  const a = v4(addr), b = v4(base);
  if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

/** Kết nối đến từ proxy đáng tin không.
 *  M-S2: nếu đặt TRUSTED_PROXY_CIDRS (các CIDR/IP cách nhau dấu phẩy) thì CHỈ những địa chỉ
 *  đó được tin — trước đây mọi dải IP riêng (gồm cả dải bridge 172.16/12 của Docker) đều
 *  được tin, nên khi cổng máy chủ bị lộ ra Internet qua Docker, kẻ tấn công nối thẳng vào
 *  vẫn được coi là "proxy" và X-Forwarded-For của chúng được tin hoàn toàn.
 *  Chưa đặt biến này thì giữ hành vi cũ (máy này + mạng nội bộ) để không phá các bản
 *  cài đang chạy sau proxy thật; máy chủ sẽ in cảnh báo khi TRUST_PROXY bật ở cấu hình đó. */
function fromProxy(addr) {
  const a = String(addr || '').replace(/^::ffff:/, '');
  const configured = String(process.env.TRUSTED_PROXY_CIDRS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (configured.length) return configured.some((c) => ipInCidr(a, c));
  if (a === '::1' || /^127\./.test(a) || /^10\./.test(a) || /^192\.168\./.test(a)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(a)) return true;
  return /^f[cd][0-9a-f]{2}:/i.test(a); // IPv6 nội bộ fc00::/7
}

/** M-S1: Origin của một kết nối WebSocket có được phép không. Xác thực của game dùng
 *  token gửi trong tin hello (không dùng cookie) nên đây không phải chống trộm tài khoản,
 *  mà để một trang web lạ không mượn được trình duyệt + IP của người thăm để chơi/chat/spam
 *  bằng IP của họ (qua NAT nhà mạng có thể làm cháy hạn mức của cả một nhà mạng).
 *  Chính sách: không có Origin (app gốc / công cụ kiểm thử — không phải trình duyệt) thì cho
 *  qua; Origin cùng host với máy chủ (bản web do chính máy chủ phục vụ), Origin của app
 *  Capacitor, Origin của PUBLIC_URL, hoặc Origin khai thêm qua WS_ALLOWED_ORIGINS thì cho
 *  qua; còn lại từ chối. */
const APP_WS_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost'];
function wsOriginAllowed(req) {
  const raw = String((req.headers && req.headers.origin) || '').trim().replace(/\/+$/, '');
  if (!raw) return true;
  const extras = String(process.env.WS_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  if (APP_WS_ORIGINS.includes(raw) || extras.includes(raw)) return true;
  let o;
  try { o = new URL(raw); } catch (e) { return false; }
  if (process.env.PUBLIC_URL) { try { if (new URL(process.env.PUBLIC_URL).origin === o.origin) return true; } catch (e) { /* PUBLIC_URL sai định dạng: bỏ qua */ } }
  return o.host === String((req.headers && req.headers.host) || '');
}

/** IP thật của người chơi. Sau proxy (Caddy/nginx) lấy IP cuối cùng do proxy thêm vào,
 *  vì các phần đầu của X-Forwarded-For do trình duyệt tự gửi và có thể bị giả mạo. */
function clientIp(req) {
  // Chỉ tin X-Forwarded-For khi kết nối đến từ proxy; ai gọi thẳng vào cổng Node từ Internet thì không giả IP được
  if (process.env.TRUST_PROXY && fromProxy(req.socket.remoteAddress)) {
    const parts = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.socket.remoteAddress;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.sh': 'text/plain; charset=utf-8',
  '.patch': 'text/plain; charset=utf-8',
};

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function json(res, status, obj, extra = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', ...extra });
  res.end(JSON.stringify(obj));
}

/** Địa chỉ gốc của trang (cho đường dẫn tuyệt đối trong thẻ og). */
function origin(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const host = String(req.headers.host || '');
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return '';
  const proto = process.env.TRUST_PROXY && fromProxy(req.socket.remoteAddress) && req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return proto + '://' + host;
}

function makeHandler({ store, hub }) {
  const pngCache = new Map(); // mã -> ảnh PNG (ván đã lưu không đổi)
  const apiCache = new Map(); // đường dẫn -> { at, body }
  const apiHits = new Map(); // ip -> { n, reset }
  const pngHits = new Map(); // ip -> { n, reset }: số ảnh mới đã vẽ
  const pngGlobal = { n: 0, reset: 0 };

  /** Đếm theo cửa sổ cố định: còn lượt thì trả về 0, hết lượt trả về số giây phải chờ. */
  function hit(map, key, limit, windowMs, now) {
    let h = map.get(key);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; map.set(key, h); }
    if (map.size > 10000) for (const [k, v] of map) if (v.reset < now) map.delete(k);
    return ++h.n > limit ? Math.ceil((h.reset - now) / 1000) : 0;
  }
  let indexHtml = null; // { mtime, text }

  const APP_ID = 'io.github.marseraf7.caro';
  /** H-A5 (Android App Links): khai báo app chính thức cho tên miền này. Vân tay SHA-256 của
   *  khoá ký phát hành đặt qua env APP_LINK_SHA256 (nhiều vân tay cách nhau bằng dấu phẩy,
   *  lấy ở Play Console → App signing). Chưa đặt thì mảng rỗng: Android chưa xác minh được
   *  liên kết (app vẫn mở bằng scheme riêng), đặt xong có hiệu lực ngay, không cần sửa code. */
  function serveAssetLinks(res) {
    const prints = String(process.env.APP_LINK_SHA256 || '').split(',').map((s) => s.trim()).filter(Boolean);
    json(res, 200, [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: APP_ID, sha256_cert_fingerprints: prints } }], { 'cache-control': 'no-cache' });
  }
  /** H-A5 (iOS Universal Links): cần mã nhóm nhà phát triển (Team ID) qua env APPLE_TEAM_ID;
   *  chưa đặt thì trả 404 — không khai bừa một appID không có thật. */
  function serveAasa(res) {
    const team = String(process.env.APPLE_TEAM_ID || '').trim();
    if (!team) { res.writeHead(404); return res.end(); }
    // Chỉ trang chính (link mời / xem lại / giải đấu đều là /?…): /privacy.html vẫn mở bằng trình duyệt
    json(res, 200, { applinks: { apps: [], details: [{ appID: `${team}.${APP_ID}`, paths: ['/', '/index.html'] }] } }, { 'cache-control': 'no-cache' });
  }

  /** Ván đã lưu để xem lại qua đường link chia sẻ (không trả id tài khoản). */
  function serveReplay(share, res) {
    const g = store.gameByShare(share);
    if (!g) return json(res, 404, { error: 'not_found' }, { 'cache-control': 'no-cache' });
    json(res, 200, {
      share: g.share, created: g.created, kind: g.kind, timeLimit: g.time_limit,
      x: g.x_name, o: g.o_name, winner: g.winner, reason: g.reason, moves: g.moves, clock: g.clock || null, opening: g.opening || 'free', rule: g.rule || 'vn',
    }, { 'cache-control': 'no-cache' }); // bản web tĩnh (CARO_SERVER) ở tên miền khác cũng đọc được
  }

  function serveReplayPng(share, req, res) {
    let png = pngCache.get(share);
    if (!png) {
      const g = store.gameByShare(share);
      if (!g) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('not found'); }
      const now = Date.now();
      if (pngGlobal.reset < now) { pngGlobal.n = 0; pngGlobal.reset = now + 1000; }
      const wait = hit(pngHits, clientIp(req), PNG_PER_IP, 60000, now) || (++pngGlobal.n > PNG_GLOBAL_PER_S ? 1 : 0);
      if (wait) { res.writeHead(429, { 'retry-after': String(wait), 'content-type': 'text/plain; charset=utf-8' }); return res.end('too many requests'); }
      png = boardPng(g.moves, g.rule);
      pngCache.set(share, png);
      if (pngCache.size > PNG_CACHE) pngCache.delete(pngCache.keys().next().value);
    } else { pngCache.delete(share); pngCache.set(share, png); } // dùng gần đây: đưa về cuối
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length, 'cache-control': 'public, max-age=86400',
      'access-control-allow-origin': '*' });
    res.end(req.method === 'HEAD' ? undefined : png);
  }

  function serveAvatar(uid, query, req, res) {
    const img = hub.avatarOf(uid);
    if (!img) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache' }); return res.end('not found'); }
    const v = store.users.get(uid).avatar.v;
    res.writeHead(200, {
      'content-type': img.type, 'content-length': img.buf.length, 'access-control-allow-origin': '*',
      // Ảnh không chạy được gì, nhưng vẫn cấm mọi thứ nếu ai đó mở thẳng đường dẫn
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': query.get('v') === String(v) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : img.buf);
  }

  /** Trang chính; mở bằng link ?replay=<mã> thì thêm thẻ og để mạng xã hội hiện ảnh bàn cờ. */
  function serveIndex(req, res, share) {
    const file = path.join(STATIC_DIR, 'index.html');
    fs.stat(file, (err, st) => {
      if (err) { res.writeHead(404); return res.end(); }
      if (!indexHtml || indexHtml.mtime !== st.mtimeMs) {
        try { indexHtml = { mtime: st.mtimeMs, text: fs.readFileSync(file, 'utf8') }; } catch (e) { res.writeHead(503); return res.end(); } // đang cập nhật code (L-S4)
      }
      let html = indexHtml.text;
      const g = store.gameByShare(share);
      if (g) {
        const base = origin(req);
        const title = `${g.x_name || '?'} ✕ vs ${g.o_name || '?'} ◯ – Caro x Gomoku`;
        const result = g.winner === 1 ? `${g.x_name} thắng` : g.winner === 2 ? `${g.o_name} thắng` : 'Hoà';
        const desc = `${result} · ${g.moves.length} nước`;
        const meta = [
          ['og:type', 'website'], ['og:site_name', 'Caro x Gomoku'], ['og:title', title], ['og:description', desc],
          ['og:image', `${base}/api/replay/${g.share}.png`], ['og:image:width', '1200'], ['og:image:height', '630'],
          ['og:url', `${base}/?replay=${g.share}`],
        ].map(([k, v]) => `<meta property="${k}" content="${escHtml(v)}">`).join('\n  ');
        html = html.replace('<head>', `<head>\n  ${meta}\n  <meta name="twitter:card" content="summary_large_image">`);
      }
      const body = Buffer.from(html);
      // Chưa đặt PUBLIC_URL thì đường dẫn ảnh lấy theo tên miền trình duyệt gửi lên: không cho bộ nhớ đệm dùng chung (CDN) giữ lại
      res.writeHead(200, { 'content-type': MIME['.html'], 'content-length': body.length,
        'cache-control': process.env.PUBLIC_URL ? 'no-cache' : 'private, no-store', vary: 'host' });
      res.end(req.method === 'HEAD' ? undefined : body);
    });
  }

  /** API công khai: giới hạn theo IP, giữ kết quả 60 giây. */
  function serveApi(url, query, req, res) {
    const now = Date.now();
    const wait = hit(apiHits, clientIp(req), API_RATE, 60000, now);
    if (wait) return json(res, 429, { error: 'too_many_requests' }, { 'retry-after': String(wait) });
    const key = url + '?' + (query.get('pool') || '');
    const c = apiCache.get(key);
    if (c && now - c.at < API_CACHE_MS) return json(res, c.status, c.body, { 'cache-control': 'public, max-age=60' });
    let status = 200, body;
    if (url === '/api/leaderboard') body = hub.publicLeaderboard(query.get('pool'));
    else {
      body = hub.publicPlayer(url.slice('/api/player/'.length));
      if (!body) { status = 404; body = { error: 'not_found' }; }
    }
    apiCache.set(key, { at: now, status, body });
    if (apiCache.size > 2000) apiCache.delete(apiCache.keys().next().value);
    json(res, status, body, { 'cache-control': 'public, max-age=60' });
  }

  return function handle(req, res) {
    let u, url;
    try { u = new URL(req.url, 'http://x'); url = decodeURIComponent(u.pathname); } catch (e) { res.writeHead(400); return res.end(); }
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    if (req.method === 'OPTIONS' && url.startsWith('/api/')) {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET', 'access-control-max-age': '86400' });
      return res.end();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    if (url === '/healthz') { res.writeHead(200); return res.end('ok'); }
    if (url === '/.well-known/assetlinks.json') return serveAssetLinks(res);
    if (url === '/.well-known/apple-app-site-association') return serveAasa(res);
    if (url.startsWith('/api/replay/')) {
      const share = url.slice(12);
      return share.endsWith('.png') ? serveReplayPng(share.slice(0, -4), req, res) : serveReplay(share, res);
    }
    if (/^\/api\/avatar\/[0-9a-f]{16}$/.test(url)) return serveAvatar(url.slice(12), u.searchParams, req, res);
    if (url === '/api/stats') {
      const wait = hit(apiHits, clientIp(req), API_RATE, 60000, Date.now());
      if (wait) return json(res, 429, { error: 'too_many_requests' }, { 'retry-after': String(wait) });
      const c = hub.counts();
      return json(res, 200, { players: c.players, games: c.games }, { 'cache-control': 'no-cache' });
    }
    if (url === '/api/leaderboard' || /^\/api\/player\/[a-z0-9_.]{3,20}$/i.test(url)) return serveApi(url, u.searchParams, req, res);
    if (url.startsWith('/api/')) return json(res, 404, { error: 'not_found' });
    if ((url === '/' || url === '/index.html') && u.searchParams.get('replay')) return serveIndex(req, res, u.searchParams.get('replay'));
    if (url.endsWith('/')) url += 'index.html';
    const file = path.resolve(STATIC_DIR, '.' + url);
    if (!file.startsWith(STATIC_DIR + path.sep) || url.includes('/tests/')) { res.writeHead(404); return res.end(); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Không tìm thấy'); }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream',
        'content-length': st.size,
        'cache-control': 'no-cache',
      });
      if (req.method === 'HEAD') return res.end();
      // File bị thay / xoá giữa chừng (update.sh đang cập nhật code): đóng kết nối, không để lỗi luồng làm sập tiến trình (L-S4)
      fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    });
  };
}

module.exports = { makeHandler, clientIp, fromProxy, wsOriginAllowed, ipInCidr, CSP, SECURITY_HEADERS };
