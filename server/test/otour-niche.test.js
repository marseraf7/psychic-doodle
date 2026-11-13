/*
 * Đợt 25 – loại trực tiếp dựng từng vòng (Snooker Shoot Out, BLAST Bounty + sổ bounty), poker PKO / Mystery (chỉ điểm thưởng),
 * Backyard Ultra, bridge đồng đội IMP → VP, pod kiểu Magic: The Gathering. Chỉ mô phỏng thể thức.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Race = require('../src/hub/stages-race.js');
const BT = require('../src/hub/stages-bounty.js');
const KN = require('../src/hub/stages-knock.js');
const PK = require('../src/hub/stages-poker.js');
const BR = require('../../caro/otour-bridge.js');
const E = require('../../caro/tour-estimate.js');
const TP = require('../../caro/otour-templates.js');
const IO = require('../../caro/otour-spec-io.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const { until } = require('./otour-client.js');
const { startTpl, playAllServer } = require('./otour-tplrun.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const ids = (n) => Array.from({ length: n }, (_, i) => 'u' + (i + 1));
const seedOf = (u) => Number(u.slice(1));
const side = (u) => ({ uid: u, name: u });

test('Sổ bounty: ví dụ Eternal Fire (20.000 → thắng 30.000, 63.750, 77.500 → thua chung kết) giữ 85.625; tổng bảo toàn', () => {
  const st = { cfg: { bounty: BT.normalize({}) }, rounds: [], matches: {} };
  st.bounty0 = Object.fromEntries(Object.entries({ EF: 20000, FAL: 30000, VIT: 60000, G2: 60000, Y: 0, Z: 15000, W: 20000, Q: 30000, CH: 60000, R: 0 }).map(([u, v]) => [u, v * 100]));
  const round = (list) => st.rounds.push(list.map(([w, l, fin], k) => { const id = 'm' + st.rounds.length + '_' + k; st.matches[id] = { id, done: true, winner: w, loser: l, ...(fin ? { final: true } : {}) }; return id; }));
  round([['Y', 'Z'], ['W', 'Q'], ['CH', 'R']]);
  round([['VIT', 'Y'], ['EF', 'FAL'], ['G2', 'W']]);
  round([['EF', 'VIT']]);
  round([['EF', 'G2']]);
  const C1 = BT.compute(st);
  assert.deepStrictEqual([C1.bank.EF, C1.head.EF, C1.head.VIT, C1.head.G2].map(BT.money), [85625, 105625, 0, 0]);
  round([['CH', 'EF', true]]);
  const C = BT.compute(st);
  assert.strictEqual(BT.money(C.bank.EF), 85625, 'thua chung kết vẫn giữ quỹ đã nhận');
  assert.strictEqual(BT.money(C.bank.CH), 60000 + 105625, 'vô địch nhận trọn bounty của cả hai');
  assert.ok(BT.balanced(st));
  assert.strictEqual(C.total, Object.values(st.bounty0).reduce((a, b) => a + b, 0));
});

test('BLAST Bounty: bounty khởi đầu 500.000 theo hạt giống, nồi dưới chọn nồi trên, 31 trận, chọn đối thủ trước khi vòng có kết quả', () => {
  const [c] = off([{ type: 'knock', mode: 'bounty' }]);
  const st = ST.buildStage(c, 0, ids(32), {});
  assert.strictEqual(Object.values(st.bounty0).reduce((a, b) => a + b, 0) / 100, 500000);
  assert.deepStrictEqual([st.bounty0.u4, st.bounty0.u5, st.bounty0.u12, st.bounty0.u16, st.bounty0.u17].map(BT.money), [60000, 30000, 20000, 15000, 0]);
  const r0 = st.rounds[0].map((id) => st.matches[id]);
  assert.deepStrictEqual([r0[0].a, r0[0].b, r0[15].a, r0[15].b], ['u16', 'u17', 'u1', 'u32'], 'mặc định hạt giống gần nhất (17 gặp 16 … 32 gặp 1)');
  // u17 chọn u1: đổi chỗ với đối thủ hiện tại của u1
  assert.strictEqual(KN.pick(st, 'u17', 'u1'), null);
  assert.deepStrictEqual([r0[0].a, r0[15].a], ['u1', 'u16']);
  assert.strictEqual(KN.pick(st, 'u1', 'u17'), 'ot_knock_pick_bad', 'đội nồi trên không chọn');
  ST.recordResult(st, r0[0], 'u17');
  assert.strictEqual(KN.pick(st, 'u18', 'u2'), 'ot_knock_pick_locked');
  for (let g = 0; !st.done && g < 60; g++) for (const m of ST.playable(st)) ST.recordResult(st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b);
  assert.ok(st.done);
  assert.strictEqual(Object.keys(st.matches).length, 31);
  assert.ok(BT.balanced(st));
  assert.strictEqual(BT.money(BT.compute(st).bank.u17), 30000, 'u17 thắng u1 (60.000) nhận 30.000');
  assert.strictEqual(E.estimate({ players: 32, stages: [c] }).stages[0].matches, 31);
});

test('Shoot Out: mỗi vòng bốc thăm lại (lưu từng lần bốc), số lẻ thì một người đi tiếp; huỷ trận khi vòng sau chưa đấu thì dựng lại vòng sau', () => {
  const [c] = off([{ type: 'knock', mode: 'shootout' }]);
  const st = ST.buildStage(c, 0, ids(10), {});
  assert.strictEqual(st.rounds[0].length, 5);
  for (const m of ST.playable(st)) ST.recordResult(st, m, m.a);
  assert.strictEqual(st.rounds.length, 2);
  assert.strictEqual(st.rounds[1].length, 2);
  assert.ok(st.byes[1], 'số lẻ: một người đi tiếp không đấu');
  assert.strictEqual(st.draws.length, 2);
  // Huỷ một trận vòng 1 khi vòng 2 chưa đấu: vòng 2 bị xoá
  const m0 = st.matches[st.rounds[0][0]];
  assert.ok(KN.beforeUndo(st, m0));
  assert.strictEqual(st.rounds.length, 1);
  Object.assign(m0, { done: false, winner: null, loser: null });
  ST.recordResult(st, m0, m0.b);
  assert.strictEqual(st.rounds.length, 2);
  assert.ok(st.alive.includes(m0.b) && !st.alive.includes(m0.a));
  // Vòng sau đã có kết quả: khoá
  ST.recordResult(st, ST.playable(st)[0], ST.playable(st)[0].a);
  assert.strictEqual(KN.beforeUndo(st, m0), false);
  for (let g = 0; !st.done && g < 20; g++) for (const m of ST.playable(st)) ST.recordResult(st, m, m.a);
  assert.ok(st.done);
  assert.strictEqual(KN.places(st).filter((x) => x.place === 1).length, 1);
  assert.strictEqual(off([{ type: 'knock' }])[0].mode, 'shootout');
  assert.strictEqual(KN.error({ type: 'knock' }, 1).code, 'ot_knock_few');
});

test('Backyard Ultra: người cuối phải chạy thêm một vòng một mình; cả vòng không ai về kịp → không có nhà vô địch; huỷ vòng sau cùng', () => {
  const [c] = off([{ type: 'race', score: 'backyard' }]);
  const st = ST.buildStage(c, 0, ['a', 'b', 'c'], {});
  const yard = (done, s = st) => { const i = s.events.findIndex((e) => !e.done); const r = Race.cleanEvent(s, done.map((u) => ({ uid: u, done: true })), s.entrants, i); assert.ok(!r.code); Race.recordEvent(s, i, r.rows); };
  yard(['a', 'b', 'c']); yard(['a', 'b']); yard(['a']);
  assert.ok(!st.done, 'chỉ còn một người: chưa vô địch');
  assert.strictEqual(Race.cleanEvent(st, [{ uid: 'b', done: true }], st.entrants, 3).code, 'tour_score_bad', 'người đã dừng không nhập được');
  yard(['a']);
  assert.deepStrictEqual([st.done, st.backyard.status, st.backyard.winner], [true, 'champion', 'a']);
  const v = Race.raceView(st, 0, 0, side, () => 0);
  assert.deepStrictEqual(v.table.map((x) => [x.name, x.yards, x.rank]), [['a', 4, 1], ['b', 2, 2], ['c', 1, 3]]);
  Race.undoEvent(st, 3);
  assert.ok(!st.done && st.events.length === 4);
  // Không ai về kịp ở vòng một mình
  const s2 = ST.buildStage(c, 0, ['a', 'b'], {});
  yard(['a'], s2);
  const i = s2.events.findIndex((e) => !e.done);
  Race.recordEvent(s2, i, Race.cleanEvent(s2, [{ uid: 'a', done: false }], s2.entrants, i).rows);
  assert.deepStrictEqual([s2.done, s2.backyard.status], [true, 'none']);
});

test('Poker PKO: nhận ngay 50%, 50% cộng vào bounty; vô địch nhận bounty của mình; tổng bảo toàn; Mystery rút phong bì sau mốc kích hoạt', () => {
  const [c] = off([{ type: 'race', score: 'poker', poker: { type: 'pko', start: 100 } }]);
  const st = ST.buildStage(c, 0, ['a', 'b', 'c', 'd'], {});
  const bust = (rows) => { const i = st.events.findIndex((e) => !e.done); const r = Race.cleanEvent(st, rows, st.entrants, i); if (r.code) return r.code; Race.recordEvent(st, i, r.rows); return null; };
  assert.strictEqual(bust([{ uid: 'd', by: 'd' }]), 'ot_poker_by');
  assert.strictEqual(bust([{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }, { uid: 'd' }]), 'ot_poker_all');
  assert.strictEqual(bust([{ uid: 'd', by: 'a' }]), null);
  assert.strictEqual(bust([{ uid: 'c', by: 'b' }, { uid: 'b', by: 'a' }]), 'ot_poker_by', 'người loại không được bị loại cùng ván');
  assert.strictEqual(bust([{ uid: 'c', by: 'b' }]), null);
  assert.strictEqual(bust([{ uid: 'b', by: 'a' }]), null);
  assert.ok(st.done);
  const C = PK.calc(st);
  assert.deepStrictEqual([C.bank.a, C.bank.b, C.head.a].map((x) => x / 100), [350, 50, 0]);
  assert.strictEqual(Object.values(C.bank).reduce((a, b) => a + b, 0) / 100, 400);
  assert.deepStrictEqual(Race.raceTable(st, () => 0).list, ['a', 'b', 'c', 'd']);
  Race.undoEvent(st, 2);
  assert.ok(!st.done);
  // Mystery: còn 3 người thì mỗi lần loại rút một phong bì; giá trị ẩn trong cfg gửi trình duyệt
  const [m] = off([{ type: 'race', score: 'poker', poker: { type: 'mystery', act: 3, envelopes: [10, 20, 30] } }]);
  const ms = ST.buildStage(m, 0, ['a', 'b', 'c', 'd'], {});
  assert.ok(ms.pokerSeed > 0);
  for (const [k, r] of [[0, { uid: 'd', by: 'a' }], [1, { uid: 'c', by: 'a' }], [2, { uid: 'b', by: 'a' }]]) Race.recordEvent(ms, k, Race.cleanEvent(ms, [r], ms.entrants, k).rows);
  const v = Race.raceView(ms, 0, 0, side, () => 0);
  assert.strictEqual(v.poker.draws.length, 2);
  assert.strictEqual(v.poker.left, 1);
  assert.strictEqual(v.cfg.poker.envelopes, undefined, 'không lộ danh sách phong bì');
  assert.ok([10, 20, 30].includes(v.poker.draws[0].amount));
});

test('Bridge: bảng IMP (30 → 1, 450 → 10, 4200 → 24), VP thang 20 WBF (hoà 10–10, tổng luôn 20,00), ván bỏ trống không tính', () => {
  assert.deepStrictEqual([BR.imp(10), BR.imp(30), BR.imp(450), BR.imp(4200), BR.imp(-620)], [0, 1, 10, 24, -12]);
  assert.deepStrictEqual([BR.vpWbf(0, 16), BR.vpWbf(1, 16), BR.vpWbf(60, 16), BR.vpWbf(300, 16)], [1000, 1031, 2000, 2000]);
  const R = BR.result([[420, -50], [100, 100], null], 16);
  assert.deepStrictEqual([R.impA, R.impB, R.played, R.vpA + R.vpB], [10, 0, 2, 20]);
  const T = BR.result([[100, 100]], 16);
  assert.deepStrictEqual([T.vpA, T.vpB], [10, 10]);
  for (let m = 0; m < 80; m++) { const w = BR.vpWbf(m, 24); assert.ok(w >= 1000 && w <= 2000 && (2000 - w) >= 0); }
  assert.strictEqual(BR.cleanBoards([[10, 20], [15, 0]], 16).code, 'ot_bridge_score');
  assert.strictEqual(BR.cleanBoards([null, [10]], 16).code, 'ot_bridge_empty');
  assert.deepStrictEqual(BR.cleanBoards([[0, 0]], 2).list, [[0, 0], null], 'nhập 0 khác bỏ trống');
  const [c] = off([{ type: 'roundrobin', boards: 16, vpTable: [[0, 10], [5, 12], [20, 20]] }]);
  assert.deepStrictEqual([c.boards, c.bestOf, c.vpTable.length], [16, 1, 3]);
  assert.deepStrictEqual(BR.result([[620, 0]], 16, c.vpTable), { impA: 12, impB: 0, vpA: 12, vpB: 8, played: 1 });
});

test('Pod: ghép cặp trong pod 8 người, đổi pod theo bảng xếp hạng sau 3 vòng, pod cuối thiếu gộp vào pod trước', () => {
  const P = require('../src/hub/stages-pairing.js');
  assert.deepStrictEqual(P.makePods(ids(20), 8).map((p) => p.length), [8, 12]);
  assert.deepStrictEqual(P.makePods(ids(22), 8).map((p) => p.length), [8, 8, 6]);
  const [c] = off([{ type: 'swiss', rounds: 6, pod: { size: 8, rounds: 3 } }]);
  const st = ST.buildStage(c, 0, ids(32), { seedOf });
  for (let g = 0; !st.done && g < 10; g++) for (const m of ST.playable(st)) ST.recordResult(st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf });
  assert.ok(st.done);
  for (const [b, rs] of [[0, [0, 1, 2]], [1, [3, 4, 5]]]) {
    const podOf = new Map(st.podHist[b].flatMap((p, k) => p.map((u) => [u, k])));
    for (const r of rs) for (const id of st.rounds[r]) { const m = st.matches[id]; if (m.a && m.b && !m.bye) assert.strictEqual(podOf.get(m.a), podOf.get(m.b), `vòng ${r + 1} cùng pod`); }
  }
  assert.notDeepStrictEqual(st.podHist[0], st.podHist[1]);
});

test('Các mẫu đợt 25 chạy trọn qua máy chủ (BLAST Bounty, Shoot Out, poker, Backyard, bridge)', async () => {
  for (const tid of ['blast_bounty', 'snooker_shootout']) { // mtg_gp (bắt buộc nộp danh sách bài) chạy ở otour-extra.test.js
    const { org, t, id, so } = await startTpl(tid);
    await playAllServer(org, t, id, so);
    assert.strictEqual(t.status, 'finished', tid);
    if (tid === 'blast_bounty') {
      assert.ok(BT.balanced(t.st[0]));
      const v = (await org.req({ t: 'otGet', id }, 'ot', (x) => x.id === id && x.tour)).tour.stageViews[0];
      assert.strictEqual(v.bounty.teams.reduce((a, x) => a + x.total, 0), 500000);
      assert.strictEqual(v.bounty.teams[0].uid, t.podium[0], 'vô địch nhận nhiều nhất');
    }
    org.close();
  }
  // Bridge: đội ô trên luôn hơn 620 điểm ván 1 → 12 IMP
  {
    const { org, t, id, so } = await startTpl('bridge_teams');
    await playAllServer(org, t, id, so, (st, m) => ({ boards: [so(m.a) < so(m.b) ? [620, 0] : [0, 620]] }));
    assert.strictEqual(t.status, 'finished');
    const tab = ST.standings(t.st[0], so)[0];
    const total = Object.values(tab.stats).reduce((a, s) => a + s.pts, 0);
    assert.ok(Math.abs(total - 45 * 20) < 1e-6, 'tổng VP = 20 × số trận');
    assert.strictEqual(tab.list[0], t.players[0].uid);
    org.close();
  }
  // Poker, Backyard: nhập qua otRace
  for (const tid of ['poker_pko', 'poker_mystery', 'backyard_ultra']) {
    const { org, t, id, so } = await startTpl(tid);
    for (let g = 0; t.status === 'running' && g < 80; g++) {
      const st = t.st[0], ev = st.events.find((e) => !e.done);
      const v = (await org.req({ t: 'otGet', id }, 'ot', (x) => x.id === id && x.tour)).tour.stageViews[0];
      const alive = (v.poker ? v.poker.alive : v.backyard.alive).map((p) => p.uid).sort((a, b) => so(a) - so(b));
      const rows = v.poker ? [{ uid: alive[alive.length - 1], by: alive[0] }] : alive.map((uid, k) => ({ uid, done: k === 0 || g < 3 }));
      org.send({ t: 'otRace', id, event: ev.i, rows });
      await until(() => ev.done, 8000);
    }
    assert.strictEqual(t.status, 'finished', tid);
    assert.strictEqual(t.podium[0], t.players[0].uid, tid + ': hạt giống 1 vô địch');
    org.close();
  }
});

test('Mẫu đợt 25: mô tả bằng lời', () => {
  const T = (k, a) => k + (a ? ' ' + Object.values(a).join(' ') : '');
  const d = (tid) => IO.describeSpec(TP.specOf(TP.byId(tid), SPORTS), T).join(' ');
  assert.match(d('blast_bounty'), /ds_knock_bounty 50/);
  assert.match(d('snooker_shootout'), /ds_knock_shootout/);
  assert.match(d('poker_pko'), /ds_pk_pko 100 50/);
  assert.match(d('poker_mystery'), /ds_pk_mystery 9/);
  assert.match(d('backyard_ultra'), /ds_backyard 6.706 60/);
  assert.match(d('bridge_teams'), /ds_bridge 16/);
  assert.match(d('mtg_gp'), /ds_pod 8 3/);
});
