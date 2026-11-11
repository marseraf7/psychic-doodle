'use strict';
// Đợt 8 – các thể thức giải con Esports World Cup còn lại: loạt Bo2 có hoà ở vòng tròn / Thụy Sĩ, bảng đấu loại kép
// 8 người lấy 4 (stages-gsl.js, cfg.size = 8), nhất bảng GSL vào thẳng giai đoạn 3 (cfg.skip), sinh tồn chia 3 bảng
// xoay vòng (cfg.rot – mỗi trận hai bảng đấu) và điểm thưởng mang sang giai đoạn sau (cfg.head, kiểu Points Rush).
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Race = require('../src/hub/stages-race.js');
const Spec = require('../src/hub/otour-spec.js');
const RU = require('../../caro/otour-rules.js');
const E = require('../../caro/tour-estimate.js');
const { ctx, account, until } = require('./otour-client.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const mkSeeds = (n) => { const s = Array.from({ length: n }, (_, i) => 'u' + i); return { s, seedOf: (u) => s.indexOf(u) + 1 }; };
const win = (st, seedOf) => { for (const m of ST.playable(st)) ST.recordResult(st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf }); };

test('Bo2: chỉ vòng tròn / Thụy Sĩ thường của giải offline; hai ván phải đủ, 1–1 là hoà', () => {
  assert.strictEqual(off([{ type: 'roundrobin', bestOf: 2 }, { type: 'single' }])[0].bestOf, 2);
  assert.strictEqual(off([{ type: 'swiss', bestOf: 2 }])[0].bestOf, 2);
  assert.notStrictEqual(off([{ type: 'single', bestOf: 2 }])[0].bestOf, 2, 'loại trực tiếp không có Bo chẵn');
  assert.notStrictEqual(off([{ type: 'swiss', bestOf: 2, record: { win: 3, lose: 3 } }])[0].bestOf, 2, 'Thụy Sĩ thắng / thua không có hoà');
  assert.strictEqual(RU.setsError(null, [[1, 0], [0, 1]], 2), null);
  assert.strictEqual(RU.setsError(null, [[1, 0], [1, 0]], 2), null);
  assert.ok(RU.setsError(null, [[1, 0]], 2), 'mới một ván: chưa đủ');
});

test('Bảng đấu loại kép 8 người: 10 trận, nhánh quyết định chéo, 4 đội đi tiếp theo tầng', () => {
  const [c] = off([{ type: 'gsl', size: 8, bestOf: 3 }, { type: 'single' }]);
  assert.deepStrictEqual(c, { type: 'gsl', bestOf: 3, size: 8, advance: 4 });
  const { s, seedOf } = mkSeeds(16);
  const st = ST.buildStage(c, 0, s, { seedOf });
  assert.deepStrictEqual([st.groups.length, Object.keys(st.matches).length, st.groups[0].players], [2, 20, ['u0', 'u3', 'u4', 'u7', 'u8', 'u11', 'u12', 'u15']]);
  const M = (k) => st.matches['s0g0' + k];
  assert.deepStrictEqual([M('o1').a, M('o1').b, M('o2').a, M('o2').b], ['u0', 'u15', 'u7', 'u8']);
  // Bất ngờ: u15 thắng u0 ở trận mở màn → u0 xuống nhánh thua, vẫn có thể đi tiếp qua trận quyết định
  ST.recordResult(st, M('o1'), 'u15', { seedOf });
  for (const k of ['o2', 'o3', 'o4']) ST.recordResult(st, M(k), seedOf(M(k).a) < seedOf(M(k).b) ? M(k).a : M(k).b, { seedOf });
  assert.deepStrictEqual([M('w1').a, M('w1').b, M('l1').a, M('l1').b], ['u15', 'u7', 'u0', 'u8']);
  ST.recordResult(st, M('w1'), 'u7', { seedOf });
  ST.recordResult(st, M('l1'), 'u0', { seedOf });
  assert.deepStrictEqual([M('d2').a, M('d1').b], ['u15', 'u0'], 'thua nhánh thắng 1 → quyết định 2; thắng nhánh thua 1 → quyết định 1');
  for (let g = 0; !st.done && g < 6; g++) win(st, seedOf);
  const adv = ST.advancers(st, seedOf);
  assert.strictEqual(adv.seeds.length, 8);
  assert.ok(adv.seeds.includes('u0') && !adv.seeds.includes('u8'));
  const tab = ST.gslTables(st, (u) => ({ uid: u }), seedOf, 4)[0];
  assert.deepStrictEqual([tab.filter((x) => x.adv).length, tab.filter((x) => x.out).length, tab[7].rank], [4, 4, 8]);
  // Cỡ: chia hết cho 8; ước tính 10 trận mỗi bảng
  assert.throws(() => Spec.checkSize(Spec.normalizeSpec({ sport: 'esports', stages: [c, { type: 'single' }] }), 12), (e) => e.code === 'ot_gsl_four' && e.args.k === 8);
  assert.deepStrictEqual(E.estimate({ stages: off([{ type: 'gsl', size: 8 }, { type: 'single' }]), players: 32 }).stages.map((x) => [x.players, x.matches]), [[32, 40], [16, 16]]);
});

test('Bảng GSL + skip: nhất bảng vào thẳng giai đoạn 3, nhì bảng đá giai đoạn 2 (kiểu đối kháng 1 đấu 1)', () => {
  const cfgs = off([{ type: 'gsl', skip: 5 }, { type: 'roundrobin', groupSize: 2, advance: 1 }, { type: 'single' }]);
  assert.strictEqual(cfgs[0].skip, 1, 'bảng 4 đội: tối đa 1 đội mỗi bảng vào thẳng');
  assert.strictEqual(off([{ type: 'gsl', skip: 1 }, { type: 'single' }])[0].skip, undefined, 'chỉ khi có giai đoạn 3');
  const { s, seedOf } = mkSeeds(16);
  const st = ST.buildStage(cfgs[0], 0, s, { seedOf });
  for (let g = 0; !st.done && g < 5; g++) win(st, seedOf);
  const sp = ST.splitAdvancers(st, seedOf);
  assert.deepStrictEqual([sp.skip, sp.seeds], [['u0', 'u1', 'u2', 'u3'], ['u4', 'u5', 'u6', 'u7']]);
  const tab = ST.gslTables(st, (u) => ({ uid: u }), seedOf, 2)[0];
  assert.deepStrictEqual(tab.map((x) => !!x.skip), [true, false, false, false]);
  assert.deepStrictEqual(E.estimate({ stages: cfgs, players: 16 }).stages.map((x) => x.players), [16, 4, 6]);
});

test('Sinh tồn chia 3 bảng xoay vòng: mỗi trận hai bảng đấu, đội ngoài hai bảng không được nhập; cần ≥ 6 đội', () => {
  const [h] = off([{ type: 'race', score: 'points', events: 3, table: [3, 2, 1], rot: true, heat: 4 }]);
  assert.ok(!h.rot && h.heat === 4, 'xoay bảng không đi cùng chia lượt (chia lượt được giữ)');
  const [c] = off([{ type: 'race', score: 'points', events: 3, table: [3, 2, 1], rot: true }]);
  assert.ok(c.rot);
  const { s, seedOf } = mkSeeds(9);
  const st = ST.buildStage(c, 0, s, { seedOf });
  const groups = s.map((_, j) => RU.lobbyGroup(j));
  assert.deepStrictEqual([0, 1, 2].map((g) => groups.filter((x) => x === g).length), [3, 3, 3], 'chia đều kiểu rắn');
  for (let i = 0; i < 3; i++) {
    const lob = Race.lobby(st, i);
    assert.strictEqual(lob.length, 6);
    assert.ok(lob.every((u) => groups[s.indexOf(u)] !== (i + 2) % 3), 'bảng nghỉ không có mặt');
  }
  const out = s.find((u) => !Race.lobby(st, 0).includes(u));
  assert.strictEqual(Race.cleanEvent(st, [{ uid: out, rank: 1 }], Race.lobby(st, 0), 0).code, 'tour_score_bad');
  assert.ok(Race.cleanEvent(st, Race.lobby(st, 0).map((u, k) => ({ uid: u, rank: k + 1 })), Race.lobby(st, 0), 0).rows);
  assert.strictEqual(Race.raceError(c, 5).code, 'ot_rot_few');
  assert.strictEqual(Race.raceError(c, 6), null);
});

test('Điểm thưởng mang sang (Points Rush) + chung kết match point qua máy chủ; bảng xoay vòng nhập đúng hai bảng', async () => {
  const org = await account();
  const pts = [5, 3, 1];
  const spec = { sport: 'esports', stages: [
    { type: 'race', score: 'points', events: 3, table: pts, rot: true, advance: 4 },
    { type: 'race', score: 'points', events: 3, table: pts, head: [6, 4, 2], mp: { at: 12 } }] };
  const teams = Array.from({ length: 6 }, (_, i) => 'Đội ' + (i + 1));
  const { id } = await org.req({ t: 'otCreate', name: 'Giành điểm thưởng', spec, teams }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  assert.deepStrictEqual(t.stages.map((c) => [!!c.rot, c.head || null]), [[true, null], [false, [6, 4, 2]]]);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const seedOf = ctx.app.hub.otSeedOf(t);
  const st0 = t.st[0];
  // Nhập cả 6 đội vào trận 1 (một bảng đang nghỉ) → bị từ chối
  const all = st0.entrants.map((uid, k) => ({ uid, rank: k + 1 }));
  assert.strictEqual((await org.req({ t: 'otRace', id, event: 0, rows: all }, 'error')).code, 'tour_score_bad');
  for (let i = 0; i < 3; i++) {
    const rows = Race.lobby(st0, i).sort((a, b) => seedOf(a) - seedOf(b)).map((uid, k) => ({ uid, rank: k + 1 }));
    org.send({ t: 'otRace', id, event: i, rows });
    await until(() => st0.events[i].done);
  }
  await until(() => t.stage === 1);
  const st1 = t.st[1], [a, b, c, d] = st1.entrants;
  assert.deepStrictEqual(st1.head, { [a]: 6, [b]: 4, [c]: 2 }, 'điểm thưởng theo thứ tự vào giai đoạn');
  let tab = Race.raceTable(st1, seedOf);
  assert.deepStrictEqual([tab.stats[a].pts, tab.stats[d].pts], [6, 0]);
  // Trận 1: d thắng (5 điểm), a thứ hai (6 + 3 = 9); trận 2: a thứ hai (12 – đạt ngưỡng); trận 3: a thắng → vô địch match point
  const ev = (i, order) => { org.send({ t: 'otRace', id, event: i, rows: order.map((uid, k) => ({ uid, rank: k + 1 })) }); return until(() => st1.events[i].done); };
  await ev(0, [d, a, b, c]);
  await ev(1, [d, a, b, c]);
  tab = Race.raceTable(st1, seedOf);
  assert.deepStrictEqual([tab.stats[a].pts, tab.stats[d].pts, tab.list[0]], [12, 10, a]);
  await ev(2, [a, d, b, c]);
  await until(() => t.status === 'finished');
  assert.deepStrictEqual([t.podium[0], st1.mpWinner], [a, a]);
  org.close();
});

test('Bo2 qua máy chủ: vòng tròn đấu loạt Bo2, 1–1 là hoà chia điểm; loại trực tiếp sau đó Bo lẻ', async () => {
  const org = await account();
  const spec = { sport: 'esports', stages: [{ type: 'roundrobin', groups: 1, advance: 2, bestOf: 2 }, { type: 'single', bestOf: 3, thirdPlace: false }] };
  const { id } = await org.req({ t: 'otCreate', name: 'Loạt Bo2', spec, teams: ['A', 'B', 'C', 'D'] }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  assert.strictEqual(t.stages[0].bestOf, 2);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const st = t.st[0], m = ST.playable(st)[0];
  assert.strictEqual(ST.boOf(st, m), 2);
  assert.ok((await org.req({ t: 'otScore', id, match: m.id, sets: [[1, 0]] }, 'error')).code, 'một ván: chưa đủ loạt Bo2');
  org.send({ t: 'otScore', id, match: m.id, sets: [[1, 0], [0, 1]] });
  await until(() => m.done);
  assert.deepStrictEqual([m.winner, m.ext], [null, false], 'hoà, không có ván quyết định');
  const seedOf = ctx.app.hub.otSeedOf(t);
  for (let g = 0; t.status === 'running' && g < 10; g++) {
    const cur = t.st[t.stage];
    for (const x of ST.playable(cur)) {
      const bo = ST.boOf(cur, x), need = Math.floor(bo / 2) + 1, wa = seedOf(x.a) < seedOf(x.b);
      org.send({ t: 'otScore', id, match: x.id, sets: Array.from({ length: need }, () => (wa ? [1, 0] : [0, 1])) });
      await until(() => x.done || t.st[t.stage] !== cur || t.status !== 'running');
    }
  }
  assert.strictEqual(t.status, 'finished');
  assert.strictEqual(ST.boOf(t.st[1], t.st[1].matches[Object.keys(t.st[1].matches)[0]]), 3);
  org.close();
});
