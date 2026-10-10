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
 *   PUBLIC_URL        địa chỉ công khai của trang (vd. https://caro.example.com) – dùng cho ảnh xem trước link chia sẻ
 * Phần HTTP (file tĩnh, ảnh xem trước, API công khai): src/web.js
 */
'use strict';
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Store } = require('./src/store.js');
const { Hub, verifyGoogleToken } = require('./src/hub.js');
const { makeHandler, clientIp, fromProxy } = require('./src/web.js');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
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
const MAX_BUFFERED = 2 * 1024 * 1024; // byte chờ gửi tối đa của 1 kết nối

function start({ port = PORT, host = HOST, dataFile = path.join(DATA_DIR, 'caro.db'), googleClientId = GOOGLE_CLIENT_ID, verifyGoogle = verifyGoogleToken,
  sendMail = SMTP_URL ? smtpMailer(SMTP_URL, process.env.MAIL_FROM) : null, timers, msgRate = MSG_RATE,
  minAppVersion = process.env.MIN_APP_VERSION || '', admins = (process.env.ADMIN_USERNAMES || '').split(','),
  updateUrls = { android: process.env.ANDROID_UPDATE_URL || '', ios: process.env.IOS_UPDATE_URL || '' } } = {}) {
  // dataFile = null: chỉ lưu trong bộ nhớ (test). Còn file db.json của bản cũ thì tự nhập một lần.
  const store = new Store(dataFile, dataFile ? path.join(path.dirname(dataFile), 'db.json') : null);
  const hub = new Hub({ store, googleClientId, verifyGoogle, sendMail, minAppVersion, updateUrls, admins, ...(timers ? { timers } : {}) });
  const server = http.createServer(makeHandler({ store, hub }));
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
    // Kết nối không đọc kịp (mạng quá chậm / cố tình không đọc) làm dữ liệu dồn trong RAM máy chủ: quá ngưỡng thì ngắt
    const sendRaw = (str) => {
      if (ws.readyState !== 1) return;
      if (ws.bufferedAmount > MAX_BUFFERED) { ws.terminate(); return; }
      ws.send(str);
    };
    const conn = {
      ip,
      send: (obj) => sendRaw(JSON.stringify(obj)),
      // Tin đã chuyển JSON sẵn (trang giải, người xem ván: phần chung dựng một lần cho mọi người)
      sendRaw,
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
