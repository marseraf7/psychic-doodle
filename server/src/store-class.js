/*
 * Lớp học / Nghiên cứu (C2): mỗi bài nghiên cứu một dòng trong bảng class_studies (JSON: tiêu đề, mô tả, các chương với cây
 * nước đi – caro/class-tree.js). Bảng tạo khi dùng lần đầu (CREATE … IF NOT EXISTS). Trộn vào Store.prototype (store.js).
 */
'use strict';

const SQL = `
  CREATE TABLE IF NOT EXISTS class_studies (id TEXT PRIMARY KEY, owner TEXT NOT NULL, vis TEXT NOT NULL, club TEXT,
    updated INTEGER NOT NULL, data TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS class_studies_owner ON class_studies (owner, updated);
  CREATE INDEX IF NOT EXISTS class_studies_vis ON class_studies (vis, updated);
  CREATE INDEX IF NOT EXISTS class_studies_club ON class_studies (club, updated);
`;

class ClassStore {
  clsDb() {
    if (!this.clsReady) { this.db.exec(SQL); this.clsReady = true; }
    return this.db;
  }

  clsGet(id) {
    if (typeof id !== 'string' || !/^[0-9a-f]{12}$/.test(id)) return null;
    const r = this.clsDb().prepare('SELECT data FROM class_studies WHERE id = ?').get(id);
    if (!r) return null;
    try { return JSON.parse(r.data); } catch (e) { console.error('[store] bài nghiên cứu hỏng', id); return null; }
  }

  clsPut(s) {
    this.clsDb().prepare(`INSERT INTO class_studies (id, owner, vis, club, updated, data) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET vis = excluded.vis, club = excluded.club, updated = excluded.updated, data = excluded.data`)
      .run(s.id, s.owner, s.vis, s.club || null, s.updated, JSON.stringify(s));
  }

  clsDel(id) { this.clsDb().prepare('DELETE FROM class_studies WHERE id = ?').run(id); }

  /** Danh sách tóm tắt (không có cây nước): của uid, công khai gần đây, của các CLB trong clubs. */
  clsSummaries(uid, clubs = [], limit = 30) {
    const db = this.clsDb();
    const pick = (rows) => rows.map((r) => { try { const s = JSON.parse(r.data); return { id: s.id, title: s.title, ownerName: s.ownerName, owner: s.owner, vis: s.vis, club: s.club || null, clubName: s.clubName || null, chapters: s.chapters.length, updated: s.updated }; } catch (e) { return null; } }).filter(Boolean);
    const mine = uid ? pick(db.prepare('SELECT data FROM class_studies WHERE owner = ? ORDER BY updated DESC LIMIT 100').all(uid)) : [];
    const pub = pick(db.prepare("SELECT data FROM class_studies WHERE vis = 'public' ORDER BY updated DESC LIMIT ?").all(limit));
    const club = clubs.length ? pick(db.prepare(`SELECT data FROM class_studies WHERE club IN (${clubs.map(() => '?').join(',')}) ORDER BY updated DESC LIMIT ?`).all(...clubs, limit)) : [];
    return { mine, pub, club };
  }

  clsCount(uid) { return this.clsDb().prepare('SELECT COUNT(*) AS n FROM class_studies WHERE owner = ?').get(uid).n; }

  /** Xoá tài khoản: xoá các bài nghiên cứu của người đó. */
  clsUserGone(uid) { this.clsDb().prepare('DELETE FROM class_studies WHERE owner = ?').run(uid); }
}

module.exports = { ClassStore };
