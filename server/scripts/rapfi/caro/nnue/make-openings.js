/*
 * File khai cuộc cho Rapfi selfplay (--opening): mỗi dòng một thế "h8i9…" (chữ = cột từ a, số = hàng từ 1), bàn 20×20.
 *   node make-openings.js <ra.txt> [ván.jsonl …]
 * Nguồn: sách khai cuộc luật Việt Nam (caro/book-data.js: vn, vn-rapfi – thế và thế sau nước trong sách) và 4 / 6 / 8
 * nước đầu của các ván jsonl nếu có (vd. ván Gomocup bảng Caro từ server/scripts/gomocup-import.js). Không dùng
 * server/scripts/openings.json: khai cuộc 0–31 để đo với engine của game, 32–95 để đấu chọn mạng (arena.js) – mạng
 * không được học trước trên chính các thế dùng để chấm nó. Bỏ thế trùng (sau xoay / lật) và thế đã có người thắng.
 */
'use strict';
const fs = require('fs');
const C = require('../../../../../caro/rules.js');
const B = require('../../../../../caro/book.js');
const OPEN = require('../../../openings.json').vn;
const [out, ...jsonl] = process.argv.slice(2);
const N = 20, lines = [];
// Đánh dấu sẵn mọi khai cuộc đo là "đã có" để không thế nào trùng chúng (kể cả thế trong sách)
const seen = new Set(OPEN.map((op) => B.canon(op).key));

function add(mv) {
  if (mv.length < 2) return;
  const b = new C.Board('vn');
  for (let i = 0; i < mv.length; i++) {
    const [x, y] = mv[i], p = i % 2 ? C.O : C.X;
    if (b.get(x, y) !== C.EMPTY) return;
    b.play(x, y, p);
    if (C.checkWin(b, x, y, p)) return;
  }
  const key = B.canon(mv).key;
  if (seen.has(key)) return;
  seen.add(key);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of mv) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const ox = x0 - Math.floor((N - (x1 - x0 + 1)) / 2), oy = y0 - Math.floor((N - (y1 - y0 + 1)) / 2);
  lines.push(mv.map(([x, y]) => String.fromCharCode(97 + x - ox) + (y - oy + 1)).join(''));
}
/** Khoá chuẩn hoá của sách ("x.y,…|x.y,…" – quân X | quân O) → nước đi xen kẽ, X trước. */
function fromKey(k) {
  const [xs, os] = k.split('|').map((s) => (s ? s.split(',').map((p) => p.split('.').map(Number)) : []));
  const mv = [];
  for (let i = 0; i < Math.max(xs.length, os.length); i++) { if (xs[i]) mv.push(xs[i]); if (os[i]) mv.push(os[i]); }
  return mv;
}

for (const rule of ['vn', 'vn-rapfi']) {
  for (const [k, m] of Object.entries(global.CaroBookData[rule] || {})) { const mv = fromKey(k); add(mv); add(mv.concat([m])); }
}
for (const f of jsonl) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const g = JSON.parse(line).m;
    for (const k of [4, 6, 8]) if (g.length > k + 6) add(g.slice(0, k));
  }
}
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(`${lines.length} khai cuộc → ${out}`);
