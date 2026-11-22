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
const { makeDomainMove, cleanPayload, safePath, MAX_BODY, TTL_MS } = require('../src/domain-move.js');

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
const TICKET = 'T'.repeat(22); // vé (begin) của trình duyệt chủ dữ liệu
const MINE = { cookie: 'other=1; caro_mig=' + TICKET };

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
    const body = JSON.stringify({ v: 1, t: TICKET, keys: { 'caro.token': 'tok', 'caro.guestKey': 'g'.repeat(32), evil: 'x', 'caro.n': 5, 'caro.bad key': 'x' } });
    assert.strictEqual((await s.req('POST', '/api/migrate', { host: 'new.test', body })).status, 404, 'tên mới không nhận gửi');
    let r = await s.req('POST', '/api/migrate', { body });
    assert.strictEqual(r.status, 200);
    const { code } = JSON.parse(r.body);
    assert.match(code, /^[A-Za-z0-9_-]{22}$/, '128 bit');
    assert.strictEqual(s.handle.size(), 1);
    r = await s.req('GET', '/api/migrate/' + code, { host: 'new.test', headers: MINE });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.headers['cache-control'], 'no-store');
    assert.match(r.headers['set-cookie'][0], /^caro_mig=; Path=\/api\/migrate; Max-Age=0/, 'xoá cookie vé');
    assert.strictEqual(r.headers['access-control-allow-origin'], undefined, 'không mở CORS');
    assert.deepStrictEqual(JSON.parse(r.body), { v: 1, keys: { 'caro.token': 'tok', 'caro.guestKey': 'g'.repeat(32) } });
    assert.strictEqual((await s.req('GET', '/api/migrate/' + code, { host: 'new.test', headers: MINE })).status, 404, 'dùng một lần');
    assert.strictEqual((await s.req('GET', '/api/migrate/' + code.slice(1) + '%2F', { host: 'new.test' })).status, 404);
    // Hết hạn
    const c2 = JSON.parse((await s.req('POST', '/api/migrate', { body })).body).code;
    s.tick(TTL_MS + 1);
    assert.strictEqual((await s.req('GET', '/api/migrate/' + c2, { host: 'new.test', headers: MINE })).status, 404, 'hết hạn');
    assert.strictEqual(s.handle.size(), 0, 'đã dọn');
    // Dữ liệu hỏng / rỗng / quá cỡ
    assert.strictEqual((await s.req('POST', '/api/migrate', { body: '{bad' })).status, 400);
    assert.strictEqual((await s.req('POST', '/api/migrate', { body: JSON.stringify({ t: TICKET, keys: { other: 'x' } }) })).status, 400);
    assert.strictEqual((await s.req('POST', '/api/migrate', { body: JSON.stringify({ keys: { 'caro.lang': 'en' } }) })).status, 400, 'không có vé của tên mới');
    assert.strictEqual((await s.req('POST', '/api/migrate', { body: JSON.stringify({ t: 'ngắn', keys: { 'caro.lang': 'en' } }) })).status, 400, 'vé sai dạng');
    const big = JSON.stringify({ keys: { 'caro.x': 'x'.repeat(MAX_BODY) } });
    assert.strictEqual((await s.req('POST', '/api/migrate', { body: big, headers: { 'x-ip': '9.9.9.9' } })).status, 413, 'khai content-length quá cỡ');
    assert.strictEqual((await s.req('POST', '/api/migrate', { body: big, headers: { 'x-ip': '9.9.9.8', 'transfer-encoding': 'chunked' } }).catch(() => ({ status: 413 }))).status, 413, 'thân quá cỡ khi đọc');
  } finally { await s.close(); }
}));

test('mã chuyển: giới hạn 10 lần gửi / 10 phút mỗi IP, 60 lần lấy / phút; tổng bộ nhớ có trần', () => withEnv(async () => {
  const s = await serve();
  try {
    const body = JSON.stringify({ t: TICKET, keys: { 'caro.lang': 'en' } });
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
    const body = JSON.stringify({ t: TICKET, keys: { 'caro.x': 'x'.repeat(500 * 1024) } });
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

test('chống đăng nhập hộ (login CSRF): mã do người khác tạo không lấy được nếu trình duyệt không có cookie vé của chính mã đó', () => withEnv(async () => {
  const s = await serve();
  try {
    // Kẻ xấu: gửi token của mình lên tên cũ (kèm vé của chính họ) → mã → gửi link https://tên-mới/?mig=<mã> cho nạn nhân
    const r = await s.req('POST', '/api/migrate', { body: JSON.stringify({ t: 'A'.repeat(22), keys: { 'caro.token': 'attacker' } }) });
    const { code } = JSON.parse(r.body);
    let g = await s.req('GET', '/api/migrate/' + code, { host: 'new.test' });
    assert.strictEqual(g.status, 403, 'trình duyệt không có cookie vé: không nhận dữ liệu');
    g = await s.req('GET', '/api/migrate/' + code, { host: 'new.test', headers: MINE });
    assert.strictEqual(g.status, 403, 'cookie vé của lượt khác: không nhận');
    assert.strictEqual(s.handle.size(), 1, 'mã không bị xoá khi sai vé');
    g = await s.req('GET', '/api/migrate/' + code, { host: 'new.test', headers: { cookie: 'caro_mig=' + 'A'.repeat(22) } });
    assert.strictEqual(g.status, 200, 'đúng trình duyệt đã bắt đầu: nhận');
  } finally { await s.close(); }
}));

test('begin (tên mới): đặt cookie vé, 302 về đúng tên cũ đã khai kèm ?migt=; tên lạ / đường dẫn "//" không lộ vé', () => withEnv(async () => {
  const s = await serve();
  try {
    let r = await s.req('GET', '/api/migrate/begin?from=old.test&p=' + encodeURIComponent('/?u=abc&mig=zzz#x'), { host: 'new.test', headers: HTML });
    assert.strictEqual(r.status, 302);
    const loc = new URL(r.headers.location);
    assert.strictEqual(loc.origin, 'http://old.test');
    assert.strictEqual(loc.searchParams.get('u'), 'abc');
    assert.ok(!loc.searchParams.has('mig'));
    const t = loc.searchParams.get('migt');
    assert.match(t, /^[A-Za-z0-9_-]{22}$/);
    assert.strictEqual(loc.hash, '#x');
    assert.strictEqual(r.headers['set-cookie'][0], `caro_mig=${t}; Path=/api/migrate; Max-Age=900; HttpOnly; SameSite=Lax`);
    assert.strictEqual(r.headers['cache-control'], 'no-store');
    // Cổng của tên cũ giữ nguyên (bài thử e2e: 127.0.0.1:<cổng>)
    r = await s.req('GET', '/api/migrate/begin?from=old.test:8443&p=/', { host: 'new.test' });
    assert.strictEqual(new URL(r.headers.location).host, 'old.test:8443');
    // Tên máy không có trong MOVED_FROM: về thẳng tên mới, không vé, không cookie
    for (const from of ['evil.test', 'evil.test/x', 'old.test.evil.test', '', 'old.test@evil.test']) {
      r = await s.req('GET', '/api/migrate/begin?from=' + encodeURIComponent(from) + '&p=/a', { host: 'new.test' });
      assert.strictEqual(r.status, 302, from);
      assert.strictEqual(r.headers.location, 'http://new.test/a', from);
      assert.strictEqual(r.headers['set-cookie'], undefined, from);
    }
    r = await s.req('GET', '/api/migrate/begin?from=old.test&p=' + encodeURIComponent('//evil.test/x'), { host: 'new.test' });
    assert.strictEqual(new URL(r.headers.location).host, 'old.test', '"//" không đổi tên máy');
    assert.strictEqual((await s.req('GET', '/api/migrate/begin?from=old.test&p=/', { host: 'old.test' })).status, 404, 'tên cũ không có begin');
  } finally { await s.close(); }
  // Tên miền https: cookie Secure
  const keep = process.env.MOVED_TO;
  process.env.MOVED_TO = 'https://new.test';
  const s2 = await serve();
  try {
    const r = await s2.req('GET', '/api/migrate/begin?from=old.test&p=/', { host: 'new.test' });
    assert.match(r.headers['set-cookie'][0], /; Secure$/);
    assert.strictEqual(new URL(r.headers.location).protocol, 'https:');
  } finally { await s2.close(); process.env.MOVED_TO = keep; }
}));

test('safePath: luôn một "/" đầu, bỏ mig / migt, giữ tham số + #', () => {
  assert.strictEqual(safePath('/?u=a&mig=x&migt=y#h'), '/?u=a#h');
  assert.strictEqual(safePath('//evil.test/x'), '/evil.test/x');
  assert.strictEqual(safePath('/\\evil.test'), '/evil.test');
  assert.strictEqual(safePath('/a/../..//evil.test/'), '/evil.test/');
  assert.strictEqual(safePath(''), '/');
  assert.strictEqual(safePath(null), '/');
  assert.strictEqual(safePath('/a\nb'), '/');
  assert.strictEqual(safePath('/' + 'a'.repeat(5000)), '/');
});

/** Chạy caro/migrate-out.js trong vm: trang chuyển ở http://old.test<path>. → { nav (địa chỉ đã sang), posted (thân POST) } */
async function runMigrateOut(path, search, store = { 'caro.token': 'tok' }) {
  const src = fs.readFileSync(path0('caro', 'migrate-out.js'), 'utf8');
  const out = { nav: null, posted: null };
  const ls = { get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i], getItem: (k) => (k in store ? store[k] : null) };
  const loc = { pathname: path, search, hash: '', host: 'old.test', replace: (u) => { out.nav = u; } };
  const win = { localStorage: ls, TextEncoder, location: loc };
  const ctx = {
    window: win, location: loc, navigator: {}, URL, URLSearchParams, Promise, JSON, TextEncoder, setTimeout: () => 0,
    document: { documentElement: { getAttribute: () => 'http://new.test' } },
    fetch: async (u, o) => { out.posted = { url: u, body: JSON.parse(o.body) }; return { ok: true, json: async () => ({ code: 'C'.repeat(22) }) }; },
  };
  vm.runInNewContext(src, ctx);
  for (let i = 0; i < 20 && !out.nav; i++) await new Promise((r) => setImmediate(r));
  return out;
}
const path0 = (...p) => path.join(__dirname, '..', '..', ...p);

test('migrate-out.js: chưa có vé → begin ở tên mới; có vé → POST kèm vé rồi sang tên mới; đường dẫn "//tên-lạ/" không đưa mã ra ngoài', async () => {
  let r = await runMigrateOut('/', '?u=abc');
  assert.strictEqual(r.posted, null, 'chưa có vé: chưa gửi dữ liệu');
  assert.strictEqual(r.nav, 'http://new.test/api/migrate/begin?from=old.test&p=' + encodeURIComponent('/?u=abc'));
  r = await runMigrateOut('/', '?u=abc&migt=' + TICKET);
  assert.strictEqual(r.posted.body.t, TICKET);
  assert.strictEqual(r.posted.body.keys['caro.token'], 'tok');
  assert.strictEqual(r.nav, 'http://new.test/?u=abc&mig=' + 'C'.repeat(22));
  // Link https://tên-cũ//evil.test/ (trình duyệt giữ "//" trong pathname)
  r = await runMigrateOut('//evil.test/', '?migt=' + TICKET);
  assert.strictEqual(new URL(r.nav).host, 'new.test', 'mã chỉ sang tên mới: ' + r.nav);
  r = await runMigrateOut('//evil.test/', '');
  assert.ok(r.nav.startsWith('http://new.test/api/migrate/begin?'), r.nav);
  assert.strictEqual(new URL(r.nav).searchParams.get('p'), '/evil.test/');
  // Không có dữ liệu: sang thẳng tên mới
  r = await runMigrateOut('/x', '', {});
  assert.strictEqual(r.nav, 'http://new.test/x');
});
