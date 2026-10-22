// Hồi quy H-A5 (phía máy chủ): hai file khai báo liên kết app phải được phục vụ tại
// /.well-known/ — assetlinks.json cho Android App Links và apple-app-site-association
// cho iOS Universal Links. Nội dung lấy từ biến môi trường (vân tay khoá ký Play,
// Team ID Apple); thiếu cấu hình thì không khai bừa.
// Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeHandler } = require('../src/web.js');

const handle = makeHandler({ store: {}, hub: {} });

function fakeRes() {
  return {
    status: 0, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    writeHead(s, h) { this.status = s; if (h) for (const [k, v] of Object.entries(h)) this.headers[k.toLowerCase()] = v; return this; },
    end(b) { if (b) this.body += b; },
  };
}
function get(url) {
  const res = fakeRes();
  handle({ method: 'GET', url, headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res);
  return res;
}
function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === null) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally { for (const k of Object.keys(vars)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

test('H-A5: assetlinks.json khai đúng gói Android, vân tay từ env', () => {
  withEnv({ APP_LINK_SHA256: null }, () => {
    const r = get('/.well-known/assetlinks.json');
    assert.strictEqual(r.status, 200);
    const [entry] = JSON.parse(r.body);
    assert.deepStrictEqual(entry.relation, ['delegate_permission/common.handle_all_urls']);
    assert.strictEqual(entry.target.package_name, 'io.github.marseraf7.caro');
    assert.deepStrictEqual(entry.target.sha256_cert_fingerprints, [], 'chưa cấu hình thì mảng rỗng, không khai bừa');
  });
  withEnv({ APP_LINK_SHA256: 'AA:BB:CC , DD:EE:FF' }, () => {
    const [entry] = JSON.parse(get('/.well-known/assetlinks.json').body);
    assert.deepStrictEqual(entry.target.sha256_cert_fingerprints, ['AA:BB:CC', 'DD:EE:FF'], 'nhiều vân tay cách nhau dấu phẩy, bỏ khoảng trắng thừa');
  });
});

test('H-A5: apple-app-site-association cần Team ID, có thì khai đúng appID', () => {
  withEnv({ APPLE_TEAM_ID: null }, () => {
    assert.strictEqual(get('/.well-known/apple-app-site-association').status, 404, 'chưa có Team ID thì 404, không khai appID bịa');
  });
  withEnv({ APPLE_TEAM_ID: 'TEAM123456' }, () => {
    const r = get('/.well-known/apple-app-site-association');
    assert.strictEqual(r.status, 200);
    const body = JSON.parse(r.body);
    assert.strictEqual(body.applinks.details[0].appID, 'TEAM123456.io.github.marseraf7.caro');
    assert.deepStrictEqual(body.applinks.details[0].paths, ['/', '/index.html']); // không gồm /privacy.html
  });
});
