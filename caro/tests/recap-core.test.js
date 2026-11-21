// Tổng kết tháng / năm – phần tính (recap-core.js). Chạy: node --test caro/tests/recap-core.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const RC = require('../recap-core.js');

// Múi giờ của "thiết bị" trong bài thử: Berlin (có giờ mùa hè) – đặt trước khi dùng Date
process.env.TZ = 'Europe/Berlin';

test('khoảng thời gian tháng / năm + tháng hiện tại theo múi giờ thiết bị (khách / dữ liệu trên máy), đúng giờ mùa hè', () => {
  const m = RC.range('month', 2026, 4);
  assert.strictEqual(m.from, Date.UTC(2026, 2, 31, 22), '00:00 1/4 giờ Berlin (CEST) = 22:00 31/3 UTC');
  assert.strictEqual(m.to, Date.UTC(2026, 3, 30, 22));
  const y = RC.range('year', 2026);
  assert.strictEqual(y.from, Date.UTC(2025, 11, 31, 23), '00:00 1/1 giờ Berlin (CET)');
  assert.strictEqual(y.to, Date.UTC(2026, 11, 31, 23));
  assert.strictEqual(RC.range('month', 2026, 12).to, y.to);
  assert.deepStrictEqual(RC.localMonth(Date.UTC(2026, 2, 31, 22)), { y: 2026, m: 4 }, '0 giờ 1/4 ở Berlin');
  assert.deepStrictEqual(RC.localMonth(Date.UTC(2026, 2, 31, 21, 59)), { y: 2026, m: 3 });
  assert.strictEqual(RC.localDay(Date.UTC(2026, 9, 25, 22, 59)), '2026-10-25', '23:59 CET – ngày 25 giờ');
  assert.strictEqual(RC.localDay(Date.UTC(2026, 9, 25, 23)), '2026-10-26');
  // Ngày có chơi theo múi giờ thiết bị: 23:30 và 00:30 (giờ Berlin) là hai ngày
  const at = (h, min) => Date.UTC(2026, 10, 2, h - 1, min); // h giờ Berlin (CET) ngày 2/11
  assert.strictEqual(RC.summarize([{ at: at(23, 30), res: 'win' }, { at: at(24, 30), res: 'win' }]).days, 2);
  assert.strictEqual(RC.summarize([{ at: at(0, 30), res: 'win' }, { at: at(23, 50), res: 'loss' }]).days, 1);
  // Máy chủ truyền hàm khoá ngày theo múi giờ đã lưu của tài khoản (local-time.js)
  const byHour = (t) => String(Math.floor(t / 3600000));
  assert.strictEqual(RC.summarize([{ at: at(0, 10), res: 'win' }, { at: at(0, 50), res: 'win' }, { at: at(1, 10), res: 'win' }], byHour).days, 2);
});

test('summarize: thắng / hoà / thua, luật + thời gian ưa thích, thắng đẹp nhất, chuỗi thắng, đối thủ công khai', () => {
  const day = (d, h = 10) => Date.UTC(2026, 10, d, h - 1); // h giờ Berlin ngày d/11
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
