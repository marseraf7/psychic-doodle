// Chạy: node caro/tests/rules.test.js
'use strict';
const assert = require('assert');
const C = require('../rules.js');
const { X, O } = C;

function board(stones) {
  const b = new C.Board();
  for (const [x, y, p] of stones) b.play(x, y, p);
  return b;
}
const row = (xs, y, p) => xs.map((x) => [x, y, p]);

const tests = {
  '4 quân không bị chặn -> thắng'() {
    const b = board(row([0, 1, 2, 3], 0, X));
    assert.ok(C.checkWin(b, 3, 0, X));
  },
  '4 quân bị chặn 1 đầu -> chưa thắng'() {
    const b = board([...row([0, 1, 2, 3], 0, X), [-1, 0, O]]);
    assert.strictEqual(C.checkWin(b, 3, 0, X), null);
  },
  '5 quân bị chặn 1 đầu -> thắng'() {
    const b = board([...row([0, 1, 2, 3, 4], 0, X), [-1, 0, O]]);
    assert.ok(C.checkWin(b, 4, 0, X));
  },
  '5 quân bị chặn 2 đầu -> không thắng'() {
    const b = board([...row([0, 1, 2, 3, 4], 0, X), [-1, 0, O], [5, 0, O]]);
    assert.strictEqual(C.checkWin(b, 2, 0, X), null);
  },
  '6 quân bị chặn 2 đầu -> không thắng'() {
    const b = board([...row([0, 1, 2, 3, 4, 5], 0, X), [-1, 0, O], [6, 0, O]]);
    assert.strictEqual(C.checkWin(b, 2, 0, X), null);
  },
  '3 quân không bị chặn -> chưa thắng'() {
    const b = board(row([0, 1, 2], 0, X));
    assert.strictEqual(C.checkWin(b, 2, 0, X), null);
  },
  'đường chéo 4 quân trống 2 đầu -> thắng'() {
    const b = board([[0, 0, X], [1, 1, X], [2, 2, X], [3, 3, X]]);
    assert.ok(C.checkWin(b, 0, 0, X));
  },
  'đường chéo ngược 5 quân chặn 1 đầu -> thắng'() {
    const b = board([[0, 0, X], [1, -1, X], [2, -2, X], [3, -3, X], [4, -4, X], [5, -5, O]]);
    assert.ok(C.checkWin(b, 2, -2, X));
  },
  'toạ độ rất xa (bàn vô hạn)'() {
    const b = board(row([90000, 90001, 90002, 90003], -70000, O));
    assert.ok(C.checkWin(b, 90000, -70000, O));
  },
  'AI thắng ngay khi có thể'() {
    const b = board([...row([0, 1, 2], 0, O), [0, 5, X], [1, 5, X], [9, 9, X]]);
    const [x, y] = C.chooseMove(b, O, 2, () => 0.5);
    b.play(x, y, O);
    assert.ok(C.checkWin(b, x, y, O), `AI đánh ${x},${y}`);
  },
  'AI chặn 3 quân trống 2 đầu'() {
    const b = board([...row([0, 1, 2], 0, X), [5, 5, O]]);
    const [x, y] = C.chooseMove(b, O, 2, () => 0.5);
    assert.ok(y === 0 && (x === -1 || x === 3), `AI đánh ${x},${y}`);
  },
  'AI chặn 4 quân bị chặn 1 đầu'() {
    const b = board([...row([0, 1, 2, 3], 0, X), [-1, 0, O], [5, 5, O]]);
    const [x, y] = C.chooseMove(b, O, 3, () => 0.5);
    assert.deepStrictEqual([x, y], [4, 0]);
  },
  'AI tự tạo nước thắng chắc (2 đe doạ)'() {
    // O có 2 quân ngang và 2 quân dọc giao nhau tại (2,0)
    const b = board([[0, 0, O], [1, 0, O], [2, 1, O], [2, 2, O], [10, 10, X], [11, 10, X], [10, 12, X]]);
    const [x, y] = C.chooseMove(b, O, 2, () => 0.5);
    assert.deepStrictEqual([x, y], [2, 0]);
  },
  'AI Khó chơi hết 1 ván với chính nó không lỗi'() {
    const b = new C.Board();
    let p = X, winner = null;
    for (let i = 0; i < 120 && !winner; i++) {
      const [x, y] = C.chooseMove(b, p, 3);
      assert.strictEqual(b.get(x, y), 0);
      b.play(x, y, p);
      if (C.checkWin(b, x, y, p)) winner = p;
      p = C.other(p);
    }
  },
};

let fail = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('✓', name); }
  catch (e) { fail++; console.log('✗', name, '\n   ', e.message); }
}
console.log(fail ? `${fail} lỗi` : 'Tất cả đều đạt');
process.exit(fail ? 1 : 0);
