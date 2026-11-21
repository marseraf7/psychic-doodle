/*
 * Lời giải thích của "huấn luyện viên" cho nước chưa chính xác / sai lầm / sai lầm nặng / bỏ lỡ trong phân tích ván.
 * Không dùng mô hình ngôn ngữ: dựng câu theo mẫu (i18n-coach.js, 4 ngôn ngữ) từ sự thật của thế cờ – các ô thắng ngay
 * (analysis.js immediateWins), chuỗi bốn liên tiếp VCF (analysis.js forced), ô tạo bốn mở / nước đôi (đặt thử quân rồi
 * đếm ô thắng ngay, đúng mọi luật vì dùng winsIfPlaced của rules.js) – và kết quả xếp loại của analysis.js (rec).
 *   explain(moves, i, rec, rule) → [{ k, at?: [x, y], n?, d? }]  – k: mẫu câu (coach_<k>), theo thứ tự nên đọc
 *   hint(moves, p, rule)         → { k, at? } gợi ý cho "Tìm nước tốt hơn" (không lộ đáp án: chỉ nói đối thủ đang doạ gì)
 *   text(list, T, name)          → chuỗi đã dịch (T: I18N.t, name([x, y]): tên ô)
 * Chạy được trên trình duyệt (window.CaroCoach) và Node (kiểm thử: caro/tests/coach.test.js).
 */
(function (global) {
  'use strict';
  const C = global.Caro || (typeof require === 'function' ? require('./rules.js') : null);
  const A = global.CaroAnalysis || (typeof require === 'function' ? require('./analysis.js') : null);
  const BAD = ['inacc', 'mistake', 'blunder', 'miss'];

  function boardAt(moves, i, rule) {
    const b = new C.Board(rule);
    for (let k = 0; k < i; k++) b.play(moves[k][0], moves[k][1], k % 2 ? C.O : C.X);
    return b;
  }

  /** Các ô p đánh vào thì có ≥ 2 ô thắng ngay (bốn mở / bốn kép – đối thủ không chặn nổi) – nghĩa là p đang có "ba mở". */
  function openFourMakers(board, p, limit) {
    const out = [];
    for (const [x, y] of C.candidates(board, 2)) {
      if (board.get(x, y) !== C.EMPTY || C.winsIfPlaced(board, x, y, p)) continue;
      if (C.forbidden && C.forbidden(board, x, y, p)) continue;
      board.play(x, y, p); // play/undo (không phải put): vùng tìm ô thắng mở rộng quanh quân vừa đặt
      const n = A.immediateWins(board, p).length;
      board.undo();
      if (n >= 2) { out.push([x, y]); if (limit && out.length >= limit) break; }
    }
    return out;
  }

  /**
   * Ô thắng w của p chỉ thắng nhờ "4 mở" (luật Việt Nam: 4 quân hai đầu trống là thắng), không có hướng nào thành năm –
   * tức p đang có 3 mở chứ chưa có bốn. Dùng để không gọi 3 mở là "bốn" trong lời giải thích.
   */
  function openFourWin(board, [x, y], p) {
    if (board.get(x, y) !== C.EMPTY) return false;
    board.put(x, y, p);
    let four = false, five = false;
    for (const [dx, dy] of C.DIRS) {
      const c = C.lineWin(board, x, y, dx, dy, p);
      if (c) { if (c.length >= 5) five = true; else four = true; }
    }
    board.remove(x, y);
    return four && !five;
  }

  /** Trong các ô thắng ngay: ô thành năm nếu có (đối thủ có bốn thật), không thì ô đầu (3 mở thành 4 mở – luật VN). */
  function pickWin(board, cells, p) {
    const five = cells.find((c) => !openFourWin(board, c, p));
    return five ? { at: five, three: false } : { at: cells[0], three: true };
  }

  /** m nằm cùng hàng / cột / chéo với một trong các ô cells, cách ≤ 4 ô (chặn trên đúng đường đe doạ). */
  const onLine = (m, cells) => cells.some(([x, y]) => {
    const dx = Math.abs(m[0] - x), dy = Math.abs(m[1] - y);
    return Math.max(dx, dy) <= 4 && (dx === 0 || dy === 0 || dx === dy);
  });

  /**
   * Giải thích nước thứ i (0-based) đã đi trong ván moves. rec: kết quả analysis.js cho nước này { cls, best, len, drop, ev }.
   * Trả [] cho nước không thuộc loại cần giải thích.
   */
  function explain(moves, i, rec, rule) {
    if (!rec || !BAD.includes(rec.cls) || !moves[i]) return [];
    const board = boardAt(moves, i, rule);
    const p = i % 2 ? C.O : C.X, q = C.other(p);
    const m = moves[i], best = rec.best || null;
    const out = [];
    // 1. Bỏ lỡ thắng
    if (rec.cls === 'miss') {
      const w = A.immediateWins(board, p);
      if (w.length) out.push({ k: 'miss_win', at: w[0] });
      else {
        const f = A.forced(board, p, A.MAX_DEPTH, { deadline: Date.now() + 400 });
        if (f) out.push({ k: 'miss_vcf', at: f.move, n: f.len });
        else if (best) out.push({ k: 'miss_vct', at: best, n: rec.len || 0 });
      }
    }
    // 2. Phòng thủ: so đe doạ của đối thủ trước và sau nước đã đi
    const threesBefore = A.immediateWins(board, q).length ? [] : openFourMakers(board, q);
    board.play(m[0], m[1], p);
    const won = C.checkWin(board, m[0], m[1], p);
    const foursAfter = won ? [] : A.immediateWins(board, q);
    const threesAfter = won || foursAfter.length ? [] : openFourMakers(board, q, 3);
    // Đối thủ chưa có bốn / ba mở nhưng có chuỗi bốn liên tiếp (VCF) sau nước này
    const vcfAfter = won || foursAfter.length || threesAfter.length ? null : A.forced(board, q, A.MAX_DEPTH, { deadline: Date.now() + 400 });
    board.undo();
    // Luật Việt Nam: 4 mở đã là thắng, nên "ô tạo ≥ 2 ô thắng ngay" là ô tạo nước đôi (từ 2 quân / 3 bị chặn…), không
    // phải "3 mở thành 4 mở"; còn ô thắng ngay có thể là 3 mở thành 4 mở (không phải bốn) – dùng câu riêng
    const vn = board.rule === 'vn';
    if (foursAfter.length) {
      // nước của p không thêm quân cho q: bốn / 3 mở này đã có từ trước
      board.play(m[0], m[1], p);
      const w = pickWin(board, foursAfter, q);
      board.undo();
      out.push({ k: w.three ? 'no_block3' : 'no_block', at: w.at });
    } else if (threesAfter.length && vn) out.push({ k: 'allow_double', at: threesAfter[0] });
    else if (threesAfter.length && onLine(m, threesBefore)) out.push({ k: 'wrong_end', at: threesAfter[0] });
    else if (threesAfter.length) out.push({ k: 'ignore_three', at: threesAfter[0] });
    else if (vcfAfter) out.push({ k: 'allow_vcf', at: vcfAfter.move, n: vcfAfter.len });
    // 3. Đối thủ có chuỗi thắng chắc sau nước này (analysis.js: len = số nước của đối thủ)
    if ((rec.cls === 'mistake' || rec.cls === 'blunder') && !rec.ev && rec.len > 0) out.push({ k: 'defense', n: rec.len });
    // 4. Chấm theo khả năng thắng mà không có sự thật nào rõ ràng
    if (!out.length && rec.ev) out.push({ k: 'drop', d: rec.drop || 0 });
    // 5. Nước tốt nhất (và nó tạo nước đôi không)
    if (best && board.get(best[0], best[1]) === C.EMPTY) {
      const win = C.winsIfPlaced(board, best[0], best[1], p);
      board.play(best[0], best[1], p);
      const dbl = !win && A.immediateWins(board, p).length >= 2;
      board.undo();
      out.push({ k: dbl ? 'best_double' : 'best', at: best });
    }
    return out;
  }

  /** Gợi ý không lộ đáp án cho thế trước nước của p: đối thủ đang có bốn / ba mở thì nói, không thì gợi ý tấn công. */
  function hint(moves, p, rule) {
    const board = boardAt(moves, moves.length, rule);
    const q = C.other(p);
    if (A.immediateWins(board, p).length) return { k: 'hint_win' };
    const f = A.immediateWins(board, q);
    if (f.length) { const w = pickWin(board, f, q); return { k: w.three ? 'hint_open3' : 'hint_four', at: w.at }; }
    if (A.forced(board, p, 4, { deadline: Date.now() + 200 })) return { k: 'hint_vcf' };
    const t = openFourMakers(board, q, 1);
    if (t.length) return { k: board.rule === 'vn' ? 'hint_double' : 'hint_three', at: t[0] };
    return { k: 'hint_attack' };
  }

  /** Dịch danh sách lời giải thích thành một đoạn văn. */
  function text(list, T, name) {
    return (list || []).map((e) => T('coach_' + e.k, { move: e.at ? name(e.at) : '', n: e.n || 0, d: e.d || 0 })).join(' ');
  }

  const CaroCoach = { explain, hint, text, openFourMakers, onLine, openFourWin };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroCoach;
  else global.CaroCoach = CaroCoach;
})(typeof window !== 'undefined' ? window : globalThis);
