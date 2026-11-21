/*
 * Ván chơi theo lượt (C1 – "Chơi theo lượt", như cờ thư của Lichess): mỗi ván một dòng trong bảng corr_games, dữ liệu
 * ván (nước đi, lời mời hoà / đi lại, kết quả) là JSON. Ván sống qua khởi động lại máy chủ; việc quét hết giờ đọc theo
 * chỉ mục (status, deadline). Bảng tạo khi mở (CREATE … IF NOT EXISTS – CSDL cũ tự có). Trộn vào Store.prototype (store.js).
 */
'use strict';

const SQL = `
  CREATE TABLE IF NOT EXISTS corr_games (id TEXT PRIMARY KEY, x TEXT NOT NULL, o TEXT NOT NULL, status TEXT NOT NULL,
    deadline INTEGER, updated INTEGER NOT NULL, data TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS corr_games_x ON corr_games (x, status);
  CREATE INDEX IF NOT EXISTS corr_games_o ON corr_games (o, status);
  CREATE INDEX IF NOT EXISTS corr_games_due ON corr_games (status, deadline);
`;

class CorrStore {
  corrDb() {
    if (!this.corrReady) { this.db.exec(SQL); this.corrReady = true; }
    return this.db;
  }

  /** Ván theo id (đã đọc JSON) hoặc null. */
  corrGet(id) {
    if (typeof id !== 'string' || !/^[0-9a-f]{12}$/.test(id)) return null;
    const r = this.corrDb().prepare('SELECT data FROM corr_games WHERE id = ?').get(id);
    if (!r) return null;
    try { return JSON.parse(r.data); } catch (e) { console.error('[store] ván theo lượt hỏng', id); return null; }
  }

  /**
   * Ghi ván. expectStatus: chỉ ghi khi trạng thái trong CSDL còn đúng như vậy (chống ghi đè khi hai việc cùng kết thúc
   * một ván – vd. người chơi đánh đúng lúc việc quét hết giờ chạy). Trả true nếu đã ghi.
   */
  corrPut(g, expectStatus = null) {
    const db = this.corrDb();
    const data = JSON.stringify(g);
    if (expectStatus) {
      const r = db.prepare('UPDATE corr_games SET status = ?, deadline = ?, updated = ?, data = ? WHERE id = ? AND status = ?')
        .run(g.status, g.deadline || null, g.updated, data, g.id, expectStatus);
      return r.changes > 0;
    }
    db.prepare(`INSERT INTO corr_games (id, x, o, status, deadline, updated, data) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, deadline = excluded.deadline, updated = excluded.updated, data = excluded.data`)
      .run(g.id, g.x, g.o, g.status, g.deadline || null, g.updated, data);
    return true;
  }

  /** Ván của uid: đang chơi + lời mời + tối đa `done` ván đã xong gần nhất. */
  corrOf(uid, done = 10) {
    const db = this.corrDb();
    const live = db.prepare(`SELECT data FROM corr_games WHERE x = ? AND status IN ('active', 'invite')
      UNION ALL SELECT data FROM corr_games WHERE o = ? AND status IN ('active', 'invite')`).all(uid, uid);
    const old = db.prepare(`SELECT data FROM (SELECT data, updated FROM corr_games WHERE x = ? AND status = 'done'
      UNION ALL SELECT data, updated FROM corr_games WHERE o = ? AND status = 'done') ORDER BY updated DESC LIMIT ?`).all(uid, uid, done);
    const out = [];
    for (const r of [...live, ...old]) { try { out.push(JSON.parse(r.data)); } catch (e) { /* dòng hỏng: bỏ */ } }
    return out;
  }

  /** Số ván đang chơi + lời mời của uid (giới hạn). */
  corrCount(uid) {
    const db = this.corrDb();
    return db.prepare("SELECT COUNT(*) AS n FROM corr_games WHERE (x = ? OR o = ?) AND status IN ('active', 'invite')").get(uid, uid).n;
  }

  /** Id các ván đã quá hạn (lượt quá hạn / lời mời quá hạn) tính tới now. */
  corrDue(now) {
    return this.corrDb().prepare("SELECT id FROM corr_games WHERE status IN ('active', 'invite') AND deadline IS NOT NULL AND deadline < ? LIMIT 500")
      .all(now).map((r) => r.id);
  }

  /** Xoá tài khoản: xoá lời mời, ván đang chơi của người đó bị huỷ ở lần quét sau (đối thủ không mất điểm). */
  corrUserGone(uid) {
    this.corrDb().prepare("DELETE FROM corr_games WHERE (x = ? OR o = ?) AND status = 'invite'").run(uid, uid);
  }
}

module.exports = { CorrStore };
