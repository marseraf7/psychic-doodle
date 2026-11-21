/*
 * Bản ghi ván dạng chữ (kiểu PGN của cờ vua, theo ký hiệu ô của Cờ Caro – a11y-coords.js: ô giữa là h8).
 *   [Event "Cờ Caro"] [Site "<link xem lại>"] [Date "2026.11.21"] [X "<tên>"] [O "<tên>"] [Result "1-0"]
 *   [Rule "vn"] [Opening "free"] [TimeControl "3+2"] [Termination "win"]
 *   1. h8 i9 2. i8 g8 … 1-0
 * Result: "1-0" X thắng, "0-1" O thắng, "1/2-1/2" hoà, "*" chưa xong. Dùng cho API công khai (server/src/api-v1.js – tải
 * ván .txt) và đọc lại được (parse) để nhập ván / chương nghiên cứu.
 * UMD: trình duyệt window.CaroGameText, Node module.exports.
 */
(function (global) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./a11y-coords.js') : global.CaroA11yCoords;
  const DRAW = 3; // như server/src/room.js

  const result = (w) => (w === 1 ? '1-0' : w === 2 ? '0-1' : w === DRAW ? '1/2-1/2' : '*');
  const tagEsc = (s) => String(s == null ? '' : s).replace(/[\\"]/g, (c) => '\\' + c).replace(/[\r\n]+/g, ' ');
  const day = (ms) => { const d = new Date(ms); return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10).replace(/-/g, '.') : '????.??.??'; };

  /** g: { x, o, winner, reason, moves: [[x, y], …], rule, opening, clock, timeLimit, created }; opts.site: link xem lại. */
  function toText(g, opts = {}) {
    const tc = g.clock || (g.timeLimit > 0 ? g.timeLimit + 's/move' : '-');
    const tags = [['Event', opts.event || 'Cờ Caro'], ['Site', opts.site || ''], ['Date', day(g.created)], ['X', g.x || '?'], ['O', g.o || '?'],
      ['Result', result(g.winner)], ['Rule', g.rule || 'vn'], ['Opening', g.opening || 'free'], ['TimeControl', tc], ['Termination', g.reason || '']];
    const lines = tags.map(([k, v]) => `[${k} "${tagEsc(v)}"]`);
    const parts = [];
    (g.moves || []).forEach(([x, y], i) => { parts.push((i % 2 ? '' : (i / 2 + 1) + '. ') + C.name(x, y)); });
    parts.push(result(g.winner));
    // Ngắt dòng ~80 ký tự cho dễ đọc
    const body = [];
    let cur = '';
    for (const p of parts) { if (cur && cur.length + p.length + 1 > 80) { body.push(cur); cur = p; } else cur = cur ? cur + ' ' + p : p; }
    if (cur) body.push(cur);
    return lines.join('\n') + '\n\n' + body.join('\n') + '\n';
  }

  /** Đọc lại bản ghi chữ → { tags, moves: [[x, y]], winner } hoặc null nếu có nước không đọc được. */
  function parse(text) {
    const tags = {};
    const src = String(text || '');
    for (const m of src.matchAll(/^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm)) tags[m[1]] = m[2].replace(/\\(.)/g, '$1');
    const body = src.replace(/^\[.*\]\s*$/gm, ' ').replace(/\{[^}]*\}/g, ' ');
    const moves = [];
    let winner = null;
    for (const tok of body.split(/\s+/).filter(Boolean)) {
      if (/^\d+\.+$/.test(tok)) continue;
      if (tok === '1-0') { winner = 1; continue; }
      if (tok === '0-1') { winner = 2; continue; }
      if (tok === '1/2-1/2') { winner = DRAW; continue; }
      if (tok === '*') continue;
      const c = C.parse(tok.replace(/^\d+\./, ''));
      if (!c) return null;
      moves.push(c);
    }
    return { tags, moves, winner };
  }

  const api = { toText, parse, result };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroGameText = api;
})(typeof window !== 'undefined' ? window : globalThis);
