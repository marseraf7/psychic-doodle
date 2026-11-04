/*
 * Giải đấu Offline (mọi bộ môn – hub/otour*.js): bảng offline_tours. Trộn vào Store.prototype (store.js).
 * Bản ghi giải được ghi gom như giải Caro (dirtyDocs, khoá 'ot:<id>' – store.flush), nhưng KHÔNG nạp hết vào RAM lúc
 * khởi động: hub chỉ giữ giải đang được xem / sửa (nạp theo yêu cầu, bỏ khỏi RAM khi lâu không ai đụng).
 * Cột phụ (owner, status, access, name, updated) để liệt kê / đếm mà không phải đọc cả bản ghi.
 */
'use strict';

const row = (r) => (r ? { ...r } : null); // node:sqlite trả về đối tượng không có prototype

class OTourStore {
  /** Ghi gom (store.flush ghi cùng giao dịch với tài khoản / CLB / giải Caro). */
  saveOTour(t) {
    this.dirtyDocs.set('ot:' + t.id, t);
    this.schedule();
  }

  /** Ghi ngay một giải offline (store.flush gọi). */
  writeOTour(t) {
    this.db.prepare(`INSERT INTO offline_tours (id, slug, owner, status, access, name, created, updated, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, owner = excluded.owner, status = excluded.status, access = excluded.access,
      name = excluded.name, updated = excluded.updated, data = excluded.data`)
      .run(t.id, t.slug || null, t.owner, t.status, t.access, t.name, t.created, t.updated || t.created, JSON.stringify(t));
  }

  /** Đọc một giải theo mã hoặc link riêng (bản đang chờ ghi được ưu tiên). */
  loadOTour(key) {
    const k = String(key || '');
    const pending = this.dirtyDocs.get('ot:' + k);
    if (pending) return pending;
    const r = this.db.prepare('SELECT data FROM offline_tours WHERE id = ? OR slug = ? LIMIT 1').get(k, k.toLowerCase());
    return r ? JSON.parse(r.data) : null;
  }

  /** Link riêng đã có giải khác dùng chưa (trừ giải except). */
  oTourSlugTaken(slug, except = null) {
    for (const [key, d] of this.dirtyDocs) if (key.startsWith('ot:') && d.id !== except && (d.slug === slug || d.id === slug)) return true;
    return !!this.db.prepare('SELECT 1 FROM offline_tours WHERE (slug = ? OR id = ?) AND id <> ? LIMIT 1').get(slug, slug, except || '');
  }

  /** Ghi ngay các giải offline đang chờ (để đếm / liệt kê đúng cả giải vừa tạo / vừa sửa). */
  flushOTours() {
    for (const key of this.dirtyDocs.keys()) if (key.startsWith('ot:')) { this.flush(); return; }
  }

  /** Danh sách tóm tắt: giải của một người (mọi trạng thái) hoặc giải công khai gần đây. */
  listOTours({ owner = null, limit = 50 } = {}) {
    this.flushOTours();
    const rows = owner
      ? this.db.prepare('SELECT id, slug, owner, status, access, name, created, updated FROM offline_tours WHERE owner = ? ORDER BY updated DESC LIMIT ?').all(owner, limit)
      : this.db.prepare("SELECT id, slug, owner, status, access, name, created, updated FROM offline_tours WHERE access = 'public' ORDER BY updated DESC LIMIT ?").all(limit);
    return rows.map(row);
  }

  /** Số giải chưa kết thúc của một người (hạn mức). */
  countActiveOTours(owner) {
    this.flushOTours();
    return this.db.prepare("SELECT COUNT(*) AS n FROM offline_tours WHERE owner = ? AND status <> 'finished'").get(owner).n;
  }

  dropOTour(id) {
    this.dirtyDocs.delete('ot:' + id);
    this.db.prepare('DELETE FROM offline_tours WHERE id = ?').run(id);
  }
}

module.exports = { OTourStore };
