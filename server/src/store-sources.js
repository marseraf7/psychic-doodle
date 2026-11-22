/*
 * Nguồn người chơi (trộn vào Store.prototype – store.js; đọc ở hub/sources.js). Bảng tạo lúc cần, KHÔNG lưu IP / UA:
 *   src_first  (pid, day, src, ref)          – lần đầu thấy một danh tính (tài khoản u_… hoặc khách g_…): ngày (UTC), nguồn,
 *                                               mã giới thiệu ?ref= / utm_source của lần mở đầu
 *   src_active (pid, day, games)             – danh tính có hoạt động trong ngày + số ván online đã chơi (giữ 60 ngày – D1 / D7)
 *   src_daily  (day, src, new, active, games) – tổng hằng ngày theo nguồn của kết nối hôm đó (giữ 400 ngày)
 * Ngày là chuỗi 'YYYY-MM-DD' theo giờ UTC.
 */
'use strict';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS src_first (pid TEXT PRIMARY KEY, day TEXT NOT NULL, src TEXT NOT NULL, ref TEXT);
  CREATE INDEX IF NOT EXISTS src_first_day ON src_first (day, src);
  CREATE TABLE IF NOT EXISTS src_active (pid TEXT NOT NULL, day TEXT NOT NULL, games INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (pid, day));
  CREATE INDEX IF NOT EXISTS src_active_day ON src_active (day);
  CREATE TABLE IF NOT EXISTS src_daily (day TEXT NOT NULL, src TEXT NOT NULL, new INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 0,
    games INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, src));
`;
const ACTIVE_KEEP_DAYS = 60;
const DAILY_KEEP_DAYS = 400;

const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (day, n) => dayOf(Date.parse(day + 'T00:00:00Z') + n * 86400000);

class SourcesStore {
  src() {
    if (!this.srcReady) { this.db.exec(SCHEMA); this.srcReady = true; }
    return this.db;
  }

  srcFirst(pid) { const r = this.src().prepare('SELECT day, src, ref FROM src_first WHERE pid = ?').get(pid); return r ? { ...r } : null; }

  /** Một danh tính hoạt động hôm nay qua nguồn src. → { isNew, first } (lần đầu thì ghi src_first, cộng "new"). */
  srcTouch(pid, src, ref, at = Date.now()) {
    const db = this.src();
    const day = dayOf(at);
    let first = this.srcFirst(pid);
    const isNew = !first;
    if (isNew) {
      db.prepare('INSERT OR IGNORE INTO src_first (pid, day, src, ref) VALUES (?, ?, ?, ?)').run(pid, day, src, ref || null);
      first = { day, src, ref: ref || null };
    }
    const fresh = db.prepare('INSERT OR IGNORE INTO src_active (pid, day, games) VALUES (?, ?, 0)').run(pid, day).changes > 0;
    if (isNew || fresh) {
      db.prepare(`INSERT INTO src_daily (day, src, new, active, games) VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(day, src) DO UPDATE SET new = new + excluded.new, active = active + excluded.active`).run(day, src, isNew ? 1 : 0, fresh ? 1 : 0);
    }
    return { isNew, first };
  }

  /** Khách vừa tạo / đăng nhập tài khoản: tài khoản chưa có dòng nào thì nhận nguồn + lịch sử hoạt động của khách. */
  srcAdopt(guestPid, userPidStr) {
    const db = this.src();
    if (!this.srcFirst(guestPid) || this.srcFirst(userPidStr)) return false;
    db.prepare('UPDATE src_first SET pid = ? WHERE pid = ?').run(userPidStr, guestPid);
    db.prepare('UPDATE OR IGNORE src_active SET pid = ? WHERE pid = ?').run(userPidStr, guestPid);
    db.prepare('DELETE FROM src_active WHERE pid = ?').run(guestPid);
    return true;
  }

  /** Một ván online xong: cộng cho danh tính (hôm nay) và cho nguồn của kết nối. */
  srcGame(pid, src, at = Date.now()) {
    const db = this.src();
    const day = dayOf(at);
    db.prepare(`INSERT INTO src_active (pid, day, games) VALUES (?, ?, 1) ON CONFLICT(pid, day) DO UPDATE SET games = games + 1`).run(pid, day);
    db.prepare(`INSERT INTO src_daily (day, src, new, active, games) VALUES (?, ?, 0, 0, 1)
      ON CONFLICT(day, src) DO UPDATE SET games = games + 1`).run(day, src);
  }

  /** Xoá tài khoản: bỏ dấu vết nguồn của danh tính đó. */
  srcForget(pid) {
    const db = this.src();
    db.prepare('DELETE FROM src_first WHERE pid = ?').run(pid);
    db.prepare('DELETE FROM src_active WHERE pid = ?').run(pid);
  }

  /** Dọn dữ liệu cũ (hub/sources.js srcSweep – mỗi ngày một lần, và khi quản trị viên mở bảng). */
  srcPrune(at = Date.now()) {
    const db = this.src();
    db.prepare('DELETE FROM src_active WHERE day < ?').run(addDays(dayOf(at), -ACTIVE_KEEP_DAYS));
    db.prepare('DELETE FROM src_daily WHERE day < ?').run(addDays(dayOf(at), -DAILY_KEEP_DAYS));
  }

  /**
   * Bảng thống kê `days` ngày gần nhất (tính cả hôm nay), theo nguồn lần đầu (nhóm người mới – cohort):
   *   new        – số danh tính mới; d1 / d7: { n: số người của các nhóm đã đủ ngày, back: số người quay lại ĐÚNG ngày thứ 1 / 7 }
   *   games      – số ván các danh tính mới đã chơi trong khoảng; active – số người mới có chơi ít nhất một ván
   * và daily: [{ day, src, new, active, games }] theo nguồn của kết nối hôm đó.
   */
  srcReport(days = 30, at = Date.now()) {
    const db = this.src();
    const today = dayOf(at);
    const from = addDays(today, -(days - 1));
    const rows = db.prepare('SELECT src, day, pid, ref FROM src_first WHERE day >= ?').all(from);
    const act = new Map(); // pid -> Map(day -> games)
    for (const r of db.prepare('SELECT a.pid, a.day, a.games FROM src_active a JOIN src_first f ON f.pid = a.pid WHERE f.day >= ? AND a.day >= ?').all(from, from)) {
      if (!act.has(r.pid)) act.set(r.pid, new Map());
      act.get(r.pid).set(r.day, r.games);
    }
    const by = new Map();
    const refs = new Map();
    for (const r of rows) {
      let s = by.get(r.src);
      if (!s) by.set(r.src, (s = { src: r.src, new: 0, d1: { n: 0, back: 0 }, d7: { n: 0, back: 0 }, games: 0, players: 0 }));
      s.new++;
      const a = act.get(r.pid) || new Map();
      for (const [k, d] of [['d1', 1], ['d7', 7]]) {
        const target = addDays(r.day, d);
        if (target >= today) continue; // nhóm chưa đủ ngày (ngày đích chưa trọn): không tính
        s[k].n++;
        if (a.has(target)) s[k].back++;
      }
      let g = 0;
      for (const n of a.values()) g += n;
      s.games += g;
      if (g) s.players++;
      if (r.ref) { const key = r.src + '\u0000' + r.ref; refs.set(key, (refs.get(key) || 0) + 1); }
    }
    const sources = [...by.values()].sort((x, y) => y.new - x.new || (x.src < y.src ? -1 : 1));
    const refList = [...refs].map(([k, n]) => { const [src, ref] = k.split('\u0000'); return { src, ref, n }; }).sort((x, y) => y.n - x.n).slice(0, 30);
    const daily = db.prepare('SELECT day, src, new, active, games FROM src_daily WHERE day >= ? ORDER BY day DESC, src').all(from).map((r) => ({ ...r }));
    return { from, to: today, days, sources, refs: refList, daily };
  }
}

module.exports = { SourcesStore, dayOf, addDays };
