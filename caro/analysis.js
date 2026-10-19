/*
 * Phân tích ván cờ (giống phân tích ván của Lichess / chess.com). analyzeGame dùng engine.js (Alpha-Beta + chuỗi ép,
 * đúng luật Caro Việt Nam) chấm từng thế cờ; các hàm tìm chuỗi ép bên dưới vẫn dùng cho Giải đố / Thử lại.
 * Xếp loại nước đi:
 *   best    – nước thắng / giữ được thắng chắc
 *   great   – tự tìm ra chuỗi ép thắng dài (≥ 3 nước)
 *   only    – nước duy nhất: đối thủ đang doạ, mọi nước khác đều để đối thủ có chuỗi bốn thắng (lọc phòng thủ của engine
 *             chỉ còn một nước) và người chơi tìm ra đúng nước đó (như "Great" của chess.com; chặn bốn – nước bắt buộc,
 *             ai cũng thấy – không tính)
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

  // Phân tích ván chấm mỗi thế theo số nút, không theo giờ (engine-search.js): kết quả chỉ phụ thuộc thế cờ và ms – cùng
  // một ván cho cùng kết quả trên mọi máy / trình duyệt, chấm trên 1 hay nhiều Worker, theo thứ tự nào cũng vậy (mỗi thế
  // một bảng nhớ mới). NODES_PER_MS: tốc độ trung vị đo ở chế độ 200 ms (sau khi tính cửa sổ bằng mặt nạ bit: Chromium 168,
  // WebKit 164 nút / ms) → máy thường xong đúng ms; máy quá chậm dừng ở CAP × ms, ít nhất CAP_MIN ms (khi đó kết quả mới
  // tuỳ máy).
  const NODES_PER_MS = 160, CAP = 5, CAP_MIN = 1000;
  // Thời gian mỗi thế của lượt phân tích kỹ theo độ dài ván: cả ván ~20 giây một luồng (chia cho các Worker của an-pool.js).
  // Gấp đôi mức cũ (~10 giây): đo bằng an-bench.js, trùng bản chấm sâu 86,8% → 88,4%, bỏ sót 25 → 17 nước / 372.
  const fullMs = (n) => Math.max(120, Math.min(400, Math.round(20000 / (n + 1))));
  const evalOpts = (ms, rule) => ({ nodes: Math.round(ms * NODES_PER_MS), ms: Math.max(CAP_MIN, ms * CAP), rule, smooth: true });
  /** Chấm một thế cờ cho phân tích ván (bản gọn, xem slim). */
  const evaluate = (moves, ms, rule) => slim(engine().analyse(moves, evalOpts(ms, rule)), ms);

  // Mức tụt khả năng thắng (0..1) để xếp loại nước đi, như Lichess: ?! chưa chính xác, ? sai lầm, ?? sai lầm nặng
  const DROP = { inacc: 0.1, mistake: 0.18, blunder: 0.3 };

  /**
   * Phân tích cả ván bằng engine: chấm từng thế cờ (khả năng thắng của bên tới lượt), rồi xếp loại từng nước theo
   * mức tụt khả năng thắng, hoặc theo chuỗi thắng chắc nếu engine đã thấy (bỏ lỡ / để thua chắc).
   * opts: { ms: thời gian cho mỗi thế (mặc định tuỳ độ dài ván), rule: luật của ván, onProgress(n, total),
   *         evals: các thế đã chấm sẵn (phân tích ngầm lúc chơi / lượt nhanh) – thế nào đã chấm với thời gian ≥ ms thì dùng lại }.
   * Kết quả có thêm evals (gọn: move, score, mate, q = thời gian đã dùng) để lượt sau dùng lại.
   * Trả về { moves: [{ i, p, x, y, cls, best, len, drop, ev, e }], acc: {1: %, 2: %}, counts: {1: {...}, 2: {...}} }
   * (e: khả năng thắng của X sau nước đó, đổi sang −1…+1 cho biểu đồ; ev: xếp loại theo mức tụt, drop: % tụt).
   */
  function analyzeGame(moves, opts) {
    opts = opts || {};
    const EN = engine();
    const n = moves.length;
    const ms = opts.ms || fullMs(n);
    const board = new C.Board(opts.rule);
    const evals = []; // evals[i]: thế cờ trước nước i (null = ván đã kết thúc)
    const pre = opts.evals || [];
    let end = n;
    for (let i = 0; i <= n; i++) {
      evals[i] = reusable(pre[i], ms) ? pre[i] : evaluate(moves.slice(0, i), ms, opts.rule);
      if (opts.onProgress) opts.onProgress(i + 1, n + 1);
      if (i === n) break;
      const [x, y] = moves[i], p = i % 2 === 0 ? C.X : C.O;
      board.play(x, y, p);
      if (checkWin(board, x, y, p)) { end = i + 1; evals[i + 1] = null; break; }
    }
    // Khả năng thắng của bên tới lượt ở thế i (thế đã kết thúc: bên tới lượt đã thua)
    const wc = (i) => (evals[i] ? EN.winChance(evals[i].score) : 0);
    // Thế sau nước tốt nhất của engine (bên kia tới lượt) – chỉ chấm khi cần so với nước đã đi (altNeeded);
    // phân tích ngầm lúc chơi có thể đã chấm sẵn (evals[i].alt)
    const alt = (i) => {
      const e = evals[i];
      if (!reusable(e.alt, ms)) evals[i] = { ...e, alt: evaluate(moves.slice(0, i).concat([e.move]), ms, opts.rule) };
      return evals[i].alt;
    };
    const out = [];
    const hadForced = { 1: false, 2: false };
    for (let i = 0; i < end; i++) {
      const [x, y] = moves[i], p = i % 2 === 0 ? C.X : C.O;
      const r = evals[i], nx = evals[i + 1];
      const won = !nx;
      const isBest = same(r.move, moves[i]); // đi đúng nước engine chọn
      const before = wc(i), after = won ? 1 : 1 - wc(i + 1);
      // Đi đúng nước tốt nhất thì không tụt: chênh lệch giữa hai lần chấm (độ sâu khác nhau) không phải lỗi của người chơi
      let drop = isBest ? 0 : Math.max(0, before - after);
      const rec = { i, p, x, y, cls: 'good', best: null, len: 0, drop: 0, ev: false, e: 0 };
      if (won) rec.cls = 'best';
      else if (r.mate > 0) {
        // Đang có chuỗi thắng chắc: giữ được (đối thủ vẫn thua chắc) hay bỏ lỡ?
        if (nx.mate < 0 || isBest) { rec.cls = r.mate >= 3 && !hadForced[p] ? 'great' : 'best'; rec.len = r.mate; }
        else { rec.cls = 'miss'; rec.best = r.move; rec.len = r.mate; }
      } else if (r.mate < 0) rec.cls = 'lost';
      else if (nx.mate > 0) {
        // Sau nước này đối thủ có chuỗi thắng chắc. Nếu nước tốt nhất của engine cũng thua chắc thì thế đã thua từ trước.
        const b = isBest ? null : alt(i);
        if (isBest || (b && b.mate > 0)) rec.cls = 'lost';
        else { rec.cls = nx.mate <= 2 ? 'blunder' : 'mistake'; rec.best = r.move; rec.len = nx.mate; }
      } else if (drop >= DROP.inacc) {
        // Như Lichess so với nước tốt nhất: chấm thế sau nước tốt nhất cùng độ sâu với thế sau nước đã đi rồi mới so
        const b = alt(i);
        const afterBest = b.mate < 0 ? 1 : b.mate > 0 ? 0 : 1 - EN.winChance(b.score);
        drop = Math.max(0, Math.min(drop, afterBest - after));
        const cls = drop >= DROP.blunder ? 'blunder' : drop >= DROP.mistake ? 'mistake' : drop >= DROP.inacc ? 'inacc' : 'good';
        if (cls !== 'good') { rec.cls = cls; rec.ev = true; rec.best = r.move; }
      }
      // Nước duy nhất: đúng nước engine chọn, thế chưa ngã ngũ, và lọc phòng thủ chỉ còn đúng nước đó (slim: one)
      if (rec.cls === 'good' && isBest && r.one && !r.mate) rec.cls = 'only';
      rec.drop = rec.cls === 'lost' ? 0 : Math.round(drop * 100);
      // Biểu đồ: khả năng thắng của X sau nước này
      const wX = won ? (p === C.X ? 1 : 0) : p === C.X ? 1 - wc(i + 1) : wc(i + 1); // thế i+1: tới lượt bên kia
      rec.e = Math.round((2 * wX - 1) * 1000) / 1000;
      hadForced[p] = rec.cls === 'best' || rec.cls === 'great';
      out.push(rec);
    }
    return { moves: out, ...summarize(out), evals };
  }

  /**
   * Nước i có cần chấm thêm thế sau nước tốt nhất không (để xếp loại cho đúng – xem analyzeGame): chưa thắng, không phải
   * thế thắng / thua chắc, không trùng nước tốt nhất, và sau nước này đối thủ có chuỗi thắng hoặc khả năng thắng tụt ≥ 10%.
   */
  function altNeeded(moves, evals, i) {
    const r = evals[i], nx = evals[i + 1];
    if (!r || !nx || !moves[i] || same(r.move, moves[i]) || r.mate > 0 || r.mate < 0) return false;
    if (nx.mate > 0) return true;
    const EN = engine();
    return EN.winChance(r.score) - (1 - EN.winChance(nx.score)) >= DROP.inacc;
  }

  /** Bản gọn của kết quả engine (gửi qua lại giữa Web Worker và trang); q: số ms đã dùng để chấm. */
  const slim = (r, q) => (r.safe === 1 ? { move: r.move, score: r.score, mate: r.mate, q, one: 1 } : { move: r.move, score: r.score, mate: r.mate, q });
  /** Thế đã chấm sẵn đủ kỹ (thời gian ≥ ms) thì không cần chấm lại. */
  const reusable = (e, ms) => !!e && typeof e.score === 'number' && (e.q || 0) >= ms;

  /**
   * Độ chính xác (theo cách Lichess công bố – lichess.org/page/accuracy; viết lại, không dùng mã của Lichess):
   *   - từng nước: 103,1668 · e^(−0,04354 · mức tụt khả năng thắng tính bằng %) − 3,1669, kẹp 0..100;
   *   - cả ván: trung bình của (a) trung bình có trọng số theo độ biến động – trọng số mỗi nước = độ lệch chuẩn khả năng
   *     thắng (%) trong cửa sổ w thế gần nhất (w = n / 10 kẹp 2..8, kẹp 0,5..12) – và (b) trung bình điều hoà. Một nước
   *     làm hỏng thế cờ kéo điểm xuống đúng mức (trung bình cộng bị các nước dễ – nước ép, nước chặn – che đi); nước ở thế
   *     đang giằng co nặng ký hơn nước ở thế đã ngã ngũ.
   * Nước ở thế đã thua (lost) không tính. Trung bình điều hoà: mỗi nước ít nhất 1 điểm (nước 0 điểm không kéo cả ván về
   * một nửa).
   */
  const moveAcc = (drop) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669));
  function stdev(a) {
    const mu = a.reduce((t, x) => t + x, 0) / a.length;
    return Math.sqrt(a.reduce((t, x) => t + (x - mu) ** 2, 0) / a.length);
  }
  function summarize(list) {
    const counts = { 1: {}, 2: {} }, acc = { 1: 100, 2: 100 };
    // Khả năng thắng của X (%) ở thế đầu và sau từng nước (rec.e: −1…+1)
    const win = [50, ...list.map((m) => 50 * (1 + (m.e || 0)))];
    const w = Math.max(2, Math.min(8, Math.floor(list.length / 10)));
    const weight = (j) => {
      const hi = Math.max(j + 1, w - 1); // nước j: thế j → j + 1; cửa sổ w thế kết thúc ở j + 1 (đầu ván: w thế đầu tiên)
      return Math.max(0.5, Math.min(12, stdev(win.slice(Math.max(0, hi - w + 1), hi + 1))));
    };
    for (const p of [1, 2]) {
      const mine = list.filter((m) => m.p === p);
      for (const m of mine) counts[p][m.cls] = (counts[p][m.cls] || 0) + 1;
      const rated = [];
      list.forEach((m, j) => { if (m.p === p && m.cls !== 'lost') rated.push({ a: moveAcc(m.drop || 0), wt: weight(j) }); });
      if (!rated.length) continue;
      const weighted = rated.reduce((t, r) => t + r.a * r.wt, 0) / rated.reduce((t, r) => t + r.wt, 0);
      const harmonic = rated.length / rated.reduce((t, r) => t + 1 / Math.max(1, r.a), 0);
      acc[p] = Math.round((weighted + harmonic) / 2);
    }
    return { acc, counts };
  }

  /**
   * Nước sát ngưỡng xếp loại (mức tụt cách ngưỡng 10 / 18 / 30% không quá REFINE_BAND điểm) – chỉ nước xếp theo mức tụt,
   * không phải theo chuỗi thắng chắc. Chấm kỹ hơn các thế quanh những nước này thì ít xếp nhầm hơn (study.js – lượt kỹ).
   */
  const REFINE_BAND = 4;
  function refineList(result) {
    const T = [DROP.inacc, DROP.mistake, DROP.blunder].map((d) => Math.round(d * 100));
    return result.moves.filter((m) => (m.cls === 'good' || m.ev) && T.some((t) => Math.abs(m.drop - t) <= REFINE_BAND)).map((m) => m.i);
  }

  const KEY = new Set(['blunder', 'mistake', 'miss', 'great', 'only', 'inacc']);
  /** Các thời điểm đáng xem lại. */
  function keyMoments(result) {
    return result.moves.filter((m) => KEY.has(m.cls));
  }

  const CaroAnalysis = { immediateWins, forced, winningMove, bestBlock, analyzeGame, summarize, keyMoments, refineList, slim, altNeeded, evaluate, evalOpts, fullMs, MAX_DEPTH };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroAnalysis;
  else global.CaroAnalysis = CaroAnalysis;
})(typeof window !== 'undefined' ? window : globalThis);
