/*
 * Rà soát đường sập tiến trình (sau H-1, 20/11/2026):
 *  - POST /api/rum với thân {"fcp":{"toString":1,"valueOf":1}}: Number() trên object đó ném TypeError trong callback
 *    req.on('end') – trước đây giết cả tiến trình máy chủ (không cần đăng nhập). Nay: 400, máy chủ vẫn sống.
 *  - Lưới an toàn từng yêu cầu (src/guard.js): lỗi bất ngờ của một yêu cầu HTTP / một tin WebSocket chỉ hỏng yêu cầu đó.
 * Phần máy chủ thật chạy trong tiến trình con: lỗi quay lại thì tiến trình con chết, không kéo theo cả bộ test.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { fork } = require('child_process');
const { guardHttp, guardCall, logPath } = require('../src/guard.js');

const req = (port, method, p, body) => new Promise((done) => {
  const rq = http.request({ host: '127.0.0.1', port, path: p, method, headers: body ? { 'content-type': 'text/plain' } : {} },
    (res) => { res.resume(); res.on('end', () => done(res.statusCode)); });
  rq.on('error', () => done(0));
  rq.end(body);
});

if (process.argv[2] === 'child') {
  const { start } = require('../server.js');
  const app = start({ port: 0, host: '127.0.0.1', dataFile: null });
  app.server.on('listening', () => process.send(app.server.address().port));
} else {
  test('POST /api/rum với object không đổi được ra số → 400, tiến trình máy chủ không chết', async () => {
    const child = fork(__filename, ['child'], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: { ...process.env, CARO_BUNDLE: '0' } });
    let died = false;
    child.on('exit', () => { died = true; });
    const port = await new Promise((r) => child.once('message', r));
    try {
      assert.strictEqual(await req(port, 'GET', '/healthz'), 200);
      for (const body of ['{"fcp":{"toString":1,"valueOf":1}}', '{"cls":{"valueOf":{},"toString":{}}}', '[1,2]', 'null', '{"fcp":[{"toString":1}]}']) {
        assert.strictEqual(await req(port, 'POST', '/api/rum', body), 400, body);
      }
      await new Promise((r) => setTimeout(r, 100));
      assert.ok(!died, 'tiến trình máy chủ còn sống');
      assert.strictEqual(await req(port, 'GET', '/healthz'), 200, 'healthz vẫn ok');
      assert.strictEqual(await req(port, 'POST', '/api/rum', '{"fcp":120}'), 204, 'số đo hợp lệ vẫn nhận');
    } finally { child.kill(); }
  });
  unitTests();
}

function unitTests() {
function fakeRes() {
  return {
    status: 0, headersSent: false, destroyed: false, body: '',
    writeHead(s) { this.status = s; this.headersSent = true; return this; },
    end(b) { if (b) this.body += b; },
    destroy() { this.destroyed = true; },
  };
}

test('guardHttp: handler ném lỗi đồng bộ → 500, ghi log không kèm query', () => {
  const logs = [];
  const h = guardHttp(() => { throw new Error('boom'); }, (...a) => logs.push(a.join(' ')));
  const res = fakeRes();
  h({ method: 'GET', url: '/x?token=bimat' }, res);
  assert.strictEqual(res.status, 500);
  assert.strictEqual(logs.length, 1);
  assert.ok(logs[0].includes('/x') && !logs[0].includes('bimat'), 'log không chứa query');
});

test('guardHttp: promise bị từ chối → 500; đã gửi header thì cắt kết nối', async () => {
  const logs = [];
  const res = fakeRes();
  guardHttp(async () => { throw new Error('later'); }, (...a) => logs.push(a))({ method: 'POST', url: '/mcp' }, res);
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(res.status, 500);
  const res2 = fakeRes();
  guardHttp(async (rq, rs) => { rs.writeHead(200); throw new Error('mid'); }, () => {})({ method: 'GET', url: '/' }, res2);
  await new Promise((r) => setImmediate(r));
  assert.ok(res2.destroyed);
  // handler bình thường: không đụng gì
  const res3 = fakeRes();
  guardHttp((rq, rs) => { rs.writeHead(204); rs.end(); }, () => assert.fail('không được ghi log'))({ method: 'GET', url: '/' }, res3);
  assert.strictEqual(res3.status, 204);
  assert.strictEqual(logs.length, 1);
});

test('guardHttp: handler đã trả lời xong (res.end) rồi mới ném → không cắt cụt thân đang gửi (máy chủ thật, 8 MB)', async () => {
  const N = 8 * 1024 * 1024;
  const logs = [];
  const srv = http.createServer(guardHttp((rq, rs) => {
    rs.writeHead(200, { 'content-length': N });
    rs.end(Buffer.alloc(N, 97));
    throw new Error('sau khi đã trả lời');
  }, (...a) => logs.push(a)));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const got = await new Promise((done) => {
      http.get({ host: '127.0.0.1', port: srv.address().port, path: '/' }, (res) => {
        let n = 0;
        res.on('data', (c) => { n += c.length; });
        res.on('end', () => done(n));
        res.on('error', () => done(-n));
      }).on('error', () => done(-1));
    });
    assert.strictEqual(got, N, 'nhận đủ thân trả lời');
    assert.strictEqual(logs.length, 1, 'lỗi vẫn được ghi log');
  } finally { srv.close(); }
});

test('guardHttp: res.writeHead cũng ném (kết nối hỏng) → vẫn không ném ra ngoài', () => {
  const res = { headersSent: false, writeHead() { throw new Error('x'); }, end() {}, destroy() { this.d = true; } };
  guardHttp(() => { throw new Error('a'); }, () => {})({ method: 'GET', url: '/' }, res);
  assert.ok(res.d);
});

test('guardCall: lỗi đồng bộ và promise bị từ chối chỉ ghi log', async () => {
  const logs = [];
  const log = (...a) => logs.push(a[0]);
  guardCall('message', () => { throw new Error('s'); }, log);
  guardCall('message', () => Promise.reject(new Error('p')), log);
  guardCall('message', () => 1, log);
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(logs.length, 2);
  assert.ok(logs[0].includes('message'));
});

test('logPath: bỏ query, cắt 100 ký tự, thay ký tự điều khiển', () => {
  assert.strictEqual(logPath('/a\x00b?x=1'), '/a?b');
  assert.strictEqual(logPath('/' + 'z'.repeat(300)).length, 100);
  assert.strictEqual(logPath(undefined), '');
});
}
