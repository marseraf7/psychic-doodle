/*
 * Sách khai cuộc của nhân vật máy mức cao: thế cờ đầu ván → nước tốt nhất, do engine phân tích rất lâu trước
 * (server/scripts/build-book.js, ~10 giây mỗi thế – lâu hơn nhiều so với thời gian máy được nghĩ khi chơi).
 * Dữ liệu ở book-data.js (CaroBookData: { <luật>: { <khoá thế cờ>: [x, y] } }).
 *
 * Thế cờ được chuẩn hoá để một mục dùng được cho mọi vị trí / hướng trên bàn vô hạn: thử 8 phép xoay / lật,
 * dời cho quân nhỏ nhất về (0, 0), lấy khoá nhỏ nhất theo thứ tự chuỗi. Nước trong sách lưu theo toạ độ chuẩn hoá,
 * khi tra thì biến đổi ngược về toạ độ thật.
 * Chạy được trên trình duyệt (window.CaroBook), Web Worker và Node.
 */
(function (global) {
  'use strict';
  // 8 phép đối xứng của hình vuông
  const SYM = [
    (x, y) => [x, y], (x, y) => [-y, x], (x, y) => [-x, -y], (x, y) => [y, -x],
    (x, y) => [-x, y], (x, y) => [y, x], (x, y) => [x, -y], (x, y) => [-y, -x],
  ];
  // Phép ngược của từng phép trên
  const INV = [0, 3, 2, 1, 4, 5, 6, 7];

  /** Chuẩn hoá: { key, sym, dx, dy } – toạ độ chuẩn = SYM[sym](x, y) − (dx, dy). moves: [[x, y], …], X đi trước. */
  function canon(moves) {
    let best = null;
    for (let s = 0; s < 8; s++) {
      const pts = moves.map(([x, y], i) => [...SYM[s](x, y), i % 2]);
      let mx = Infinity, my = Infinity;
      for (const [x, y] of pts) { if (x < mx) mx = x; if (y < my) my = y; }
      const enc = (side) => pts.filter((p) => p[2] === side).map(([x, y]) => (x - mx) + '.' + (y - my)).sort().join(',');
      const key = enc(0) + '|' + enc(1);
      if (!best || key < best.key) best = { key, sym: s, dx: mx, dy: my };
    }
    return best;
  }

  /** Nước trong sách cho thế cờ moves theo luật rule (toạ độ thật), hoặc null. */
  function lookup(moves, rule) {
    const data = global.CaroBookData && global.CaroBookData[rule || 'vn'];
    if (!data || !moves.length) return null;
    const c = canon(moves);
    const m = data[c.key];
    if (!m) return null;
    const [x, y] = SYM[INV[c.sym]](m[0] + c.dx, m[1] + c.dy);
    return [x, y];
  }

  /** Toạ độ thật → toạ độ chuẩn của thế moves (để ghi sách). */
  function toCanon(moves, move) {
    const c = canon(moves);
    const [x, y] = SYM[c.sym](move[0], move[1]);
    return { key: c.key, move: [x - c.dx, y - c.dy] };
  }

  const CaroBook = { canon, lookup, toCanon, SYM, INV };
  if (typeof module !== 'undefined' && module.exports) {
    if (!global.CaroBookData) { try { global.CaroBookData = require('./book-data.js'); } catch (e) { /* chưa có sách */ } }
    module.exports = CaroBook;
  } else global.CaroBook = CaroBook;
})(typeof window !== 'undefined' ? window : globalThis);
