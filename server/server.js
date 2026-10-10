/*
 * Máy chủ Cờ Caro: phục vụ file tĩnh trong ../caro và WebSocket tại /ws.
 * Biến môi trường:
 *   PORT              cổng (mặc định 8080)
 *   DATA_DIR          thư mục lưu tài khoản (mặc định ./data)
 *   GOOGLE_CLIENT_ID  OAuth Client ID để bật "Đăng nhập bằng Google" (tuỳ chọn)
 *   HOST              địa chỉ lắng nghe (mặc định mọi địa chỉ; chạy sau Caddy/nginx trên cùng máy: 127.0.0.1)
 *   TRUST_PROXY=1     lấy IP thật từ X-Forwarded-For khi chạy sau nginx/Caddy
 *                     (chỉ tin header này khi kết nối đến từ chính máy chủ hoặc mạng nội bộ – proxy)
 *   SMTP_URL          máy chủ gửi thư để bật "Quên mật khẩu", ví dụ smtps://user:pass@smtp.gmail.com:465
 *   MAIL_FROM         địa chỉ người gửi, ví dụ "Cờ Caro <caro@example.com>" (mặc định: user trong SMTP_URL)
 *   MIN_APP_VERSION   bản app điện thoại thấp nhất còn được chơi online (ví dụ 1.0.0; bỏ trống = không kiểm tra)
 *   ANDROID_UPDATE_URL, IOS_UPDATE_URL  link cửa hàng hiện trong thông báo "cần cập nhật app"
 *   ADMIN_USERNAMES   tên đăng nhập quản trị viên, cách nhau bởi dấu phẩy (duyệt câu lạc bộ và giải đấu)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Store } = require('./src/store.js');
const { Hub, verifyGoogleToken } = require('./src/hub.js');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATIC_DIR = path.resolve(__dirname, '..', 'caro');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const SMTP_URL = process.env.SMTP_URL || '';

/** Gửi thư qua SMTP (chỉ khi có SMTP_URL). */
function smtpMailer(url, from) {
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport(url);
  const sender = from || decodeURIComponent(new URL(url).username || '');
  return (to, subject, text) => transport.sendMail({ from: sender, to, subject, text });
}

// Số kết nối cùng lúc tối đa từ 1 IP. Đặt cao vì nhà mạng di động cho nhiều thuê bao dùng chung IP.
const MAX_CONN_PER_IP = 200;
const MSG_RATE = 15; // tin nhắn/giây cho mỗi kết nối (cho phép dồn tối đa MSG_BURST)
const MSG_BURST = 40;

// Chính sách bảo mật nội dung: chỉ chạy script của chính trang (và Google khi bật đăng nhập Google).
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "img-src 'self' data: https://*.googleusercontent.com",
  "connect-src 'self' ws: wss: https://accounts.google.com/gsi/",
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
};

/** IP thật của người chơi. Sau proxy (Caddy/nginx) lấy IP cuối cùng do proxy thêm vào,
 *  vì các phần đầu của X-Forwarded-For do trình duyệt tự gửi và có thể bị giả mạo. */
/** Kết nối từ chính máy này hoặc mạng nội bộ (proxy như Caddy / nginx / Docker) – không thể giả từ Internet. */
function fromProxy(addr) {
  const a = String(addr || '').replace(/^::ffff:/, '');
  if (a === '::1' || /^127\./.test(a) || /^10\./.test(a) || /^192\.168\./.test(a)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(a)) return true;
  return /^f[cd][0-9a-f]{2}:/i.test(a); // IPv6 nội bộ fc00::/7
}

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
};

/** Ván đã lưu để xem lại qua đường link chia sẻ (không trả id tài khoản). */
function serveReplay(store, share, res) {
  const g = store.gameByShare(share);
  const body = g && JSON.stringify({
    share: g.share, created: g.created, kind: g.kind, timeLimit: g.time_limit,
    x: g.x_name, o: g.o_name, winner: g.winner, reason: g.reason, moves: g.moves, clock: g.clock || null, opening: g.opening || 'free',
  });
  res.writeHead(g ? 200 : 404, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-cache',
    'access-control-allow-origin': '*', // bản web tĩnh (CARO_SERVER) ở tên miền khác cũng đọc được
  });
  res.end(body || '{"error":"not_found"}');
}

function serveStatic(store, req, res) {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (url === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (url.startsWith('/api/replay/')) return serveReplay(store, url.slice(12), res);
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
    fs.createReadStream(file).pipe(res);
  });
}

function start({ port = PORT, host = HOST, dataFile = path.join(DATA_DIR, 'caro.db'), googleClientId = GOOGLE_CLIENT_ID, verifyGoogle = verifyGoogleToken,
  sendMail = SMTP_URL ? smtpMailer(SMTP_URL, process.env.MAIL_FROM) : null, timers, msgRate = MSG_RATE,
  minAppVersion = process.env.MIN_APP_VERSION || '', admins = (process.env.ADMIN_USERNAMES || '').split(','),
  updateUrls = { android: process.env.ANDROID_UPDATE_URL || '', ios: process.env.IOS_UPDATE_URL || '' } } = {}) {
  // dataFile = null: chỉ lưu trong bộ nhớ (test). Còn file db.json của bản cũ thì tự nhập một lần.
  const store = new Store(dataFile, dataFile ? path.join(path.dirname(dataFile), 'db.json') : null);
  const hub = new Hub({ store, googleClientId, verifyGoogle, sendMail, minAppVersion, updateUrls, admins, ...(timers ? { timers } : {}) });
  const server = http.createServer((req, res) => serveStatic(store, req, res));
  // Nén tin lớn (trang giải, danh sách…) – JSON nén còn khoảng 1/10. Tin nhỏ (nước đi) không nén cho nhanh.
  // Không giữ ngữ cảnh nén giữa các tin để mỗi kết nối không chiếm thêm bộ nhớ (hàng trăm người xem một giải).
  const wss = new WebSocketServer({
    server, path: '/ws', maxPayload: 16 * 1024,
    perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 }, serverNoContextTakeover: true, clientNoContextTakeover: true },
  });
  const perIp = new Map();

  wss.on('connection', (ws, req) => {
    const ip = clientIp(req);
    const n = (perIp.get(ip) || 0) + 1;
    if (n > MAX_CONN_PER_IP) return ws.close(1008, 'Too many connections');
    perIp.set(ip, n);
    const conn = {
      ip,
      send: (obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); },
      // Tin đã chuyển JSON sẵn (trang giải: phần chung dựng một lần cho mọi người xem)
      sendRaw: (str) => { if (ws.readyState === 1) ws.send(str); },
    };
    hub.connect(conn);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    // Chống spam: token bucket cho mỗi kết nối, vượt quá thì ngắt.
    let tokens = MSG_BURST, last = Date.now();
    ws.on('message', (data) => {
      const now = Date.now();
      tokens = Math.min(MSG_BURST, tokens + ((now - last) / 1000) * msgRate);
      last = now;
      if (--tokens < 0) return ws.close(1008, 'Too many messages');
      hub.handle(conn, data.toString());
    });
    ws.on('close', () => {
      const left = (perIp.get(ip) || 1) - 1;
      if (left > 0) perIp.set(ip, left); else perIp.delete(ip);
      hub.disconnect(conn);
    });
    ws.on('error', () => {});
  });

  // Phát hiện kết nối chết (mất mạng di động…) để cập nhật trạng thái online.
  const ping = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 25000);

  server.listen(port, host || undefined);
  const stop = () => new Promise((resolve) => {
    clearInterval(ping);
    hub.close();
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    // Đóng CSDL sau cùng: các kết nối vừa ngắt còn có thể ghi kết quả ván.
    server.close(() => { store.close(); resolve(); });
  });
  return { server, hub, store, stop };
}

if (require.main === module) {
  const app = start();
  app.server.on('listening', () => {
    console.log(`Cờ Caro đang chạy: http://localhost:${app.server.address().port}`);
    if (!GOOGLE_CLIENT_ID) console.log('(Chưa đặt GOOGLE_CLIENT_ID – nút đăng nhập Google sẽ được ẩn)');
    if (!SMTP_URL) console.log('(Chưa đặt SMTP_URL – tính năng quên mật khẩu qua email sẽ tắt)');
  });
  const shutdown = () => app.stop().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { fromProxy, start };
