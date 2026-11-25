/*
 * Giải tuần – lưu trữ (trộn vào Store.prototype – store.js). Bảng tạo lúc cần (CSDL cũ tự có):
 *   weekly_cup (k, v) – 'n': số thứ tự của Giải tuần gần nhất (#N tăng dần, nhớ qua khởi động lại);
 *                       'key:<YYYY-MM-DD>': lần giải đã "giữ chỗ" – JSON { id, n, at, gone? } (id giải; gone = quản trị viên đã
 *                       xoá hẳn giải). Mỗi lần giải chỉ giữ chỗ được một lần (INSERT trong giao dịch BEGIN IMMEDIATE) nên
 *                       gọi nhiều lần / khởi động lại / hai tiến trình cùng CSDL vẫn chỉ một giải.
 */
'use strict';

const SCHEMA = 'CREATE TABLE IF NOT EXISTS weekly_cup (k TEXT PRIMARY KEY, v TEXT NOT NULL);';

class WeeklyStore {
  wcDb() {
    if (!this.wcReady) { this.db.exec(SCHEMA); this.wcReady = true; }
    return this.db;
  }

  wcGet(k) { return this.wcDb().prepare('SELECT v FROM weekly_cup WHERE k = ?').get(k)?.v ?? null; }
  wcSet(k, v) { this.wcDb().prepare('INSERT INTO weekly_cup (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, String(v)); }

  /** Lần giải key đã giữ chỗ: { id, n, at, gone } hoặc null. */
  wcSlot(key) {
    try { return JSON.parse(this.wcGet('key:' + key)); } catch (e) { return null; }
  }

  /**
   * Giữ chỗ lần giải key cho giải id. Được: trả số thứ tự mới (n + 1, đã lưu); lần đó đã có người giữ: trả 0.
   * reuse: { n } – giữ lại chỗ đã mất giải (giải chưa kịp ghi xuống đĩa thì máy chủ tắt) với số cũ.
   */
  wcClaim(key, id, at, reuse = null) {
    const db = this.wcDb();
    db.exec('BEGIN IMMEDIATE');
    try {
      const cur = this.wcSlot(key);
      if (cur && !(reuse && cur.id === reuse.id)) { db.exec('COMMIT'); return 0; }
      const n = reuse ? cur.n : (Number(this.wcGet('n')) || 0) + 1;
      if (!reuse) this.wcSet('n', n);
      this.wcSet('key:' + key, JSON.stringify({ id, n, at }));
      db.exec('COMMIT');
      return n;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  /** Quản trị viên xoá hẳn giải của lần key: đánh dấu để không tạo lại lần đó. */
  wcGone(key) {
    const cur = this.wcSlot(key);
    if (cur) this.wcSet('key:' + key, JSON.stringify({ ...cur, gone: true }));
  }

  /** Trạng thái một giải theo mã (bản đang chờ ghi trước, rồi CSDL) – null nếu không có. */
  tourStatusOf(id) {
    const d = this.dirtyDocs.get('tour:' + id);
    if (d) return d.status;
    return this.db.prepare('SELECT status FROM tours WHERE id = ?').get(id)?.status ?? null;
  }
}

module.exports = { WeeklyStore };
