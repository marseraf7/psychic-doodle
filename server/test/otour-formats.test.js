'use strict';
// Đợt 7 – thể thức của các giải con Esports World Cup mà hệ thống chưa có: bảng đấu loại kép 4 đội kiểu GSL
// (stages-gsl.js), sinh tồn tính điểm hạng + hạ gục và kết thúc kiểu match point (stages-race.js), các đội đầu vào thẳng
// giai đoạn 3 còn lại đá vòng vớt (cfg.skip), điều kiện xếp hạng câu lạc bộ của giải tổng (otour-multi.js).
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Race = require('../src/hub/stages-race.js');
const Spec = require('../src/hub/otour-spec.js');
const E = require('../../caro/tour-estimate.js');
const { ctx, account, until } = require('./otour-client.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const mkSeeds = (n) => { const s = Array.from({ length: n }, (_, i) => 'u' + i); return { s, seedOf: (u) => s.indexOf(u) + 1 }; };

test('Bảng GSL: chia rắn, 5 trận mỗi bảng, nhất – nhì đi tiếp, không cần hệ số phụ; chỉ giải offline', () => {
  assert.strictEqual(ST.normalizeStages([{ type: 'gsl' }, { type: 'single' }])[0].type, 'roundrobin', 'giải Caro trực tuyến không có bảng GSL');
  const cfgs = off([{ type: 'gsl', bestOf: 1, boDecider: 3, advance: 7 }, { type: 'single' }]);
  assert.deepStrictEqual(cfgs[0], { type: 'gsl', bestOf: 1, boDecider: 3, advance: 2 });
  const { s, seedOf } = mkSeeds(8);
  const st = ST.buildStage(cfgs[0], 0, s, { seedOf });
  assert.deepStrictEqual(st.groups.map((g) => g.players), [['u0', 'u3', 'u4', 'u7'], ['u1', 'u2', 'u5', 'u6']]);
  assert.strictEqual(Object.keys(st.matches).length, 10);
  // Bảng A: u7 thắng u0 (bất ngờ), u3 thắng u4; nhánh thắng u3 thắng u7; nhánh thua u0 thắng u4; quyết định u0 thắng u7
  const M = (id) => st.matches['s0g0' + id];
  assert.deepStrictEqual(ST.playable(st).map((m) => m.id).sort(), ['s0g0o1', 's0g0o2', 's0g1o1', 's0g1o2']);
  ST.recordResult(st, M('o1'), 'u7', { seedOf });
  ST.recordResult(st, M('o2'), 'u3', { seedOf });
  assert.deepStrictEqual([[M('w').a, M('w').b], [M('l').a, M('l').b]], [['u7', 'u3'], ['u0', 'u4']]);
  ST.recordResult(st, M('w'), 'u3', { seedOf });
  ST.recordResult(st, M('l'), 'u0', { seedOf });
  assert.deepStrictEqual([M('d').a, M('d').b, ST.boOf(st, M('d')), ST.boOf(st, M('w'))], ['u7', 'u0', 3, 1]);
  ST.recordResult(st, M('d'), 'u0', { seedOf });
  const tab = ST.gslTables(st, (u) => ({ uid: u, name: u }), seedOf, 2)[0];
  assert.deepStrictEqual(tab.map((x) => [x.name, x.w, x.l, x.rank, x.adv]), [['u3', 2, 0, 1, true], ['u0', 2, 1, 2, true], ['u7', 1, 2, 3, false], ['u4', 0, 2, 4, false]]);
  assert.ok(!st.done);
  for (let g = 0; !st.done && g < 5; g++) for (const m of ST.playable(st)) ST.recordResult(st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf });
  const adv = ST.advancers(st, seedOf);
  assert.deepStrictEqual([adv.seeds, adv.groupOf.u0, adv.groupOf.u2], [['u1', 'u3', 'u0', 'u2'], 0, 1], 'nhất các bảng (theo hạt giống) rồi nhì các bảng');
  // Cỡ: chia hết cho 4; ước tính 5 trận mỗi bảng
  assert.throws(() => Spec.checkSize(Spec.normalizeSpec({ sport: 'esports', stages: cfgs }), 10), (e) => e.code === 'ot_gsl_four');
  assert.deepStrictEqual(E.estimate({ stages: cfgs, players: 16 }).stages.map((x) => [x.players, x.matches]), [[16, 20], [8, 8]]);
});

test('Sinh tồn: điểm hạng + hạ gục, bằng điểm xét số hạ gục; match point cố định và kiểu "sau N trận"', () => {
  const { s, seedOf } = mkSeeds(4);
  const run = (cfg) => { const [c] = off([{ type: 'race', score: 'points', table: [10, 6, 5, 4], ...cfg }]); return ST.buildStage(c, 0, s, { seedOf }); };
  const ev = (st, i, order, kills = {}) => { const r = Race.cleanEvent(st, order.map((u, k) => ({ uid: u, rank: k + 1, kills: kills[u] })), undefined, i); assert.ok(r.rows, r.code); return Race.recordEvent(st, i, r.rows); };
  // Điểm hạ gục
  let st = run({ events: 2, kill: 2 });
  ev(st, 0, ['u0', 'u1', 'u2', 'u3'], { u1: 2, u3: 300 });
  let tab = Race.raceTable(st, seedOf);
  assert.deepStrictEqual(['u0', 'u1', 'u3'].map((u) => [tab.stats[u].pts, tab.stats[u].kills]), [[10, 0], [10, 2], [404, 200]], 'hạ gục kẹp tối đa 200');
  assert.deepStrictEqual(tab.list.slice(1, 3), ['u0', 'u1'], 'bằng điểm: nhiều lần về nhất hơn');
  // Match point cố định 20 điểm: u0 thắng trận 1, 2 (20 điểm) → thắng tiếp trận 3 thì vô địch, dừng luôn
  st = run({ events: 6, mp: { at: 20 } });
  assert.strictEqual(ev(st, 0, ['u0', 'u1', 'u2', 'u3']), false);
  assert.strictEqual(ev(st, 1, ['u0', 'u1', 'u2', 'u3']), false, 'thắng trận 2 khi mới có 10 điểm: chưa tính');
  assert.strictEqual(ev(st, 2, ['u1', 'u0', 'u2', 'u3']), false, 'u1 thắng nhưng chưa đạt ngưỡng trước trận');
  assert.strictEqual(ev(st, 3, ['u1', 'u0', 'u2', 'u3']), true, 'u1 đã có 22 điểm trước trận → thắng là vô địch');
  assert.deepStrictEqual([st.mpWinner, Race.raceTable(st, seedOf).list[0], st.events.filter((e) => e.done).length], ['u1', 'u1', 4]);
  const v = Race.raceView(st, 0, 0, (u) => ({ uid: u, name: u }), seedOf);
  assert.deepStrictEqual([v.mp, v.table.map((x) => x.name).slice(0, 2), v.table[0].mp], [{ at: 20, winner: 'u1' }, ['u1', 'u0'], true], 'vô địch theo match point đứng đầu bảng');
  Race.undoEvent(st, 3);
  assert.ok(!st.mpWinner && !st.done);
  // Kiểu "sau 2 trận + 5": ngưỡng chưa có trước trận 3; hết số trận mà không ai làm được thì xếp theo điểm
  st = run({ events: 4, mp: { after: 2, plus: 5 } });
  assert.strictEqual(Race.mpThreshold(st), null);
  ev(st, 0, ['u0', 'u1', 'u2', 'u3']); ev(st, 1, ['u1', 'u0', 'u2', 'u3']);
  assert.strictEqual(Race.mpThreshold(st), 21);
  ev(st, 2, ['u2', 'u3', 'u0', 'u1']);
  assert.strictEqual(ev(st, 3, ['u3', 'u2', 'u1', 'u0']), true);
  assert.ok(!st.mpWinner);
  assert.deepStrictEqual(off([{ type: 'race', score: 'points', events: 1, mp: { after: 3 } }])[0].mp, undefined, '1 trận: không có kiểu sau N trận');
});

test('Vòng vớt (skip): 8 đội đua – 2 đội đầu vào thẳng chung kết, 4 đội kế đá vòng vớt lấy 2', async () => {
  const stages = [{ type: 'race', score: 'points', events: 1, advance: 4, skip: 2 }, { type: 'race', score: 'points', events: 1, advance: 2 }, { type: 'race', score: 'points', events: 2, kill: 1, mp: { at: 10 } }];
  assert.deepStrictEqual(off(stages).map((c) => c.skip), [2, undefined, undefined]);
  assert.strictEqual(off(stages.slice(0, 2))[0].skip, undefined, 'chỉ khi có đủ 3 giai đoạn');
  assert.deepStrictEqual(E.estimate({ stages: off(stages), players: 8 }).stages.map((x) => x.players), [8, 4, 4]);
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Sinh tồn có vòng vớt', spec: { sport: 'esports', stages }, teams: Array.from({ length: 8 }, (_, i) => 'Đội ' + (i + 1)) }, 'otCreated');
  const t = ctx.app.hub.otGet(id), P = t.players.map((p) => p.uid);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const rows = (order) => order.map((uid, k) => ({ uid, rank: k + 1 }));
  org.send({ t: 'otRace', id, event: 0, rows: rows(P) });
  await until(() => t.st[1]);
  assert.deepStrictEqual([t.st[1].entrants, t.direct[2]], [P.slice(2, 6), P.slice(0, 2)]);
  const v = (await org.req({ t: 'otGet', id }, 'ot', (m) => m.id === id && m.tour)).tour.stageViews[0];
  assert.deepStrictEqual(v.table.map((x) => [!!x.adv, !!x.skip]).slice(0, 7), [[true, true], [true, true], [true, false], [true, false], [true, false], [true, false], [false, false]]);
  org.send({ t: 'otRace', id, event: 0, rows: rows([P[5], P[4], P[3], P[2]]) });
  await until(() => t.st[2]);
  assert.deepStrictEqual(t.st[2].entrants, [P[0], P[1], P[5], P[4]], 'vào thẳng đứng trước đội từ vòng vớt');
  // Chung kết match point 10: phải nhập lần lượt; P[5] thắng trận 1 (10 + 3 hạ gục) rồi thắng trận 2 → vô địch
  assert.strictEqual((await org.req({ t: 'otRace', id, event: 1, rows: rows(t.st[2].entrants) }, 'error')).code, 'ot_gt_seq');
  org.send({ t: 'otRace', id, event: 0, rows: [{ uid: P[5], rank: 1, kills: 3 }, { uid: P[0], rank: 2 }, { uid: P[1], rank: 3 }, { uid: P[4], rank: 4 }] });
  await until(() => t.st[2].events[0].done);
  org.send({ t: 'otRace', id, event: 1, rows: rows([P[5], P[0], P[1], P[4]]) });
  await until(() => t.status === 'finished');
  assert.deepStrictEqual([t.podium[0], t.st[2].mpWinner], [P[5], P[5]]);
  org.close();
});

test('Bảng GSL qua máy chủ: không nhận hoà, huỷ kết quả gỡ đội khỏi trận sau, xếp lịch theo lượt', async () => {
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Bảng đấu loại kép', spec: { sport: 'chess', stages: [{ type: 'gsl' }, { type: 'single', thirdPlace: false }] }, teams: ['A', 'B', 'C', 'D'] }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const st = t.st[0], M = (k) => st.matches['s0g0' + k];
  assert.strictEqual((await org.req({ t: 'otScore', id, match: M('o1').id, draw: true }, 'error')).code, 'tour_score_bad');
  org.send({ t: 'otScore', id, match: M('o1').id, winner: M('o1').a });
  await until(() => M('o1').done);
  assert.strictEqual(M('w').a, M('o1').a);
  org.send({ t: 'otUndo', id, match: M('o1').id });
  await until(() => !M('o1').done);
  assert.deepStrictEqual([M('w').a, M('l').a], [null, null]);
  // Xếp lịch: trận nhánh thắng / thua sau trận mở màn, trận quyết định sau cùng
  const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  org.send({ t: 'otSchedAuto', id, sched: { start: day, times: ['18:00', '20:00'], tz: 0 }, mode: 'empty' });
  await until(() => M('o1').when && M('o2').when);
  const seedOf = ctx.app.hub.otSeedOf(t);
  for (let g = 0; t.status === 'running' && g < 8; g++) for (const m of ST.playable(t.st[t.stage])) { org.send({ t: 'otScore', id, match: m.id, winner: seedOf(m.a) < seedOf(m.b) ? m.a : m.b }); await until(() => m.done || t.status !== 'running'); }
  assert.strictEqual(t.status, 'finished');
  assert.deepStrictEqual([t.st[1].entrants, t.podium[0]], [[t.players[0].uid, t.players[1].uid], t.players[0].uid]);
  org.close();
});

test('Giải tổng: điều kiện xếp hạng câu lạc bộ (có điểm ở ≥ N giải con, phải vô địch một giải mới đứng đầu)', async () => {
  const M = require('../src/hub/otour-multi.js');
  assert.deepStrictEqual([M.cleanRule({ minTop: 99, needWin: true }), M.cleanRule({}), M.TABLE], [{ minTop: 30, needWin: true }, { minTop: 1, needWin: false }, [1000, 750, 500, 300, 200, 150, 100, 50]]);
  const org = await account();
  const one = { sport: 'esports', stages: [{ type: 'race', score: 'points', events: 1 }] };
  const games = [['G1', ['Y', 'X', 'Z']], ['G2', ['Z', 'X', 'W']], ['G3', ['W', 'X', 'Y']]].map(([name, teams]) => ({ name: 'Game ' + name, spec: one, teams }));
  const { id } = await org.req({ t: 'otCreate', name: 'Luật câu lạc bộ', spec: one, teams: [], multi: { table: [100, 90, 10], minTop: 3, needWin: true, games } }, 'otCreated');
  const P = ctx.app.hub.otGet(id);
  assert.deepStrictEqual([P.multi.minTop, P.multi.needWin], [3, true]);
  for (const cid of P.multi.children) {
    const c = ctx.app.hub.otGet(cid);
    org.send({ t: 'otStart', id: cid });
    await until(() => c.status === 'running');
    org.send({ t: 'otRace', id: cid, event: 0, rows: c.st[0].entrants.map((uid, k) => ({ uid, rank: k + 1 })) });
    await until(() => c.status === 'finished');
  }
  const get = async () => (await org.req({ t: 'otGet', id }, 'ot', (m) => m.id === id && m.tour)).tour.multi;
  // X nhì cả 3 giải (270 điểm, đủ 3 giải, không vô địch); Y, Z, W mỗi đội 110 điểm ở 2 giải → chỉ X đủ điều kiện
  let v = await get();
  assert.deepStrictEqual(v.clubs.map((c) => [c.name, c.pts, !!c.inel]), [['X', 270, false], ['W', 110, true], ['Y', 110, true], ['Z', 110, true]]);
  // Chỉ cần 2 giải: X nhiều điểm nhất nhưng không vô địch giải nào → câu lạc bộ có chức vô địch, nhiều điểm nhất lên đầu
  org.send({ t: 'otMultiCfg', id, table: '100 90 10', minTop: 2, needWin: true });
  await until(() => P.multi.minTop === 2);
  v = await get();
  assert.deepStrictEqual(v.clubs.map((c) => [c.rank, c.name, c.wins]), [[1, 'W', 1], [2, 'X', 0], [3, 'Y', 1], [4, 'Z', 1]]);
  org.send({ t: 'otMultiCfg', id, table: '100 90 10', minTop: 2, needWin: false });
  await until(() => !P.multi.needWin);
  assert.strictEqual((await get()).clubs[0].name, 'X');
  org.close();
});
