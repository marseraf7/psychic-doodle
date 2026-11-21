// Tổng kết tháng / năm (hub/recap.js): chỉ của mình, khoảng thời gian, đối thủ gặp nhiều nhất chỉ khi cả hai công khai. Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Client, boot, guest, account, record } = require('./phaseb-client.js');

test('recap: gom ván trong kỳ; đối thủ gặp nhiều nhất theo quyền công khai; kiểm tham số', async () => {
  const { app, url } = await boot();
  try {
    const a = await account(app, url, 'rc_a');
    const b = await account(app, url, 'rc_b');
    record(app, { x: a.uid, o: b.uid, winner: 1 });
    record(app, { x: b.uid, o: a.uid, winner: 2, rule: 'free' });
    record(app, { x: a.uid, o: b.uid, winner: 3 });
    for (let i = 0; i < 4; i++) record(app, { x: a.uid, o: b.uid, winner: 3, kind: 'corr', clock: null }); // chơi theo lượt (C1)
    const now = Date.now();
    const r = await a.req({ t: 'recap', from: now - 86400000, to: now + 86400000 }, 'recap');
    assert.strictEqual(r.data.n, 7);
    assert.deepStrictEqual(r.data.pool, { k: 'corr', n: 4 }, 'ván theo lượt: loại "Theo lượt" (không phải null / classical)');
    assert.deepStrictEqual([r.data.w, r.data.d, r.data.l], [2, 5, 0]);
    assert.strictEqual(r.data.streak, 2);
    assert.deepStrictEqual(r.data.rule, { k: 'vn', n: 6 });
    assert.strictEqual(r.data.best.name, 'rc_b');
    assert.ok(r.data.best.share);
    assert.deepStrictEqual(r.data.opp, { name: 'rc_b', n: 7 });
    // Đối thủ để lịch sử đấu riêng tư: không hiện "đối thủ gặp nhiều nhất"
    await b.req({ t: 'setHistVis', vis: 'friends' }, 'histVis');
    await new Promise((res) => setTimeout(res, 1050));
    const r2 = await a.req({ t: 'recap', from: now - 86400000, to: now + 86400000 }, 'recap');
    assert.strictEqual(r2.data.opp, null);
    assert.strictEqual(r2.data.best.name, null, 'thắng đẹp nhất: không lộ tên đối thủ để lịch sử riêng tư (thẻ PNG chia sẻ ra ngoài)');
    assert.ok(r2.data.best.r > 0);
    await new Promise((res) => setTimeout(res, 1050));
    const old = await a.req({ t: 'recap', from: now - 40 * 86400000, to: now - 30 * 86400000 }, 'recap');
    assert.strictEqual(old.data.n, 0, 'kỳ khác: không có ván');
    await new Promise((res) => setTimeout(res, 1050));
    const bad = await a.req({ t: 'recap', from: 0, to: now }, 'recap');
    assert.strictEqual(bad.code, 'bad_message', 'khoảng quá 1 năm');
    const g = await guest(url);
    assert.strictEqual((await g.req({ t: 'recap', from: 1, to: 2 }, 'recap')).code, 'need_account');
    a.close(); b.close(); g.close();
  } finally { await app.stop(); }
});

test('recap theo múi giờ thiết bị: kỳ tháng / năm + "ngày có chơi" theo tên IANA đã lưu (đúng giờ mùa hè), không có thì số phút lệch', async () => {
  const { app, url } = await boot();
  const wait = () => new Promise((res) => setTimeout(res, 1050));
  try {
    const a = await account(app, url, 'rc_tz');
    const b = await account(app, url, 'rc_tz2');
    const at = (share, t) => app.store.db.prepare('UPDATE games SET created = ? WHERE share = ?').run(t, share);
    // New York 1/11/2026 (đổi giờ lúc 02:00 EDT → 01:00 EST): 23:30 EDT 31/10, 00:30 EDT 1/11, 01:30 EST 1/11
    at(record(app, { x: a.uid, o: b.uid }), Date.UTC(2026, 10, 1, 3, 30));
    at(record(app, { x: a.uid, o: b.uid }), Date.UTC(2026, 10, 1, 4, 30));
    at(record(app, { x: a.uid, o: b.uid }), Date.UTC(2026, 10, 1, 6, 30));
    const u = app.store.users.get(a.uid);
    u.tzName = 'America/New_York'; u.tz = -300;
    const nov = await a.req({ t: 'recap', kind: 'month', y: 2026, m: 11 }, 'recap');
    assert.deepStrictEqual([nov.data.n, nov.data.days], [2, 1], 'tháng 11 giờ New York: 2 ván, 1 ngày');
    assert.deepStrictEqual([nov.kind, nov.y, nov.m], ['month', 2026, 11]);
    await wait();
    const oct = await a.req({ t: 'recap', kind: 'month', y: 2026, m: 10 }, 'recap');
    assert.strictEqual(oct.data.n, 1, '23:30 EDT 31/10 thuộc tháng 10');
    await wait();
    const yr = await a.req({ t: 'recap', kind: 'year', y: 2026 }, 'recap');
    assert.deepStrictEqual([yr.data.n, yr.data.days], [3, 2]);
    // Chỉ có số phút lệch (máy cũ): -300 cố định → 00:30 EDT thành 23:30 ngày 31/10
    delete u.tzName;
    await wait();
    const off = await a.req({ t: 'recap', kind: 'month', y: 2026, m: 11 }, 'recap');
    assert.strictEqual(off.data.n, 1);
    // Việt Nam: cả ba ván là ngày 1/11
    u.tzName = 'Asia/Ho_Chi_Minh';
    await wait();
    const vn = await a.req({ t: 'recap', kind: 'month', y: 2026, m: 11 }, 'recap');
    assert.deepStrictEqual([vn.data.n, vn.data.days], [3, 1]);
    // "ngày có chơi" cũng theo múi giờ khi máy gửi from / to (bản cũ)
    await wait();
    const legacy = await a.req({ t: 'recap', from: Date.UTC(2026, 9, 30), to: Date.UTC(2026, 10, 3) }, 'recap');
    assert.deepStrictEqual([legacy.data.n, legacy.data.days], [3, 1]);
    await wait();
    const bad = await a.req({ t: 'recap', kind: 'month', y: 2026, m: 13 }, 'recap');
    assert.strictEqual(bad.code, 'bad_message');
    a.close(); b.close();
  } finally { await app.stop(); }
});

test('hello: máy gửi tên múi giờ IANA (hợp lệ mới lưu); máy chỉ gửi số phút thì bỏ tên cũ', async () => {
  const { app, url } = await boot();
  try {
    const a = await account(app, url, 'rc_hello');
    const token = a.msgs.find((m) => m.t === 'auth').token;
    const hello = async (client) => {
      const c = new Client(url);
      await c.open();
      await c.req({ t: 'hello', token, client }, 'welcome');
      c.close();
      return app.store.users.get(a.uid);
    };
    let u = await hello({ tz: 60, tzName: 'Europe/Berlin' });
    assert.deepStrictEqual([u.tz, u.tzName], [60, 'Europe/Berlin']);
    u = await hello({ tz: 120, tzName: 'Mars/Olympus' });
    assert.deepStrictEqual([u.tz, u.tzName], [120, undefined], 'tên sai: không lưu');
    u = await hello({ tz: 180, tzName: 'Europe/Moscow' });
    assert.strictEqual(u.tzName, 'Europe/Moscow');
    u = await hello({ tz: 420 });
    assert.deepStrictEqual([u.tz, u.tzName], [420, undefined], 'máy chỉ gửi số phút: bỏ tên cũ (tránh lệch hai múi giờ)');
    a.close();
  } finally { await app.stop(); }
});
