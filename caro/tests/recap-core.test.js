// Tổng kết tháng / năm – phần tính (recap-core.js). Chạy: node --test caro/tests/recap-core.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const RC = require('../recap-core.js');

test('khoảng thời gian tháng / năm theo giờ Việt Nam (UTC+7) – máy chủ / trình duyệt ở múi giờ nào cũng như nhau', () => {
  const m = RC.range('month', 2026, 2);
  assert.strictEqual(m.from, Date.UTC(2026, 0, 31, 17), '00:00 1/2 giờ VN = 17:00 31/1 UTC');
  assert.strictEqual(m.to, Date.UTC(2026, 1, 28, 17));
  const y = RC.range('year', 2026);
  assert.strictEqual(y.from, Date.UTC(2025, 11, 31, 17));
  assert.strictEqual(y.to, Date.UTC(2026, 11, 31, 17));
  assert.strictEqual(RC.range('month', 2026, 12).to, y.to);
  assert.deepStrictEqual(RC.vnMonth(Date.UTC(2026, 0, 31, 17)), { y: 2026, m: 2 }, '0 giờ 1/2 ở VN');
  assert.deepStrictEqual(RC.vnMonth(Date.UTC(2026, 0, 31, 16, 59)), { y: 2026, m: 1 });
  // Ngày có chơi theo giờ VN: 23:30 và 00:30 (giờ VN) là hai ngày, dù cùng một ngày UTC
  const at = (h, min) => Date.UTC(2026, 10, 2, h - 7, min); // h giờ VN ngày 2/11
  assert.strictEqual(RC.summarize([{ at: at(23, 30), res: 'win' }, { at: at(24, 30), res: 'win' }]).days, 2);
  assert.strictEqual(RC.summarize([{ at: at(0, 30), res: 'win' }, { at: at(23, 50), res: 'loss' }]).days, 1);
});

test('summarize: thắng / hoà / thua, luật + thời gian ưa thích, thắng đẹp nhất, chuỗi thắng, đối thủ công khai', () => {
  const day = (d, h = 10) => Date.UTC(2026, 10, d, h - 7); // h giờ VN ngày d/11
  const A = { id: 'a', name: 'An', r: 1500, pub: true }, B = { id: 'b', name: 'Bình', r: 1800, pub: false };
  const B2 = { ...B, pub: true };
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
  assert.deepStrictEqual(s.best, { name: null, r: 1800, at: day(2), share: 's2' }, 'Bình không công khai: không lộ tên');
  assert.strictEqual(RC.summarize(games.map((g) => (g && g.opp === B ? { ...g, opp: B2 } : g))).best.name, 'Bình');
  assert.strictEqual(s.streak, 3, 'ngày 1, 2, 3 thắng liền (theo thứ tự thời gian)');
  assert.deepStrictEqual(s.opp, { name: 'An', n: 2 }, 'Bình không công khai: không tính');
  assert.strictEqual(s.days, 5);
  const e = RC.summarize([]);
  assert.deepStrictEqual(e, { n: 0, w: 0, d: 0, l: 0, rule: null, pool: null, best: null, streak: 0, opp: null, days: 0 });
  assert.strictEqual(RC.summarize([{ at: 1, res: 'win', opp: A }]).opp, null, 'gặp 1 lần: chưa phải hay gặp');
});
