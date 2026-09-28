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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
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
      'x-content-type-options': 'nosniff',
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

  wss.on('connection', (ws, req) => {
    const fwd = process.env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
    const conn = {
      ip: fwd || req.socket.remoteAddress,
      send: (obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); },
    };
    hub.connect(conn);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => hub.handle(conn, data.toString()));
    ws.on('close', () => hub.disconnect(conn));
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
