// Lời giải thích của huấn luyện viên (coach.js) trên các thế cờ dựng sẵn – mỗi mẫu câu một ca. Chạy: node --test caro/tests/coach.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const CO = require('../coach.js');

/** Ghép quân X và O thành chuỗi nước đi (X trước, luân phiên); thiếu thì thêm quân đệm ở xa. */
function seq(xs, os) {
  const pad = [[40, 40], [-40, 40], [40, -40], [-40, -40], [60, 0], [-60, 0], [0, 60], [0, -60]];
  xs = xs.slice(); os = os.slice();
  while (os.length < xs.length) os.push(pad.pop());
  while (xs.length < os.length) xs.push(pad.pop());
  const out = [];
  for (let i = 0; i < xs.length; i++) out.push(xs[i], os[i]);
  return out;
}
const keys = (list) => list.map((e) => e.k);
const C = require('../rules.js');
function boardOf(moves, rule) {
  const b = new C.Board(rule);
  moves.forEach(([x, y], i) => b.play(x, y, i % 2 ? C.O : C.X));
  return b;
}
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

test('bỏ lỡ thắng ngay + nước tốt nhất', () => {
  const moves = seq([[0, 0], [1, 0], [2, 0], [3, 0]], [[10, 10], [-10, 10], [10, -10], [-10, -10]]);
  const i = moves.length; // X tới lượt
  const r = CO.explain(moves.concat([[20, 20]]), i, { cls: 'miss', best: [4, 0], len: 1 }, 'free');
  assert.deepStrictEqual(keys(r), ['miss_win', 'best']);
  assert.ok(same(r[0].at, [4, 0]) || same(r[0].at, [-1, 0]));
});

// X: hàng (1..3, 0) bị O chặn ở (0, 0); cột (4, 1..3) bị O chặn ở (4, 4) → (4, 0) là bốn kép (VCF 2 nước)
const VCF_X = [[1, 0], [2, 0], [3, 0], [4, 1], [4, 2], [4, 3]], VCF_O = [[0, 0], [4, 4], [10, 10], [-10, 10], [10, -10], [-10, -10]];

test('bỏ lỡ chuỗi bốn liên tiếp (VCF); nước tốt nhất là nước đôi', () => {
  const moves = seq(VCF_X, VCF_O);
  const r = CO.explain(moves.concat([[20, 20]]), moves.length, { cls: 'miss', best: [4, 0], len: 2 }, 'free');
  assert.deepStrictEqual(keys(r), ['miss_vcf', 'best_double']);
  assert.ok(same(r[0].at, [4, 0]));
  assert.ok(r[0].n >= 2);
});

test('bỏ lỡ chuỗi đe doạ (không có VCF) – dùng nước của máy', () => {
  const moves = seq([[0, 0], [1, 1]], [[10, 10], [-10, 10]]);
  const r = CO.explain(moves.concat([[20, 20]]), moves.length, { cls: 'miss', best: [2, 2], len: 5 }, 'free');
  assert.deepStrictEqual(keys(r), ['miss_vct', 'best']);
  assert.strictEqual(r[0].n, 5);
});

test('không chặn bốn của đối thủ + bỏ qua phòng thủ', () => {
  const moves = seq([[20, 0], [-20, 0], [0, 20], [0, -20]], [[0, 5], [1, 5], [2, 5], [3, 5]]);
  // X chỉ chặn một đầu của bốn mở: O vẫn thắng ở đầu kia
  const r = CO.explain(moves.concat([[-1, 5]]), moves.length, { cls: 'blunder', best: [4, 5], len: 1 }, 'free');
  assert.deepStrictEqual(keys(r), ['no_block', 'defense', 'best']);
  assert.ok(same(r[0].at, [4, 5]));
  assert.strictEqual(r[1].n, 1);
});

// O có ba mở (0..2, 5), hai đầu còn rộng
const THREE = seq([[20, 0], [-20, 0], [0, 20]], [[0, 5], [1, 5], [2, 5]]);

test('chặn sai đầu ba mở', () => {
  const r = CO.explain(THREE.concat([[4, 5]]), THREE.length, { cls: 'mistake', best: [3, 5], len: 3 }, 'free');
  assert.deepStrictEqual(keys(r), ['wrong_end', 'defense', 'best']);
  assert.ok(same(r[0].at, [-1, 5]) || same(r[0].at, [3, 5]));
});

test('bỏ mặc ba mở của đối thủ', () => {
  const r = CO.explain(THREE.concat([[0, -20]]), THREE.length, { cls: 'mistake', best: [3, 5], len: 3, ev: false }, 'free');
  assert.strictEqual(r[0].k, 'ignore_three');
});

test('để đối thủ có chuỗi bốn liên tiếp (VCF) dù chưa có ba mở', () => {
  // O: hàng (0..2, 0) chặn ở (−1, 0); chéo (0,0)(1,1)(2,2) chặn ở (−1, −1); cột (3, 1..2) chặn ở (3, 4)
  // → O đánh (3, 0) (bốn, X phải chặn (4, 0)) rồi (3, 3) thành bốn kép
  const moves = seq([[-1, 0], [3, 4], [-1, -1], [20, 20], [20, -20], [-20, 20], [-20, -20]],
    [[0, 0], [1, 0], [2, 0], [3, 1], [3, 2], [1, 1], [2, 2]]);
  assert.strictEqual(CO.openFourMakers(boardOf(moves, 'free'), 2).length, 0, 'O chưa có ba mở / bốn kép');
  const r = CO.explain(moves.concat([[30, 30]]), moves.length, { cls: 'mistake', best: [3, 0], len: 3 }, 'free');
  assert.deepStrictEqual(keys(r), ['allow_vcf', 'defense', 'best']);
  assert.ok(same(r[0].at, [3, 0]) || same(r[0].at, [3, 3]), 'bắt đầu bằng một nước bốn của chuỗi');
});

test('chỉ chấm theo khả năng thắng: nói mức tụt + nước tốt hơn; nước tốt thì không giải thích', () => {
  const moves = seq([[0, 0], [1, 1]], [[0, 1], [5, 5]]);
  const r = CO.explain(moves.concat([[9, 9]]), moves.length, { cls: 'inacc', best: [2, 2], drop: 12, ev: true }, 'free');
  assert.deepStrictEqual(r, [{ k: 'drop', d: 12 }, { k: 'best', at: [2, 2] }]);
  assert.deepStrictEqual(CO.explain(moves.concat([[2, 2]]), moves.length, { cls: 'good' }, 'free'), []);
  assert.deepStrictEqual(CO.explain(moves, moves.length, { cls: 'miss' }, 'free'), [], 'không có nước');
});

test('gợi ý "Tìm nước tốt hơn" không lộ đáp án', () => {
  assert.strictEqual(CO.hint(seq([[0, 0], [1, 0], [2, 0], [3, 0]], [[10, 10], [-10, 10], [10, -10], [-10, -10]]), 1, 'free').k, 'hint_win');
  const four = CO.hint(seq([[20, 0], [-20, 0], [0, 20], [0, -20]], [[0, 5], [1, 5], [2, 5], [3, 5]]), 1, 'free');
  assert.strictEqual(four.k, 'hint_four');
  assert.strictEqual(CO.hint(seq(VCF_X, VCF_O), 1, 'free').k, 'hint_vcf');
  assert.strictEqual(CO.hint(THREE, 1, 'free').k, 'hint_three');
  assert.strictEqual(CO.hint(seq([[0, 0]], [[5, 5]]), 1, 'free').k, 'hint_attack');
});

test('dịch thành câu (đủ biến, không lộ {x})', () => {
  const T = (k, v) => `${k}:${v.move}:${v.n}:${v.d}`;
  assert.strictEqual(CO.text([{ k: 'best', at: [1, 2] }, { k: 'drop', d: 9 }], T, (c) => c.join('-')), 'coach_best:1-2:0:0 coach_drop::0:9');
  assert.strictEqual(CO.text(null, T, String), '');
  assert.ok(CO.onLine([4, 5], [[0, 5]]) && !CO.onLine([4, 6], [[0, 5]]) && !CO.onLine([9, 5], [[0, 5]]));
});

test('luật Việt Nam: bỏ lỡ thắng ngay vẫn nhận ra', () => {
  const moves = seq([[0, 0], [1, 0], [2, 0], [3, 0]], [[10, 10], [-10, 10], [10, -10], [-10, -10]]);
  const r = CO.explain(moves.concat([[20, 20]]), moves.length, { cls: 'miss', best: [4, 0], len: 1 }, 'vn');
  assert.strictEqual(r[0].k, 'miss_win');
});
