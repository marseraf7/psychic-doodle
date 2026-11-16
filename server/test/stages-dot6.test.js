/*
 * Đợt 6 (Laplace) – sửa các lỗi stages còn lại của đợt rà soát code 16/11/2026 (mục 34–44, 56, 57, 62 trong
 * DANH-SACH-LOI-RA-SOAT-CODE-CARO-16-11-2026.md): mỗi mục một bài thử tái hiện trước khi sửa.
 * Các mục 58 (play-in per nhỏ) và 59/60/61 (cách tính DNF/dsq) chờ chủ dự án chốt ý đồ — không đụng vào.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Race = require('../src/hub/stages-race.js');
const PUR = require('../src/hub/stages-pursuit.js');
const SJ = require('../src/hub/stages-skijump.js');
const BY = require('../src/hub/stages-backyard.js');
const MS = require('../src/hub/stages-massstart.js');
const OMN = require('../src/hub/stages-omnium.js');
const WK = require('../src/hub/stages-weekly.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const ids = (n, p = 'u') => Array.from({ length: n }, (_, i) => p + i);
const seedOf = (u) => Number(String(u).slice(1)) + 1;
const side = (u) => ({ uid: u, name: u });

test('Mục 37 – Pursuit: người không có thời gian Sprint nhận khoảng thua lớn nhất (như nhánh nhảy cầu), không phải 0', () => {
  const tables = [{ list: ['a', 'b', 'c'], stats: { a: { time: 100000, fin: 1 }, b: { time: 110000, fin: 1 }, c: {} } }];
  assert.deepStrictEqual(PUR.gapsFrom(tables, ['a', 'b', 'c'], {}), { a: 0, b: 10000, c: 10000 });
  // Đối chứng: ai cũng có thời gian thì giữ nguyên như cũ
  const full = [{ list: ['a', 'b'], stats: { a: { time: 100000, fin: 1 }, b: { time: 130000, fin: 1 } } }];
  assert.deepStrictEqual(PUR.gapsFrom(full, ['a', 'b'], {}), { a: 0, b: 30000 });
  // Đối chứng: nhánh nhảy cầu không đổi (người không có điểm vẫn nhận khoảng thua lớn nhất)
  const jump = [{ list: ['a', 'b', 'c'], stats: { a: { jump: 100 }, b: { jump: 90 }, c: {} } }];
  assert.deepStrictEqual(PUR.gapsFrom(jump, ['a', 'b', 'c'], {}), { a: 0, b: 40000, c: 40000 });
});

test('Mục 43 – Skijump (view): người chưa nhảy lượt nào không đồng hạng với người được 0.0 điểm', () => {
  const [c] = off([{ type: 'race', score: 'skijump', events: 1 }]);
  const st = ST.buildStage(c, 0, ['a', 'b', 'c', 'd', 'e'], {});
  Race.recordEvent(st, 0, Race.cleanEvent(st, [{ uid: 'a', pts: 100 }, { uid: 'b', pts: 0 }, { uid: 'd', dsq: true }, { uid: 'e', dnf: true }], st.entrants, 0).rows);
  const v = SJ.plug.view(st, 0, 0, side, seedOf);
  // a nhất (100), b hạng 2 (0.0 điểm thật), c chưa nhảy phải xếp sau b (hạng 3, tổng null), dsq/dnf nối tiếp
  assert.deepStrictEqual(v.table.map((x) => [x.uid, x.rank, x.total]), [['a', 1, 100], ['b', 2, 0], ['c', 3, null], ['d', 4, null], ['e', 5, null]]);
  // Đối chứng: hai người cùng điểm thật vẫn đồng hạng như cũ
  const st2 = ST.buildStage(c, 0, ['a', 'b', 'c'], {});
  Race.recordEvent(st2, 0, Race.cleanEvent(st2, [{ uid: 'a', pts: 50 }, { uid: 'b', pts: 50 }, { uid: 'c', pts: 30 }], st2.entrants, 0).rows);
  assert.deepStrictEqual(SJ.plug.view(st2, 0, 0, side, seedOf).table.map((x) => [x.uid, x.rank]), [['a', 1], ['b', 1], ['c', 3]]);
});

test('Mục 62 – Backyard: chạm trần 300 yard mà còn ≥ 2 người thì giải kết thúc (không vô địch), không kẹt running', () => {
  const [c] = off([{ type: 'race', score: 'backyard' }]);
  const st = ST.buildStage(c, 0, ['a', 'b'], {});
  for (let k = 0; k < 300; k++) {
    const i = st.events.findIndex((e) => !e.done);
    assert.notStrictEqual(i, -1, 'còn yard để nhập ở vòng ' + k);
    const r = BY.clean(st, i, [{ uid: 'a', done: true }, { uid: 'b', done: true }]);
    assert.ok(!r.code, JSON.stringify(r));
    BY.record(st, i, r.rows);
  }
  assert.strictEqual(st.events.length, 300);
  assert.strictEqual(st.done, true, 'giai đoạn phải xong ở yard 300');
  assert.deepStrictEqual([st.backyard.status, st.backyard.winner], ['none', null]);
  // Đối chứng: chưa chạm trần thì vẫn running và có yard kế tiếp như cũ
  const st2 = ST.buildStage(c, 0, ['a', 'b'], {});
  const r2 = BY.clean(st2, 0, [{ uid: 'a', done: true }, { uid: 'b', done: true }]);
  BY.record(st2, 0, r2.rows);
  assert.deepStrictEqual([st2.done, st2.events.length], [false, 2]);
});

test('Mục 36 – Massstart: trần hạng nhập kết quả theo cỡ cuộc đua thật, không phải hằng số 48', () => {
  // Đua đơn 60 người: hạng 49–60 phải nhập được
  const [c] = off([{ type: 'race', score: 'massstart' }]);
  const st = ST.buildStage(c, 0, ids(60), {});
  const r = Race.cleanEvent(st, ids(60).map((uid, k) => ({ uid, rank: k + 1 })), st.entrants, 0);
  assert.ok(!r.code, JSON.stringify(r));
  assert.strictEqual(r.rows.length, 60);
  // Bán kết 200 người, heat 24, adv 8 → chung kết 72 người: hạng 49–72 phải nhập được
  const [c2] = off([{ type: 'race', score: 'massstart', massStart: { semis: true, heat: 24, adv: 8 } }]);
  const st2 = ST.buildStage(c2, 0, ids(200), {});
  const H = MS.heatsOf(st2);
  Race.recordEvent(st2, 0, Race.cleanEvent(st2, H.flatMap((h) => h.map((uid, k) => ({ uid, rank: k + 1 }))), st2.entrants, 0).rows);
  const q = MS.qualifiers(st2);
  assert.strictEqual(q.length, 72);
  const rf = Race.cleanEvent(st2, q.map((uid, k) => ({ uid, rank: k + 1 })), st2.entrants, 1);
  assert.ok(!rf.code, JSON.stringify(rf));
  // Chiều ngược lại: heat chỉ 6 người thì hạng 48 (không tồn tại trong heat) phải bị chặn
  const [c3] = off([{ type: 'race', score: 'massstart', massStart: { semis: true, heat: 6, adv: 3 } }]);
  const st3 = ST.buildStage(c3, 0, ids(12), {});
  assert.strictEqual(Race.cleanEvent(st3, [{ uid: MS.heatsOf(st3)[0][0], rank: 48 }], st3.entrants, 0).code, 'ot_race_rank');
  assert.ok(!Race.cleanEvent(st3, [{ uid: MS.heatsOf(st3)[0][0], rank: 6 }], st3.entrants, 0).code, 'hạng 6 trong heat 6 người vẫn nhận');
});

test('Mục 44 – Massstart: danh sách kết quả chặng (view.events[].res) chốt hoà theo hạt giống, không theo thứ tự nhập', () => {
  const [c] = off([{ type: 'race', score: 'massstart', massStart: { semis: true, heat: 6, adv: 3 } }]);
  const st = ST.buildStage(c, 0, ids(12), {});
  const H = MS.heatsOf(st);
  // Nhập dòng của heat 2 trước heat 1; hai người về nhất hai heat bằng điểm (60) và cùng hạng 1 trong heat của mình
  const rows = [...H[1].map((uid, k) => ({ uid, rank: k + 1 })), ...H[0].map((uid, k) => ({ uid, rank: k + 1 }))];
  Race.recordEvent(st, 0, Race.cleanEvent(st, rows, st.entrants, 0).rows);
  const v = MS.plug.view(st, 0, 0, side, seedOf);
  const first = v.events[0].res.filter((x) => x.rank === 1);
  // Hạt giống cao hơn (người nhất heat 1) phải đứng trước, dù dòng của họ được nhập sau
  assert.deepStrictEqual(first.map((x) => [x.uid, x.place]), [[H[0][0], 1], [H[1][0], 2]]);
});

test('Mục 38 – Omnium: vắng mặt ở points race (không có dòng) không được tính như về đích', () => {
  const [c] = off([{ type: 'race', score: 'omnium' }]);
  const build = (prRows) => {
    const st = ST.buildStage(c, 0, ['a', 'b', 'c'], {});
    for (let i = 0; i < 3; i++) Race.recordEvent(st, i, Race.cleanEvent(st, [{ uid: 'a', rank: 1 }, { uid: 'b', rank: 2 }, { uid: 'c', rank: 3 }], st.entrants, i).rows);
    Race.recordEvent(st, 3, Race.cleanEvent(st, prRows, st.entrants, 3).rows);
    return st;
  };
  // a dẫn 120 điểm sau 3 đua đầu nhưng không có dòng ở points race → xếp sau cả hai người về đích
  const st = build([{ uid: 'b', rank: 1, sp: 0, lap: 0 }, { uid: 'c', rank: 2, sp: 0, lap: 0 }]);
  const C = OMN.calc(st, seedOf);
  assert.deepStrictEqual(C.order, ['b', 'c', 'a']);
  assert.strictEqual(C.stats.a.dns, true, 'người vắng mặt được đánh dấu dns trong thống kê');
  // Đối chứng 1: a có dòng dnf ở points race → vẫn xuống cuối như trước (hành vi cũ giữ nguyên)
  const st2 = build([{ uid: 'b', rank: 1, sp: 0, lap: 0 }, { uid: 'c', rank: 2, sp: 0, lap: 0 }, { uid: 'a', dnf: true, sp: 0, lap: 0 }]);
  assert.deepStrictEqual(OMN.calc(st2, seedOf).order, ['b', 'c', 'a']);
  // Đối chứng 2: a về đích ở points race → vô địch như cũ
  const st3 = build([{ uid: 'a', rank: 1, sp: 0, lap: 0 }, { uid: 'b', rank: 2, sp: 0, lap: 0 }, { uid: 'c', rank: 3, sp: 0, lap: 0 }]);
  assert.deepStrictEqual(OMN.calc(st3, seedOf).order, ['a', 'b', 'c']);
  // Đối chứng 3: points race chưa đấu → thứ tự theo tổng điểm như cũ, không ai bị dns
  const st4 = ST.buildStage(c, 0, ['a', 'b', 'c'], {});
  for (let i = 0; i < 3; i++) Race.recordEvent(st4, i, Race.cleanEvent(st4, [{ uid: 'a', rank: 1 }, { uid: 'b', rank: 2 }, { uid: 'c', rank: 3 }], st4.entrants, i).rows);
  const C4 = OMN.calc(st4, seedOf);
  assert.deepStrictEqual(C4.order, ['a', 'b', 'c']);
  assert.strictEqual(C4.stats.a.dns, undefined);
});

test('Mục 40 – Weekly: weeklyError đòi đủ hàng chờ cho mọi trận Survival (2·seats − 1 + sit), phòng không teo', () => {
  const cfg = { weekly: { weeks: 2, seats: 4, final: 2, bottom: 1, sit: 1 } };
  // Cấu hình này cần tối thiểu 2·4 − 1 + 1 = 8 đội; 6–7 đội phải bị chặn ở cổng
  assert.deepStrictEqual(WK.weeklyError(cfg, 6), { code: 'ot_weekly_few', args: { n: 8 } });
  assert.deepStrictEqual(WK.weeklyError(cfg, 7), { code: 'ot_weekly_few', args: { n: 8 } });
  assert.strictEqual(WK.weeklyError(cfg, 8), null);
  // Đối chứng: cấu hình mẫu PGC 2021 (32 đội) vẫn qua như cũ
  assert.strictEqual(WK.weeklyError({ weekly: { weeks: 3, seats: 16, final: 10, bottom: 6, sit: 1 } }, 32), null);
  // Với đủ 8 đội: mọi phòng Survival tuần 1 đều đầy 4 đội (hạt giống cao thắng dần để phòng thay người)
  const [c] = off([{ type: 'race', score: 'points', weekly: { weeks: 2, seats: 4, final: 2, bottom: 1, sit: 1 } }]);
  const st = ST.buildStage(c, 0, ids(8), {});
  const W = WK.make(st, Race.raceTable);
  const sizes = [];
  for (let k = 0; k < 4; k++) { // 4 trận Survival tuần 1 = 4 chặng đầu; người về nhất rời phòng, người kế trong hàng chờ vào thay
    const lobby = W.survLobby(0, k);
    sizes.push(lobby.length);
    Race.recordEvent(st, k, Race.cleanEvent(st, lobby.map((uid, j) => ({ uid, rank: j + 1 })), st.entrants, k).rows);
  }
  assert.deepStrictEqual(sizes, [4, 4, 4, 4]);
});

test('Mục 42 – Graph: cờ final gắn cho trận tranh vô địch (wp = 1), không phải trận cuối danh sách khuôn', () => {
  const fin = (shape, n) => {
    const [gc] = off([{ type: 'graph', shape }]);
    const st = ST.buildStage(gc, 0, ids(n), { seedOf });
    return Object.values(st.matches).filter((m) => m.final).map((m) => [m.gk, m.wp || 0]);
  };
  // compass8: chung kết thật là chung kết Đông (wp = 1); trước đây cờ rơi vào chung kết Nam tranh hạng 7–8 (wp = 7)
  assert.deepStrictEqual(fin('compass8', 8), [['ef', 1]]);
  // cross9: cả ba trận quyết định đều có wp = 1 — cả ba cùng mang cờ
  assert.deepStrictEqual(fin('cross9', 9).map((x) => x[1]), [1, 1, 1]);
  // Các khuôn còn lại: đúng một trận chung kết như cũ
  assert.deepStrictEqual(fin('page', 4), [['f', 1]]);
  assert.deepStrictEqual(fin('afl8', 8).length, 1);
  assert.deepStrictEqual(fin('gauntlet', 5).map((x) => x[1]), [1]);
});

test('Mục 39 – Playoff: số miền (bảng của mùa giải) không phải luỹ thừa của 2 thì không lập kế hoạch miền', () => {
  const PO = require('../src/hub/stages-playoff.js');
  // prev tối thiểu đúng những gì playoffPlan đọc: type/cfg.season/groups; standings: bảng từng miền
  const mk = (C, per) => {
    const prev = { type: 'roundrobin', cfg: { season: {} }, groups: Array.from({ length: C }, (_, c) => ({ name: 'M' + (c + 1), divs: null })) };
    const standings = Array.from({ length: C }, (_, c) => ({ list: ids(per).map((u) => 'c' + c + u) }));
    return PO.playoffPlan(prev, { playoff: PO.normalizePlayoff({ per }) }, standings);
  };
  // Trước đây: size = pow2(C)·half — 3 miền thành 16 ô với 4 ô BYE (một "nửa nhánh ma" không đội nào vào được)
  assert.strictEqual(mk(3, 4), null);
  assert.strictEqual(mk(5, 2), null);
  assert.strictEqual(mk(6, 2), null);
  // Số miền hợp lệ giữ nguyên: 1, 2, 4 miền vẫn lập kế hoạch, mọi ô đều có đội thật
  const { BYE } = require('../src/hub/stages-base.js');
  for (const [C, per] of [[1, 4], [2, 4], [4, 4], [2, 2]]) {
    const p = mk(C, per);
    assert.ok(p, `miền ${C} vẫn có kế hoạch`);
    assert.strictEqual(p.slots.length, C * per);
    assert.ok(p.slots.every((s) => s !== BYE), 'không còn ô BYE ma');
  }
});

test('Mục 34 – Kings: dưới 4 đội đi tiếp thì giai đoạn tự xong (mọi đội miễn đấu), giải không kẹt', () => {
  const KG = require('../src/hub/stages-kings.js');
  const [, kc] = off([{ type: 'swiss' }, { type: 'kings' }, { type: 'single' }]); // kings chỉ tồn tại ở giai đoạn giữa
  const st = ST.buildStage(kc, 1, ids(3), { seedOf });
  assert.strictEqual(st.done, true, 'kings 3 đội: không trận nào để đấu thì giai đoạn phải xong ngay');
  assert.deepStrictEqual(KG.advancers(st, seedOf).seeds, ids(3), 'cả 3 đội đều đi tiếp như đội miễn đấu');
  // Đối chứng: 4 đội trở lên dựng như cũ, chưa xong
  const st4 = ST.buildStage(kc, 1, ids(4), { seedOf });
  assert.strictEqual(st4.done, false);
  assert.strictEqual(Object.keys(st4.matches).length, 2);
});

test('Mục 34 (hub) – Swiss record cho 2 đội đi tiếp vào kings: chuyển giai đoạn tự bỏ qua kings, giải chạy tới hết', () => {
  const { OTourRun } = require('../src/hub/otour-run.js');
  const host = new OTourRun();
  host.otSchedNext = () => {}; // xếp lịch không liên quan tới lỗi này
  const stages = ST.normalizeStages([
    { type: 'swiss', record: { win: 1, lose: 1 } },
    { type: 'kings' },
    { type: 'single' },
  ], { offline: true });
  const t = { stages, players: ids(4).map((uid, i) => ({ uid, seed: i + 1 })), stage: 0, status: 'running', st: [], direct: null };
  t.st = [ST.buildStage(stages[0], 0, ids(4), host.otBuildOpts(t))];
  for (let g = 0; !t.st[0].done && g < 10; g++) for (const m of ST.playable(t.st[0])) ST.recordResult(t.st[0], m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf });
  assert.ok(t.st[0].done, 'swiss record 1 thắng/1 thua xong sau vòng 1');
  host.otNextStage(t); // 2 đội thắng đi tiếp — kings nhận 2 đội
  assert.strictEqual(t.st[1].done, true, 'giai đoạn kings tự xong');
  assert.strictEqual(t.stage, 2, 'đã tự chuyển qua kings sang giai đoạn cuối');
  assert.deepStrictEqual(t.st[2].entrants, ['u0', 'u1']);
  for (let g = 0; !t.st[2].done && g < 10; g++) for (const m of ST.playable(t.st[2])) ST.recordResult(t.st[2], m, m.a, { seedOf });
  host.otNextStage(t);
  assert.strictEqual(t.status, 'finished');
});

test('Mục 56 – Season: dựng giai đoạn mùa giải với 0–1 đội không ném TypeError, giai đoạn xong ngay', () => {
  const [, sc] = off([{ type: 'swiss' }, { type: 'roundrobin', season: { confs: 1, divs: 1, div: { m: 2 } }, advance: 2 }, { type: 'single' }]);
  for (const seeds of [[], ['u0']]) {
    const st = ST.buildStage(sc, 1, seeds, { seedOf });
    assert.strictEqual(st.done, true, `season ${seeds.length} đội phải xong ngay`);
    assert.deepStrictEqual(st.entrants, seeds);
  }
  // Đối chứng: đủ đội thì dựng bình thường, chưa xong
  const ok = ST.buildStage(sc, 1, ids(4), { seedOf });
  assert.strictEqual(ok.done, false);
  assert.ok(Object.keys(ok.matches).length > 0);
});

test('Mục 56 (hub) – Swiss record → routes/advance 0 → season nhận 0 đội: không sập, giải chạy tới hết', () => {
  const { OTourRun } = require('../src/hub/otour-run.js');
  const host = new OTourRun();
  host.otSchedNext = () => {};
  const stages = ST.normalizeStages([
    { type: 'swiss', record: { win: 1, lose: 1 }, routes: [{ n: 1, to: 2 }], advance: 0 },
    { type: 'roundrobin', season: { confs: 1, divs: 1, div: { m: 2 } }, advance: 2 },
    { type: 'single' },
  ], { offline: true });
  const t = { stages, players: ids(4).map((uid, i) => ({ uid, seed: i + 1 })), stage: 0, status: 'running', st: [], direct: null };
  t.st = [ST.buildStage(stages[0], 0, ids(4), host.otBuildOpts(t))];
  for (let g = 0; !t.st[0].done && g < 10; g++) for (const m of ST.playable(t.st[0])) ST.recordResult(t.st[0], m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf });
  assert.ok(t.st[0].done);
  host.otNextStage(t); // trước đây: TypeError từ buildSeason ngay tại đây, trạng thái giải nát dở dang
  assert.strictEqual(t.st[1].done, true, 'giai đoạn season 0 đội tự xong');
  assert.strictEqual(t.stage, 2, 'đã tự chuyển qua season sang giai đoạn cuối');
  for (let g = 0; t.status !== 'finished' && g < 10; g++) {
    const cur = t.st[t.stage];
    for (const m of ST.playable(cur)) ST.recordResult(cur, m, m.a, { seedOf });
    if (cur.done) host.otNextStage(t);
  }
  assert.strictEqual(t.status, 'finished');
});
