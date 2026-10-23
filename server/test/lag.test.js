// Bù trễ mạng cho đồng hồ ván online (Issue #110 P1):
//  - máy chủ tự đo RTT bằng gói ping WebSocket (mã ngẫu nhiên, gói trả lời sai mã không được tính);
//  - mỗi nước cộng trả RTT, có trần mỗi nước và trần cả ván, không bao giờ nhiều hơn thời gian vừa chạy;
//  - hẹn giờ hết giờ chờ thêm mức bù: nước đã gửi kịp mà tới muộn không bị xử thua.
// Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const { start } = require('../server.js');
const { Room } = require('../src/room.js');
const { LagMeter, lagCaps, SAMPLE_MAX } = require('../src/lag.js');

/** Phòng 2 người với giờ máy giả (now.t), trễ giả của từng người (lag[id]). */
function room2(opts, lag = {}) {
  const now = { t: 1000 };
  const real = Date.now;
  Date.now = () => now.t;
  const r = new Room({ code: '1', password: '1', ...opts });
  r.lagOf = (id) => lag[id] || 0;
  r.addPlayer({ id: 'A', name: 'A' }, 1);
  r.addPlayer({ id: 'B', name: 'B' }, 2);
  return { r, now, done: () => { Date.now = real; } };
}

test('LagMeter: chưa đo thì null, làm mượt, một lần đo quá lớn chỉ tính tới trần', () => {
  const m = new LagMeter();
  assert.strictEqual(m.value, null);
  m.sample(200);
  assert.strictEqual(m.value, 200, 'lần đo đầu lấy nguyên');
  m.sample(600);
  assert.strictEqual(m.value, 300, 'lần sau chiếm 1/4: 200 + (600-200)/4');
  m.sample(-5); m.sample(NaN);
  assert.strictEqual(m.n, 2, 'số đo lỗi bị bỏ');
  const big = new LagMeter();
  big.sample(60000);
  assert.strictEqual(big.value, SAMPLE_MAX);
});

test('lagCaps: trần theo loại thời gian (giây thật, không theo secondMs của test)', () => {
  const caps = (o) => lagCaps(new Room({ code: '1', password: '1', ...o }));
  assert.deepStrictEqual(caps({ clock: '1+0' }), { move: 250, game: 6000 });
  assert.deepStrictEqual(caps({ clock: '3+2' }), { move: 780, game: 26000 });
  assert.deepStrictEqual(caps({ clock: '10+0' }), { move: 1000, game: 60000 });
  assert.deepStrictEqual(caps({ clock: '3+2', secondMs: 10 }), { move: 780, game: 26000 }, 'đồng hồ thu nhỏ: trần như bản thật');
  assert.deepStrictEqual(caps({ timeLimit: 30 }), { move: 900, game: Infinity });
  assert.deepStrictEqual(caps({}), { move: 0, game: 0 }, 'không giới hạn thời gian: không bù');
});

test('đồng hồ tổng: mỗi nước cộng trả RTT (tới trần mỗi nước), không có số đo thì như cũ', () => {
  const a = room2({ clock: '3+2' }, { A: 300 });
  try {
    a.now.t += 2000;
    a.r.move('A', 0, 0);
    assert.strictEqual(a.r.clockLeft.A, 180000 - 2000 + 300 + 2000, 'nghĩ 2 giây (gồm 300 ms đường truyền): chỉ trừ 1,7 giây');
    assert.strictEqual(a.r.lagUsed.A, 300);
  } finally { a.done(); }

  const b = room2({ clock: '1+0' }, { A: 900 });
  try {
    b.now.t += 2000;
    b.r.move('A', 0, 0);
    assert.strictEqual(b.r.clockLeft.A, 60000 - 2000 + 250, '1+0: bù tối đa 250 ms / nước');
  } finally { b.done(); }

  const c = room2({ clock: '1+0' });
  try {
    c.now.t += 2000;
    c.r.move('A', 0, 0);
    assert.strictEqual(c.r.clockLeft.A, 58000, 'chưa đo trễ: trừ đủ');
  } finally { c.done(); }
});

test('bù không quá thời gian vừa chạy, không quá trần cả ván; ván mới tính lại từ đầu', () => {
  const a = room2({ clock: '3+2' }, { A: 500 });
  try {
    a.now.t += 100;
    a.r.move('A', 0, 0);
    assert.strictEqual(a.r.clockLeft.A, 180000 + 2000, 'đi sau 100 ms: bù 100 ms, đồng hồ không tăng quá lúc bắt đầu lượt');
    a.r.move('B', 5, 5);
    a.r.lagUsed.A = 26000 - 120; // gần chạm trần cả ván 3+2 (26 giây)
    a.now.t += 3000;
    a.r.move('A', 1, 0);
    assert.strictEqual(a.r.clockLeft.A, 182000 - 3000 + 120 + 2000, 'chỉ bù phần còn lại của trần cả ván');
    a.r.move('B', 6, 5);
    a.now.t += 3000;
    a.r.move('A', 2, 0);
    assert.strictEqual(a.r.clockLeft.A, 181120 - 3000 + 2000, 'hết trần cả ván: không bù nữa');
    a.r.resetBoard();
    a.r.startClock(); // ván mới (vd. tái đấu)
    assert.deepStrictEqual(a.r.lagUsed, {}, 'ván mới: trần cả ván tính lại');
  } finally { a.done(); }
});

test('hết giờ: bù trễ cứu được nước tới muộn trong mức bù, quá mức thì vẫn thua', () => {
  const ok = room2({ clock: '1+0' }, { A: 400 });
  try {
    ok.r.clockLeft.A = 100;
    ok.r.startClock();
    ok.now.t += 300; // quá giờ 200 ms theo máy chủ, nhưng 250 ms là đường truyền
    ok.r.move('A', 0, 0);
    assert.strictEqual(ok.r.winner, null, 'nước còn trong mức bù: hợp lệ');
    assert.strictEqual(ok.r.clockLeft.A, 50);
  } finally { ok.done(); }

  const late = room2({ clock: '1+0' }, { A: 400 });
  try {
    late.r.clockLeft.A = 100;
    late.r.startClock();
    late.now.t += 400;
    late.r.move('A', 0, 0);
    assert.strictEqual(late.r.reason, 'time', 'quá cả mức bù: thua vì hết giờ');
    assert.strictEqual(late.r.clockLeft.A, 0);
  } finally { late.done(); }
});

test('lagGrace: mức chờ thêm của hẹn giờ = mức bù của người đang phải đi', () => {
  const a = room2({ timeLimit: 30 }, { A: 1500, B: 40 });
  try {
    assert.strictEqual(a.r.lagGrace(), 900, 'giới hạn 30 giây / nước: chờ thêm tối đa 900 ms');
    a.r.move('A', 0, 0);
    assert.strictEqual(a.r.lagGrace(), 40);
  } finally { a.done(); }
  const n = room2({}, { A: 300 });
  try { assert.strictEqual(n.r.lagGrace(), 0, 'không giới hạn thời gian: không chờ'); } finally { n.done(); }
});

let app, url;
test.before(async () => {
  app = start({ port: 0, dataFile: null, msgRate: 2000, timers: { SECOND_MS: 20 } });
  await new Promise((r) => app.server.on('listening', r));
  url = `ws://127.0.0.1:${app.server.address().port}/ws`;
});
test.after(() => app.stop());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const conns = () => [...app.hub.byPid.values()].flatMap((s) => [...s]);

test('máy chủ tự đo RTT bằng ping WebSocket; gói trả lời sai mã không được tính', async () => {
  const before = new Set(conns());
  const ws = new WebSocket(url, { autoPong: false });
  ws.on('ping', (data) => setTimeout(() => ws.pong(data), 200)); // mạng trễ ~200 ms
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'hello', guestKey: 'b'.repeat(32) }));
  let conn = null;
  for (let i = 0; i < 60 && !(conn && conn.lag.n); i++) { await sleep(25); conn = conns().find((c) => !before.has(c)); }
  assert.ok(conn && conn.lag.n === 1, 'đã đo một lần ngay khi kết nối');
  assert.ok(conn.lag.value >= 195 && conn.lag.value < 600, `RTT đo được ~200 ms (${conn.lag.value})`);
  ws.pong(Buffer.from('giả')); // tự gửi gói trả lời không có mã đúng
  await sleep(100);
  assert.strictEqual(conn.lag.n, 1, 'gói trả lời giả không được tính');
  assert.strictEqual(app.hub.lagOf(conn.pid), conn.lag.value, 'hub.lagOf lấy số đo của kết nối');
  assert.strictEqual(app.hub.lagOf('không-có'), 0);
  ws.close();
});

test('hẹn giờ hết giờ chờ thêm mức bù trễ (rooms.js scheduleClock)', async () => {
  const room = app.hub.makeRoom('room', 1, 0, { clock: '1+0' }); // SECOND_MS 20: 1 phút = 1,2 giây
  room.lagOf = () => 250;
  room.addPlayer({ id: 'g:x', name: 'X' }, 1);
  room.addPlayer({ id: 'g:y', name: 'Y' }, 2);
  const t0 = Date.now();
  const end = room.turnEndsAt;
  app.hub.scheduleClock(room);
  while (!room.winner && Date.now() - t0 < 4000) await sleep(10);
  assert.strictEqual(room.reason, 'time');
  assert.ok(Date.now() >= end + 250, `chỉ xử thua sau hạn + mức bù (${Date.now() - end} ms sau hạn)`);
  app.hub.rooms.delete(room.code);
});
