'use strict';
// Đợt 10–12 – thể thức các giải Esports lớn. Đợt 10: ghép cặp Thụy Sĩ kiểu CS Major (stages-valve.js – theo luật công khai
// của Valve: vòng 1 hạt giống i gặp i + n/2; sau đó cùng thành tích, theo độ khó rồi hạt giống giai đoạn, cao gặp thấp; nhóm
// 6 đội theo bảng ưu tiên), giải offline tối đa 4 giai đoạn, mẫu kiểu CS Major (3 giai đoạn Thụy Sĩ + playoff).
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Valve = require('../src/hub/stages-valve.js');
const Spec = require('../src/hub/otour-spec.js');
const TP = require('../../caro/otour-templates.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const E = require('../../caro/tour-estimate.js');
const { ctx, account, until } = require('./otour-client.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const mkSeeds = (n) => { const s = Array.from({ length: n }, (_, i) => 'u' + i); return { s, seedOf: (u) => s.indexOf(u) + 1 }; };
const ids = (st, r) => st.rounds[r].map((id) => st.matches[id]).filter((m) => !m.bye).map((m) => m.a + '-' + m.b);

test('Kiểu CS Major: chỉ Thụy Sĩ theo thắng / thua của giải offline; giải offline tối đa 4 giai đoạn, giải Caro 3', () => {
  assert.strictEqual(off([{ type: 'swiss', record: { win: 3, lose: 3 }, pairing: 'valve' }])[0].pairing, 'valve');
  assert.strictEqual(off([{ type: 'swiss', pairing: 'valve' }])[0].pairing, 'dutch', 'không theo thắng / thua');
  assert.strictEqual(ST.normalizeStages([{ type: 'swiss', record: { win: 3, lose: 3 }, pairing: 'valve' }])[0].pairing, 'dutch', 'giải Caro trực tuyến');
  assert.strictEqual(off(Array.from({ length: 6 }, () => ({ type: 'swiss', record: { win: 3, lose: 3 } }))).length, 4);
  assert.strictEqual(ST.normalizeStages(Array.from({ length: 6 }, () => ({ type: 'swiss' }))).length, 3);
  assert.throws(() => Spec.normalizeSpec({ sport: 'esports', stages: Array.from({ length: 5 }, () => ({ type: 'single' })) }), (e) => e.code === 'ot_spec_stages');
  // Vào thẳng giai đoạn 3 (skip) chỉ từ giai đoạn 1
  const four = off([{ type: 'swiss', skip: 2 }, { type: 'swiss', skip: 2 }, { type: 'swiss' }, { type: 'single' }]);
  assert.deepStrictEqual(four.map((c) => c.skip || 0), [2, 0, 0, 0]);
});

test('Kiểu CS Major: vòng 1 hạt giống i gặp i + 8; vòng 2–3 cao gặp thấp theo độ khó; không gặp lại; Bo3 trận quyết định', () => {
  const [c] = off([{ type: 'swiss', bestOf: 1, record: { win: 3, lose: 3, bo: 3 }, pairing: 'valve' }, { type: 'single' }]);
  const { s, seedOf } = mkSeeds(16);
  const st = ST.buildStage(c, 0, s, { seedOf });
  assert.deepStrictEqual(ids(st, 0), ['u0-u8', 'u1-u9', 'u2-u10', 'u3-u11', 'u4-u12', 'u5-u13', 'u6-u14', 'u7-u15']);
  // Bất ngờ: u8 thắng u0
  for (const m of ST.playable(st)) ST.recordResult(st, m, m.a === 'u0' ? 'u8' : m.a, { seedOf });
  // Nhóm 1–0: độ khó bằng nhau (đối thủ đều 0–1) → theo hạt giống giai đoạn: u1…u7, u8 → u1 gặp u8, u2 gặp u7…
  assert.deepStrictEqual(ids(st, 1).slice(0, 4), ['u1-u8', 'u2-u7', 'u3-u6', 'u4-u5']);
  const played = new Set(Object.values(st.matches).map((m) => [m.a, m.b].sort().join('|')));
  for (let g = 0; !st.done && g < 10; g++) for (const m of ST.playable(st)) ST.recordResult(st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf });
  const pairs = Object.values(st.matches).map((m) => [m.a, m.b].sort().join('|'));
  assert.strictEqual(new Set(pairs).size, pairs.length, 'không cặp nào gặp lại');
  assert.ok(played.size >= 8);
  // Trận vòng 3 của nhóm 2–0 và 0–2 là trận quyết định: Bo3; nhóm 1–1: Bo1
  const r3 = st.rounds[2].map((id) => st.matches[id]);
  assert.deepStrictEqual(r3.map((m) => m.bo || 1).sort(), [1, 1, 1, 1, 3, 3, 3, 3]);
  // 8 đội đi tiếp, thứ tự: 3–0, 3–1, 3–2 rồi độ khó, hạt giống giai đoạn
  const adv = ST.advancers(st, seedOf).seeds;
  assert.strictEqual(adv.length, 8);
  const r2 = ST.records(st);
  for (let i = 1; i < adv.length; i++) assert.ok(r2[adv[i - 1]].l <= r2[adv[i]].l, 'thua ít xếp trước');
});

test('Kiểu CS Major: độ khó như ví dụ của luật; nhóm 6 đội theo bảng ưu tiên (dòng đầu không gặp lại)', () => {
  // A đã gặp đội 2–0 và đội 1–1 → độ khó 2; B gặp hai đội 1–1 → 0
  const st = { entrants: ['A', 'B', 'x', 'y', 'z'], matches: {
    m1: { done: true, a: 'A', b: 'x', winner: 'A', loser: 'x' }, m2: { done: true, a: 'A', b: 'y', winner: 'A', loser: 'y' },
    m3: { done: true, a: 'B', b: 'z', winner: 'B', loser: 'z' } } };
  const rec = { A: { w: 2, l: 0 }, B: { w: 1, l: 0 }, x: { w: 2, l: 0 }, y: { w: 1, l: 1 }, z: { w: 1, l: 1 } };
  const d = Valve.difficulty(st, rec);
  assert.deepStrictEqual([d.A, d.B], [2, 0]);
  // Nhóm 6: dòng 1 (1–6, 2–5, 3–4) bị chặn bởi 1–6 đã gặp → dòng 2 (1–6…) cũng bị chặn → dòng 3: 1–5, 2–6, 3–4
  const st6 = { entrants: ['a', 'b', 'c', 'd', 'e', 'f'], rounds: [[]], matches: {} };
  const rec6 = Object.fromEntries(st6.entrants.map((u) => [u, { w: 2, l: 1 }]));
  const p = Valve.valvePairs(st6, rec6, st6.entrants, new Set(['a|f']));
  assert.deepStrictEqual(p, [['a', 'e'], ['b', 'f'], ['c', 'd']]);
  assert.strictEqual(Valve.valvePairs(st6, rec6, ['a', 'b', 'c'], new Set()), null, 'số lẻ: ghép như thường');
});

test('Mẫu kiểu CS Major qua máy chủ: 32 đội, 4 giai đoạn, đội vào thẳng giai đoạn 2 và 3 đúng hạt giống, playoff 8 đội', async () => {
  const tpl = TP.byId('cs_major');
  const spec = Spec.normalizeSpec(TP.specOf(tpl, SPORTS));
  assert.deepStrictEqual(spec.stages.map((c) => [c.type, c.pairing || null, c.direct || 0]), [['swiss', 'valve', 0], ['swiss', 'valve', 8], ['swiss', 'valve', 8], ['single', null, 0]]);
  assert.deepStrictEqual(E.estimate({ stages: spec.stages, players: 32 }).stages.map((x) => x.players), [16, 16, 16, 8]);
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Kiểu CS Major', spec: TP.specOf(tpl, SPORTS), teams: TP.sampleTeams(tpl, 'Đội') }, 'otCreated', undefined, 15000);
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running', 15000);
  const U = (n) => t.players[n - 1].uid;
  assert.deepStrictEqual(t.st[0].entrants, Array.from({ length: 16 }, (_, i) => U(17 + i)), 'giai đoạn 1: hạt giống 17–32');
  assert.deepStrictEqual([t.direct[1], t.direct[2]], [Array.from({ length: 8 }, (_, i) => U(9 + i)), Array.from({ length: 8 }, (_, i) => U(1 + i))]);
  const seedOf = ctx.app.hub.otSeedOf(t);
  for (let g = 0; t.status === 'running' && g < 60; g++) {
    const st = t.st[t.stage];
    for (const m of ST.playable(st)) {
      const bo = ST.boOf(st, m), w = seedOf(m.a) < seedOf(m.b);
      org.send({ t: 'otScore', id, match: m.id, sets: Array.from({ length: (bo + 1) / 2 }, () => (w ? [1, 0] : [0, 1])) });
      await until(() => m.done || t.st[t.stage] !== st || t.status !== 'running');
    }
  }
  assert.strictEqual(t.status, 'finished');
  assert.deepStrictEqual(t.st.map((st) => st.entrants.length), [16, 16, 16, 8]);
  assert.deepStrictEqual(t.st[1].entrants.slice(0, 8), Array.from({ length: 8 }, (_, i) => U(9 + i)), 'giai đoạn 2: đội vào thẳng là hạt giống 1–8 của giai đoạn');
  assert.ok(Object.values(t.st[2].matches).every((m) => ST.boOf(t.st[2], m) === 3), 'giai đoạn 3 toàn Bo3');
  const fin = t.st[3].matches[t.st[3].rounds[2][0]];
  assert.deepStrictEqual([ST.boOf(t.st[3], fin), t.podium[0]], [5, U(1)]);
  org.close();
});
