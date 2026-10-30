// Kiểm thử bộ ước tính quy mô giải (caro/tour-estimate.js): mô phỏng cả giải bằng logic thật của máy chủ
// (stages.js) rồi so số trận, số lượt đấu nối tiếp và số người đi tiếp với ước tính.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/hub/stages.js');
const E = require('../../caro/tour-estimate.js');

const players = (n) => Array.from({ length: n }, (_, i) => 'p' + (i + 1));
const seedOf = (u) => Number(u.slice(1));
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** Chơi hết một giai đoạn theo từng lượt (mọi trận sẵn sàng đấu cùng lúc): số trận đã đấu, số lượt, số người đi tiếp. */
function simulate(cfgIn, n, last, pick) {
  const cfg = S.normalizeStages(last ? [cfgIn] : [cfgIn, { type: 'single' }])[0];
  const st = S.buildStage(cfg, 0, players(n), { seedOf });
  let waves = 0;
  for (let guard = 0; guard < 10000 && !st.done; guard++) {
    const ready = S.playable(st);
    assert.ok(ready.length, 'kẹt');
    waves++;
    for (const m of ready) {
      const w = pick(m);
      m.wins = { [m.a]: w === m.a ? 1 : 0, [m.b]: w === m.b ? 1 : 0 };
      S.recordResult(st, m, w, { seedOf });
    }
  }
  const played = Object.values(st.matches).filter((m) => m.done && S.real(m.a) && S.real(m.b) && !m.skipped && !m.split).length;
  return { played, waves, advance: last ? null : S.advancers(st, seedOf).seeds.length, cfg };
}
const top = (m) => (seedOf(m.a) < seedOf(m.b) ? m.a : m.b);
const coin = (m) => (rnd() < 0.5 ? m.a : m.b);

const CASES = [
  { type: 'single', thirdPlace: true },
  { type: 'single', thirdPlace: false },
  { type: 'double', reset: true },
  { type: 'double', reset: false },
  { type: 'single', placement: true },
  { type: 'single', places: [5, 9, 15] },
  { type: 'single', places: [7] },
  { type: 'double', gf: 'none' },
  { type: 'double', gf: '1', split: true },
  { type: 'double', gf: '2', split: true },
  { type: 'double', gf: 'none', split: true },
  { type: 'roundrobin', groups: 2, meetings: 3 },
  { type: 'swiss', rounds: 0 },
  { type: 'roundrobin', groups: 1 },
  { type: 'roundrobin', groups: 4, meetings: 2 },
  { type: 'roundrobin', groupSize: 4, advance: 2 },
  { type: 'roundrobin', groupSize: 5, meetings: 2, advance: 3 },
  { type: 'swiss', rounds: 5, advance: 8 },
  { type: 'swiss', rounds: 9, advance: 4 },
];

test('ước tính khớp mô phỏng của máy chủ: mọi thể thức, 2..70 người', () => {
  for (const c of CASES) {
    const elim = c.type === 'single' || c.type === 'double';
    for (let n = 2; n <= 70; n++) {
      const last = elim || !c.advance;
      const sim = simulate(c, n, last, top);
      const est = E.stage(sim.cfg, n, last);
      const tag = `${JSON.stringify(c)} n=${n}`;
      assert.strictEqual(est.matches, sim.played, 'số trận ' + tag);
      assert.strictEqual(est.waves, sim.waves, 'số lượt ' + tag);
      if (!last) assert.strictEqual(est.advance, sim.advance, 'đi tiếp ' + tag);
    }
  }
});

test('nhánh thắng – thua, kết quả ngẫu nhiên: số trận / lượt nằm trong khoảng ước tính (có thể thêm trận reset)', () => {
  for (const cfg of [{ reset: true }, { reset: false }, { gf: '2', split: true }, { gf: 'none' }]) {
    for (let n = 2; n <= 70; n++) {
      const sim = simulate({ type: 'double', ...cfg }, n, true, coin);
      const est = E.stage(sim.cfg, n, true);
      assert.ok(sim.played >= est.matches && sim.played <= est.maxMatches, `trận n=${n} ${sim.played}`);
      assert.ok(sim.waves >= est.waves && sim.waves <= est.maxWaves, `lượt n=${n} ${sim.waves}`);
    }
  }
});

test('giải nhiều giai đoạn: cộng dồn, người đi tiếp chảy sang giai đoạn sau, có thời gian ước tính', () => {
  const stages = S.normalizeStages([{ type: 'roundrobin', groups: 4, advance: 2 }, { type: 'single', thirdPlace: true }]);
  const r = E.estimate({ stages, players: 32, timeLimit: 20 });
  // 4 bảng × 8 người: 4 × 28 = 112 trận; 8 người đi tiếp: 7 trận + tranh hạng ba
  assert.strictEqual(r.stages[0].matches, 112);
  assert.strictEqual(r.stages[1].players, 8);
  assert.strictEqual(r.matches, 112 + 8);
  assert.strictEqual(r.waves, 7 + 3);
  assert.ok(r.minutes > 30 && r.minutes < 600, 'phút ' + r.minutes);
  // Đồng hồ dài hơn → lâu hơn; ít người → ít trận
  assert.ok(E.estimate({ stages, players: 32, clock: '10+5' }).minutes > r.minutes);
  assert.strictEqual(E.estimate({ stages, players: 1 }).matches, 0);
  assert.strictEqual(E.estimate({ stages: null, players: 8 }).matches, 0);
  assert.ok(E.gameMinutes(0, '3+2') > 4 && E.gameMinutes(0, '3+2') < 8);
});
