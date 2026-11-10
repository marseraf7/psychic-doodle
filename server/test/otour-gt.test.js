'use strict';
// Thể thức đặc biệt đợt 3 – xe đạp nhiều chặng kiểu Grand Tour (hệ Race, cách tính 'gt' – stages-gt.js): tổng thời gian
// có giây thưởng (áo vàng), điểm theo loại chặng + nước rút (xanh), leo núi (chấm bi), tay đua trẻ (trắng), đồng đội;
// bỏ cuộc rời mọi bảng; nhập lần lượt, chỉ huỷ chặng sau cùng; mẫu Tour de France.
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Race = require('../src/hub/stages-race.js');
const GT = require('../src/hub/stages-gt.js');
const Spec = require('../src/hub/otour-spec.js');
const TP = require('../../caro/otour-templates.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const { ctx, account, until } = require('./otour-client.js');

const H = 3600000, S = 1000;
const mk = (n, cfg) => {
  const [c] = ST.normalizeStages([{ type: 'race', score: 'gt', ...cfg }], { offline: true });
  const ents = Array.from({ length: n }, (_, i) => 'r' + i), seedOf = (u) => ents.indexOf(u) + 1;
  return { st: ST.buildStage(c, 0, ents, { seedOf }), ents, seedOf };
};
// Dòng về đích theo thứ tự order (mã người), cùng thời gian base trừ khi có gaps[k] (giây)
const finish = (order, base, gaps = {}, extra = {}) => order.map((u, k) => ({ uid: u, rank: k + 1, time: base + (gaps[u] || 0) * S, ...(extra[u] || {}) }));

test('Chuẩn hoá: loại chặng, giây thưởng; không chia lượt / bảng điểm / bảng đội tự chọn', () => {
  const [c] = ST.normalizeStages([{ type: 'race', score: 'gt', events: 4, kinds: 'flat mtn x itt', heat: 8, teams: true, table: [1] }], { offline: true });
  assert.deepStrictEqual(c, { type: 'race', bestOf: 1, events: 4, score: 'gt', kinds: ['flat', 'mtn', 'flat', 'itt'], bonus: true });
  const [d] = ST.normalizeStages([{ type: 'race', score: 'gt', events: 2, bonus: false }], { offline: true });
  assert.deepStrictEqual([d.kinds, d.bonus], [['flat', 'flat'], false]);
  const spec = Spec.normalizeSpec({ sport: 'cycling', stages: [{ type: 'race', score: 'gt', events: 21 }] });
  assert.strictEqual(spec.stages[0].kinds.length, 21);
});

test('Kiểm kết quả chặng: thiếu người, người đã bỏ cuộc, thời gian ngược thứ hạng, trùng hạng', () => {
  const { st, ents } = mk(4, { events: 2 });
  const bad = (rows, i = 0) => Race.cleanEvent(st, rows, undefined, i).code;
  assert.strictEqual(bad(finish(ents.slice(0, 3), H)), 'ot_gt_missing');
  assert.strictEqual(bad([...finish(['r0', 'r1'], H), { uid: 'r2', rank: 2, time: H }, { uid: 'r3', dnf: true }]), 'ot_race_rank_dup');
  assert.strictEqual(bad([...finish(['r0', 'r1', 'r2'], H, { r1: 5 }), { uid: 'r3', rank: 4, time: H }]), 'ot_gt_time_order');
  assert.strictEqual(bad(ents.map((uid) => ({ uid, dnf: true }))), 'ot_race_empty');
  const r = Race.cleanEvent(st, [...finish(['r0', 'r1', 'r2'], H, {}, { r0: { kom: 5, sp: 999, bs: -10 } }), { uid: 'r3', dnf: true }], undefined, 0);
  assert.deepStrictEqual(r.rows[0], { uid: 'r0', dnf: false, rank: 1, time: H, kom: 5, sp: 200, bs: -10 }, 'kẹp điểm nước rút');
  Race.recordEvent(st, 0, r.rows);
  assert.strictEqual(bad([...finish(['r0', 'r1', 'r2'], H), { uid: 'r3', rank: 4, time: H }], 1), 'ot_gt_out');
  assert.ok(Race.cleanEvent(st, finish(['r2', 'r1', 'r0'], H), undefined, 1).rows, 'người bỏ cuộc không cần có mặt ở chặng sau');
});

test('Bảng xếp hạng: giây thưởng, điểm xanh theo loại chặng, leo núi, trẻ, đồng đội, bỏ cuộc', () => {
  const { st, seedOf } = mk(7, { events: 3, kinds: ['flat', 'itt', 'mtn'] });
  const team = { r0: 'A', r1: 'A', r2: 'A', r3: 'B', r4: 'B', r5: 'B', r6: 'B' };
  const young = new Set(['r2', 'r5']);
  const rec = (i, rows) => { const r = Race.cleanEvent(st, rows, undefined, i); assert.ok(r.rows, r.code); Race.recordEvent(st, i, r.rows); };
  // Chặng 1 đồng bằng: về cùng nhóm; r3 thắng nước rút giữa chặng 20 điểm; r6 bỏ cuộc
  rec(0, [...finish(['r0', 'r1', 'r2', 'r3', 'r4', 'r5'], 4 * H, { r5: 30 }, { r3: { sp: 20 } }), { uid: 'r6', dnf: true }]);
  // Chặng 2 tính giờ: không có giây thưởng về đích; r4 bị phạt 20 giây
  rec(1, finish(['r2', 'r0', 'r1', 'r3', 'r4', 'r5'], H / 2, { r0: 5, r1: 9, r3: 12, r4: 15, r5: 40 }, { r4: { bs: -20 } }));
  // Chặng 3 núi: r1 thắng và giành 25 điểm leo núi
  rec(2, finish(['r1', 'r2', 'r0', 'r5', 'r3', 'r4'], 5 * H, { r2: 10, r0: 10, r5: 60, r3: 90, r4: 200 }, { r1: { kom: 25 }, r2: { kom: 8 } }));
  const C = GT.gtCalc(st, seedOf, (u) => team[u]);
  // Tổng: 9.5h + chênh lệch − giây thưởng. r0: 0+5+10 − (10+4) = 1; r1: 0+9+0 − (6+10) = −7; r2: 0+0+10 − (4+6) = 0
  const gap = (u) => (C.net(C.stats[u]) - 9.5 * H) / S;
  assert.deepStrictEqual(['r1', 'r2', 'r0'].map(gap), [-7, 0, 1]);
  assert.deepStrictEqual(C.gc.slice(0, 3), ['r1', 'r2', 'r0'], 'áo vàng: r1');
  assert.strictEqual(C.gc[6], 'r6', 'bỏ cuộc xếp cuối');
  assert.strictEqual(gap('r4'), 20 + 215, 'phạt 20 giây');
  // Xanh: chặng 1 bảng đồng bằng 50-30-20-18-16-14, chặng 2 (tính giờ) và 3 (núi) bảng 20-17-15-13-11-10
  assert.strictEqual(C.stats.r0.green, 50 + 17 + 15);
  assert.strictEqual(C.stats.r3.green, 18 + 20 + 13 + 11);
  assert.deepStrictEqual(C.green.slice(0, 2), ['r0', 'r1'], 'r0 82, r1 30 + 15 + 20 = 65');
  assert.deepStrictEqual(C.kom, ['r1', 'r2']);
  assert.ok(!C.active.includes('r6'));
  // Đồng đội: B mất r6 nhưng còn đủ 3 người; A = 3 người, B = r3 r4 r5
  assert.deepStrictEqual(C.teams.map((x) => [x.name, x.out]), [['A', false], ['B', false]]);
  // View: bảng chung kiểu 'time', bảng trẻ, người giữ áo sau từng chặng
  const v = Race.raceView(st, 0, 0, (u) => ({ uid: u, name: u }), seedOf, (u) => team[u], (u) => young.has(u));
  assert.deepStrictEqual([v.table[0].name, v.table[0].gap, v.table[1].gap, v.table[6].out], ['r1', 0, 7 * S, 1]);
  assert.deepStrictEqual(v.gt.young.map((x) => [x.name, x.gap]), [['r2', 0], ['r5', (gap('r5') - gap('r2')) * S]]);
  assert.deepStrictEqual(v.events[0].lead, { gc: 'r0', green: 'r0', kom: null, young: 'r2', team: 'A' });
  assert.deepStrictEqual([v.events[1].rows[0].bonus, v.events[0].rows[0].bonus, v.events[0].rows[5].gap], [0, 10, 30 * S]);
  assert.strictEqual(v.events[2].lead.gc, 'r1');
  assert.ok(v.entrants.find((p) => p.uid === 'r6').out && v.entrants.find((p) => p.uid === 'r2').young);
  // Đội còn dưới 3 người về đích thì rời bảng đội
  const { st: s2, seedOf: so2 } = mk(4, { events: 1 });
  Race.recordEvent(s2, 0, Race.cleanEvent(s2, [...finish(['r0', 'r1', 'r2'], H), { uid: 'r3', dnf: true }], undefined, 0).rows);
  assert.deepStrictEqual(GT.gtCalc(s2, so2, (u) => (u === 'r0' ? 'C' : 'D')).teams.map((x) => [x.name, x.out]), [['C', true], ['D', true]]);
  // Không bật giây thưởng
  const { st: s3, seedOf: so3 } = mk(2, { events: 1, bonus: false });
  Race.recordEvent(s3, 0, Race.cleanEvent(s3, finish(['r1', 'r0'], H), undefined, 0).rows);
  assert.strictEqual(GT.gtCalc(s3, so3, null).stats.r1.bonus, 0);
});

test('Mẫu Tour de France qua máy chủ: cột trẻ, nhập lần lượt, chỉ huỷ chặng sau cùng, bục trao giải theo áo vàng', async () => {
  const org = await account();
  const tpl = TP.byId('tour_de_france');
  assert.deepStrictEqual([tpl.n, tpl.stages[0].kinds.length], [184, 21]);
  const spec = TP.specOf(tpl, SPORTS);
  spec.stages[0].events = 3; spec.stages[0].kinds = spec.stages[0].kinds.slice(3, 6); // 3 chặng: đồi, tính giờ, đồi
  const teams = TP.sampleTeams({ ...tpl, n: 16 }, 'Tay đua');
  assert.strictEqual(teams[7], 'Tay đua 8 |  | Tay đua A | U25');
  const { id } = await org.req({ t: 'otCreate', name: 'Vòng quanh', spec, teams }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  assert.deepStrictEqual([t.sport, t.players.filter((p) => p.young).length, t.players[0].team], ['cycling', 2, 'Tay đua A']);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const st = t.st[0], ents = st.entrants;
  // Nhập chặng 2 trước chặng 1 → lỗi
  const e1 = await org.req({ t: 'otRace', id, event: 1, rows: finish(ents, H) }, 'error');
  assert.strictEqual(e1.code, 'ot_gt_seq');
  // Chặng 1: người cuối danh sách bỏ cuộc; người đầu thắng
  org.send({ t: 'otRace', id, event: 0, rows: [...finish(ents.slice(0, 15), 4 * H), { uid: ents[15], dnf: true }] });
  await until(() => st.events[0].done);
  org.send({ t: 'otRace', id, event: 1, rows: finish([...ents.slice(0, 15)].reverse(), H, Object.fromEntries(ents.slice(0, 15).reverse().map((u, k) => [u, k]))) });
  await until(() => st.events[1].done);
  const e2 = await org.req({ t: 'otRaceUndo', id, event: 0 }, 'error');
  assert.strictEqual(e2.code, 'ot_gt_undo_last');
  const v = await org.req({ t: 'otGet', id }, 'ot');
  const sv = v.tour.stageViews[0];
  assert.ok(sv.gt && sv.gt.teams.length === 2 && sv.gt.young.length === 1 && sv.table[15].out === 1 && v.tour.players.some((p) => p.young), 'view có các bảng phụ (tay đua trẻ thứ hai đã bỏ cuộc)');
  org.send({ t: 'otRace', id, event: 2, rows: finish([...ents.slice(1, 15), ents[0]], 4 * H, { [ents[0]]: 120 }) });
  await until(() => t.status === 'finished');
  // Người thứ 2: chậm 13 giây ở chặng tính giờ nhưng được thưởng 6 + 10 giây (nhì chặng 1, nhất chặng 3) → áo vàng
  // (người thứ 15 thắng tính giờ nhưng không có giây thưởng; người đầu mất 120 giây ở chặng 3)
  assert.deepStrictEqual(t.podium.slice(0, 2), [ents[1], ents[14]]);
  org.close();
});
