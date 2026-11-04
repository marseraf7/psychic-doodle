'use strict';
// Luật set của giải đấu Offline (caro/otour-rules.js – dùng chung trình duyệt + máy chủ)
const test = require('node:test');
const assert = require('node:assert');
const R = require('../../caro/otour-rules.js');
const { SPORTS } = require('../../caro/otour-sports.js');

test('Luật set từng môn: cầu lông (trần 30), bóng bàn, quần vợt (tie-break 7–6), bóng chuyền (set quyết định 15)', () => {
  const bad = (rule, s, d) => R.setError(rule, s, d);
  const bm = R.cleanSet(SPORTS.badminton.set);
  for (const s of [[21, 15], [21, 19], [22, 20], [29, 27], [30, 29], [30, 28], [0, 21]]) assert.strictEqual(bad(bm, s), null, 'cầu lông đúng: ' + s);
  for (const s of [[21, 20], [20, 18], [23, 20], [31, 29], [30, 27], [21, 21]]) assert.ok(bad(bm, s), 'cầu lông sai: ' + s);
  assert.strictEqual(bad(bm, [21, 21]), 'ot_set_tie');
  const tt = R.cleanSet(SPORTS.tabletennis.set);
  for (const s of [[11, 9], [12, 10], [18, 16], [11, 0]]) assert.strictEqual(bad(tt, s), null, 'bóng bàn đúng: ' + s);
  for (const s of [[11, 10], [13, 10], [10, 8]]) assert.ok(bad(tt, s), 'bóng bàn sai: ' + s);
  const tn = R.cleanSet(SPORTS.tennis.set);
  for (const s of [[6, 4], [7, 5], [7, 6], [6, 0]]) assert.strictEqual(bad(tn, s), null, 'quần vợt đúng: ' + s);
  for (const s of [[6, 5], [8, 6], [7, 4]]) assert.ok(bad(tn, s), 'quần vợt sai: ' + s);
  const vb = R.cleanSet(SPORTS.volleyball.set);
  assert.strictEqual(bad(vb, [25, 23]), null);
  assert.ok(bad(vb, [15, 13]), 'set thường phải tới 25');
  assert.strictEqual(bad(vb, [15, 13], true), null, 'set quyết định tới 15');
  assert.strictEqual(bad(vb, [17, 15], true), null);
  assert.ok(bad(vb, [25, 13], true), 'set quyết định kết thúc ở 15');
  assert.strictEqual(bad(null, [3, 2]), null, 'tắt luật: không kiểm điểm từng set');
});

test('Cả trận theo set: đủ số set thắng, không thừa set, không quá Bo, set quyết định đúng chỗ', () => {
  const vb = R.cleanSet(SPORTS.volleyball.set);
  assert.strictEqual(R.setsError(vb, [[25, 20], [20, 25], [25, 22], [23, 25], [15, 12]], 5), null, 'bóng chuyền 3–2');
  assert.deepStrictEqual(R.setsError(vb, [[25, 20], [20, 25], [25, 22], [23, 25], [25, 12]], 5), { code: 'ot_set_bad', args: { n: 5 } });
  assert.deepStrictEqual(R.setsError(vb, [[25, 20], [25, 22]], 5), { code: 'ot_sets_short', args: { k: 3, bo: 5 } });
  assert.deepStrictEqual(R.setsError(vb, [[25, 20], [25, 22], [25, 10], [10, 25]], 5), { code: 'ot_sets_after', args: { n: 4, bo: 5 } });
  assert.deepStrictEqual(R.setsError(null, [[1, 0], [1, 0], [0, 1], [1, 0]], 3), { code: 'ot_sets_many', args: { bo: 3 } });
  assert.strictEqual(R.setsError(null, [[1, 0], [0, 1], [1, 0]], 3), null, 'thể thao điện tử: không luật điểm');
  assert.strictEqual(R.setsError(null, [], 3).code, 'score_need_sets');
  assert.strictEqual(R.setsError(null, [[1.5, 0]], 1).code, 'tour_score_bad');
  assert.ok(R.decidingPlayed([[1, 0], [0, 1], [1, 0]], 3) && !R.decidingPlayed([[1, 0], [1, 0]], 3) && !R.decidingPlayed([[1, 0]], 1));
  // Chuẩn hoá luật: trần không lớn hơn điểm thắng set thì bỏ; set quyết định trùng điểm thường thì bỏ
  assert.deepStrictEqual(R.cleanSet({ to: 21, by: 2, cap: 20, last: 21 }), { to: 21, by: 2, cap: 0, last: 0 });
  assert.strictEqual(R.cleanSet({ to: 0 }), null);
  assert.strictEqual(R.cleanSet(null), null);
});
