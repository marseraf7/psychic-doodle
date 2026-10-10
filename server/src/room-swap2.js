/*
 * Luật khai cuộc Swap2 (gắn vào Room.prototype trong room.js) – chống lợi thế đi trước:
 *  1. 'place3' : người cầm X lúc đầu (opener) đặt 3 quân X, O, X.
 *  2. 'choose1': người kia (decider) chọn cầm X, cầm O, hoặc 'place2'.
 *  3. 'place2' : decider đặt thêm 2 quân O, X;  4. 'choose2': opener chọn cầm X hoặc O.
 * Sau khi chọn, ai cầm O đi tiếp. Quân luôn xen kẽ X/O nên lịch sử ván và xem lại không đổi.
 * Phần đặt quân nằm trong Room.move (chỉ cần đúng người hành động – actor()).
 */
'use strict';
const { E } = require('./msg.js');

const X = 1, O = 2;

class Swap2Mixin {
  /**
   * Swap2: chọn bên. choice = 'x' | 'o' (cầm quân đó) | 'place2' (chỉ ở lượt chọn đầu: đặt thêm 2 quân).
   */
  swapChoose(id, choice) {
    if (!this.active || (this.phase !== 'choose1' && this.phase !== 'choose2')) throw E('swap_not_now');
    if (this.actor() !== id) throw E('not_your_turn');
    if (!['x', 'o', 'place2'].includes(choice) || (choice === 'place2' && this.phase !== 'choose1')) throw E('bad_message');
    if (!this.spend(id)) { this.timeLoss(); return; }
    this.drawOffer = null;
    if (choice === 'place2') { this.phase = 'place2'; this.startClock(); this.touch(); return; }
    const other = id === this.opener ? this.decider : this.opener;
    this.seats[X] = choice === 'x' ? id : other;
    this.seats[O] = choice === 'x' ? other : id;
    this.phase = null;
    this.startClock();
    this.touch();
  }

}

module.exports = { Swap2Mixin };
