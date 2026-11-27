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

test('thang nhân vật máy (B9) trong tiến độ: làm sạch có trần số bậc, gộp lấy bậc cao hơn mỗi luật, lúc đổi không ở tương lai', () => {
  const LC = require('../bot-ladder-core.js');
  const c = P.clean({ ladder: { r: { vn: 1e9, free: '3', x: 5, std: -1 }, at: 7 } });
  assert.deepStrictEqual(c.ladder, { r: { vn: LC.RUNGS, free: 3 }, at: 7 }, 'máy tự báo bậc 10⁹ → trần RUNGS');
  assert.deepStrictEqual(P.clean({}).ladder, { r: {}, at: 0 });
  const m = P.merge({ ladder: { r: { vn: 3, free: 1 }, at: 10 } }, { ladder: { r: { vn: 1, renju: 7 }, at: 5 } });
  assert.deepStrictEqual(m.ladder, { r: { vn: 3, free: 1, renju: 7 }, at: 10 });
  const now = Date.UTC(2026, 10, 20);
  assert.strictEqual(P.sane({ ladder: { r: { vn: 2 }, at: now + 86400000 * 30 } }, now).ladder.at, 0);
  assert.strictEqual(P.sane({ ladder: { r: { vn: 2 }, at: now - 1000 } }, now).ladder.at, now - 1000);
});

test('sane: chuỗi dài nhất phải có danh sách ngày chứng minh (máy tự báo best lớn không thành chuỗi 30 ngày khi tính năng đã chạy lâu)', () => {
  const now = Date.UTC(2027, 1, 1); // ~3 tháng sau khi có tính năng: trần span không còn chặn được 30
  const day = (n) => new Date(now - n * 86400000).toISOString().slice(0, 10);
  assert.strictEqual(P.sane({ habits: { days: [day(0)], best: 99999 } }, now).habits.best, 1, 'một ngày thật: chuỗi 1');
  const run = Array.from({ length: 31 }, (_, i) => day(i + 5));
  assert.strictEqual(P.sane({ habits: { days: run, best: 2 } }, now).habits.best, 31, 'danh sách ngày liên tiếp: chuỗi thật');
});
