/*
 * Quản trị viên (tài khoản có tên đăng nhập trong ADMIN_USERNAMES): duyệt câu lạc bộ và giải đấu.
 * Ai cũng tạo được câu lạc bộ / giải đấu, nhưng phải được quản trị viên duyệt mới hiện cho mọi người.
 * Câu lạc bộ / giải đấu do quản trị viên tạo được duyệt luôn.
 */
'use strict';
const { E, note } = require('../msg.js');
const { cleanText, userPid } = require('./shared.js');

class Admin {
  isAdmin(uid) {
    const u = uid && this.store.users.get(uid);
    return !!(u && this.admins.has(u.username));
  }

  requireAdmin(conn) {
    const me = this.requireUser(conn);
    if (!this.isAdmin(me.id)) throw E('admin_only');
    return me;
  }

  /** Số mục đang chờ duyệt. */
  pendingCount() {
    let n = 0;
    for (const c of this.clubs.values()) if (c.status === 'pending') n++;
    for (const t of this.tours.values()) if (t.status === 'pending') n++;
    return n;
  }

  /** Báo số mục chờ duyệt cho các quản trị viên đang online (hiện chấm đỏ trên nút). */
  notifyAdmins(item) {
    const n = this.pendingCount();
    for (const name of this.admins) {
      const u = this.store.byUsername.get(name);
      if (!u) continue;
      const pid = userPid(u.id);
      this.send(pid, { t: 'adminCount', n });
      if (item) this.send(pid, note('admin_new_item', { name: item }));
    }
  }

  on_adminQueue(conn) {
    this.requireAdmin(conn);
    const owner = (uid) => ({ id: uid, name: this.store.users.get(uid)?.name || '?', username: this.store.users.get(uid)?.username || '' });
    conn.send({
      t: 'adminQueue',
      clubs: [...this.clubs.values()].filter((c) => c.status === 'pending')
        .map((c) => ({ id: c.id, name: c.name, desc: c.desc, join: c.join, created: c.created, owner: owner(c.owner) })),
      tours: [...this.tours.values()].filter((t) => t.status === 'pending')
        .map((t) => ({ ...this.tourSummary(t, null), desc: t.desc, created: t.created, owner: owner(t.creator) })),
    });
  }

  /** Duyệt / từ chối. note: lý do (gửi cho người tạo). */
  on_adminReview(conn, { kind, id, approve, note: reason }) {
    this.requireAdmin(conn);
    reason = cleanText(reason, 200);
    if (kind === 'club') {
      const c = this.clubs.get(id);
      if (!c || c.status !== 'pending') throw E('review_gone');
      c.status = approve ? 'approved' : 'rejected';
      c.reviewNote = reason;
      c.reviewedAt = Date.now();
      this.saveClub(c);
      this.send(userPid(c.owner), note(approve ? 'club_approved' : 'club_rejected', { name: c.name, note: reason }));
      this.pushClub(c);
    } else if (kind === 'tour') {
      const t = this.tours.get(id);
      if (!t || t.status !== 'pending') throw E('review_gone');
      if (approve) {
        t.status = 'scheduled';
        // Duyệt muộn, giờ bắt đầu đã sát hoặc đã qua: lùi lại để người chơi kịp đăng ký
        const earliest = Date.now() + this.T.TOUR_MIN_LEAD_MS;
        if (t.startsAt < earliest) t.startsAt = earliest;
      } else t.status = 'rejected';
      t.reviewNote = reason;
      t.reviewedAt = Date.now();
      this.saveTour(t);
      this.send(userPid(t.creator), note(approve ? 'tour_approved' : 'tour_rejected', { name: t.name, note: reason }));
      this.pushTour(t);
    } else throw E('bad_message');
    this.notifyAdmins();
    this.on_adminQueue(conn);
  }
}

module.exports = { Admin };
