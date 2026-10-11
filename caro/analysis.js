/*
 * Phân tích ván cờ (giống "Game Review" của chess.com, rút gọn cho Caro).
 * Mỗi nước được xếp loại dựa trên chuỗi nước ép (VCF) của 2 bên:
 *   best    – nước thắng / giữ được thắng chắc
 *   great   – tự tìm ra chuỗi ép thắng dài (≥ 3 nước)
 *   good    – nước bình thường, không làm hỏng thế cờ
 *   miss    – bỏ lỡ nước thắng (thắng ngay hoặc chuỗi ép)
 *   mistake – để đối thủ có chuỗi ép thắng trong khi có nước tránh được
 *   blunder – không chặn nước thắng ngay của đối thủ, hoặc để thua chỉ sau 1–2 nước
 *   lost    – thế đã thua, nước nào cũng không cứu được (không tính vào độ chính xác)
 * Chạy được trên trình duyệt (window.CaroAnalysis), Web Worker và Node.
 */
(function (global) {
  'use strict';
  const C = global.Caro || (typeof require === 'function' ? require('./rules.js') : null);
  const { EMPTY, other, winsIfPlaced, checkWin, candidates, cellScore, vcf, winCellsAround, blockingReplies, chooseMove } = C;

  const MAX_DEPTH = 6;

  /** Các ô p đánh vào là thắng ngay. Ô thắng luôn kề 1 quân của p nên chỉ cần quét bán kính 1. */
  function immediateWins(board, p) {
    const out = [];
    for (const [x, y] of candidates(board, 1)) if (winsIfPlaced(board, x, y, p)) out.push([x, y]);
    return out;
  }

  /**
   * p (tới lượt) có thắng chắc không? Trả về { move, len } – len là số nước của p tính cả nước thắng cuối –
   * hoặc null. Tìm theo độ sâu tăng dần để có chuỗi ngắn nhất.
   */
  function forced(board, p, depth, ctx) {
    const w = immediateWins(board, p);
    if (w.length) return { move: w[0], len: 1 };
    if (immediateWins(board, other(p)).length) return null; // phải chặn trước đã
    ctx = ctx || { deadline: Date.now() + 300 };
    for (let d = 1; d <= (depth || MAX_DEPTH); d++) {
      if (Date.now() > ctx.deadline) return null;
      const m = vcf(board, p, d, ctx);
      if (m) return { move: m, len: d + 1 };
    }
    return null;
  }

  /**
   * Nước m của p có giữ được thắng chắc không (thắng ngay, hoặc là nước ép mà mọi cách chặn vẫn thua)?
   * depth: số nước ép còn được phép.
   */
  function winningMove(board, p, m, depth, ctx) {
    const [x, y] = m;
    if (board.get(x, y) !== EMPTY) return false;
    if (winsIfPlaced(board, x, y, p)) return true;
    if (immediateWins(board, other(p)).length) return false;
    ctx = ctx || { deadline: Date.now() + 300 };
    const opp = other(p);
    // play/undo (không phải put) để vùng tìm nước ép mở rộng quanh các quân vừa đặt.
    board.play(x, y, p);
    try {
      const W = winCellsAround(board, x, y, p);
      if (!W.length) return false;
      for (const [rx, ry] of blockingReplies(board, W, p)) {
        board.play(rx, ry, opp);
        const counter = winCellsAround(board, rx, ry, opp).length > 0;
        const ok = !counter && depth > 1 && (immediateWins(board, p).length > 0 || vcf(board, p, depth - 1, ctx));
        board.undo();
        if (!ok) return false;
      }
      return true;
    } finally {
      board.undo();
    }
  }

  /** Nước chặn tốt nhất của p trước đe doạ W của đối thủ (dùng cho máy trả lời trong bài đố). */
  function bestBlock(board, p, threatCell) {
    const opp = other(p);
    const [tx, ty] = threatCell;
    const W = winCellsAround(board, tx, ty, opp);
    const replies = W.length ? blockingReplies(board, W, opp) : [];
    if (!replies.length) return null;
    let best = replies[0], bs = -Infinity;
    for (const [x, y] of replies) {
      // Ưu tiên chặn mà tạo đe doạ phản công, rồi tới chặn có thế đẹp.
      const s = cellScore(board, x, y, p) + 0.5 * cellScore(board, x, y, opp);
      if (s > bs) { bs = s; best = [x, y]; }
    }
    return best;
  }

  const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];

  /** Tìm nước thay thế cho p mà sau đó đối thủ không còn thắng chắc. */
  function findSaver(board, p, played, hints, ms) {
    const q = other(p);
    const deadline = Date.now() + ms;
    const tries = [...hints];
    const scored = candidates(board, 2)
      .map((c) => ({ c, s: cellScore(board, c[0], c[1], p) + cellScore(board, c[0], c[1], q) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((o) => o.c);
    tries.push(...scored);
    const seen = new Set();
    for (const c of tries) {
      if (!c || same(c, played) || board.get(c[0], c[1]) !== EMPTY) continue;
      const k = c[0] + ',' + c[1];
      if (seen.has(k)) continue;
      seen.add(k);
      if (Date.now() > deadline) break;
      board.put(c[0], c[1], p);
      const f = forced(board, q, 4, { deadline: Math.min(deadline, Date.now() + 120) });
      board.remove(c[0], c[1]);
      if (!f) return c;
    }
    return null;
  }

  /**
   * Điểm thế cờ cho biểu đồ lợi thế (giống biểu đồ của Lichess), theo góc nhìn X: -1 (O thắng chắc) … +1 (X thắng chắc).
   * Đã biết bên thắng chắc (từ phép tìm chuỗi ép) thì ±1; còn lại ước lượng bằng ô mạnh nhất của mỗi bên
   * (cellScore của AI: thế 3, thế 4, đánh hai đường…), bên tới lượt được lợi thêm một nhịp.
   */
  function evalAfter(board, p, q, adv) {
    const toX = (v, side) => (side === C.X ? v : -v);
    if (adv) return toX(1, adv);
    let a = 0, b = 0;
    for (const [cx, cy] of candidates(board, 2)) {
      a = Math.max(a, cellScore(board, cx, cy, q));
      b = Math.max(b, cellScore(board, cx, cy, p));
    }
    // Chỉ dao động nhẹ (±0,45): chưa ai thắng chắc thì thế cờ còn cân; ±1 dành cho lúc đã có chuỗi thắng
    return toX(Math.tanh((a - b) / 9000) * 0.45, q);
  }

  /**
   * Phân tích cả ván. moves: [[x,y], ...] – X đi trước, luân phiên.
   * Trả về { moves: [{ i, p, x, y, cls, best, len, e }], acc: {1: %, 2: %}, counts: {1: {...}, 2: {...}} }
   * (e: điểm thế cờ sau nước đó cho biểu đồ, xem evalAfter).
   */
  function analyzeGame(moves, opts) {
    opts = opts || {};
    const ms = opts.ms || 100;
    const board = new C.Board();
    const out = [];
    const hadForced = { 1: false, 2: false };
    for (let i = 0; i < moves.length; i++) {
      const [x, y] = moves[i];
      const p = i % 2 === 0 ? C.X : C.O;
      const q = other(p);
      const rec = { i, p, x, y, cls: 'good', best: null, len: 0, e: 0 };
      let adv = 0; // sau nước này bên nào đã thắng chắc (biết từ các phép tìm chuỗi ép bên dưới)
      const ctx = () => ({ deadline: Date.now() + ms });

      const myWins = immediateWins(board, p);
      const theirWins = immediateWins(board, q);
      if (myWins.length) {
        if (winsIfPlaced(board, x, y, p)) { rec.cls = 'best'; adv = p; }
        else { rec.cls = 'miss'; rec.best = myWins[0]; rec.len = 1; }
      } else if (theirWins.length) {
        board.put(x, y, p);
        const still = theirWins.some(([wx, wy]) => board.get(wx, wy) === EMPTY && winsIfPlaced(board, wx, wy, q));
        board.remove(x, y);
        if (still) {
          // Có ô chặn được hết không?
          const block = candidates(board, 2).find(([cx, cy]) => {
            board.put(cx, cy, p);
            const ok = immediateWins(board, q).length === 0;
            board.remove(cx, cy);
            return ok;
          });
          rec.cls = block ? 'blunder' : 'lost';
          rec.best = block || null;
          adv = q;
        } else {
          // Chặn đúng; xem có nước chặn nào tốt hơn không.
          board.put(x, y, p);
          const f = forced(board, q, 4, ctx());
          board.remove(x, y);
          if (f) {
            const alt = findSaver(board, p, [x, y], theirWins, ms * 2);
            rec.cls = alt ? 'mistake' : 'lost';
            rec.best = alt;
            adv = q;
          }
        }
      } else {
        const mine = forced(board, p, MAX_DEPTH, ctx());
        if (mine) {
          if (winningMove(board, p, [x, y], mine.len + 1, { deadline: Date.now() + ms * 4 })) {
            rec.cls = mine.len >= 3 && !hadForced[p] ? 'great' : 'best';
            rec.len = mine.len;
            adv = p;
          } else {
            rec.cls = 'miss'; rec.best = mine.move; rec.len = mine.len;
          }
        }
        // Dù có bỏ lỡ hay không: nước này có để đối thủ thắng chắc không?
        if (rec.cls !== 'best' && rec.cls !== 'great') {
          board.put(x, y, p);
          const f = forced(board, q, 4, ctx());
          board.remove(x, y);
          if (f) {
            adv = q;
            const theirs = forced(board, q, 4, ctx());
            let ai = null;
            try { ai = chooseMove(board, p, 3, () => 0.5, { vcfMs: 150, defMs: 120 }); } catch (e) { ai = null; }
            const alt = rec.best || findSaver(board, p, [x, y], [theirs && theirs.move, ai], ms * 2);
            if (alt) {
              if (rec.cls !== 'miss') rec.cls = f.len <= 2 ? 'blunder' : 'mistake';
              rec.best = alt;
            } else if (rec.cls !== 'miss') rec.cls = 'lost';
          }
        }
      }
      hadForced[p] = rec.cls === 'best' || rec.cls === 'great';
      out.push(rec);
      board.play(x, y, p);
      rec.e = evalAfter(board, p, q, adv);
      if (opts.onProgress) opts.onProgress(i + 1, moves.length);
      if (checkWin(board, x, y, p)) break;
    }
    // Làm mượt phần ước lượng theo từng cặp nước (bỏ hiện tượng "ai vừa đi trông như đang lợi"), giữ nguyên ±1
    let prev = 0;
    for (const m of out) {
      const raw = m.e;
      if (Math.abs(raw) < 1) m.e = (raw + prev) / 2;
      m.e = Math.round(m.e * 1000) / 1000;
      prev = Math.abs(raw) < 1 ? raw : 0;
    }
    return { moves: out, ...summarize(out) };
  }

  const PENALTY = { blunder: 1, mistake: 0.7, miss: 0.7 };
  function summarize(list) {
    const counts = { 1: {}, 2: {} }, acc = { 1: 100, 2: 100 };
    for (const p of [1, 2]) {
      const mine = list.filter((m) => m.p === p);
      for (const m of mine) counts[p][m.cls] = (counts[p][m.cls] || 0) + 1;
      const rated = mine.filter((m) => m.cls !== 'lost');
      if (!rated.length) continue;
      const pen = rated.reduce((s, m) => s + (m.cls === 'miss' && m.len === 1 ? 1 : PENALTY[m.cls] || 0), 0);
      acc[p] = Math.round(Math.max(0, 100 * (1 - pen / Math.max(rated.length, 6))));
    }
    return { acc, counts };
  }

  const KEY = new Set(['blunder', 'mistake', 'miss', 'great']);
  /** Các thời điểm đáng xem lại. */
  function keyMoments(result) {
    return result.moves.filter((m) => KEY.has(m.cls));
  }

  const CaroAnalysis = { immediateWins, forced, winningMove, bestBlock, analyzeGame, summarize, keyMoments, evalAfter, MAX_DEPTH };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroAnalysis;
  else global.CaroAnalysis = CaroAnalysis;
})(typeof window !== 'undefined' ? window : globalThis);
