/*
 * Hàm dùng chung cho khai cuộc của dây chuyền NNUE luật Việt Nam (make-openings.js, balance-openings.js, arena.js):
 *   - chuỗi thế kiểu Rapfi "h8i9…" (chữ = cột từ a, số = hàng từ 1) ↔ danh sách nước [[x, y], …] (toạ độ bàn 0..N-1)
 *   - dời khung bao các quân vào giữa bàn N×N
 *   - khai cuộc ngẫu nhiên đúng luật quanh tâm (PRNG có hạt giống: cùng hạt → cùng bộ)
 */
'use strict';
const C = require('../../../../../caro/rules.js');

/** "h8i9" → [[7, 7], [8, 8]]. Chuỗi hỏng → null. */
function parsePos(s) {
  const out = [];
  const re = /([a-z])(\d{1,2})/g;
  let m, used = 0;
  while ((m = re.exec(s))) { out.push([m[1].charCodeAt(0) - 97, +m[2] - 1]); used += m[0].length; }
  return used === s.trim().length && out.length ? out : null;
}

/** [[7, 7], [8, 8]] → "h8i9". */
const formatPos = (mv) => mv.map(([x, y]) => String.fromCharCode(97 + x) + (y + 1)).join('');

/** Dời các nước (toạ độ bất kỳ) để khung bao nằm giữa bàn N×N. Rộng hơn bàn → null. */
function centerOn(mv, N) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of mv) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 - x0 >= N || y1 - y0 >= N) return null;
  const ox = x0 - Math.floor((N - (x1 - x0 + 1)) / 2), oy = y0 - Math.floor((N - (y1 - y0 + 1)) / 2);
  return mv.map(([x, y]) => [x - ox, y - oy]);
}

/** PRNG mulberry32 – số thực [0, 1). */
function prng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Khai cuộc ngẫu nhiên đúng luật Việt Nam: min..max quân xen kẽ (X trước) trong ô box×box quanh (0, 0), không ai đã
 * thắng. Lệch / cân bằng không kiểm ở đây – balance-openings.js lọc bằng Rapfi-CARO.
 */
function randomOpening(rnd, { min = 3, max = 7, box = 7 } = {}) {
  const n = min + Math.floor(rnd() * (max - min + 1)), h = box >> 1;
  for (;;) {
    const b = new C.Board('vn'), mv = [];
    let tries = 0;
    while (mv.length < n && tries++ < 200) {
      const x = Math.floor(rnd() * box) - h, y = Math.floor(rnd() * box) - h, p = mv.length % 2 ? C.O : C.X;
      if (b.get(x, y) !== C.EMPTY) continue;
      b.play(x, y, p);
      if (C.checkWin(b, x, y, p)) { b.undo(); continue; }
      mv.push([x, y]);
    }
    if (mv.length === n) return mv;
  }
}

/** Đọc file khai cuộc (mỗi dòng một thế) → danh sách nước; bỏ dòng trống / hỏng. */
function readFile(file) {
  return require('fs').readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean).map(parsePos).filter(Boolean);
}

module.exports = { parsePos, formatPos, centerOn, prng, randomOpening, readFile };
