// Thống kê cá nhân (hub/insights.js, store-stats.js): gom ván đã lưu, quyền xem như Lịch sử đấu, bộ nhớ tạm. Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { boot, guest, account, record } = require('./phaseb-client.js');
const IC = require('../../caro/insights-core.js');

let app, url;
test.before(async () => { ({ app, url } = await boot()); });
test.after(() => app.stop());

test('insights: của mình – thắng / thua theo màu, mã nước đi + ván gần nhất để phân tích', async () => {
  const a = await account(app, url, 'ins_a');
  const b = await account(app, url, 'ins_b');
  record(app, { x: a.uid, o: b.uid, winner: 1 });
  record(app, { x: b.uid, o: a.uid, winner: 1, rule: 'free', clock: null, timeLimit: 0 });
  record(app, { x: a.uid, o: b.uid, winner: 3, moves: [[0, 0], [1, 1], [1, 0], [2, 0], [3, 3], [4, 4]] });
  record(app, { x: a.uid, o: b.uid, winner: 1, kind: 'corr', clock: null, timeLimit: 0 }); // chơi theo lượt (C1)
  const m = await a.req({ t: 'insights' }, 'insights');
  assert.strictEqual(m.owner.self, true);
  assert.strictEqual(m.data.n, 4);
  assert.deepStrictEqual(m.data.pool.corr, { w: 1, d: 0, l: 0 }, 'ván theo lượt: loại riêng, không gộp vào "không giới hạn giờ"');
  assert.deepStrictEqual(m.data.total, { w: 2, d: 1, l: 1 });
  assert.deepStrictEqual(m.data.color[1], { w: 2, d: 1, l: 0 });
  assert.deepStrictEqual(m.data.color[2], { w: 0, d: 0, l: 1 });
  assert.deepStrictEqual(m.data.pool.none, { w: 0, d: 0, l: 1 }, 'ván không giới hạn giờ');
  assert.ok(m.data.band.equal, 'hai tài khoản mới cùng điểm: ngang sức');
  assert.strictEqual(m.games.length, 4);
  const [h, side] = m.games[1];
  assert.strictEqual(h, IC.hash([[0, 0], [1, 1], [1, 0], [2, 0], [3, 3], [4, 4]]), 'mã nước đi giống cách tính trên trình duyệt');
  assert.strictEqual(side, 1);
  assert.strictEqual(m.recent.length, 4);
  assert.ok(Array.isArray(m.recent[0].moves));
  a.close(); b.close();
});

test('insights: bộ nhớ tạm dùng lại tới khi có ván mới', async () => {
  const a = await account(app, url, 'ins_c');
  const b = await account(app, url, 'ins_d');
  record(app, { x: a.uid, o: b.uid });
  const u = app.hub.store.users.get(a.uid);
  const r1 = app.hub.insightsOf(u);
  assert.strictEqual(app.hub.insightsOf(u), r1, 'chưa có ván mới: dùng lại');
  record(app, { x: a.uid, o: b.uid, winner: 2 });
  const r2 = app.hub.insightsOf(u);
  assert.notStrictEqual(r2, r1);
  assert.strictEqual(r2.data.n, 2);
  assert.notStrictEqual(app.hub.insightsOf(u, Date.now() + 11 * 60 * 1000), r2, 'quá 10 phút: tính lại');
  a.close(); b.close();
});

test('insights: quyền xem theo Lịch sử đấu; người khác không nhận dữ liệu phân tích; khách cần tài khoản', async () => {
  const a = await account(app, url, 'ins_e');
  const b = await account(app, url, 'ins_f');
  record(app, { x: a.uid, o: b.uid });
  const pub = await b.req({ t: 'insights', uid: a.uid }, 'insights');
  assert.strictEqual(pub.owner.self, false);
  assert.strictEqual(pub.data.n, 1);
  assert.strictEqual(pub.games, undefined, 'không gửi mã ván / nước đi cho người khác');
  assert.strictEqual(pub.recent, undefined);
  await a.req({ t: 'setHistVis', vis: 'private' }, 'histVis');
  await new Promise((r) => setTimeout(r, 1100)); // giới hạn tần suất 1 giây / lần
  const hid = await b.req({ t: 'insights', uid: a.uid }, 'insights');
  assert.strictEqual(hid.hidden, true);
  assert.strictEqual(hid.data, undefined);
  const g = await guest(url);
  const e = await g.req({ t: 'insights' }, 'insights');
  assert.strictEqual(e.t, 'error');
  assert.strictEqual(e.code, 'need_account');
  const nf = await g.req({ t: 'insights', uid: 'khong-co' }, 'insights').catch(() => null);
  assert.ok(nf === null || nf.t === 'error', 'quá nhanh hoặc không tìm thấy');
  a.close(); b.close(); g.close();
});
