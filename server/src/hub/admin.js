/*
 * Quản trị viên (tài khoản có tên đăng nhập trong ADMIN_USERNAMES): duyệt câu lạc bộ và giải đấu.
 * Ai cũng tạo được câu lạc bộ / giải đấu, nhưng phải được quản trị viên duyệt mới hiện cho mọi người.
 * Câu lạc bộ / giải đấu do quản trị viên tạo được duyệt luôn.
 */
'use strict';
const { E, note } = require('../msg.js');
const { cleanText, userPid, uidOf } = require('./shared.js');

class Admin {
  /** Quyền quản trị gắn với ID tài khoản (bất biến), không gắn với tên đăng nhập (H-S4):
   *  tên đăng nhập chỉ là cách cấu hình lúc đầu — ai đăng ký trúng một tên quản trị chưa có
   *  tài khoản thì được gắn quyền ngay lúc đăng ký (và bị ghi log to), nhưng sau đó quyền đi
   *  theo ID: đổi/xoá không chuyển quyền cho người khác (tài khoản quản trị bị chặn tự xoá).
   *  Tên đã gắn cho một ID thì ID khác mang cùng tên (không thể xảy ra khi tên là duy nhất,
   *  nhưng cứ chốt) không bao giờ qua được cửa này. */
  isAdmin(uid) {
    if (!uid) return false;
    if (this.adminIds.has(uid)) return true;
    const u = this.store.users.get(uid);
    if (!u || !this.admins.has(u.username) || this.adminBinds.has(u.username)) return false;
    this.maybeBindAdmin(u); // tên quản trị chưa gắn với ai (vd. vừa thêm vào cấu hình): gắn theo ID người này
    return true;
  }

  /** Lúc khởi động: tra cứu từng tên quản trị trong cấu hình ra ID tài khoản để gắn quyền.
   *  Tên chưa có tài khoản thì cảnh báo to — người đầu tiên đăng ký tên đó sẽ thành quản trị. */
  bindAdmins() {
    for (const name of this.admins) {
      const u = this.store.byUsername.get(name);
      if (!u) {
        console.error(`[hub] CẢNH BÁO: tên quản trị "${name}" chưa có tài khoản — người đầu tiên đăng ký tên này sẽ thành quản trị viên. Hãy tự đăng ký tài khoản này ngay.`);
        continue;
      }
      this.adminBinds.set(name, u.id);
      this.adminIds.add(u.id);
      if (!u.adminBind) { u.adminBind = name; this.store.touch(u); }
    }
  }

  /** Gắn quyền theo ID cho một tài khoản mang tên trong cấu hình quản trị mà tên đó chưa gắn
   *  với ai. Được gọi ở attach() — điểm chung của mọi lần gắn danh tính (hello bằng token,
   *  đăng nhập, đăng ký, Google) — nên tài khoản tạo ngoài luồng đăng ký (khôi phục từ bản
   *  sao lưu, tạo trực tiếp) cũng được gắn ở lần kết nối đầu tiên, trước mọi thao tác quản trị. */
  maybeBindAdmin(u) {
    if (!u || !this.admins.has(u.username) || this.adminBinds.has(u.username)) return;
    this.adminBinds.set(u.username, u.id);
    this.adminIds.add(u.id);
    u.adminBind = u.username;
    this.store.touch(u);
    console.error(`[hub] Quyền quản trị vừa được gắn cho tài khoản mới "${u.username}" (id ${u.id}) theo cấu hình ADMIN_USERNAMES.`);
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
    for (const uid of this.adminIds) {
      const pid = userPid(uid);
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
      this.tourLog(t, uidOf(conn.pid), approve ? 'approved' : 'rejected');
      this.saveTour(t);
      this.send(userPid(t.creator), note(approve ? 'tour_approved' : 'tour_rejected', { name: t.name, note: reason }));
      this.pushTour(t);
    } else throw E('bad_message');
    this.notifyAdmins();
    this.on_adminQueue(conn);
  }
}

module.exports = { Admin };
