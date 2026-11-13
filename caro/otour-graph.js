/*
 * Giải đấu Offline – các khuôn "nhánh đồ thị" (dùng chung máy chủ và trình duyệt, chỉ mô phỏng thể thức): mỗi trận có
 * hai đầu ra – người thắng đi một nơi, người thua đi một nơi khác hoặc dừng ở một hạng. Máy chủ (server/src/hub/stages-graph.js)
 * dựng trận từ khuôn và dùng lại next / loserTo / resolveElim của nhánh loại trực tiếp; trình duyệt dùng để ước tính số
 * trận và ghi tên vòng.
 *   page      – Page playoff (4 đội): Qualifier 1 (1–2, thắng vào chung kết, thua còn cơ hội), Eliminator (3–4, thua hạng 4),
 *               Qualifier 2 (thua Q1 gặp thắng Eliminator, thua hạng 3), chung kết. 4 trận.
 *   afl8      – Final Eight kiểu AFL (8 đội): QF 1–4, 2–3 (thua còn cơ hội), EF 5–8, 6–7 (thua bị loại); SF = thua QF gặp thắng
 *               EF; Preliminary bắt chéo (thắng QF1 gặp thắng SF2, thắng QF2 gặp thắng SF1); chung kết. 9 trận.
 *   afl10     – Final Ten: thêm vòng Wildcard 7–10, 8–9 (đội thắng mang hạt giống 7 / 8), rồi như Final Eight. 11 trận.
 *   gauntlet  – thang leo bậc (3–8 đội): hạt giống thấp nhất gặp hạt giống kế trên, đội thắng leo tiếp tới gặp hạt giống 1.
 *               Mỗi bậc có thể có Bo riêng, trận thắng tặng sẵn cho hạt giống cao và luật hoà loạt (kiểu KBO / NPB).
 *   hybrid    – loại kép lai kiểu RLCS (8 đội): hạt giống 1–4 có hai mạng, 5–8 một mạng tới Final Four loại thẳng. 9 trận.
 *   compass8  – Compass draw 8 người: thắng vòng 1 sang Đông, thua sang Tây; vòng 2 thua Đông sang Bắc, thua Tây sang Nam;
 *               bốn chung kết Đông / Bắc / Tây / Nam. Ai cũng đấu đủ 3 trận; 12 trận; hạng Đ 1–2, B 3–4, T 5–6, N 7–8.
 * make(shape, n, cfg) → { cols: [khoá tên cột], ms: [{ k, col, a, b, win, lose, wp, lp, tag, bo?, start?, tie? }] } hoặc
 * null nếu số đội không hợp khuôn. a / b: hạt giống (1…n) đặt sẵn; win / lose: 'k.a' / 'k.b' (trận và ô nhận người thắng /
 * thua); wp / lp: hạng của người thắng / thua khi không đi tiếp (đồng hạng: cùng số).
 */
(function (global) {
  'use strict';
  const SHAPES = ['page', 'afl8', 'afl10', 'gauntlet', 'hybrid', 'compass8'];
  const SIZES = { page: [4], afl8: [8], afl10: [10], hybrid: [8], compass8: [8], gauntlet: [3, 4, 5, 6, 7, 8] };
  const MAX_GAUNTLET = 8;

  const M = (k, col, tag, x) => ({ k, col, tag, a: null, b: null, win: null, lose: null, wp: 0, lp: 0, ...x });

  function page() {
    return { cols: ['gr_week1', 'gr_q2', 'r_final'], ms: [
      M('q1', 0, 'pg_q1', { a: 1, b: 2, win: 'f.a', lose: 'q2.a' }),
      M('el', 0, 'pg_el', { a: 3, b: 4, win: 'q2.b', lp: 4 }),
      M('q2', 1, 'pg_q2', { win: 'f.b', lp: 3 }),
      M('f', 2, 'r_final', { wp: 1, lp: 2 }),
    ] };
  }

  /** Final Eight; off: số hạt giống đầu đã có ở tuần 1 (Final Ten: hạt giống 7 / 8 là đội thắng Wildcard). */
  function afl8(wild) {
    const ms = [
      M('qf1', 0, 'afl_qf', { a: 1, b: 4, win: 'p1.a', lose: 's1.a' }),
      M('qf2', 0, 'afl_qf', { a: 2, b: 3, win: 'p2.a', lose: 's2.a' }),
      M('ef1', 0, 'afl_ef', { a: 5, b: wild ? null : 8, win: 's1.b', lp: 7 }),
      M('ef2', 0, 'afl_ef', { a: 6, b: wild ? null : 7, win: 's2.b', lp: 7 }),
      M('s1', 1, 'afl_sf', { win: 'p2.b', lp: 5 }),
      M('s2', 1, 'afl_sf', { win: 'p1.b', lp: 5 }),
      M('p1', 2, 'afl_pf', { win: 'f.a', lp: 3 }),
      M('p2', 2, 'afl_pf', { win: 'f.b', lp: 3 }),
      M('f', 3, 'r_final', { wp: 1, lp: 2 }),
    ];
    return { cols: ['gr_week1', 'afl_sf', 'afl_pf', 'r_final'], ms };
  }
  function afl10() {
    const base = afl8(true);
    // Wildcard: 7–10 → hạt giống 7 (gặp 6 ở EF2), 8–9 → hạt giống 8 (gặp 5 ở EF1); đội thua đồng hạng 9
    const wc = [M('w1', 0, 'afl_wc', { a: 7, b: 10, win: 'ef2.b', lp: 9 }), M('w2', 0, 'afl_wc', { a: 8, b: 9, win: 'ef1.b', lp: 9 })];
    return { cols: ['afl_wc', ...base.cols], ms: [...wc, ...base.ms.map((m) => ({ ...m, col: m.col + 1 }))] };
  }

  /**
   * Thang leo bậc n đội: bậc j (0…n − 2) – hạt giống (n − 1 − j) (cao hơn, ô a) gặp người leo lên (ô b; bậc 0: hạt giống n).
   * cfg.ladder[j] = { bo, start: [a, b], tie: true } (tuỳ chọn – Bo, trận thắng tặng sẵn, hoà loạt thì hạt giống cao đi tiếp).
   */
  function gauntlet(n, cfg) {
    const ms = [], cols = [];
    for (let j = 0; j <= n - 2; j++) {
      const L = (cfg && Array.isArray(cfg.ladder) && cfg.ladder[j]) || {};
      const last = j === n - 2;
      cols.push(last ? 'r_final' : 'gl_step');
      ms.push(M('g' + j, j, last ? 'r_final' : 'gl_step', {
        a: n - 1 - j, b: j === 0 ? n : null, win: last ? null : `g${j + 1}.b`, wp: last ? 1 : 0, lp: n - j,
        ...(L.bo ? { bo: L.bo } : {}), ...(L.start && (L.start[0] || L.start[1]) ? { start: [L.start[0] || 0, L.start[1] || 0] } : {}), ...(L.tie ? { tie: true } : {}),
      }));
    }
    return { cols, ms };
  }

  function hybrid() {
    return { cols: ['hy_r1', 'hy_lb2', 'hy_sf', 'r_final'], ms: [
      M('u1', 0, 'hy_uq', { a: 1, b: 4, win: 's1.a', lose: 'l2a.a' }),
      M('u2', 0, 'hy_uq', { a: 2, b: 3, win: 's2.a', lose: 'l2b.a' }),
      M('l1a', 0, 'hy_lb1', { a: 5, b: 8, win: 'l2b.b', lp: 7 }),
      M('l1b', 0, 'hy_lb1', { a: 6, b: 7, win: 'l2a.b', lp: 7 }),
      // Nhánh dưới 2: thua tứ kết nhánh trên gặp thắng nhánh dưới 1 (đổi chéo để hai đội vừa gặp không gặp lại ở bán kết)
      M('l2a', 1, 'hy_lb2', { win: 's2.b', lp: 5 }),
      M('l2b', 1, 'hy_lb2', { win: 's1.b', lp: 5 }),
      M('s1', 2, 'hy_sf', { win: 'f.a', lp: 3 }),
      M('s2', 2, 'hy_sf', { win: 'f.b', lp: 3 }),
      M('f', 3, 'r_final', { wp: 1, lp: 2 }),
    ] };
  }

  function compass8() {
    return { cols: ['cp_r1', 'cp_r2', 'cp_r3'], ms: [
      M('r1', 0, 'cp_r1', { a: 1, b: 8, win: 'e1.a', lose: 'w1.a' }),
      M('r2', 0, 'cp_r1', { a: 4, b: 5, win: 'e1.b', lose: 'w1.b' }),
      M('r3', 0, 'cp_r1', { a: 2, b: 7, win: 'e2.a', lose: 'w2.a' }),
      M('r4', 0, 'cp_r1', { a: 3, b: 6, win: 'e2.b', lose: 'w2.b' }),
      M('e1', 1, 'cp_e', { win: 'ef.a', lose: 'nf.a' }),
      M('e2', 1, 'cp_e', { win: 'ef.b', lose: 'nf.b' }),
      M('w1', 1, 'cp_w', { win: 'wf.a', lose: 'sf.a' }),
      M('w2', 1, 'cp_w', { win: 'wf.b', lose: 'sf.b' }),
      M('ef', 2, 'cp_ef', { wp: 1, lp: 2 }),
      M('nf', 2, 'cp_nf', { wp: 3, lp: 4 }),
      M('wf', 2, 'cp_wf', { wp: 5, lp: 6 }),
      M('sf', 2, 'cp_sf', { wp: 7, lp: 8 }),
    ] };
  }

  /** Khuôn của giai đoạn với n đội (null nếu khuôn không nhận số đội này). */
  function make(shape, n, cfg) {
    if (!SHAPES.includes(shape) || !(SIZES[shape] || []).includes(n)) return null;
    if (shape === 'page') return page();
    if (shape === 'afl8') return afl8(false);
    if (shape === 'afl10') return afl10();
    if (shape === 'hybrid') return hybrid();
    if (shape === 'compass8') return compass8();
    return gauntlet(n, cfg);
  }

  /** Số trận / số lượt (ước tính – caro/tour-estimate.js). */
  function count(shape, n, cfg) {
    const g = make(shape, n, cfg);
    return g ? { matches: g.ms.length, waves: g.cols.length } : null;
  }

  /**
   * Loạt có trận thắng tặng sẵn / hoà loạt (A1 – kiểu KBO / NPB): bo tính cả trận tặng, cần ⌈(bo + 1) / 2⌉ thắng. games: mảng
   * 1 (ô a thắng) / −1 (ô b thắng) / 0 (hoà – vẫn tính là đã đấu). start: [a, b] trận tặng; tie: hoà loạt thì ô a (hạt giống
   * cao) đi tiếp. Trả { done, winner: 'a' | 'b' | null, ka, kb, played, max } hoặc { error } nếu đấu thừa.
   */
  function series(games, bo, start, tie) {
    const need = Math.floor(bo / 2) + 1, s = start || [0, 0];
    const max = Math.max(1, bo - s[0] - s[1]);
    let ka = s[0], kb = s[1], played = 0, winner = null;
    for (const g of games) {
      if (winner) return { error: 'ot_series_after', played: played + 1 };
      played++;
      if (g > 0) ka++; else if (g < 0) kb++;
      winner = decide(ka, kb, need, max - played, tie);
    }
    if (!winner && played >= max) winner = ka > kb ? 'a' : kb > ka ? 'b' : tie ? 'a' : null;
    return { done: !!winner, winner, ka, kb, played, max, need };
  }
  /** Người thắng loạt khi đã chắc chắn (còn rem trận): đủ số thắng, hoặc đối thủ không còn đủ trận để vượt / hoà. */
  function decide(ka, kb, need, rem, tie) {
    if (ka >= need) return 'a';
    if (kb >= need) return 'b';
    if (kb + rem < ka || (tie && kb + rem <= ka)) return 'a';
    if (ka + rem < kb) return 'b';
    if (rem === 0) return ka > kb ? 'a' : kb > ka ? 'b' : tie ? 'a' : null;
    return null;
  }

  const api = { SHAPES, SIZES, MAX_GAUNTLET, make, count, series };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroOTourGraph = api;
})(typeof window !== 'undefined' ? window : globalThis);
