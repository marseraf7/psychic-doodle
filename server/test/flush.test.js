// Hồi quy H-S1 + H-S2: ghi dữ liệu định kỳ (store.flush) và các việc hẹn giờ của hub.
//  H-S2: flush xoá hàng đợi bẩn TRƯỚC khi ghi — ghi lỗi một lần là mất dữ liệu vĩnh viễn.
//  H-S1: flush ném lỗi ra khỏi callback hẹn giờ → sập tiến trình; một giải đấu ở trạng thái
//        làm tourTick ném lỗi sẽ khiến máy chủ khởi động lại rồi lại sập sau 1 giây, mãi mãi.
// Sau khi vá: flush không bao giờ ném lỗi, giữ hàng đợi và thử lại; các việc hẹn giờ của hub
// chạy qua safeTimer — lỗi chỉ được ghi log.
// Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Store } = require('../src/store.js');
const { start } = require('../server.js');

test('H-S2: flush ghi lỗi → không ném, giữ hàng đợi; hết lỗi thì ghi được, dữ liệu không mất', () => {
  const s = new Store(null);
  const u = s.createUser({ username: 'flush_a', name: 'A' }); // createUser ghi ngay
  u.rating = 1777;
  s.touch(u);
  assert.ok(s.dirty.has(u), 'thay đổi đang chờ ghi');

  // Giả lập lỗi ghi (đĩa đầy / CSDL kẹt): câu lệnh ghi ném lỗi
  const orig = s.q.upsertUser.run;
  s.q.upsertUser.run = () => { throw new Error('disk full (giả lập)'); };
  assert.doesNotThrow(() => s.flush(), 'flush không được ném lỗi ra ngoài');
  assert.ok(s.dirty.has(u), 'ghi lỗi thì mục chưa ghi phải còn trong hàng đợi');
  const row = s.db.prepare('SELECT data FROM users WHERE id = ?').get(u.id);
  assert.strictEqual(JSON.parse(row.data).rating !== 1777, true, 'dưới đĩa vẫn là bản cũ');

  // Hết lỗi: flush lại phải ghi được thay đổi đã giữ
  s.q.upsertUser.run = orig;
  assert.doesNotThrow(() => s.flush());
  assert.ok(!s.dirty.has(u), 'ghi thành công mới xoá khỏi hàng đợi');
  const row2 = s.db.prepare('SELECT data FROM users WHERE id = ?').get(u.id);
  assert.strictEqual(JSON.parse(row2.data).rating, 1777, 'thay đổi đã xuống đĩa, không mất');
  clearTimeout(s.timer);
  s.db.close();
});

test('H-S1: flush chạy từ hẹn giờ (schedule) mà ghi lỗi cũng không làm sập tiến trình', async () => {
  const s = new Store(null);
  const u = s.createUser({ username: 'flush_b', name: 'B' });
  const orig = s.q.upsertUser.run;
  s.q.upsertUser.run = () => { throw new Error('disk full (giả lập)'); };
  u.rating = 1888;
  s.touch(u); // hẹn flush sau 300ms; trên code cũ lỗi này văng khỏi callback hẹn giờ → chết tiến trình kiểm thử
  await new Promise((r) => setTimeout(r, 700));
  assert.ok(s.dirty.has(u), 'sau nhịp hẹn giờ lỗi, hàng đợi vẫn còn để thử lại');
  s.q.upsertUser.run = orig;
  s.flush();
  assert.ok(!s.dirty.has(u));
  clearTimeout(s.timer);
  s.db.close();
});

test('H-S1: việc hẹn giờ của hub chạy qua safeTimer — lỗi chỉ ghi log, không văng ra ngoài', async () => {
  const app = start({ port: 0, dataFile: null });
  await new Promise((r) => app.server.on('listening', r));
  const hub = app.hub;
  assert.strictEqual(typeof hub.safeTimer, 'function', 'hub phải có safeTimer');
  assert.doesNotThrow(() => hub.safeTimer('test', () => { throw new Error('boom (giả lập)'); }));
  assert.doesNotThrow(() => hub.safeTimer('sweep', () => hub.sweep()), 'sweep khoẻ mạnh chạy bình thường qua safeTimer');
  app.stop();
});
