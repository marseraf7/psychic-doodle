/*
 * Đợt 23 – bảng GSL không loại ai + gauntlet chéo bảng + nhãn đích ra ngoài giải (kiểu BLAST Premier Groups), pool loại kép
 * xếp tầng (kiểu EVO), lobby xếp lại theo bảng điểm + chung kết match point (kiểu TFT), draft điểm hạ cánh + cấm Legend (kiểu
 * ALGS). Chỉ mô phỏng thể thức.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Race = require('../src/hub/stages-race.js');
const LOB = require('../src/hub/stages-race-lobby.js');
const Pools = require('../src/hub/stages-pools.js');
const G = require('../../caro/otour-graph.js');
const E = require('../../caro/tour-estimate.js');
const TP = require('../../caro/otour-templates.js');
const IO = require('../../caro/otour-spec-io.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const Spec = require('../src/hub/otour-spec.js');
const { until } = require('./otour-client.js');
const { startTpl, playAllServer } = require('./otour-tplrun.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const ids = (n) => Array.from({ length: n }, (_, i) => 'u' + i);
const seedOf = (u) => Number(u.slice(1)) + 1;

test('GSL không loại ai: mọi hạng trong bảng đều có đích; nhãn đích ra ngoài giải chỉ ở giai đoạn giữa', () => {
  const [g, x, f] = off([{ type: 'gsl', bestOf: 3, eliminates: false, routes: [{ n: 1, to: 2 }] }, { type: 'graph', shape: 'cross9', advance: 3, exit: 'Showdown <b>' }, { type: 'single', exit: 'X' }]);
  assert.deepStrictEqual([g.keepAll, g.advance], [true, 4]);
  assert.strictEqual(x.exit, 'Showdown b', 'nhãn đã lọc ký tự HTML');
  assert.strictEqual(f.exit, undefined, 'giai đoạn cuối không có nhãn đích');
  const [g2] = off([{ type: 'gsl', eliminates: false }]);
  assert.ok(!g2.keepAll, 'GSL cuối giải: luôn chia 2 người đi tiếp');
});

test('Gauntlet chéo bảng 9 đội: 6 trận, hạng 3 bảng này gặp hạng 4 bảng kế, đội thắng gặp hạng 2 bảng còn lại', () => {
  const g = G.make('cross9', 9, {});
  assert.strictEqual(g.ms.length, 6);
  assert.strictEqual(G.make('cross9', 8, {}), null);
  // Hạt giống: 1–3 hạng 2 (bảng A, B, C), 4–6 hạng 3, 7–9 hạng 4 – mỗi tầng xếp theo bảng
  const groupOf = { s1: 2, s2: 0, s3: 1, s4: 1, s5: 2, s6: 0, s7: 0, s8: 2, s9: 1 };
  const grp = (u) => groupOf[u];
  const [c] = off([{ type: 'graph', shape: 'cross9', bestOf: 3 }]);
  const st = ST.buildStage(c, 0, ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'], { seedOf: (u) => Number(u.slice(1)), groupOf });
  const ms = Object.values(st.matches);
  const r1 = ms.filter((m) => m.round === 0), r2 = ms.filter((m) => m.round === 1);
  assert.strictEqual(r1.length, 3);
  for (const m of r1) assert.notStrictEqual(grp(m.a), grp(m.b), 'vòng 1 khác bảng');
  // Người thắng vòng 1 gặp hạng 2 của bảng thứ ba (không phải bảng của hai đội vòng 1)
  for (const m of r1) {
    const to = st.matches[m.next.to];
    const third = [0, 1, 2].find((x) => x !== grp(m.a) && x !== grp(m.b));
    assert.strictEqual(grp(to.a), third, 'hạng 2 ở bảng còn lại');
  }
  assert.ok(r2.every((m) => m.wp === 1 && m.lp === 4) && r1.every((m) => m.lp === 7));
});

test('BLAST Groups qua máy chủ: nhất bảng vào thẳng Finals, gauntlet chéo bảng, đội thua mang nhãn "Showdown"', async () => {
  const { org, t, id, so } = await startTpl('blast_groups');
  await playAllServer(org, t, id, so, null, 1);
  assert.strictEqual(t.stage, 1);
  const x = t.st[1];
  assert.strictEqual(x.entrants.length, 9, 'hạng 2–4 của 3 bảng');
  await playAllServer(org, t, id, so, null, 2);
  assert.strictEqual(t.stage, 2);
  assert.strictEqual(t.st[2].entrants.length, 6, '3 nhất bảng + 3 đội thắng gauntlet');
  const outs = t.players.filter((p) => p.out === 'exit');
  assert.strictEqual(outs.length, 6);
  assert.ok(outs.every((p) => p.exit === 'Showdown'));
  const tour = (await org.req({ t: 'otGet', id }, 'ot', (m) => m.id === id && m.tour)).tour;
  assert.strictEqual(tour.stageViews[1].table.filter((r) => r.exit === 'Showdown').length, 6, 'bảng hạng ghi đích');
  assert.strictEqual(tour.players.filter((p) => p.exit === 'Showdown').length, 6);
  await playAllServer(org, t, id, so);
  assert.strictEqual(t.status, 'finished');
  org.close();
});

test('Pool loại kép kiểu EVO: chia rắn, cắt nhánh tới khi còn `out` người mỗi phía; ước tính khớp máy chủ', () => {
  const [c, d] = off([{ type: 'pools', pool: 16, out: 2, bestOf: 3 }, { type: 'double' }]);
  assert.deepStrictEqual([c.type, c.pool, c.out], ['pools', 16, 2]);
  assert.deepStrictEqual(Pools.error(c, 64), null);
  assert.strictEqual(Pools.error({ ...c, pool: 8, out: 4 }, 16).code, 'ot_pools_few');
  assert.strictEqual(off([{ type: 'pools', pool: 16, out: 2 }])[0].type, 'single', 'ở cuối giải thành loại trực tiếp');
  const st = ST.buildStage(c, 0, ids(64), { seedOf });
  assert.strictEqual(st.groups.length, 4);
  assert.strictEqual(Object.keys(st.matches).length, 104);
  const est = E.estimate({ players: 64, stages: [c, d] });
  assert.strictEqual(est.stages[0].matches, 104);
  // Mỗi pool có đúng một hạt giống 1–4 (chia rắn)
  for (const g of st.groups) {
    const us = new Set(g.rounds.flat().flatMap((mid) => [st.matches[mid].a, st.matches[mid].b]).filter(Boolean));
    assert.strictEqual(['u0', 'u1', 'u2', 'u3'].filter((u) => us.has(u)).length, 1);
  }
  assert.ok(d);
});

test('EVO qua máy chủ: 8 suất nhánh thắng + 8 suất nhánh thua; người mang 1 trận thua thua ở nhánh thắng là bị loại', async () => {
  const { org, t, id, so } = await startTpl('evo_pools');
  await playAllServer(org, t, id, so, null, 1);
  assert.strictEqual(t.stage, 1);
  const st = t.st[1];
  assert.strictEqual(st.entrants.length, 16);
  assert.strictEqual(st.oneLife.length, 8);
  // Người mang 1 trận thua: thua trận nhánh thắng → bị loại (không xuống nhánh thua)
  const m = Object.values(st.matches).find((x) => !x.lb && !x.done && x.a && x.b && (st.oneLife.includes(x.a) || st.oneLife.includes(x.b)));
  const L = st.oneLife.includes(m.a) ? m.a : m.b, W = L === m.a ? m.b : m.a;
  org.send({ t: 'otScore', id, match: m.id, sets: L === m.a ? [[1, 3], [1, 3], [1, 3]] : [[3, 1], [3, 1], [3, 1]] });
  await until(() => m.done);
  assert.strictEqual(m.winner, W);
  assert.ok(!Object.values(st.matches).some((x) => x.lb && (x.a === L || x.b === L)), 'không xuống nhánh thua');
  assert.ok(ST.eliminated(st, L), 'đã bị loại');
  const tour = (await org.req({ t: 'otGet', id }, 'ot', (x) => x.id === id && x.tour)).tour;
  assert.strictEqual(tour.stageViews[1].oneLife.length, 8);
  assert.strictEqual(tour.stageViews[0].groups.length, 4);
  await playAllServer(org, t, id, so);
  assert.strictEqual(t.status, 'finished');
  org.close();
});

test('Lobby xếp lại theo bảng điểm (TFT): sau mỗi 2 trận, các lobby chia rắn theo thứ hạng hiện tại', () => {
  const [c] = off([{ type: 'race', events: 6, score: 'points', table: [8, 7, 6, 5, 4, 3, 2, 1], heat: 8, reseed: 2 }]);
  assert.strictEqual(c.reseed, 2);
  assert.strictEqual(off([{ type: 'race', events: 6, score: 'points', reseed: 2 }])[0].reseed, undefined, 'không chia lượt thì bỏ');
  const st = ST.buildStage(c, 0, ids(16), { seedOf });
  const before = st.events[2].heats.map((h) => h.uids.slice().sort());
  // Đấu 2 trận: thứ hạng ngược hạt giống (người hạt giống thấp thắng)
  for (const i of [0, 1]) st.events[i].heats.forEach((h, k) => {
    const rows = h.uids.slice().sort((a, b) => seedOf(b) - seedOf(a)).map((uid, j) => ({ uid, rank: j + 1 }));
    const r = Race.cleanEvent(st, rows, h.uids, i);
    assert.ok(!r.code, JSON.stringify(r));
    Race.recordHeat(st, i, k, r.rows);
  });
  const order = Race.raceTable(st, seedOf).list;
  const after = st.events[2].heats.map((h) => h.uids);
  assert.notDeepStrictEqual(after.map((x) => x.slice().sort()), before, 'đã chia lại');
  assert.deepStrictEqual(st.events[3].heats.map((h) => h.uids), after, 'cả khối giữ nguyên lobby');
  // Chia rắn: hạng 1 và hạng 2 ở hai lobby khác nhau
  const lobbyOf = (u) => after.findIndex((x) => x.includes(u));
  assert.notStrictEqual(lobbyOf(order[0]), lobbyOf(order[1]));
});

test('TFT qua máy chủ: 40 → 32 → 24 → 16 → 8 (mang điểm), chung kết match point', async () => {
  const { org, t, id } = await startTpl('tft_crown');
  const so = ctx().app.hub.otSeedOf(t);
  for (let g = 0; t.status === 'running' && g < 300; g++) {
    const st = t.st[t.stage], ev = st.events.find((e) => !e.done);
    if (ev.heats) {
      const k = ev.heats.findIndex((h) => !h.done);
      const rows = ev.heats[k].uids.slice().sort((a, b) => so(a) - so(b)).map((uid, j) => ({ uid, rank: j + 1 }));
      org.send({ t: 'otRace', id, event: ev.i, heat: k, rows });
      await until(() => ev.heats[k].done, 8000);
    } else {
      const rows = Race.lobby(st, ev.i).slice().sort((a, b) => so(a) - so(b)).map((uid, j) => ({ uid, rank: j + 1 }));
      org.send({ t: 'otRace', id, event: ev.i, rows });
      await until(() => ev.done, 8000);
    }
  }
  assert.strictEqual(t.status, 'finished');
  assert.deepStrictEqual(t.st.map((s) => s.entrants.length), [40, 32, 24, 16, 8]);
  assert.strictEqual(t.podium[0], t.players[0].uid, 'hạt giống 1 luôn nhất lobby → vô địch');
  assert.ok(t.st[4].events.filter((e) => e.done).length < 12, 'chung kết kết thúc sớm khi đạt match point');
  org.close();
});

test('ALGS: Legend được chọn nhiều nhất bị cấm; hoà tần suất thì xét tổng lượt chọn; draft POI độc quyền', () => {
  const [c] = off([{ type: 'race', events: 4, score: 'points', table: [10, 6, 4, 2], kill: true, legendBan: true, poi: { order: 'snake', maps: [{ name: 'M<1>', pois: ['A', 'B', 'B', ''] }] } }]);
  assert.deepStrictEqual(c.poi, { order: 'snake', maps: [{ name: 'M1', pois: ['A', 'B'] }] });
  const st = ST.buildStage(c, 0, ids(4), { seedOf });
  const rec = (i, picks) => {
    const rows = ids(4).map((uid, k) => ({ uid, rank: k + 1, pick: picks[k] }));
    const r = Race.cleanEvent(st, rows, ids(4), i);
    if (r.code) return r;
    Race.recordEvent(st, i, r.rows);
    return null;
  };
  assert.strictEqual(rec(0, ['Bang', 'Bang', 'Wraith', 'Lifeline']), null);
  assert.deepStrictEqual(LOB.bansBefore(st, 1), [{ legend: 'Bang', ev: 0, n: 2 }]);
  const bad = rec(1, ['Bang', 'Wraith', 'Gibby', 'Horizon']);
  assert.deepStrictEqual(bad, { code: 'ot_legend_banned', args: { x: 'Bang' } });
  // Trận 2: Wraith và Gibby cùng 2 lượt – Wraith có tổng lượt cao hơn (3) nên chỉ Wraith bị cấm
  assert.strictEqual(rec(1, ['Wraith', 'Wraith', 'Gibby', 'Gibby']), null);
  assert.deepStrictEqual(LOB.bansBefore(st, 2).map((b) => b.legend), ['Bang', 'Wraith']);
  // POI
  assert.strictEqual(LOB.setPoi(st, 0, 'u0', 'A'), null);
  assert.strictEqual(LOB.setPoi(st, 0, 'u1', 'A'), 'ot_poi_taken');
  assert.strictEqual(LOB.setPoi(st, 0, 'u1', 'Z'), 'ot_poi_bad');
  assert.strictEqual(LOB.setPoi(st, 1, 'u1', 'A'), 'ot_poi_bad', 'bản đồ không có');
  assert.strictEqual(LOB.setPoi(st, 0, 'u0', null), null, 'bỏ chọn');
  assert.strictEqual(LOB.setPoi(st, 0, 'u1', 'A'), null);
});

test('ALGS qua máy chủ: ghi Legend, chặn Legend bị cấm, draft POI; trang xem có danh sách cấm và POI', async () => {
  const { org, t, id } = await startTpl('algs_pro');
  const so = ctx().app.hub.otSeedOf(t);
  const st = t.st[0], U = (n) => t.players[n - 1].uid;
  assert.ok(st.cfg.legendBan && st.cfg.poi.maps[0].pois.length === 20);
  org.send({ t: 'otPoi', id, map: 0, team: U(1), poi: 'POI 1' });
  await until(() => st.poi && st.poi[0] && st.poi[0][U(1)] === 'POI 1');
  const taken = await org.req({ t: 'otPoi', id, map: 0, team: U(2), poi: 'POI 1' }, 'error');
  assert.strictEqual(taken.code, 'ot_poi_taken');
  const legends = ['Bang', 'Wraith', 'Gibby', 'Horizon', 'Lifeline', 'Pathfinder']; // Bang 3 đội chọn, còn lại mỗi tên 1 đội
  const rowsOf = (i, pick) => Race.lobby(st, i).slice().sort((a, b) => so(a) - so(b)).map((uid, k) => ({ uid, rank: k + 1, kills: k % 4, pick: pick(k) }));
  org.send({ t: 'otRace', id, event: 0, rows: rowsOf(0, (k) => (k < 3 ? 'Bang' : legends[1 + (k % 5)] + k)) });
  await until(() => st.events[0].done);
  const bad = await org.req({ t: 'otRace', id, event: 1, rows: rowsOf(1, () => 'Bang') }, 'error');
  assert.strictEqual(bad.code, 'ot_legend_banned');
  for (let i = 1; i < 6; i++) {
    org.send({ t: 'otRace', id, event: i, rows: rowsOf(i, (k) => `L${i}-${k}`) });
    await until(() => st.events[i].done || t.status !== 'running');
  }
  assert.strictEqual(t.status, 'finished');
  const v = (await org.req({ t: 'otGet', id }, 'ot', (m) => m.id === id && m.tour)).tour.stageViews[0];
  assert.strictEqual(v.bans[0].legend, 'Bang');
  assert.strictEqual(v.poi[0].picks.length, 1);
  assert.strictEqual(v.poi[0].order.length, 20);
  org.close();
});

test('Mẫu đợt 23: lược đồ hợp lệ, mô tả bằng lời đủ khoá ở 4 ngôn ngữ', () => {
  for (const tid of ['blast_groups', 'evo_pools', 'tft_crown', 'algs_pro']) {
    const tpl = TP.byId(tid);
    assert.ok(tpl, tid);
    const spec = TP.specOf(tpl, SPORTS);
    const r = Spec.validate ? Spec.validate(spec) : null;
    assert.ok(!r || !r.code, tid + ': ' + JSON.stringify(r));
    assert.ok(IO.describeSpec(spec, (k) => k).length > 0);
  }
  // Hàm dịch giả: khoá + giá trị các biến (để thấy câu mô tả từng giai đoạn)
  const T = (k, a) => k + (a ? ' ' + Object.values(a).join(' ') : '');
  const d = (spec) => IO.describeSpec(spec, T).join(' ');
  assert.match(d(TP.specOf(TP.byId('blast_groups'), SPORTS)), /ds_gsl_keep.*ds_exit/);
  assert.match(d(TP.specOf(TP.byId('evo_pools'), SPORTS)), /ds_pools/);
  assert.match(d(TP.specOf(TP.byId('tft_crown'), SPORTS)), /ds_reseed/);
  assert.match(d(TP.specOf(TP.byId('algs_pro'), SPORTS)), /ds_poi.*ds_legend_ban/);
});

function ctx() { return require('./otour-client.js').ctx; }
