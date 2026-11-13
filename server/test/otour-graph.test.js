/*
 * Đợt 19–20 – registry loại giai đoạn + nhánh đồ thị (chỉ mô phỏng thể thức): Page playoff, Final Eight / Final Ten kiểu
 * AFL, thang leo bậc có trận tặng sẵn (kiểu KBO / NPB), loại kép lai kiểu RLCS, Compass draw 8.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Kinds = require('../src/hub/stages-kinds.js');
const GR = require('../../caro/otour-graph.js');
const E = require('../../caro/tour-estimate.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const uids = (n) => Array.from({ length: n }, (_, i) => 'u' + i);
const seedOf = (u) => Number(u.slice(1)) + 1;
const win = (st, m, w) => ST.recordResult(st, m, w, { seedOf });
const byK = (st, k) => Object.values(st.matches).find((m) => m.gk === k);
const build = (cfg, n) => { const [c] = off([cfg]); return ST.buildStage(c, 0, uids(n), { seedOf }); };
/** Đấu trọn: chọn người thắng theo hàm pick(m) (mặc định hạt giống cao hơn). */
function playAll(st, pick = (m) => (seedOf(m.a) < seedOf(m.b) ? m.a : m.b)) {
  for (let k = 0; k < 50 && !st.done; k++) for (const m of ST.playable(st)) win(st, m, pick(m));
  return st;
}

test('Registry: GSL, kings, nhánh đồ thị đăng ký đủ hàm; loại cũ không có trong registry', () => {
  for (const k of Kinds.TYPES) for (const f of ['normalize', 'build', 'advancers', 'podium', 'error', 'view']) assert.strictEqual(typeof Kinds.get(k)[f], 'function', k + '.' + f);
  assert.strictEqual(Kinds.get('single'), null);
  assert.strictEqual(Kinds.get('toString'), null, 'không lấy nhầm thuộc tính của Object');
  assert.ok(ST.linked('graph') && ST.linked('gsl') && ST.linked('kings') && !ST.linked('roundrobin'));
  // Giải Caro trực tuyến không có loại giai đoạn của giải offline
  assert.strictEqual(ST.normalizeStages([{ type: 'graph', shape: 'page' }])[0].type, 'single');
  // kings ở cuối thành loại trực tiếp (midOnly)
  assert.strictEqual(off([{ type: 'kings' }])[0].type, 'single');
});

test('Page playoff: 4 trận, thua Q1 còn cơ hội, thua Eliminator hạng 4, thua Q2 hạng 3', () => {
  const st = build({ type: 'graph', shape: 'page' }, 4);
  assert.strictEqual(Object.keys(st.matches).length, 4);
  const q1 = byK(st, 'q1'), el = byK(st, 'el');
  assert.deepStrictEqual([q1.a, q1.b, el.a, el.b], ['u0', 'u1', 'u2', 'u3']);
  win(st, q1, 'u1'); // hạt giống 2 thắng Q1 → chung kết; hạt giống 1 xuống Q2
  win(st, el, 'u3'); // hạt giống 4 thắng Eliminator
  const q2 = byK(st, 'q2');
  assert.deepStrictEqual([q2.a, q2.b], ['u0', 'u3']);
  win(st, q2, 'u3');
  const f = byK(st, 'f');
  assert.deepStrictEqual([f.a, f.b], ['u1', 'u3']);
  win(st, f, 'u3');
  assert.ok(st.done);
  assert.deepStrictEqual(ST.podium(st, seedOf), ['u3', 'u1', 'u0']);
  assert.deepStrictEqual(Kinds.get('graph').places(st, seedOf).map((x) => x.place), [1, 2, 3, 4]);
  assert.deepStrictEqual(E.estimate({ stages: [{ type: 'graph', shape: 'page' }], players: 4 }).stages[0].matches, 4);
});

test('Page: Q1 bị xử thua do vắng mặt vẫn chuyển người thua sang Q2 (như trận thường)', () => {
  const st = build({ type: 'graph', shape: 'page' }, 4);
  const q1 = byK(st, 'q1');
  q1.walkover = true;
  win(st, q1, 'u0');
  assert.strictEqual(byK(st, 'q2').a, 'u1');
  assert.strictEqual(byK(st, 'f').a, 'u0');
});

test('AFL Final Eight: 9 trận, bán kết thua QF gặp thắng EF, Preliminary bắt chéo', () => {
  const st = build({ type: 'graph', shape: 'afl8' }, 8);
  assert.strictEqual(Object.keys(st.matches).length, 9);
  win(st, byK(st, 'qf1'), 'u3'); // 4 thắng 1
  win(st, byK(st, 'qf2'), 'u1'); // 2 thắng 3
  win(st, byK(st, 'ef1'), 'u4'); // 5 thắng 8
  win(st, byK(st, 'ef2'), 'u6'); // 7 thắng 6
  assert.deepStrictEqual([byK(st, 's1').a, byK(st, 's1').b], ['u0', 'u4'], 'SF1 = thua QF1 gặp thắng EF1');
  assert.deepStrictEqual([byK(st, 's2').a, byK(st, 's2').b], ['u2', 'u6'], 'SF2 = thua QF2 gặp thắng EF2');
  win(st, byK(st, 's1'), 'u0');
  win(st, byK(st, 's2'), 'u6');
  assert.deepStrictEqual([byK(st, 'p1').a, byK(st, 'p1').b], ['u3', 'u6'], 'PF1 = thắng QF1 gặp thắng SF2');
  assert.deepStrictEqual([byK(st, 'p2').a, byK(st, 'p2').b], ['u1', 'u0'], 'PF2 = thắng QF2 gặp thắng SF1');
  playAll(st);
  const pl = Kinds.get('graph').places(st, seedOf);
  assert.strictEqual(pl.length, 8);
  assert.deepStrictEqual(pl.map((x) => x.place), [1, 2, 3, 3, 5, 5, 7, 7]);
  // Đội thua EF bị loại ngay (hạng 7), đội thua QF vẫn còn đấu
  assert.strictEqual(E.estimate({ stages: [{ type: 'graph', shape: 'afl8' }], players: 8 }).stages[0].matches, 9);
});

test('AFL Final Ten: Wildcard 7–10, 8–9; đội thắng mang hạt giống 7 / 8 vào tuần 1', () => {
  const st = build({ type: 'graph', shape: 'afl10' }, 10);
  assert.strictEqual(Object.keys(st.matches).length, 11);
  assert.strictEqual(ST.playable(st).length, 4, 'đấu được ngay: hai trận Wildcard và hai trận QF (EF chờ Wildcard)');
  win(st, byK(st, 'w1'), 'u9'); // 10 thắng 7 → gặp 6 ở EF2
  win(st, byK(st, 'w2'), 'u7'); // 8 thắng 9 → gặp 5 ở EF1
  assert.deepStrictEqual([byK(st, 'ef1').a, byK(st, 'ef1').b, byK(st, 'ef2').a, byK(st, 'ef2').b], ['u4', 'u7', 'u5', 'u9']);
  playAll(st);
  assert.strictEqual(Kinds.get('graph').places(st, seedOf).filter((x) => x.place === 9).length, 2);
});

test('Gauntlet 5 đội: hạt giống 5 phải thắng 4 loạt mới vô địch', () => {
  const st = build({ type: 'graph', shape: 'gauntlet' }, 5);
  assert.strictEqual(Object.keys(st.matches).length, 4);
  playAll(st, (m) => (m.b === 'u4' ? 'u4' : m.a)); // hạt giống 5 thắng hết
  assert.deepStrictEqual(ST.podium(st, seedOf), ['u4', 'u0', 'u1']);
  assert.deepStrictEqual(Kinds.get('graph').places(st, seedOf).map((x) => x.uid), ['u4', 'u0', 'u1', 'u2', 'u3']);
  assert.strictEqual(GR.make('gauntlet', 9), null, 'tối đa 8 đội');
  assert.deepStrictEqual(Kinds.sizeError({ type: 'graph', shape: 'page' }, 5), { code: 'ot_graph_size', args: { n: '4' } });
});

test('Loạt có trận tặng sẵn (KBO Wild Card / NPB Final Stage): ⌈(bo + 1) / 2⌉ thắng tính cả trận tặng', () => {
  const S = GR.series;
  // KBO Wild Card: Bo3 gồm 1 trận tặng (tối đa 2 trận), hạt giống cao chỉ cần thắng hoặc hoà 1 trận
  assert.strictEqual(S([1], 3, [1, 0], true).winner, 'a');
  assert.strictEqual(S([0], 3, [1, 0], true).winner, 'a', 'hoà trận 1: đội hạng 4 đi tiếp ngay');
  assert.strictEqual(S([-1], 3, [1, 0], true).done, false);
  assert.strictEqual(S([-1, -1], 3, [1, 0], true).winner, 'b');
  assert.strictEqual(S([-1, 0], 3, [1, 0], true).winner, 'a', '1–1 sau hai trận: hoà loạt, hạt giống cao đi tiếp');
  assert.ok(S([1, 1], 3, [1, 0], true).error, 'đấu thừa trận');
  // NPB Final Stage: tặng 1, cần 4 (3 thắng thật); đội thách đấu cần 4 thắng thật
  assert.strictEqual(S([1, 1, 1], 7, [1, 0], true).winner, 'a');
  assert.strictEqual(S([-1, -1, -1, -1], 7, [1, 0], true).winner, 'b');
  assert.strictEqual(S([1, 1, -1, -1, -1], 7, [1, 0], true).done, false);
  // Bo7 tặng 2: cần 2 thắng thật
  assert.strictEqual(S([1, 1], 7, [2, 0], false).winner, 'a');
  // Không trận tặng: Bo3 thường
  assert.strictEqual(S([1, -1, -1], 3, null, false).winner, 'b');
});

test('Gauntlet có cấu hình từng bậc: Bo, trận tặng, hoà loạt lưu vào trận', () => {
  const [c] = off([{ type: 'graph', shape: 'gauntlet', ladder: [{ bo: 3, start: [1, 0], tie: true }, { bo: 5 }, { bo: 5 }, { bo: 7 }] }]);
  assert.deepStrictEqual(c.ladder[0], { bo: 3, start: [1, 0], tie: true });
  const st = ST.buildStage(c, 0, uids(5), { seedOf });
  const g0 = byK(st, 'g0');
  assert.deepStrictEqual([g0.a, g0.b, g0.bo, g0.start, g0.tie], ['u3', 'u4', 3, [1, 0], true]);
  assert.strictEqual(ST.boOf(st, byK(st, 'g3')), 7);
});

test('Hybrid kiểu RLCS: hạt giống 1–4 hai mạng, 5–8 một mạng, Final Four loại thẳng – 9 trận', () => {
  const st = build({ type: 'graph', shape: 'hybrid' }, 8);
  assert.strictEqual(Object.keys(st.matches).length, 9);
  win(st, byK(st, 'u1'), 'u3'); // 4 thắng 1: hạt giống 1 rơi xuống nhánh dưới 2 (còn mạng)
  win(st, byK(st, 'l1a'), 'u7'); // 8 thắng 5: hạt giống 5 bị loại ngay (một mạng)
  assert.strictEqual(byK(st, 'l2a').a, 'u0');
  assert.strictEqual(byK(st, 'l1a').lp, 7);
  playAll(st);
  assert.deepStrictEqual(Kinds.get('graph').places(st, seedOf).map((x) => x.place), [1, 2, 3, 3, 5, 5, 7, 7]);
});

test('Compass draw 8: 12 trận, mỗi người đúng 3 trận, đủ 4 chung kết Đông / Bắc / Tây / Nam', () => {
  const st = playAll(build({ type: 'graph', shape: 'compass8' }, 8));
  const ms = Object.values(st.matches);
  assert.strictEqual(ms.length, 12);
  for (const u of uids(8)) assert.strictEqual(ms.filter((m) => m.a === u || m.b === u).length, 3, u);
  const pl = Kinds.get('graph').places(st, seedOf);
  assert.deepStrictEqual(pl.map((x) => x.place), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.strictEqual(pl[0].uid, 'u0');
});

test('Nhánh đồ thị ở giữa: người đi tiếp theo hạng; giai đoạn sau nhận đúng số đội', () => {
  const list = off([{ type: 'graph', shape: 'page', advance: 2 }, { type: 'single' }]);
  assert.strictEqual(list[0].advance, 2);
  const st = playAll(ST.buildStage(list[0], 0, uids(4), { seedOf }));
  assert.deepStrictEqual(ST.advancers(st, seedOf).seeds, ['u0', 'u1']);
  assert.strictEqual(E.estimate({ stages: list, players: 4 }).stages[1].players, 2);
});

// ------------------------------------------------------------ Vòng vớt kiểu Olympic (stages-repechage.js)
test('Vòng vớt kiểu Olympic: nhánh vớt theo "đã thua trước finalist", người thắng vớt phía A gặp người thua bán kết phía B, hai huy chương đồng', () => {
  const [c] = off([{ type: 'single', rep: { from: 'r16' }, thirdPlace: true }]);
  assert.deepStrictEqual(c.rep, { from: 'r16', mode: 'finalist' });
  assert.strictEqual(c.thirdPlace, false, 'hai trận tranh đồng thay cho trận tranh hạng 3');
  const st = ST.buildStage(c, 0, uids(16), { seedOf });
  // Vòng 1/8 và tứ kết: hạt giống cao thắng; bán kết: 1 và 2 thắng
  for (let k = 0; k < 3; k++) for (const m of ST.playable(st)) win(st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b);
  assert.ok(st.rep, 'xong hai bán kết: sinh nhánh vớt');
  const [A, B] = st.rep.sides;
  assert.strictEqual(A.fin, 'u0');
  // u0 thắng u15 (1/8), u7 (tứ kết); thua bán kết trước u0 là u3 → không vào nhánh vớt (tranh đồng phía bên kia)
  assert.deepStrictEqual(A.pool, ['u15', 'u7']);
  assert.deepStrictEqual(B.pool, ['u14', 'u6']);
  const bA = st.matches[A.bronze], bB = st.matches[B.bronze];
  assert.strictEqual(bA.b, 'u2', 'người thắng vớt phía A gặp người thua bán kết phía B');
  assert.strictEqual(bB.b, 'u3');
  assert.ok(!st.done);
  for (let k = 0; k < 5 && !st.done; k++) for (const m of ST.playable(st)) win(st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b);
  assert.ok(st.done);
  const pl = ST.REP.places(st);
  assert.deepStrictEqual(pl.slice(0, 8).map((x) => x.place), [1, 2, 3, 3, 5, 5, 7, 7]);
  assert.deepStrictEqual(ST.podium(st, seedOf), ['u0', 'u1', 'u2', 'u3']);
  // Ước tính số trận khớp máy chủ: 15 trận nhánh chính + 2 × (1 trận vớt + 1 tranh đồng)
  assert.strictEqual(E.estimate({ stages: [c], players: 16 }).stages[0].matches, Object.keys(st.matches).length);
});

test('Vòng vớt: từ tứ kết chỉ người thua tứ kết trước finalist; kiểu IJF (half) lấy cả hai người thua tứ kết của nửa nhánh; huỷ bán kết thì bỏ nhánh vớt', () => {
  const [c] = off([{ type: 'single', rep: { from: 'qf' } }]);
  const st = ST.buildStage(c, 0, uids(16), { seedOf });
  for (let k = 0; k < 3; k++) for (const m of ST.playable(st)) win(st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b);
  assert.deepStrictEqual(st.rep.sides.map((s) => s.pool), [['u7'], ['u6']]);
  assert.strictEqual(st.matches[st.rep.sides[0].bronze].a, 'u7', 'một người vớt: vào thẳng trận tranh đồng');
  const sf = st.matches[st.rounds[2][0]];
  assert.ok(ST.REP.beforeUndo(st, sf) && !st.rep, 'huỷ bán kết khi chưa trận vớt nào có kết quả: bỏ nhánh vớt');
  const [h] = off([{ type: 'single', rep: { from: 'qf', mode: 'half' } }]);
  const s2 = ST.buildStage(h, 0, uids(16), { seedOf });
  for (let k = 0; k < 3; k++) for (const m of ST.playable(s2)) win(s2, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b);
  assert.deepStrictEqual(s2.rep.sides.map((s) => s.pool.length), [2, 2]);
  for (let k = 0; k < 5 && !s2.done; k++) for (const m of ST.playable(s2)) win(s2, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b);
  assert.deepStrictEqual(ST.REP.places(s2).filter((x) => x.place === 3).length, 2);
  assert.strictEqual(E.estimate({ stages: [h], players: 16 }).stages[0].matches, Object.keys(s2.matches).length);
  assert.deepStrictEqual(ST.REP.error({ type: 'single', rep: { from: 'qf' } }, 4, ST.elimSize), { code: 'ot_rep_size', args: { n: 5 } });
});

// ------------------------------------------------------------ Chạy trọn các mẫu mới qua máy chủ
const { startTpl, playAllServer } = require('./otour-tplrun.js');
const { until } = require('./otour-client.js');

test('Các mẫu nhánh đồ thị chạy trọn qua máy chủ (Page, AFL, thang leo bậc có trận tặng, loại kép lai, Compass)', async () => {
  for (const tid of ['page_t20', 'afl_final8', 'afl_final10', 'kbo_ladder', 'npb_climax', 'rlcs_hybrid', 'compass8', 'judo_rep']) {
    const { org, t, id, so } = await startTpl(tid);
    await playAllServer(org, t, id, so);
    assert.strictEqual(t.status, 'finished', tid);
    assert.strictEqual(t.podium[0], t.players[0].uid, tid + ': hạt giống 1 vô địch');
    const v = (await org.req({ t: 'otGet', id }, 'ot', (x) => x.id === id && x.tour)).tour.stageViews.at(-1);
    if (tid === 'judo_rep') { assert.ok(v.rep.length === 2 && v.table.filter((x) => x.place === 3).length === 2 && t.podium.length === 4, 'vòng vớt: hai nhánh, hai hạng 3'); org.close(); continue; }
    assert.strictEqual(v.type, 'graph');
    assert.ok(v.rounds.flat().every((m) => m.to) && v.table.length >= 3 && v.colNames.length === v.rounds.length, tid + ': trang xem có đường đi, bảng hạng, tên cột');
    org.close();
  }
});

test('Thang leo bậc kiểu KBO qua máy chủ: hạng 4 hoà trận 1 của Wild Card là đi tiếp; nhập thừa trận bị từ chối; huỷ kết quả khoá theo trận sau', async () => {
  const { org, t, id, so } = await startTpl('kbo_ladder');
  await playAllServer(org, t, id, so, null, 1); // chỉ vòng tròn
  const st = t.st[1];
  assert.strictEqual(st.type, 'graph');
  const wc = Object.values(st.matches).find((m) => m.gk === 'g0');
  const extra = await org.req({ t: 'otScore', id, match: wc.id, sets: [[2, 2], [1, 3]] }, 'error');
  assert.strictEqual(extra.code, 'ot_series_after', 'hoà trận 1 đã quyết định loạt');
  const pen = await org.req({ t: 'otScore', id, match: Object.values(st.matches).find((m) => m.gk === 'g0').id, sets: [[1, 3]] }, 'error');
  assert.strictEqual(pen.code, 'ot_series_short', 'hạng 5 thắng trận 1: loạt chưa xong (1–1)');
  org.send({ t: 'otScore', id, match: wc.id, sets: [[2, 2]] });
  await until(() => wc.done);
  assert.strictEqual(wc.winner, st.entrants[3], 'hạng 4 đi tiếp');
  assert.deepStrictEqual(wc.score, [1, 0]);
  const g1 = Object.values(st.matches).find((m) => m.gk === 'g1');
  assert.strictEqual(g1.b, st.entrants[3]);
  org.send({ t: 'otScore', id, match: g1.id, sets: [[3, 1], [3, 1], [3, 1]] });
  await until(() => g1.done);
  const locked = await org.req({ t: 'otUndo', id, match: wc.id }, 'error');
  assert.strictEqual(locked.code, 'tour_undo_locked', 'trận sau đã có kết quả');
  org.send({ t: 'otUndo', id, match: g1.id });
  await until(() => !g1.done);
  org.send({ t: 'otUndo', id, match: wc.id });
  await until(() => !wc.done && g1.b === null);
  org.close();
});
