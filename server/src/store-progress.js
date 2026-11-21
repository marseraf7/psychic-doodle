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

  /** Bảng tuần: điểm cao nhất của mỗi người, cao → thấp (bằng điểm: ai đạt trước xếp trên). → [{ uid, score, at }]. */
  stormBoard(week, limit = 50) {
    return this.db.prepare(`SELECT uid, MAX(score) AS score, MIN(at) AS at FROM storm_runs r WHERE week = ?
      AND score = (SELECT MAX(score) FROM storm_runs WHERE week = r.week AND uid = r.uid) GROUP BY uid ORDER BY score DESC, at ASC LIMIT ?`)
      .all(week, limit).map((r) => ({ uid: r.uid, score: r.score, at: r.at }));
  }

  /** Điểm tốt nhất của uid trong tuần (0 nếu chưa chơi) và hạng (null nếu chưa chơi). */
  stormMine(uid, week) {
    const me = this.db.prepare('SELECT MAX(score) AS score, MIN(at) AS at FROM storm_runs r WHERE week = ? AND uid = ? AND score = (SELECT MAX(score) FROM storm_runs WHERE week = ? AND uid = ?)')
      .get(week, uid, week, uid);
    if (!me || me.score == null) return { score: 0, rank: null };
    const above = this.db.prepare(`SELECT COUNT(*) AS n FROM (SELECT uid, MAX(score) AS s, MIN(at) AS a FROM storm_runs r WHERE week = ?
      AND score = (SELECT MAX(score) FROM storm_runs WHERE week = r.week AND uid = r.uid) GROUP BY uid) WHERE s > ? OR (s = ? AND a < ?)`)
      .get(week, me.score, me.score, me.at).n;
    return { score: me.score, rank: above + 1 };
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
