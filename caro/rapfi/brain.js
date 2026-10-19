/*
 * "Bộ não" quyết định cách Rapfi nghĩ mỗi lượt – dùng chung cho rapfi/worker.js (trình duyệt) và công cụ đo trong Node
 * (server/scripts/rapfi/rapfi-match.js), để số đo đúng là cách app chạy. Chỉ là logic thuần, không gọi Rapfi.
 * Thuộc thư mục rapfi/ (GPL-3 – xem COPYING.txt, SOURCE.md).
 *
 * Mỗi lượt nghĩ: plan(moves, ms, o) → { cmds: lệnh INFO gửi trước BOARD, turn, hit, tm }; nghĩ xong: done(plan, used ms).
 *   - Phân tích (o.nodes): dừng theo số nút (INFO max_node) – cùng thế cho cùng kết quả dù máy nhanh / chậm; ms × NODE_CAP
 *     là giới hạn cứng cho máy quá chậm; o.fresh: xoá bảng băm trước (kết quả không phụ thuộc thứ tự chấm).
 *   - BOAT đi (o.play):
 *     · Đoán trúng (ponderhit, như Stockfish): lúc người chơi nghĩ, Rapfi đã nghĩ trước trên thế đó (pondered) và chuỗi
 *       nước tốt nhất bắt đầu bằng đúng nước người chơi vừa đi, đã nghĩ ít nhất bằng một lượt thường → cây tìm kiếm của
 *       nước đáp đã có sẵn trong bảng băm: chỉ nghĩ HIT_FRAC thời gian (BOAT đáp nhanh hơn, sức gần như giữ nguyên).
 *     · Tự chia thời gian (o.tm): giao quỹ giờ cả ván cho bộ chia giờ của Rapfi (search/timecontrol.cpp: nước có nước tốt
 *       nhất ổn định đi sớm, điểm tụt / nước tốt nhất đổi liên tục thì nghĩ thêm). Quỹ kiểu Fischer: mỗi nước cộng inc =
 *       thời gian một lượt thường (fixedTime) – trung bình như cũ; giới hạn cứng mỗi nước TM_CAP × ms. Nước đoán trúng
 *       không cộng / trừ quỹ (thời gian tiết kiệm là để BOAT đáp nhanh, không dồn sang nước khác).
 *     · Không thì như cũ: INFO timeout_turn ms (Rapfi dừng ở advanced_stop_ratio × (ms − 30) – fixedTime).
 */
(function (root) {
  'use strict';
  const HIT_FRAC = 0.3, HIT_MIN = 250;
  // Khớp config() trong worker.js: advanced_stop_ratio = 0.75, turn_time_reserved = 30 ms (mặc định của Rapfi)
  const ADVANCED_STOP = 0.75, RESERVED = 30;
  const TM_CAP = 2, TM_SPACE = 22; // quỹ ban đầu = TM_SPACE × inc (match_space của Rapfi: quỹ ≈ 22 lượt)
  const TM_MATCH = 86400000; // timeout_match > 0 bất kỳ để Rapfi dùng quỹ giờ (tránh 100000000 – giá trị đặc biệt của Piskvork)
  const NODE_CAP = 5;

  /** Thời gian một lượt nghĩ thường với timeout_turn = ms (Rapfi dừng sớm ở điểm "tối ưu"). */
  const fixedTime = (ms) => Math.max(1, Math.round(ADVANCED_STOP * (ms - RESERVED)));

  /** "K10" (cột chữ A = 0, hàng số từ 1) → [10, 9] – toạ độ Piskvork như dòng nước đi "x,y" của Rapfi. */
  function cell(tok) {
    const m = /^([A-Z])(\d+)$/.exec(tok);
    return m ? [m[1].charCodeAt(0) - 65, Number(m[2]) - 1] : null;
  }

  /** Dòng "Depth d-s | Eval e | Time t | PV…" cuối cùng của một lượt nghĩ → { depth, pv: [[x, y], …] } | null. */
  function parsePV(lines) {
    let best = null;
    for (const l of lines || []) {
      const m = /Depth (\d+)-\d+ \| Eval \S+ \| Time \d+ms \| ([A-Z0-9 ]+)$/.exec(l);
      if (!m) continue;
      const pv = m[2].trim().split(/\s+/).map(cell);
      if (pv.length && pv.every(Boolean)) best = { depth: Number(m[1]), pv };
    }
    return best;
  }

  const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
  const key = (moves) => moves.map((m) => m[0] + ',' + m[1]).join(';');

  function create() {
    let ponder = null; // { key, n, pv0, elapsed } – lượt nghĩ trước gần nhất
    let bank = null; // quỹ giờ còn lại của ván (ms) – tự chia thời gian

    return {
      /** Ván mới: quên lượt nghĩ trước và quỹ giờ. */
      reset() { ponder = null; bank = null; },
      get bank() { return bank; },

      /** Một lát nghĩ trước trên thế moves (người chơi tới lượt) vừa xong: lines = dòng Rapfi in ra, elapsed = ms đã nghĩ. */
      pondered(moves, lines, elapsed) {
        const k = key(moves), pv = parsePV(lines);
        if (!ponder || ponder.key !== k) ponder = { key: k, n: moves.length, pv0: null, elapsed: 0 };
        ponder.elapsed += Math.max(0, elapsed || 0);
        if (pv) ponder.pv0 = pv.pv[0];
      },

      /** Người chơi vừa đi đúng nước Rapfi dự đoán lúc nghĩ trước, và đã nghĩ trước đủ lâu (≥ ms). */
      isHit(moves, ms) {
        if (!ponder || !ponder.pv0 || moves.length !== ponder.n + 1 || ponder.elapsed < ms) return false;
        return same(moves[moves.length - 1], ponder.pv0) && key(moves.slice(0, -1)) === ponder.key;
      },

      /**
       * Lệnh cho lượt nghĩ: o.play – BOAT đi (o.tm: tự chia thời gian, o.hit: cho phép đáp nhanh khi đoán trúng – nghĩ
       * o.hitFrac (mặc định HIT_FRAC) thời gian);
       * o.nodes – phân tích theo số nút; không có gì – theo giờ (nghĩ trước / phân tích cũ).
       */
      plan(moves, ms, o) {
        o = o || {};
        const fixed = (turn, nodes) => ['INFO timeout_match 0', 'INFO max_node ' + (nodes || 0), 'INFO timeout_turn ' + turn];
        // o.fresh: bảng băm mới (cùng thế cho cùng kết quả, không phụ thuộc các thế chấm trước)
        if (o.nodes) return { cmds: (o.fresh ? ['YXHASHCLEAR'] : []).concat(fixed(ms * NODE_CAP, o.nodes)), turn: ms * NODE_CAP, hit: false, tm: false };
        if (!o.play) return { cmds: fixed(ms), turn: ms, hit: false, tm: false };
        if (o.hit !== false && this.isHit(moves, ms)) {
          const turn = Math.max(HIT_MIN, Math.round(ms * (o.hitFrac || HIT_FRAC)));
          return { cmds: fixed(turn), turn, hit: true, tm: !!o.tm };
        }
        if (!o.tm) return { cmds: fixed(ms), turn: ms, hit: false, tm: false };
        if (bank === null) bank = TM_SPACE * fixedTime(ms);
        const turn = TM_CAP * ms;
        return {
          // time_left gửi sau cùng: timeout_match / timeout_turn đặt lại quỹ về timeout_match (setTimeControl của Rapfi)
          cmds: ['INFO max_node 0', 'INFO timeout_match ' + TM_MATCH, 'INFO timeout_turn ' + turn, 'INFO time_left ' + Math.round(bank)],
          turn, hit: false, tm: true,
        };
      },

      /** Lượt nghĩ theo plan đã xong sau used ms: cập nhật quỹ giờ (nước đoán trúng không tính). */
      done(plan, used, ms) {
        if (!plan.tm || plan.hit || bank === null) return;
        const inc = fixedTime(ms);
        bank = Math.min(3 * TM_SPACE * inc, Math.max(2 * inc, bank - Math.max(0, used) + inc));
      },
    };
  }

  const RapfiBrain = { create, parsePV, cell, fixedTime, HIT_FRAC, HIT_MIN, TM_CAP, TM_SPACE, NODE_CAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = RapfiBrain;
  else root.RapfiBrain = RapfiBrain;
})(typeof self !== 'undefined' ? self : globalThis);
