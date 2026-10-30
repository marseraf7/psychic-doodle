/*
 * Giải đấu – ban tổ chức và vận hành: bắt đầu / huỷ giải, loại người chơi, nhịp chạy giải (tourTick), mở phòng cho ván
 * của giải, nhận kết quả ván, kết thúc giải, người chơi rời phòng / rời máy chủ.
 * Phần chung (tạo, danh sách, đăng ký, dữ liệu gửi client) ở tournaments.js; gộp vào Hub qua hub/index.js.
 */
'use strict';
const { DRAW } = require('../room.js');
const { E, note } = require('../msg.js');
const { userPid, uidOf } = require('./shared.js');

class TourRun {
  // ------------------------------------------------------------ Ban tổ chức
  /** perm: quyền cần có (tournaments.js canManageTour) – đồng ban tổ chức chỉ làm được việc mình được giao. */
  requireManager(conn, id, perm) {
    const me = this.requireUser(conn);
    const t = this.findTour(id, me.id);
    if (!this.canManageTour(t, me.id, perm)) throw E('tour_managers_only');
    return t;
  }

  /** Bắt đầu ngay (không chờ tới giờ). */
  on_tourStart(conn, { id }) {
    const t = this.requireManager(conn, id, 'owner');
    if (t.status !== 'scheduled') throw E('tour_cannot_start');
    // Bắt đầu sớm trước giờ điểm danh: coi như mọi người đã đăng ký đều điểm danh
    if (t.checkin && !this.inCheckin(t)) t.checkinWaived = true;
    this.tourLog(t, this.requireUser(conn).id, 'start_now');
    this.startTour(t);
  }

  on_tourCancel(conn, { id }) {
    const t = this.requireManager(conn, id, 'owner');
    if (!['draft', 'pending', 'scheduled', 'running'].includes(t.status)) throw E('tour_cannot_cancel');
    this.tourLog(t, this.requireUser(conn).id, 'cancelled');
    this.cancelTour(t, 'organizer');
  }

  on_tourKick(conn, { id, uid }) {
    const t = this.requireManager(conn, id, 'players');
    if (!this.player(t, uid)) throw E('player_not_found');
    this.tourLog(t, this.requireUser(conn).id, 'kicked', { name: this.player(t, uid).name });
    this.withdraw(t, uid, true);
    this.send(userPid(uid), note('tour_kicked', { name: t.name }));
  }

  cancelTour(t, reason) {
    const wasPending = t.status === 'pending';
    t.status = 'cancelled';
    t.cancelReason = reason;
    t.finishedAt = Date.now();
    // Ván của giải đang dở vẫn chơi nốt nhưng không tính vào giải nữa
    for (const r of this.rooms.values()) if (r.tour && r.tour.id === t.id) r.tour.cancelled = true;
    this.saveTour(t);
    this.pushTour(t);
    this.notifyPlayers(t, 'tour_cancelled');
    if (wasPending) this.notifyAdmins();
    if (reason === 'too_few') this.tourRecur(t); // định kỳ: kỳ này thiếu người vẫn tạo kỳ sau (ban tổ chức tự huỷ thì dừng chuỗi)
  }

  // ------------------------------------------------------------ Vận hành
  tourTick() {
    if (this.closed) return;
    const now = Date.now();
    for (const t of this.tours.values()) {
      if (t.status === 'scheduled') {
        if (this.inCheckin(t, now) && !t.checkinNotified) {
          t.checkinNotified = true;
          this.saveTour(t);
          this.notifyPlayers(t, 'tour_checkin_open');
          this.pushTour(t);
        }
        if (now >= t.startsAt) this.startTour(t);
      } else if (t.status === 'running') {
        if (t.disputes) this.tickDisputes(t, now);
        if (t.status !== 'running') continue;
        if (t.format === 'arena') this.tickArena(t, now);
        else this.runBracket(t, now);
      }
    }
  }

  /** Người chơi rảnh: online và không đang đánh dở ván nào. */
  available(uid) {
    const pid = userPid(uid);
    if (!this.isOnline(pid)) return false;
    const r = this.roomFor(pid);
    return !r || r.tourDone || (!r.active && !r.awaitingNextGame);
  }

  startTour(t) {
    const now = Date.now();
    t.startedAt = now;
    if (t.format === 'arena') this.startArena(t, now);
    else this.startBracket(t, now);
  }

  /** Mở phòng cho một ván / trận của giải và đưa hai người vào (rời phòng cũ đã xong ván). */
  /** prep(room): chỉnh phòng trước khi gửi cho người chơi (vd. giữ tỉ số khi trận đánh tiếp). */
  openTourRoom(t, kind, bestOf, aUid, bUid, aFirst, extra, prep) {
    const a = userPid(aUid), b = userPid(bUid);
    this.leave(a);
    this.leave(b);
    const room = this.makeRoom(kind, bestOf, t.timeLimit, { clock: t.clock, opening: t.opening, rule: t.rule });
    room.tour = { id: t.id, name: t.name, rated: t.rated, arena: t.format === 'arena', ...extra };
    this.enter(room, a, aFirst ? 1 : 2);
    this.enter(room, b, aFirst ? 2 : 1);
    if (prep) prep(room);
    for (const p of room.players) this.armForfeit(room, p.id);
    this.broadcastRoom(room);
    this.send(a, note('tour_game_start', { name: t.name, opp: this.nameOf(b) }));
    this.send(b, note('tour_game_start', { name: t.name, opp: this.nameOf(a) }));
    for (const pid of [a, b]) this.notifyFriends(pid);
    return room;
  }

  /**
   * Gọi từ settle() khi một ván trong phòng của giải vừa kết thúc.
   * Trả về true nếu không được tự bắt đầu ván tiếp theo trong phòng này.
   */
  tourOnGame(room, leaving) {
    const info = room.tour;
    const t = this.tours.get(info.id);
    if (!t || info.cancelled || t.status !== 'running') { room.tourDone = true; return true; }
    const xUid = uidOf(room.seats[1]), oUid = uidOf(room.seats[2]);
    const winUid = room.winner === DRAW ? null : uidOf(room.seats[room.winner]);
    if (t.format === 'arena') return this.arenaOnGame(t, room, xUid, oUid, winUid);
    return this.bracketOnGame(t, room, winUid);
  }

  finishTour(t) {
    if (t.status === 'finished') return;
    t.status = 'finished';
    t.finishedAt = Date.now();
    this.tickDisputes(t, t.finishedAt); // giải xong: ván mất kết nối chưa xử lý được giữ nguyên kết quả
    t.podium = t.format === 'arena' ? this.arenaPodium(t) : this.bracketPodium(t);
    this.clubAwards(t); // Team Battle / giao hữu CLB: điểm xếp hạng CLB + tủ cúp (club-battle.js)
    this.saveTour(t);
    this.pushTour(t);
    // Thành tích giải trên trang hồ sơ
    for (const p of t.players) {
      const u = !p.withdrawn && this.store.users.get(p.uid);
      if (!u) continue;
      u.tours.played++;
      if (t.podium[0] === p.uid) u.tours.won++;
      if (t.podium.slice(0, 3).includes(p.uid)) u.tours.podium++;
      this.store.touch(u);
    }
    const champ = t.podium[0] && this.player(t, t.podium[0]);
    this.notifyPlayers(t, 'tour_finished', { winner: champ ? champ.name : '—' });
    this.tourRecur(t); // giải định kỳ: tạo giải kế tiếp (tour-tpl.js)
  }

  /**
   * Người chơi rời phòng của giải khi trận chưa xong: xử thua (Arena: thua ván; loại trực tiếp: thua cả trận,
   * kể cả khi đang nghỉ giữa 2 ván). Trả về true nếu đã xử lý.
   */
  tourLeft(room, pid) {
    if (!room.tour || room.tourDone || room.tour.cancelled || !room.full) return false;
    if (room.active) {
      room.finish(3 - room.sideOf(pid), 'leave');
      this.settle(room, true);
      return true;
    }
    if (room.awaitingNextGame) {
      const t = this.tours.get(room.tour.id);
      const found = t && this.findMatch(t, room.tour.match);
      room.tourDone = true;
      if (found && !found.m.done && t.status === 'running') {
        const loser = uidOf(pid);
        this.finishMatch(t, found.st, found.m, loser === found.m.a ? found.m.b : found.m.a);
        this.saveTour(t);
        this.pushTour(t);
      }
      return true;
    }
    return false;
  }

  /** Tài khoản bị xoá: rút khỏi mọi giải chưa xong. */
  tourUserGone(uid) {
    for (const t of this.tours.values()) {
      if ((t.staff || []).some((s) => s.uid === uid)) { t.staff = t.staff.filter((s) => s.uid !== uid); this.saveTour(t); } // bỏ khỏi ban tổ chức
      if (['pending', 'scheduled'].includes(t.status) && t.creator === uid) this.cancelTour(t, 'organizer');
      if (this.player(t, uid)) this.withdraw(t, uid);
    }
  }
}

module.exports = { TourRun };
