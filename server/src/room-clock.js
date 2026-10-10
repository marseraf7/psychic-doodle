/*
 * Đồng hồ của phòng chơi (gắn vào Room.prototype trong room.js):
 *  - giới hạn mỗi nước (timeLimit giây), hoặc
 *  - đồng hồ tổng + cộng giờ (clock '3+2'): mỗi người một quỹ thời gian, giữ theo id người chơi
 *    (Swap2 đổi bên giữa chừng vẫn đúng), trừ khi người đó nghĩ, cộng giờ sau mỗi lần hành động.
 * Máy chủ hẹn giờ theo turnEndsAt (rooms.js → scheduleClock); hết giờ thì người phải hành động thua.
 */
'use strict';
const Caro = require('../../caro/rules.js');

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
  }

  /** Trừ thời gian đã nghĩ của người vừa hành động; cộng giờ (nếu còn giờ). Trả về false nếu đã hết giờ. */
  spend(id) {
    if (!this.clock || !this.clockRun || this.clockRun.id !== id) return true;
    const left = (this.clockLeft[id] ?? this.clock.base) - (Date.now() - this.clockRun.since);
    this.clockRun = null;
    if (left <= 0) { this.clockLeft[id] = 0; return false; }
    this.clockLeft[id] = left + this.clock.inc;
    return true;
  }

  /** Hết giờ: người phải hành động thua. */
  timeLoss() {
    const who = this.actor();
    if (!who) return;
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
