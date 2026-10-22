// Kiểm thử service worker (caro/sw.js) bằng Cache Storage và mạng giả — hồi quy:
// M-F1: precache addAll "tất cả hoặc không" — 1 file phụ lỗi làm hỏng cả lượt cài, mất
//       chế độ offline. Sau khi vá: nhóm lõi cài bằng addAll, nhóm phụ cài từng file.
// M-F2: SW lưu mọi phản hồi GET cùng nguồn (gồm /api/replay chứa tên + nước đi) và trả
//       thẳng lỗi HTTP dù bản lưu tốt còn đó. Sau khi vá: không lưu /api/, chỉ lưu file
//       tĩnh, lỗi HTTP/mạng thì dùng bản đã lưu.
// Chạy: node --test caro/tests/sw.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

const ORIGIN = 'https://caro.test';
const abs = (u) => new URL(u, ORIGIN + '/').toString();

function makeWorld({ httpErrors = new Set(), netErrors = new Set() } = {}) {
  const stores = new Map(); // tên cache -> Map(url -> response)
  const listeners = {};
  async function fakeFetch(input) {
    const u = typeof input === 'string' ? abs(input) : input.url;
    const path = new URL(u).pathname;
    if (netErrors.has(path)) throw new Error('network down');
    const bad = httpErrors.has(path);
    return { ok: !bad, status: bad ? 500 : 200, url: u, body: path, clone() { return { ...this }; } };
  }
  class FakeCache {
    constructor(name) { this.name = name; if (!stores.has(name)) stores.set(name, new Map()); this.map = stores.get(name); }
    async add(url) { const r = await fakeFetch(url); if (!r.ok) throw new Error('add failed ' + url); this.map.set(abs(url), r); }
    async addAll(urls) {
      const rs = await Promise.all(urls.map(async (u) => { const r = await fakeFetch(u); if (!r.ok) throw new Error('addAll failed ' + u); return [abs(u), r]; }));
      for (const [u, r] of rs) this.map.set(u, r); // nguyên tử: chỉ ghi khi mọi file đều ổn
    }
    async put(req, res) { this.map.set(typeof req === 'string' ? abs(req) : req.url, res); }
    async match(req) { return this.map.get(typeof req === 'string' ? abs(req) : req.url); }
    async keys() { return [...this.map.keys()].map((u) => ({ url: u })); }
    async delete(req) { return this.map.delete(typeof req === 'string' ? abs(req) : req.url); }
  }
  const caches = {
    open: async (name) => new FakeCache(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (req) => { for (const c of stores.values()) { const r = c.get(typeof req === 'string' ? abs(req) : req.url); if (r) return r; } return undefined; },
  };
  const sandbox = { console, URL, fetch: fakeFetch, caches, location: { origin: ORIGIN } };
  sandbox.self = sandbox;
  sandbox.addEventListener = (name, fn) => { listeners[name] = fn; };
  sandbox.skipWaiting = async () => {};
  sandbox.clients = { claim: async () => {} };
  vm.runInNewContext(fs.readFileSync(__dirname + '/../sw.js', 'utf8'), sandbox);
  const fire = (name, event) => { let p = null; const e = { ...event, waitUntil: (q) => { p = q; }, respondWith: (q) => { p = q; } }; listeners[name](e); return p; };
  const cacheMap = async () => stores.get((await caches.keys())[0]) || new Map();
  return { fire, cacheMap, caches, httpErrors, netErrors };
}

test('M-F1: một file phụ lỗi không làm hỏng lượt cài; nhóm lõi phải đủ', async () => {
  const w = makeWorld({ httpErrors: new Set(['/img/bots/na.svg']) });
  await w.fire('install', {}); // phải resolve, không reject
  const map = await w.cacheMap();
  assert.ok(map.has(abs('index.html')), 'trang chính (lõi) đã lưu');
  assert.ok(map.has(abs('rules.js')), 'mã lõi đã lưu');
  assert.ok(map.has(abs('img/bots/tit.svg')), 'file phụ khác vẫn lưu bình thường');
  assert.ok(!map.has(abs('img/bots/na.svg')), 'file phụ lỗi bị bỏ qua, không kéo sập cả lượt cài');
});

test('M-F2: không can thiệp và không lưu phản hồi /api/', async () => {
  const w = makeWorld();
  await w.fire('install', {});
  const req = { method: 'GET', url: abs('api/replay/AbC123'), mode: 'cors' };
  const p = w.fire('fetch', { request: req });
  assert.strictEqual(p, null, 'SW không respondWith cho /api/ — trình duyệt tự xử lý');
  const map = await w.cacheMap();
  assert.ok(![...map.keys()].some((u) => u.includes('/api/')), 'không có mục /api/ nào trong cache');
});

test('M-F2: máy chủ trả lỗi HTTP thì dùng bản đã lưu; mạng tốt thì dùng bản mới và lưu lại', async () => {
  const w = makeWorld();
  await w.fire('install', {});
  w.httpErrors.add('/rules.js'); // cài xong xuôi rồi máy chủ mới bắt đầu trả lỗi
  const bad = await w.fire('fetch', { request: { method: 'GET', url: abs('rules.js'), mode: 'cors' } });
  assert.ok(bad && bad.ok === true && bad.body === '/rules.js', 'lỗi HTTP: trả bản đã lưu thay vì trang lỗi');
  const good = await w.fire('fetch', { request: { method: 'GET', url: abs('sound.js'), mode: 'cors' } });
  assert.ok(good && good.ok === true, 'mạng tốt: trả bản từ mạng');
});

test('M-F1/M-F2: mất mạng khi mở trang vẫn có vỏ ứng dụng đã lưu', async () => {
  const w = makeWorld();
  await w.fire('install', {});
  w.netErrors.add('/'); // đã cài xong rồi mới mất mạng
  const res = await w.fire('fetch', { request: { method: 'GET', url: abs(''), mode: 'navigate' } });
  assert.ok(res && res.ok === true && res.body === '/index.html', 'điều hướng mất mạng: dùng index.html đã lưu');
});
