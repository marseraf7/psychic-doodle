// Thống kê tự đấu (server/scripts/sprt.js): Elo ± 95%, SPRT dừng sớm – kiểm cả tỉ lệ kết luận sai bằng mô phỏng.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../scripts/sprt.js');

/** Bộ sinh số ngẫu nhiên có hạt giống (mulberry32). */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('Elo ↔ điểm kỳ vọng, đọc tham số', () => {
  assert.strictEqual(S.expected(0), 0.5);
  assert.ok(Math.abs(S.eloOf(S.expected(100)) - 100) < 1e-6);
  assert.ok(Math.abs(S.eloOf(0.75) - 190.85) < 0.01);
  assert.deepStrictEqual(S.parse('0,10'), { elo0: 0, elo1: 10 });
  assert.deepStrictEqual(S.parse('-10,0'), { elo0: -10, elo1: 0 });
  assert.strictEqual(S.parse('10,0'), null);
  assert.strictEqual(S.parse(''), null);
});

test('đếm theo cặp: điểm, Elo, khoảng tin cậy chứa giá trị thật', () => {
  const t = S.tally();
  for (let i = 0; i < 30; i++) t.pair(1, 0.5); // A thắng 1, hoà 1 mỗi cặp: 75%
  t.game(1); t.game(0);
  const r = S.summary(t);
  assert.strictEqual(r.n, 32);
  assert.strictEqual(r.games, 62);
  assert.strictEqual(r.score, 46);
  assert.ok(r.lo < r.elo && r.elo < r.hi);
  assert.deepStrictEqual(t.penta, [0, 0, 0, 30, 0]);
  assert.deepStrictEqual(t.tri, [1, 0, 1]);
  assert.match(S.format(r, { elo0: 0, elo1: 10 }), /46\/62 \(74%\) · Elo .* SPRT \[0, 10\] LLR/);
  assert.strictEqual(S.summary(S.tally()).n, 0);
});

test('chưa đủ MIN_SAMPLES mẫu thì chưa kết luận, dù toàn thắng', () => {
  const t = S.tally();
  for (let i = 0; i < S.MIN_SAMPLES - 1; i++) t.pair(1, 1);
  assert.strictEqual(S.summary(t, { elo0: 0, elo1: 10 }).verdict, null);
  t.pair(1, 1);
  assert.strictEqual(S.summary(t, { elo0: 0, elo1: 10 }).verdict, 'H1');
});

test('SPRT: tỉ lệ kết luận sai ≈ alpha / beta (mô phỏng 300 lần mỗi phía)', () => {
  const opts = { elo0: 0, elo1: 40, alpha: 0.05, beta: 0.05 };
  // Một ván: hoà 30%, phần còn lại chia thắng / thua sao cho điểm kỳ vọng ứng với `elo`
  const run = (elo, r) => {
    const s = S.expected(elo), d = 0.3, w = s - d / 2;
    const one = () => { const u = r(); return u < w ? 1 : u < w + d ? 0.5 : 0; };
    const t = S.tally();
    for (let k = 0; k < 20000; k++) {
      t.pair(one(), one());
      const v = S.summary(t, opts).verdict;
      if (v) return v;
    }
    return null;
  };
  const r = rng(7);
  let wrongH1 = 0, wrongH0 = 0, undecided = 0;
  for (let i = 0; i < 300; i++) {
    const a = run(opts.elo0, r), b = run(opts.elo1, r);
    if (a === 'H1') wrongH1++;
    if (b === 'H0') wrongH0++;
    if (!a || !b) undecided++;
  }
  assert.strictEqual(undecided, 0);
  // Kỳ vọng ~15 / 300; cho phép dao động thống kê
  assert.ok(wrongH1 <= 30, 'nhận nhầm H1: ' + wrongH1);
  assert.ok(wrongH0 <= 30, 'nhận nhầm H0: ' + wrongH0);
});
