/*
 * Tìm trận nhanh và phòng công khai.
 *
 * Tìm trận nhanh: người chơi vào hàng chờ kèm thời gian mỗi nước mong muốn (-1 = sao cũng được).
 * Mỗi nhịp (T.MATCH_TICK_MS) ghép người chờ lâu nhất với người hợp thời gian có Elo gần nhất,
 * trong khoảng chênh lệch cho phép: 150 điểm, nới thêm 25 điểm mỗi giây chờ (của người chờ lâu hơn).
 * Không bao giờ ghép hai người đã chặn nhau. Khách được tìm trận (tính như 1200, ván không tính Elo).
 *
 * Phòng công khai: phòng thường có cờ public, hiện trong sảnh để ai cũng vào được không cần mật khẩu.
 * Sảnh chỉ liệt kê phòng đang chờ (1 người, chủ phòng online); người đang mở sảnh được đẩy danh sách mới.
 */
'use strict';
const { E, note } = require('../msg.js');
const { TIME_LIMITS, uidOf } = require('./shared.js');

const ANY = -1; // thời gian mỗi nước: sao cũng được
const MATCH_BASE = 150;
const MATCH_STEP = 25; // điểm nới thêm mỗi giây chờ
const LOBBY_MAX = 50;

class Matchmaking {
  // ------------------------------------------------------------ tìm trận nhanh
  queueMsg(pid) {
    const e = this.queue.get(pid);
    return e ? { t: 'queue', state: 'searching', since: e.since, timeLimit: e.timeLimit } : { t: 'queue', state: 'idle' };
  }

  ratingOf(pid) {
    const u = uidOf(pid) && this.store.users.get(uidOf(pid));
    return u ? u.rating : 1200;
  }

  on_quickMatch(conn, { timeLimit }) {
    const room = this.roomFor(conn.pid);
    if (room && (room.active || room.awaitingNextGame)) throw E('busy_in_game');
    const tl = TIME_LIMITS.includes(Number(timeLimit)) && timeLimit !== null && timeLimit !== '' ? Number(timeLimit) : ANY;
    const old = this.queue.get(conn.pid);
    this.queue.set(conn.pid, { pid: conn.pid, timeLimit: tl, since: old && old.timeLimit === tl ? old.since : Date.now() });
    this.send(conn.pid, this.queueMsg(conn.pid));
    this.matchTick();
    if (this.queue.size && !this.matchTimer) {
      this.matchTimer = setInterval(() => this.matchTick(), this.T.MATCH_TICK_MS);
      this.matchTimer.unref?.();
    }
  }

  on_quickCancel(conn) {
    this.dequeue(conn.pid);
  }

  /** Bỏ khỏi hàng chờ (mất kết nối, đăng xuất, vào phòng khác, huỷ tìm). */
  dequeue(pid) {
    if (!this.queue.delete(pid)) return;
    this.send(pid, { t: 'queue', state: 'idle' });
    if (!this.queue.size) this.stopMatching();
  }

  stopMatching() {
    clearInterval(this.matchTimer);
    this.matchTimer = null;
  }

  /** Khoảng chênh Elo chấp nhận được với người đã chờ từ thời điểm since. */
  matchWindow(since, now) {
    return MATCH_BASE + MATCH_STEP * Math.floor((now - since) / this.T.SECOND_MS);
  }

  matchTick() {
    if (this.closed) return this.stopMatching();
    const now = Date.now();
    const waiting = [...this.queue.values()].sort((a, b) => a.since - b.since);
    const taken = new Set();
    for (const e of waiting) {
      // Đã vào ván khác trong lúc chờ (vd. Bo3 sang ván sau): bỏ khỏi hàng chờ
      if (this.roomFor(e.pid)?.active) { this.dequeue(e.pid); taken.add(e.pid); }
    }
    for (const a of waiting) {
      if (taken.has(a.pid)) continue;
      const ra = this.ratingOf(a.pid);
      let best = null, bestDiff = Infinity;
      for (const b of waiting) {
        if (b === a || taken.has(b.pid)) continue;
        if (a.timeLimit !== ANY && b.timeLimit !== ANY && a.timeLimit !== b.timeLimit) continue;
        if (this.isBlocked(a.pid, b.pid) || this.isBlocked(b.pid, a.pid)) continue;
        const diff = Math.abs(ra - this.ratingOf(b.pid));
        if (diff > this.matchWindow(Math.min(a.since, b.since), now)) continue;
        if (diff < bestDiff) { best = b; bestDiff = diff; }
      }
      if (!best) continue;
      taken.add(a.pid);
      taken.add(best.pid);
      this.startQuickGame(a, best);
    }
  }

  startQuickGame(a, b) {
    const tl = a.timeLimit !== ANY ? a.timeLimit : b.timeLimit !== ANY ? b.timeLimit : 0;
    this.dequeue(a.pid);
    this.dequeue(b.pid);
    this.leave(a.pid); // bỏ phòng đang chờ (nếu có) – không có ván đang diễn ra vì đã kiểm tra lúc vào hàng chờ
    this.leave(b.pid);
    const room = this.makeRoom('room', 1, tl);
    room.quick = true;
    const [first, second] = Math.random() < 0.5 ? [a.pid, b.pid] : [b.pid, a.pid];
    this.enter(room, first, 1);
    this.enter(room, second, 2);
    for (const p of room.players) this.armForfeit(room, p.id);
    this.broadcastRoom(room);
    this.send(first, note('match_found', { name: this.nameOf(second) }));
    this.send(second, note('match_found', { name: this.nameOf(first) }));
    for (const p of room.players) this.notifyFriends(p.id);
  }

  // ------------------------------------------------------------ phòng công khai
  /** Danh sách phòng công khai đang chờ, nhìn từ người chơi pid (ẩn phòng của người đã chặn / bị chặn). */
  lobbyFor(pid) {
    const list = [];
    for (const room of this.rooms.values()) {
      if (!room.public || room.kind !== 'room' || room.players.length !== 1) continue;
      const host = room.players[0];
      if (!this.isOnline(host.id) || host.id === pid) continue;
      if (this.isBlocked(pid, host.id) || this.isBlocked(host.id, pid)) continue;
      const u = uidOf(host.id) && this.store.users.get(uidOf(host.id));
      list.push({ code: room.code, timeLimit: room.timeLimit, createdAt: room.createdAt, host: { id: host.id, name: host.name, rating: u ? u.rating : null } });
    }
    list.sort((x, y) => y.createdAt - x.createdAt);
    return list.slice(0, LOBBY_MAX);
  }

  on_lobby(conn) {
    conn.send({ t: 'lobby', rooms: this.lobbyFor(conn.pid) });
  }

  /** Mở / đóng sảnh: khi mở, nhận danh sách mới mỗi khi có thay đổi. */
  on_lobbyWatch(conn, { on }) {
    if (on) {
      this.lobbyWatchers.add(conn);
      const rooms = this.lobbyFor(conn.pid);
      conn.lobbySent = JSON.stringify(rooms);
      conn.send({ t: 'lobby', rooms });
    } else this.lobbyWatchers.delete(conn);
  }

  /** Có thay đổi có thể ảnh hưởng tới sảnh: gom lại rồi đẩy cho người đang xem (chỉ khi danh sách khác đi). */
  lobbyChanged() {
    if (this.lobbyTimer || this.closed || !this.lobbyWatchers.size) return;
    this.lobbyTimer = setTimeout(() => {
      this.lobbyTimer = null;
      if (this.closed) return;
      for (const conn of this.lobbyWatchers) {
        if (!conn.pid) continue;
        const rooms = this.lobbyFor(conn.pid);
        const s = JSON.stringify(rooms);
        if (s === conn.lobbySent) continue;
        conn.lobbySent = s;
        conn.send({ t: 'lobby', rooms });
      }
    }, this.T.LOBBY_DEBOUNCE_MS);
    this.lobbyTimer.unref?.();
  }
}

module.exports = { Matchmaking };
