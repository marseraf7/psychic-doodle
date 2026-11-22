// Origin WebSocket của bản cổng game (server/src/portal-origins.js → web-net.js · wsOriginAllowed): chỉ tên miền đã biết
// của CrazyGames / itch.io (+ mẫu khai qua PORTAL_WS_ORIGINS), không bao giờ mọi Origin.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { portalOriginAllowed, parsePattern, patterns } = require('../src/portal-origins.js');
const { wsOriginAllowed } = require('../src/web-net.js');

const env0 = {};
test('mẫu có sẵn: tên miền con của game-files.crazygames.com, CDN HTML5 của itch.io', () => {
  const yes = ['https://cubes-2048-io.game-files.crazygames.com', 'https://caro-x-gomoku.game-files.crazygames.com', 'https://html.itch.zone', 'https://html-classic.itch.zone'];
  for (const o of yes) assert.strictEqual(portalOriginAllowed(o, env0), true, o);
  const no = ['https://game-files.crazygames.com', 'http://caro.game-files.crazygames.com', 'https://caro.game-files.crazygames.com.evil.example',
    'https://evilgame-files.crazygames.com', 'https://crazygames.com', 'https://evil.example', 'https://html.itch.zone.evil.example',
    'https://x.html.itch.zone', 'https://html.itch.zone/path', 'null', 'rác', '', 'https://caro.game-files.crazygames.com:8443'];
  for (const o of no) assert.strictEqual(portalOriginAllowed(o, env0), false, o);
});

test('PORTAL_WS_ORIGINS thêm mẫu (đúng origin / *.đuôi); mẫu quá rộng bị bỏ; PORTAL_WS=0 tắt mẫu có sẵn', () => {
  const env = { PORTAL_WS_ORIGINS: 'https://preview.example.org, https://*.cdn.example.net, *, https://*, https://*.com, http://127.0.0.1:8172, ftp://x.example.org' };
  assert.strictEqual(portalOriginAllowed('https://preview.example.org', env), true);
  assert.strictEqual(portalOriginAllowed('https://a.cdn.example.net', env), true);
  assert.strictEqual(portalOriginAllowed('https://a.b.cdn.example.net', env), true, 'tên miền con nhiều cấp');
  assert.strictEqual(portalOriginAllowed('https://cdn.example.net', env), false, '*.đuôi không gồm chính đuôi');
  assert.strictEqual(portalOriginAllowed('http://127.0.0.1:8172', env), true, 'có cổng');
  assert.strictEqual(portalOriginAllowed('https://evil.com', env), false, "'https://*.com' bị bỏ");
  assert.strictEqual(patterns(env).length, 3 + 3, 'chỉ nhận 3 mẫu hợp lệ thêm vào 3 mẫu có sẵn');
  assert.strictEqual(portalOriginAllowed('https://html.itch.zone', { PORTAL_WS: '0' }), false);
  assert.strictEqual(portalOriginAllowed('https://a.cdn.example.net', { PORTAL_WS: '0', PORTAL_WS_ORIGINS: 'https://*.cdn.example.net' }), true);
  assert.strictEqual(parsePattern('https://*.*.example.org'), null);
  assert.deepStrictEqual(parsePattern('HTTPS://*.Example.org/'), { scheme: 'https:', wild: true, host: 'example.org' });
});

test('wsOriginAllowed: cổng game qua, trang lạ vẫn chặn', () => {
  const saved = { a: process.env.PORTAL_WS_ORIGINS, b: process.env.PORTAL_WS };
  delete process.env.PORTAL_WS_ORIGINS; delete process.env.PORTAL_WS;
  try {
    const req = (origin) => ({ headers: { host: 'caro.example', origin }, socket: { remoteAddress: '203.0.113.5' } });
    assert.strictEqual(wsOriginAllowed(req('https://caro.game-files.crazygames.com')), true);
    assert.strictEqual(wsOriginAllowed(req('https://html.itch.zone')), true);
    assert.strictEqual(wsOriginAllowed(req('https://evil.example')), false);
  } finally {
    if (saved.a !== undefined) process.env.PORTAL_WS_ORIGINS = saved.a;
    if (saved.b !== undefined) process.env.PORTAL_WS = saved.b;
  }
});
