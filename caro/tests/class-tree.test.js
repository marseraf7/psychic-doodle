// Lớp học / Nghiên cứu (C2): cây nước có biến, đưa biến lên nhánh chính, xoá, hình vẽ, làm sạch dữ liệu – caro/class-tree.js.
// Chạy: node --test caro/tests/class-tree.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Tr = require('../class-tree.js');

test('Thêm nước: đi theo nước có sẵn, nước mới thành biến; movesAt gồm thế ban đầu', () => {
  const ch = Tr.newChapter('A', 'vn', 'c1');
  ch.setup = [[5, 5]];
  let p = Tr.addMove(ch.root, [], [0, 0]);
  p = Tr.addMove(ch.root, p, [1, 1]);
  assert.deepStrictEqual(p, [0, 0]);
  assert.deepStrictEqual(Tr.addMove(ch.root, [], [0, 0]), [0], 'nước đã có: đi theo');
  const v = Tr.addMove(ch.root, [0], [2, 2]);
  assert.deepStrictEqual(v, [0, 1], 'nước mới: biến thứ hai');
  assert.deepStrictEqual(Tr.movesAt(ch, v), [[5, 5], [0, 0], [2, 2]]);
  assert.strictEqual(Tr.count(ch.root), 3);
  assert.deepStrictEqual(Tr.next(ch.root, [0]), [0, 0]);
  assert.deepStrictEqual(Tr.next(ch.root, [0, 0]), [0, 0], 'hết nước: đứng yên');
  assert.deepStrictEqual(Tr.prev([0, 1]), [0]);
  assert.deepStrictEqual(Tr.prev([]), []);
  assert.strictEqual(Tr.addMove(ch.root, [9], [3, 3]), null);
  assert.strictEqual(Tr.nodeAt(ch.root, [0, 5]), null);
});

test('Đưa biến lên nhánh chính, xoá nhánh, hình vẽ bật / tắt có trần', () => {
  const ch = Tr.newChapter('B');
  Tr.addMove(ch.root, [], [0, 0]);
  Tr.addMove(ch.root, [0], [1, 1]);
  Tr.addMove(ch.root, [0], [2, 2]);
  assert.deepStrictEqual(Tr.promote(ch.root, [0, 1]), [0, 0]);
  assert.deepStrictEqual(ch.root.ch[0].ch[0].m, [2, 2]);
  assert.deepStrictEqual(Tr.promote(ch.root, [0, 0]), [0, 0], 'đã là nhánh chính');
  assert.deepStrictEqual(Tr.promote(ch.root, []), []);
  assert.deepStrictEqual(Tr.remove(ch.root, [0, 1]), [0]);
  assert.strictEqual(ch.root.ch[0].ch.length, 1);
  assert.deepStrictEqual(Tr.remove(ch.root, []), []);
  const n = ch.root.ch[0];
  Tr.toggleShape(n, { k: 'm', x: 3, y: 3 });
  Tr.toggleShape(n, { k: 'a', x0: 0, y0: 0, x1: 4, y1: 4 });
  assert.strictEqual(n.s.length, 2);
  Tr.toggleShape(n, { k: 'm', x: 3, y: 3 });
  Tr.toggleShape(n, { k: 'a', x0: 0, y0: 0, x1: 4, y1: 4 });
  assert.strictEqual(n.s, undefined, 'bật lại lần hai: tắt, hết hình thì bỏ trường');
  for (let i = 0; i < 40; i++) Tr.toggleShape(n, { k: 'm', x: i, y: 0 });
  assert.strictEqual(n.s.length, Tr.LIMITS.shapes);
});

test('Làm sạch: bỏ nước trùng ô / sai kiểu / ngoài phạm vi / sau nước thắng, biến trùng; trần số nút; lời bình cắt', () => {
  const raw = {
    id: 'ok1', name: 'x'.repeat(100), rule: 'lạ', setup: [[0, 0], [0, 0], 'h8', [1, 0]],
    root: { c: 'gốc', s: [{ k: 'm', x: 1, y: 1 }, { k: 'zz' }, { k: 'a', x0: 0, y0: 0, x1: 1e9, y1: 0 }], ch: [
      { m: [0, 0], ch: [] }, // trùng ô thế ban đầu
      { m: [5, 5], c: 'y'.repeat(5000), ch: [{ m: [5, 5] }, { m: [6, 6], ch: [] }] },
      { m: [5, 5] }, // biến trùng nước
      { m: [999, 0] }, { m: 'h8' }, null,
    ] },
  };
  const c = Tr.clean(raw);
  assert.strictEqual(c.id, 'ok1');
  assert.strictEqual(c.name.length, Tr.LIMITS.name);
  assert.strictEqual(c.rule, 'vn');
  assert.deepStrictEqual(c.setup, [[0, 0], [1, 0]]);
  assert.strictEqual(c.root.c, 'gốc');
  assert.deepStrictEqual(c.root.s, [{ k: 'm', x: 1, y: 1 }]);
  assert.deepStrictEqual(c.root.ch.map((n) => n.m), [[5, 5]]);
  assert.strictEqual(c.root.ch[0].c.length, Tr.LIMITS.comment);
  assert.deepStrictEqual(c.root.ch[0].ch.map((n) => n.m), [[6, 6]]);
  // Không đi tiếp sau nước thắng (luật tự do: 5 quân)
  const win = { rule: 'free', root: { ch: [] } };
  let n = win.root;
  for (const m of [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [4, 1], [5, 5]]) { const k = { m, ch: [] }; n.ch.push(k); n = k; }
  assert.strictEqual(Tr.count(Tr.clean(win).root), 9, 'dừng ở nước thắng thứ 9');
  // Trần số nút
  const big = { root: { ch: [] } };
  n = big.root;
  for (let i = 0; i < 3000; i++) { const k = { m: [i % 500, Math.floor(i / 500) * 3], ch: [] }; n.ch.push(k); n = k; }
  assert.ok(Tr.count(Tr.clean(big).root) <= Tr.LIMITS.nodes);
  assert.deepStrictEqual(Tr.clean(null).root, { ch: [] });
  assert.match(Tr.clean({ id: '../x' }).id, /^[a-z0-9]+$/);
});
