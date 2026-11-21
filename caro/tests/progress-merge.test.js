// Tiến độ trên máy ↔ tài khoản (caro/progress-merge.js – A5): chạy được trên trình duyệt (window.CaroProgress) lẫn Node;
// gộp hai chiều cho cùng kết quả, gộp nhiều lần không đổi, không bao giờ làm giảm số liệu.
//   node --test caro/tests/progress-merge.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../progress-merge.js');

test('trình duyệt: gắn window.CaroProgress, không đụng module', () => {
  const win = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'progress-merge.js'), 'utf8'), { window: win });
  assert.strictEqual(typeof win.CaroProgress.merge, 'function');
  assert.strictEqual(win.CaroProgress.weekKey(Date.parse('2026-11-20T00:00:00Z')), '2026-W47');
});

test('gộp: đối xứng, gộp lại không đổi, không giảm số liệu', () => {
  const a = { pz: { r: 1250, n: 40, ok: 20, best: 4 }, storm: { best: 9, runs: 2, last: 9 }, habits: { days: ['2026-11-01'], best: 1, games: 5, earned: { first_game: '2026-11-01' } } };
  const b = { pz: { r: 1400, n: 12, ok: 11, best: 8 }, storm: { best: 15, runs: 6, last: 3 }, habits: { days: ['2026-11-02'], best: 1, games: 2, bots: { ti: true } } };
  const ab = P.merge(a, b), ba = P.merge(b, a);
  assert.deepStrictEqual({ ...ab, pz: { ...ab.pz, diff: 0 } }, { ...ba, pz: { ...ba.pz, diff: 0 } }, 'đối xứng (trừ độ khó – lựa chọn của máy này)');
  assert.deepStrictEqual(P.merge(ab, ab), ab, 'gộp lại không đổi');
  for (const src of [a, b]) {
    const c = P.clean(src);
    assert.ok(ab.pz.n >= c.pz.n && ab.pz.ok >= c.pz.ok && ab.pz.best >= c.pz.best && ab.storm.best >= c.storm.best && ab.habits.games >= c.habits.games);
    for (const d of c.habits.days) assert.ok(ab.habits.days.includes(d));
  }
  assert.strictEqual(ab.habits.best, 2, 'hai ngày liền nhau: chuỗi 2');
});
