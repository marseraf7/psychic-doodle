/*
 * Tuỳ chỉnh bàn cờ (như Lichess): màu bàn, kiểu quân. Chạy trong <head> để bàn không nháy màu khi mở.
 *  board : 'paper' (mặc định, theo giao diện Sáng/Tối) | 'wood' | 'green' | 'blue' | 'night'
 *  pieces: 'classic' (X/O nét mảnh) | 'bold' (X/O nét đậm) | 'stones' (quân đá đen / trắng như cờ vây)
 * drawStone() dùng chung cho bàn cờ (app.js) và ảnh / GIF chia sẻ (share.js).
 */
(function () {
  'use strict';
  const KEY = 'caro.style';
  const BOARDS = ['paper', 'wood', 'green', 'blue', 'night'];
  const PIECES = ['classic', 'bold', 'stones'];
  const listeners = [];
  let cur = { board: 'paper', pieces: 'classic' };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (BOARDS.includes(s.board)) cur.board = s.board;
    if (PIECES.includes(s.pieces)) cur.pieces = s.pieces;
  } catch (e) { /* riêng tư */ }

  function apply() {
    const root = document.documentElement;
    if (cur.board === 'paper') root.removeAttribute('data-board');
    else root.setAttribute('data-board', cur.board);
  }

  function set(patch) {
    if (patch.board && BOARDS.includes(patch.board)) cur.board = patch.board;
    if (patch.pieces && PIECES.includes(patch.pieces)) cur.pieces = patch.pieces;
    try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) { /* riêng tư */ }
    apply();
    listeners.forEach((fn) => fn());
  }

  /**
   * Vẽ 1 quân p (1 = X, 2 = O) tâm (sx, sy), ô cỡ s. colors: { x, o } (màu theo giao diện).
   */
  function drawStone(ctx, p, sx, sy, s, alpha, colors, pieces) {
    const style = pieces || cur.pieces;
    ctx.globalAlpha = alpha;
    if (style === 'stones') {
      const r = s * 0.42;
      const g = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.35, r * 0.1, sx, sy, r);
      if (p === 1) { g.addColorStop(0, '#5a5f66'); g.addColorStop(1, '#101215'); }
      else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#cfd2d6'); }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.strokeStyle = p === 1 ? 'rgba(0,0,0,.6)' : 'rgba(0,0,0,.28)';
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    const bold = style === 'bold';
    const r = s * (bold ? 0.3 : 0.32);
    ctx.lineWidth = Math.max(bold ? 3 : 2, s * (bold ? 0.16 : 0.1));
    ctx.lineCap = 'round';
    ctx.strokeStyle = p === 1 ? colors.x : colors.o;
    ctx.beginPath();
    if (p === 1) {
      ctx.moveTo(sx - r, sy - r); ctx.lineTo(sx + r, sy + r);
      ctx.moveTo(sx + r, sy - r); ctx.lineTo(sx - r, sy + r);
    } else ctx.arc(sx, sy, r * 1.05, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  apply();
  window.CaroStyle = {
    BOARDS, PIECES, drawStone, set,
    get board() { return cur.board; },
    get pieces() { return cur.pieces; },
    onChange: (fn) => listeners.push(fn),
  };
})();
