/*
 * Engine phân tích Caro (luật Việt Nam + Gomoku tự do / tiêu chuẩn / Renju), tự viết – học ý tưởng từ các engine Gomoku mạnh
 * (Rapfi, Wine, Yixin…) và tài liệu Allis (threat-space search) nhưng không dùng mã nguồn của họ.
 *
 * Luật (giống rules.js): hàng ≥ 5 quân thắng nếu còn ít nhất một đầu trống; 4 quân liền mà hai đầu đều trống thắng ngay;
 * hàng bị chặn cả hai đầu không bao giờ thắng (luật Việt Nam); tự do: ≥ 5; tiêu chuẩn: đúng 5; Renju: X đúng 5 và có nước cấm.
 *
 * Hub – gom các phần (mỗi file một việc):
 *  - engine-patterns.js  mẫu đường / mẫu chéo theo ô (vét cạn đúng luật, bảng tra)
 *  - engine-position.js  thế cờ: đi / lùi, cập nhật dần mẫu hình, ô thắng, khoá Zobrist
 *  - engine-renju.js     nước cấm Renju              ┐
 *  - engine-eval.js      chấm điểm thế cờ             ├ gắn vào Position.prototype
 *  - engine-moves.js     sinh nước, đe doạ, phòng thủ ┘
 *  - engine-search.js    Alpha-Beta + chuỗi bốn (VCF)
 *  - engine-vct.js       chuỗi đe doạ ba / bốn (VCT, Allis) – gắn vào Search.prototype
 * Ở đây: analyse() – điểm vào duy nhất (chuỗi ép ở gốc, rồi làm sâu dần có kiểm nước định đi) và winChance().
 * Trình duyệt nạp các file trên trước engine.js (index.html, ai-worker.js); Node tự require.
 */
(function (global) {
  'use strict';
  const need = (name, file) => global[name] || (typeof require === 'function' ? require(file) : null);
  const CP = need('CaroPosition', './engine-position.js');
  const { Position } = CP;
  const { WIN, MATE } = CP.K;
  for (const part of [need('CaroRenju', './engine-renju.js'), need('CaroEval', './engine-eval.js'), need('CaroMoves', './engine-moves.js')]) CP.mixin(Position, part.Mixin);
  const { EVAL } = need('CaroEval', './engine-eval.js');
  const { Search } = need('CaroSearch', './engine-search.js');

  // Tìm chuỗi đe doạ VCT (engine-vct.js – theo threat-space search của Allis)
  const VCT = need('CaroVct', './engine-vct.js');
  if (VCT) VCT.install(Search.prototype);

  /**
   * Phân tích một thế cờ (moves: [[x, y], …], bên tới lượt = X nếu số nước chẵn).
   * opts: { ms (thời gian, mặc định 500), maxDepth (mặc định 20), tt (Map dùng lại giữa các lần gọi), rule,
   *         nodes (giới hạn theo số nút thay cho thời gian; ms khi đó là giới hạn cứng – xem engine-search.js),
   *         smooth (điểm = trung bình hai lớp cuối – xem dưới), carry (máy đánh: dùng lại bảng ghi nhớ của nước trước) }.
   * Trả về { move: [x, y], score, depth, nodes, pv: [[x, y]…], mate: số nước tới thắng (+ bên tới lượt thắng, − thua) | null }.
   */
  function analyse(moves, opts) {
    opts = opts || {};
    const pos = new Position(moves, opts.rule);
    if (opts.carry && !opts.tt) opts = { ...opts, ...carried(moves, opts, pos.side) };
    if (opts.style) Object.assign(pos.style, opts.style);
    if (opts.patOrder === false) pos.patOrder = false;
    if (opts.policy === false) pos.policy = false;
    pos.rootSide = pos.side; pos.rootCount = pos.count;
    const p = pos.side;
    if (!moves.length) return { move: [0, 0], score: 0, depth: 0, nodes: 0, pv: [[0, 0]], mate: null };
    // Thắng ngay
    const wins = pos.winCells(p);
    if (wins.length) return { move: pos.xy(wins[0]), score: WIN - 1, depth: 1, nodes: 1, pv: [pos.xy(wins[0])], mate: 1 };
    const S = new Search(pos, opts);
    // Chuỗi ép cho bên tới lượt trước (nhanh, chính xác hơn tìm rộng)
    // Các phần chia nhau quỹ của lượt tìm (B: số nút hoặc ms, theo đồng hồ của Search)
    const B = S.budget || opts.ms || 500;
    const v = S.vcfRoot(opts.vcfDepth || 12, S.clock() + B * 0.45);
    if (v) {
      const plies = 2 * v.len - 1;
      return { move: pos.xy(v.move), score: WIN - plies, depth: plies, nodes: S.nodes, pv: [pos.xy(v.move)], mate: v.len };
    }
    // Chuỗi đe doạ ba / bốn (VCT) – thắng chắc nếu tìm thấy
    if (opts.vct !== false && S.vctRoot) {
      const t = S.vctRoot(opts.vctDepth || 8, S.clock() + B * (opts.vctTime || 0.2));
      if (t) {
        const plies = 2 * t.len - 1;
        return { move: pos.xy(t.move), score: WIN - plies, depth: plies, nodes: S.nodes, pv: [pos.xy(t.move)], mate: t.len };
      }
    }
    // Lọc nước để đối thủ có chuỗi ép (tốn tối đa ~30% thời gian)
    if (opts.safeRoot !== false && opts.rootVcf !== false) S.rootMoves = S.safeRoot(opts.defDepth || 6, S.clock() + B * 0.3);
    // Làm sâu dần; sau mỗi lớp, nước tốt nhất mới được kiểm (như "blunder check"): sau nước đó đối thủ có chuỗi đe doạ (VCT)
    // không – có thì bỏ nước đó và tìm lại lớp này (bảng ghi nhớ còn nóng nên nhanh). Mỗi nước kiểm một lần.
    const verify = opts.vct !== false && opts.safeRoot !== false && !!S.vctFind;
    const checked = new Map(); // nước → an toàn?
    let result = null;
    // Điểm của hai lớp đã xong gần nhất (cùng tập nước ở gốc) – cho opts.smooth
    let last = null, prev = null;
    const maxDepth = opts.maxDepth || 20;
    for (let d = 1, bad = 0; d <= maxDepth; d++) {
      const pv = [];
      const s = S.negamax(d, -WIN - 1, WIN + 1, 0, pv);
      if (S.stop && result) break;
      if (pv.length) result = { score: s, depth: d, pv: pv.slice() };
      else if (!result) result = { score: s, depth: d, pv: [(S.rootMoves || pos.candidates(p, 1))[0]] };
      if (S.stop) break;
      const m = result.pv[0];
      if (verify && s > -MATE && s < MATE && !checked.has(m) && bad < 6) {
        const end = S.deadline;
        S.deadline = Math.min(end, S.clock() + B * (opts.vctVerify || 0.25));
        pos.play(m, p);
        const t = pos.winCount[p] ? null : S.vctFind(opts.vctDepth || 8);
        pos.undo();
        S.stop = false;
        S.deadline = end;
        checked.set(m, !t);
        if (t) {
          // m thua chắc: bỏ khỏi gốc rồi tìm lại lớp này (nếu còn nước khác)
          const rest = (S.rootMoves || pos.candidates(p, S.rootWidth)).filter((i) => i !== m);
          if (rest.length) { S.rootMoves = rest; bad++; result = null; last = prev = null; d--; continue; }
        }
      }
      prev = last; last = s;
      if (Math.abs(s) >= MATE) break;
    }
    if (!result) result = { score: 0, depth: 0, pv: [(S.rootMoves || pos.candidates(p, 1))[0]] };
    // Lá chấm điểm cộng "tempo" cho bên tới lượt ở lá, nên điểm ở gốc lệch ±tempo theo độ sâu chẵn / lẻ (thế 1 của một ván
    // thử: d3 +93, d4 −361, d5 −68, d6 −351). Phân tích ván so điểm hai thế khác bên tới lượt: lấy trung bình hai lớp cuối
    // để triệt tiêu độ lệch đó, khỏi chấm oan nước thường là "chưa chính xác". Không đổi nước đi; máy đánh không dùng.
    if (opts.smooth && last !== null && prev !== null && result.score === last && Math.abs(last) < MATE && Math.abs(prev) < MATE) {
      result.score = Math.round((last + prev) / 2);
    }
    const mate = result.score >= MATE ? Math.ceil((WIN - result.score) / 2) : result.score <= -MATE ? -Math.ceil((WIN + result.score) / 2) : null;
    return { move: pos.xy(result.pv[0]), score: result.score, depth: result.depth, nodes: S.nodes, pv: result.pv.map((i) => pos.xy(i)), mate };
  }

  /**
   * Bảng ghi nhớ mang sang nước sau (như Stockfish / Rapfi giữ bảng suốt ván): thế mới nối tiếp thế lần trước (cùng các nước
   * đầu, cùng luật, cùng lối đánh, cùng bên đi) thì dùng lại – các nhánh đã tìm ở nước trước khỏi tìm lại. Khoá Zobrist và
   * nước trong bảng theo toạ độ thật (engine-position.js) nên đúng dù vùng mảng đổi. Ván khác: bảng mới.
   */
  let carry = null;
  const CARRY_MAX = 300000; // bảng lớn hơn thế thì làm mới (giữ RAM trên điện thoại)
  function carried(moves, opts, side) {
    const sig = (opts.rule || 'vn') + '|' + side + '|' + JSON.stringify(opts.style || null);
    const c = carry;
    let ok = c && c.sig === sig && moves.length >= c.moves.length && c.tt.size < CARRY_MAX;
    for (let i = 0; ok && i < c.moves.length; i++) ok = moves[i][0] === c.moves[i][0] && moves[i][1] === c.moves[i][1];
    if (!ok) carry = { sig, tt: new Map(), qtt: new Map(), vtt: new Map() };
    carry.moves = moves.map((m) => [m[0], m[1]]);
    return { tt: carry.tt, qtt: carry.qtt, vtt: carry.vtt };
  }

  /** Điểm → khả năng thắng (0..1) của bên tới lượt (giống cách Lichess đổi centipawn sang % thắng). */
  function winChance(score) {
    if (score >= MATE) return 1;
    if (score <= -MATE) return 0;
    return 1 / (1 + Math.exp(-score / 360));
  }

  const CaroEngine = { analyse, winChance, Position, Search, WIN, MATE, EVAL };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroEngine;
  else global.CaroEngine = CaroEngine;
})(typeof window !== 'undefined' ? window : globalThis);
