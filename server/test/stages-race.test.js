'use strict';
// Hệ Race của giải offline (hub/stages-race.js): Single Race / Grand Prix (điểm theo hạng), Time Trial (thời gian)
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const R = require('../src/hub/stages-race.js');
const E = require('../../caro/tour-estimate.js');

const OFF = { offline: true };
const ids = (n) => Array.from({ length: n }, (_, i) => 'd' + i);
const seedOf = (list) => (u) => list.indexOf(u) + 1;

test('Grand Prix 3 chặng: hạng → điểm F1, điểm sửa tay, bỏ cuộc, countback khi bằng điểm, bảng đội', () => {
  const [cfg, ko] = ST.normalizeStages([{ type: 'race', events: 3, teams: true, advance: 4 }, { type: 'single' }], OFF);
  assert.deepStrictEqual([cfg.type, cfg.events, cfg.score, cfg.table.slice(0, 3), cfg.advance], ['race', 3, 'points', [25, 18, 15], 4]);
  assert.strictEqual(ST.normalizeStages([{ type: 'race' }])[0].type, 'single', 'giải Caro: không có hệ Race');
  const d = ids(6), so = seedOf(d);
  const st = ST.buildStage(cfg, 0, d, { seedOf: so });
  assert.strictEqual(st.events.length, 3);
  const ev = (order, extra = {}) => order.map((u, k) => ({ uid: u, rank: k + 1, ...(extra[u] || {}) }));
  assert.strictEqual(R.cleanEvent(st, [{ uid: 'd0', rank: 1 }, { uid: 'd1', rank: 1 }]).code, 'ot_race_rank_dup');
  assert.strictEqual(R.cleanEvent(st, [{ uid: 'd0', rank: 9 }]).code, 'ot_race_rank');
  assert.strictEqual(R.cleanEvent(st, [{ uid: 'x', rank: 1 }]).code, 'tour_score_bad');
  assert.strictEqual(R.cleanEvent(st, [{ uid: 'd0', dnf: true }]).code, 'ot_race_empty');
  // Chặng 1: d0 nhất, d1 nhì…; chặng 2: d1 nhất, d0 nhì; chặng 3: d0 bỏ cuộc, d1 nhất, d2 +1 điểm thưởng (vòng nhanh nhất)
  R.recordEvent(st, 0, R.cleanEvent(st, ev(['d0', 'd1', 'd2', 'd3', 'd4', 'd5'])).rows);
  R.recordEvent(st, 1, R.cleanEvent(st, ev(['d1', 'd0', 'd3', 'd2', 'd5', 'd4'])).rows);
  assert.ok(!st.done);
  const rows3 = [...ev(['d1', 'd2', 'd3', 'd4', 'd5'], { d2: { pts: 19 } }), { uid: 'd0', dnf: true }];
  assert.ok(R.recordEvent(st, 2, R.cleanEvent(st, rows3).rows));
  const { list, stats } = ST.standings(st, so)[0];
  assert.deepStrictEqual([stats.d1.pts, stats.d0.pts, stats.d2.pts], [18 + 25 + 25, 25 + 18 + 0, 15 + 12 + 19]);
  assert.deepStrictEqual(list.slice(0, 3), ['d1', 'd2', 'd0'], 'd2 (46) trên d0 (43)');
  assert.deepStrictEqual(ST.podium(st, so), ['d1', 'd2', 'd0']);
  assert.deepStrictEqual(ST.advancers(st, so).seeds, list.slice(0, 4));
  // Countback: bằng điểm thì ai nhiều lần về nhất hơn đứng trên
  const st2 = ST.buildStage(ST.normalizeStages([{ type: 'race', events: 2, table: '10 6 4' }], OFF)[0], 0, ['a', 'b', 'c'], {});
  R.recordEvent(st2, 0, R.cleanEvent(st2, [{ uid: 'a', rank: 1 }, { uid: 'b', rank: 2 }, { uid: 'c', rank: 3 }]).rows);
  R.recordEvent(st2, 1, R.cleanEvent(st2, [{ uid: 'b', rank: 1 }, { uid: 'c', rank: 2 }, { uid: 'a', rank: 3 }]).rows);
  const t2 = R.raceTable(st2, (u) => ({ a: 3, b: 1, c: 2 })[u]);
  assert.deepStrictEqual([t2.stats.a.pts, t2.stats.b.pts], [14, 16]);
  assert.deepStrictEqual(t2.list, ['b', 'a', 'c']);
  // Bảng đội + chặng trong view
  const team = { d0: 'Đỏ', d1: 'Đỏ', d2: 'Xanh', d3: 'Xanh', d4: 'Vàng', d5: '' };
  const v = R.raceView(st, 0, 4, (u) => ({ uid: u, name: u }), so, (u) => team[u]);
  assert.deepStrictEqual(v.teams[0], { name: 'Đỏ', pts: 68 + 43, rank: 1 });
  assert.ok(v.events[2].rows[1].manual && v.events[2].rows[5].dnf);
  assert.strictEqual(ko.type, 'single');
  assert.strictEqual(E.estimate({ stages: [cfg, ko], players: 6 }).stages[0].matches, 3);
});

test('Time Trial 2 chặng: tổng thời gian, chênh lệch với người dẫn đầu và người ngay trên; bỏ cuộc xếp sau', () => {
  const [cfg] = ST.normalizeStages([{ type: 'race', score: 'time', events: 2 }], OFF);
  assert.strictEqual(cfg.table, undefined);
  const st = ST.buildStage(cfg, 0, ['a', 'b', 'c', 'd'], {});
  assert.strictEqual(R.cleanEvent(st, [{ uid: 'a', time: -1 }]).code, 'ot_race_time');
  R.recordEvent(st, 0, R.cleanEvent(st, [{ uid: 'a', time: 60000 }, { uid: 'b', time: 60500 }, { uid: 'c', time: 62000 }, { uid: 'd', dnf: true }]).rows);
  R.recordEvent(st, 1, R.cleanEvent(st, [{ uid: 'a', time: 61000 }, { uid: 'b', time: 59000 }, { uid: 'c', time: 61000 }, { uid: 'd', time: 50000 }]).rows);
  const v = R.raceView(st, 0, 0, (u) => ({ uid: u }), (u) => 'abcd'.indexOf(u));
  assert.deepStrictEqual(v.table.map((x) => [x.uid, x.time, x.gap, x.gapPrev]), [['b', 119500, 0, null], ['a', 121000, 1500, 1500], ['c', 123000, 3500, 2000], ['d', null, null, null]]);
  const e0 = v.events[0].rows;
  assert.deepStrictEqual(e0.map((x) => [x.uid, x.gap, x.gapPrev]), [['a', 0, null], ['b', 500, 500], ['c', 2000, 1500], ['d', undefined, undefined]]);
  R.undoEvent(st, 1);
  assert.ok(!st.done && !st.events[1].done);
  assert.strictEqual(R.raceError(cfg, 201).code, 'ot_race_many');
});
