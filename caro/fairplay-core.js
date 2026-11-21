/*
 * Soát chơi đẹp – phần tính thuần (trình duyệt: window.CaroFairCore; kiểm thử Node: caro/tests/fairplay-core.test.js).
 *   stats(moves, res)   → so nước đã đi với nước máy cờ chọn cho từng bên: { 1: { n, match, loss, acc }, 2: {…} }
 *                         n: số nước được tính (bỏ OPEN_SKIP nước đầu – khai cuộc quen tay / sách khai cuộc, bỏ nước ở thế đã
 *                         thua / đã thắng chắc), match: % nước trùng nước tốt nhất của máy cờ, loss: mức tụt khả năng thắng
 *                         trung bình (% – kiểu "centipawn loss" của cờ vua), acc: độ chính xác của analysis.js
 *   blurTracker(opts)   → bộ đếm rời tab trong lượt của mình (fairplay.js): onHide(now), onShow(now) → { n, ms } | null
 * res: kết quả analysis.js analyzeGame (có evals: thế trước từng nước, evals[i].move = nước máy cờ chọn).
 * Chỉ là số liệu cho quản trị viên tham khảo – không kết luận gian lận.
 */
(function (global) {
  'use strict';
  const OPEN_SKIP = 6; // 3 nước đầu mỗi bên

  function stats(moves, res) {
    const out = { 1: { n: 0, match: 0, loss: 0, acc: 0 }, 2: { n: 0, match: 0, loss: 0, acc: 0 } };
    if (!res || !Array.isArray(res.moves)) return out;
    const sum = { 1: { n: 0, m: 0, d: 0 }, 2: { n: 0, m: 0, d: 0 } };
    for (const r of res.moves) {
      if (!r || r.i < OPEN_SKIP || r.cls === 'lost') continue;
      const ev = res.evals && res.evals[r.i];
      if (!ev || !Array.isArray(ev.move) || ev.mate > 0) continue; // thế đang thắng chắc: nước nào cũng dễ
      const mv = moves[r.i];
      const s = sum[r.p];
      if (!s || !mv) continue;
      s.n++;
      if (ev.move[0] === mv[0] && ev.move[1] === mv[1]) s.m++;
      s.d += r.drop || 0;
    }
    for (const p of [1, 2]) {
      const s = sum[p];
      out[p] = { n: s.n, match: s.n ? Math.round((s.m / s.n) * 100) : 0, loss: s.n ? Math.round((s.d / s.n) * 10) / 10 : 0, acc: Math.round((res.acc && res.acc[p]) || 0) };
    }
    return out;
  }

  /** Đếm rời tab: chỉ tính khi đang trong lượt của mình (isMyTurn() lúc rời tab). */
  function blurTracker(isMyTurn) {
    let since = 0;
    return {
      onHide(now) { if (!since && isMyTurn()) since = now; },
      onShow(now) {
        if (!since) return null;
        const ms = Math.max(0, now - since);
        since = 0;
        return { n: 1, ms };
      },
      get hidden() { return !!since; },
    };
  }

  const CaroFairCore = { stats, blurTracker, OPEN_SKIP };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroFairCore;
  else global.CaroFairCore = CaroFairCore;
})(typeof window !== 'undefined' ? window : globalThis);
