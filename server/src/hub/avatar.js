/*
 * Ảnh đại diện của tài khoản: đổi (ảnh đã thu nhỏ ở trình duyệt, kiểm ở ../avatar.js), xoá.
 * Ảnh phục vụ qua HTTP /api/avatar/<uid> (web.js); người chơi giữ số phiên bản u.avatar.v để trình duyệt
 * tải ảnh mới khi đổi (đường dẫn ?v=…), còn lại dùng ảnh đã lưu trong bộ nhớ đệm.
 */
'use strict';
const { E, note } = require('../msg.js');
const Avatar = require('../avatar.js');
const { userPid } = require('./shared.js');

class AvatarPart {
  avatarDb() {
    return this.avatarStore || (this.avatarStore = new Avatar.AvatarDb(this.store.db));
  }

  /** Ảnh của một tài khoản (cho web.js): { type, buf } hoặc null. */
  avatarOf(uid) {
    const u = typeof uid === 'string' && this.store.users.get(uid);
    return u && u.avatar ? this.avatarDb().get(uid) : null;
  }

  /** Báo cho các kết nối của tài khoản và bạn bè (ảnh trong danh sách bạn bè). */
  avatarChanged(u) {
    this.store.touch(u);
    const pid = userPid(u.id);
    for (const c of this.byPid.get(pid) || []) c.send({ t: 'me', me: this.meView(pid) });
    this.notifyFriends(pid);
  }

  on_avatarSet(conn, { data }) {
    const me = this.requireUser(conn);
    const rules = [['avatar:' + me.id, 10]]; // tối đa 10 lần đổi ảnh / 10 phút
    this.limit(rules);
    this.fail(rules);
    const img = Avatar.parse(data);
    if (img.error) throw E(img.error);
    this.avatarDb().set(me.id, img.type, img.buf);
    // Phiên bản tăng dần (kể cả sau khi xoá rồi đặt lại): đường dẫn ảnh mới, không lấy nhầm ảnh cũ trong bộ nhớ đệm
    me.avatar = { v: Math.max(Date.now(), ((me.avatar && me.avatar.v) || 0) + 1) };
    this.avatarChanged(me);
    conn.send(note('avatar_saved'));
  }

  on_avatarClear(conn) {
    const me = this.requireUser(conn);
    if (!me.avatar) return;
    this.avatarDb().drop(me.id);
    delete me.avatar;
    this.avatarChanged(me);
    conn.send(note('avatar_removed'));
  }
}

module.exports = { AvatarPart };
