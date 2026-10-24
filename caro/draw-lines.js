/*
 * Vẽ đường thẳng bằng chuột phải (Issue #128, hạng mục 8; chỉ máy tính).
 * Nhấn phải vào một ô rồi kéo: đường thẳng bám theo ô, bắt theo 1 trong 8 hướng
 * (ngang / dọc / chéo 45°). Thả ra thì đường ở lại; vẽ được nhiều đường. Màu đường là
 * màu quân người vẽ đang cầm (board-input.js truyền vào lúc bắt đầu kéo).
 * Đường chỉ là lớp phủ máy khách: nước thật (placeRaw), đi lại hoặc ván mới xóa hết
 * (như Lichess: vẽ để bàn luận thế cờ, nước thật đi là hết).
 * Vẽ qua board-view.js (setDrawLines).
 *
 *   window.CaroDraw = { begin(x, y, p), move(x, y), end(), cancel(), clear(), onRealMove(), drawing() }
 */
(function () {
  'use strict';
  const lines = []; // [x0, y0, x1, y1, p]
  let preview = null; // đường đang kéo (chưa thả)
  let start = null; // [x, y, p] điểm bắt đầu kéo

  // Bắt hướng 8 hướng như Lichess: ngang / dọc khi lệch dưới 22,5°, còn lại chéo 45°.
  function snap(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    if (!dx && !dy) return null;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    const T = Math.tan(Math.PI / 8); // tan 22,5°
    if (ay <= ax * T) return [x0, y0, x1, y0];
    if (ax <= ay * T) return [x0, y0, x0, y1];
    const m = Math.min(ax, ay);
    return [x0, y0, x0 + Math.sign(dx) * m, y0 + Math.sign(dy) * m];
  }
  function sync() {
    if (window.CaroApp && window.CaroApp.setDrawLines) window.CaroApp.setDrawLines(lines, preview);
  }
  function begin(x, y, p) { start = [x, y, p]; preview = null; }
  function move(x, y) {
    if (!start) return;
    const s = snap(start[0], start[1], x, y);
    preview = s ? [...s, start[2]] : null; // snap chỉ trả tọa độ, màu lấy từ điểm bắt đầu
    sync();
  }
  function end() {
    if (start && preview) lines.push(preview);
    start = null;
    preview = null;
    sync();
  }
  function cancel() { start = null; preview = null; sync(); }
  function clear() { if (lines.length) { lines.length = 0; sync(); } }
  function onRealMove() { clear(); }
  function drawing() { return !!start; }

  window.addEventListener('caro:newgame', () => { clear(); });

  window.CaroDraw = { begin, move, end, cancel, clear, onRealMove, drawing, snap };
})();
