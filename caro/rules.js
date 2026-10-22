/*
 * Cờ Caro – các luật chơi (AI cục bộ ở rules-ai.js).
 * Luật Việt Nam "chặn 2 đầu" (mặc định, 'vn'):
 *  - Chuỗi bị chặn 1 đầu: đủ 5 quân là thắng.
 *  - Chuỗi không bị chặn đầu nào: đủ 4 quân là thắng.
 *  - Chuỗi bị chặn cả 2 đầu: không tính thắng.
 * Luật quốc tế:
 *  - 'free'  Gomoku tự do: 5 quân trở lên là thắng (6, 7 quân vẫn thắng), không quan tâm bị chặn.
 *  - 'std'   Gomoku tiêu chuẩn: chỉ đúng 5 quân mới thắng; 6 quân trở lên (quá năm) không tính.
 *  - 'renju' Liên Châu: X (quân đen, đi trước) chỉ thắng với đúng 5 quân và bị cấm 3-3, 4-4, quá năm;
 *            O (quân trắng) 5 quân trở lên đều thắng, không bị cấm gì.
 * Bàn cờ vô hạn: chỉ lưu các ô đã đánh.
 * Chạy được trên trình duyệt (window.Caro) và Node (module.exports) để test.
 */
(function (global) {
  'use strict';

  const EMPTY = 0, X = 1, O = 2;
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  // Khóa số cho Map: (x + 2^20) * 2^21 + (y + 2^20) chỉ đơn ánh khi cả hai toạ độ nằm trong
  // [-2^20, 2^20) — play() chặn cứng khoảng này (xem dưới). Giữ khóa số vì tra bàn bằng khóa
  // chuỗi "x,y" chậm hơn rõ rệt ở phần tính nước của bot (đã đo khi review PR #85: ~3 lần).
  const OFF = 1 << 20, SPAN = 1 << 21;
  const key = (x, y) => (x + OFF) * SPAN + (y + OFF);
  const LIM = 1 << 20; // toạ độ hợp lệ: -LIM <= x, y < LIM thì khóa số không bao giờ trùng
  const other = (p) => 3 - p;

  const RULES = ['vn', 'free', 'std', 'renju'];
  const ruleOf = (r) => (RULES.includes(r) ? r : 'vn');

  class Board {
    constructor(rule) {
      this.cells = new Map();
      this.moves = [];
      this.rule = ruleOf(rule);
    }
    get(x, y) { return this.cells.get(key(x, y)) || EMPTY; }
    put(x, y, p) { this.cells.set(key(x, y), p); }
    remove(x, y) { this.cells.delete(key(x, y)); }
    play(x, y, p) {
      // H-E1: ngoài khoảng [-2^20, 2^20) khóa số hết đơn ánh — hai ô khác nhau sẽ trùng
      // khóa và ghi đè lên nhau (vd. (0,0) trùng (1,-2097152)). Chặn ngay tại đây; máy chủ
      // còn chặn chặt hơn nhiều (±512 từ PR #72) nên ván thật không bao giờ chạm ngưỡng này.
      // Các đường phát lại dữ liệu bên ngoài (link chia sẻ, ván lưu, xem lại) tự bỏ qua
      // nước bị ném lỗi này — xem share.js / board-replay.js / app-ext.js / an-pool.js.
      if (!(x >= -LIM && x < LIM && y >= -LIM && y < LIM)) throw new Error('out_of_range');
      // Đặt chồng lên ô đã có quân sẽ làm cells và moves lệch nhau vĩnh viễn
      // (undo một lần xoá cả hai bản ghi). Từ chối thẳng để lỗi lộ ra ngay tại chỗ gọi.
      if (this.get(x, y) !== EMPTY) throw new Error('occupied');
      this.put(x, y, p);
      this.moves.push({ x, y, p });
    }
    undo() {
      const m = this.moves.pop();
      if (m) this.remove(m.x, m.y);
      return m;
    }
  }

  /** Chuỗi liền len quân của p có thắng không theo luật rule? openA / openB: hàm hỏi hai đầu có trống không. */
  function winLen(rule, p, len, openA, openB) {
    switch (rule) {
      case 'free': return len >= 5;
      case 'std': return len === 5;
      case 'renju': return p === X ? len === 5 : len >= 5;
      default: {
        const a = openA(), b = openB();
        return (len >= 5 && (a || b)) || (len >= 4 && a && b);
      }
    }
  }

  // Quân p đã nằm ở (x,y). Trả về các ô của chuỗi thắng theo hướng (dx,dy), hoặc null.
  function lineWin(board, x, y, dx, dy, p) {
    let a = 1;
    while (board.get(x - a * dx, y - a * dy) === p) a++;
    let b = 1;
    while (board.get(x + b * dx, y + b * dy) === p) b++;
    const len = a + b - 1;
    if (len < 4) return null;
    const win = winLen(board.rule, p, len, () => board.get(x - a * dx, y - a * dy) === EMPTY, () => board.get(x + b * dx, y + b * dy) === EMPTY);
    if (!win) return null;
    const cells = [];
    for (let i = -(a - 1); i <= b - 1; i++) cells.push([x + i * dx, y + i * dy]);
    return cells;
  }

  function checkWin(board, x, y, p) {
    for (const [dx, dy] of DIRS) {
      const cells = lineWin(board, x, y, dx, dy, p);
      if (cells) return cells;
    }
    return null;
  }

  function winsIfPlaced(board, x, y, p) {
    // H-E1: ô đã có quân thì không "đặt thử" được — trước đây put/remove ở đây xoá luôn
    // quân đang nằm trên ô, làm mất quân khỏi bàn.
    if (board.get(x, y) !== EMPTY) return false;
    board.put(x, y, p);
    const w = checkWin(board, x, y, p) !== null;
    board.remove(x, y);
    return w;
  }

  // ---------------------------------------------------------------- Nước cấm Renju (chỉ quân X / đen)
  // Định nghĩa theo luật RIF:
  //  - Năm: đúng 5 quân liền. Thắng luôn được ưu tiên hơn nước cấm.
  //  - Bốn: một đường mà thêm 1 quân là thành đúng 5. "Bốn thẳng" (_XXXX_) có 2 ô thành 5 nhưng vẫn chỉ là 1 bốn;
  //    hai ô thành 5 cách nhau không phải 5 ô (vd. X_XXX_X) là 2 bốn trên cùng một đường.
  //  - Ba (ba mở): một đường mà thêm 1 quân (ở ô không bị cấm) thành bốn thẳng.
  //  - Cấm: quá năm (≥ 6 quân), hai bốn trở lên (4-4), hai ba trở lên (3-3).

  /** Ô (x,y) đang trống; các quân đen đã có trên bàn. Hàm trả về độ dài chuỗi đen liền qua (x,y) theo hướng (dx,dy) nếu đặt đen ở đó. */
  function runLen(board, x, y, dx, dy) {
    let a = 1; while (board.get(x - a * dx, y - a * dy) === X) a++;
    let b = 1; while (board.get(x + b * dx, y + b * dy) === X) b++;
    return a + b - 1;
  }
  /** Đen (đã nằm ở (x,y)) có các ô nào trên đường (dx,dy) mà đánh vào thành đúng 5 (gồm cả (x,y))? Trả về chỉ số k của các ô đó. */
  function fiveSpots(board, x, y, dx, dy) {
    const out = [];
    for (let k = -4; k <= 4; k++) {
      if (!k) continue;
      const cx = x + k * dx, cy = y + k * dy;
      if (board.get(cx, cy) !== EMPTY) continue;
      board.put(cx, cy, X);
      // Chuỗi đúng 5 qua ô mới và phải chứa (x,y)
      let a = 1; while (board.get(cx - a * dx, cy - a * dy) === X) a++;
      let b = 1; while (board.get(cx + b * dx, cy + b * dy) === X) b++;
      board.remove(cx, cy);
      if (a + b - 1 === 5 && k - (a - 1) <= 0 && k + (b - 1) >= 0) out.push(k);
    }
    return out;
  }
  /** Số "bốn" trên một đường (bốn thẳng tính là 1). */
  function foursOnLine(board, x, y, dx, dy) {
    const f = fiveSpots(board, x, y, dx, dy);
    if (f.length === 2 && Math.abs(f[1] - f[0]) === 5) return 1;
    return f.length;
  }
  /** Đường (dx,dy) qua (x,y) có "ba mở" không: thêm 1 quân ở ô không cấm thì thành bốn thẳng. */
  function threeOnLine(board, x, y, dx, dy, depth) {
    for (let k = -4; k <= 4; k++) {
      if (!k) continue;
      const cx = x + k * dx, cy = y + k * dy;
      if (board.get(cx, cy) !== EMPTY) continue;
      board.put(cx, cy, X);
      const f = fiveSpots(board, x, y, dx, dy);
      const straight = f.length === 2 && Math.abs(f[1] - f[0]) === 5 && runLen(board, cx, cy, dx, dy) === 4;
      board.remove(cx, cy);
      if (straight && (depth <= 0 || !forbiddenAt(board, cx, cy, depth - 1))) return true;
    }
    return false;
  }
  /** Đặt đen vào ô trống (x,y) có phải nước cấm không? Trả về 'overline' | '44' | '33' | null. */
  function forbiddenAt(board, x, y, depth) {
    if (depth === undefined) depth = 2;
    board.put(x, y, X);
    try {
      let five = false, over = false;
      for (const [dx, dy] of DIRS) {
        const n = runLen2(board, x, y, dx, dy);
        if (n === 5) five = true; else if (n > 5) over = true;
      }
      if (five) return null;
      if (over) return 'overline';
      let fours = 0, threes = 0;
      for (const [dx, dy] of DIRS) {
        const f = foursOnLine(board, x, y, dx, dy);
        fours += f;
        if (!f && threeOnLine(board, x, y, dx, dy, depth)) threes++;
      }
      if (fours >= 2) return '44';
      if (threes >= 2) return '33';
      return null;
    } finally {
      board.remove(x, y);
    }
  }
  // (x,y) đã có đen: độ dài chuỗi liền qua đó
  function runLen2(board, x, y, dx, dy) {
    let a = 1; while (board.get(x - a * dx, y - a * dy) === X) a++;
    let b = 1; while (board.get(x + b * dx, y + b * dy) === X) b++;
    return a + b - 1;
  }
  /** Lọc nhanh: (x,y) chỉ có thể là nước cấm nếu ≥ 2 hướng có ≥ 2 quân đen gần (≤ 4 ô, chưa bị chặn) hoặc một hướng có ≥ 3, hoặc có thể thành quá năm. */
  function mayForbid(board, x, y) {
    let lines = 0;
    for (const [dx, dy] of DIRS) {
      let n = 0;
      for (let k = 1; k <= 4; k++) { const v = board.get(x + k * dx, y + k * dy); if (v === X) n++; else if (v !== EMPTY) break; }
      for (let k = 1; k <= 4; k++) { const v = board.get(x - k * dx, y - k * dy); if (v === X) n++; else if (v !== EMPTY) break; }
      if (n >= 3) return true; // có thể 4-4 trên cùng một đường (X_XXX_X)
      if (n >= 2) lines++;
      if (lines >= 2) return true;
      if (runLen(board, x, y, dx, dy) >= 6) return true;
    }
    return false;
  }
  /** p đánh vào ô trống (x,y) có bị cấm không (chỉ luật Renju, chỉ quân X)? Trả về lý do hoặc null. */
  function forbidden(board, x, y, p) {
    if (board.rule !== 'renju' || p !== X || board.get(x, y) !== EMPTY) return null;
    if (!mayForbid(board, x, y)) return null;
    return forbiddenAt(board, x, y);
  }

  const Caro = {
    EMPTY, X, O, DIRS, RULES, ruleOf, Board, key, other, lineWin, checkWin, winsIfPlaced, forbidden, winLen,
  };
  // Phần AI (rules-ai.js): Node nạp ở đây; trình duyệt / Worker nạp file đó ngay sau file này.
  if (typeof module !== 'undefined' && module.exports) module.exports = Object.assign(Caro, require('./rules-ai.js')(Caro));
  else global.Caro = Caro;
})(typeof window !== 'undefined' ? window : globalThis);
