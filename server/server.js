/*
 * Máy chủ Cờ Caro: phục vụ file tĩnh trong ../caro và WebSocket tại /ws.
 * Biến môi trường:
 *   PORT              cổng (mặc định 8080)
 *   DATA_DIR          thư mục lưu tài khoản (mặc định ./data)
 *   GOOGLE_CLIENT_ID  OAuth Client ID để bật "Đăng nhập bằng Google" (tuỳ chọn)
 *   TRUST_PROXY=1     lấy IP thật từ X-Forwarded-For khi chạy sau nginx/Caddy
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Store } = require('./src/store.js');
const { Hub, verifyGoogleToken } = require('./src/hub.js');

const PORT = Number(process.env.PORT) || 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATIC_DIR = path.resolve(__dirname, '..', 'caro');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

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
function clientIp(req) {
  if (process.env.TRUST_PROXY) {
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

function serveStatic(req, res) {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (url === '/healthz') { res.writeHead(200); return res.end('ok'); }
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

function start({ port = PORT, dataFile = path.join(DATA_DIR, 'db.json'), googleClientId = GOOGLE_CLIENT_ID, verifyGoogle = verifyGoogleToken, timers } = {}) {
  const store = new Store(dataFile);
  const hub = new Hub({ store, googleClientId, verifyGoogle, ...(timers ? { timers } : {}) });
  const server = http.createServer(serveStatic);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
  const perIp = new Map();

  wss.on('connection', (ws, req) => {
    const ip = clientIp(req);
    const n = (perIp.get(ip) || 0) + 1;
    if (n > MAX_CONN_PER_IP) return ws.close(1008, 'Too many connections');
    perIp.set(ip, n);
    const conn = {
      ip,
      send: (obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); },
    };
    hub.connect(conn);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    // Chống spam: token bucket cho mỗi kết nối, vượt quá thì ngắt.
    let tokens = MSG_BURST, last = Date.now();
    ws.on('message', (data) => {
      const now = Date.now();
      tokens = Math.min(MSG_BURST, tokens + ((now - last) / 1000) * MSG_RATE);
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

  server.listen(port);
  const stop = () => new Promise((resolve) => {
    clearInterval(ping);
    hub.close();
    store.flush();
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    server.close(() => resolve());
  });
  return { server, hub, store, stop };
}

if (require.main === module) {
  const app = start();
  app.server.on('listening', () => {
    console.log(`Cờ Caro đang chạy: http://localhost:${app.server.address().port}`);
    if (!GOOGLE_CLIENT_ID) console.log('(Chưa đặt GOOGLE_CLIENT_ID – nút đăng nhập Google sẽ được ẩn)');
  });
  const shutdown = () => app.stop().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { start };
