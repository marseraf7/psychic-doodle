/*
 * Đặt thế cờ lên bàn Rapfi và kiểm thế sát mép (boat-rapfi.js dùng – GPL-3 cùng Rapfi).
 *
 * Bàn của game vô hạn, Rapfi cần bàn cố định (tự do / Việt Nam 20×20, tiêu chuẩn / Renju 15×15 – đúng cỡ mạng đã học): mỗi
 * lần đặt khung bao các quân vào giữa bàn Rapfi. Rapfi coi mép bàn là tường chặn, nên khi quân cách mép < 4 ô (chuỗi năm
 * kéo ra ngoài mép, thế ba "chết" vì mép mà thật ra còn sống) thì engine của game – hiểu đúng bàn vô hạn – kiểm lại
 * chuỗi ép thắng của cả hai bên (check). Cách mép < 1 ô: không dùng Rapfi.
 *
 *   CaroRapfiBoard.frame(moves, n)        – khung { ox, oy, margin } đặt thế vào giữa bàn n × n, hoặc null
 *   CaroRapfiBoard.place(rule, moves)     – như frame nhưng giữ khung lần trước khi còn vừa (bảng băm Rapfi dùng lại được)
 *   CaroRapfiBoard.fit(moves, f, n)       – thế moves trong khung cố định f (phân tích: một khung cho cả ván) | null
 *   CaroRapfiBoard.check(rule, moves, ms) – engine của game chấm thế (Worker riêng): Promise<{ move, score, mate } | null>
 *   CaroRapfiBoard.safe(rule, moves, ms)  – lọc phòng thủ của engine (cùng Worker): Promise<[[x, y], …] | null>
 *   CaroRapfiBoard.reset()                – dừng Worker kiểm thế (đổi luật / dừng Rapfi)
 */
(function (global) {
  'use strict';
  const SIZE = { free: 20, std: 15, renju: 15, vn: 20 };
  const SAFE_EDGE = 4; // cách mép ≥ 4 ô: mép bàn không ảnh hưởng chuỗi năm nào qua các quân → tin Rapfi hoàn toàn
  let seq = 0;

  /**
   * Khung đặt các quân vào bàn Rapfi cỡ n: { ox, oy, margin } (toạ độ Rapfi = toạ độ game − o; margin = số ô trống ít
   * nhất giữa quân ngoài cùng và mép), hoặc null nếu không vừa (cách mép < 1 ô).
   */
  function frame(moves, n) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of moves) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w > n - 2 || h > n - 2) return null;
    const lx = Math.floor((n - w) / 2), ly = Math.floor((n - h) / 2);
    return { ox: x0 - lx, oy: y0 - ly, margin: Math.min(lx, n - w - lx, ly, n - h - ly) };
  }

  /**
   * Khung cho thế moves: giữ khung lần trước nếu thế mới vẫn cách mép ≥ SAFE_EDGE với khung đó – thế cờ không bị dời trên
   * bàn Rapfi nên bảng băm của nước trước / lúc nghĩ trước còn dùng được; không thì đặt lại vào giữa (frame).
   */
  const sticky = {}; // luật → { ox, oy }
  function place(rule, moves) {
    const n = SIZE[rule], s = sticky[rule];
    if (s) {
      let m = Infinity;
      for (const [x, y] of moves) m = Math.min(m, x - s.ox, n - 1 - (x - s.ox), y - s.oy, n - 1 - (y - s.oy));
      if (m >= SAFE_EDGE) return { ox: s.ox, oy: s.oy, margin: m };
    }
    const f = frame(moves, n);
    if (f) sticky[rule] = { ox: f.ox, oy: f.oy };
    return f;
  }

  // Engine của game (ai-worker.js) trong Worker riêng để kiểm thế sát mép – không tranh với Worker máy đánh của app.js
  let checker = null;
  function ask(type, field, rule, moves, ms) {
    if (!checker) { try { checker = new Worker('ai-worker.js'); } catch (e) { return Promise.resolve(null); } }
    const w = checker, id = 'rchk' + ++seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { w.removeEventListener('message', onMsg); resolve(null); }, ms * 4 + 5000);
      function onMsg(e) {
        if (e.data.id !== id) return;
        clearTimeout(timer);
        w.removeEventListener('message', onMsg);
        resolve(e.data[field] || null);
      }
      w.addEventListener('message', onMsg);
      w.postMessage({ type, id, gid: 'rapfi-check-' + rule, rule, ms, moves });
    });
  }
  const check = (rule, moves, ms) => ask('eval', 'ev', rule, moves, ms);
  /** Lọc phòng thủ của engine (engine.js safeMoves) cho thế moves → [[x, y], …] | null – "Nước duy nhất" (rapfi-analysis.js). */
  const safe = (rule, moves, ms) => ask('safe', 'safe', rule, moves, ms);

  /** Thế moves trong khung cố định f (bàn n × n) → { ox, oy, margin }, hoặc null nếu có quân cách mép < 1 ô / ra ngoài. */
  function fit(moves, f, n) {
    if (!f) return null;
    let m = Infinity;
    for (const [x, y] of moves) m = Math.min(m, x - f.ox, n - 1 - (x - f.ox), y - f.oy, n - 1 - (y - f.oy));
    return m >= 1 ? { ox: f.ox, oy: f.oy, margin: m } : null;
  }

  /** Worker kiểm thế (engine JS – terminate lúc đang chấm không gây sập): trả RAM. */
  function reset() {
    if (checker) { checker.terminate(); checker = null; }
  }

  global.CaroRapfiBoard = { SIZE, SAFE_EDGE, frame, place, fit, check, safe, reset };
})(window);
