// Soát chơi đẹp (hub/fairplay.js, store-fairplay.js): rời tab lưu kèm ván, hàng chờ (rời tab nhiều, bàn đầu giải, báo cáo
// gian lận), trang quản trị chỉ cho quản trị viên, không xử phạt tự động. Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { boot, account, record } = require('./phaseb-client.js');
const { BLUR_N } = require('../src/hub/fairplay.js');

test('rời tab: cộng vào phòng có trần, lưu kèm ván, nhiều thì vào hàng chờ; quản trị viên xem / ghi kết quả / đánh dấu', async () => {
  const { app, url } = await boot({ timers: { THROTTLE_SCALE: 0 } });
  try {
    const hub = app.hub;
    const boss = await account(app, url, 'boss');
    const a = await account(app, url, 'fp_a');
    const b = await account(app, url, 'fp_b');
    // Phòng giả đang đấu giữa a và b (đủ để kiểm phần fairplay – luồng phòng thật có ở e2e)
    const { Room } = require('../src/room.js');
    const room = hub.makeRoom('casual', 1, 0, {});
    hub.enter(room, a.me.id.startsWith('u_') ? a.me.id : 'u_' + a.uid, 1);
    hub.enter(room, 'u_' + b.uid, 2);
    room.board.play(0, 0, 1);
    room.board.play(5, 5, 2);
    assert.ok(room instanceof Room && room.inProgress);
    const conn = [...hub.byPid.get('u_' + a.uid)][0];
    hub.on_fpBlur(conn, { n: 99, ms: 1e9 });
    assert.deepStrictEqual(room.fp[1], { n: 3, ms: 300000 }, 'mỗi tin có trần');
    for (let i = 0; i < 5; i++) hub.on_fpBlur(conn, { n: 2, ms: 1000 });
    assert.strictEqual(room.fp[1].n, 13);
    hub.on_fpBlur(conn, { n: 'x', ms: -5 });
    assert.strictEqual(room.fp[1].n, 13, 'giá trị lạ: 0');
    const share = record(app, { x: a.uid, o: b.uid });
    hub.fpOnSettle(room, share);
    assert.deepStrictEqual(app.store.fpBlur(share), { x_n: 13, x_ms: 305000, o_n: 0, o_ms: 0 });
    assert.ok(room.fp[1].n >= BLUR_N);
    // Quản trị viên: hàng chờ
    const q = await boss.req({ t: 'fpQueue' }, 'fpQueue');
    assert.strictEqual(q.items.length, 1);
    assert.strictEqual(q.items[0].why, 'blur');
    assert.strictEqual(q.items[0].x_n, 13);
    const id = q.items[0].id;
    const saved = await boss.req({ t: 'fpResult', id, stats: { 1: { n: 20, match: 95, loss: 1.2, acc: 97 }, 2: { n: 'x' }, engine: 'pool' } }, 'fpSaved');
    assert.deepStrictEqual(saved.stats[1], { n: 20, match: 95, loss: 1, acc: 97 });
    assert.deepStrictEqual(saved.stats[2], { n: 0, match: 0, loss: 0, acc: 0 });
    await boss.req({ t: 'fpMark', id, status: 'reviewed' }, 'fpSaved');
    assert.strictEqual((await boss.req({ t: 'fpQueue' }, 'fpQueue')).items.length, 0);
    const all = await boss.req({ t: 'fpQueue', status: 'all' }, 'fpQueue');
    assert.strictEqual(all.items[0].status, 'reviewed');
    assert.strictEqual(all.items[0].by, 'boss');
    assert.strictEqual(all.items[0].stats[1].match, 95);
    const bad = await boss.req({ t: 'fpMark', id, status: 'ban' }, 'fpSaved');
    assert.strictEqual(bad.t, 'error', 'không có trạng thái xử phạt');
    // Người thường không xem được
    const deny = await a.req({ t: 'fpQueue' }, 'fpQueue');
    assert.strictEqual(deny.code, 'admin_only');
    // Báo cáo gian lận → ván gần nhất giữa hai người vào hàng chờ (mở lại nếu đã xem)
    await a.req({ t: 'report', id: b.uid, reason: 'cheat' }, 'note').catch(() => null);
    const it = app.store.fpQueue('open')[0];
    assert.ok(it && it.why.split(',').includes('report'));
    // Không có lần rời tab nào: không lưu
    const r2 = hub.makeRoom('casual', 1, 0, {});
    const s2 = record(app, { x: a.uid, o: b.uid });
    hub.fpOnSettle(r2, s2);
    assert.strictEqual(app.store.fpBlur(s2), null);
    // Xoá tài khoản: dòng của ván không còn bị bỏ
    app.store.deleteUser(app.store.users.get(a.uid));
    app.store.deleteUser(app.store.users.get(b.uid));
    assert.strictEqual(app.store.fpBlur(share), null);
    assert.strictEqual(app.store.fpQueue('all').length, 0);
    boss.close(); a.close(); b.close();
  } finally { await app.stop(); }
});

test('bàn đầu của giải: người trong top 3 (Arena theo điểm, giải khác theo hạt giống)', () => {
  const { Hub } = require('../src/hub/index.js');
  const { Store } = require('../src/store.js');
  const store = new Store(null);
  const hub = new Hub({ store });
  try {
    hub.tours.set('t1', { id: 't1', format: 'arena', players: [{ uid: 'a', score: 9 }, { uid: 'b', score: 7 }, { uid: 'c', score: 5 }, { uid: 'd', score: 1 }, { uid: 'e', score: 0, withdrawn: true }] });
    hub.tours.set('t2', { id: 't2', format: 'single', players: [{ uid: 'a', seed: 4 }, { uid: 'b', seed: 1 }, { uid: 'c', seed: 2 }, { uid: 'd', seed: 3 }] });
    const room = (id, x, o) => ({ tour: { id }, seats: { 1: 'u_' + x, 2: 'u_' + o } });
    assert.strictEqual(hub.fpTopBoard(room('t1', 'd', 'c')), true);
    assert.strictEqual(hub.fpTopBoard(room('t1', 'd', 'e')), false);
    assert.strictEqual(hub.fpTopBoard(room('t2', 'a', 'd')), true, 'hạt giống 3');
    assert.strictEqual(hub.fpTopBoard(room('t2', 'a', 'x')), false);
    assert.strictEqual(hub.fpTopBoard(room('khong', 'a', 'b')), false);
  } finally { hub.close(); store.close(); }
});

test('ván cũ tự xoá (quá 300 ván mỗi người): số lần rời tab + dòng hàng chờ của ván đó xoá theo (như chính sách quyền riêng tư)', () => {
  const { Store } = require('../src/store.js');
  const s = new Store(null);
  const g = (n) => s.recordGame({ kind: 'quick', timeLimit: 0, clock: '3+2', rule: 'vn', xId: 'ua', oId: 'ub', xName: 'a', oName: 'b', winner: 1, reason: 'win', moves: [[0, n], [1, n]] });
  const first = g(0);
  s.fpSaveBlur(first, { n: 9, ms: 100000 }, { n: 0, ms: 0 });
  s.fpEnqueue(first, 'blur');
  const keep = g(1);
  s.fpSaveBlur(keep, { n: 1, ms: 1000 }, { n: 0, ms: 0 });
  for (let i = 2; i <= 300; i++) g(i); // ván thứ 301: ván đầu không còn ai giữ → xoá
  assert.ok(!s.gameByShare(first), 'ván đầu đã bị xoá');
  assert.strictEqual(s.fpBlur(first), null, 'số lần rời tab của ván đã xoá không còn');
  assert.strictEqual(s.fp().prepare('SELECT COUNT(*) AS n FROM fp_queue WHERE share = ?').get(first).n, 0);
  assert.deepStrictEqual(s.fpBlur(keep), { x_n: 1, x_ms: 1000, o_n: 0, o_ms: 0 }, 'ván còn giữ: còn nguyên');
  s.close();
});
