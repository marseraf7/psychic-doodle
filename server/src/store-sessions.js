/*
 * Phiên đăng nhập – mỗi lần đăng nhập trên một thiết bị là một phiên (bảng sessions). Trộn vào Store.prototype (store.js).
 * Chỉ lưu mã băm SHA-256 của token: lộ file dữ liệu cũng không dùng được để đăng nhập.
 * Mỗi phiên ghi thêm thông tin thiết bị để người chơi xem mình đang đăng nhập ở đâu (mục Thiết bị – hub/devices.js):
 *   platform ('web' | 'android' | 'ios'), ua (User-Agent của trình duyệt), ip, seen (lần hoạt động cuối).
 * Mã công khai của phiên (id) = 16 ký tự đầu của mã băm – gửi cho máy khách được, không suy ra token.
 */
'use strict';
const crypto = require('crypto');

const SESSION_TTL = 180 * 24 * 3600 * 1000;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
/** Mã công khai của phiên có token này. */
const sessionId = (token) => (typeof token === 'string' && token ? sha256(token).slice(0, 16) : '');
const clip = (s, n) => (typeof s === 'string' ? s.slice(0, n) : null);
// Không cần cập nhật "hoạt động lần cuối" quá dày (mỗi lần kết nối lại)
const SEEN_EVERY = 60 * 1000;

class Sessions {
  /** info: { platform, ua, ip } của thiết bị vừa đăng nhập. */
  newSession(uid, info = {}) {
    const token = crypto.randomBytes(24).toString('base64url');
    const now = Date.now();
    this.q.addSession.run(sha256(token), uid, now, clip(info.platform, 10), clip(info.ua, 300), clip(info.ip, 64), now);
    return token;
  }

  userByToken(token) {
    if (typeof token !== 'string' || !token || token.length > 100) return null;
    const s = this.q.getSession.get(sha256(token));
    if (!s) return null;
    if (Date.now() - s.created > SESSION_TTL) { this.q.dropSession.run(sha256(token)); return null; }
    return this.users.get(s.uid) || null;
  }

  /** Thiết bị dùng lại phiên (mở app, kết nối lại): ghi lần hoạt động, IP và trình duyệt hiện tại. */
  touchSession(token, info = {}) {
    if (typeof token !== 'string' || !token) return;
    const hash = sha256(token);
    const s = this.q.getSession.get(hash);
    if (!s) return;
    const ip = clip(info.ip, 64), ua = clip(info.ua, 300), platform = clip(info.platform, 10);
    if (Date.now() - (s.seen || 0) < SEEN_EVERY && s.ip === ip && s.ua === ua && s.platform === platform) return;
    this.q.touchSession.run(Date.now(), ip, ua, platform, hash);
  }

  /** Các phiên còn hạn của một tài khoản (mới hoạt động trước). */
  sessionsOf(uid) {
    const min = Date.now() - SESSION_TTL;
    return this.q.userSessions.all(uid).filter((s) => s.created >= min).map((s) => ({
      id: s.hash.slice(0, 16), created: s.created, seen: s.seen || s.created, platform: s.platform || '', ua: s.ua || '', ip: s.ip || '',
    }));
  }

  /** Đăng xuất một thiết bị theo mã công khai. Trả về true nếu có phiên đó. */
  dropSessionById(uid, id) {
    if (typeof id !== 'string' || !/^[0-9a-f]{16}$/.test(id)) return false;
    return Number(this.q.dropSessionPrefix.run(uid, id + '%').changes) > 0;
  }

  /** Xoá phiên quá hạn (gọi mỗi phút từ hub.sweep, chỉ chạy thật mỗi ngày một lần). Trả về số phiên đã xoá. */
  pruneSessions(now = Date.now(), force = false) {
    if (!force && now - (this.sessionsPrunedAt || 0) < 24 * 3600 * 1000) return 0;
    this.sessionsPrunedAt = now;
    return Number(this.q.pruneSessions.run(now - SESSION_TTL).changes);
  }

  dropSession(token) {
    if (typeof token === 'string') this.q.dropSession.run(sha256(token));
  }

  /** Đăng xuất mọi thiết bị khác (đổi mật khẩu, hoặc người chơi chọn trong mục Thiết bị). */
  dropOtherSessions(uid, keepToken) {
    this.q.dropUserSessions.run(uid, keepToken ? sha256(keepToken) : '');
  }
}

module.exports = { Sessions, SESSION_TTL, sessionId };
