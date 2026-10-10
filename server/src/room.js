/*
 * Một phòng chơi online (máy chủ giữ trạng thái chuẩn, client chỉ hiển thị).
 *  kind = 'room'   : phòng thường (mã 6 số + mật khẩu 3 số), tái đấu thì đổi bên đi trước.
 *  kind = 'series' : thách đấu bạn bè Bo1/Bo3/Bo5, mỗi ván đổi bên đi trước.
 * Quân X luôn đi trước; "đổi bên đi trước" = hai người đổi quân X/O cho nhau.
 *
 * Thời gian: timeLimit = giây mỗi nước, hoặc clock = đồng hồ tổng '3+2' (3 phút + 2 giây cộng sau mỗi lần đi).
 * Luật khai cuộc (opening):
 *  'free'  : tự do.
 *  'swap2' : chống lợi thế đi trước. Người cầm X lúc đầu (opener) đặt 3 quân X, O, X. Người kia (decider) chọn
 *            cầm X, cầm O, hoặc đặt thêm 2 quân (O, X) rồi để opener chọn bên. Sau đó ai cầm O đi tiếp.
 *            Quân luôn xen kẽ X/O nên lịch sử ván và xem lại không đổi.
 */
'use strict';
const Caro = require('../../caro/rules.js');
const { E } = require('./msg.js');
const { parseClock } = require('./rating.js');
const { ClockMixin } = require('./room-clock.js');
const { Swap2Mixin } = require('./room-swap2.js');
const { ExtrasMixin } = require('./room-extras.js');

const { X, O } = Caro;
const DRAW = 3; // winner = 3: ván hoà (hai bên đồng ý)
const COORD_LIMIT = 1_000_000;

class Room {
  constructor({ code, password, kind = 'room', bestOf = 1, timeLimit = 0, clock = null, opening = 'free', secondMs = 1000, drawCooldownMs = 30000, firstMoveMs = 0 }) {
    this.code = code;
    this.password = password;
    this.kind = kind;
    this.bestOf = bestOf;
    this.clockSpec = parseClock(clock) ? clock : null; // '3+2' hoặc null
    this.clock = parseClock(clock); // { base, inc } (ms theo secondMs của máy chủ)
    if (this.clock) {
      // secondMs nhỏ trong test để đồng hồ chạy nhanh
      this.clock = { base: (this.clock.base / 1000) * secondMs, inc: (this.clock.inc / 1000) * secondMs };
    }
    this.timeLimit = this.clock ? 0 : timeLimit; // giây mỗi nước, 0 = không giới hạn
    this.opening = opening === 'swap2' ? 'swap2' : 'free';
    this.clockLeft = {}; // id -> ms còn lại (đồng hồ tổng)
    this.clockRun = null; // { id, since }: đồng hồ đang chạy của ai
    this.secondMs = secondMs;
    this.drawCooldownMs = drawCooldownMs; // bị từ chối hoà thì phải chờ mới được xin lại
    this.turnEndsAt = null;
    this.firstMoveMs = firstMoveMs; // > 0: hạn đi nước đầu (ms), quá hạn thì ván tự huỷ
    this.players = []; // [{ id, name }]
    this.seats = { [X]: null, [O]: null }; // quân -> id người chơi
    this.score = {}; // id -> số ván thắng
    this.gameNo = 1;
    this.rematch = new Set();
    this.seriesWinner = null;
    this.createdAt = Date.now();
    this.touch();
    this.resetBoard();
  }

  touch() { this.activeAt = Date.now(); }

  resetBoard() {
    this.board = new Caro.Board();
    this.turn = X;
    this.winner = null; // X | O | DRAW
    this.winCells = null;
    this.reason = null; // 'win' | 'resign' | 'leave' | 'timeout' (mất kết nối) | 'time' (hết giờ) | 'draw' | 'abort' (huỷ)
    this.turnEndsAt = null;
    this.drawOffer = null; // id người đang xin hoà
    this.drawWait = {}; // id -> thời điểm được xin hoà lại
    this.phase = this.opening === 'swap2' ? 'place3' : null; // giai đoạn khai cuộc Swap2
    this.opener = null;
    this.decider = null;
    this.clockRun = null;
    this.clockLeft = {};
    this.begun = false;
    this.noPlay = false; // ván tự huỷ vì không đi nước đầu
    this.abortedBy = null; // người huỷ ván / không đi nước đầu kịp
    this.firstMoveAt = null; // hạn đi nước đầu (phòng gặp người lạ)
    this.takebackOffer = null; // id người đang xin đi lại
    this.takebacks = 0; // số lần đã đi lại trong ván (có đi lại = không tính điểm)
    this.openingEnd = 0; // số quân khai cuộc Swap2 (không được đi lại qua)
    this.berserk = new Set(); // id người đã Berserk (giải Arena)
  }

  /** Ván mới bắt đầu (đủ 2 người): ghi nhớ ai đặt quân khai cuộc, nạp đồng hồ tổng. */
  beginGame() {
    if (this.begun || !this.active) return;
    this.begun = true;
    this.opener = this.seats[X];
    this.decider = this.seats[O];
    if (this.clock) for (const p of this.players) this.clockLeft[p.id] = this.clock.base;
  }

  /** Ai phải hành động lúc này (đặt quân / chọn bên). */
  actor() {
    if (!this.active) return null;
    if (this.phase === 'place3' || this.phase === 'choose2') return this.opener || this.seats[X];
    if (this.phase === 'choose1' || this.phase === 'place2') return this.decider || this.seats[O];
    return this.seats[this.turn];
  }

  has(id) { return this.players.some((p) => p.id === id); }
  sideOf(id) { return this.seats[X] === id ? X : this.seats[O] === id ? O : 0; }
  opponentOf(id) { return this.players.find((p) => p.id !== id) || null; }
  get full() { return this.players.length === 2; }
  get inProgress() { return this.full && !this.winner && this.board.moves.length > 0; }
  /** Ván đang diễn ra, kể cả khi chưa ai đánh nước nào. */
  get active() { return this.full && !this.winner && !(this.kind === 'series' && this.seriesWinner); }
  get needWins() { return Math.floor(this.bestOf / 2) + 1; }

  /** Thêm người chơi. side: X/O mong muốn (chỉ áp dụng khi còn trống). */
  addPlayer(player, side) {
    if (this.has(player.id)) return;
    if (this.full) throw E('room_full');
    this.players.push({ id: player.id, name: player.name });
    if (!(player.id in this.score)) this.score[player.id] = 0;
    const want = side === O ? O : side === X ? X : 0;
    const seat = want && !this.seats[want] ? want : !this.seats[X] ? X : O;
    this.seats[seat] = player.id;
    this.startClock();
    this.touch();
  }

  removePlayer(id) {
    if (!this.has(id)) return;
    const opp = this.opponentOf(id);
    // Rời phòng khi đang đánh = xử thua.
    if (this.inProgress && opp) this.finish(this.sideOf(opp.id), 'leave');
    this.players = this.players.filter((p) => p.id !== id);
    this.seats[this.sideOf(id)] = null;
    this.rematch.clear();
    // Người ở lại chờ đối thủ mới: làm mới bàn cờ và tỉ số.
    this.score = {};
    for (const p of this.players) this.score[p.id] = 0;
    this.seriesWinner = null;
    this.gameNo = 1;
    this.resetBoard();
    this.touch();
  }

  rename(id, name) {
    const p = this.players.find((q) => q.id === id);
    if (p) p.name = name;
  }

  move(id, x, y) {
    if (!this.full) throw E('waiting_opponent');
    if (this.winner) throw E('game_over');
    if (this.kind === 'series' && this.seriesWinner) throw E('match_over');
    if (this.phase === 'choose1' || this.phase === 'choose2') throw E('swap_choose_first');
    if (this.actor() !== id) throw E('not_your_turn');
    if (!Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x) > COORD_LIMIT || Math.abs(y) > COORD_LIMIT) {
      throw E('bad_move');
    }
    if (this.board.get(x, y) !== Caro.EMPTY) throw E('cell_taken');
    if (!this.spend(id)) { this.timeLoss(); return; }
    const side = this.turn; // khai cuộc Swap2: một người đặt cả quân X lẫn O
    this.board.play(x, y, side);
    if (this.phase === 'place3' && this.board.moves.length >= 3) this.phase = 'choose1';
    else if (this.phase === 'place2' && this.board.moves.length >= 5) this.phase = 'choose2';
    // Đối thủ đánh tiếp thay vì trả lời = từ chối lời xin hoà.
    if (this.drawOffer && this.drawOffer !== id) this.declineDraw();
    this.takebackOffer = null;
    this.touch();
    const cells = Caro.checkWin(this.board, x, y, side);
    if (cells) {
      this.winCells = cells;
      this.finish(side, 'win');
    } else {
      this.turn = Caro.other(side);
      this.startClock();
    }
  }

  resign(id) {
    const side = this.sideOf(id);
    if (!side || !this.full || this.winner) throw E('cannot_resign');
    this.finish(Caro.other(side), 'resign');
  }

  /**
   * Xin hoà. Trả về 'draw' nếu thành hoà ngay (đối thủ cũng đang xin hoà),
   * 'offered' nếu vừa gửi lời xin, 'pending' nếu lời xin trước vẫn đang chờ (không báo lại).
   */
  offerDraw(id) {
    if (!this.sideOf(id) || !this.active) throw E('cannot_draw');
    if (this.drawOffer && this.drawOffer !== id) { this.finish(DRAW, 'draw'); return 'draw'; }
    if (this.drawOffer === id) return 'pending';
    const wait = (this.drawWait[id] || 0) - Date.now();
    if (wait > 0) throw E('draw_wait', { n: Math.ceil(wait / 1000) });
    this.drawOffer = id;
    return 'offered';
  }

  declineDraw() {
    this.drawWait[this.drawOffer] = Date.now() + this.drawCooldownMs;
    this.drawOffer = null;
  }

  /** Trả lời lời xin hoà của đối thủ. */
  answerDraw(id, accept) {
    if (!this.drawOffer || this.drawOffer === id || !this.active) throw E('no_draw_offer');
    if (accept) this.finish(DRAW, 'draw');
    else this.declineDraw();
    return accept;
  }

  finish(winnerSide, reason) {
    if (this.clockRun && this.clock) {
      // Dừng đồng hồ, giữ thời gian còn lại để hiện lúc kết thúc
      const r = this.clockRun;
      this.clockLeft[r.id] = Math.max(0, (this.clockLeft[r.id] ?? this.clock.base) - (Date.now() - r.since));
    }
    this.clockRun = null;
    this.winner = winnerSide;
    this.reason = reason;
    this.turnEndsAt = null;
    this.drawOffer = null;
    this.takebackOffer = null;
    const wid = winnerSide === DRAW ? null : this.seats[winnerSide];
    if (wid) this.score[wid] = (this.score[wid] || 0) + 1;
    if (this.kind === 'series' && wid && this.score[wid] >= this.needWins) this.seriesWinner = wid;
    this.rematch.clear();
    this.touch();
  }

  /** Ván tiếp theo của Bo3/Bo5 (chưa phân thắng thua chung cuộc). */
  get awaitingNextGame() {
    return this.kind === 'series' && !!this.winner && !this.seriesWinner && this.full;
  }

  /** Bắt đầu ván mới, đổi bên đi trước. */
  nextGame() {
    const x = this.seats[X];
    this.seats[X] = this.seats[O];
    this.seats[O] = x;
    this.gameNo++;
    this.rematch.clear();
    this.resetBoard();
    this.startClock();
    this.touch();
  }

  /** Bấm "Tái đấu": đủ 2 người cùng bấm thì bắt đầu ván mới (hoặc trận Bo mới). */
  voteRematch(id) {
    if (!this.has(id) || !this.full || !this.winner) throw E('cannot_rematch');
    if (this.kind === 'series' && !this.seriesWinner) throw E('next_game_auto');
    this.rematch.add(id);
    if (this.rematch.size < 2) return false;
    if (this.kind === 'series') {
      for (const k of Object.keys(this.score)) this.score[k] = 0;
      this.seriesWinner = null;
    }
    this.nextGame();
    return true;
  }

  view() {
    return {
      code: this.code,
      password: this.password,
      kind: this.kind,
      bestOf: this.bestOf,
      timeLimit: this.timeLimit,
      clock: this.clockSpec,
      clocks: this.clocksView(),
      opening: this.opening,
      phase: this.phase, // Swap2: 'place3' | 'choose1' | 'place2' | 'choose2' | null
      opener: this.opener,
      actor: this.actor(),
      turnLeft: this.turnEndsAt ? Math.max(0, this.turnEndsAt - Date.now()) : null, // ms còn lại của lượt
      players: this.players.map((p) => ({ id: p.id, name: p.name })),
      seats: { x: this.seats[X], o: this.seats[O] },
      moves: this.board.moves.map((m) => [m.x, m.y]),
      turn: this.turn,
      winner: this.winner,
      winCells: this.winCells,
      reason: this.reason,
      score: { ...this.score },
      gameNo: this.gameNo,
      rematch: [...this.rematch],
      seriesWinner: this.seriesWinner,
      drawOffer: this.drawOffer,
      abortable: this.abortable,
      firstMove: this.firstMoveLeft(), // ms còn lại để đi nước đầu (quá hạn thì ván tự huỷ)
      takeback: this.takebackAllowed,
      takebackOffer: this.takebackOffer,
      takebacks: this.takebacks,
      berserk: [...this.berserk],
      public: !!this.public, // phòng công khai (trong sảnh)
      quick: !!this.quick, // phòng do tìm trận nhanh tạo
    };
  }
}

// Đồng hồ (room-clock.js), luật Swap2 (room-swap2.js), huỷ ván / thêm giờ / đi lại / Berserk (room-extras.js) tách file riêng
for (const part of [ClockMixin, Swap2Mixin, ExtrasMixin]) {
  for (const name of Object.getOwnPropertyNames(part.prototype)) {
    if (name !== 'constructor') Object.defineProperty(Room.prototype, name, Object.getOwnPropertyDescriptor(part.prototype, name));
  }
}

module.exports = { Room, DRAW };
