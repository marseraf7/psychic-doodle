/*
 * Hiện lời giải thích của huấn luyện viên (coach.js) trong bảng phân tích (study.js – nước đang xem) và gợi ý trong
 * "Tìm nước tốt hơn" (an-explore.js – sau khi đi chưa đạt). Kết quả tính một lần cho mỗi ván + nước (bộ nhớ nhỏ).
 * API: window.CaroCoachUI = { html(moves, i, rec, rule), hint(moves, p, rule) }
 */
(function () {
  'use strict';
  const CO = window.CaroCoach;
  const T = window.I18N.t;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const name = ([x, y]) => (window.CaroApp && window.CaroApp.cellName ? window.CaroApp.cellName(x, y) : x + ',' + y);
  const memo = new Map();
  const MAX = 200;

  function explainCached(moves, i, rec, rule) {
    const k = (rule || 'vn') + '|' + i + '|' + rec.cls + '|' + JSON.stringify(moves.slice(0, i + 1));
    if (!memo.has(k)) {
      let v = [];
      try { v = CO.explain(moves, i, rec, rule || 'vn'); } catch (e) { v = []; } // thế lạ: không giải thích còn hơn làm hỏng bảng
      memo.set(k, v);
      if (memo.size > MAX) memo.delete(memo.keys().next().value);
    }
    return memo.get(k);
  }

  /** Đoạn "Huấn luyện viên: …" cho nước i (0-based) đã đi; rỗng nếu nước không cần giải thích. */
  function html(moves, i, rec, rule) {
    if (!CO || !rec || !moves) return '';
    const list = explainCached(moves, i, rec, rule);
    if (!list.length) return '';
    return `<p class="an-coach"><b>${esc(T('coach_title'))}:</b> ${esc(CO.text(list, T, name))}</p>`;
  }

  /** Câu gợi ý cho thế trước nước của bên p (không lộ đáp án). */
  function hint(moves, p, rule) {
    if (!CO) return '';
    try { return CO.text([CO.hint(moves, p, rule || 'vn')], T, name); } catch (e) { return ''; }
  }

  window.CaroCoachUI = { html, hint };
})();
