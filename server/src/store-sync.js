/*
 * Kho đồng bộ nhỏ theo tài khoản: một giá trị JSON cho mỗi (uid, khoá) – dùng cho tiến độ thang nhân vật máy
 * (hub/ladder.js) và các tiến độ nhỏ khác cần đi theo tài khoản giữa các thiết bị. Trộn vào Store.prototype (store.js).
 * Bảng user_kv tạo lúc cần (CSDL cũ tự có). Mỗi giá trị tối đa MAX_LEN ký tự.
 */
'use strict';

const MAX_LEN = 4000;

class SyncStore {
  kvDb() {
    if (!this.kvReady) {
      this.db.exec('CREATE TABLE IF NOT EXISTS user_kv (uid TEXT NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uid, k))');
      this.kvReady = true;
    }
    return this.db;
  }

  kvGet(uid, k) {
    const r = this.kvDb().prepare('SELECT v FROM user_kv WHERE uid = ? AND k = ?').get(uid, k);
    if (!r) return null;
    try { return JSON.parse(r.v); } catch (e) { return null; }
  }

  kvSet(uid, k, v) {
    const s = JSON.stringify(v);
    if (s.length > MAX_LEN) throw new Error('kv: giá trị quá lớn');
    this.kvDb().prepare('INSERT INTO user_kv (uid, k, v, at) VALUES (?, ?, ?, ?) ON CONFLICT(uid, k) DO UPDATE SET v = excluded.v, at = excluded.at')
      .run(uid, k, s, Date.now());
  }

  kvUserGone(uid) { this.kvDb().prepare('DELETE FROM user_kv WHERE uid = ?').run(uid); }
}

module.exports = { SyncStore, KV_MAX_LEN: MAX_LEN };
