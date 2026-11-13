/*
 * Đợt 24 – golf chấm điểm Stableford (chuẩn / Modified, handicap), omnium xe đạp lòng chảo, mass start trượt băng tốc độ,
 * đuổi bắt kiểu biathlon (xuất phát theo khoảng thua), The Split (chia đôi nhóm trên / dưới, mang thành tích). Chỉ mô phỏng thể thức.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Race = require('../src/hub/stages-race.js');
const SF = require('../src/hub/stages-golf-stable.js');
const MS = require('../src/hub/stages-massstart.js');
const PUR = require('../src/hub/stages-pursuit.js');
const E = require('../../caro/tour-estimate.js');
const TP = require('../../caro/otour-templates.js');
const IO = require('../../caro/otour-spec-io.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const { ctx, until } = require('./otour-client.js');
const { startTpl, playAllServer } = require('./otour-tplrun.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const ids = (n) => Array.from({ length: n }, (_, i) => 'u' + i);
const seedOf = (u) => Number(u.slice(1)) + 1;
const side = (u) => ({ uid: u, name: u });
const rec = (st, i, rows) => { const r = Race.cleanEvent(st, rows, st.entrants, i); assert.ok(!r.code, JSON.stringify(r)); Race.recordEvent(st, i, r.rows); };

test('Stableford: bảng mặc định, ép nhập từng lỗ, handicap theo chỉ số khó; Modified cho điểm âm; nhiều điểm xếp trên', () => {
  const [c] = off([{ type: 'race', score: 'golf', events: 1, scoring: 'modified', input: 'round', par: [4, 4, 3, 5], handicap: { si: [2, 1, 4, 3] } }]);
  assert.deepStrictEqual([c.input, c.points, c.handicap.si], ['hole', { alb: 8, eagle: 5, birdie: 2, par: 0, bogey: -1, dbl: -3 }, [2, 1, 4, 3]]);
  const [d] = off([{ type: 'race', score: 'golf', scoring: 'stableford', par: [4, 4], points: { eagle: 9 }, handicap: { si: [1, 1] } }]);
  assert.deepStrictEqual([d.points.eagle, d.points.par, d.handicap.si], [9, 2, [1, 2]], 'bảng thiếu mức lấy mặc định; chỉ số khó sai thì theo thứ tự lỗ');
  // Handicap 20 trên 18 lỗ: 1 gậy mọi lỗ + thêm 1 gậy ở 2 lỗ khó nhất
  const cfg18 = { par: Array(18).fill(4), handicap: { si: Array.from({ length: 18 }, (_, k) => 18 - k) } };
  assert.deepStrictEqual([SF.received(cfg18, 20, 17), SF.received(cfg18, 20, 16), SF.received(cfg18, 20, 15)], [2, 2, 1]);
  const st = ST.buildStage(c, 0, ['a', 'b', 'c', 'd'], {});
  rec(st, 0, [{ uid: 'a', h: [3, 4, 3, 5] }, { uid: 'b', h: [4, 4, 3, 5] }, { uid: 'c', h: [6, 4, 3, 5], hcp: 2 }, { uid: 'd', h: [7, 7, 6, 8] }]);
  const v = Race.raceView(st, 0, 0, side, () => 0);
  // a: birdie +2; c: hcp 2 → lỗ 1 (bogey net −1), lỗ 2 (birdie net +2) = 1; b: 0; d: 4 × double bogey = −12
  assert.deepStrictEqual(v.table.map((x) => [x.name, x.pts]), [['a', 2], ['c', 1], ['b', 0], ['d', -12]]);
  assert.strictEqual(v.table[0].toPar, -1, 'vẫn hiện số gậy so với par');
  // Giải đấu gậy cũ (không có scoring) chạy y như trước
  const [old] = off([{ type: 'race', score: 'golf', events: 1, par: [4, 4] }]);
  assert.ok(!old.scoring && old.input === 'round');
});

test('Stableford: cắt sau vòng 2 theo điểm (top + đồng hạng)', () => {
  const [c] = off([{ type: 'race', score: 'golf', events: 3, scoring: 'stableford', par: [4, 4], cut: { after: 1, top: 2 } }]);
  const st = ST.buildStage(c, 0, ['a', 'b', 'c', 'd'], {});
  rec(st, 0, [{ uid: 'a', h: [3, 3] }, { uid: 'b', h: [4, 3] }, { uid: 'c', h: [4, 3] }, { uid: 'd', h: [5, 5] }]);
  const v = Race.raceView(st, 0, 0, side, () => 0);
  assert.strictEqual(v.golf.cutLine, 5, 'vạch cắt tính bằng điểm');
  assert.deepStrictEqual(v.table.filter((x) => x.cut).map((x) => x.name), ['d']);
});

test('Omnium: 4 đua con, điểm theo hạng + sprint + vòng (có thể âm); bảng điểm thiếu thì báo lỗi; nhập lần lượt', () => {
  const [c] = off([{ type: 'race', score: 'omnium', events: 9 }]);
  assert.strictEqual(c.events, 4);
  assert.strictEqual(Race.raceError(c, 21).code, 'ot_omnium_ranks');
  assert.strictEqual(Race.raceError(c, 20), null);
  const st = ST.buildStage(c, 0, ids(4), {});
  for (let i = 0; i < 3; i++) rec(st, i, ids(4).map((uid, k) => ({ uid, rank: k + 1 })));
  // Points race: u3 hơn 1 vòng + 10 điểm sprint vượt lên; u0 kém 3 vòng → âm
  rec(st, 3, [{ uid: 'u0', rank: 4, sp: 0, lap: -3 }, { uid: 'u1', rank: 2, sp: 5 }, { uid: 'u2', rank: 3, sp: 0 }, { uid: 'u3', rank: 1, sp: 10, lap: 1 }]);
  const v = Race.raceView(st, 0, 0, side, seedOf);
  assert.deepStrictEqual(v.table.map((x) => [x.name, x.total]), [['u3', 132], ['u1', 119], ['u0', 60], ['u2', 108]].sort((a, b) => b[1] - a[1]));
  assert.ok(v.omnium && st.done);
  assert.strictEqual(v.table.find((x) => x.name === 'u0').parts[3], -60);
  // Trùng hạng bị từ chối
  const st2 = ST.buildStage(c, 0, ids(3), {});
  assert.strictEqual(Race.cleanEvent(st2, [{ uid: 'u0', rank: 1 }, { uid: 'u1', rank: 1 }], st2.entrants, 0).code, 'ot_race_rank');
});

test('Mass start: bán kết chia rắn, người đầu mỗi lượt vào chung kết; người về thứ 10 thắng cả 3 mốc xếp trên người về thứ 5', () => {
  const [c] = off([{ type: 'race', score: 'massstart', massStart: { semis: true, heat: 6, adv: 3 } }]);
  assert.strictEqual(c.events, 2);
  const st = ST.buildStage(c, 0, ids(12), {});
  const H = MS.heatsOf(st);
  assert.deepStrictEqual(H.map((h) => h.length), [6, 6]);
  assert.ok(H[0].includes('u0') && H[1].includes('u1') && H[1].includes('u2') && H[0].includes('u3'), 'chia rắn');
  // Điểm giữa đua quá mức bị từ chối (3 mốc × 3 = 9)
  assert.deepStrictEqual(Race.cleanEvent(st, [{ uid: 'u0', rank: 1, ip: 10 }], st.entrants, 0), { code: 'ot_ms_ip', args: { n: 9 } });
  // Trùng thứ tự trong cùng lượt bị từ chối; khác lượt thì được
  assert.strictEqual(Race.cleanEvent(st, [{ uid: H[0][0], rank: 1 }, { uid: H[0][1], rank: 1 }], st.entrants, 0).code, 'ot_race_rank');
  rec(st, 0, H.flatMap((h) => h.map((uid, k) => ({ uid, rank: k + 1 }))));
  const q = MS.qualifiers(st);
  assert.deepStrictEqual(q, [...H[0].slice(0, 3), ...H[1].slice(0, 3)]);
  assert.strictEqual(Race.cleanEvent(st, [{ uid: H[0][5], rank: 1 }], st.entrants, 1).code, 'tour_score_bad', 'người không vào chung kết');
  // Chung kết: người về thứ 6 (q[5]) thắng cả 3 mốc (9 + 3 = 12 điểm) xếp trên người về thứ 4 (10) và thứ 5 (6) không điểm giữa đua
  rec(st, 1, q.map((uid, k) => ({ uid, rank: k + 1, ...(k === 5 ? { ip: 9 } : {}) })));
  const v = Race.raceView(st, 0, 0, side, seedOf);
  assert.ok(st.done && v.mass);
  assert.deepStrictEqual(v.table.slice(0, 6).map((x) => x.uid), [q[0], q[1], q[2], q[5], q[3], q[4]]);
  assert.deepStrictEqual(v.table.slice(0, 6).map((x) => x.pts), [60, 40, 20, 12, 10, 6]);
  assert.ok(v.table.slice(6).every((x) => !x.fin && x.semi >= 4), 'người dừng ở bán kết xếp sau');
  // Bảng xếp hạng một cuộc đua: bỏ cuộc sau người về đích, truất quyền cuối
  const R = MS.rankRace(c, [{ uid: 'x', dsq: true, ip: 9 }, { uid: 'y', dnf: true }, { uid: 'z', rank: 7 }]);
  assert.deepStrictEqual(R.map((x) => [x.uid, x.pts]), [['z', 0], ['y', 0], ['x', 0]]);
});

test('Pursuit: khoảng thua lấy từ giai đoạn tính giờ, thua quá mốc thì xuất phát đồng loạt (đúng bằng mốc vẫn theo giây)', () => {
  const [, c] = off([{ type: 'race', score: 'time', advance: 4 }, { type: 'race', score: 'pursuit', pursuit: { wave: 60 } }]);
  assert.deepStrictEqual([c.events, c.pursuit.wave], [1, 60]);
  const tables = [{ list: ['a', 'b', 'c', 'd'], stats: { a: { time: 600000, fin: 1 }, b: { time: 630000, fin: 1 }, c: { time: 660000, fin: 1 }, d: { time: 700000, fin: 1 } } }];
  const gaps = PUR.gapsFrom(tables, ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(gaps, { a: 0, b: 30000, c: 60000, d: 100000 });
  const st = ST.buildStage(c, 1, ['a', 'b', 'c', 'd'], {});
  st.gaps = gaps;
  assert.deepStrictEqual(PUR.startList(st).map((x) => [x.uid, x.start, !!x.wave]), [['a', 0, false], ['b', 30000, false], ['c', 60000, false], ['d', 60000, true]]);
  // Xếp theo thứ tự qua vạch (d đuổi kịp, về nhất), thời gian thuần chỉ hiển thị
  rec(st, 0, [{ uid: 'd', rank: 1, time: 2000000, pen: 1 }, { uid: 'a', rank: 2 }, { uid: 'b', dnf: true }]);
  const v = Race.raceView(st, 1, 0, side, () => 0);
  assert.deepStrictEqual(v.table.map((x) => [x.name, !!x.dnf, !!x.dns]), [['d', false, false], ['a', false, false], ['b', true, false], ['c', false, true]]);
  assert.strictEqual(v.table[0].pen, 1);
});

test('The Split: chia đôi theo hạng, mang thành tích, đội nhóm dưới nhiều điểm hơn vẫn xếp dưới; ước tính 198 + 30 trận', () => {
  const [a, b] = off([{ type: 'roundrobin', meetings: 3, advance: 12 }, { type: 'roundrobin', split: { top: 6 } }]);
  assert.deepStrictEqual([b.split, b.groups], [{ top: 6 }, 2]);
  assert.strictEqual(off([{ type: 'roundrobin', split: { top: 6 } }])[0].split, undefined, 'giai đoạn đầu không chia đôi');
  assert.deepStrictEqual(E.estimate({ players: 12, stages: [a, b] }).stages.map((s) => s.matches), [198, 30]);
});

async function playRace(org, t, id, so, rowsFor) {
  for (let g = 0; t.status === 'running' && g < 200; g++) {
    const st = t.st[t.stage];
    if (st.type !== 'race') { await playAllServer(org, t, id, so, null, t.stage + 1); continue; }
    const ev = st.events.find((e) => !e.done);
    if (!ev) break;
    org.send({ t: 'otRace', id, event: ev.i, rows: rowsFor(st, ev.i) });
    await until(() => ev.done || t.status !== 'running', 8000);
  }
}

test('Các mẫu đợt 24 chạy trọn qua máy chủ (Modified Stableford, omnium, mass start, biathlon, giải Scotland)', async () => {
  const by = (so) => (a, b) => so(a) - so(b);
  // Golf: hạt giống 1 birdie lỗ 1 (dẫn đầu một mình – không phải đấu phụ), mọi người khác par
  {
    const { org, t, id, so } = await startTpl('barracuda');
    await playRace(org, t, id, so, (st, i) => Race.lobby(st, i).filter((u) => GOLFOK(st, i, u)).map((uid) => ({ uid, h: st.cfg.par.map((p, k) => (k === 0 && so(uid) === 1 ? p - 1 : p)) })));
    assert.strictEqual(t.status, 'finished', 'barracuda');
    assert.ok(t.st[0].cfg.scoring === 'modified');
    org.close();
  }
  // Omnium, mass start: hạt giống cao về trước
  for (const tid of ['omnium', 'massstart']) {
    const { org, t, id, so } = await startTpl(tid);
    await playRace(org, t, id, so, (st, i) => {
      const mem = st.cfg.score === 'massstart' ? (st.cfg.massStart.semis && i === 0 ? MS.heatsOf(st) : [MS.membersOf(st, i)]) : [st.entrants];
      return mem.flatMap((h) => [...h].sort(by(so)).map((uid, k) => ({ uid, rank: k + 1, ...(i === 3 && tid === 'omnium' ? { sp: 0, lap: 0 } : {}) })));
    });
    assert.strictEqual(t.status, 'finished', tid);
    assert.strictEqual(t.podium[0], t.players[0].uid, tid + ': hạt giống 1 vô địch');
    org.close();
  }
  // Biathlon: Sprint tính giờ (hạt giống k chậm k × 10 giây) → Pursuit có khoảng thua
  {
    const { org, t, id, so } = await startTpl('biathlon_pursuit');
    await playRace(org, t, id, so, (st) => (st.cfg.score === 'time'
      ? st.entrants.map((uid) => ({ uid, time: 1500000 + so(uid) * 10000 }))
      : [...st.entrants].sort(by(so)).map((uid, k) => ({ uid, rank: k + 1 }))));
    assert.strictEqual(t.status, 'finished', 'biathlon');
    const p = t.st[1];
    assert.strictEqual(p.entrants.length, 60);
    assert.strictEqual(p.gaps[t.players[1].uid], 10000, 'hạt giống 2 xuất phát chậm 10 giây');
    const v = (await org.req({ t: 'otGet', id }, 'ot', (m) => m.id === id && m.tour)).tour.stageViews[1];
    assert.ok(v.pursuit.start.filter((x) => x.wave).length > 0, 'thua quá 4 phút xuất phát đồng loạt');
    org.close();
  }
  // Giải Scotland: 33 + 5 trận mỗi đội; đội nhóm dưới nhiều điểm hơn vẫn xếp dưới
  {
    const { org, t, id, so } = await startTpl('scottish_split');
    await playAllServer(org, t, id, so, null, 1);
    assert.strictEqual(t.stage, 1);
    const st = t.st[1];
    assert.deepStrictEqual(st.groups.map((g) => g.players.length), [6, 6]);
    assert.ok(st.carry && st.carry[t.players[0].uid].mp === 33, 'mang 33 trận');
    // Nhóm dưới: đội đầu nhóm dưới thắng hết; nhóm trên: hoà hết → vẫn xếp sau nhóm trên
    await playAllServer(org, t, id, so, (s, m) => (s.groups[1].players.includes(m.a) ? null : { score: [1, 1] }));
    assert.strictEqual(t.status, 'finished');
    const tabs = ST.standings(st, so);
    const all = tabs.flatMap((x) => x.list);
    assert.ok(tabs[1].stats[all[6]].mp === 38 && tabs[0].stats[all[0]].mp === 38, 'mỗi đội 38 trận');
    assert.deepStrictEqual(t.podium, all.slice(0, 3));
    assert.ok(st.groups[0].players.includes(t.podium[0]), 'vô địch thuộc nhóm trên');
    org.close();
  }
});

test('Mẫu đợt 24: mô tả bằng lời', () => {
  const T = (k, a) => k + (a ? ' ' + Object.values(a).join(' ') : '');
  const d = (tid) => IO.describeSpec(TP.specOf(TP.byId(tid), SPORTS), T).join(' ');
  assert.match(d('barracuda'), /ds_golf_sf_modified 8 \/ 5 \/ 2 \/ 0 \/ -1 \/ -3/);
  assert.match(d('omnium'), /ds_omnium/);
  assert.match(d('massstart'), /ds_ms 16 4, 8, 12 3-2-1 60-40-20-10-6-3.*ds_ms_semis 18 8/);
  assert.match(d('biathlon_pursuit'), /ds_pursuit 240/);
  assert.match(d('scottish_split'), /ds_split 6/);
  assert.ok(ctx);
});

/** Người được đánh vòng i của golf (không bị cắt). */
function GOLFOK(st, i, u) { return require('../src/hub/stages-golf.js').eligible(st, i).includes(u); }
