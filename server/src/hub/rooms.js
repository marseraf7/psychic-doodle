/* Phòng chơi, nước đi, kết thúc ván, tính điểm. Thách đấu, xin hoà, chat nhanh ở challenges.js. */
'use strict';
const crypto = require('crypto');
const { Room, DRAW } = require('../room.js');
const { E, note } = require('../msg.js');
const { MIN_RATED_MOVES, MAX_RATED_PER_PAIR_DAY, cleanTc, userPid, uidOf } = require('./shared.js');
const R = require('../rating.js');
const Perf = require('../perf.js');

const FARM_MOVES = 20; // chống cày điểm: ván lặp lại y hệt 20 nước đầu, cùng người thắng với 1 trong 2 ván trước
const NEW_ACCOUNT_MS = 7 * 24 * 3600 * 1000; // người thua là tài khoản dưới 7 ngày mà đầu hàng / bỏ ván: không tính điểm

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
      if (this.closed || this.rooms.get(room.code) !== room || room.turnEndsAt !== at || !room.active) return;
      room.timeLoss();
      this.afterChange(room);
    }, Math.max(0, at - Date.now()) + 50 + room.lagGrace()); // chờ thêm mức bù trễ: nước đã gửi kịp còn đang trên đường
    room.clockTimer.unref?.();
  }

  newCode() {
    for (;;) {
      const code = String(crypto.randomInt(100000, 1000000));
      if (!this.rooms.has(code)) return code;
    }
  }

  /** tc: { clock, opening, rule } – đồng hồ tổng '3+2' (thay cho timeLimit), luật khai cuộc, luật thắng. */
  makeRoom(kind, bestOf, timeLimit, tc = {}) {
    const c = cleanTc({ timeLimit, clock: tc.clock, opening: tc.opening, rule: tc.rule }); // giá trị lạ -> mặc định
    const room = new Room({
      code: this.newCode(),
      password: String(crypto.randomInt(0, 1000)).padStart(3, '0'),
      kind,
      bestOf,
      timeLimit: c.timeLimit,
      clock: c.clock,
      opening: c.opening,
      rule: c.rule,
      secondMs: this.T.SECOND_MS,
      drawCooldownMs: this.T.DRAW_COOLDOWN_MS,
    });
    room.lagOf = (pid) => this.lagOf(pid); // bù trễ mạng cho đồng hồ (src/lag.js)
    this.rooms.set(room.code, room);
    return room;
  }

  enter(room, pid, side) {
    for (const c of this.byPid.get(pid) || []) this.unwatch(c); // vào ván của mình: thôi xem ván khác
    const uid = uidOf(pid);
    const u = uid && this.store.users.get(uid);
    room.addPlayer({ id: pid, name: this.nameOf(pid), av: u && u.avatar ? u.avatar.v : 0 }, side);
    this.roomOf.set(pid, room.code);
    if (room.full) this.tvCache = null; // ván mới: danh sách "Đang diễn ra" dựng lại ngay
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
    } else if (room.abortable && room.full) {
      // Chưa quá 1 nước: rời phòng = huỷ ván (phòng gặp người lạ thì ghi là bỏ ván)
      room.abort(pid);
      this.settle(room, true);
    } else if (room.inProgress) {
      // Rời phòng khi đang đánh = xử thua (tính trước khi bàn cờ được làm mới).
      room.finish(3 - room.sideOf(pid), 'leave');
      this.settle(room, true);
    }
    room.removePlayer(pid);
    if (!room.players.length) {
      this.rooms.delete(room.code);
      this.tvCache = null;
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

  on_createRoom(conn, { side, timeLimit, clock, opening, rule, public: isPublic }) {
    if (isPublic) this.checkPlayban(conn.pid); // đang bị cấm vì bỏ ván: không mở phòng công khai
    this.unwatch(conn);
    this.leave(conn.pid);
    const room = this.makeRoom('room', 1, timeLimit, { clock, opening, rule });
    room.public = !!isPublic; // phòng công khai: hiện trong sảnh, vào không cần mật khẩu
    if (room.public) room.firstMoveMs = this.T.FIRST_MOVE_MS; // gặp người lạ: có hạn đi nước đầu
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
    if (room.public) this.checkPlayban(conn.pid);
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

  /** Máy khách thấy đồng hồ về 0 mà mãi chưa có trạng thái phòng mới (lỡ tin hết giờ): gửi lại phòng cho riêng kết nối này (L-F6). */
  on_syncRoom(conn) {
    const room = this.roomFor(conn.pid);
    conn.send({ t: 'room', room: room ? this.roomView(room) : null });
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
    if (conn.probe) conn.probe(); // đo lại trễ ngay sau nước đi: lần bù sau dùng số mới
  }

  on_resign(conn) {
    const room = this.inRoom(conn);
    room.resign(conn.pid);
    this.afterChange(room);
  }

  /** Huỷ ván (chưa quá 1 nước). */
  on_abort(conn) {
    const room = this.inRoom(conn);
    room.abort(conn.pid);
    this.afterChange(room);
  }

  /** Cho đối thủ thêm 15 giây (ván có đồng hồ tổng). */
  on_moretime(conn) {
    const room = this.inRoom(conn);
    this.throttle(conn, 'moretime', 1000);
    const opp = room.moretime(conn.pid);
    this.send(opp, note('moretime_given', { name: this.nameOf(conn.pid) }));
    this.broadcastRoom(room);
  }

  /** Xin đi lại (phòng riêng / thách đấu bạn bè). */
  on_takeback(conn) {
    const room = this.inRoom(conn);
    const res = room.offerTakeback(conn.pid);
    if (res === 'pending') return;
    if (res === 'offered') {
      const opp = room.opponentOf(conn.pid);
      if (opp) this.send(opp.id, note('takeback_offered', { name: this.nameOf(conn.pid) }));
    }
    this.broadcastRoom(room);
  }

  on_takebackAnswer(conn, { accept }) {
    const room = this.inRoom(conn);
    const offerer = room.takebackOffer;
    room.answerTakeback(conn.pid, !!accept);
    if (!accept && offerer) this.send(offerer, note('takeback_declined', { name: this.nameOf(conn.pid) }));
    this.broadcastRoom(room);
  }

  /** Berserk (giải Arena có đồng hồ tổng). */
  on_berserk(conn) {
    const room = this.inRoom(conn);
    room.goBerserk(conn.pid);
    this.broadcastRoom(room);
  }

  on_rematch(conn) {
    const room = this.inRoom(conn);
    if (room.tour) throw E('tour_no_rematch');
    // Không còn đối thủ trong phòng (đã rời hẳn, phòng đã tái chế thành phòng chờ): báo ngay cho
    // người bấm thay vì ghi phiếu lặng lẽ — buổi kiểm thử 25/10 người bấm chờ mãi mà không biết
    // đối thủ đã đi, phía kia cũng không nhận được lời mời nào.
    if (!room.opponentOf(conn.pid)) { conn.send(note('rematch_no_opponent')); return; }
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
    room.lastShare = null;
    this.recordRoomOutcomes(room); // chống bỏ ván (playban.js)
    room.lastUnrated = false;
    if (room.reason === 'abort') return this.afterSettle(room, leaving); // ván bị huỷ: không tính gì, không lưu
    const draw = room.winner === DRAW;
    const xPid = room.seats[1], oPid = room.seats[2];
    const U = (pid) => (uidOf(pid) && this.store.users.get(uidOf(pid))) || null;
    const ux = U(xPid), uo = U(oPid);
    const moves = room.board.moves.map((m) => [m.x, m.y]);
    const resultOf = (side) => (draw ? 'draw' : room.winner === side ? 'win' : 'loss');
    // Thống kê thắng / thua / hoà
    for (const [u, side] of [[ux, 1], [uo, 2]]) {
      if (!u) continue;
      u.stats[draw ? 'draws' : room.winner === side ? 'wins' : 'losses']++;
      this.store.touch(u);
    }
    // Đối đầu + điểm: chỉ khi cả hai có tài khoản
    let rated = false;
    if (ux && uo && ux !== uo) {
      this.store.addH2h(ux.id, uo.id, draw ? null : room.winner === 1 ? ux.id : uo.id);
      rated = this.isRatable(room, ux, uo, moves);
      room.lastUnrated = !rated;
    }
    // Lưu ván để xem lại (bỏ qua ván chưa có nước nào)
    if (moves.length) {
      const name = (pid) => room.players.find((p) => p.id === pid)?.name || this.nameOf(pid);
      room.lastShare = this.store.recordGame({
        kind: room.kind, timeLimit: room.timeLimit, clock: room.clockSpec, opening: room.opening, rule: room.rule,
        xId: ux && ux.id, oId: uo && uo.id, xName: name(xPid), oName: name(oPid),
        winner: room.winner, reason: room.reason, moves,
      });
    }
    const pool = R.poolOf(room);
    let d = null;
    if (rated) {
      const before = { x: R.ratingIn(ux, pool).r, o: R.ratingIn(uo, pool).r };
      d = this.rate(ux, uo, draw ? 0.5 : room.winner === 1 ? 1 : 0, pool);
      room.lastDelta = { [xPid]: d.a, [oPid]: d.b };
      this.store.bumpRated(ux.id, uo.id);
      // Thống kê sâu theo loại thời gian (điểm cao / thấp nhất, thắng đẹp nhất, thua tệ nhất, chuỗi)
      const at = Date.now();
      Perf.addRated(ux, pool, { result: resultOf(1), r: ux.pools[pool].r, opp: { name: uo.name, r: before.o }, share: room.lastShare, at });
      Perf.addRated(uo, pool, { result: resultOf(2), r: uo.pools[pool].r, opp: { name: ux.name, r: before.x }, share: room.lastShare, at });
    }
    if (ux && uo && ux !== uo) {
      // Chuỗi thắng / chuỗi thua (ván giữa 2 tài khoản) — trước đây chỉ có chuỗi thắng nên hồ sơ
      // không có "chuỗi thua dài nhất" toàn cục, chỉ có số theo thể loại của ván tính điểm (dễ gây
      // hiểu lầm là 0 dù vừa thua nhiều ván với khách / ván không tính điểm).
      for (const [u, side] of [[ux, 1], [uo, 2]]) {
        if (draw || room.winner !== side) u.wstreak.cur = 0;
        else { u.wstreak.cur++; u.wstreak.best = Math.max(u.wstreak.best, u.wstreak.cur); }
        if (draw || room.winner === side) u.lstreak.cur = 0;
        else { u.lstreak.cur++; u.lstreak.best = Math.max(u.lstreak.best, u.lstreak.cur); }
      }
    }
    // Nhật ký hoạt động 30 ngày
    if (ux) Perf.addActivity(ux, resultOf(1), pool, d ? d.a : null);
    if (uo && uo !== ux) Perf.addActivity(uo, resultOf(2), pool, d ? d.b : null);
    // Thống kê / điểm mới cho người chơi đang online (bạn bè thấy điểm mới trong danh sách)
    for (const u of new Set([ux, uo].filter(Boolean))) {
      const pid = userPid(u.id);
      this.send(pid, { t: 'me', me: this.meView(pid) });
      if (ux && uo) this.sendFriends(u.id);
    }
    this.afterSettle(room, leaving);
  }

  /**
   * Ván giữa 2 tài khoản có tính điểm không. Không tính khi: kết thúc sớm dưới 10 nước (không phải thắng 5 quân),
   * giải không tính điểm, quá 5 ván / cặp / ngày, có đi lại, ván lặp lại y hệt 20 nước đầu và cùng người thắng với
   * 1 trong 2 ván trước giữa hai người, hoặc người thua là tài khoản dưới 7 ngày mà đầu hàng / bỏ ván (chống cày điểm).
   */
  isRatable(room, ux, uo, moves) {
    if (room.reason !== 'win' && moves.length < MIN_RATED_MOVES) return false;
    if (room.tour && (!room.tour.rated || room.tour.cancelled)) return false;
    if (room.takebacks) return false;
    if (this.store.ratedToday(ux.id, uo.id) >= MAX_RATED_PER_PAIR_DAY) return false;
    const draw = room.winner === DRAW;
    const winnerId = draw ? null : room.winner === 1 ? ux.id : uo.id;
    if (!draw && ['resign', 'leave', 'timeout'].includes(room.reason)) {
      const loser = room.winner === 1 ? uo : ux;
      if (loser.created && Date.now() - loser.created < NEW_ACCOUNT_MS) return false;
    }
    const head = JSON.stringify(moves.slice(0, FARM_MOVES));
    return !this.store.pairGames(ux.id, uo.id, 2).some((g) => g.winnerId === winnerId && JSON.stringify(g.moves.slice(0, FARM_MOVES)) === head);
  }

  /** Sau khi ghi kết quả: gửi thông tin mới, cập nhật giải, hẹn ván sau (Bo3/Bo5). */
  afterSettle(room, leaving) {
    // Ván của giải đấu: cập nhật điểm / nhánh đấu (Arena và trận đã phân thắng thua thì không đánh tiếp)
    const tourStop = room.tour ? this.tourOnGame(room, leaving) : false;
    if (!leaving && !tourStop && room.awaitingNextGame) {
      const game = room.gameNo;
      setTimeout(() => {
        if (this.closed || this.rooms.get(room.code) !== room || room.gameNo !== game || !room.awaitingNextGame || room.tourDone) return;
        this.startNext(room);
      }, this.T.NEXT_GAME_MS).unref?.();
    }
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
}

module.exports = { Rooms };
