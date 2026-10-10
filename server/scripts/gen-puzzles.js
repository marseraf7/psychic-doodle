// Sinh bài đố cho chế độ "Giải đố": cho máy tự đánh với nhau, lấy các thế cờ mà bên tới lượt
// có chuỗi nước ép thắng (2–6 nước). Kết quả ghi ra caro/puzzles.json.
//   node server/scripts/gen-puzzles.js [số bài=240] [hạt giống=1]
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../../caro/rules.js');
const A = require('../../caro/analysis.js');
const B = require('../../caro/bots.js');

const WANT = +process.argv[2] || 240;
let seed = +process.argv[3] || 1;
const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const OUT = path.join(__dirname, '../../caro/puzzles.json');

// Hình dạng thế cờ (dời về gốc toạ độ, xét cả 8 phép xoay/lật) để loại bài trùng.
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

const ids = ['ti', 'bin', 'mai', 'minh'];
const out = [];
const seen = new Set();
let games = 0;
const t0 = Date.now();
while (out.length < WANT && games < WANT * 20) {
  games++;
  const sides = [ids[Math.floor(rng() * ids.length)], ids[Math.floor(rng() * ids.length)]];
  const board = new C.Board();
  const moves = [];
  let p = C.X;
  const found = [];
  for (let t = 0; t < 120; t++) {
    if (t >= 8 && !A.immediateWins(board, p).length && !A.immediateWins(board, C.other(p)).length) {
      const f = A.forced(board, p, 6, { deadline: Date.now() + 400 });
      if (f && f.len >= 2) { found.push({ n: moves.length, p, f }); break; }
    }
    // 3 nước đầu ngẫu nhiên quanh tâm để các ván không giống nhau.
    let x, y;
    if (t < 3) {
      do { x = Math.floor(rng() * 5) - 2; y = Math.floor(rng() * 5) - 2; } while (board.get(x, y));
    } else [x, y] = B.botMove(board, p, sides[p - 1], rng);
    board.play(x, y, p);
    moves.push([x, y]);
    if (C.checkWin(board, x, y, p)) break;
    p = C.other(p);
  }
  // Mỗi ván lấy thế sớm nhất có chuỗi ép (khó nhất), và thêm 1 bài dễ (còn 2 nước) ở giữa chuỗi đó.
  if (!found[0]) continue;
  const first = { prefix: moves.slice(0, found[0].n), p: found[0].p, f: found[0].f };
  const picks = [first];
  if (first.f.len > 2) {
    const b = new C.Board();
    first.prefix.forEach(([x, y], i) => b.play(x, y, i % 2 ? C.O : C.X));
    const line = first.prefix.slice();
    let f = first.f;
    for (let step = 0; f && f.len > 2 && step < 6; step++) {
      b.play(f.move[0], f.move[1], first.p);
      line.push(f.move);
      const r = A.bestBlock(b, C.other(first.p), f.move);
      if (!r) break;
      b.play(r[0], r[1], C.other(first.p));
      line.push(r);
      f = A.forced(b, first.p, 6, { deadline: Date.now() + 400 });
    }
    if (f && f.len === 2 && rng() < 0.6) picks.push({ prefix: line, p: first.p, f });
  }
  for (const pick of picks) add(pick);
  if (out.length % 20 < picks.length && picks.length) console.log(`${out.length} bài / ${games} ván – ${Math.round((Date.now() - t0) / 1000)}s`);
}

function add(pick) {
  const prefix = pick.prefix;
  const k = shapeKey(prefix);
  if (seen.has(k)) return;
  seen.add(k);
  // Đặt lại toạ độ quanh tâm thế cờ.
  const cx = Math.round(prefix.reduce((s, m) => s + m[0], 0) / prefix.length);
  const cy = Math.round(prefix.reduce((s, m) => s + m[1], 0) / prefix.length);
  const pb = new C.Board();
  prefix.forEach(([x, y], i) => pb.play(x - cx, y - cy, i % 2 ? C.O : C.X));
  // Độ khó: độ dài chuỗi + số "bẫy" (nước đe doạ trông hợp lý nhưng không thắng).
  let decoys = 0;
  for (const [x, y] of C.candidates(pb, 2)) {
    pb.put(x, y, pick.p);
    const threat = C.winCellsAround(pb, x, y, pick.p).length > 0;
    pb.remove(x, y);
    if (threat && !A.winningMove(pb, pick.p, [x, y], pick.f.len, { deadline: Date.now() + 400 })) decoys++;
  }
  const rating = Math.round((600 + 230 * (pick.f.len - 2) + 18 * Math.min(decoys, 12)) / 10) * 10;
  out.push({
    id: out.length + 1,
    m: prefix.map(([x, y]) => [x - cx, y - cy]),
    p: pick.p,
    len: pick.f.len,
    r: rating,
    sol: [pick.f.move[0] - cx, pick.f.move[1] - cy],
  });
}
out.sort((a, b) => a.r - b.r || a.id - b.id);
out.forEach((q, i) => { q.id = i + 1; });
fs.writeFileSync(OUT, '[\n' + out.map((q) => JSON.stringify(q)).join(',\n') + '\n]\n');
const hist = {};
for (const q of out) hist[q.len] = (hist[q.len] || 0) + 1;
console.log(`Xong: ${out.length} bài từ ${games} ván -> ${OUT}`, hist);
