/*
 * "Bộ não" của Rapfi (caro/rapfi/brain.js): đọc chuỗi nước tốt nhất, đáp nhanh khi đoán trúng, tự chia thời gian theo quỹ
 * giờ, phân tích theo số nút.
 *   node --test caro/tests/rapfi-brain.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const B = require('../rapfi/brain.js');

// Dòng Rapfi-CARO in ra thật (Node, bàn 20×20)
const LINES = [
  'MESSAGE OptiTime 352ms | MaxTime 470ms',
  'MESSAGE Depth 12-12 | Eval -273 | Time 72ms | I13 L10 K10 M11',
  'MESSAGE Depth 13-30 | Eval -300 | Time 472ms | K10',
  'MESSAGE Speed 688K | Depth 13-30 | Eval -300 | Node 325K | Time 472ms',
  '10,9',
];

test('đọc chuỗi nước tốt nhất: dòng Depth cuối, "K10" = (10, 9) như nước "10,9"', () => {
  assert.deepStrictEqual(B.cell('K10'), [10, 9]);
  assert.deepStrictEqual(B.cell('A1'), [0, 0]);
  assert.strictEqual(B.cell('10,9'), null);
  assert.deepStrictEqual(B.parsePV(LINES), { depth: 13, pv: [[10, 9]] });
  assert.deepStrictEqual(B.parsePV(LINES.slice(0, 2)), { depth: 12, pv: [[8, 12], [11, 9], [10, 9], [12, 10]] });
  assert.strictEqual(B.parsePV(['MESSAGE Depth 3-3 | Eval +M5 | Time 1ms | ']), null);
  assert.strictEqual(B.parsePV([]), null);
  assert.deepStrictEqual(B.parsePV(['MESSAGE Depth 9-14 | Eval +M5 | Time 3ms | B2']), { depth: 9, pv: [[1, 1]] });
});

test('lượt thường / phân tích theo số nút / nghĩ trước', () => {
  const b = B.create();
  assert.deepStrictEqual(b.plan([[1, 1]], 2500, { play: true }).cmds, ['INFO timeout_match 0', 'INFO max_node 0', 'INFO timeout_turn 2500']);
  const an = b.plan([[1, 1]], 400, { nodes: 300000 });
  assert.deepStrictEqual(an.cmds, ['INFO timeout_match 0', 'INFO max_node 300000', `INFO timeout_turn ${400 * B.NODE_CAP}`]);
  assert.strictEqual(an.turn, 400 * B.NODE_CAP);
  assert.deepStrictEqual(b.plan([[1, 1]], 400, { nodes: 300000, fresh: true }).cmds, ['YXHASHCLEAR', ...an.cmds]);
  assert.deepStrictEqual(b.plan([[1, 1]], 300).cmds, ['INFO timeout_match 0', 'INFO max_node 0', 'INFO timeout_turn 300']);
  assert.strictEqual(B.fixedTime(2500), Math.round(0.75 * 2470));
});

test('đoán trúng: đúng nước dự đoán, đúng thế, nghĩ trước đủ lâu → nghĩ HIT_FRAC thời gian', () => {
  const b = B.create();
  const pos = [[10, 10], [11, 11]];
  b.pondered(pos, LINES, 1200);
  assert.strictEqual(b.isHit(pos.concat([[10, 9]]), 2500), false, 'nghĩ trước chưa đủ 2500 ms');
  b.pondered(pos, LINES.slice(0, 2), 1400); // lát sau: chuỗi mới, cộng dồn thời gian
  assert.strictEqual(b.isHit(pos.concat([[10, 9]]), 2500), false, 'nước dự đoán giờ là (8, 12)');
  assert.strictEqual(b.isHit(pos.concat([[8, 12]]), 2500), true);
  assert.strictEqual(b.isHit([[10, 10], [11, 12], [8, 12]], 2500), false, 'thế khác');
  assert.strictEqual(b.isHit(pos, 2500), false);
  const p = b.plan(pos.concat([[8, 12]]), 2500, { play: true });
  assert.strictEqual(p.hit, true);
  assert.strictEqual(p.turn, Math.round(2500 * B.HIT_FRAC));
  assert.strictEqual(b.plan(pos.concat([[8, 12]]), 500, { play: true }).turn, B.HIT_MIN);
  assert.strictEqual(b.plan(pos.concat([[8, 12]]), 2500, { play: true, hit: false }).hit, false);
  assert.strictEqual(b.plan(pos.concat([[8, 12]]), 2500, { nodes: 1000 }).hit, false, 'phân tích không dùng');
  // Thế khác: bắt đầu lại từ 0
  b.pondered([[1, 1]], LINES, 100);
  assert.strictEqual(b.isHit([[1, 1], [10, 9]], 2500), false);
  b.reset();
  assert.strictEqual(b.isHit(pos.concat([[8, 12]]), 2500), false);
});

test('tự chia thời gian: quỹ Fischer, time_left gửi sau cùng, nước đoán trúng không tính', () => {
  const b = B.create(), ms = 2500, inc = B.fixedTime(ms);
  const p = b.plan([[1, 1]], ms, { play: true, tm: true });
  assert.strictEqual(p.tm, true);
  assert.strictEqual(b.bank, B.TM_SPACE * inc);
  // timeout_match / timeout_turn đặt lại quỹ trong Rapfi → time_left phải đứng sau
  assert.deepStrictEqual(p.cmds.map((c) => c.split(' ')[1]), ['max_node', 'timeout_match', 'timeout_turn', 'time_left']);
  assert.strictEqual(p.cmds[3], 'INFO time_left ' + B.TM_SPACE * inc);
  assert.strictEqual(p.turn, B.TM_CAP * ms);
  b.done(p, 4000, ms);
  assert.strictEqual(b.bank, B.TM_SPACE * inc - 4000 + inc);
  b.done(p, 10 ** 7, ms); // tiêu quá: không xuống dưới 2 lượt
  assert.strictEqual(b.bank, 2 * inc);
  for (let i = 0; i < 200; i++) b.done(p, 0, ms); // tiết kiệm mãi: không quá 3 lần quỹ đầu
  assert.strictEqual(b.bank, 3 * B.TM_SPACE * inc);
  // Đoán trúng: nghĩ ngắn, quỹ giữ nguyên
  const pos = [[10, 10], [11, 11]];
  b.pondered(pos, LINES, 5000);
  const h = b.plan(pos.concat([[10, 9]]), ms, { play: true, tm: true });
  assert.strictEqual(h.hit, true);
  const before = b.bank;
  b.done(h, 500, ms);
  assert.strictEqual(b.bank, before);
  // Không bật tm: không đụng quỹ
  const f = B.create();
  f.done(f.plan([[1, 1]], ms, { play: true }), 100, ms);
  assert.strictEqual(f.bank, null);
});
