// Thang nhân vật máy – đồng bộ theo tài khoản (hub/ladder.js, store-sync.js). Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { boot, guest, account } = require('./phaseb-client.js');

test('ladderSync: gộp lấy bậc cao hơn, lưu theo tài khoản, khách cần tài khoản, xoá tài khoản xoá luôn', async () => {
  const { app, url } = await boot();
  try {
    const a = await account(app, url, 'lad_a');
    const r1 = await a.req({ t: 'ladderSync', data: { r: { vn: 3, free: 1 }, at: 10 } }, 'ladder');
    assert.deepStrictEqual(r1.data, { r: { vn: 3, free: 1 }, at: 10 });
    await new Promise((r) => setTimeout(r, 1050));
    // Thiết bị khác có tiến độ thấp hơn ở vn, cao hơn ở renju: gộp
    const r2 = await a.req({ t: 'ladderSync', data: { r: { vn: 1, renju: 7, bad: 99 }, at: 5 } }, 'ladder');
    assert.deepStrictEqual(r2.data, { r: { vn: 3, free: 1, renju: 7 }, at: 10 });
    const tooFast = await a.req({ t: 'ladderSync', data: {} }, 'ladder');
    assert.strictEqual(tooFast.t, 'error', 'giới hạn 1 lần / giây');
    assert.deepStrictEqual(app.hub.store.kvGet(a.uid, 'ladder'), r2.data);
    const g = await guest(url);
    const e = await g.req({ t: 'ladderSync', data: {} }, 'ladder');
    assert.strictEqual(e.code, 'need_account');
    app.hub.store.deleteUser(app.hub.store.users.get(a.uid));
    assert.strictEqual(app.hub.store.kvGet(a.uid, 'ladder'), null);
    assert.throws(() => app.hub.store.kvSet('x', 'k', 'y'.repeat(5000)), /quá lớn/);
    a.close(); g.close();
  } finally { await app.stop(); }
});
