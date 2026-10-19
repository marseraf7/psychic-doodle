/*
 * Độ chính xác cả ván theo cách Lichess (analysis.js summarize): trung bình của trung bình có trọng số theo độ biến động
 * và trung bình điều hoà; nước ở thế đã thua không tính.
 *   node --test caro/tests/analysis-acc.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
globalThis.Caro = require('../rules.js');
const A = require('../analysis.js');

const moveAcc = (d) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * d) - 3.1669));
/** Ván giả: drops[j] = % tụt của nước j (X đi nước chẵn), e = khả năng thắng của X sau nước (−1…+1). */
const game = (drops, es, cls) => drops.map((d, j) => ({ p: j % 2 ? 2 : 1, drop: d, e: es ? es[j] : 0, cls: (cls && cls[j]) || 'good' }));

test('toàn nước tốt: 100%; nước ở thế đã thua không tính', () => {
  assert.deepStrictEqual(A.summarize(game([0, 0, 0, 0])).acc, { 1: 100, 2: 100 });
  const r = A.summarize(game([0, 80, 0, 0], null, ['good', 'lost', 'good', 'good']));
  assert.deepStrictEqual(r.acc, { 1: 100, 2: 100 });
  assert.strictEqual(r.counts[2].lost, 1);
});

test('một nước hỏng kéo điểm xuống mạnh hơn trung bình cộng; tính đúng theo công thức', () => {
  // 20 nước; O (nước lẻ) có một nước tụt 40% ở thế đang giằng co, còn lại tốt
  const drops = Array(20).fill(0); drops[9] = 40;
  const es = drops.map((_, j) => (j < 9 ? 0 : -0.8)); // sau nước 9 X thắng thế (−0,8 = khả năng thắng X 10%… góc nhìn X)
  const r = A.summarize(game(drops, es));
  const mine = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19].map((j) => moveAcc(drops[j]));
  const mean = mine.reduce((t, x) => t + x, 0) / mine.length;
  assert.ok(r.acc[2] < Math.round(mean), `${r.acc[2]} < ${Math.round(mean)}`);
  assert.strictEqual(r.acc[1], 100);
  // Tính tay: w = 2, trọng số = độ lệch chuẩn của 2 thế liền nhau (kẹp 0,5..12)
  const win = [50, ...es.map((e) => 50 * (1 + e))];
  const sd = (a) => { const m = (a[0] + a[1]) / 2; return Math.sqrt(((a[0] - m) ** 2 + (a[1] - m) ** 2) / 2); };
  const wt = (j) => Math.max(0.5, Math.min(12, sd(win.slice(j, j + 2))));
  const ids = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const wm = ids.reduce((t, j) => t + moveAcc(drops[j]) * wt(j), 0) / ids.reduce((t, j) => t + wt(j), 0);
  const hm = ids.length / ids.reduce((t, j) => t + 1 / Math.max(1, moveAcc(drops[j])), 0);
  assert.strictEqual(r.acc[2], Math.round((wm + hm) / 2));
});

test('nước 0 điểm không kéo cả ván về một nửa (trung bình điều hoà: ít nhất 1 điểm mỗi nước)', () => {
  const drops = Array(40).fill(0); drops[21] = 100;
  const r = A.summarize(game(drops));
  assert.ok(r.acc[2] > 30 && r.acc[2] < 100, String(r.acc[2]));
});

test('keyMoments: có cả "Nước duy nhất"', () => {
  assert.deepStrictEqual(A.keyMoments({ moves: [{ cls: 'only' }, { cls: 'good' }] }), [{ cls: 'only' }]);
});
