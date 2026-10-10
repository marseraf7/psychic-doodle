/*
 * Cờ Caro – luật "chặn 2 đầu" (phổ biến ở Việt Nam) + AI.
 *  - Chuỗi bị chặn 1 đầu: đủ 5 quân là thắng.
 *  - Chuỗi không bị chặn đầu nào: đủ 4 quân là thắng.
 *  - Chuỗi bị chặn cả 2 đầu: không tính thắng.
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

  class Board {
    constructor() {
      this.cells = new Map();
      this.moves = [];
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

  // Quân p đã nằm ở (x,y). Trả về các ô của chuỗi thắng theo hướng (dx,dy), hoặc null.
  function lineWin(board, x, y, dx, dy, p) {
    let a = 1;
    while (board.get(x - a * dx, y - a * dy) === p) a++;
    let b = 1;
    while (board.get(x + b * dx, y + b * dy) === p) b++;
    const len = a + b - 1;
    if (len < 4) return null;
    const openA = board.get(x - a * dx, y - a * dy) === EMPTY;
    const openB = board.get(x + b * dx, y + b * dy) === EMPTY;
    const win = (len >= 5 && (openA || openB)) || (openA && openB);
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
      if (!stillWins) out.push([rx, ry]);
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
    for (const [x, y] of candidates(board, 2)) {
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
  function chooseMove(board, p, level, rng, opts) {
    rng = rng || Math.random;
    const o = { vcfDepth: 5, vcfMs: 450, defDepth: 4, defMs: 250, ...(opts || {}) };
    const opp = other(p);
    const cands = candidates(board, 2);
    if (board.moves.length === 0) return [0, 0];

    // 1. Thắng ngay.
    for (const [x, y] of cands) if (winsIfPlaced(board, x, y, p)) return [x, y];

    // Chấm điểm tấn công + phòng thủ.
    const defW = level === 1 ? 0.6 : level === 2 ? 0.85 : 0.95;
    const scored = cands.map(([x, y]) => ({
      c: [x, y],
      s: cellScore(board, x, y, p) + defW * cellScore(board, x, y, opp) + rng() * (level === 1 ? 60 : 3),
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
    EMPTY, X, O, DIRS, Board, key, other, lineWin, checkWin, winsIfPlaced, candidates, cellScore, forcesWin, vcf, chooseMove,
    winCellsAround, blockingReplies,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Caro;
  else global.Caro = Caro;
})(typeof window !== 'undefined' ? window : globalThis);
