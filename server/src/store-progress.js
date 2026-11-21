/*
 * Tiến độ trong tài khoản (A5) – bảng user_progress (Giải đố, Storm, chuỗi ngày, huy hiệu: một bản JSON mỗi người, gộp
 * bằng caro/progress-merge.js) và storm_runs (mỗi lượt Puzzle Storm máy chủ đã kiểm: điểm + tuần – bảng xếp hạng tuần).
 * Trộn vào Store.prototype (store.js).
 */
'use strict';
const P = require('../../caro/progress-merge.js');

const RUNS_KEEP_WEEKS = 12; // giữ lượt Storm 12 tuần gần nhất (bảng tuần chỉ cần tuần này + tuần trước)

class ProgressStore {
  /** Tiến độ đã lưu của uid (đã làm sạch) hoặc null. */
  progressGet(uid) {
    const r = this.db.prepare('SELECT data FROM user_progress WHERE uid = ?').get(uid);
    if (!r) return null;
    try { return P.clean(JSON.parse(r.data)); } catch (e) { return null; }
  }

  progressSet(uid, data) {
    this.db.prepare('INSERT INTO user_progress (uid, data, updated) VALUES (?, ?, ?) ON CONFLICT(uid) DO UPDATE SET data = excluded.data, updated = excluded.updated')
      .run(uid, JSON.stringify(P.clean(data)), Date.now());
  }

  /** Ghi một lượt Storm đã kiểm. */
  stormAdd(uid, score, at = Date.now()) {
    const week = P.weekKey(at);
    this.db.prepare('INSERT INTO storm_runs (uid, week, score, at) VALUES (?, ?, ?, ?)').run(uid, week, score, at);
    if (Math.random() < 0.02) this.stormPrune(at);
    return week;
  }

  stormPrune(now = Date.now()) {
    this.db.prepare('DELETE FROM storm_runs WHERE week < ?').run(P.weekKey(now - RUNS_KEEP_WEEKS * 7 * 86400000));
  }

  // Lượt tốt nhất của mỗi người trong tuần: điểm cao nhất, bằng điểm thì lượt sớm nhất (một lượt quét theo chỉ mục
  // storm_runs_best). Bản trước dùng truy vấn con tương quan cho từng dòng – O(n²): 20 000 lượt / tuần mất ~16 giây, chặn
  // cả máy chủ mỗi lần xem bảng / nộp lượt / mở hồ sơ.
  static bestSql() {
    return `SELECT uid, score, at FROM (SELECT uid, score, at, ROW_NUMBER() OVER (PARTITION BY uid ORDER BY score DESC, at ASC) AS rn
      FROM storm_runs WHERE week = ?) WHERE rn = 1`;
  }

  /** Bảng tuần: điểm cao nhất của mỗi người, cao → thấp (bằng điểm: ai đạt trước xếp trên). → [{ uid, score, at }]. */
  stormBoard(week, limit = 50) {
    return this.db.prepare(`${ProgressStore.bestSql()} ORDER BY score DESC, at ASC LIMIT ?`)
      .all(week, limit).map((r) => ({ uid: r.uid, score: r.score, at: r.at }));
  }

  /** Điểm tốt nhất của uid trong tuần (0 nếu chưa chơi) và hạng (null nếu chưa chơi). */
  stormMine(uid, week) {
    const me = this.db.prepare('SELECT score, at FROM storm_runs WHERE week = ? AND uid = ? ORDER BY score DESC, at ASC LIMIT 1').get(week, uid);
    if (!me) return { score: 0, rank: null };
    const above = this.db.prepare(`SELECT COUNT(*) AS n FROM (${ProgressStore.bestSql()}) WHERE score > ? OR (score = ? AND at < ?)`)
      .get(week, me.score, me.score, me.at).n;
    return { score: me.score, rank: above + 1 };
  }

  /** Chỉ điểm tốt nhất của uid trong tuần (hồ sơ – không cần hạng). */
  stormWeekScore(uid, week) {
    const r = this.db.prepare('SELECT MAX(score) AS s FROM storm_runs WHERE week = ? AND uid = ?').get(week, uid);
    return (r && r.s) || 0;
  }

  /** Điểm Storm cao nhất mọi thời (đã kiểm). */
  stormBestEver(uid) {
    const r = this.db.prepare('SELECT MAX(score) AS s FROM storm_runs WHERE uid = ?').get(uid);
    return (r && r.s) || 0;
  }

  /** Xoá tài khoản: tiến độ + lượt Storm (store.js deleteUser). */
  progressUserGone(uid) {
    this.db.prepare('DELETE FROM user_progress WHERE uid = ?').run(uid);
    this.db.prepare('DELETE FROM storm_runs WHERE uid = ?').run(uid);
  }
}

module.exports = { ProgressStore };
