// Tổng kết tháng / năm – phần tính (recap-core.js). Chạy: node --test caro/tests/recap-core.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const RC = require('../recap-core.js');

test('khoảng thời gian tháng / năm (giờ máy)', () => {
  const m = RC.range('month', 2026, 2);
  assert.strictEqual(new Date(m.from).getMonth(), 1);
  assert.strictEqual(new Date(m.to).getMonth(), 2);
  const y = RC.range('year', 2026);
  assert.strictEqual(new Date(y.from).getFullYear(), 2026);
  assert.strictEqual(new Date(y.to).getFullYear(), 2027);
  assert.strictEqual(RC.range('month', 2026, 12).to, new Date(2027, 0, 1).getTime());
});

test('summarize: thắng / hoà / thua, luật + thời gian ưa thích, thắng đẹp nhất, chuỗi thắng, đối thủ công khai', () => {
  const day = (d, h = 10) => new Date(2026, 10, d, h).getTime();
  const A = { id: 'a', name: 'An', r: 1500, pub: true }, B = { id: 'b', name: 'Bình', r: 1800, pub: false };
  const games = [
    { at: day(3), rule: 'vn', pool: 'blitz', res: 'win', opp: A, share: 's1' },
    { at: day(1), rule: 'vn', pool: 'blitz', res: 'win', opp: A },
    { at: day(2), rule: 'free', pool: 'rapid', res: 'win', opp: B, share: 's2' },
    { at: day(4), rule: 'vn', pool: 'rapid', res: 'loss', opp: B },
    { at: day(4, 12), rule: 'vn', pool: 'blitz', res: 'draw', opp: null },
    { at: day(5), rule: 'renju', pool: null, res: 'win', opp: { id: 'c', name: 'Cúc', r: 0 } },
    { res: '?' }, null,
  ];
  const s = RC.summarize(games);
  assert.strictEqual(s.n, 6);
  assert.deepStrictEqual([s.w, s.d, s.l], [4, 1, 1]);
  assert.deepStrictEqual(s.rule, { k: 'vn', n: 4 });
  assert.deepStrictEqual(s.pool, { k: 'blitz', n: 3 });
  assert.deepStrictEqual(s.best, { name: 'Bình', r: 1800, at: day(2), share: 's2' });
  assert.strictEqual(s.streak, 3, 'ngày 1, 2, 3 thắng liền (theo thứ tự thời gian)');
  assert.deepStrictEqual(s.opp, { name: 'An', n: 2 }, 'Bình không công khai: không tính');
  assert.strictEqual(s.days, 5);
  const e = RC.summarize([]);
  assert.deepStrictEqual(e, { n: 0, w: 0, d: 0, l: 0, rule: null, pool: null, best: null, streak: 0, opp: null, days: 0 });
  assert.strictEqual(RC.summarize([{ at: 1, res: 'win', opp: A }]).opp, null, 'gặp 1 lần: chưa phải hay gặp');
});
