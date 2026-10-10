/*
 * Xem trực tiếp ván đang đấu (như Lichess TV): người xem nhận trạng thái phòng như người chơi nhưng không đánh được.
 * Xem được: phòng công khai, phòng tìm trận nhanh, phòng của giải đấu; trận thách đấu giữa bạn bè thì chỉ bạn bè
 * của một trong hai người xem được. Phòng riêng (mã + mật khẩu) thì không. Người đã bị chặn không xem được.
 *
 * Chống quá tải: mỗi phòng tối đa 200 người xem; mỗi kết nối chỉ xem 1 phòng; trạng thái gửi cho người xem
 * được chuyển JSON một lần cho tất cả; số người xem thay đổi (vào/ra dồn dập) được gom lại, tối đa 1 lần/giây;
 * danh sách "Đang diễn ra" dựng lại tối đa mỗi 3 giây cho mọi người.
 */
'use strict';
const { E } = require('../msg.js');
const { uidOf, userPid } = require('./shared.js');
const R = require('../rating.js');

const MAX_WATCHERS = 200;
const TV_MAX = 20;
const TV_CACHE_MS = 3000;
const WATCH_COUNT_MS = 1000;

class Watch {
  /** pid có được xem phòng này không. */
  canWatch(room, pid) {
    if (!room.players.length || room.has(pid)) return false;
    if (room.players.some((p) => this.isBlocked(p.id, pid))) return false;
    if (room.public || room.quick || room.tour) return true;
    if (room.kind !== 'series') return false; // phòng riêng có mật khẩu
    // Thách đấu bạn bè: chỉ bạn bè của một trong hai người
    const me = uidOf(pid) && this.store.users.get(uidOf(pid));
    return !!me && room.players.some((p) => me.friends.includes(uidOf(p.id)));
  }

  /** Xem phòng theo mã (code) hoặc phòng mà người chơi uid đang đấu. */
  on_watch(conn, { code, uid }) {
    this.throttle(conn, 'watch', 500);
    let room = typeof code === 'string' || typeof code === 'number' ? this.rooms.get(String(code)) : null;
    if (!room && typeof uid === 'string') room = this.roomFor(userPid(uidOf(uid) || uid));
    if (room && room.has(conn.pid)) throw E('watch_own_game');
    if (!room || !this.canWatch(room, conn.pid)) throw E('watch_unavailable'); // không nói rõ: tránh dò phòng riêng
    if (room.watchers && room.watchers.size >= MAX_WATCHERS && conn.watching !== room) throw E('watch_full');
    const mine = this.roomFor(conn.pid);
    if (mine && (mine.active || mine.awaitingNextGame)) throw E('busy_in_game');
    if (mine) { this.leave(conn.pid); conn.send({ t: 'room', room: null }); } // bỏ phòng đang chờ của mình
    this.dequeue(conn.pid);
    if (conn.watching !== room) {
      this.unwatch(conn);
      if (!room.watchers) room.watchers = new Set();
      room.watchers.add(conn);
      conn.watching = room;
      this.watchersChanged(room);
    }
    conn.send({ t: 'room', watch: true, room: this.watchView(this.roomView(room)) });
  }

  on_unwatch(conn) {
    this.unwatch(conn);
    conn.send({ t: 'room', watch: true, room: null });
  }

  /** Thôi xem (rời trang xem, vào ván khác, mất kết nối). */
  unwatch(conn) {
    const room = conn.watching;
    if (!room) return;
    conn.watching = null;
    if (room.watchers && room.watchers.delete(conn)) this.watchersChanged(room);
  }

  /** Số người xem đổi: gom lại, gửi trạng thái mới tối đa 1 lần mỗi giây. */
  watchersChanged(room) {
    if (room.watchTimer || this.closed) return;
    room.watchTimer = setTimeout(() => {
      room.watchTimer = null;
      if (this.rooms.get(room.code) === room && !this.closed) this.broadcastRoom(room);
    }, WATCH_COUNT_MS);
    room.watchTimer.unref?.();
  }

  /** Bản cho người xem: không có mật khẩu phòng. */
  watchView(v) { return { ...v, password: null }; }

  /** Gửi trạng thái phòng cho mọi người xem (chuyển JSON một lần). */
  sendWatchers(room, v) {
    const str = JSON.stringify({ t: 'room', watch: true, room: this.watchView(v) });
    for (const c of room.watchers) c.sendRaw ? c.sendRaw(str) : c.send(JSON.parse(str));
  }

  /** Phòng bị đóng: báo cho người đang xem. */
  dropWatchers(room) {
    clearTimeout(room.watchTimer);
    room.watchTimer = null;
    if (!room.watchers) return;
    for (const c of room.watchers) {
      c.watching = null;
      c.send({ t: 'room', watch: true, room: null });
    }
    room.watchers.clear();
  }

  /** Các ván công khai đang diễn ra, điểm trung bình cao trước (dựng chung, giữ TV_CACHE_MS). */
  tvGames() {
    const now = Date.now();
    if (this.tvCache && now - this.tvCache.at < TV_CACHE_MS) return this.tvCache.list;
    const list = [];
    for (const room of this.rooms.values()) {
      // Danh sách chung chỉ có ván công khai / tìm nhanh / giải (thách đấu bạn bè thì xem từ danh sách bạn bè)
      if (!(room.public || room.quick || room.tour) || !room.full || !room.active) continue;
      const pool = R.poolOf(room);
      const side = (s) => {
        const pid = room.seats[s];
        const u = uidOf(pid) && this.store.users.get(uidOf(pid));
        const r = u ? R.ratingIn(u, pool, now) : null;
        return { id: pid, name: this.nameOf(pid), rating: r ? r.r : null, prov: r ? r.prov : false };
      };
      const x = side(1), o = side(2);
      list.push({
        code: room.code, x, o, moves: room.board.moves.length, timeLimit: room.timeLimit, clock: room.clockSpec,
        opening: room.opening, tour: room.tour ? room.tour.name : null, watchers: room.watchers ? room.watchers.size : 0,
        avg: ((x.rating || 1000) + (o.rating || 1000)) / 2,
      });
    }
    list.sort((a, b) => b.avg - a.avg || b.moves - a.moves);
    this.tvCache = { at: now, list: list.slice(0, TV_MAX * 3).map(({ avg, ...g }) => g) };
    return this.tvCache.list;
  }

  on_tv(conn) {
    // Không giới hạn riêng: danh sách dựng chung (giữ 3 giây), mỗi lần gọi chỉ lọc + cắt; spam đã bị chặn theo tần suất tin nhắn
    const games = this.tvGames().filter((g) => !this.isBlocked(g.x.id, conn.pid) && !this.isBlocked(g.o.id, conn.pid)).slice(0, TV_MAX);
    conn.send({ t: 'tv', games });
  }
}

module.exports = { Watch };
