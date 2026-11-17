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

test('mục 75: close() phải ghi nốt hàng đợi trước khi đóng — lỗi ghi tạm thời thì thử lại, không mất dữ liệu', () => {
  const s = new Store(null);
  const u = s.createUser({ username: 'close_a', name: 'A' });
  u.rating = 1999;
  s.touch(u);
  assert.ok(s.dirty.has(u), 'thay đổi đang chờ ghi');

  // Lỗi ghi chỉ ở lần đầu (tạm thời): close() phải thử lại và ghi được thay vì đóng CSDL ngay
  const orig = s.q.upsertUser.run;
  let calls = 0;
  s.q.upsertUser.run = (...a) => { calls++; if (calls === 1) throw new Error('disk full (giả lập)'); return orig.apply(s.q.upsertUser, a); };
  assert.doesNotThrow(() => s.close(), 'close không được ném lỗi');
  assert.ok(calls >= 2, 'close đã thử ghi lại sau lần lỗi đầu, không đóng ngay');
  assert.strictEqual(s.dirty.size, 0, 'hàng đợi đã ghi hết trước khi đóng — dữ liệu không mất');
  assert.strictEqual(s.timer, null, 'không còn hẹn giờ thử lại nào treo trên CSDL đã đóng');
});

test('mục 75: close() khi ghi lỗi dai dẳng — vẫn đóng được (không treo), số lần thử có giới hạn', () => {
  const s = new Store(null);
  const u = s.createUser({ username: 'close_b', name: 'B' });
  u.rating = 1888;
  s.touch(u);
  let calls = 0;
  s.q.upsertUser.run = () => { calls++; throw new Error('disk full (giả lập)'); };
  assert.doesNotThrow(() => s.close(), 'close vẫn phải hoàn tất để tiến trình thoát');
  assert.ok(calls >= 2 && calls <= 6, `close thử lại có giới hạn (đã gọi ${calls} lần)`);
  assert.ok(s.dirty.has(u), 'ghi không được thì hàng đợi còn nguyên (mất dữ liệu là do đĩa lỗi, không phải do đóng vội)');
  assert.strictEqual(s.timer, null, 'không còn hẹn giờ thử lại nào treo trên CSDL đã đóng');
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
