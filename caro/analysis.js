/*
 * Phân tích ván cờ (giống phân tích ván của Lichess / chess.com). analyzeGame dùng engine.js (Alpha-Beta + chuỗi ép,
 * đúng luật Caro Việt Nam) chấm từng thế cờ; các hàm tìm chuỗi ép bên dưới vẫn dùng cho Giải đố / Thử lại.
 * Xếp loại nước đi:
 *   best    – nước thắng / giữ được thắng chắc
 *   great   – tự tìm ra chuỗi ép thắng dài (≥ 3 nước)
 *   good    – nước bình thường, không làm hỏng thế cờ
 *   inacc   – chưa chính xác: khả năng thắng tụt ≥ 10%
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

  /** Engine phân tích (engine.js): Alpha-Beta + tìm chuỗi ép, đúng luật Caro Việt Nam. */
  const engine = () => global.CaroEngine || (typeof require === 'function' ? require('./engine.js') : null);

  // Mức tụt khả năng thắng (0..1) để xếp loại nước đi, như Lichess: ?! chưa chính xác, ? sai lầm, ?? sai lầm nặng
  const DROP = { inacc: 0.1, mistake: 0.18, blunder: 0.3 };

  /**
   * Phân tích cả ván bằng engine: chấm từng thế cờ (khả năng thắng của bên tới lượt), rồi xếp loại từng nước theo
   * mức tụt khả năng thắng, hoặc theo chuỗi thắng chắc nếu engine đã thấy (bỏ lỡ / để thua chắc).
   * opts: { ms: thời gian cho mỗi thế (mặc định tuỳ độ dài ván), rule: luật của ván, onProgress(n, total) }.
   * Trả về { moves: [{ i, p, x, y, cls, best, len, drop, ev, e }], acc: {1: %, 2: %}, counts: {1: {...}, 2: {...}} }
   * (e: khả năng thắng của X sau nước đó, đổi sang −1…+1 cho biểu đồ; ev: xếp loại theo mức tụt, drop: % tụt).
   */
  function analyzeGame(moves, opts) {
    opts = opts || {};
    const EN = engine();
    const n = moves.length;
    const ms = opts.ms || Math.max(60, Math.min(200, Math.round(10000 / (n + 1)))); // cả ván khoảng 10 giây
    const shared = { ms, tt: new Map(), qtt: new Map(), vtt: new Map(), rule: opts.rule };
    const board = new C.Board(opts.rule);
    const evals = []; // evals[i]: thế cờ trước nước i (null = ván đã kết thúc)
    let end = n;
    for (let i = 0; i <= n; i++) {
      evals[i] = EN.analyse(moves.slice(0, i), shared);
      if (opts.onProgress) opts.onProgress(i + 1, n + 1);
      if (i === n) break;
      const [x, y] = moves[i], p = i % 2 === 0 ? C.X : C.O;
      board.play(x, y, p);
      if (checkWin(board, x, y, p)) { end = i + 1; evals[i + 1] = null; break; }
    }
    // Khả năng thắng của bên tới lượt ở thế i (thế đã kết thúc: bên tới lượt đã thua)
    const wc = (i) => (evals[i] ? EN.winChance(evals[i].score) : 0);
    const out = [];
    const hadForced = { 1: false, 2: false };
    for (let i = 0; i < end; i++) {
      const [x, y] = moves[i], p = i % 2 === 0 ? C.X : C.O;
      const r = evals[i], nx = evals[i + 1];
      const won = !nx;
      const before = wc(i), after = won ? 1 : 1 - wc(i + 1);
      const drop = Math.max(0, before - after);
      const rec = { i, p, x, y, cls: 'good', best: null, len: 0, drop: Math.round(drop * 100), ev: false, e: 0 };
      if (won) rec.cls = 'best';
      else if (r.mate > 0) {
        // Đang có chuỗi thắng chắc: giữ được (đối thủ vẫn thua chắc) hay bỏ lỡ?
        if (nx.mate < 0) { rec.cls = r.mate >= 3 && !hadForced[p] ? 'great' : 'best'; rec.len = r.mate; }
        else { rec.cls = 'miss'; rec.best = r.move; rec.len = r.mate; }
      } else if (r.mate < 0) rec.cls = 'lost';
      else if (nx.mate > 0) { rec.cls = nx.mate <= 2 ? 'blunder' : 'mistake'; rec.best = r.move; rec.len = nx.mate; }
      else {
        const cls = drop >= DROP.blunder ? 'blunder' : drop >= DROP.mistake ? 'mistake' : drop >= DROP.inacc ? 'inacc' : 'good';
        if (cls !== 'good') { rec.cls = cls; rec.ev = true; rec.best = r.move; }
      }
      // Biểu đồ: khả năng thắng của X sau nước này
      const wX = won ? (p === C.X ? 1 : 0) : p === C.X ? 1 - wc(i + 1) : wc(i + 1); // thế i+1: tới lượt bên kia
      rec.e = Math.round((2 * wX - 1) * 1000) / 1000;
      hadForced[p] = rec.cls === 'best' || rec.cls === 'great';
      out.push(rec);
    }
    return { moves: out, ...summarize(out) };
  }

  /** Độ chính xác từng nước theo mức tụt khả năng thắng (công thức Lichess công bố), rồi lấy trung bình. */
  const moveAcc = (drop) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669));
  function summarize(list) {
    const counts = { 1: {}, 2: {} }, acc = { 1: 100, 2: 100 };
    for (const p of [1, 2]) {
      const mine = list.filter((m) => m.p === p);
      for (const m of mine) counts[p][m.cls] = (counts[p][m.cls] || 0) + 1;
      const rated = mine.filter((m) => m.cls !== 'lost');
      if (!rated.length) continue;
      acc[p] = Math.round(rated.reduce((t, m) => t + moveAcc(m.drop || 0), 0) / rated.length);
    }
    return { acc, counts };
  }

  const KEY = new Set(['blunder', 'mistake', 'miss', 'great', 'inacc']);
  /** Các thời điểm đáng xem lại. */
  function keyMoments(result) {
    return result.moves.filter((m) => KEY.has(m.cls));
  }

  const CaroAnalysis = { immediateWins, forced, winningMove, bestBlock, analyzeGame, summarize, keyMoments, MAX_DEPTH };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroAnalysis;
  else global.CaroAnalysis = CaroAnalysis;
})(typeof window !== 'undefined' ? window : globalThis);
