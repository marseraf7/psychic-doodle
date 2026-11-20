/*
 * H-1 (rà soát bảo mật 20/11/2026): đường dẫn chứa byte null / ký tự điều khiển sau giải mã ('%00', '%0a'…) từng làm
 * fs.stat ném lỗi đồng bộ trong web.js → sập cả tiến trình Node (không cần đăng nhập). Nay: trả 400, máy chủ vẫn sống.
 * Chạy trong tiến trình con: nếu lỗi quay lại, tiến trình con chết chứ không kéo theo cả bộ test.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { fork } = require('child_process');
const path = require('path');

const get = (port, p) => new Promise((done) => {
  const rq = http.request({ host: '127.0.0.1', port, path: p }, (res) => { res.resume(); res.on('end', () => done(res.statusCode)); });
  rq.on('error', () => done(0));
  rq.end();
});

if (process.argv[2] === 'child') {
  // Tiến trình con: chỉ dựng máy chủ HTTP với handler thật
  const { Store } = require('../src/store.js');
  const { makeHandler } = require('../src/web.js');
  const srv = http.createServer(makeHandler({ store: new Store(null), hub: {}, bundle: false }));
  srv.listen(0, '127.0.0.1', () => process.send(srv.address().port));
} else {
  test('H-1: %00 / ký tự điều khiển trong đường dẫn → 400, tiến trình máy chủ không chết', async () => {
    const child = fork(__filename, ['child'], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let died = false;
    child.on('exit', () => { died = true; });
    const port = await new Promise((r) => child.once('message', r));
    try {
      assert.strictEqual(await get(port, '/healthz'), 200);
      for (const p of ['/.%00/WEB-INF/web.xml', '/index.html%00', '/%00', '/a%0Ab', '/x%1f.css', '/b/%00core.js', '/sw.js%7F']) {
        assert.strictEqual(await get(port, p), 400, p);
      }
      await new Promise((r) => setTimeout(r, 100));
      assert.ok(!died, 'tiến trình máy chủ còn sống');
      assert.strictEqual(await get(port, '/healthz'), 200, 'healthz vẫn ok sau các yêu cầu lạ');
      assert.strictEqual(await get(port, '/shell.css'), 200, 'file tĩnh thường vẫn phục vụ');
    } finally { child.kill(); }
  });
}
