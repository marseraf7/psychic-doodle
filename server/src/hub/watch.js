/*
 * Xem trực tiếp ván đang đấu (như Lichess TV): người xem nhận trạng thái phòng như người chơi nhưng không đánh được.
 * Xem được: phòng công khai, phòng tìm trận nhanh, phòng của giải đấu, trận thách đấu giữa bạn bè.
 * Phòng riêng (mã + mật khẩu) thì không xem được. Người chơi đã chặn ai thì người đó không xem được ván của họ.
 */
'use strict';
const { E } = require('../msg.js');
const { uidOf, userPid } = require('./shared.js');
const R = require('../rating.js');

const MAX_WATCHERS = 200;
const TV_MAX = 20;

class Watch {
  watchable(room) {
    return !!(room.public || room.quick || room.tour || room.kind === 'series');
  }

  /** Xem phòng theo mã (code) hoặc phòng mà người chơi uid đang đấu. */
  on_watch(conn, { code, uid }) {
    let room = code ? this.rooms.get(String(code)) : null;
    if (!room && uid) room = this.roomFor(userPid(uidOf(uid) || uid));
    if (!room || !this.watchable(room) || !room.players.length) throw E('watch_unavailable');
    if (room.has(conn.pid)) throw E('watch_own_game');
    if (room.players.some((p) => this.isBlocked(p.id, conn.pid))) throw E('watch_unavailable');
    const mine = this.roomFor(conn.pid);
    if (mine && (mine.active || mine.awaitingNextGame)) throw E('busy_in_game');
    if (mine) { this.leave(conn.pid); conn.send({ t: 'room', room: null }); } // bỏ phòng đang chờ của mình
    this.dequeue(conn.pid);
    this.unwatch(conn);
    if (!room.watchers) room.watchers = new Set();
    if (room.watchers.size >= MAX_WATCHERS) throw E('watch_full');
    room.watchers.add(conn);
    conn.watching = room;
    this.broadcastRoom(room); // người chơi thấy số người xem; người xem nhận trạng thái phòng
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
    if (!room.watchers || !room.watchers.delete(conn)) return;
    if (this.rooms.get(room.code) === room) this.broadcastRoom(room);
  }

  /** Phòng bị đóng: báo cho người đang xem. */
  dropWatchers(room) {
    if (!room.watchers) return;
    for (const c of room.watchers) {
      c.watching = null;
      c.send({ t: 'room', watch: true, room: null });
    }
    room.watchers.clear();
  }

  /** Danh sách ván hay đang diễn ra (điểm trung bình cao nhất trước). */
  on_tv(conn) {
    const list = [];
    for (const room of this.rooms.values()) {
      if (!this.watchable(room) || !room.full || !room.active) continue;
      if (room.players.some((p) => this.isBlocked(p.id, conn.pid))) continue;
      const pool = R.poolOf(room);
      const side = (s) => {
        const pid = room.seats[s];
        const u = uidOf(pid) && this.store.users.get(uidOf(pid));
        const r = u ? R.ratingIn(u, pool) : null;
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
    conn.send({ t: 'tv', games: list.slice(0, TV_MAX).map(({ avg, ...g }) => g) });
  }
}

module.exports = { Watch };
