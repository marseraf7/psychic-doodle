// Kiểm thử service worker (caro/sw.js) bằng Cache Storage và mạng giả.
// Ngữ cảnh: M-F1 (precache "tất cả hoặc không") và M-F2 (SW lưu cả phản hồi API) trong báo
// cáo review đã được vá ở commit ef1acee (PR #88) bằng thiết kế mới: cài từng file
// (allSettled, no-cache), fetch cache-first cho file game, /api/ không bao giờ lưu.
// Bộ test này khoá hành vi đó lại để không ai vô tình quay về bản cũ:
// - cài đặt chịu được một file lỗi mà vẫn đủ file lõi;
// - /api/ không bị SW can thiệp hay lưu trữ;
// - có bản lưu thì dùng ngay cả khi mạng lỗi; chưa có thì tải và lưu (trừ URL có ?tham số);
// - mở trang kèm ?replay= khi mất mạng vẫn ra được vỏ ứng dụng (ignoreSearch).
// Trên SW trước PR #88 (addAll + lưu mọi GET + mạng trước) cả 4 bài đều đỏ.
// Chạy: node --test caro/tests/sw.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

const ORIGIN = 'https://caro.test';
const abs = (u) => new URL(u, ORIGIN + '/').toString();
const stripQ = (u) => u.split('?')[0];

function makeWorld() {
  const stores = new Map(); // tên cache -> Map(url -> response)
  const listeners = {};
  const httpErrors = new Set(), netErrors = new Set();
  async function fakeFetch(input) {
    const u = typeof input === 'string' ? abs(input) : input.url;
    const path = new URL(u).pathname;
    if (netErrors.has(path)) throw new Error('network down');
    const bad = httpErrors.has(path);
    return { ok: !bad, status: bad ? 500 : 200, url: u, body: path, clone() { return { ...this }; } };
  }
  class FakeCache {
    constructor(name) { if (!stores.has(name)) stores.set(name, new Map()); this.map = stores.get(name); }
    async put(req, res) { this.map.set(typeof req === 'string' ? abs(req) : req.url, res); }
    async match(req, opts = {}) {
      const u = typeof req === 'string' ? abs(req) : req.url;
      if (this.map.has(u)) return this.map.get(u);
      if (opts.ignoreSearch) for (const [k, v] of this.map) if (stripQ(k) === stripQ(u)) return v;
      return undefined;
    }
    async keys() { return [...this.map.keys()].map((u) => ({ url: u })); }
    async delete(req) { return this.map.delete(typeof req === 'string' ? abs(req) : req.url); }
  }
  const caches = {
    open: async (name) => new FakeCache(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (req, opts) => { for (const name of stores.keys()) { const r = await new FakeCache(name).match(req, opts); if (r) return r; } return undefined; },
  };
  class FakeRequest { constructor(u, opts = {}) { this.url = abs(u); this.method = opts.method || 'GET'; this.mode = opts.mode || 'cors'; } }
  const sandbox = { console, URL, fetch: fakeFetch, caches, Request: FakeRequest, location: { origin: ORIGIN } };
  sandbox.self = sandbox;
  sandbox.addEventListener = (name, fn) => { listeners[name] = fn; };
  sandbox.skipWaiting = async () => {};
  sandbox.clients = { claim: async () => {} };
  vm.runInNewContext(fs.readFileSync(__dirname + '/../sw.js', 'utf8'), sandbox);
  const fire = (name, event) => { let p = null; const e = { ...event, waitUntil: (q) => { p = q; }, respondWith: (q) => { p = q; } }; listeners[name](e); return p; };
  const cacheMap = async () => stores.get((await caches.keys())[0]) || new Map();
  return { fire, cacheMap, httpErrors, netErrors };
}

test('SW: một file lỗi không làm hỏng lượt cài; nhóm lõi phải đủ', async () => {
  const w = makeWorld();
  w.httpErrors.add('/img/bots/na.svg');
  await w.fire('install', {}); // phải resolve, không reject
  const map = await w.cacheMap();
  assert.ok(map.has(abs('index.html')), 'trang chính đã lưu');
  assert.ok(map.has(abs('rules.js')), 'mã lõi đã lưu');
  assert.ok(map.has(abs('img/bots/tit.svg')), 'file phụ khác vẫn lưu bình thường');
  assert.ok(!map.has(abs('img/bots/na.svg')), 'file lỗi bị bỏ qua, không kéo sập cả lượt cài');
});

test('SW: không can thiệp và không lưu phản hồi /api/', async () => {
  const w = makeWorld();
  await w.fire('install', {});
  const p = w.fire('fetch', { request: { method: 'GET', url: abs('api/replay/AbC123'), mode: 'cors' } });
  assert.strictEqual(p, null, 'SW không respondWith cho /api/ — trình duyệt tự hỏi mạng');
  const map = await w.cacheMap();
  assert.ok(![...map.keys()].some((u) => u.includes('/api/')), 'không có mục /api/ nào trong cache');
});

test('SW: có bản lưu thì dùng ngay cả khi mạng lỗi; chưa có thì tải về và lưu lại', async () => {
  const w = makeWorld();
  await w.fire('install', {});
  w.httpErrors.add('/sound.js'); w.netErrors.add('/sound.js');
  const hit = await w.fire('fetch', { request: { method: 'GET', url: abs('sound.js'), mode: 'cors' } });
  assert.ok(hit && hit.ok === true && hit.body === '/sound.js', 'đã có bản lưu: trả bản lưu, không đụng mạng');
  const fresh = await w.fire('fetch', { request: { method: 'GET', url: abs('img/bots/newbot.svg'), mode: 'cors' } });
  assert.ok(fresh && fresh.ok === true, 'chưa có: tải từ mạng');
  const map = await w.cacheMap();
  assert.ok(map.has(abs('img/bots/newbot.svg')), 'vừa tải xong đã được lưu cho lần sau');
});

test('SW: mở trang kèm ?replay= khi mất mạng vẫn có vỏ ứng dụng đã lưu', async () => {
  const w = makeWorld();
  await w.fire('install', {});
  w.netErrors.add('/');
  const res = await w.fire('fetch', { request: { method: 'GET', url: abs('?replay=AbC123'), mode: 'navigate' } });
  assert.ok(res && res.ok === true, 'điều hướng mất mạng: dùng bản index đã lưu (ignoreSearch)');
});
