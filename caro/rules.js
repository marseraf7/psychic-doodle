/*
 * Cờ Caro – các luật chơi + AI.
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
  // Khóa số cho Map: toạ độ trong khoảng ±1.048.576 ô – thực tế là không giới hạn.
  const OFF = 1 << 20, SPAN = 1 << 21;
  const key = (x, y) => (x + OFF) * SPAN + (y + OFF);
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

  // ---------------------------------------------------------------- AI

  function candidates(board, radius) {
    if (board.moves.length === 0) return [[0, 0]];
    const seen = new Map();
    for (const m of board.moves) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const x = m.x + dx, y = m.y + dy;
          const k = key(x, y);
          if (!seen.has(k) && !board.cells.has(k)) seen.set(k, [x, y]);
        }
      }
    }
    return [...seen.values()];
  }

  // Các ô mà p đánh vào sẽ thắng ngay, chỉ xét trên 4 đường đi qua (x,y).
  function winCellsAround(board, x, y, p) {
    const out = [];
    for (const [dx, dy] of DIRS) {
      for (let k = -4; k <= 4; k++) {
        if (k === 0) continue;
        const cx = x + k * dx, cy = y + k * dy;
        if (board.get(cx, cy) === EMPTY && winsIfPlaced(board, cx, cy, p)) out.push([cx, cy]);
      }
    }
    return out;
  }

  // Điểm hình cờ trên 1 hướng khi chưa có đe doạ thắng trực tiếp.
  function shapeScore(board, x, y, dx, dy, p) {
    const opp = other(p);
    const at = (k) => board.get(x + k * dx, y + k * dy);
    let s = 0;
    // Cửa sổ 5 ô: tiềm năng thành chuỗi 5 bị chặn 1 đầu.
    const W5 = [0, 1, 4, 30, 120, 0];
    for (let st = -4; st <= 0; st++) {
      let n = 0, blocked = false;
      for (let k = st; k < st + 5; k++) {
        const v = at(k);
        if (v === opp) { blocked = true; break; }
        if (v === p) n++;
      }
      if (!blocked) s += W5[n];
    }
    // Cửa sổ 4 ô có 2 đầu trống: tiềm năng thành 4 không bị chặn.
    const W4 = [0, 2, 25, 0, 0];
    for (let st = -3; st <= 0; st++) {
      if (at(st - 1) !== EMPTY || at(st + 4) !== EMPTY) continue;
      let n = 0, blocked = false;
      for (let k = st; k < st + 4; k++) {
        const v = at(k);
        if (v === opp) { blocked = true; break; }
        if (v === p) n++;
      }
      if (!blocked) s += W4[n];
    }
    return s;
  }

  // Giá trị của việc p đánh vào ô (x,y).
  function cellScore(board, x, y, p) {
    board.put(x, y, p);
    if (checkWin(board, x, y, p)) {
      board.remove(x, y);
      return 1e9;
    }
    let total = 0, threatDirs = 0, threatCells = 0;
    for (const [dx, dy] of DIRS) {
      let w = 0;
      for (let k = -4; k <= 4; k++) {
        if (k === 0) continue;
        const cx = x + k * dx, cy = y + k * dy;
        if (board.get(cx, cy) !== EMPTY) continue;
        board.put(cx, cy, p);
        if (lineWin(board, cx, cy, dx, dy, p)) w++;
        board.remove(cx, cy);
      }
      if (w) {
        threatDirs++;
        threatCells += w;
        total += 2000 + 1500 * (w - 1);
      } else {
        total += shapeScore(board, x, y, dx, dy, p);
      }
    }
    board.remove(x, y);
    if (threatDirs >= 2) total += 40000;
    else if (threatCells >= 2) total += 3000;
    return total;
  }

  // p đánh (x,y) có thắng chắc sau 2 nước không (đối thủ chặn kiểu gì cũng thua)?
  // checkCounter: kiểm tra đối thủ có thắng ngay được không sau nước này.
  function forcesWin(board, x, y, p, cands, checkCounter) {
    const opp = other(p);
    board.put(x, y, p);
    try {
      const W = winCellsAround(board, x, y, p);
      if (W.length === 0) return false;
      if (checkCounter) {
        for (const [cx, cy] of cands) {
          if (board.get(cx, cy) === EMPTY && winsIfPlaced(board, cx, cy, opp)) return false;
        }
      }
      // Mọi nước chặn có ý nghĩa đều nằm trên các đường đi qua ô thắng.
      const replies = new Map();
      for (const [wx, wy] of W) {
        for (const [dx, dy] of DIRS) {
          for (let k = -5; k <= 5; k++) {
            const rx = wx + k * dx, ry = wy + k * dy;
            if (board.get(rx, ry) === EMPTY) replies.set(key(rx, ry), [rx, ry]);
          }
        }
      }
      for (const [rx, ry] of replies.values()) {
        if (forbidden(board, rx, ry, opp)) continue; // Renju: X không được chặn vào ô cấm
        board.put(rx, ry, opp);
        let still = false;
        for (const [wx, wy] of W) {
          if (board.get(wx, wy) === EMPTY && winsIfPlaced(board, wx, wy, p)) { still = true; break; }
        }
        board.remove(rx, ry);
        if (!still) return false;
      }
      return true;
    } finally {
      board.remove(x, y);
    }
  }

  function opponentHasForce(board, opp, limit) {
    const cands = candidates(board, 2);
    const ranked = cands
      .map((c) => ({ c, s: cellScore(board, c[0], c[1], opp) }))
      .filter((o) => o.s >= 2000)
      .sort((a, b) => b.s - a.s)
      .slice(0, limit);
    for (const { c } of ranked) {
      if (forcesWin(board, c[0], c[1], opp, cands, true)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- Tìm chuỗi nước ép (VCF)
  // Mỗi nước của p tạo đe doạ thắng ngay; đối thủ buộc phải chặn; lặp lại tới khi không chặn nổi.

  /** Các nước chặn của đối thủ làm mất hết các ô thắng W của p (đang có quân p vừa đánh). */
  function blockingReplies(board, W, p) {
    const opp = other(p);
    const cells = new Map();
    for (const [wx, wy] of W) {
      for (const [dx, dy] of DIRS) {
        for (let k = -5; k <= 5; k++) {
          const rx = wx + k * dx, ry = wy + k * dy;
          if (board.get(rx, ry) === EMPTY) cells.set(key(rx, ry), [rx, ry]);
        }
      }
    }
    const out = [];
    for (const [rx, ry] of cells.values()) {
      board.put(rx, ry, opp);
      const stillWins = W.some(([wx, wy]) => board.get(wx, wy) === EMPTY && winsIfPlaced(board, wx, wy, p));
      board.remove(rx, ry);
      if (!stillWins && !forbidden(board, rx, ry, opp)) out.push([rx, ry]);
    }
    return out;
  }

  /**
   * Tìm nước đầu của một chuỗi ép thắng cho p (giả sử đối thủ không có nước thắng ngay).
   * depth: số nước tấn công tối đa. ctx.deadline: hết giờ thì bỏ cuộc (trả null).
   */
  // Lọc nhanh: đánh vào (x,y) chỉ có thể tạo đe doạ nếu trên 1 đường có ≥ 2 quân p trong 4 ô mỗi bên (chưa bị chặn).
  function couldThreat(board, x, y, p) {
    for (const [dx, dy] of DIRS) {
      let n = 0;
      for (let k = 1; k <= 4; k++) { const v = board.get(x + k * dx, y + k * dy); if (v === p) n++; else if (v !== EMPTY) break; }
      for (let k = 1; k <= 4; k++) { const v = board.get(x - k * dx, y - k * dy); if (v === p) n++; else if (v !== EMPTY) break; }
      if (n >= 2) return true;
    }
    return false;
  }

  function vcf(board, p, depth, ctx) {
    if (depth <= 0 || Date.now() > ctx.deadline) return null;
    const opp = other(p);
    const threats = [];
    for (const [x, y] of legal(board, candidates(board, 2), p)) {
      if (!couldThreat(board, x, y, p)) continue;
      board.put(x, y, p);
      const W = winCellsAround(board, x, y, p);
      board.remove(x, y);
      if (W.length) threats.push({ c: [x, y], n: W.length });
    }
    threats.sort((a, b) => b.n - a.n);
    for (const { c } of threats.slice(0, 12)) {
      if (Date.now() > ctx.deadline) return null;
      board.put(c[0], c[1], p);
      const W = winCellsAround(board, c[0], c[1], p);
      const replies = blockingReplies(board, W, p);
      let forced = true;
      for (const [rx, ry] of replies) {
        board.put(rx, ry, opp);
        // Nước chặn tạo luôn đe doạ thắng cho đối thủ -> chuỗi ép bị gãy.
        const counter = winCellsAround(board, rx, ry, opp).length > 0;
        const ok = !counter && vcf(board, p, depth - 1, ctx);
        board.remove(rx, ry);
        if (!ok) { forced = false; break; }
      }
      board.remove(c[0], c[1]);
      if (forced) return c;
    }
    return null;
  }

  /**
   * Chọn nước đi cho p.
   * level: 1 = Dễ, 2 = Vừa, 3 = Khó.
   * opts (mức Khó): vcfDepth / vcfMs – độ sâu và thời gian tìm chuỗi ép của mình,
   *                 defDepth / defMs – của đối thủ (để phá). Mặc định như trước: 5 / 450ms, 4 / 250ms.
   */
  /**
   * Điểm thưởng theo lối đánh của nhân vật máy (bots.js) khi p đánh vào ô trống (x,y).
   * w.dbl  – nước đôi: thưởng ô giao điểm, nơi quân mới góp thế trên nhiều đường cùng lúc.
   * w.trap – gài bẫy: thưởng nước "nhảy" cách quân mình 1 ô (không sát quân nào), trừ điểm nước bám sát nước vừa đi
   *          của đối thủ, thưởng thế 3 có khe (khó nhìn ra).
   */
  function styleBonus(board, x, y, p, w) {
    if (!w || (!w.dbl && !w.trap)) return 0;
    const opp = other(p);
    let dirs2 = 0, dirs3 = 0, split3 = 0;
    for (const [dx, dy] of DIRS) {
      // Cửa sổ 5 ô chứa (x,y), không có quân đối thủ: nhiều quân mình nhất là bao nhiêu (kể cả quân mới)?
      let best = 0, gap = false;
      for (let st = -4; st <= 0; st++) {
        let n = 1, blocked = false, holes = 0;
        for (let k = st; k < st + 5; k++) {
          if (!k) continue;
          const v = board.get(x + k * dx, y + k * dy);
          if (v === opp) { blocked = true; break; }
          if (v === p) n++;
          else if (k > st && k < st + 4) holes++;
        }
        if (!blocked && n > best) { best = n; gap = holes > 0 && n === 3; }
      }
      if (best >= 2) dirs2++;
      if (best >= 3) dirs3++;
      if (gap) split3++;
    }
    let b = 0;
    if (w.dbl) b += w.dbl * (60 * Math.max(0, dirs2 - 1) + 400 * Math.max(0, dirs3 - 1));
    if (w.trap) {
      let adj = false, near = false;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          if (!dx && !dy) continue;
          const v = board.get(x + dx, y + dy);
          if (!v) continue;
          if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) adj = true;
          else if (v === p) near = true;
        }
      }
      const last = board.moves[board.moves.length - 1];
      const nearLast = last && last.p === opp && Math.abs(last.x - x) <= 1 && Math.abs(last.y - y) <= 1;
      b += w.trap * ((!adj && near ? 80 : 0) - (nearLast ? 60 : 0) + 120 * split3);
    }
    return b;
  }

  /** Bỏ các ô cấm (Renju, quân X) khỏi danh sách ô. */
  function legal(board, cells, p) {
    if (board.rule !== 'renju' || p !== X) return cells;
    return cells.filter(([x, y]) => !forbidden(board, x, y, p));
  }

  function chooseMove(board, p, level, rng, opts) {
    rng = rng || Math.random;
    const o = { vcfDepth: 5, vcfMs: 450, defDepth: 4, defMs: 250, ...(opts || {}) };
    const opp = other(p);
    const cands = legal(board, candidates(board, 2), p);
    if (board.moves.length === 0) return [0, 0];

    // 1. Thắng ngay.
    for (const [x, y] of cands) if (winsIfPlaced(board, x, y, p)) return [x, y];

    // Chấm điểm tấn công + phòng thủ (+ lối đánh của nhân vật: o.atkW, o.defW, o.dbl, o.trap – xem bots.js).
    const atkW = o.atkW || 1;
    const defW = (level === 1 ? 0.6 : level === 2 ? 0.85 : 0.95) * (o.defW || 1);
    const scored = cands.map(([x, y]) => ({
      c: [x, y],
      s: atkW * cellScore(board, x, y, p) + defW * cellScore(board, x, y, opp) + styleBonus(board, x, y, p, o) + rng() * (level === 1 ? 60 : 3),
    }));
    scored.sort((a, b) => b.s - a.s);

    // 2. Đối thủ sắp thắng -> bắt buộc chặn.
    const oppWins = cands.filter(([x, y]) => winsIfPlaced(board, x, y, opp));
    if (oppWins.length) {
      if (level === 1 && rng() < 0.15) return scored[0].c;
      for (const { c } of scored) {
        board.put(c[0], c[1], p);
        const ok = oppWins.every(([wx, wy]) => board.get(wx, wy) !== EMPTY || !winsIfPlaced(board, wx, wy, opp));
        board.remove(c[0], c[1]);
        if (ok) return c;
      }
      return scored[0].c;
    }

    if (level === 1) {
      const top = scored.slice(0, Math.min(3, scored.length));
      return top[Math.floor(rng() * top.length)].c;
    }

    // 3. Nước thắng chắc (tạo đe doạ không thể chặn hết).
    for (const { c } of scored.slice(0, 30)) {
      if (forcesWin(board, c[0], c[1], p, cands, false)) return c;
    }

    if (level === 2) {
      // Lối Tấn công: tìm chuỗi ép ngắn cho mình từ sớm.
      if (o.vcfEarly) {
        const mine = vcf(board, p, 3, { deadline: Date.now() + 150 });
        if (mine) return mine;
      }
      // Lối Phòng thủ: chặn từ sớm mọi nước thắng chắc của đối thủ.
      if (o.defW > 1 && opponentHasForce(board, opp, 8)) {
        for (const { c } of scored.slice(0, 8)) {
          board.put(c[0], c[1], p);
          const bad = opponentHasForce(board, opp, 8);
          board.remove(c[0], c[1]);
          if (!bad) return c;
        }
      }
    }

    // 4. Khó: tìm chuỗi nước ép sâu hơn cho mình, và phá chuỗi ép của đối thủ.
    if (level >= 3) {
      const ctx = { deadline: Date.now() + o.vcfMs };
      const mine = vcf(board, p, o.vcfDepth, ctx);
      if (mine) return mine;
      const theirs = vcf(board, opp, o.defDepth, { deadline: Date.now() + o.defMs });
      if (theirs) {
        // Thử các nước tốt nhất + ô mở đầu chuỗi của đối thủ; chọn nước làm chuỗi ép của họ không còn.
        const tries = [theirs, ...scored.slice(0, 10).map((o) => o.c)];
        const budget = Date.now() + 500;
        for (const c of tries) {
          if (board.get(c[0], c[1]) !== EMPTY) continue;
          board.put(c[0], c[1], p);
          const still = Date.now() < budget && vcf(board, opp, o.defDepth, { deadline: Math.min(budget, Date.now() + 80) });
          board.remove(c[0], c[1]);
          if (!still) return c;
        }
        return theirs;
      }
    }

    // 5. Khó: tránh để đối thủ có nước thắng chắc.
    if (level >= 3 && opponentHasForce(board, opp, 15)) {
      for (const { c } of scored.slice(0, 12)) {
        board.put(c[0], c[1], p);
        const bad = opponentHasForce(board, opp, 15);
        board.remove(c[0], c[1]);
        if (!bad) return c;
      }
    }

    return scored[0].c;
  }

  const Caro = {
    EMPTY, X, O, DIRS, RULES, ruleOf, Board, key, other, lineWin, checkWin, winsIfPlaced, candidates, cellScore, forcesWin, vcf, chooseMove,
    winCellsAround, blockingReplies, forbidden, legal, winLen, styleBonus,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Caro;
  else global.Caro = Caro;
})(typeof window !== 'undefined' ? window : globalThis);
