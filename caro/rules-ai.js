/*
 * Cờ Caro – AI cục bộ dùng chung (trình duyệt, Web Worker, Node): ô ứng viên, chấm điểm hình cờ, nước ép thắng,
 * tìm chuỗi nước ép (VCF), lối đánh của nhân vật máy, chọn nước theo mức (chooseMove).
 * Cần luật ở rules.js. Trình duyệt / Worker: nạp ngay sau rules.js, tự gắn thêm hàm vào window.Caro.
 * Node: rules.js tự nạp file này (module.exports là hàm nhận Caro, trả về các hàm AI).
 */
(function (global) {
  'use strict';

  function makeAI(C) {
    const { EMPTY, X, DIRS, key, other, lineWin, checkWin, winsIfPlaced, forbidden } = C;

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

    return { candidates, cellScore, forcesWin, vcf, chooseMove, winCellsAround, blockingReplies, legal, styleBonus };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = makeAI;
  else Object.assign(global.Caro, makeAI(global.Caro));
})(typeof window !== 'undefined' ? window : globalThis);
