'use strict';
// Mùa giải kiểu nhà nghề Mỹ (caro/otour-season.js + hub/stages-season.js): đúng số trận mỗi đội như giải thật, số lần gặp
// từng cặp đúng theo quan hệ (cùng bảng con / cùng miền / khác miền), sân nhà chia đều, bảng xếp hạng theo miền
const test = require('node:test');
const assert = require('node:assert');
const SS = require('../../caro/otour-season.js');
const Z = require('../src/hub/stages-season.js');
const ST = require('../src/hub/stages.js');
const E = require('../../caro/tour-estimate.js');

const rng = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const ids = (n) => Array.from({ length: n }, (_, i) => 'u' + String(i).padStart(2, '0'));
// Như các mẫu giải Mỹ (caro/otour-templates.js)
const US = {
  nba: [30, { confs: 2, divs: 3, div: { m: 4 }, conf: { m: 3, x: 6 }, inter: { m: 2 } }, 82],
  nfl: [32, { confs: 2, divs: 4, div: { m: 2 }, conf: { m: 0, x: 6 }, inter: { m: 0, x: 5 } }, 17],
  mlb: [30, { confs: 2, divs: 3, div: { m: 13 }, conf: { m: 6, x: 4 }, inter: { m: 3, x: 1 } }, 162],
  nhl: [32, { confs: 2, divs: 2, div: { m: 3, x: 5 }, conf: { m: 3 }, inter: { m: 2 } }, 82],
  mls: [30, { confs: 2, divs: 1, div: { m: 2 }, inter: { m: 0, x: 6 } }, 34],
};

test('seasonInfo: số trận mỗi đội đúng như giải thật', () => {
  for (const [id, [n, s, per]] of Object.entries(US)) {
    const info = SS.seasonInfo(s, n);
    assert.strictEqual(info.error, null, id);
    assert.deepStrictEqual([info.perTeam, info.matches], [per, (n * per) / 2], id);
  }
});

test('seasonInfo: báo lỗi cấu hình không dựng được', () => {
  assert.strictEqual(SS.seasonInfo({ confs: 2, divs: 3 }, 31).error.code, 'ot_season_split');
  assert.strictEqual(SS.seasonInfo({ confs: 2, divs: 1, div: { m: 0 }, inter: { m: 0 } }, 10).error.code, 'ot_season_none');
  assert.strictEqual(SS.seasonInfo({ confs: 2, divs: 1, inter: { m: 0, x: 9 } }, 10).error.code, 'ot_season_extra'); // chỉ có 5 đối thủ khác miền
  assert.strictEqual(SS.seasonInfo({ confs: 1, divs: 1, div: { m: 0, x: 3 } }, 5).error.code, 'ot_season_extra'); // 5 đội × 3 lẻ
  assert.strictEqual(SS.seasonInfo({ confs: 1, divs: 1, div: { m: 30 } }, 10).error.code, 'ot_season_many');
  // Gặp thêm đủ mọi đối thủ = tăng số lần gặp
  assert.deepStrictEqual(SS.seasonInfo({ confs: 1, divs: 1, div: { m: 1, x: 4 } }, 5).levels.div, { m: 2, x: 0, opp: 4, N: 5, D: 1 });
  assert.deepStrictEqual(SS.cleanSeason(null).confs, 2);
});

test('seasonPairs: đủ trận mỗi đội, đúng số lần gặp theo quan hệ, sân nhà chia đều', () => {
  for (const [id, [n, s, per]] of Object.entries(US)) {
    const seeds = ids(n), info = SS.seasonInfo(s, n);
    const pairs = Z.seasonPairs(seeds, info, rng(n));
    assert.strictEqual(pairs.length, (n * per) / 2, id);
    const games = new Map(), home = new Map(), meet = new Map();
    for (const [a, b] of pairs) {
      assert.notStrictEqual(a, b, id);
      for (const u of [a, b]) games.set(u, (games.get(u) || 0) + 1);
      home.set(a, (home.get(a) || 0) + 1);
      const k = a < b ? a + b : b + a;
      meet.set(k, (meet.get(k) || 0) + 1);
    }
    for (const u of seeds) {
      assert.strictEqual(games.get(u), per, `${id}: ${u} đủ ${per} trận`);
      assert.ok(Math.abs(2 * (home.get(u) || 0) - per) <= 1, `${id}: ${u} sân nhà ${home.get(u)}/${per}`);
    }
    // Quan hệ: đội i thuộc miền ⌊i / confSize⌋, bảng con ⌊i / divSize⌋
    const lvl = (i, j) => (Math.floor(i / info.confSize) !== Math.floor(j / info.confSize) ? 'inter' : Math.floor(i / info.divSize) !== Math.floor(j / info.divSize) ? 'conf' : 'div');
    for (let i = 0; i < n; i++) {
      const extra = { div: 0, conf: 0, inter: 0 };
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const L = info.levels[lvl(i, j)], t = meet.get(seeds[Math.min(i, j)] + seeds[Math.max(i, j)]) || 0;
        assert.ok(t === L.m || t === L.m + 1, `${id}: ${i}–${j} gặp ${t} lần (mức ${lvl(i, j)})`);
        if (t === L.m + 1) extra[lvl(i, j)]++;
      }
      for (const k of SS.LEVELS) assert.strictEqual(extra[k], info.levels[k] ? info.levels[k].x : 0, `${id}: đội ${i} gặp thêm ở mức ${k}`);
    }
  }
});

test('eulerOrient: mỗi đỉnh lệch sân nhà / sân khách tối đa 1', () => {
  const edges = [['a', 'b'], ['b', 'c'], ['c', 'a'], ['a', 'd'], ['d', 'e']];
  const out = Z.eulerOrient(edges);
  assert.strictEqual(out.length, edges.length);
  const d = {};
  for (const [h, a] of out) { d[h] = (d[h] || 0) + 1; d[a] = (d[a] || 0) - 1; }
  assert.ok(Object.values(d).every((x) => Math.abs(x) <= 1), JSON.stringify(d));
  assert.deepStrictEqual(Z.eulerOrient([]), []);
});

test('Giai đoạn mùa giải: dựng, chơi hết, bảng xếp hạng theo miền, đi tiếp theo miền, ước tính khớp', () => {
  const [n, s] = US.nba;
  const [cfg] = ST.normalizeStages([{ type: 'roundrobin', season: s, advance: 8, points: { w: 1, d: 0, l: 0 } }, { type: 'single', bestOf: 7 }], { offline: true });
  assert.deepStrictEqual([cfg.groups, cfg.meetings, !!cfg.big, cfg.league], [2, 1, true, undefined]);
  const seeds = ids(n), seedOf = (u) => seeds.indexOf(u) + 1;
  const st = ST.buildStage(cfg, 0, seeds, { seedOf, rnd: rng(3) });
  assert.strictEqual(Object.keys(st.matches).length, 1230);
  assert.deepStrictEqual(st.groups.map((g) => [g.name, g.players.length, g.divs.length, g.divs[0].length]), [['A', 15, 3, 5], ['B', 15, 3, 5]]);
  assert.strictEqual(st.groups[0].rounds.length, st.groups[1].rounds.length, 'các miền dùng chung chỉ số lượt đấu');
  // Mỗi lượt: mỗi đội tối đa một trận
  const R = st.groups[0].rounds.length;
  for (let r = 0; r < R; r++) {
    const seen = new Set();
    for (const g of st.groups) for (const id of g.rounds[r]) for (const u of [st.matches[id].a, st.matches[id].b]) { assert.ok(!seen.has(u), `lượt ${r}: ${u} đá 2 trận`); seen.add(u); }
  }
  const est = E.stage(cfg, n, false);
  assert.deepStrictEqual([est.matches, est.groups, est.advance], [1230, 2, 16]);
  assert.ok(Math.abs(est.waves - R) <= 10, `ước tính ${est.waves} lượt, thật ${R}`);
  for (const m of Object.values(st.matches)) ST.recordResult(st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf, isActive: () => true });
  assert.ok(st.done);
  const tables = ST.standings(st, seedOf);
  assert.strictEqual(tables.length, 2);
  for (const t of tables) for (const u of t.list) assert.strictEqual(t.stats[u].mp, 82, 'tính cả trận khác miền');
  assert.deepStrictEqual([tables[0].list[0], tables[1].list[0]], ['u00', 'u15']);
  assert.strictEqual(ST.advancers(st, seedOf).seeds.length, 16);
});

test('Số đội đi tiếp lệch cấu hình: gộp thành vòng tròn 2 lượt một miền', () => {
  const [cfg] = ST.normalizeStages([{ type: 'roundrobin', season: US.nba[1] }], { offline: true });
  const st = ST.buildStage(cfg, 0, ids(7), { seedOf: () => 1, rnd: rng(1) });
  assert.deepStrictEqual([st.groups.length, Object.keys(st.matches).length, st.groups[0].divs], [1, 42, null]);
});
