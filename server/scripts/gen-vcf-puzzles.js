// Sinh bài đố VCF thuần theo luật Gomoku tự do (chỉ nước bốn buộc đối thủ chặn) và gộp vào caro/puzzles.json
// (giữ nguyên các bài cũ, bài mới có rule: 'free', t: 'vcf', id tiếp theo; bỏ bài trùng hình kể cả xoay / lật).
//   node server/scripts/gen-vcf-puzzles.js [số bài=60] [hạt giống=17]
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../../caro/rules.js');
const A = require('../../caro/analysis.js');
const B = require('../../caro/bots.js');
const E = require('../../caro/engine.js');

const WANT = +process.argv[2] || 60;
let seed = +process.argv[3] || 17;
const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const FILE = path.join(__dirname, '../../caro/puzzles.json');

function shapeKey(moves) {
  const forms = [];
  for (let t = 0; t < 8; t++) {
    const pts = moves.map(([x, y], i) => {
      let a = x, b = y;
      if (t & 1) a = -a;
      if (t & 2) b = -b;
      if (t & 4) [a, b] = [b, a];
      return [a, b, i % 2];
    });
    const mx = Math.min(...pts.map((q) => q[0])), my = Math.min(...pts.map((q) => q[1]));
    forms.push(pts.map(([a, b, s]) => `${a - mx},${b - my},${s}`).sort().join(';'));
  }
  return forms.sort()[0];
}

const list = JSON.parse(fs.readFileSync(FILE));
const seen = new Set(list.map((q) => shapeKey(q.m)));
let nextId = Math.max(...list.map((q) => q.id)) + 1;
const ids = B.BOTS.filter((b) => b.tier >= 2 && b.tier <= 4).map((b) => b.id);
let added = 0, games = 0;
while (added < WANT && games < WANT * 40) {
  games++;
  const b = new C.Board('free');
  const sides = [null, ids[Math.floor(rng() * ids.length)], ids[Math.floor(rng() * ids.length)]];
  for (let n = 0; n < 70; n++) {
    const p = n % 2 ? C.O : C.X;
    if (n >= 10 && !A.immediateWins(b, p).length && !A.immediateWins(b, C.other(p)).length) {
      const mv = b.moves.map((m) => [m.x, m.y]);
      const r = E.analyse(mv, { ms: 40, rule: 'free', maxDepth: 2 }); // lọc nhanh bằng engine
      if (r.mate >= 3 && r.mate <= 7) {
        const f = A.forced(b, p, 7, { deadline: Date.now() + 3000 });
        if (f && f.len >= 3 && !seen.has(shapeKey(mv))) {
          seen.add(shapeKey(mv));
          const cx = Math.round(mv.reduce((s, m) => s + m[0], 0) / mv.length), cy = Math.round(mv.reduce((s, m) => s + m[1], 0) / mv.length);
          const m = mv.map(([x, y]) => [x - cx, y - cy]), sol = [f.move[0] - cx, f.move[1] - cy];
          const pb = new C.Board('free');
          m.forEach(([x, y], i) => pb.play(x, y, i % 2 ? C.O : C.X));
          if (A.winningMove(pb, p, sol, f.len, { deadline: Date.now() + 8000 })) {
            let decoys = 0;
            for (const [x, y] of C.candidates(pb, 2)) {
              pb.put(x, y, p);
              const threat = C.winCellsAround(pb, x, y, p).length > 0;
              pb.remove(x, y);
              if (threat && !A.winningMove(pb, p, [x, y], f.len, { deadline: Date.now() + 400 })) decoys++;
            }
            const r2 = Math.round((600 + 230 * (f.len - 2) + 18 * Math.min(decoys, 12)) / 10) * 10;
            list.push({ id: nextId++, m, p, len: f.len, r: r2, sol, t: 'vcf', rule: 'free' });
            added++;
          }
        }
        break;
      }
    }
    const [x, y] = B.botMove(b, p, sides[p], rng);
    b.play(x, y, p);
    if (C.checkWin(b, x, y, p)) break;
  }
}
list.sort((a, b) => a.r - b.r || a.id - b.id);
fs.writeFileSync(FILE, '[\n' + list.map((q) => JSON.stringify(q)).join(',\n') + '\n]\n');
console.log(`thêm ${added} bài sau ${games} ván, tổng ${list.length}`);
