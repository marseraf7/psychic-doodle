/*
 * Soát chơi đẹp – lưu trữ (trộn vào Store.prototype – store.js). Bảng tạo lúc cần:
 *   fp_game  (share, x_n, x_ms, o_n, o_ms, at)  – số lần rời tab / mất tiêu điểm và tổng thời gian (ms) của từng bên trong
 *                                                lượt của mình, ghi kèm ván (mã chia sẻ của ván trong bảng games)
 *   fp_queue (id, share, why, at, status, stats, by, done_at) – hàng chờ quản trị viên xem: lý do ('blur' rời tab nhiều,
 *                                                'tour_top' bàn đầu của giải, 'report' bị báo cáo gian lận), kết quả so
 *                                                với máy cờ (stats – JSON do trình duyệt quản trị viên tính), trạng thái
 * Không có xử phạt tự động: chỉ quản trị viên quyết định (hub/fairplay.js).
 */
'use strict';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS fp_game (share TEXT PRIMARY KEY, x_n INTEGER NOT NULL, x_ms INTEGER NOT NULL, o_n INTEGER NOT NULL,
    o_ms INTEGER NOT NULL, at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS fp_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, share TEXT UNIQUE NOT NULL, why TEXT NOT NULL,
    at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open', stats TEXT, by TEXT, done_at INTEGER);
  CREATE INDEX IF NOT EXISTS fp_queue_status ON fp_queue (status, id);
`;
const row = (r) => (r ? { ...r } : null);

class FairplayStore {
  fp() {
    if (!this.fpReady) { this.db.exec(SCHEMA); this.fpReady = true; }
    return this.db;
  }

  fpSaveBlur(share, x, o, at = Date.now()) {
    this.fp().prepare('INSERT OR REPLACE INTO fp_game (share, x_n, x_ms, o_n, o_ms, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(share, x.n, x.ms, o.n, o.ms, at);
  }
  fpBlur(share) { return row(this.fp().prepare('SELECT x_n, x_ms, o_n, o_ms FROM fp_game WHERE share = ?').get(share)); }

  /** Thêm ván vào hàng chờ (đã có thì thêm lý do; đã xem xong mà có lý do mới thì mở lại). */
  fpEnqueue(share, why, at = Date.now()) {
    const have = row(this.fp().prepare('SELECT id, why, status FROM fp_queue WHERE share = ?').get(share));
    if (!have) return Number(this.fp().prepare('INSERT INTO fp_queue (share, why, at) VALUES (?, ?, ?)').run(share, why, at).lastInsertRowid);
    const list = have.why.split(',');
    if (!list.includes(why)) this.fp().prepare("UPDATE fp_queue SET why = ?, status = 'open' WHERE id = ?").run([...list, why].join(','), have.id);
    return have.id;
  }

  /** Hàng chờ theo trạng thái ('open' | 'reviewed' | 'dismissed' | 'all'), mới nhất trước, kèm thông tin ván. */
  fpQueue(status = 'open', limit = 100) {
    const all = status === 'all';
    return this.fp().prepare(`SELECT q.id, q.share, q.why, q.at, q.status, q.stats, q.by, q.done_at, g.x_name, g.o_name, g.x_id, g.o_id,
        g.created, g.rule, g.winner, json_array_length(g.moves) AS n, f.x_n, f.x_ms, f.o_n, f.o_ms
      FROM fp_queue q JOIN games g ON g.share = q.share LEFT JOIN fp_game f ON f.share = q.share
      WHERE (? OR q.status = ?) ORDER BY q.id DESC LIMIT ?`).all(all ? 1 : 0, status, limit).map((r) => {
      const x = row(r);
      try { x.stats = x.stats ? JSON.parse(x.stats) : null; } catch (e) { x.stats = null; }
      return x;
    });
  }
  fpItem(id) { return row(this.fp().prepare('SELECT * FROM fp_queue WHERE id = ?').get(id)); }
  fpSetStats(id, stats) { return this.fp().prepare('UPDATE fp_queue SET stats = ? WHERE id = ?').run(JSON.stringify(stats), id).changes > 0; }
  fpMark(id, status, by, at = Date.now()) {
    return this.fp().prepare('UPDATE fp_queue SET status = ?, by = ?, done_at = ? WHERE id = ?').run(status, by, at, id).changes > 0;
  }
  fpOpenCount() { return this.fp().prepare("SELECT COUNT(*) AS n FROM fp_queue WHERE status = 'open'").get().n; }

  /** Sau khi xoá tài khoản (ván không còn ai giữ đã bị xoá): bỏ các dòng của ván không còn. */
  fpPrune() {
    this.fp().prepare('DELETE FROM fp_game WHERE share NOT IN (SELECT share FROM games)').run();
    this.fp().prepare('DELETE FROM fp_queue WHERE share NOT IN (SELECT share FROM games)').run();
  }
}

module.exports = { FairplayStore };
