/* Phòng chơi, nước đi, kết thúc ván, thách đấu, Elo, xin hoà, chat nhanh. */
'use strict';
const crypto = require('crypto');
const { Room, DRAW } = require('../room.js');
const { E, note } = require('../msg.js');
const { MIN_RATED_MOVES, MAX_RATED_PER_PAIR_DAY, QUICK, cleanTc, userPid, uidOf } = require('./shared.js');
const R = require('../rating.js');

class Rooms {
  roomFor(pid) {
    const code = this.roomOf.get(pid);
    return code ? this.rooms.get(code) || null : null;
  }

  roomView(room) {
    const v = room.view();
    const pool = R.poolOf(room);
    v.pool = pool;
    for (const p of v.players) {
      p.online = this.isOnline(p.id);
      const u = uidOf(p.id) && this.store.users.get(uidOf(p.id));
      if (u) { const r = R.ratingIn(u, pool); p.rating = r.r; p.prov = r.prov; }
    }
    v.watchers = room.watchers ? room.watchers.size : 0;
    v.delta = room.winner && room.lastDelta ? room.lastDelta : null; // điểm thay đổi sau ván vừa xong
    // Thành tích đối đầu (chỉ khi cả hai có tài khoản), tính theo người cầm X ở ván hiện tại.
    const ux = uidOf(v.seats.x), uo = uidOf(v.seats.o);
    v.h2h = ux && uo ? this.store.h2h(ux, uo) : null;
    v.share = room.lastShare || null; // mã xem lại ván vừa kết thúc
    v.unrated = !!(room.winner && room.lastUnrated); // ván vừa xong giữa 2 tài khoản nhưng không tính Elo
    // Phòng của giải đấu: tên giải, đã xong trận chưa (không tái đấu trong giải)
    v.tour = room.tour ? { id: room.tour.id, name: room.tour.name, arena: !!room.tour.arena, done: !!room.tourDone } : null;
    return v;
  }

  broadcastRoom(room) {
    this.scheduleClock(room);
    const v = this.roomView(room);
    for (const p of room.players) this.send(p.id, { t: 'room', room: v });
    if (room.watchers && room.watchers.size) this.sendWatchers(room, v);
    if (room.public) this.lobbyChanged();
  }

  /** Hẹn giờ hết lượt: người đang tới lượt mà không đánh kịp thì thua. */
  scheduleClock(room) {
    const at = room.turnEndsAt;
    if (room.clockAt === at) return;
    clearTimeout(room.clockTimer);
    room.clockAt = at;
    if (!at) return;
    room.clockTimer = setTimeout(() => {
      if (this.rooms.get(room.code) !== room || room.turnEndsAt !== at || !room.active) return;
      room.timeLoss();
      this.afterChange(room);
    }, Math.max(0, at - Date.now()) + 50);
    room.clockTimer.unref?.();
  }

  newCode() {
    for (;;) {
      const code = String(crypto.randomInt(100000, 1000000));
      if (!this.rooms.has(code)) return code;
    }
  }

  /** tc: { clock, opening } – đồng hồ tổng '3+2' (thay cho timeLimit) và luật khai cuộc. */
  makeRoom(kind, bestOf, timeLimit, tc = {}) {
    const c = cleanTc({ timeLimit, clock: tc.clock, opening: tc.opening }); // giá trị lạ -> mặc định
    const room = new Room({
      code: this.newCode(),
      password: String(crypto.randomInt(0, 1000)).padStart(3, '0'),
      kind,
      bestOf,
      timeLimit: c.timeLimit,
      clock: c.clock,
      opening: c.opening,
      secondMs: this.T.SECOND_MS,
      drawCooldownMs: this.T.DRAW_COOLDOWN_MS,
    });
    this.rooms.set(room.code, room);
    return room;
  }

  enter(room, pid, side) {
    for (const c of this.byPid.get(pid) || []) this.unwatch(c); // vào ván của mình: thôi xem ván khác
    room.addPlayer({ id: pid, name: this.nameOf(pid) }, side);
    this.roomOf.set(pid, room.code);
    for (const p of room.players) this.dequeue(p.id); // đã có ván (hoặc chờ ván): thôi tìm trận nhanh
    // Đã vào ván khác: huỷ lời thách đấu đang chờ để lúc bạn bè nhận lời không bị kéo khỏi ván này.
    for (const inv of [...this.invites.values()]) if (inv.from === pid) this.dropInvite(inv);
  }

  leave(pid) {
    const room = this.roomFor(pid);
    this.roomOf.delete(pid);
    if (!room) return;
    if (this.tourLeft(room, pid)) {
      // Phòng của giải: rời đi khi trận chưa xong = xử thua (xem tournaments.js)
    } else if (room.inProgress) {
      // Rời phòng khi đang đánh = xử thua (tính trước khi bàn cờ được làm mới).
      room.finish(3 - room.sideOf(pid), 'leave');
      this.settle(room, true);
    }
    room.removePlayer(pid);
    if (!room.players.length) {
      this.rooms.delete(room.code);
      this.dropWatchers(room);
      if (room.public) this.lobbyChanged();
    }
    else {
      for (const p of room.players) this.send(p.id, note('left_room', { name: this.nameOf(pid) }));
      this.broadcastRoom(room);
    }
    this.notifyFriends(pid);
    for (const p of room.players) this.notifyFriends(p.id);
  }

  on_createRoom(conn, { side, timeLimit, clock, opening, public: isPublic }) {
    this.unwatch(conn);
    this.leave(conn.pid);
    const room = this.makeRoom('room', 1, timeLimit, { clock, opening });
    room.public = !!isPublic; // phòng công khai: hiện trong sảnh, vào không cần mật khẩu
    this.enter(room, conn.pid, side === 'second' ? 2 : 1);
    this.broadcastRoom(room);
  }

  on_joinRoom(conn, { code, password }) {
    code = String(code || '').trim();
    const room = this.rooms.get(code);
    if (room && room.has(conn.pid)) { this.roomOf.set(conn.pid, code); return this.broadcastRoom(room); }
    code = code.slice(0, 12);
    const rules = [['room:' + conn.ip + ':' + code, 8], ['room-code:' + code, 40], ['room-ip:' + conn.ip, 60]];
    this.limit(rules);
    if (!room || room.kind !== 'room' || room.tour) { this.fail(rules); throw E('room_not_found', { code }); }
    const pw = String(password || '').trim();
    // Không gửi mật khẩu (mở link mời, thử vào thẳng phòng công khai) thì không tính là thử sai
    if (!room.public && pw !== room.password) { if (pw) this.fail(rules); throw E('wrong_room_password'); }
    if (room.full) throw E('room_full');
    this.unwatch(conn);
    const host = room.players[0];
    if (room.public && host && (this.isBlocked(host.id, conn.pid) || this.isBlocked(conn.pid, host.id))) throw E('blocked');
    this.leave(conn.pid);
    this.enter(room, conn.pid);
    for (const p of room.players) this.armForfeit(room, p.id); // chủ phòng có thể đã offline
    this.broadcastRoom(room);
    for (const p of room.players) this.notifyFriends(p.id);
    const opp = room.opponentOf(conn.pid);
    if (opp) this.send(opp.id, note('joined_room', { name: this.nameOf(conn.pid) }));
  }

  on_leaveRoom(conn) {
    this.leave(conn.pid);
    conn.send({ t: 'room', room: null });
  }

  inRoom(conn) {
    const room = this.roomFor(conn.pid);
    if (!room) throw E('not_in_room');
    return room;
  }

  on_swap(conn, { choice }) {
    const room = this.inRoom(conn);
    room.swapChoose(conn.pid, choice);
    this.afterChange(room);
  }

  on_move(conn, { x, y }) {
    const room = this.inRoom(conn);
    room.move(conn.pid, x, y);
    this.afterChange(room);
  }

  on_resign(conn) {
    const room = this.inRoom(conn);
    room.resign(conn.pid);
    this.afterChange(room);
  }

  on_rematch(conn) {
    const room = this.inRoom(conn);
    if (room.tour) throw E('tour_no_rematch');
    const started = room.voteRematch(conn.pid);
    if (started) for (const p of room.players) this.dequeue(p.id);
    else {
      const opp = room.opponentOf(conn.pid);
      if (opp) this.send(opp.id, note('wants_rematch', { name: this.nameOf(conn.pid) }));
    }
    this.broadcastRoom(room);
  }

  afterChange(room) {
    this.settle(room, false);
    this.broadcastRoom(room);
  }

  /** Khi một ván vừa kết thúc: cộng thống kê và hẹn giờ ván tiếp theo (Bo3/Bo5). */
  settle(room, leaving) {
    if (!room.winner || room.settled === room.gameNo + ':' + room.board.moves.length) return;
    room.settled = room.gameNo + ':' + room.board.moves.length;
    room.lastDelta = null; // điểm thay đổi chỉ hiện cho ván vừa xong (ván với khách thì không có)
    const draw = room.winner === DRAW;
    const xPid = room.seats[1], oPid = room.seats[2];
    const U = (pid) => (uidOf(pid) && this.store.users.get(uidOf(pid))) || null;
    const ux = U(xPid), uo = U(oPid);
    // Thống kê thắng / thua / hoà
    for (const [u, side] of [[ux, 1], [uo, 2]]) {
      if (!u) continue;
      u.stats[draw ? 'draws' : room.winner === side ? 'wins' : 'losses']++;
      this.store.touch(u);
    }
    // Đối đầu + Elo: chỉ khi cả hai có tài khoản
    room.lastUnrated = false;
    if (ux && uo && ux !== uo) {
      this.store.addH2h(ux.id, uo.id, draw ? null : room.winner === 1 ? ux.id : uo.id);
      const tooShort = room.reason !== 'win' && room.board.moves.length < MIN_RATED_MOVES;
      const tourUnrated = room.tour && (!room.tour.rated || room.tour.cancelled); // giải không tính Elo
      if (tooShort || tourUnrated || this.store.ratedToday(ux.id, uo.id) >= MAX_RATED_PER_PAIR_DAY) room.lastUnrated = true;
      else {
        const d = this.rate(ux, uo, draw ? 0.5 : room.winner === 1 ? 1 : 0, R.poolOf(room));
        room.lastDelta = { [xPid]: d.a, [oPid]: d.b };
        this.store.bumpRated(ux.id, uo.id);
      }
      // Chuỗi thắng (ván giữa 2 tài khoản)
      for (const [u, side] of [[ux, 1], [uo, 2]]) {
        if (draw || room.winner !== side) u.wstreak.cur = 0;
        else { u.wstreak.cur++; u.wstreak.best = Math.max(u.wstreak.best, u.wstreak.cur); }
      }
    }
    // Lưu ván để xem lại (bỏ qua ván chưa có nước nào)
    if (room.board.moves.length) {
      const name = (pid) => room.players.find((p) => p.id === pid)?.name || this.nameOf(pid);
      room.lastShare = this.store.recordGame({
        kind: room.kind, timeLimit: room.timeLimit, clock: room.clockSpec, opening: room.opening,
        xId: ux && ux.id, oId: uo && uo.id, xName: name(xPid), oName: name(oPid),
        winner: room.winner, reason: room.reason,
        moves: room.board.moves.map((m) => [m.x, m.y]),
      });
    }
    // Thống kê / điểm mới cho người chơi đang online (bạn bè thấy điểm mới trong danh sách)
    for (const u of new Set([ux, uo].filter(Boolean))) {
      const pid = userPid(u.id);
      this.send(pid, { t: 'me', me: this.meView(pid) });
      if (ux && uo) this.sendFriends(u.id);
    }
    // Ván của giải đấu: cập nhật điểm / nhánh đấu (Arena và trận đã phân thắng thua thì không đánh tiếp)
    const tourStop = room.tour ? this.tourOnGame(room, leaving) : false;
    if (!leaving && !tourStop && room.awaitingNextGame) {
      const game = room.gameNo;
      setTimeout(() => {
        if (this.rooms.get(room.code) !== room || room.gameNo !== game || !room.awaitingNextGame || room.tourDone) return;
        this.startNext(room);
      }, this.T.NEXT_GAME_MS).unref?.();
    }
  }

  inviteMsg(inv) {
    return { t: 'invite', invite: { id: inv.id, from: { id: inv.from, name: this.nameOf(inv.from) }, bestOf: inv.bestOf, first: inv.first, timeLimit: inv.timeLimit, clock: inv.clock, opening: inv.opening } };
  }

  dropInvite(inv, reason) {
    if (!this.invites.delete(inv.id)) return;
    clearTimeout(inv.timer);
    this.send(inv.to, { t: 'inviteGone', id: inv.id });
    this.send(inv.from, { t: 'inviteGone', id: inv.id });
    if (reason) this.send(inv.from, note(...reason));
  }

  on_challenge(conn, { to, bestOf, first, timeLimit, clock, opening }) {
    const me = this.requireUser(conn);
    const friend = this.store.users.get(to);
    if (!friend || !me.friends.includes(friend.id)) throw E('challenge_friends_only');
    if (me.blocked.includes(friend.id) || friend.blocked.includes(me.id)) throw E('blocked');
    const toPid = userPid(friend.id);
    if (!this.isOnline(toPid)) throw E('friend_offline', { name: friend.name });
    if (this.roomFor(conn.pid)?.active) throw E('busy_in_game');
    bestOf = [1, 3, 5].includes(Number(bestOf)) ? Number(bestOf) : 1;
    first = ['me', 'them', 'random'].includes(first) ? first : 'random';
    const tc = cleanTc({ timeLimit, clock, opening });
    timeLimit = tc.timeLimit;
    for (const inv of [...this.invites.values()]) if (inv.from === conn.pid) this.dropInvite(inv);
    const inv = { id: crypto.randomBytes(6).toString('hex'), from: conn.pid, to: toPid, bestOf, first, timeLimit, clock: tc.clock, opening: tc.opening };
    inv.timer = setTimeout(() => this.dropInvite(inv, ['invite_no_answer', { name: friend.name }]), this.T.INVITE_TTL_MS);
    inv.timer.unref?.();
    this.invites.set(inv.id, inv);
    this.send(toPid, this.inviteMsg(inv));
    this.send(conn.pid, { t: 'inviteSent', invite: { id: inv.id, to: { id: toPid, name: friend.name }, bestOf, first, timeLimit, clock: inv.clock, opening: inv.opening } });
  }

  on_challengeCancel(conn, { id }) {
    const inv = this.invites.get(id);
    if (inv && inv.from === conn.pid) this.dropInvite(inv);
  }

  on_challengeRespond(conn, { id, accept }) {
    const inv = this.invites.get(id);
    if (!inv || inv.to !== conn.pid) throw E('invite_expired');
    this.dropInvite(inv);
    if (!accept) {
      this.send(inv.from, note('challenge_declined', { name: this.nameOf(conn.pid) }));
      return;
    }
    if (!this.isOnline(inv.from)) throw E('inviter_offline');
    this.leave(inv.from);
    this.leave(inv.to);
    const room = this.makeRoom('series', inv.bestOf, inv.timeLimit, { clock: inv.clock, opening: inv.opening });
    let challengerFirst = inv.first === 'me' ? true : inv.first === 'them' ? false : crypto.randomInt(2) === 0;
    this.enter(room, inv.from, challengerFirst ? 1 : 2);
    this.enter(room, inv.to, challengerFirst ? 2 : 1);
    this.broadcastRoom(room);
    this.notifyFriends(inv.from);
    this.notifyFriends(inv.to);
  }

  /** Cập nhật điểm Glicko-2 trong loại thời gian pool; sa = kết quả của a (1 thắng, 0.5 hoà, 0 thua). Trả về điểm thay đổi. */
  rate(a, b, sa, pool = 'rapid') {
    const d = R.rateGame(a, b, pool, sa);
    a.rated++;
    b.rated++;
    for (const u of [a, b]) this.store.addRatingPoint(u.id, pool, u.pools[pool].r);
    this.ratingsChanged(); // bảng xếp hạng dựng lại
    this.store.touch(a, b);
    return d;
  }

  on_drawOffer(conn) {
    const room = this.inRoom(conn);
    const res = room.offerDraw(conn.pid);
    if (res === 'pending') return; // đã xin rồi, không làm phiền đối thủ thêm
    if (res === 'offered') {
      const opp = room.opponentOf(conn.pid);
      if (opp) this.send(opp.id, note('draw_offered', { name: this.nameOf(conn.pid) }));
    }
    this.afterChange(room);
  }

  on_drawAnswer(conn, { accept }) {
    const room = this.inRoom(conn);
    const offerer = room.drawOffer;
    room.answerDraw(conn.pid, !!accept);
    if (!accept && offerer) this.send(offerer, note('draw_declined', { name: this.nameOf(conn.pid) }));
    this.afterChange(room);
  }

  /** Câu chat nhanh có sẵn: gửi mã câu, mỗi người tự dịch sang ngôn ngữ của mình. */
  on_quick(conn, { id }) {
    const room = this.inRoom(conn);
    if (!QUICK.includes(id)) throw E('bad_message');
    const now = Date.now();
    if (now - (conn.lastQuick || 0) < 1200) throw E('too_fast');
    conn.lastQuick = now;
    const opp = room.opponentOf(conn.pid);
    if (opp && !this.isBlocked(opp.id, conn.pid)) this.send(opp.id, { t: 'quick', from: conn.pid, id });
  }
}

module.exports = { Rooms };
