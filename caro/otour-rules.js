/*
 * Giải đấu Offline – luật set và kiểm kết quả theo bộ môn (dùng chung trình duyệt + máy chủ: server/src/hub/otour-run.js).
 * Trình duyệt kiểm trước khi gửi để báo lỗi ngay; máy chủ kiểm lại (không tin client).
 *
 * Luật set { to, by, cap, last } (giải tắt luật = null: không kiểm điểm từng set, chỉ kiểm số set):
 *   to   – điểm để thắng set (cầu lông 21, bóng bàn 11, bóng chuyền 25, tennis 6 game…)
 *   by   – phải hơn ít nhất (thường 2); sau khi hai bên cùng tới (to − 1) thì set kết thúc ngay khi hơn đúng `by`
 *   cap  – điểm trần (cầu lông 30: 30–29 vẫn thắng; tennis 7: 7–6 là thắng loạt tie-break); 0 = không có trần
 *   last – điểm set quyết định nếu khác (bóng chuyền 15); 0 = như các set khác
 * Số set: Bo N → ai thắng đủ ⌊N/2⌋ + 1 set là thắng trận; không có set nào sau khi đã đủ; không quá N set.
 */
(function (global) {
  'use strict';
  const MAX_POINT = 999;
  const int = (v, min, max, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };

  /** Chuẩn hoá luật set (từ form / bản cấu hình); không hợp lệ hoặc tắt → null. */
  function cleanSet(x) {
    if (!x || typeof x !== 'object') return null;
    if (!(Math.floor(Number(x.to)) >= 1)) return null; // điểm thắng set 0 / trống = tắt luật
    const to = int(x.to, 1, 99, 0);
    const by = int(x.by, 1, 10, 2);
    let cap = int(x.cap, 0, 199, 0);
    if (cap && cap <= to) cap = 0; // trần phải lớn hơn điểm thắng set
    const last = int(x.last, 0, 99, 0);
    return { to, by, cap, last: last === to ? 0 : last };
  }

  const need = (bo) => Math.floor(Math.max(1, bo) / 2) + 1;

  /**
   * Một set [a, b] có đúng luật không (deciding: set quyết định – dùng điểm `last`). Trả null nếu đúng, hoặc mã lỗi.
   * Người thắng W, người thua L: W ≥ to; W = to thì phải hơn ≥ by; W > to (đã qua "deuce") thì hơn đúng by; chạm trần
   * cap thì hơn 1 cũng được; không vượt trần.
   */
  function setError(rule, s, deciding = false) {
    if (!rule) return null;
    const W = Math.max(s[0], s[1]), L = Math.min(s[0], s[1]);
    if (W === L) return 'ot_set_tie';
    const to = deciding && rule.last ? rule.last : rule.to;
    const cap = rule.cap && !(deciding && rule.last) ? rule.cap : 0;
    if (cap && W > cap) return 'ot_set_bad';
    if (W < to) return 'ot_set_bad';
    if (W === to) return W - L >= rule.by ? null : 'ot_set_bad';
    if (cap && W === cap) return W - L >= 1 && L >= cap - rule.by ? null : 'ot_set_bad';
    return W - L === rule.by ? null : 'ot_set_bad';
  }

  /**
   * Cả trận theo set: sets [[a, b], …], bo – số set tối đa, rule – luật set (null: chỉ kiểm số set).
   * Trả null nếu đúng, hoặc { code, args } (args.n: số thứ tự set sai, tính từ 1).
   */
  function setsError(rule, sets, bo) {
    if (!Array.isArray(sets) || !sets.length) return { code: 'score_need_sets', args: {} };
    for (const s of sets) {
      if (!Array.isArray(s) || s.length !== 2 || s.some((v) => !Number.isInteger(v) || v < 0 || v > MAX_POINT)) return { code: 'tour_score_bad', args: {} };
    }
    bo = Math.max(1, Math.floor(bo) || 1);
    if (sets.length > bo) return { code: 'ot_sets_many', args: { bo } };
    const k = need(bo);
    let wa = 0, wb = 0;
    for (let i = 0; i < sets.length; i++) {
      if (wa >= k || wb >= k) return { code: 'ot_sets_after', args: { n: i + 1, bo } };
      const s = sets[i];
      // Set quyết định: set cuối cùng có thể của trận (Bo5 → set 5), hoặc khi hai bên cùng còn một set nữa là thắng
      const deciding = bo > 1 && wa === k - 1 && wb === k - 1;
      const e = setError(rule, s, deciding);
      if (e) return { code: e, args: { n: i + 1 } };
      if (s[0] > s[1]) wa++; else if (s[1] > s[0]) wb++;
    }
    if (wa < k && wb < k) return { code: 'ot_sets_short', args: { k, bo } };
    return null;
  }

  /** Trận đi tới set quyết định (Bo5 thắng 3–2): điểm "thắng / thua sát" (points.wx / lx) nếu giải dùng. */
  const decidingPlayed = (sets, bo) => bo > 1 && Array.isArray(sets) && sets.length === bo;

  const api = { cleanSet, setError, setsError, need, decidingPlayed, MAX_POINT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroOTourRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
