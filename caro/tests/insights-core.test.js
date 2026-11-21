// Kiểm thử phần tính của Thống kê cá nhân (insights-core.js). Chạy: node --test caro/tests/insights-core.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const IC = require('../insights-core.js');

const flipX = (moves) => moves.map(([x, y]) => [-x, y]);
const rot = (moves) => moves.map(([x, y]) => [-y, x]);
const shift = (moves, dx, dy) => moves.map(([x, y]) => [x + dx, y + dy]);

test('khoá khai cuộc giống nhau khi dời / xoay / lật bàn, khác khi khác thế', () => {
  const a = [[0, 0], [1, 1], [1, 0], [2, 0], [5, 5]];
  const k = IC.openingKey(a).key;
  assert.strictEqual(IC.openingKey(flipX(a)).key, k);
  assert.strictEqual(IC.openingKey(rot(rot(a))).key, k);
  assert.strictEqual(IC.openingKey(shift(rot(a), 7, -3)).key, k);
  assert.notStrictEqual(IC.openingKey([[0, 0], [1, 1], [0, 1], [2, 0]]).key, k);
  assert.strictEqual(IC.openingKey([[0, 0], [1, 1]]), null, 'ván quá ngắn: không có khai cuộc');
  assert.strictEqual(IC.openingKey(a).cells.length, IC.OPEN_K);
  assert.deepStrictEqual(IC.openingKey(a).cells.map((c) => c[2]), [1, 2, 1, 2], 'X đi trước, luân phiên');
});

test('nhóm sức đối thủ và độ dài ván', () => {
  assert.strictEqual(IC.band(1500, 1250), 'much_weaker');
  assert.strictEqual(IC.band(1500, 1400), 'weaker');
  assert.strictEqual(IC.band(1500, 1530), 'equal');
  assert.strictEqual(IC.band(1500, 1650), 'stronger');
  assert.strictEqual(IC.band(1500, 1800), 'much_stronger');
  assert.strictEqual(IC.band(0, 1500), 'unknown');
  assert.strictEqual(IC.band(1500, undefined), 'unknown');
  assert.deepStrictEqual([5, 25, 45, 80].map(IC.lenBucket), ['l1', 'l2', 'l3', 'l4']);
});

test('mã nước đi ổn định và phân biệt', () => {
  assert.strictEqual(IC.hash([[0, 0], [1, 1]]), IC.hash([[0, 0], [1, 1]]));
  assert.notStrictEqual(IC.hash([[0, 0], [1, 1]]), IC.hash([[1, 1], [0, 0]]));
  assert.match(IC.hash(null), /^[0-9a-z]+$/);
});

test('aggregate: theo màu, luật, thời gian, sức đối thủ, độ dài, khai cuộc', () => {
  const op = [[0, 0], [1, 1], [1, 0], [2, 0]];
  const games = [
    { at: 1, rule: 'vn', pool: 'blitz', side: 1, res: 'win', moves: op.concat([[9, 9]]), band: 'equal' },
    { at: 2, rule: 'vn', pool: 'blitz', side: 2, res: 'loss', moves: flipX(op), band: 'stronger' },
    { at: 3, rule: 'renju', pool: 'none', side: 1, res: 'draw', moves: op, band: 'weird' },
    { at: 4, rule: 'xx', pool: 'zz', side: 2, res: 'win', n: 70 },
    { side: 3, res: 'win' }, { side: 1, res: '?' }, null,
  ];
  const d = IC.aggregate(games);
  assert.strictEqual(d.n, 4, 'bỏ ván không hợp lệ');
  assert.deepStrictEqual(d.total, { w: 2, d: 1, l: 1 });
  assert.deepStrictEqual(d.color[1], { w: 1, d: 1, l: 0 });
  assert.deepStrictEqual(d.color[2], { w: 1, d: 0, l: 1 });
  assert.deepStrictEqual(d.rule.vn, { w: 2, d: 0, l: 1 }, 'luật lạ tính là luật Việt Nam');
  assert.deepStrictEqual(d.rule.renju, { w: 0, d: 1, l: 0 });
  assert.deepStrictEqual(d.pool.none, { w: 1, d: 1, l: 0 });
  assert.strictEqual(d.band.unknown.w + d.band.unknown.d, 2);
  assert.deepStrictEqual(d.len.l4, { w: 1, d: 0, l: 0 }, 'không có nước đi thì dùng n');
  // Khai cuộc: 2 ván luật Việt Nam cùng hình (lật bàn) gộp làm một; Renju tách riêng
  const vn = d.openings.find((o) => o.rule === 'vn');
  assert.strictEqual(vn.w + vn.d + vn.l, 2);
  assert.strictEqual(vn.x, 1);
  assert.ok(d.openings.some((o) => o.rule === 'renju'));
  assert.strictEqual(IC.score(d.total), 63);
  assert.strictEqual(IC.score({ w: 0, d: 0, l: 0 }), 0);
  assert.strictEqual(IC.aggregate(null).n, 0);
});

test('anSummary + anAggregate: độ chính xác theo thời gian, lỗi theo loại và giai đoạn', () => {
  const res = {
    acc: { 1: 81.4, 2: 66.6 },
    moves: [
      { i: 3, p: 1, cls: 'inacc' }, { i: 4, p: 2, cls: 'blunder' }, { i: 15, p: 1, cls: 'mistake' },
      { i: 40, p: 1, cls: 'miss' }, { i: 41, p: 2, cls: 'good' }, null,
    ],
  };
  const s = IC.anSummary(res);
  assert.deepStrictEqual(s.a, { 1: 81, 2: 67 });
  assert.deepStrictEqual(s.c[1], { inacc: 1, mistake: 1, miss: 1 });
  assert.deepStrictEqual(s.ph[1], [0, 1, 1], 'chưa chính xác không tính vào giai đoạn');
  assert.deepStrictEqual(s.ph[2], [1, 0, 0]);
  assert.strictEqual(IC.anSummary(null), null);
  const a = IC.anAggregate([{ at: 20, side: 2, s }, { at: 10, side: 1, s }, { at: 5, side: 1 }]);
  assert.strictEqual(a.n, 2);
  assert.deepStrictEqual(a.trend, [[10, 81], [20, 67]], 'cũ → mới');
  assert.strictEqual(a.avg, 74);
  assert.strictEqual(a.mist.blunder, 1);
  assert.strictEqual(a.mist.inacc, 1);
  assert.ok(['inacc', 'mistake', 'miss', 'blunder'].includes(a.top));
  assert.deepStrictEqual(IC.anAggregate([]), { n: 0, avg: 0, mist: { inacc: 0, mistake: 0, blunder: 0, miss: 0 }, ph: [0, 0, 0], top: null, trend: [] });
  assert.deepStrictEqual([IC.phaseOf(0), IC.phaseOf(10), IC.phaseOf(30)], [0, 1, 2]);
});
