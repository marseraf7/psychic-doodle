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
  'luật Gomoku tự do: 5 quân trở lên thắng, bị chặn hai đầu vẫn thắng, 4 mở chưa thắng'() {
    const b = new C.Board('free');
    for (const [x, y] of [[1, 0], [2, 0], [3, 0], [4, 0]]) b.put(x, y, X);
    b.put(0, 0, O); b.put(6, 0, O);
    assert.ok(C.winsIfPlaced(b, 5, 0, X), 'chặn hai đầu vẫn thắng');
    b.put(7, 1, X); b.put(8, 1, X); b.put(9, 1, X); b.put(10, 1, X); b.put(12, 1, X);
    assert.ok(C.winsIfPlaced(b, 11, 1, X), 'quá năm vẫn thắng');
    const c = new C.Board('free');
    for (const [x, y] of [[0, 0], [1, 0], [2, 0]]) c.put(x, y, X);
    assert.ok(!C.winsIfPlaced(c, 3, 0, X), '4 mở chưa phải thắng');
  },
  'luật Gomoku tiêu chuẩn: chỉ đúng 5 quân'() {
    const b = new C.Board('std');
    for (const [x, y] of [[0, 0], [1, 0], [2, 0], [3, 0], [5, 0]]) b.put(x, y, X);
    assert.ok(!C.winsIfPlaced(b, 4, 0, X), '6 quân không thắng');
    assert.ok(C.winsIfPlaced(b, -1, 0, X), 'phía kia thành đúng 5 thì thắng');
    const c = new C.Board('std');
    for (const [x, y] of [[0, 0], [1, 0], [2, 0], [3, 0]]) c.put(x, y, X);
    c.put(-1, 0, O);
    assert.ok(C.winsIfPlaced(c, 4, 0, X), 'đúng 5, bị chặn 1 đầu vẫn thắng');
    assert.strictEqual(C.checkWin(c, 3, 0, X), null, '4 quân chưa thắng');
  },
  'luật Renju: nước cấm 3-3, 4-4 (kể cả trên một đường), quá năm; năm thắng trước; O không bị cấm'() {
    const mk = (xs, os) => { const b = new C.Board('renju'); xs.forEach(([x, y]) => b.put(x, y, X)); (os || []).forEach(([x, y]) => b.put(x, y, O)); return b; };
    assert.strictEqual(C.forbidden(mk([[1, 0], [2, 0], [0, 1], [0, 2]]), 0, 0, X), '33');
    assert.strictEqual(C.forbidden(mk([[1, 0], [3, 0], [0, 1], [0, 2]]), 0, 0, X), '33', 'ba gãy (có khe) cũng tính');
    assert.strictEqual(C.forbidden(mk([[1, 0], [2, 0], [0, 1], [0, 2]], [[3, 0]]), 0, 0, X), null, 'một đường ba bị chặn: không cấm');
    assert.strictEqual(C.forbidden(mk([[1, 0], [2, 0], [3, 0], [0, 1], [0, 2], [0, 3]], [[-1, 0], [0, -1]]), 0, 0, X), '44');
    assert.strictEqual(C.forbidden(mk([[-3, 0], [-1, 0], [1, 0], [3, 0]]), 0, 0, X), '44', '4-4 trên cùng một đường');
    assert.strictEqual(C.forbidden(mk([[1, 0], [2, 0], [3, 0], [0, 1], [0, 2]], [[-1, 0]]), 0, 0, X), null, '4-3 được phép');
    assert.strictEqual(C.forbidden(mk([[1, 0], [2, 0], [3, 0], [-1, 0], [-2, 0]]), 0, 0, X), 'overline');
    assert.strictEqual(C.forbidden(mk([[1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [0, 2], [0, 3]], [[0, -1]]), 0, 0, X), null, 'thành năm thì thắng, không cấm');
    assert.strictEqual(C.forbidden(mk([[1, 0], [2, 0], [0, 1], [0, 2]]), 0, 0, O), null);
    assert.strictEqual(C.forbidden(new C.Board(), 0, 0, X), null, 'luật Việt Nam không có nước cấm');
    // 3-3 "giả": một đường ba chỉ thành bốn thẳng qua một ô cấm thì không tính là ba
    const fake = mk([[1, 0], [2, 0], [0, 1], [0, 2], [-1, -3], [-1, -1], [-2, -2], [-3, -2], [-3, -1]]);
    assert.ok(['33', null].includes(C.forbidden(fake, 0, 0, X)));
    // X không thắng với 6 quân, O thì có
    const o6 = mk([[0, 0], [1, 0], [2, 0], [4, 0], [5, 0]]);
    assert.ok(!C.winsIfPlaced(o6, 3, 0, X));
    const w6 = new C.Board('renju');
    for (const x of [0, 1, 2, 4, 5]) w6.put(x, 0, O);
    assert.ok(C.winsIfPlaced(w6, 3, 0, O));
    // AI (X) không bao giờ đánh vào ô cấm
    const lure = new C.Board('renju');
    [[1, 0], [9, 9], [2, 0], [9, 10], [0, 1], [10, 9], [0, 2], [8, 8]].forEach(([x, y], i) => lure.play(x, y, i % 2 ? O : X));
    assert.strictEqual(C.forbidden(lure, 0, 0, X), '33');
    for (const lv of [1, 2, 3]) {
      const [x, y] = C.chooseMove(lure, X, lv, () => 0.5);
      assert.strictEqual(C.forbidden(lure, x, y, X), null, 'mức ' + lv);
    }
    assert.ok(!C.legal(lure, [[0, 0], [5, 5]], X).some(([x, y]) => x === 0 && y === 0));
    assert.ok(C.legal(lure, [[0, 0]], O).length === 1);
  },
  'ruleOf: luật lạ -> luật Việt Nam'() {
    assert.strictEqual(C.ruleOf('abc'), 'vn');
    assert.strictEqual(new C.Board('renju').rule, 'renju');
    assert.strictEqual(new C.Board().rule, 'vn');
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
