'use strict';
// Thể thức thêm cho giải offline (hub/stages-league.js): league phase, Thụy Sĩ theo thắng / thua, hạng ba tốt nhất
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const L = require('../src/hub/stages-league.js');
const E = require('../../caro/tour-estimate.js');

// Số ngẫu nhiên có hạt giống (kiểm thử lặp lại được)
const rng = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const ids = (n, p = 'u') => Array.from({ length: n }, (_, i) => p + i);
const OFF = { offline: true }; // các tuỳ chọn này chỉ dành cho giải offline
const seedOf = (list) => (u) => list.indexOf(u) + 1;

test('League phase kiểu Champions League: 36 đội, 4 nhóm, 8 trận – 2 đối thủ mỗi nhóm, 4 nhà 4 khách, tránh cùng quốc gia', () => {
  const [cfg] = ST.normalizeStages([{ type: 'roundrobin', league: { games: 8, pots: 4 }, advance: 24 }, { type: 'single' }], OFF);
  assert.deepStrictEqual([cfg.league, cfg.big, cfg.groups, cfg.meetings], [{ games: 8, pots: 4 }, true, 1, 1]);
  const teams = ids(36);
  const country = (u) => ['ENG', 'ESP', 'GER', 'ITA', 'FRA', 'POR'][Number(u.slice(1)) % 6];
  const st = ST.buildStage(cfg, 0, teams, { seedOf: seedOf(teams), countryOf: country, rnd: rng(7) });
  const ms = Object.values(st.matches);
  assert.strictEqual(ms.length, 144, '36 × 8 / 2 trận');
  const per = new Map(teams.map((u) => [u, { n: 0, home: 0, pot: [0, 0, 0, 0], opp: new Set() }]));
  const pot = (u) => Math.floor(teams.indexOf(u) / 9);
  for (const m of ms) {
    for (const [u, o] of [[m.a, m.b], [m.b, m.a]]) {
      const x = per.get(u);
      x.n++; x.pot[pot(o)]++;
      assert.ok(!x.opp.has(o), 'không gặp lại');
      x.opp.add(o);
    }
    per.get(m.a).home++;
    assert.notStrictEqual(country(m.a), country(m.b), 'không gặp đội cùng quốc gia');
  }
  for (const [u, x] of per) {
    assert.strictEqual(x.n, 8, u);
    assert.deepStrictEqual(x.pot, [2, 2, 2, 2], 'hai đối thủ mỗi nhóm: ' + u);
    assert.strictEqual(x.home, 4, 'bốn trận sân nhà: ' + u);
  }
  // Mỗi lượt mỗi đội tối đa một trận
  for (const r of st.groups[0].rounds) { const seen = new Set(); for (const id of r) for (const u of [st.matches[id].a, st.matches[id].b]) { assert.ok(!seen.has(u)); seen.add(u); } }
  assert.ok(st.groups[0].rounds.length <= 12, 'lịch gọn: ' + st.groups[0].rounds.length + ' lượt');
  // Đi tiếp theo dải hạng: 24 đội sang loại trực tiếp – hạng 1–8 được miễn vòng đầu, 9–24 đá play-off
  for (const m of ms) ST.recordResult(st, m, teams.indexOf(m.a) < teams.indexOf(m.b) ? m.a : m.b);
  assert.ok(st.done);
  const { seeds } = ST.advancers(st, seedOf(teams));
  assert.strictEqual(seeds.length, 24);
  const ko = ST.buildStage(ST.normalizeStages([{ type: 'single' }], OFF)[0], 1, seeds, { seedOf: seedOf(seeds) });
  const r0 = ko.rounds[0].map((id) => ko.matches[id]);
  const byes = r0.filter((m) => m.b === '-' || m.a === '-').map((m) => (m.a === '-' ? m.b : m.a));
  assert.deepStrictEqual(new Set(byes), new Set(seeds.slice(0, 8)), 'hạng 1–8 vào thẳng vòng 1/8');
  assert.ok(r0.some((m) => [m.a, m.b].includes(seeds[8]) && [m.a, m.b].includes(seeds[23])), 'hạng 9 gặp hạng 24');
  // Kiểm cấu hình: số đội / số trận phải chia đều cho các nhóm
  assert.strictEqual(L.leagueError(cfg, 36), null);
  assert.strictEqual(L.leagueError(cfg, 35).code, 'ot_league_pots');
  assert.strictEqual(L.leagueError({ league: { games: 6, pots: 4 } }, 36).code, 'ot_league_games');
  assert.strictEqual(L.leagueError({ league: { games: 8, pots: 4 } }, 8).code, 'ot_league_size');
  assert.strictEqual(L.leagueError({ league: { games: 3, pots: 1 } }, 5).code, 'ot_league_size', 'số trận lẻ cần số đội chẵn');
  const e = E.estimate({ stages: [cfg, { type: 'single' }], players: 36 });
  assert.deepStrictEqual([e.stages[0].matches, e.stages[0].advance], [144, 24]);
});

test('Thụy Sĩ theo số thắng / thua kiểu LoL Worlds: 16 đội, 3 thắng đi tiếp, 3 thua bị loại, trận quyết định Bo3', () => {
  const [cfg] = ST.normalizeStages([{ type: 'swiss', record: { win: 3, lose: 3, bo: 3 }, bestOf: 1, tiebreaks: ['bh'] }, { type: 'single' }], OFF);
  assert.deepStrictEqual([cfg.rounds, cfg.record, cfg.tiebreaks], [5, { win: 3, lose: 3, bo: 3 }, ['losses', 'bh']]);
  const teams = ids(16);
  const so = seedOf(teams);
  const st = ST.buildStage(cfg, 0, teams, { seedOf: so });
  let matches = 0;
  for (let guard = 0; !st.done && guard < 100; guard++) {
    const cur = st.rounds[st.rounds.length - 1].map((id) => st.matches[id]).filter((m) => !m.done);
    const rec = L.records(st);
    for (const m of cur) {
      // Cùng thành tích gặp nhau
      assert.deepStrictEqual(rec[m.a], rec[m.b], 'cặp cùng thành tích');
      const deciding = [m.a, m.b].some((u) => rec[u].w === 2 || rec[u].l === 2);
      assert.strictEqual(ST.boOf(st, m), deciding ? 3 : 1, 'Bo3 cho trận quyết định');
      matches++;
      ST.recordResult(st, m, so(m.a) < so(m.b) ? m.a : m.b, { seedOf: so });
    }
  }
  assert.ok(st.done);
  assert.deepStrictEqual([matches, st.rounds.length], [33, 5], 'như ước tính: 33 trận, 5 lượt');
  const rec = L.records(st);
  assert.ok(teams.every((u) => rec[u].w === 3 || rec[u].l === 3), 'ai cũng đã phân định');
  const { seeds } = ST.advancers(st, so);
  assert.strictEqual(seeds.length, 8);
  assert.ok(seeds.every((u) => rec[u].w === 3));
  // Xếp theo ít trận thua hơn: 3–0 đứng trước 3–1, 3–2
  const losses = seeds.map((u) => rec[u].l);
  assert.deepStrictEqual(losses, [...losses].sort((a, b) => a - b));
  assert.strictEqual(ST.tbValue('losses', { l: 2 }), 2);
});

test('Đi tiếp nhờ đội hạng ba tốt nhất (World Cup 2026: 12 bảng, nhất nhì + 8 đội hạng ba)', () => {
  const [cfg] = ST.normalizeStages([{ type: 'roundrobin', groupSize: 4, advance: 2, bestNext: 8, points: { w: 3, d: 1, l: 0 } }, { type: 'single' }], OFF);
  assert.strictEqual(cfg.bestNext, 8);
  const teams = ids(48);
  const so = seedOf(teams);
  const st = ST.buildStage(cfg, 0, teams, { seedOf: so });
  assert.strictEqual(st.groups.length, 12);
  // Hạng ba bảng g thắng g trận (để biết đội nào tốt nhất): đội hạt giống cao thắng, trừ vài trận cho hạng ba
  for (const m of Object.values(st.matches)) ST.recordResult(st, m, so(m.a) < so(m.b) ? m.a : m.b, { seedOf: so });
  const { seeds } = ST.advancers(st, so);
  assert.strictEqual(seeds.length, 32);
  const tables = ST.standings(st, so);
  const thirds = new Set(tables.map((t) => t.list[2]));
  assert.strictEqual(seeds.slice(24).filter((u) => thirds.has(u)).length, 8, '8 suất cuối là đội hạng ba');
  assert.ok(seeds.slice(0, 24).every((u) => !thirds.has(u)));
  const e = E.estimate({ stages: [cfg, { type: 'single' }], players: 48 });
  assert.strictEqual(e.stages[0].advance, 32);
  // Bảng lớn (league lượt đi – về 20 đội): một bảng 20 đội, 380 trận
  const [big] = ST.normalizeStages([{ type: 'roundrobin', big: true, groups: 1, meetings: 2 }], OFF);
  const lg = ST.buildStage(big, 0, ids(20), {});
  assert.deepStrictEqual([lg.groups.length, Object.keys(lg.matches).length], [1, 380]);
  // Giải Caro (không phải offline): bỏ qua các tuỳ chọn này – bảng tối đa 16 người như cũ
  const [small] = ST.normalizeStages([{ type: 'roundrobin', big: true, league: { games: 4, pots: 1 }, groups: 1, meetings: 2, bestNext: 2 }, { type: 'single', legs: true }]);
  assert.deepStrictEqual([small.big, small.league, small.bestNext], [undefined, undefined, undefined]);
  assert.strictEqual(ST.buildStage(small, 0, ids(20), {}).groups.length, 2);
  assert.strictEqual(ST.normalizeStages([{ type: 'single', legs: true }])[0].legs, undefined);
});
