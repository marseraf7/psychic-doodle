/*
 * Các thao tác phụ trong ván (gắn vào Room.prototype trong room.js), học ý tưởng từ Lichess:
 *  - Huỷ ván (abort): khi ván chưa quá 1 nước. Ván bị huỷ không tính thống kê, điểm, không lưu.
 *    Phòng gặp người lạ (tìm nhanh, phòng công khai) có hạn đi nước đầu (firstMoveMs): quá hạn thì ván tự huỷ.
 *  - Thêm giờ (+15 giây) cho đối thủ (ván có đồng hồ tổng, không phải ván giải).
 *  - Xin đi lại (takeback): chỉ phòng riêng / thách đấu bạn bè; ván có đi lại thì không tính điểm.
 *    Bị từ chối (hoặc đối thủ đánh tiếp thay vì trả lời) thì phải chờ như xin hoà (30 giây) mới xin lại được.
 *  - Berserk (giải Arena có đồng hồ tổng): trước nước đầu của mình, tự chia đôi thời gian, không được cộng giờ;
 *    thắng thì thêm 1 điểm giải (xem hub/arena.js).
 */
'use strict';
const Caro = require('../../caro/rules.js');
const { E } = require('./msg.js');

const { X } = Caro;
const DRAW = 3;
const MORETIME_S = 15;

class ExtrasMixin {
  /** Huỷ được không: phòng thường (không phải giải, không phải trận Bo), ván đang diễn ra, chưa quá 1 nước. */
  get abortable() {
    return this.active && this.kind === 'room' && !this.tour && this.board.moves.length < 2;
  }

  /** Huỷ ván. by: người bấm huỷ / người không đi nước đầu kịp. */
  abort(id) {
    if (!this.abortable || !this.sideOf(id)) throw E('cannot_abort');
    this.abortedBy = id;
    this.finish(DRAW, 'abort');
  }

  /** Thời gian (ms) còn lại để đi nước đầu, hoặc null. */
  firstMoveLeft() {
    return this.firstMoveAt && this.active && this.board.moves.length < 2 ? Math.max(0, this.firstMoveAt - Date.now()) : null;
  }

  /** Cho đối thủ thêm 15 giây. Trả về id đối thủ. */
  moretime(id) {
    if (!this.clock || !this.active || !this.sideOf(id) || this.tour) throw E('cannot_moretime');
    const opp = this.opponentOf(id).id;
    const add = MORETIME_S * this.secondMs;
    this.clockLeft[opp] = (this.clockLeft[opp] ?? this.clock.base) + add;
    if (this.clockRun && this.clockRun.id === opp) {
      const end = this.clockRun.since + this.clockLeft[opp];
      this.turnEndsAt = this.firstMoveAt && this.firstMoveAt < end && this.board.moves.length < 2 ? this.firstMoveAt : end;
    }
    this.touch();
    return opp;
  }

  get takebackAllowed() {
    return !this.tour && (this.kind === 'series' || (this.kind === 'room' && !this.public && !this.quick));
  }

  /** Xin đi lại. Trả về 'pending' (đã xin rồi), 'offered', hoặc 'done' (đối thủ cũng đang xin → đi lại luôn). */
  offerTakeback(id) {
    if (!this.takebackAllowed) throw E('cannot_takeback');
    if (!this.sideOf(id) || !this.active || this.phase) throw E('cannot_takeback');
    if (this.takebackOffer === id) return 'pending';
    if (this.takebackOffer) { this.doTakeback(this.takebackOffer); return 'done'; }
    const wait = ((this.takebackWait || {})[id] || 0) - Date.now();
    if (wait > 0) throw E('takeback_wait', { n: Math.ceil(wait / 1000) });
    this.undoCount(id); // kiểm tra có nước để lùi không
    this.takebackOffer = id;
    return 'offered';
  }

  answerTakeback(id, accept) {
    if (!this.takebackOffer || this.takebackOffer === id || !this.active) throw E('no_takeback_offer');
    if (accept) this.doTakeback(this.takebackOffer);
    else this.declineTakeback();
    return accept;
  }

  /** Từ chối lời xin đi lại: người xin phải chờ mới được xin lại (chống bấm liên tục làm phiền đối thủ). */
  declineTakeback() {
    if (!this.takebackOffer) return;
    (this.takebackWait || (this.takebackWait = {}))[this.takebackOffer] = Date.now() + this.drawCooldownMs;
    this.takebackOffer = null;
  }

  /** Số nước cần lùi để tới lượt người xin: 1 nếu họ vừa đi, 2 nếu đối thủ đã đáp lại. */
  undoCount(by) {
    const n = this.actor() === by ? 2 : 1;
    if (this.board.moves.length - n < (this.openingEnd || 0)) throw E('cannot_takeback');
    return n;
  }

  doTakeback(by) {
    const n = this.undoCount(by);
    if (this.clockRun && this.clock) {
      // Dừng đồng hồ đang chạy (không cộng giờ)
      const r = this.clockRun;
      this.clockLeft[r.id] = Math.max(0, (this.clockLeft[r.id] ?? this.clock.base) - (Date.now() - r.since));
      this.clockRun = null;
    }
    for (let i = 0; i < n; i++) this.turn = this.board.undo().p;
    this.takebackOffer = null;
    this.drawOffer = null;
    this.takebacks = (this.takebacks || 0) + 1;
    this.startClock();
    this.touch();
  }

  /** Berserk: trước nước đầu của mình trong ván Arena có đồng hồ tổng. */
  goBerserk(id) {
    const before = this.seats[X] === id ? this.board.moves.length === 0 : this.board.moves.length < 2;
    if (!this.tour || !this.tour.arena || !this.clock || !this.active || !this.sideOf(id) || this.phase || !before || this.berserk.has(id)) {
      throw E('cannot_berserk');
    }
    this.berserk.add(id);
    this.clockLeft[id] = Math.min(this.clockLeft[id] ?? this.clock.base, this.clock.base / 2);
    if (this.clockRun && this.clockRun.id === id) this.turnEndsAt = this.clockRun.since + this.clockLeft[id];
    this.touch();
  }
}

module.exports = { ExtrasMixin };
