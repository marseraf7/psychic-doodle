/*
 * File tĩnh (src/static-file.js qua web.js): có ETag + Last-Modified, hỏi lại với If-None-Match / If-Modified-Since mà file
 * chưa đổi thì 304 không thân – CSS không phải tải lại đủ byte mỗi lần mở trang (rà soát 20/11/2026). Cả khi bật / tắt bản gộp.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Store } = require('../src/store.js');
const { makeHandler } = require('../src/web.js');
const { etagOf, fresh } = require('../src/static-file.js');

const CSS = path.resolve(__dirname, '..', '..', 'caro', 'shell.css');

function serve(bundle) {
  const store = new Store(null);
  const srv = http.createServer(makeHandler({ store, hub: {}, bundle }));
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ port: srv.address().port, close: () => { srv.close(); store.close(); } })));
}
const get = (port, url, headers = {}, method = 'GET') => new Promise((done, fail) => {
  const rq = http.request({ host: '127.0.0.1', port, path: url, method, headers }, (res) => {
    const parts = [];
    res.on('data', (c) => parts.push(c));
    res.on('end', () => done({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }));
  });
  rq.on('error', fail);
  rq.end();
});

for (const bundle of [true, false]) {
  test(`CSS có ETag / Last-Modified, hỏi lại thì 304 (bản gộp ${bundle ? 'bật' : 'tắt'})`, async () => {
    const s = await serve(bundle);
    try {
      const a = await get(s.port, '/shell.css');
      assert.strictEqual(a.status, 200);
      assert.strictEqual(a.body.toString(), fs.readFileSync(CSS, 'utf8'));
      assert.match(a.headers.etag, /^W\/"[0-9a-f]+-[0-9a-f]+"$/);
      assert.ok(a.headers['last-modified']);
      assert.strictEqual(a.headers['cache-control'], 'no-cache', 'vẫn hỏi lại máy chủ mỗi lần (bản mới tới ngay)');
      assert.match(a.headers['content-type'], /text\/css/);

      const b = await get(s.port, '/shell.css', { 'if-none-match': a.headers.etag });
      assert.strictEqual(b.status, 304);
      assert.strictEqual(b.body.length, 0, '304 không có thân');
      assert.strictEqual(b.headers.etag, a.headers.etag);

      // nhiều ETag, ETag mạnh cùng giá trị (so sánh yếu) → vẫn 304
      assert.strictEqual((await get(s.port, '/shell.css', { 'if-none-match': `"x", ${a.headers.etag.slice(2)}` })).status, 304);
      // ETag khác (file đã đổi) → 200 đủ thân
      const c = await get(s.port, '/shell.css', { 'if-none-match': 'W/"0-0"' });
      assert.strictEqual(c.status, 200);
      assert.ok(c.body.length > 0);
      // If-Modified-Since
      assert.strictEqual((await get(s.port, '/shell.css', { 'if-modified-since': a.headers['last-modified'] })).status, 304);
      assert.strictEqual((await get(s.port, '/shell.css', { 'if-modified-since': 'Thu, 01 Jan 1970 00:00:00 GMT' })).status, 200);
      // If-None-Match ưu tiên hơn If-Modified-Since
      assert.strictEqual((await get(s.port, '/shell.css', { 'if-none-match': 'W/"0-0"', 'if-modified-since': a.headers['last-modified'] })).status, 200);
      // HEAD: có ETag, không thân
      const h = await get(s.port, '/shell.css', {}, 'HEAD');
      assert.strictEqual(h.status, 200);
      assert.strictEqual(h.headers.etag, a.headers.etag);
      assert.strictEqual(h.body.length, 0);
      // file không có: 404 như cũ
      assert.strictEqual((await get(s.port, '/khong-co.css')).status, 404);
    } finally { s.close(); }
  });
}

test('etagOf / fresh', () => {
  const st = { size: 255, mtimeMs: 4096.7 };
  assert.strictEqual(etagOf(st), 'W/"ff-1000"');
  assert.ok(fresh({ headers: { 'if-none-match': '*' } }, etagOf(st), st.mtimeMs));
  assert.ok(!fresh({ headers: {} }, etagOf(st), st.mtimeMs));
  assert.ok(!fresh({ headers: { 'if-modified-since': 'không phải ngày' } }, etagOf(st), st.mtimeMs));
});
