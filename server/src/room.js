/*
 * Một phòng chơi online (máy chủ giữ trạng thái chuẩn, client chỉ hiển thị).
 *  kind = 'room'   : phòng thường (mã 6 số + mật khẩu 3 số), tái đấu thì đổi bên đi trước.
 *  kind = 'series' : thách đấu bạn bè Bo1/Bo3/Bo5, mỗi ván đổi bên đi trước.
 * Quân X luôn đi trước; "đổi bên đi trước" = hai người đổi quân X/O cho nhau.
 */
'use strict';
const Caro = require('../../caro/rules.js');

const { X, O } = Caro;
const COORD_LIMIT = 1_000_000;

class Room {
  constructor({ code, password, kind = 'room', bestOf = 1 }) {
    this.code = code;
    this.password = password;
    this.kind = kind;
    this.bestOf = bestOf;
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
    this.winner = null; // X | O
    this.winCells = null;
    this.reason = null; // 'win' | 'resign' | 'leave' | 'timeout'
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
    if (this.full) throw new Error('Phòng đã đủ 2 người');
    this.players.push({ id: player.id, name: player.name });
    if (!(player.id in this.score)) this.score[player.id] = 0;
    const want = side === O ? O : side === X ? X : 0;
    const seat = want && !this.seats[want] ? want : !this.seats[X] ? X : O;
    this.seats[seat] = player.id;
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
    if (!this.full) throw new Error('Đang chờ đối thủ');
    if (this.winner) throw new Error('Ván đã kết thúc');
    if (this.kind === 'series' && this.seriesWinner) throw new Error('Trận đấu đã kết thúc');
    const side = this.sideOf(id);
    if (side !== this.turn) throw new Error('Chưa đến lượt bạn');
    if (!Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x) > COORD_LIMIT || Math.abs(y) > COORD_LIMIT) {
      throw new Error('Nước đi không hợp lệ');
    }
    if (this.board.get(x, y) !== Caro.EMPTY) throw new Error('Ô này đã có quân');
    this.board.play(x, y, side);
    this.touch();
    const cells = Caro.checkWin(this.board, x, y, side);
    if (cells) {
      this.winCells = cells;
      this.finish(side, 'win');
    } else {
      this.turn = Caro.other(side);
    }
  }

  resign(id) {
    const side = this.sideOf(id);
    if (!side || !this.full || this.winner) throw new Error('Không thể đầu hàng lúc này');
    this.finish(Caro.other(side), 'resign');
  }

  finish(winnerSide, reason) {
    this.winner = winnerSide;
    this.reason = reason;
    const wid = this.seats[winnerSide];
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
    this.touch();
  }

  /** Bấm "Tái đấu": đủ 2 người cùng bấm thì bắt đầu ván mới (hoặc trận Bo mới). */
  voteRematch(id) {
    if (!this.has(id) || !this.full || !this.winner) throw new Error('Chưa thể tái đấu');
    if (this.kind === 'series' && !this.seriesWinner) throw new Error('Ván tiếp theo sẽ tự bắt đầu');
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
    };
  }
}

module.exports = { Room };
