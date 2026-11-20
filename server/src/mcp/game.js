/*
 * Connector MCP – phần luật thuần (không I/O, không máy cờ): kiểm danh sách nước đi người gọi gửi lên, dựng lại thế cờ
 * bằng caro/rules.js, xác định kết quả (thắng / hoà, hàng thắng), vẽ bàn cờ dạng chữ gọn cho mô hình đọc.
 * Trạng thái ván chính là danh sách nước (X luôn đi trước) nên máy chủ không lưu gì.
 * Dùng bởi tools-game.js và tools-info.js (gom ở mcp/index.js).
 */
'use strict';
const C = require('../../../caro/rules.js');

const MAX_MOVES = 400;   // ván dài hơn thế coi là hoà, và không nhận danh sách dài hơn
const COORD = 30;        // toạ độ hợp lệ: -30..30 (bàn 61 × 61 quanh tâm 0,0)
const RULES = ['vn', 'free', 'std', 'renju'];
const RULE_NAMES = { vn: 'Vietnamese Caro', free: 'Freestyle Gomoku', std: 'Standard Gomoku', renju: 'Renju' };
const FORBID_NAMES = { '33': 'double three (3-3)', '44': 'double four (4-4)', overline: 'overline (6+ in a row)' };

/** Lỗi đầu vào có lời nhắn sửa được – tool trả về isError kèm lời nhắn này. */
class InputError extends Error {}

const sideName = (p) => (p === C.X ? 'X' : 'O');
const fmt = (m) => `[${m[0]},${m[1]}]`;

/** Kiểm dạng một nước: [x, y] số nguyên trong khoảng cho phép. */
function checkCoord(m, label) {
  if (!Array.isArray(m) || m.length !== 2 || !Number.isInteger(m[0]) || !Number.isInteger(m[1])) {
    throw new InputError(`${label} must be a pair of integers [x, y], got ${JSON.stringify(m)}.`);
  }
  if (Math.abs(m[0]) > COORD || Math.abs(m[1]) > COORD) {
    throw new InputError(`${label} ${fmt(m)} is off the board: x and y must be between -${COORD} and ${COORD}.`);
  }
}

/**
 * Dựng lại ván từ danh sách nước. Ném InputError (kèm số thứ tự nước) nếu: sai dạng, trùng ô, nước cấm Renju,
 * hoặc còn nước đi sau khi ván đã kết thúc.
 * Trả về { board, rule, moves, winner (0 | 1 | 2), line ([[x, y]…] | null), draw, toMove (1 | 2) }.
 */
function replay(moves, rule) {
  rule = RULES.includes(rule) ? rule : 'vn';
  if (moves == null) moves = [];
  if (!Array.isArray(moves)) throw new InputError('moves must be an array of [x, y] pairs, e.g. [[0,0],[1,0]].');
  if (moves.length > MAX_MOVES) throw new InputError(`Too many moves (${moves.length}); the limit is ${MAX_MOVES}.`);
  const board = new C.Board(rule);
  let winner = 0, line = null;
  moves.forEach((m, i) => {
    checkCoord(m, `Move ${i + 1}`);
    if (winner) throw new InputError(`The game already ended at move ${i} (${sideName(winner)} won); remove the moves after it.`);
    const p = i % 2 ? C.O : C.X;
    if (board.get(m[0], m[1]) !== C.EMPTY) throw new InputError(`Move ${i + 1} ${fmt(m)} is on an occupied cell.`);
    const f = C.forbidden(board, m[0], m[1], p);
    if (f) throw new InputError(`Move ${i + 1} ${fmt(m)} is a forbidden move for X under Renju: ${FORBID_NAMES[f]}.`);
    board.play(m[0], m[1], p);
    const w = C.checkWin(board, m[0], m[1], p);
    if (w) { winner = p; line = w; }
  });
  const draw = !winner && moves.length >= MAX_MOVES;
  return { board, rule, moves: moves.map((m) => [m[0], m[1]]), winner, line, draw, toMove: moves.length % 2 ? C.O : C.X };
}

/** Đặt thêm một nước vào ván đã dựng (nước của máy). Trả về ván mới (cùng dạng replay). */
function extend(game, move) {
  return replay([...game.moves, move], game.rule);
}

/** Câu kết quả ngắn cho mô hình. */
function statusText(g) {
  if (g.winner) return `${sideName(g.winner)} wins (winning line ${g.line.map(fmt).join(' ')}).`;
  if (g.draw) return `Draw: the ${MAX_MOVES}-move limit was reached.`;
  return `${sideName(g.toMove)} to move.`;
}

/**
 * Bàn cờ dạng chữ: khung quanh các quân (thêm 1 ô viền, tối đa 21 × 21 quanh nước cuối), hàng = y, cột = x.
 * X / O là quân, chữ thường x / o là nước vừa đi, "." là ô trống. Rỗng khi chưa có nước nào.
 */
function asciiBoard(g) {
  if (!g.moves.length) return '';
  const last = g.moves[g.moves.length - 1];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of g.moves) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const clamp = (a, b, c) => [Math.max(a - 1, c - 10), Math.min(b + 1, c + 10)];
  [x0, x1] = clamp(x0, x1, last[0]);
  [y0, y1] = clamp(y0, y1, last[1]);
  const w = Math.max(...[x0, x1].map((v) => String(v).length)) + 1;
  const pad = (s) => String(s).padStart(w);
  const yw = Math.max(String(y0).length, String(y1).length);
  const rows = [' '.repeat(yw) + Array.from({ length: x1 - x0 + 1 }, (_, i) => pad(x0 + i)).join('')];
  for (let y = y0; y <= y1; y++) {
    let r = String(y).padStart(yw);
    for (let x = x0; x <= x1; x++) {
      const v = g.board.get(x, y);
      let ch = v === C.X ? 'X' : v === C.O ? 'O' : '.';
      if (x === last[0] && y === last[1]) ch = ch.toLowerCase();
      r += pad(ch);
    }
    rows.push(r);
  }
  return rows.join('\n');
}

/** Kiểm tên luật: không có thì 'vn', sai thì báo lỗi rõ. */
function ruleArg(r) {
  if (r == null || r === '') return 'vn';
  if (!RULES.includes(r)) throw new InputError(`Unknown rule "${r}". Use one of: ${RULES.join(', ')}.`);
  return r;
}

module.exports = { replay, extend, statusText, asciiBoard, ruleArg, checkCoord, sideName, fmt, InputError, MAX_MOVES, COORD, RULES, RULE_NAMES };
