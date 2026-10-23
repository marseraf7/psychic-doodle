/*
 * Đồng hồ của phòng chơi (gắn vào Room.prototype trong room.js):
 *  - giới hạn mỗi nước (timeLimit giây), hoặc
 *  - đồng hồ tổng + cộng giờ (clock '3+2'): mỗi người một quỹ thời gian, giữ theo id người chơi
 *    (Swap2 đổi bên giữa chừng vẫn đúng), trừ khi người đó nghĩ, cộng giờ sau mỗi lần hành động.
 * Máy chủ hẹn giờ theo turnEndsAt (rooms.js → scheduleClock); hết giờ thì người phải hành động thua.
 * Bù trễ mạng (src/lag.js, Issue #110): mỗi nước trả lại thời gian khứ hồi máy chủ đã đo của người vừa đi (có trần);
 * hẹn giờ hết giờ cũng chờ thêm đúng mức đó để nước đã gửi kịp mà tới muộn không bị xử thua.
 */
'use strict';
const Caro = require('../../caro/rules.js');
const { lagCaps } = require('./lag.js');

const { X, O } = Caro;

class ClockMixin {
  /** Bắt đầu tính giờ cho người phải hành động (giới hạn mỗi nước hoặc đồng hồ tổng). */
  startClock() {
    this.beginGame();
    const who = this.actor();
    this.clockRun = null;
    if (this.clock && who) {
      this.clockRun = { id: who, since: Date.now() };
      this.turnEndsAt = Date.now() + Math.max(0, this.clockLeft[who] ?? this.clock.base);
    } else this.turnEndsAt = this.timeLimit && who ? Date.now() + this.timeLimit * this.secondMs : null;
    // Hạn đi nước đầu (phòng gặp người lạ): ván chưa quá 1 nước mà hết hạn thì tự huỷ
    this.firstMoveAt = null;
    if (this.firstMoveMs && who && this.board.moves.length < 2 && !this.tour) {
      this.firstMoveAt = Date.now() + this.firstMoveMs;
      if (!this.turnEndsAt || this.firstMoveAt < this.turnEndsAt) this.turnEndsAt = this.firstMoveAt;
    }
  }

  /** Trừ thời gian đã nghĩ của người vừa hành động; cộng giờ (nếu còn giờ). Trả về false nếu đã hết giờ. */
  spend(id) {
    if (!this.clock || !this.clockRun || this.clockRun.id !== id) return true;
    const elapsed = Date.now() - this.clockRun.since;
    const comp = this.lagComp(id, elapsed);
    const left = (this.clockLeft[id] ?? this.clock.base) - elapsed + comp;
    this.clockRun = null;
    if (left <= 0) { this.clockLeft[id] = 0; return false; }
    if (comp) this.lagUsed[id] = (this.lagUsed[id] || 0) + comp;
    this.clockLeft[id] = left + (this.berserk && this.berserk.has(id) ? 0 : this.clock.inc); // Berserk: không cộng giờ
    return true;
  }

  /**
   * Thời gian bù trễ cho người id (ms): RTT đã đo (lagOf do hub gắn), không quá trần mỗi nước, phần còn lại của trần
   * cả ván, và không quá thời gian vừa chạy (bù không bao giờ làm đồng hồ nhiều hơn lúc bắt đầu lượt).
   */
  lagComp(id, elapsed = Infinity) {
    const lag = this.lagOf ? this.lagOf(id) : 0;
    if (!(lag > 0)) return 0;
    const cap = lagCaps(this);
    const used = (this.lagUsed && this.lagUsed[id]) || 0;
    return Math.max(0, Math.round(Math.min(lag, cap.move, cap.game - used, elapsed)));
  }

  /** Hẹn giờ hết lượt chờ thêm bao lâu (ms): mức bù trễ của người đang phải hành động. */
  lagGrace() {
    const who = this.actor();
    return who ? this.lagComp(who) : 0;
  }

  /** Hết giờ: người phải hành động thua (chưa quá 1 nước ở phòng có hạn đi nước đầu: ván bị huỷ). */
  timeLoss() {
    const who = this.actor();
    if (!who) return;
    if (this.firstMoveMs && !this.tour && this.board.moves.length < 2) {
      this.abortedBy = who;
      this.noPlay = true; // không đi nước đầu (khác với bấm huỷ)
      this.finish(3, 'abort');
      return;
    }
    if (this.clock) this.clockLeft[who] = 0;
    this.finish(Caro.other(this.sideOf(who)), 'time');
  }

  /** Thời gian còn lại của 2 bên (ms), tính cả phần đang chạy. */
  clocksView() {
    if (!this.clock) return null;
    const left = (id) => {
      if (!id) return this.clock.base;
      let ms = this.clockLeft[id] ?? this.clock.base;
      if (this.clockRun && this.clockRun.id === id) ms -= Date.now() - this.clockRun.since;
      return Math.max(0, Math.round(ms));
    };
    return { x: left(this.seats[X]), o: left(this.seats[O]), running: this.clockRun ? this.sideOf(this.clockRun.id) : 0 };
  }

}

module.exports = { ClockMixin };
