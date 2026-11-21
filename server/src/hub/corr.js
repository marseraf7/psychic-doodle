/*
 * Chơi theo lượt (C1 – như cờ thư "Correspondence" của Lichess, ý tưởng – không dùng mã của họ): mỗi nước có 1 / 2 / 3 /
 * 5 / 7 ngày. Chỉ tài khoản (không cho khách). Ván lưu trong CSDL (store-corr.js) nên sống qua khởi động lại máy chủ.
 * Luật kiểm như ván trực tiếp (caro/rules.js: ô trống, nước cấm Renju, thắng theo luật đã chọn, trần toạ độ / số nước).
 * Điểm: loại riêng 'corr' (rating.js) khi cả hai đồng ý "Tính điểm", ván có ≥ 2 nước và qua cùng luật chống cày điểm như
 * ván trực tiếp (rooms.js isRatable: có đi lại, kết thúc sớm dưới 10 nước, quá 5 ván / cặp / ngày, tài khoản mới thua bằng
 * đầu hàng / hết giờ, ván lặp lại). Ván cũng vào Lịch sử đấu. Hạng đấu tuần (league.js) và thống kê sâu theo loại (perf.js)
 * chỉ tính ván trực tiếp; Thống kê / Tổng kết (insights.js, recap.js) có ván theo lượt dưới loại "Theo lượt".
 * Tin nhắn (client → máy chủ):
 *   corrCreate  { username, days, rated, rule, side: 'x' | 'o' | 'random' } → mời; người được mời nhận thông báo lưu
 *   corrAnswer  { id, accept }      corrList {}      corrOpen { id }
 *   corrMove    { id, x, y, n }     (n = số nước đã có lúc bấm – gửi lại hai lần không thành hai nước)
 *   corrResign  { id }   corrDraw { id } (xin / đồng ý hoà)   corrTakeback { id } (xin / đồng ý đi lại)   corrDecline { id, what }
 * Máy chủ → client: { t: 'corrGame', game }, { t: 'corrList', games }; thông báo lưu (tour-notes.js pushNote):
 *   corr_invite · corr_turn · corr_end – người offline nhận khi vào lại, chuông Thông báo (topbar-inbox.js).
 * Hết giờ: corrSweep(now) chạy mỗi phút (core.js sweep) – bên tới lượt quá hạn thì thua; chạy lại cũng không xử lý
 * hai lần (CSDL chỉ ghi khi trạng thái còn 'active' – store-corr.js corrPut). Nước / lời xin gửi tới sau hạn chót (trước
 * lượt quét) cũng xử lý hết giờ ngay (corrLate), không cho đánh tiếp.
 * Chống làm phiền: mỗi người chỉ có một lời mời đang chờ tới cùng một người (corr_invite_pending).
 */
'use strict';
const crypto = require('crypto');
const Caro = require('../../../caro/rules.js');
const R = require('../rating.js');
const { E } = require('../msg.js');
const { DRAW, MAX_MOVES } = require('../room.js');
const { userPid } = require('./shared.js');

const DAY = 86400000;
const DAYS = [1, 2, 3, 5, 7];
const INVITE_DAYS = 7; // lời mời không trả lời sau 7 ngày thì hết hạn
const MAX_OPEN = 30; // mỗi người tối đa 30 ván đang chơi + lời mời
const COORD_LIMIT = 512; // như room.js

class Corr {
  /** Ván nhìn từ phía người chơi (client tự biết mình là X hay O qua uid). */
  corrView(g) {
    return {
      id: g.id, x: g.x, o: g.o, xName: g.xName, oName: g.oName, from: g.from, rule: g.rule, days: g.days, rated: g.rated,
      status: g.status, moves: g.moves, created: g.created, updated: g.updated, deadline: g.deadline || null,
      drawOffer: g.drawOffer || null, takebackOffer: g.takebackOffer || null, winner: g.winner || null, reason: g.reason || null,
      share: g.share || null, delta: g.delta || null,
      turn: g.status === 'active' ? (g.moves.length % 2 ? g.o : g.x) : null,
    };
  }

  /** Gửi ván mới nhất cho hai người chơi đang online. */
  corrPush(g) {
    const v = this.corrView(g);
    for (const uid of [g.x, g.o]) this.send(userPid(uid), { t: 'corrGame', game: v });
  }

  corrMine(conn, id) {
    const me = this.requireUser(conn);
    const g = this.store.corrGet(id);
    if (!g || (g.x !== me.id && g.o !== me.id)) throw E('corr_not_found');
    return { me, g };
  }

  /** Đã quá hạn chót mà lượt quét chưa chạy: xử lý hết giờ ngay (như corrSweep) – trả true nếu ván không còn chơi tiếp được. */
  corrLate(g, now = Date.now()) {
    if (!g.deadline || g.deadline >= now || (g.status !== 'active' && g.status !== 'invite')) return false;
    this.corrExpire(g, now);
    return true;
  }

  on_corrCreate(conn, { username, days, rated, rule, side } = {}) {
    const me = this.requireUser(conn);
    this.throttle(conn, 'corrCreate', 2000);
    const u = this.store.byUsername.get(String(username || '').trim().toLowerCase().replace(/^@/, '').slice(0, 20));
    if (!u || u.blocked.includes(me.id) || me.blocked.includes(u.id)) throw E('player_not_found');
    if (u.id === me.id) throw E('corr_self');
    if (!DAYS.includes(Number(days))) throw E('bad_message');
    if (this.store.corrCount(me.id) >= MAX_OPEN || this.store.corrCount(u.id) >= MAX_OPEN) throw E('corr_too_many', { n: MAX_OPEN });
    // Một lời mời đang chờ cho mỗi cặp (người gửi → người nhận): không gửi 30 lời mời chiếm hết chỗ của người khác
    if (this.store.corrInvitesFrom(me.id, u.id)) throw E('corr_invite_pending');
    const meX = side === 'x' ? true : side === 'o' ? false : Math.random() < 0.5;
    const now = Date.now();
    const g = {
      id: crypto.randomBytes(6).toString('hex'), from: me.id, x: meX ? me.id : u.id, o: meX ? u.id : me.id,
      xName: meX ? me.name : u.name, oName: meX ? u.name : me.name, rule: Caro.ruleOf(rule), days: Number(days), rated: rated !== false,
      status: 'invite', moves: [], created: now, updated: now, deadline: now + INVITE_DAYS * DAY,
    };
    this.store.corrPut(g);
    this.pushNote(u.id, { k: 'corr_invite', id: g.id, name: me.name, days: g.days });
    this.corrPush(g);
  }

  on_corrAnswer(conn, { id, accept } = {}) {
    const { me, g } = this.corrMine(conn, id);
    if (g.status !== 'invite' || g.from === me.id || this.corrLate(g)) throw E('corr_not_found');
    const now = Date.now();
    g.updated = now;
    if (accept) { g.status = 'active'; g.lastAt = now; g.deadline = now + g.days * DAY; }
    else { g.status = 'done'; g.reason = 'declined'; g.deadline = null; }
    if (!this.store.corrPut(g, 'invite')) throw E('corr_not_found'); // vừa hết hạn / đã trả lời ở máy khác
    this.pushNote(g.from, { k: accept ? 'corr_turn' : 'corr_end', id: g.id, name: me.name, res: accept ? null : 'declined' });
    this.corrPush(g);
  }

  on_corrList(conn) {
    const me = this.requireUser(conn);
    this.throttle(conn, 'corrList', 300);
    conn.send({ t: 'corrList', games: this.store.corrOf(me.id).map((g) => this.corrView(g)) });
  }

  on_corrOpen(conn, { id } = {}) {
    const { g } = this.corrMine(conn, id);
    conn.send({ t: 'corrGame', game: this.corrView(g) });
  }

  /** Bàn cờ dựng lại từ nước đi (kiểm luật như ván trực tiếp). */
  corrBoard(g) {
    const b = new Caro.Board(g.rule);
    g.moves.forEach(([x, y], i) => b.play(x, y, i % 2 ? Caro.O : Caro.X));
    return b;
  }

  on_corrMove(conn, { id, x, y, n } = {}) {
    const { me, g } = this.corrMine(conn, id);
    if (g.status !== 'active' || this.corrLate(g)) throw E('game_over');
    if (Number.isInteger(n) && n !== g.moves.length) return conn.send({ t: 'corrGame', game: this.corrView(g) }); // nước gửi lại / bàn cũ
    const side = g.moves.length % 2 ? Caro.O : Caro.X;
    if ((side === Caro.X ? g.x : g.o) !== me.id) throw E('not_your_turn');
    if (!Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x) > COORD_LIMIT || Math.abs(y) > COORD_LIMIT) throw E('bad_move');
    const b = this.corrBoard(g);
    if (b.get(x, y) !== Caro.EMPTY) throw E('cell_taken');
    if (Caro.forbidden(b, x, y, side)) throw E('forbidden_move');
    b.play(x, y, side);
    const now = Date.now();
    g.moves.push([x, y]);
    g.drawOffer = g.drawOffer === me.id ? g.drawOffer : null; // đánh tiếp = từ chối lời xin của đối thủ
    g.takebackOffer = null;
    g.lastAt = now;
    g.updated = now;
    g.deadline = now + g.days * DAY;
    if (Caro.checkWin(b, x, y, side)) return this.corrFinish(g, side, 'win');
    if (g.moves.length >= MAX_MOVES) return this.corrFinish(g, DRAW, 'draw');
    if (!this.store.corrPut(g, 'active')) throw E('game_over');
    this.pushNote(me.id === g.x ? g.o : g.x, { k: 'corr_turn', id: g.id, name: me.name });
    this.corrPush(g);
  }

  on_corrResign(conn, { id } = {}) {
    const { me, g } = this.corrMine(conn, id);
    if (g.status !== 'active' || this.corrLate(g)) throw E('cannot_resign');
    this.corrFinish(g, me.id === g.x ? Caro.O : Caro.X, 'resign');
  }

  on_corrDraw(conn, { id } = {}) {
    const { me, g } = this.corrMine(conn, id);
    if (g.status !== 'active' || this.corrLate(g)) throw E('game_over');
    if (g.drawOffer && g.drawOffer !== me.id) return this.corrFinish(g, DRAW, 'draw'); // đối thủ đã xin: đồng ý
    if (g.drawOffer === me.id) return;
    g.drawOffer = me.id;
    g.updated = Date.now();
    if (!this.store.corrPut(g, 'active')) throw E('game_over');
    this.pushNote(me.id === g.x ? g.o : g.x, { k: 'corr_draw', id: g.id, name: me.name });
    this.corrPush(g);
  }

  /** Xin đi lại (người vừa đánh xin rút nước của mình) / đồng ý khi đối thủ xin. */
  on_corrTakeback(conn, { id } = {}) {
    const { me, g } = this.corrMine(conn, id);
    if (g.status !== 'active' || !g.moves.length || this.corrLate(g)) throw E('game_over');
    const lastBy = g.moves.length % 2 ? g.x : g.o; // người đánh nước cuối
    if (g.takebackOffer && g.takebackOffer !== me.id) {
      g.moves.pop(); // đồng ý: bỏ nước cuối của người xin, lượt về họ
      g.takebacks = (g.takebacks || 0) + 1; // có đi lại: không tính điểm (như ván trực tiếp – rooms.js isRatable)
      g.takebackOffer = null;
      g.drawOffer = null;
      g.lastAt = g.updated = Date.now();
      g.deadline = g.lastAt + g.days * DAY;
    } else {
      if (lastBy !== me.id) throw E('corr_takeback_turn');
      g.takebackOffer = me.id;
      g.updated = Date.now();
    }
    if (!this.store.corrPut(g, 'active')) throw E('game_over');
    this.corrPush(g);
  }

  on_corrDecline(conn, { id, what } = {}) {
    const { me, g } = this.corrMine(conn, id);
    if (g.status !== 'active' || this.corrLate(g)) return;
    const k = what === 'draw' ? 'drawOffer' : 'takebackOffer';
    if (!g[k] || g[k] === me.id) return;
    g[k] = null;
    g.updated = Date.now();
    if (this.store.corrPut(g, 'active')) this.corrPush(g);
  }

  /** Kết thúc ván: ghi (chỉ một lần), thống kê, điểm loại 'corr', Lịch sử đấu, báo hai người. */
  corrFinish(g, winner, reason) {
    const was = g.status;
    g.status = 'done';
    g.winner = winner;
    g.reason = reason;
    g.deadline = null;
    g.updated = Date.now();
    g.drawOffer = g.takebackOffer = null;
    // Ghi trạng thái "đã xong" TRƯỚC mọi việc tính điểm: chỉ một nơi ghi được (CSDL kiểm trạng thái cũ) → không tính hai lần
    if (!this.store.corrPut(g, was)) return false;
    const ux = this.store.users.get(g.x), uo = this.store.users.get(g.o);
    const counted = reason !== 'abort' && ux && uo;
    // Luật chống cày điểm của ván trực tiếp (trước khi ghi ván: so với các ván trước của cặp này)
    const rated = !!(counted && g.rated && g.moves.length >= 2 && this.isRatable({ reason, winner, takebacks: g.takebacks || 0, tour: null }, ux, uo, g.moves));
    if (counted && g.moves.length) {
      g.share = this.store.recordGame({ kind: 'corr', timeLimit: 0, rule: g.rule, xId: g.x, oId: g.o, xName: g.xName, oName: g.oName,
        winner, reason, moves: g.moves });
    }
    if (rated) {
      const d = this.rate(ux, uo, winner === DRAW ? 0.5 : winner === Caro.X ? 1 : 0, 'corr');
      g.delta = { x: d.a, o: d.b };
      this.store.bumpRated(ux.id, uo.id); // đếm vào "5 ván / cặp / ngày" chung với ván trực tiếp
    }
    if (g.share || g.delta) this.store.corrPut(g);
    if (counted) {
      for (const [u, side] of [[ux, Caro.X], [uo, Caro.O]]) {
        u.stats[winner === DRAW ? 'draws' : winner === side ? 'wins' : 'losses']++;
        this.store.touch(u);
      }
      this.store.addH2h(ux.id, uo.id, winner === DRAW ? null : winner === Caro.X ? ux.id : uo.id);
      for (const u of [ux, uo]) { const pid = userPid(u.id); this.send(pid, { t: 'me', me: this.meView(pid) }); } // điểm / thống kê mới
    }
    for (const [uid, opp, side] of [[g.x, g.oName, Caro.X], [g.o, g.xName, Caro.O]]) {
      this.pushNote(uid, { k: 'corr_end', id: g.id, name: opp, res: winner === DRAW ? 'draw' : winner === side ? 'win' : 'loss', reason });
    }
    this.corrPush(g);
    return true;
  }

  /** Quét hết giờ (mỗi phút): lời mời quá 7 ngày hết hạn; ván quá hạn thì bên tới lượt thua (chưa đủ 2 nước: huỷ). */
  corrSweep(now = Date.now()) {
    let n = 0;
    for (const id of this.store.corrDue(now)) {
      const g = this.store.corrGet(id);
      if (!g || !g.deadline || g.deadline >= now) continue;
      if (this.corrExpire(g, now)) n++;
    }
    return n;
  }

  /** Ván / lời mời g đã quá hạn: lời mời hết hạn; ván thì bên tới lượt thua (chưa đủ 2 nước / có người đã xoá tài khoản: huỷ). */
  corrExpire(g, now) {
    if (g.status === 'invite') {
      g.status = 'done'; g.reason = 'expired'; g.deadline = null; g.updated = now;
      if (!this.store.corrPut(g, 'invite')) return false;
      this.corrPush(g);
      return true;
    }
    if (g.status !== 'active') return false;
    const gone = !this.store.users.get(g.x) || !this.store.users.get(g.o);
    const loser = g.moves.length % 2 ? Caro.O : Caro.X;
    return gone || g.moves.length < 2 ? this.corrFinish(g, null, 'abort') : this.corrFinish(g, Caro.other(loser), 'timeout');
  }

  /** Vào lại (welcome): báo số ván đang chờ mình (Trang chủ hiện thẻ "Ván đang chờ bạn"). */
  corrWelcome(conn, uid) {
    try {
      const games = this.store.corrOf(uid, 5).map((g) => this.corrView(g));
      if (games.length) conn.send({ t: 'corrList', games });
    } catch (e) { console.error('[corr] welcome', e.message); }
  }
}

module.exports = { Corr, DAYS };
