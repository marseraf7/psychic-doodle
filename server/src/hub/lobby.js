/*
 * Sảnh: ping (kèm độ trễ máy chủ và số người online / số ván đang đấu – số thật, không thêm bớt) và
 * tìm kỳ thủ theo tên (gợi ý khi gõ ô tìm kiếm).
 */
'use strict';
const { monitorEventLoopDelay } = require('perf_hooks');
const { uidOf } = require('./shared.js');

const COUNT_MS = 5000; // đếm lại số người online / số ván tối đa 5 giây một lần (ping của mọi kết nối dùng chung)
const SEARCH_MS = 200; // mỗi kết nối tìm tối đa 5 lần / giây (gọi dồn thì lặng lẽ bỏ qua – đang gõ, không báo lỗi)
const SEARCH_MAX = 8;

class Lobby {
  /** Số người chơi đang kết nối (tài khoản + khách, mỗi người một lần dù mở nhiều tab) và số ván đang đấu. */
  counts() {
    const now = Date.now();
    if (this.countsAt && now - this.countsAt.t < COUNT_MS) return this.countsAt;
    let players = 0, games = 0;
    for (const set of this.byPid.values()) if (set.size) players++;
    for (const room of this.rooms.values()) if (room.inProgress) games++;
    this.countsAt = { t: now, players, games };
    return this.countsAt;
  }

  /** Độ trễ vòng lặp sự kiện của máy chủ (ms, trung bình gần đây): máy chủ bận thì số này tăng. */
  serverLag() {
    if (!this.loopMon) {
      this.loopMon = monitorEventLoopDelay({ resolution: 20 });
      this.loopMon.enable();
    }
    const h = this.loopMon;
    const ms = h.count ? Math.max(0, h.mean / 1e6 - 20) : 0; // trừ độ phân giải của bộ đo
    if (h.count > 500) h.reset(); // chỉ giữ ~10 giây gần nhất
    return Math.round(ms);
  }

  /** Ping của trình duyệt (10 giây một lần): trả pong để đo PING, kèm độ trễ máy chủ và số liệu sảnh. */
  on_ping(conn) {
    const c = this.counts();
    conn.send({ t: 'pong', lag: this.serverLag(), players: c.players, games: c.games });
  }

  /** true nếu kết nối gọi lệnh key chưa tới ms kể từ lần trước. */
  busy(conn, key, ms) {
    const now = Date.now(), t = conn.busyAt || (conn.busyAt = {});
    if (t[key] && now - t[key] < ms * this.T.THROTTLE_SCALE) return true;
    t[key] = now;
    return false;
  }

  /**
   * Gợi ý kỳ thủ: tên đăng nhập (hoặc tên hiển thị) bắt đầu bằng q (≥ 2 ký tự, bỏ @ ở đầu), tối đa 8 người;
   * khớp tên đăng nhập trước, rồi người đang online. Người đã chặn mình không hiện (không lộ là đã bị chặn).
   */
  on_userSearch(conn, { q, rid } = {}) {
    if (this.busy(conn, 'search', SEARCH_MS)) return;
    const key = String(q || '').slice(0, 30).trim().toLowerCase().replace(/^@/, '');
    const out = { t: 'userSearch', rid: typeof rid === 'number' ? rid : null, q: key, users: [] };
    if (key.length < 2) return conn.send(out);
    const meUid = uidOf(conn.pid);
    const hits = [];
    for (const u of this.store.users.values()) {
      const byUser = u.username.startsWith(key);
      if (!byUser && !String(u.name || '').toLowerCase().startsWith(key)) continue;
      if (meUid && u.blocked.includes(meUid)) continue;
      hits.push({ u, byUser, st: this.status(u.id) });
      if (hits.length >= 200) break; // tên quá chung: đủ để chọn 8 người, không duyệt hết
    }
    const rank = (h) => (h.byUser ? 0 : 2) + (h.st === 'offline' ? 1 : 0);
    hits.sort((a, b) => rank(a) - rank(b) || a.u.username.length - b.u.username.length || a.u.username.localeCompare(b.u.username));
    out.users = hits.slice(0, SEARCH_MAX).map(({ u, st }) => ({ id: u.id, username: u.username, name: u.name, rating: u.rating, status: st, av: u.avatar ? u.avatar.v : 0 }));
    conn.send(out);
  }
}

module.exports = { Lobby };
