/*
 * Kiểm tra engine.js (Alpha-Beta + chuỗi ép, luật Caro Việt Nam).
 *   node caro/tests/engine.test.js
 */
'use strict';
const assert = require('assert');
const path = require('path');
const C = require('../rules.js');
globalThis.Caro = C;
const E = require('../engine.js');
const B = require('../bots.js');
const { X, O } = C;

function seeded(s) { return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
function board(moves) { const b = new C.Board(); moves.forEach(([x, y], i) => b.play(x, y, i % 2 ? O : X)); return b; }

const tests = {
  'luật thắng giống rules.js (5+ còn 1 đầu trống, 4 không bị chặn, chặn 2 đầu không tính) và cập nhật dần đúng'() {
    const rng = seeded(7);
    let checked = 0;
    for (let g = 0; g < 60; g++) {
      const b = new C.Board(); const mv = [];
      for (let k = 0; k < 36; k++) {
        const x = Math.floor(rng() * 9) - 4, y = Math.floor(rng() * 9) - 4;
        if (b.get(x, y)) continue;
        const p = mv.length % 2 ? O : X;
        b.play(x, y, p); mv.push([x, y]);
        if (C.checkWin(b, x, y, p)) break;
        const pos = new E.Position(mv);
        for (let yy = -7; yy <= 7; yy++) for (let xx = -7; xx <= 7; xx++) {
          if (b.get(xx, yy)) continue;
          for (const q of [X, O]) { checked++; assert.strictEqual(!!pos.win[q][pos.idx(xx, yy)], C.winsIfPlaced(b, xx, yy, q), `(${xx},${yy}) bên ${q} sau ${JSON.stringify(mv)}`); }
        }
        assert.strictEqual(pos.evalX, new E.Position(mv).evalX, 'điểm cập nhật dần = tính lại');
      }
    }
    assert.ok(checked > 50000);
  },
  'đi rồi lùi trả lại đúng trạng thái (khoá, điểm, ô thắng)'() {
    const pos = new E.Position([[0, 0], [1, 1], [1, 0], [2, 2], [2, 0], [0, 3]]);
    const snap = () => [pos.key, pos.evalX, pos.winCount.join(), Array.from(pos.win[X]).join(''), Array.from(pos.near).join('')].join('|');
    const before = snap();
    for (let i = 0; i < pos.cells.length; i++) if (!pos.cells[i] && pos.near[i]) { pos.play(i, pos.side); pos.undo(); }
    assert.strictEqual(snap(), before);
  },
  'hàng 5 bị chặn hai đầu không phải ô thắng; 3 quân không bị chặn là đe doạ (có ô thắng)'() {
    // O X X X X _ O: X đánh vào ô trống thành 5 nhưng bị chặn hai đầu -> không thắng
    const pos = new E.Position([[1, 0], [0, 0], [2, 0], [6, 0], [3, 0], [9, 9], [4, 0]]);
    assert.strictEqual(pos.win[X][pos.idx(5, 0)], 0);
    // _ _ X X X _ _: X có 2 ô thắng (thành 4 không bị chặn)
    const p2 = new E.Position([[0, 0], [9, 9], [1, 0], [9, 7], [2, 0]]);
    assert.ok(p2.win[X][p2.idx(-1, 0)] && p2.win[X][p2.idx(3, 0)]);
  },
  'giải đủ 300 bài đố, nước đầu là nước công hợp lệ'() {
    const list = require(path.join(__dirname, '../puzzles.json'));
    let solved = 0;
    for (const q of list) {
      const r = E.analyse(q.m, { ms: 400 });
      const b = board(q.m);
      assert.strictEqual(b.get(r.move[0], r.move[1]), C.EMPTY, `#${q.id}: ô đã có quân`);
      if (r.mate > 0 && r.mate <= q.len + 1) solved++;
    }
    assert.ok(solved >= 297, `giải ${solved}/300`);
  },
  'bên sắp thua thấy mình thua chắc (điểm âm, mate < 0)'() {
    // O tới lượt, X có 4 quân hai đầu đều trống (không chặn nổi cả hai)
    const r = E.analyse([[0, 0], [0, 5], [1, 0], [5, 5], [2, 0], [9, 9], [3, 0]], { ms: 200 });
    assert.ok(r.mate < 0 && r.score < 0, JSON.stringify(r));
  },
  'ván máy tự đánh: nước luôn hợp lệ, không treo'() {
    const rng = seeded(11);
    const b = new C.Board(); const mv = [];
    for (let t = 0; t < 40; t++) {
      const p = t % 2 ? O : X;
      const m = t % 2 ? B.botMove(b, p, 'minh', rng) : E.analyse(mv, { ms: 80 }).move;
      assert.strictEqual(b.get(m[0], m[1]), C.EMPTY);
      b.play(m[0], m[1], p); mv.push(m);
      if (C.checkWin(b, m[0], m[1], p)) break;
    }
  },
  'GOAT dùng engine: thắng ngay khi có thể, luôn chặn'() {
    const win = board([[0, 0], [0, 5], [1, 0], [1, 5], [2, 0], [2, 5], [9, 9]]);
    const [x, y] = B.botMove(win, O, 'rong', seeded(1));
    assert.ok(C.winsIfPlaced(win, x, y, O));
    const block = board([[0, 0], [0, 5], [1, 0], [9, 9], [2, 0]]);
    const [bx, by] = B.botMove(block, O, 'rong', seeded(1));
    block.put(bx, by, O);
    assert.ok(![[-1, 0], [3, 0]].some(([wx, wy]) => !block.get(wx, wy) && C.winsIfPlaced(block, wx, wy, X)), 'chặn thế 3');
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('✓ ' + name); } catch (e) { failed++; console.log('✗ ' + name + '\n   ' + e.message); }
}
console.log(failed ? `${failed} bài kiểm tra lỗi` : 'Tất cả đều đạt');
process.exit(failed ? 1 : 0);
