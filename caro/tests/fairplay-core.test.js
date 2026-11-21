// Soát chơi đẹp – phần tính (fairplay-core.js). Chạy: node --test caro/tests/fairplay-core.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const FC = require('../fairplay-core.js');

test('stats: tỉ lệ trùng nước máy cờ, mức tụt trung bình, bỏ khai cuộc / thế thắng chắc / thế đã thua', () => {
  const moves = Array.from({ length: 14 }, (_, i) => [i, i % 2]);
  const evals = moves.map((m, i) => ({ move: i % 3 === 0 ? [99, 99] : m, score: 0, mate: 0 }));
  evals[12] = { move: moves[12], score: 0, mate: 3 }; // đang thắng chắc: không tính
  const res = {
    acc: { 1: 88.4, 2: 71.2 }, evals,
    moves: moves.map((m, i) => ({ i, p: i % 2 ? 2 : 1, cls: i === 13 ? 'lost' : 'good', drop: i % 3 === 0 ? 12 : 0 })),
  };
  const s = FC.stats(moves, res);
  // X (chẵn): i = 6, 8, 10 (12 bỏ – thắng chắc); trùng khi i % 3 ≠ 0 → 8, 10 → 2/3
  assert.deepStrictEqual(s[1], { n: 3, match: 67, loss: 4, acc: 88 });
  // O (lẻ): i = 7, 9, 11 (13 bỏ – thế đã thua); i = 9 lệch → 2/3, tụt 12/3 = 4
  assert.deepStrictEqual(s[2], { n: 3, match: 67, loss: 4, acc: 71 });
  assert.deepStrictEqual(FC.stats([], null)[1], { n: 0, match: 0, loss: 0, acc: 0 });
  assert.strictEqual(FC.stats(moves, { moves: [{ i: 7, p: 2, cls: 'good' }] })[2].n, 0, 'không có evals: không tính');
});

test('đếm rời tab chỉ trong lượt của mình', () => {
  let mine = false;
  const t = FC.blurTracker(() => mine);
  t.onHide(1000);
  assert.strictEqual(t.onShow(5000), null, 'không phải lượt mình: không đếm');
  mine = true;
  t.onHide(10000);
  assert.ok(t.hidden);
  t.onHide(11000); // gọi lặp (blur + visibilitychange): giữ mốc đầu
  assert.deepStrictEqual(t.onShow(14500), { n: 1, ms: 4500 });
  assert.strictEqual(t.onShow(15000), null);
});
