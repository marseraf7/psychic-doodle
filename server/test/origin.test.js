// Kiểm thử chính sách Origin của WebSocket (M-S1) và độ tin cậy proxy/X-Forwarded-For
// (M-S2) — hồi quy: trước đây WebSocketServer không có verifyClient (mọi Origin đều vào
// được), và fromProxy() tin mọi dải IP riêng (gồm cả bridge Docker) nên ai nối thẳng vào
// cổng công bố của container cũng giả được XFF để qua mặt giới hạn theo IP.
// Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const { wsOriginAllowed, fromProxy, clientIp } = require('../src/web.js');
const { start } = require('../server.js');

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === null) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally { for (const k of Object.keys(vars)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}
const req = (headers, ip) => ({ headers, socket: { remoteAddress: ip || '203.0.113.5' } });

test('M-S1: Origin cùng host / của app / khai thêm thì qua, Origin lạ và rác thì chặn', () => {
  withEnv({ WS_ALLOWED_ORIGINS: null, PUBLIC_URL: null }, () => {
    assert.strictEqual(wsOriginAllowed(req({ host: 'caro.example:8080' })), true, 'không Origin (không phải trình duyệt): qua');
    assert.strictEqual(wsOriginAllowed(req({ host: 'caro.example:8080', origin: 'https://caro.example:8080' })), true, 'cùng host: qua');
    assert.strictEqual(wsOriginAllowed(req({ host: 'x', origin: 'https://localhost' })), true, 'app Android (Capacitor): qua');
    assert.strictEqual(wsOriginAllowed(req({ host: 'x', origin: 'capacitor://localhost' })), true, 'app iOS (Capacitor): qua');
    assert.strictEqual(wsOriginAllowed(req({ host: 'caro.example:8080', origin: 'https://evil.example' })), false, 'trang lạ mượn trình duyệt người dùng: chặn');
    assert.strictEqual(wsOriginAllowed(req({ host: 'x', origin: 'không-phải-url' })), false, 'Origin rác: chặn');
    // #110 P3: bản tĩnh chính thức trên GitHub Pages được phép sẵn (không cần đặt WS_ALLOWED_ORIGINS trên máy chủ);
    // tên miền giống nhưng khác (tài khoản GitHub khác, http) thì vẫn chặn
    assert.strictEqual(wsOriginAllowed(req({ host: 'caroxo.duckdns.org', origin: 'https://marseraf7.github.io' })), true, 'bản GitHub Pages chính thức: qua');
    assert.strictEqual(wsOriginAllowed(req({ host: 'caroxo.duckdns.org', origin: 'https://evil.github.io' })), false, 'GitHub Pages của người khác: chặn');
    assert.strictEqual(wsOriginAllowed(req({ host: 'caroxo.duckdns.org', origin: 'http://marseraf7.github.io' })), false, 'http (không mã hoá): chặn');
  });
  withEnv({ WS_ALLOWED_ORIGINS: 'https://example.org', PUBLIC_URL: 'https://caroxo.duckdns.org' }, () => {
    assert.strictEqual(wsOriginAllowed(req({ host: 'x', origin: 'https://example.org' })), true, 'Origin khai qua env: qua');
    assert.strictEqual(wsOriginAllowed(req({ host: 'x', origin: 'https://caroxo.duckdns.org' })), true, 'Origin của PUBLIC_URL: qua');
  });
});

test('M-S2: TRUSTED_PROXY_CIDRS đặt thì chỉ các địa chỉ đó mới được coi là proxy', () => {
  withEnv({ TRUSTED_PROXY_CIDRS: null }, () => {
    assert.strictEqual(fromProxy('127.0.0.1'), true, 'mặc định tương thích cũ: loopback là proxy');
    assert.strictEqual(fromProxy('172.17.0.1'), true, 'mặc định tương thích cũ: mạng nội bộ là proxy');
    assert.strictEqual(fromProxy('8.8.8.8'), false, 'IP công cộng không bao giờ là proxy');
  });
  withEnv({ TRUSTED_PROXY_CIDRS: '10.0.0.0/8, 192.0.2.10' }, () => {
    assert.strictEqual(fromProxy('172.17.0.1'), false, 'đã cấu hình hẹp: bridge Docker không còn tự được tin');
    assert.strictEqual(fromProxy('127.0.0.1'), false, 'đã cấu hình hẹp: loopback cũng phải khai mới được tin');
    assert.strictEqual(fromProxy('10.1.2.3'), true, 'trong CIDR đã khai: được tin');
    assert.strictEqual(fromProxy('192.0.2.10'), true, 'IP đơn lẻ đã khai: được tin');
    assert.strictEqual(fromProxy('192.0.2.11'), false, 'ngoài danh sách: không tin');
  });
});

test('M-S2: clientIp bỏ qua XFF giả khi kẻ tấn công nối thẳng, vẫn lấy IP thật sau proxy đã khai', () => {
  const forged = req({ 'x-forwarded-for': '1.2.3.4' }, '172.17.0.1'); // nối thẳng qua bridge Docker, tự khai IP giả
  withEnv({ TRUST_PROXY: '1', TRUSTED_PROXY_CIDRS: '10.0.0.0/8' }, () => {
    assert.strictEqual(clientIp(forged), '172.17.0.1', 'peer không nằm trong dải proxy đã khai: XFF bị bỏ qua');
  });
  const viaProxy = req({ 'x-forwarded-for': '198.51.100.7' }, '10.0.0.9');
  withEnv({ TRUST_PROXY: '1', TRUSTED_PROXY_CIDRS: '10.0.0.0/8' }, () => {
    assert.strictEqual(clientIp(viaProxy), '198.51.100.7', 'qua proxy đã khai: vẫn lấy IP thật như trước');
  });
});

test('M-S1 (đầu cuối): máy chủ từ chối bắt tay WebSocket từ Origin lạ bằng 403', async () => {
  const app = start({ port: 0, dataFile: null });
  await new Promise((r) => app.server.on('listening', r));
  const port = app.server.address().port;
  const url = `ws://127.0.0.1:${port}/ws`;
  const attempt = (origin) => new Promise((resolve) => {
    const ws = new WebSocket(url, origin ? { headers: { Origin: origin } } : {});
    ws.on('open', () => { ws.close(); resolve('open'); });
    ws.on('error', (e) => resolve(String(e.message).includes('403') ? 'rejected-403' : 'error:' + e.message));
  });
  try {
    assert.strictEqual(await attempt('https://evil.example'), 'rejected-403', 'Origin lạ bị từ chối ngay ở bắt tay');
    assert.strictEqual(await attempt(`http://127.0.0.1:${port}`), 'open', 'Origin cùng host vẫn vào được');
    assert.strictEqual(await attempt(null), 'open', 'không Origin (kiểm thử/app) vẫn vào được');
    assert.strictEqual(await attempt('https://localhost'), 'open', 'Origin của app vẫn vào được');
  } finally {
    await app.stop();
  }
});
