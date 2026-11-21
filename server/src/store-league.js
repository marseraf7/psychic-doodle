/*
 * Hạng đấu tuần – lưu trữ (trộn vào Store.prototype – store.js). Bảng tạo lúc cần (CREATE IF NOT EXISTS – CSDL cũ tự có):
 *   league_div   (uid, div, best)                          – bậc hiện tại + bậc cao nhất từng đạt
 *   league_week  (week, uid, div, grp, pts, games, last)   – thành viên nhóm trong tuần
 *   league_pairs (week, a, b, res)                         – kết quả các ván trong tuần giữa hai người (a < b; res: chuỗi
 *                                                            'a' / 'b' / 'd' theo thứ tự), flag = cặp đáng ngờ
 *   league_hist  (uid, week, div, rank, size, outcome)     – kết quả các tuần đã chốt
 *   league_state (k, v)                                    – 'week': tuần đang mở; 'done:<tuần>': tuần đã chốt
 */
'use strict';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS league_div (uid TEXT PRIMARY KEY, div INTEGER NOT NULL, best INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS league_week (week TEXT NOT NULL, uid TEXT NOT NULL, div INTEGER NOT NULL, grp INTEGER NOT NULL,
    pts INTEGER NOT NULL DEFAULT 0, games INTEGER NOT NULL DEFAULT 0, last INTEGER, PRIMARY KEY (week, uid));
  CREATE INDEX IF NOT EXISTS league_week_grp ON league_week (week, div, grp);
  CREATE TABLE IF NOT EXISTS league_pairs (week TEXT NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL, res TEXT NOT NULL DEFAULT '',
    flag INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (week, a, b));
  CREATE TABLE IF NOT EXISTS league_hist (uid TEXT NOT NULL, week TEXT NOT NULL, div INTEGER NOT NULL, rank INTEGER NOT NULL,
    size INTEGER NOT NULL, outcome TEXT NOT NULL, PRIMARY KEY (uid, week));
  CREATE TABLE IF NOT EXISTS league_state (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`;
const row = (r) => (r ? { ...r } : null);

class LeagueStore {
  lg() {
    if (!this.lgReady) { this.db.exec(SCHEMA); this.lgReady = true; }
    return this.db;
  }

  lgState(k) { return this.lg().prepare('SELECT v FROM league_state WHERE k = ?').get(k)?.v ?? null; }
  lgSetState(k, v) { this.lg().prepare('INSERT INTO league_state (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, String(v)); }

  /** Bậc hiện tại của uid (0 = Đồng nếu chưa từng chơi). */
  lgDiv(uid) { return row(this.lg().prepare('SELECT div, best FROM league_div WHERE uid = ?').get(uid)) || { div: 0, best: 0 }; }
  lgSetDiv(uid, div) {
    this.lg().prepare(`INSERT INTO league_div (uid, div, best) VALUES (?, ?, ?)
      ON CONFLICT(uid) DO UPDATE SET div = excluded.div, best = MAX(best, excluded.div)`).run(uid, div, div);
  }

  lgMember(week, uid) { return row(this.lg().prepare('SELECT * FROM league_week WHERE week = ? AND uid = ?').get(week, uid)); }

  /**
   * Vào nhóm của tuần (nếu chưa có): nhóm mới nhất của bậc mình nếu còn chỗ, hết chỗ thì mở nhóm mới. Nhóm lấp lần lượt nên
   * chỉ nhóm cuối có thể còn chỗ (trừ chỗ trống do xoá tài khoản – bỏ qua). Hai lần tra theo chỉ mục league_week_grp
   * (O(log n)); bản trước đếm mọi nhóm của bậc mỗi lần vào – 50 000 người / tuần là O(n²), mất nhiều phút.
   */
  lgJoin(week, uid, size) {
    const have = this.lgMember(week, uid);
    if (have) return have;
    const { div } = this.lgDiv(uid);
    const last = this.lg().prepare('SELECT MAX(grp) AS g FROM league_week WHERE week = ? AND div = ?').get(week, div).g;
    const n = last == null ? 0 : this.lg().prepare('SELECT COUNT(*) AS n FROM league_week WHERE week = ? AND div = ? AND grp = ?').get(week, div, last).n;
    const grp = last == null ? 0 : n < size ? last : last + 1;
    this.lg().prepare('INSERT INTO league_week (week, uid, div, grp) VALUES (?, ?, ?, ?)').run(week, uid, div, grp);
    return this.lgMember(week, uid);
  }

  lgAddPoints(week, uid, pts, at) {
    this.lg().prepare('UPDATE league_week SET pts = pts + ?, games = games + 1, last = CASE WHEN ? > 0 THEN ? ELSE last END WHERE week = ? AND uid = ?')
      .run(pts, pts, at, week, uid);
  }

  lgGroup(week, div, grp) {
    return this.lg().prepare('SELECT * FROM league_week WHERE week = ? AND div = ? AND grp = ?').all(week, div, grp).map(row);
  }
  lgWeekMembers(week) { return this.lg().prepare('SELECT * FROM league_week WHERE week = ?').all(week).map(row); }

  /** Kết quả trong tuần giữa a và b: { res: chuỗi 'a' | 'b' | 'd' (a < b), flag }. */
  lgPair(week, a, b) {
    const [x, y] = a < b ? [a, b] : [b, a];
    return row(this.lg().prepare('SELECT res, flag FROM league_pairs WHERE week = ? AND a = ? AND b = ?').get(week, x, y)) || { res: '', flag: 0 };
  }
  lgPushPair(week, a, b, ch, flag) {
    const [x, y] = a < b ? [a, b] : [b, a];
    this.lg().prepare(`INSERT INTO league_pairs (week, a, b, res, flag) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(week, a, b) DO UPDATE SET res = res || excluded.res, flag = MAX(flag, excluded.flag)`).run(week, x, y, ch, flag ? 1 : 0);
  }

  lgAddHist(h, week) {
    this.lg().prepare('INSERT OR IGNORE INTO league_hist (uid, week, div, rank, size, outcome) VALUES (?, ?, ?, ?, ?, ?)')
      .run(h.uid, week, h.div, h.rank, h.size, h.outcome);
  }
  lgHist(uid, n = 8) { return this.lg().prepare('SELECT week, div, rank, size, outcome FROM league_hist WHERE uid = ? ORDER BY week DESC LIMIT ?').all(uid, n).map(row); }

  /** Dọn dữ liệu tuần cũ (giữ bảng xếp hạng vài tuần gần nhất) và cặp đấu của tuần đã chốt. */
  lgPrune(keepWeek) {
    this.lg().prepare('DELETE FROM league_week WHERE week < ?').run(keepWeek);
    this.lg().prepare('DELETE FROM league_pairs WHERE week < ?').run(keepWeek);
  }

  /** Xoá tài khoản (store.deleteUser gọi). */
  lgUserGone(uid) {
    for (const t of ['league_div', 'league_week', 'league_hist']) this.lg().prepare(`DELETE FROM ${t} WHERE uid = ?`).run(uid);
    this.lg().prepare('DELETE FROM league_pairs WHERE a = ? OR b = ?').run(uid, uid); // quét bảng: 200 000 cặp ~10 ms, chỉ khi xoá tài khoản
  }
}

module.exports = { LeagueStore };
