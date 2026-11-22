/*
 * Chuyển tên miền không mất dữ liệu (domain-move.js): trang chuyển / 301 ở tên cũ, mã một lần, hết hạn, giới hạn cỡ / IP,
 * làm sạch dữ liệu; caro/migrate-in.js chỉ khôi phục khoá hợp lệ chưa có.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeDomainMove, cleanPayload, MAX_BODY, TTL_MS } = require('../src/domain-move.js');

const ENV = { MOVED_TO: 'http://new.test', MOVED_FROM: 'old.test', PUBLIC_URL: 'http://new.test' };
function withEnv(fn) {
  const old = {};
  for (const k of Object.keys(ENV)) { old[k] = process.env[k]; process.env[k] = ENV[k]; }
  return Promise.resolve().then(fn).finally(() => { for (const k of Object.keys(ENV)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } });
}

async function serve(opts = {}) {
  let t = 1000000;
  const handle = makeDomainMove({ clientIp: (req) => req.headers['x-ip'] || '1.1.1.1', now: () => t, ...opts });
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!handle(req, res, decodeURIComponent(u.pathname), u)) { res.writeHead(299); res.end('app'); }
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const req = (method, p, { host = 'old.test', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { host, ...headers } }, (res) => {
      const parts = []; res.on('data', (c) => parts.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts).toString() }));
    });
    r.on('error', reject);
    r.end(body);
  });
  return { req, handle, tick: (ms) => { t += ms; }, close: () => new Promise((r) => srv.close(r)) };
}
const HTML = { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Mozilla/5.0 Chrome/130' };

test('tên cũ: người mở trang → trang chuyển (noindex, nạp migrate-out.js); máy đọc link / file / API → 301 kèm CORS', () => withEnv(async () => {
  const s = await serve();
  try {
    let r = await s.req('GET', '/?room=123456', { headers: { ...HTML, 'accept-language': 'ru' } });
    assert.strictEqual(r.status, 200);
    assert.match(r.body, /data-to="http:\/\/new\.test"/);
    assert.match(r.body, /<script src="\/migrate-out\.js"><\/script>/);
    assert.match(r.body, /noindex/);
    assert.match(r.body, /href="http:\/\/new\.test\/\?room=123456"/);
    assert.match(r.body, /Переносим/, 'chữ theo Accept-Language');
    assert.strictEqual(r.headers['cache-control'], 'no-store');
    r = await s.req('GET', '/?replay=abc', { headers: { accept: 'text/html', 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' } });
    assert.strictEqual(r.status, 301, 'máy tìm kiếm: 301');
    assert.strictEqual(r.headers.location, 'http://new.test/?replay=abc');
    r = await s.req('GET', '/', { headers: { accept: 'text/html', 'user-agent': 'facebookexternalhit/1.1' } });
    assert.strictEqual(r.status, 301, 'máy đọc link chia sẻ: 301');
    for (const p of ['/style.css', '/api/leaderboard?pool=blitz', '/b/core-1.js', '/embed.html?t=x', '/?bc=o.cup']) {
      r = await s.req('GET', p, { headers: HTML });
      assert.strictEqual(r.status, 301, p);
      assert.strictEqual(r.headers.location, 'http://new.test' + p);
      assert.strictEqual(r.headers['access-control-allow-origin'], '*');
    }
    r = await s.req('GET', '/', { headers: { accept: '*/*' } });
    assert.strictEqual(r.status, 301, 'không xin HTML: 301');
    assert.strictEqual(r.headers['cache-control'], 'no-store', '301 của trang không được lưu');
    r = await s.req('GET', '/', { headers: { accept: '*/*', 'sec-fetch-site': 'same-origin' } });
    assert.strictEqual(r.status, 200, 'service worker cũ lưu sẵn trang: nhận trang chuyển');
    r = await s.req('GET', '/sw.js');
    assert.strictEqual(r.status, 200);
    assert.match(r.body, /unregister\(\)/, 'service worker nghỉ hưu');
    assert.match(r.body, /caches\.delete/);
    // Giữ nguyên ở tên cũ: kiểm tra sống, connector, link sâu app, script trang chuyển, POST của app cũ, API gọi từ app
    for (const p of ['/healthz', '/mcp', '/.well-known/assetlinks.json', '/migrate-out.js']) assert.strictEqual((await s.req('GET', p, { headers: HTML })).status, 299, p);
    assert.strictEqual((await s.req('POST', '/api/rum', { body: '{}' })).status, 299, 'POST của app cũ');
    assert.strictEqual((await s.req('GET', '/api/replay/x', { headers: { origin: 'https://localhost' } })).status, 299, 'app Android gọi API');
    assert.strictEqual((await s.req('GET', '/api/replay/x', { headers: { origin: 'not a url' } })).status, 299);
    assert.strictEqual((await s.req('GET', '/api/x', { headers: { origin: 'http://old.test' } })).status, 301, 'cùng nguồn: vẫn 301');
    // Tên mới / máy này: không đụng tới
    assert.strictEqual((await s.req('GET', '/', { host: 'new.test', headers: HTML })).status, 299);
    assert.strictEqual((await s.req('GET', '/', { host: '127.0.0.1:8080', headers: HTML })).status, 299);
  } finally { await s.close(); }
}));

test('mã chuyển: chỉ nhận ở tên cũ, lấy được đúng một lần ở tên mới, hết hạn sau 10 phút, dữ liệu được làm sạch', () => withEnv(async () => {
  const s = await serve();
  try {
    const body = JSON.stringify({ v: 1, keys: { 'caro.token': 'tok', 'caro.guestKey': 'g'.repeat(32), evil: 'x', 'caro.n': 5, 'caro.bad key': 'x' } });
    assert.strictEqual((await s.req('POST', '/api/migrate', { host: 'new.test', body })).status, 404, 'tên mới không nhận gửi');
    let r = await s.req('POST', '/api/migrate', { body });
    assert.strictEqual(r.status, 200);
    const { code } = JSON.parse(r.body);
    assert.match(code, /^[A-Za-z0-9_-]{22}$/, '128 bit');
    assert.strictEqual(s.handle.size(), 1);
    r = await s.req('GET', '/api/migrate/' + code, { host: 'new.test' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.headers['cache-control'], 'no-store');
    assert.strictEqual(r.headers['access-control-allow-origin'], undefined, 'không mở CORS');
    assert.deepStrictEqual(JSON.parse(r.body), { v: 1, keys: { 'caro.token': 'tok', 'caro.guestKey': 'g'.repeat(32) } });
    assert.strictEqual((await s.req('GET', '/api/migrate/' + code, { host: 'new.test' })).status, 404, 'dùng một lần');
    assert.strictEqual((await s.req('GET', '/api/migrate/' + code.slice(1) + '%2F', { host: 'new.test' })).status, 404);
    // Hết hạn
    const c2 = JSON.parse((await s.req('POST', '/api/migrate', { body })).body).code;
    s.tick(TTL_MS + 1);
    assert.strictEqual((await s.req('GET', '/api/migrate/' + c2, { host: 'new.test' })).status, 404, 'hết hạn');
    assert.strictEqual(s.handle.size(), 0, 'đã dọn');
    // Dữ liệu hỏng / rỗng / quá cỡ
    assert.strictEqual((await s.req('POST', '/api/migrate', { body: '{bad' })).status, 400);
    assert.strictEqual((await s.req('POST', '/api/migrate', { body: JSON.stringify({ keys: { other: 'x' } }) })).status, 400);
    const big = JSON.stringify({ keys: { 'caro.x': 'x'.repeat(MAX_BODY) } });
    assert.strictEqual((await s.req('POST', '/api/migrate', { body: big, headers: { 'x-ip': '9.9.9.9' } })).status, 413, 'khai content-length quá cỡ');
    assert.strictEqual((await s.req('POST', '/api/migrate', { body: big, headers: { 'x-ip': '9.9.9.8', 'transfer-encoding': 'chunked' } }).catch(() => ({ status: 413 }))).status, 413, 'thân quá cỡ khi đọc');
  } finally { await s.close(); }
}));

test('mã chuyển: giới hạn 10 lần gửi / 10 phút mỗi IP, 60 lần lấy / phút; tổng bộ nhớ có trần', () => withEnv(async () => {
  const s = await serve();
  try {
    const body = JSON.stringify({ keys: { 'caro.lang': 'en' } });
    for (let i = 0; i < 10; i++) assert.strictEqual((await s.req('POST', '/api/migrate', { body })).status, 200);
    const r = await s.req('POST', '/api/migrate', { body });
    assert.strictEqual(r.status, 429);
    assert.ok(Number(r.headers['retry-after']) > 0);
    assert.strictEqual((await s.req('POST', '/api/migrate', { body, headers: { 'x-ip': '2.2.2.2' } })).status, 200, 'IP khác vẫn gửi được');
    for (let i = 0; i < 60; i++) await s.req('GET', '/api/migrate/' + 'a'.repeat(22), { host: 'new.test' });
    assert.strictEqual((await s.req('GET', '/api/migrate/' + 'a'.repeat(22), { host: 'new.test' })).status, 429);
  } finally { await s.close(); }
  const tiny = await serve();
  try {
    // Trần bộ nhớ 32 MB: gửi từ nhiều IP các gói ~500 KB tới khi đầy → 503
    const body = JSON.stringify({ keys: { 'caro.x': 'x'.repeat(500 * 1024) } });
    let st = 200, i = 0;
    while (st === 200 && i < 80) st = (await tiny.req('POST', '/api/migrate', { body, headers: { 'x-ip': '10.0.0.' + i++ } })).status;
    assert.strictEqual(st, 503);
    assert.ok(i > 60, 'đầy sau ~64 gói');
  } finally { await tiny.close(); }
}));

test('cleanPayload: chỉ khoá caro.* là chuỗi', () => {
  assert.strictEqual(cleanPayload(null), null);
  assert.strictEqual(cleanPayload({ keys: [] }), null);
  assert.strictEqual(cleanPayload({ keys: { a: 'b' } }), null);
  assert.deepStrictEqual(cleanPayload({ keys: { 'caro.a': 'b', 'caro.b': {} } }), { v: 1, keys: { 'caro.a': 'b' } });
});

test('migrate-in.js: không có ?mig thì không làm gì; restore chỉ ghi khoá hợp lệ, chưa có, bỏ ván mồ côi', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'caro', 'migrate-in.js'), 'utf8');
  const win = { location: { search: '?room=1' }, stop() { throw new Error('không được dừng'); } };
  vm.runInNewContext(src, { window: win, location: win.location });
  const R = win.CaroMigrateIn.restore;
  const store = {};
  const ls = { setItem(k, v) { if (k === 'caro.full') throw new Error('quota'); store[k] = v; } };
  const n = R({ keys: {
    'caro.token': 'old-token', 'caro.guestKey': 'k'.repeat(20), 'caro.lang': 'ru', evil: 'x', 'caro.n': 5, 'caro.inRoom': '1',
    'caro.big': 'x'.repeat(300001), 'caro.lg.g.1': '{}', 'caro.full': 'x', '__proto__': 'x',
  } }, { 'caro.lang': true, 'caro.lg.index': true }, ls);
  assert.strictEqual(n, 2);
  assert.deepStrictEqual(store, { 'caro.token': 'old-token', 'caro.guestKey': 'k'.repeat(20) }, 'không ghi đè caro.lang đã có, bỏ ván mồ côi');
  assert.strictEqual(R(null, {}, ls), 0);
  assert.strictEqual(R({ keys: ['x'] }, {}, ls), 0);
});
