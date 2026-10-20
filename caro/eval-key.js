/*
 * Khoá chuẩn của một thế cờ cho bộ nhớ điểm dùng chung (máy chủ: server/src/evalcache.js, trình duyệt: eval-cloud.js).
 * Hai thế giống nhau sau khi dời (bàn vô hạn) và xoay / lật (8 phép đối xứng của hình vuông) có cùng khoá – luật nào của
 * game cũng đối xứng như vậy (5 quân theo hàng / cột / chéo; Renju: nước cấm cũng theo hàng / cột / chéo). Thứ tự đi không
 * quan trọng: chỉ quân X, quân O và bên tới lượt.
 *   canon(moves)          → { key, t, ox, oy } (t: phép đối xứng, o: độ dời) – moves: [[x, y], …], X đi trước
 *   toCanon(c, [x, y])    → toạ độ trong thế chuẩn · fromCanon(c, [x, y]) → ngược lại (toạ độ của người hỏi)
 *   validMoves(moves)     → true nếu là danh sách nước hợp lệ (số nguyên, không trùng, trong giới hạn)
 * Chạy trên trình duyệt (window.CaroEvalKey) và Node.
 */
(function (global) {
  'use strict';
  const MAX_MOVES = 400, MAX_COORD = 512;
  // Bản engine của điểm trong bộ nhớ dùng chung: Rapfi 3c94c2a + mạng e32ad77 (rapfi/SOURCE.md), chấm theo số nút, đổi
  // điểm theo rapfi-analysis.js. Đổi bản dựng / mạng / cách chấm / cách đổi điểm thì tăng số cuối – điểm cũ thôi dùng.
  const ENGINE = 'rapfi-3c94c2a.e32ad77.1';
  // 8 phép đối xứng: (x, y) → T[t](x, y)
  const T = [
    (x, y) => [x, y], (x, y) => [-y, x], (x, y) => [-x, -y], (x, y) => [y, -x],
    (x, y) => [-x, y], (x, y) => [y, x], (x, y) => [x, -y], (x, y) => [-y, -x],
  ];
  // Phép ngược của từng phép (xoay 90° ↔ 270°; lật là ngược của chính nó)
  const INV = [0, 3, 2, 1, 4, 5, 6, 7];

  function validMoves(moves) {
    if (!Array.isArray(moves) || moves.length > MAX_MOVES) return false;
    const seen = new Set();
    for (const m of moves) {
      if (!Array.isArray(m) || m.length !== 2 || !Number.isInteger(m[0]) || !Number.isInteger(m[1])) return false;
      if (Math.abs(m[0]) > MAX_COORD || Math.abs(m[1]) > MAX_COORD) return false;
      const k = m[0] + ',' + m[1];
      if (seen.has(k)) return false;
      seen.add(k);
    }
    return true;
  }

  /** Chuỗi của các quân sau phép t, dời để toạ độ nhỏ nhất về 0: "x,y;…|x,y;…" (X | O, mỗi bên sắp xếp). */
  function encode(moves, t) {
    const pts = moves.map(([x, y]) => T[t](x, y));
    let ox = Infinity, oy = Infinity;
    for (const [x, y] of pts) { if (x < ox) ox = x; if (y < oy) oy = y; }
    const side = [[], []];
    pts.forEach(([x, y], i) => side[i % 2].push((x - ox) * 4096 + (y - oy)));
    const s = side.map((a) => a.sort((p, q) => p - q).map((v) => Math.floor(v / 4096) + ',' + (v % 4096)).join(';')).join('|');
    return { s, ox, oy };
  }

  function canon(moves) {
    if (!moves.length) return { key: '', t: 0, ox: 0, oy: 0 };
    let best = null;
    for (let t = 0; t < 8; t++) {
      const e = encode(moves, t);
      if (!best || e.s < best.s) best = { ...e, t };
    }
    return { key: best.s, t: best.t, ox: best.ox, oy: best.oy };
  }

  // "+ 0": phép đổi dấu biến 0 thành −0 – giữ toạ độ là số nguyên thường
  function toCanon(c, [x, y]) {
    const [a, b] = T[c.t](x, y);
    return [a - c.ox + 0, b - c.oy + 0];
  }
  function fromCanon(c, [x, y]) {
    const [a, b] = T[INV[c.t]](x + c.ox, y + c.oy);
    return [a + 0, b + 0];
  }

  const CaroEvalKey = { canon, toCanon, fromCanon, validMoves, MAX_MOVES, ENGINE };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroEvalKey;
  else global.CaroEvalKey = CaroEvalKey;
})(typeof window !== 'undefined' ? window : globalThis);
