/*
 * Thiết bị (như Google / Telegram): người chơi xem tài khoản của mình đang đăng nhập ở đâu và đăng xuất từ xa.
 * Mỗi lần đăng nhập là một phiên (store-sessions.js) ghi kèm nền tảng, trình duyệt, IP, lần hoạt động cuối.
 * Tin nhắn:
 *   devices          {}     → { t: 'devices', list: [{ id, current, online, app, os, browser, model, mobile, ip, created, seen }] }
 *   dropDevice       { id } → đăng xuất thiết bị đó (kết nối đang mở của nó về làm khách ngay) + danh sách mới
 *   dropOtherDevices {}     → đăng xuất mọi thiết bị trừ thiết bị đang dùng + danh sách mới
 * Đổi / đặt lại mật khẩu cũng đăng xuất các thiết bị khác qua kickSessions (auth.js).
 */
'use strict';
const { E, note } = require('../msg.js');
const { userPid } = require('./shared.js');
const { sessionId } = require('../store-sessions.js');
const { parseUA } = require('../useragent.js');

class Devices {
  /** Thiết bị đang dùng phiên có mã id có kết nối nào đang mở không. */
  deviceOnline(uid, id) {
    for (const c of this.byPid.get(userPid(uid)) || []) if (c.token && sessionId(c.token) === id) return true;
    return false;
  }

  devicesMsg(uid, conn) {
    const cur = sessionId(conn.token);
    const list = this.store.sessionsOf(uid).map((s) => {
      const d = parseUA(s.ua, s.platform);
      return {
        id: s.id, current: s.id === cur, online: s.id === cur || this.deviceOnline(uid, s.id),
        app: d.app, os: d.os, browser: d.browser, model: d.model, mobile: d.mobile, ip: s.ip, created: s.created, seen: s.seen,
      };
    });
    // Thiết bị đang dùng lên đầu, rồi tới thiết bị hoạt động gần nhất
    list.sort((a, b) => (b.current - a.current) || (b.seen - a.seen));
    return { t: 'devices', list };
  }

  /**
   * Các kết nối đang mở của tài khoản uid mà phiên bị đăng xuất (drop(id) = true): về làm khách ngay,
   * máy khách xoá token và kết nối lại (không để kết nối cũ tiếp tục dùng tài khoản).
   */
  kickSessions(uid, drop) {
    const pid = userPid(uid);
    for (const c of [...(this.byPid.get(pid) || [])]) {
      if (!c.token || !drop(sessionId(c.token))) continue;
      c.token = null;
      c.send({ t: 'loggedOut', reason: 'revoked' });
      this.detach(c);
    }
    if (!this.isOnline(pid)) this.wentOffline(pid);
  }

  on_devices(conn) {
    const me = this.requireUser(conn);
    conn.send(this.devicesMsg(me.id, conn));
  }

  on_dropDevice(conn, { id }) {
    const me = this.requireUser(conn);
    // Thiết bị đang dùng: dùng nút Đăng xuất như thường
    if (typeof id !== 'string' || id === sessionId(conn.token)) throw E('bad_message');
    if (!this.store.dropSessionById(me.id, id)) throw E('device_not_found');
    this.kickSessions(me.id, (sid) => sid === id);
    conn.send(this.devicesMsg(me.id, conn));
    conn.send(note('device_removed'));
  }

  on_dropOtherDevices(conn) {
    const me = this.requireUser(conn);
    const keep = sessionId(conn.token);
    const n = this.store.sessionsOf(me.id).filter((s) => s.id !== keep).length;
    this.store.dropOtherSessions(me.id, conn.token);
    this.kickSessions(me.id, (sid) => sid !== keep);
    conn.send(this.devicesMsg(me.id, conn));
    conn.send(note('devices_removed', { n }));
  }
}

module.exports = { Devices };
