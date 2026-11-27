// Mini App Telegram / VK (server/src/host-embed.js): chỉ lượt tải trang chính có dấu hiệu Mini App mới được nhúng trong
// Telegram Web / VK và nạp thư viện chính thức của Telegram; mọi lượt khác giữ nguyên CSP của trang chính.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { isHostLaunch, ancestors, hostCsp, TG_SCRIPT } = require('../src/host-embed.js');
const { Store } = require('../src/store.js');
const { makeHandler, CSP } = require('../src/web.js');

const sp = (q) => new URLSearchParams(q);

test('dấu hiệu Mini App: ?host=tg|vk, ?tgWebAppStartParam, ?vk_app_id + sign', () => {
  for (const q of ['host=tg', 'host=vk', 'tgWebAppStartParam=room-1', 'vk_app_id=1&vk_platform=desktop_web&sign=x']) assert.strictEqual(isHostLaunch(sp(q)), true, q);
  for (const q of ['', 'host=x', 'vk_app_id=1', 'sign=x', 'room=123456']) assert.strictEqual(isHostLaunch(sp(q)), false, q);
});

test('frame-ancestors: Telegram Web + VK mặc định; HOST_FRAME_ANCESTORS đổi được, mục sai dạng bị bỏ, không bao giờ *', () => {
  assert.strictEqual(ancestors({}), 'https://web.telegram.org https://vk.com https://*.vk.com https://vk.ru https://*.vk.ru');
  assert.strictEqual(ancestors({ HOST_FRAME_ANCESTORS: 'none' }), "'none'");
  assert.strictEqual(ancestors({ HOST_FRAME_ANCESTORS: 'https://web.telegram.org, * http://vk.com https://* https://*.vk.ru' }), 'https://web.telegram.org https://*.vk.ru');
  assert.strictEqual(ancestors({ HOST_FRAME_ANCESTORS: '*' }), "'none'");
  const c = hostCsp(CSP, {});
  assert.match(c, /frame-ancestors https:\/\/web\.telegram\.org https:\/\/vk\.com/);
  assert.ok(c.includes("script-src 'self' " + TG_SCRIPT + " 'wasm-unsafe-eval'"), 'chỉ thêm đúng file telegram-web-app.js');
  assert.ok(!CSP.includes('telegram'), 'CSP trang chính không đổi');
});

test('máy chủ: header Mini App chỉ cho trang chính có dấu hiệu', async () => {
  const get = (handle, url) => new Promise((done) => {
    const res = { status: 0, headers: {}, body: Buffer.alloc(0), setHeader(k, v) { this.headers[k] = v; }, removeHeader(k) { delete this.headers[k]; },
      writeHead(s, h) { this.status = s; Object.assign(this.headers, h || {}); return this; },
      end(b) { if (b) this.body = Buffer.concat([this.body, Buffer.from(b)]); done(this); }, on() { return this; }, once() { return this; }, emit() {}, write() { return true; } };
    handle({ method: 'GET', url, headers: { host: 'x' }, socket: { remoteAddress: '127.0.0.1' } }, res);
  });
  const h = makeHandler({ store: new Store(null), hub: { ogInfo: () => null }, bundle: true });
  for (const u of ['/?host=tg', '/index.html?host=vk&vk_app_id=1&sign=x', '/?vk_app_id=1&sign=x&hash=room-123456', '/?tgWebAppStartParam=replay-AbC&replay=AbC']) {
    const r = await get(h, u);
    assert.strictEqual(r.status, 200, u);
    assert.match(r.headers['content-security-policy'], /frame-ancestors https:\/\/web\.telegram\.org/, u);
    assert.ok(r.headers['content-security-policy'].includes(TG_SCRIPT), u);
    assert.strictEqual(r.headers['x-frame-options'], undefined, u + ': nhúng iframe được');
    // sign của VK nằm trong địa chỉ lượt này: các file tải kèm (CSS, script – trước khi host-detect.js kịp bỏ sign) không
    // được mang nguyên địa chỉ làm Referer (nhật ký truy cập của proxy ghi header)
    assert.strictEqual(r.headers['referrer-policy'], 'strict-origin', u);
  }
  for (const u of ['/', '/?room=123456', '/?host=x', '/api.html?host=tg', '/licenses.html?vk_app_id=1&sign=x']) {
    const r = await get(h, u);
    assert.strictEqual(r.headers['referrer-policy'], 'strict-origin-when-cross-origin', u);
    assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/, u);
    assert.ok(!r.headers['content-security-policy'].includes('telegram'), u);
    assert.strictEqual(r.headers['x-frame-options'], 'DENY', u);
  }
});

test('vendor/vk-bridge.js: đúng nguyên bản @vkontakte/vk-bridge 3.0.2 (dist/browser.min.js, bỏ dòng sourceMappingURL) + có toàn văn giấy phép MIT', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const crypto = require('node:crypto');
  const dir = path.join(__dirname, '..', '..', 'caro', 'vendor');
  const src = fs.readFileSync(path.join(dir, 'vk-bridge.js'), 'utf8');
  const body = src.slice(src.indexOf('*/\n') + 3); // bỏ khối chú thích đầu file của mình
  // Băm của bản trong gói npm (npm pack @vkontakte/vk-bridge@3.0.2). Nâng phiên bản: chép bản mới, sửa số này và dòng đầu file
  assert.strictEqual(crypto.createHash('sha256').update(body).digest('hex'), '58c7fa7fb109d1db235770c8ddcf88ec34344a58d9ed62e2fe08f56c93865606');
  const lic = fs.readFileSync(path.join(dir, 'vk-bridge-LICENSE.txt'), 'utf8');
  assert.match(lic, /MIT License[\s\S]*V Kontakte, LLC[\s\S]*Permission is hereby granted/);
});
