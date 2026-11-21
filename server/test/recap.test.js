// Tổng kết tháng / năm (hub/recap.js): chỉ của mình, khoảng thời gian, đối thủ gặp nhiều nhất chỉ khi cả hai công khai. Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { boot, guest, account, record } = require('./phaseb-client.js');

test('recap: gom ván trong kỳ; đối thủ gặp nhiều nhất theo quyền công khai; kiểm tham số', async () => {
  const { app, url } = await boot();
  try {
    const a = await account(app, url, 'rc_a');
    const b = await account(app, url, 'rc_b');
    record(app, { x: a.uid, o: b.uid, winner: 1 });
    record(app, { x: b.uid, o: a.uid, winner: 2, rule: 'free' });
    record(app, { x: a.uid, o: b.uid, winner: 3 });
    const now = Date.now();
    const r = await a.req({ t: 'recap', from: now - 86400000, to: now + 86400000 }, 'recap');
    assert.strictEqual(r.data.n, 3);
    assert.deepStrictEqual([r.data.w, r.data.d, r.data.l], [2, 1, 0]);
    assert.strictEqual(r.data.streak, 2);
    assert.deepStrictEqual(r.data.rule, { k: 'vn', n: 2 });
    assert.strictEqual(r.data.best.name, 'rc_b');
    assert.ok(r.data.best.share);
    assert.deepStrictEqual(r.data.opp, { name: 'rc_b', n: 3 });
    // Đối thủ để lịch sử đấu riêng tư: không hiện "đối thủ gặp nhiều nhất"
    await b.req({ t: 'setHistVis', vis: 'friends' }, 'histVis');
    await new Promise((res) => setTimeout(res, 1050));
    const r2 = await a.req({ t: 'recap', from: now - 86400000, to: now + 86400000 }, 'recap');
    assert.strictEqual(r2.data.opp, null);
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
