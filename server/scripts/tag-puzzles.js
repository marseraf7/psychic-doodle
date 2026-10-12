// Gắn chủ đề cho bài đố luật Việt Nam trong caro/puzzles.json:
//   t = 'vcf' – thắng được chỉ bằng nước bốn (mỗi nước công tạo ô thành 5),
//   t = 'vct' – cần cả nước ba mở (ở luật Việt Nam, 3 mở cũng là đe doạ thắng vì 4 mở thắng ngay).
// Chạy sau gen-puzzles.js:  node server/scripts/tag-puzzles.js
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../../caro/rules.js');

const FILE = path.join(__dirname, '../../caro/puzzles.json');
const list = JSON.parse(fs.readFileSync(FILE));

function runLen(b, x, y, dx, dy, p) {
  let a = 1; while (b.get(x - a * dx, y - a * dy) === p) a++;
  let c = 1; while (b.get(x + c * dx, y + c * dy) === p) c++;
  return a + c - 1;
}
/** Ô trống (x,y) là ô "thành năm" của p: đặt vào được chuỗi ≥ 5 thắng (không phải 4 mở). */
function isFiveCell(b, x, y, p) {
  if (!C.winsIfPlaced(b, x, y, p)) return false;
  b.put(x, y, p);
  const ok = C.DIRS.some(([dx, dy]) => runLen(b, x, y, dx, dy, p) >= 5 && C.lineWin(b, x, y, dx, dy, p));
  b.remove(x, y);
  return ok;
}
/** Chuỗi ép chỉ dùng nước bốn (giống rules.vcf nhưng nước công phải tạo ô thành năm). */
function vcfFours(b, p, depth, ctx) {
  if (depth <= 0 || Date.now() > ctx.deadline) return null;
  const opp = C.other(p);
  const threats = [];
  for (const [x, y] of C.candidates(b, 2)) {
    b.put(x, y, p);
    const fives = C.winCellsAround(b, x, y, p).filter(([wx, wy]) => isFiveCell(b, wx, wy, p));
    b.remove(x, y);
    if (fives.length) threats.push([x, y]);
  }
  for (const c of threats) {
    b.put(c[0], c[1], p);
    const replies = C.blockingReplies(b, C.winCellsAround(b, c[0], c[1], p), p);
    let forced = true;
    for (const [rx, ry] of replies) {
      b.put(rx, ry, opp);
      const counter = C.winCellsAround(b, rx, ry, opp).length > 0;
      const ok = !counter && (C.candidates(b, 1).some(([x, y]) => C.winsIfPlaced(b, x, y, p)) || vcfFours(b, p, depth - 1, ctx));
      b.remove(rx, ry);
      if (!ok) { forced = false; break; }
    }
    b.remove(c[0], c[1]);
    if (forced) return c;
  }
  return null;
}

const count = { vcf: 0, vct: 0 };
for (const q of list) {
  if (q.rule) { count[q.t]++; continue; } // bài luật khác (gen-vcf-puzzles.js) đã có chủ đề
  const b = new C.Board();
  q.m.forEach(([x, y], i) => b.play(x, y, i % 2 ? C.O : C.X));
  q.t = q.len <= 1 || vcfFours(b, q.p, q.len - 1, { deadline: Date.now() + 4000 }) ? 'vcf' : 'vct';
  count[q.t]++;
}
fs.writeFileSync(FILE, '[\n' + list.map((q) => JSON.stringify(q)).join(',\n') + '\n]\n');
console.log(count);
