// Thang nhân vật máy – đồng bộ theo tài khoản cùng đường với tiến độ A5 (progressSync – hub/progress.js, gộp bằng
// caro/progress-merge.js + bot-ladder-core.js; lưu trong user_progress). Bảng user_kv của bản thử B9 được chuyển sang khi mở
// CSDL. Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { boot, guest, account } = require('./phaseb-client.js');
const { Store } = require('../src/store.js');
const LC = require('../../caro/bot-ladder-core.js');

test('progressSync mang thang: gộp lấy bậc cao hơn, có trần số bậc, khách cần tài khoản, xoá tài khoản xoá luôn', async () => {
  const { app, url } = await boot();
  try {
    const a = await account(app, url, 'lad_a');
    const r1 = await a.req({ t: 'progressSync', data: { ladder: { r: { vn: 3, free: 1 }, at: 10 } } }, 'progress');
    assert.deepStrictEqual(r1.data.ladder, { r: { vn: 3, free: 1 }, at: 10 });
    await new Promise((r) => setTimeout(r, 2100));
    // Thiết bị khác có tiến độ thấp hơn ở vn, cao hơn ở renju (và tự báo bậc vô lý ở std): gộp, có trần
    const r2 = await a.req({ t: 'progressSync', data: { ladder: { r: { vn: 1, renju: 7, std: 1e6, bad: 99 }, at: 5 } } }, 'progress');
    assert.deepStrictEqual(r2.data.ladder, { r: { vn: 3, free: 1, std: LC.RUNGS, renju: 7 }, at: 10 });
    assert.deepStrictEqual(app.hub.store.progressGet(a.uid).ladder, r2.data.ladder);
    // Hồ sơ công khai không có thang (máy tự báo – không đưa ra ngoài)
    assert.ok(!('ladder' in app.hub.progressOf(app.hub.store.users.get(a.uid))));
    const g = await guest(url);
    const e = await g.req({ t: 'progressSync', data: {} }, 'progress');
    assert.strictEqual(e.code, 'need_account');
    app.hub.store.deleteUser(app.hub.store.users.get(a.uid));
    assert.strictEqual(app.hub.store.progressGet(a.uid), null);
    a.close(); g.close();
  } finally { await app.stop(); }
});

test('CSDL có bảng user_kv (bản thử B9): mở lại thì thang chuyển vào user_progress (gộp, có trần), bảng cũ bị xoá', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-kv-'));
  const file = path.join(dir, 'db.sqlite');
  try {
    let s = new Store(file);
    const uid = 'u1';
    s.db.prepare('INSERT INTO users (id, username, data) VALUES (?, ?, ?)').run(uid, 'kv_user', JSON.stringify({ id: uid, username: 'kv_user', name: 'KV' }));
    s.progressSet(uid, { ladder: { r: { free: 4 }, at: 3 }, pz: { n: 9 } });
    s.db.exec('CREATE TABLE user_kv (uid TEXT NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uid, k))');
    const put = s.db.prepare('INSERT INTO user_kv VALUES (?, ?, ?, 0)');
    put.run(uid, 'ladder', JSON.stringify({ r: { vn: 6, free: 2, renju: 500 }, at: 8 }));
    put.run('gone', 'ladder', JSON.stringify({ r: { vn: 2 }, at: 1 })); // tài khoản đã xoá: bỏ
    put.run(uid, 'other', '"x"');
    s.close();
    s = new Store(file);
    const p = s.progressGet(uid);
    assert.deepStrictEqual(p.ladder, { r: { vn: 6, free: 4, renju: LC.RUNGS }, at: 8 });
    assert.strictEqual(p.pz.n, 9, 'tiến độ khác giữ nguyên');
    assert.strictEqual(s.progressGet('gone'), null);
    assert.ok(!s.db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'user_kv'").get(), 'bảng user_kv đã xoá');
    assert.strictEqual(s.progressMigrateKv(), 0, 'lần sau không làm gì');
    s.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
