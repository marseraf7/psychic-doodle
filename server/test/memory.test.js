// Hồi quy H-S3: hai Map chỉ tăng không giảm trong hub.
//  - names: mỗi guestKey mới cộng một mục vĩnh viễn → khách rời hẳn phải được dọn ở sweep().
//    Khách đang trong phòng (dù offline chờ xử thua) hoặc đang online thì PHẢI giữ tên.
//  - tours: giải đã kết thúc chất đống trong bộ nhớ → sweep() chỉ giữ 100 giải đã xong gần
//    nhất, khớp hành vi lúc khởi động (store.loadTours); giải đang chạy không bao giờ bị dọn.
// Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const crypto = require('crypto');
const { start } = require('../server.js');

let app, url;
test.before(async () => {
  app = start({ port: 0, dataFile: null, msgRate: 2000 });
  await new Promise((r) => app.server.on('listening', r));
  url = `ws://127.0.0.1:${app.server.address().port}/ws`;
});
test.after(() => app.stop());

const until = async (fn, ms = 8000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('Hết giờ chờ điều kiện');
    await new Promise((r) => setTimeout(r, 10));
  }
};

async function guest() {
  const ws = new WebSocket(url);
  const c = { ws, pid: null };
  const welcomed = new Promise((res) => ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 'welcome') { c.pid = m.me.id; res(); }
  }));
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex'), guestName: 'KhachTest' }));
  await welcomed;
  return c;
}

test('H-S3 names: khách rời hẳn bị dọn ở sweep; khách trong phòng / đang online được giữ', async () => {
  const hub = app.hub;
  // Khách thường: hello → có tên; đóng kết nối → sweep dọn
  const g1 = await guest();
  assert.ok(hub.names.has(g1.pid), 'khách mới có tên trong Map');
  hub.sweep();
  assert.ok(hub.names.has(g1.pid), 'đang online thì giữ tên');
  g1.ws.close();
  await until(() => !hub.isOnline(g1.pid));
  hub.sweep();
  assert.ok(!hub.names.has(g1.pid), 'khách đã rời hẳn: tên bị dọn');

  // Khách đang ở trong phòng mà mất kết nối: vẫn phải giữ tên (phòng còn hiển thị, chờ xử thua)
  const g2 = await guest();
  g2.ws.send(JSON.stringify({ t: 'createRoom', side: 1, timeLimit: 0, opening: 'free', rule: 'vn', public: false }));
  await until(() => hub.roomOf.has(g2.pid));
  g2.ws.close();
  await until(() => !hub.isOnline(g2.pid));
  hub.sweep();
  assert.ok(hub.names.has(g2.pid), 'khách còn ghế trong phòng: giữ tên dù đã offline');
});

test('H-S3 tours: sweep chỉ giữ 100 giải đã xong gần nhất; giải đang chạy giữ nguyên', () => {
  const hub = app.hub;
  hub.tours.clear();
  for (let i = 0; i < 105; i++) hub.tours.set('done' + i, { id: 'done' + i, status: 'finished', created: 1000 + i });
  hub.tours.set('run1', { id: 'run1', status: 'running', created: 1 });
  hub.tours.set('pend1', { id: 'pend1', status: 'pending', created: 2 });
  hub.tourJson = new Map([['done0', { json: '{}', at: 0 }], ['done104', { json: '{}', at: 0 }]]);

  hub.sweep();

  const doneLeft = [...hub.tours.values()].filter((t) => t.status === 'finished');
  assert.strictEqual(doneLeft.length, 100, 'chỉ còn 100 giải đã xong');
  assert.ok(hub.tours.has('done104'), 'giữ giải mới nhất');
  assert.ok(!hub.tours.has('done0'), 'dọn giải đã xong cũ nhất');
  assert.ok(hub.tours.has('run1') && hub.tours.has('pend1'), 'giải chưa xong không bị dọn');
  assert.ok(!hub.tourJson.has('done0'), 'bản đệm của giải bị dọn cũng bị xoá theo');
  assert.ok(hub.tourJson.has('done104'), 'bản đệm của giải được giữ thì còn');
});
