/*
 * Đợt 22 – darts (set > leg), trận đồng đội có rubber (kiểu Davis Cup), thang ván của trận (FIDE World Cup, Norway Chess,
 * Armageddon đấu giá), đủ số ván + ván quyết định và hiệu số ván đối đầu (kiểu Overwatch League). Chỉ mô phỏng thể thức.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const R = require('../../caro/otour-rules.js');
const L = require('../../caro/otour-ladder.js');
const E = require('../../caro/tour-estimate.js');
const TP = require('../../caro/otour-templates.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const Spec = require('../src/hub/otour-spec.js');
const { until } = require('./otour-client.js');
const { startTpl, playAllServer } = require('./otour-tplrun.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const G = (arr) => arr.map(([lv, r]) => ({ lv, r }));

test('Darts: set đua tới 3 leg; set quyết định hơn 2 leg, 5–5 đấu leg quyết định; trận tính theo set', () => {
  const d = R.cleanSet(SPORTS.darts.set);
  assert.deepStrictEqual([R.setError(d, [3, 2]), R.setError(d, [4, 3]), R.setError(d, [3, 3])], [null, 'ot_set_bad', 'ot_set_tie'], 'set thường');
  const six = [...Array(6).fill([3, 1]), ...Array(6).fill([1, 3])];
  for (const [last, ok] of [[[6, 5], true], [[3, 2], false], [[4, 2], true], [[5, 3], true], [[5, 4], false], [[3, 0], true]]) assert.strictEqual(R.setsError(d, [...six, last], 13) === null, ok, 'set quyết định ' + last);
  // Người thắng nhiều leg hơn vẫn thua trận nếu thua nhiều set hơn: thắng 3 set 3–0, thua 3 set 2–3 và set quyết định 1–3
  // (leg 16–12 nghiêng về người thua; set quyết định 2–3 thì chưa xong vì phải hơn 2 leg)
  const list = [[3, 0], [3, 0], [3, 0], [2, 3], [2, 3], [2, 3], [1, 3]];
  assert.strictEqual(R.setsError(d, [...list.slice(0, 6), [2, 3]], 7).code, 'ot_set_bad');
  assert.strictEqual(R.setsError(d, list, 7), null);
  assert.strictEqual(list.filter((s) => s[1] > s[0]).length, 4);
  assert.deepStrictEqual(R.setsError(d, [[3, 0], [3, 0], [3, 0], [3, 0]], 5), { code: 'ot_sets_after', args: { n: 4, bo: 5 } }, 'set thừa');
  // Số set cần thắng theo vòng (Bo từng vòng)
  const [c] = off([{ type: 'single', bestOf: 5, boRounds: [5, 7, 7, 9, 11, 13] }]);
  const st = ST.buildStage(c, 0, Array.from({ length: 64 }, (_, i) => 'u' + i), { seedOf: (u) => Number(u.slice(1)) + 1 });
  assert.deepStrictEqual(st.rounds.map((r) => ST.boOf(st, st.matches[r[0]])), [5, 7, 7, 9, 11, 13]);
});

test('Trận đồng đội có rubber (Davis Cup): mỗi "set" là tỉ số một rubber Bo3; đấu đủ cả rubber không còn ý nghĩa; 75 rubber ở mẫu 18 đội', () => {
  const r = R.cleanSet(SPORTS.tennis_team.set);
  assert.strictEqual(R.setsError(r, [[2, 1], [2, 0], [0, 2]], 3), null);
  assert.deepStrictEqual(R.setsError(r, [[2, 1], [2, 0]], 3), { code: 'ot_rubber_dead', args: { bo: 3 } });
  assert.strictEqual(R.setsError(r, [[2, 2], [2, 0], [2, 0]], 3).code, 'ot_set_tie');
  assert.strictEqual(R.setsError(r, [[3, 1], [2, 0], [2, 0]], 3).code, 'ot_rubber_bad');
  const e = Spec.checkSize(Spec.normalizeSpec(TP.specOf(TP.byId('davis_finals'), SPORTS)), 18);
  assert.deepStrictEqual(e.stages.map((s) => s.matches), [18, 7]);
  assert.strictEqual((e.stages[0].matches + e.stages[1].matches) * 3, 75, '25 trận × 3 rubber');
});

test('Thang ván FIDE World Cup: cấp sau chỉ mở khi cấp trước hoà; Armageddon hoà thì Đen thắng; thang rút gọn', () => {
  const F = L.normalize(L.PRESETS.fide);
  const ev = (g, lv = F) => L.evaluate(lv, G(g));
  assert.deepStrictEqual([ev([[0, 1], [0, 0]]).winner, ev([[0, 1], [0, 0]]).at], ['a', 0], 'cấp 0: 1,5–0,5');
  const r3 = ev([[0, 1], [0, -1], [1, 0], [1, 0], [2, 0], [2, 0], [3, 1], [3, 0]]);
  assert.deepStrictEqual([r3.done, r3.at, r3.winner], [true, 3, 'a'], 'thắng ở blitz 1,5–0,5');
  const arm = ev([[0, 0], [0, 0], [1, 0], [1, 0], [2, 0], [2, 0], [3, 0], [3, 0], [4, 0]]);
  assert.deepStrictEqual([arm.at, arm.winner, arm.levels[4].black], [4, 'b', 'b'], 'Armageddon hoà: Đen (ô dưới ở cấp 5) đi tiếp');
  assert.strictEqual(ev([[0, 1], [0, 0], [1, 0]]).error, 'ot_lad_extra', 'cấp 0 đã ngã ngũ');
  assert.strictEqual(ev([[1, 0]]).error, 'ot_lad_order', 'chưa xong cấp 0 mà nhập cấp 1');
  assert.strictEqual(ev([[0, 1]]).error, 'ot_lad_short', 'ván 1 thắng vẫn phải đấu ván 2');
  assert.strictEqual(ev([[0, 1], [0, -1], [1, 1], [1, 0]]).at, 1, 'cấp 1: ván 1 thắng, ván 2 hoà → 1,5–0,5');
  const short = L.normalize([{ games: 2 }, { arm: true, white: 300, black: 240 }]);
  assert.strictEqual(L.evaluate(short, G([[0, 0], [0, 0], [1, 1]])).at, 1, 'thang rút gọn: hoà cấp 0 là Armageddon');
  assert.deepStrictEqual(L.normalize([{ games: 2 }, { arm: true }, { games: 2 }]).length, 2, 'sau Armageddon không còn cấp nào');
});

test('Norway Chess: thắng tiêu chuẩn 3–0; hoà thì Armageddon 1,5 / 1 (giữ màu: Đen là ô dưới); không có hoà chung cuộc', () => {
  const [c] = off([{ type: 'roundrobin', groups: 1, meetings: 2, points: { w: 3, d: 0, l: 0, wx: 1.5, lx: 1 }, ladderKeep: true, matchLadder: L.PRESETS.norway }]);
  assert.deepStrictEqual(c.points, { w: 3, d: 0, l: 0, gw: 0, gt: 0, bye: 3, wx: 1.5, lx: 1 });
  const N = c.matchLadder;
  assert.deepStrictEqual(L.evaluate(N, G([[0, 0], [1, 0]]), null, false).winner, 'b', 'hoà cờ ở Armageddon: Đen (ô dưới) thắng');
  assert.deepStrictEqual(L.evaluate(N, G([[0, 0], [1, 1]]), null, false).winner, 'a');
  assert.strictEqual(L.evaluate(N, G([[0, -1], [1, 1]]), null, false).error, 'ot_lad_extra', 'thắng tiêu chuẩn thì không có Armageddon');
});

test('Armageddon đấu giá: giá thấp hơn cầm Đen; bằng giá → ra giá lại hoặc hạt giống cao cầm Đen; giá ngoài khoảng bị từ chối', () => {
  const B = L.normalize(L.PRESETS.bid), l = B[2];
  assert.strictEqual(L.bidBlack(l, [235, 300]), 'a');
  assert.strictEqual(L.bidBlack(l, [300, 300]), null);
  assert.strictEqual(L.bidBlack({ ...l, tieBid: 'higherSeed' }, [300, 300]), 'a');
  assert.deepStrictEqual(L.bidError(l, 30), { error: 'ot_bid_range', args: { a: 60, b: 300 } });
  const g = G([[0, 0], [0, 0], [1, 0], [1, 0], [2, 0]]);
  assert.strictEqual(L.evaluate(B, g, null).error, 'ot_bid_need');
  assert.strictEqual(L.evaluate(B, g, [235, 300]).winner, 'a', 'A ra 235 giây cầm Đen, hoà là thắng');
});

test('Đủ số ván kiểu OWL: Bo4 luôn đủ 4 map; 2–2 thì map 5 quyết định, không tính vào hiệu số; xếp theo hiệu số map đối đầu', () => {
  const [c] = off([{ type: 'roundrobin', groups: 1, bestOf: 4, fixed: true, decider: true, points: { w: 1, d: 0, l: 0 }, tiebreaks: ['gdiff', 'h2hMap'] }]);
  assert.deepStrictEqual([c.bestOf, c.fixed, c.decider], [4, true, true]);
  assert.strictEqual(off([{ type: 'roundrobin', groups: 1, bestOf: 4 }])[0].bestOf, 1, 'không đặt fixed: Bo4 không hợp lệ');
  assert.ok(ST.TIEBREAKS.includes('h2hMap'));
});

test('Các mẫu đợt 22 chạy trọn qua máy chủ (darts, FIDE World Cup, Norway Chess, Armageddon đấu giá, Davis Cup, OWL)', async () => {
  for (const tid of ['pdc_worlds', 'fide_world_cup', 'norway_chess', 'bid_final', 'davis_finals', 'owl_season']) {
    const { org, t, id, so } = await startTpl(tid);
    await playAllServer(org, t, id, so);
    assert.strictEqual(t.status, 'finished', tid);
    org.close();
  }
});

test('Qua máy chủ: OWL map 5 quyết định; Norway điểm 1,5 / 1; giá thầu ẩn tới khi đủ hai bên; huỷ kết quả xoá thang ván', async () => {
  // OWL: 2–2 rồi map 5
  {
    const { org, t, id } = await startTpl('owl_season');
    const st = t.st[0], m = ST.playable(st)[0];
    const bad = await org.req({ t: 'otScore', id, match: m.id, sets: [[1, 0], [1, 0], [1, 0], [0, 1], [1, 0]] }, 'error');
    assert.strictEqual(bad.code, 'ot_sets_after', '3–1 thì không có map 5');
    org.send({ t: 'otScore', id, match: m.id, sets: [[1, 0], [0, 1], [1, 0], [0, 1], [0, 1]] });
    await until(() => m.done);
    assert.deepStrictEqual([m.winner, m.wins[m.a], m.wins[m.b]], [m.b, 2, 2], 'map 5 quyết định, hiệu số map 0');
    org.close();
  }
  // Norway: hoà tiêu chuẩn, Armageddon hoà cờ → Đen (ô dưới, giữ màu) 1,5 điểm
  {
    const { org, t, id } = await startTpl('norway_chess');
    const st = t.st[0], m = ST.playable(st)[0];
    org.send({ t: 'otScore', id, match: m.id, ladder: [[0, 0], [1, 0]] });
    await until(() => m.done);
    const S = ST.standings(st, (u) => 1)[0].stats;
    assert.deepStrictEqual([m.winner, S[m.b].pts, S[m.a].pts, m.lad.at, m.lad.tc], [m.b, 1.5, 1, 1, 'armageddon']);
    org.send({ t: 'otUndo', id, match: m.id });
    await until(() => !m.done);
    assert.strictEqual(m.lad, null);
    org.close();
  }
  // Đấu giá: người xem chỉ thấy "đã nộp"
  {
    const { org, t, id } = await startTpl('bid_final');
    const st = t.st[0], m = ST.playable(st)[0];
    const out = await org.req({ t: 'otBid', id, match: m.id, side: 'a', sec: 30 }, 'error');
    assert.strictEqual(out.code, 'ot_bid_range');
    org.send({ t: 'otBid', id, match: m.id, side: 'a', sec: 235 });
    await until(() => m.bids);
    const v1 = (await org.req({ t: 'otGet', id }, 'ot', (x) => x.id === id && x.tour)).tour.stageViews[0].rounds[0].find((x) => x.id === m.id);
    assert.deepStrictEqual(v1.bids, [true, null], 'giá ẩn khi chưa đủ hai bên');
    org.send({ t: 'otBid', id, match: m.id, side: 'b', sec: 300 });
    await until(() => m.bids && m.bids[1] === 300);
    org.send({ t: 'otScore', id, match: m.id, ladder: [[0, 0], [0, 0], [1, 0], [1, 0], [2, 0]] });
    await until(() => m.done);
    assert.strictEqual(m.winner, m.a, 'A giá thấp hơn cầm Đen, hoà là thắng');
    // Bằng giá → ra giá lại
    const m2 = ST.playable(st).find((x) => x !== m);
    org.send({ t: 'otBid', id, match: m2.id, side: 'a', sec: 200 });
    org.send({ t: 'otBid', id, match: m2.id, side: 'b', sec: 200 });
    await until(() => m2.rebid === 1 && m2.bids === null);
    org.close();
  }
});

test('Chặng có playoff riêng (kiểu OWL 2018): xong chặng thì dựng playoff 3 đội (nhất chặng vào thẳng chung kết), không tính vào bảng mùa giải', () => {
  const seedOf = (u) => Number(u.slice(1)) + 1;
  const [c] = off([{ type: 'roundrobin', groups: 1, meetings: 2, points: { w: 1, d: 0, l: 0 }, splits: { n: 2, take: 3, bo: 5 }, advance: 2 }, { type: 'single' }]);
  assert.deepStrictEqual(c.splits, { n: 2, take: 3, bo: 5 });
  const st = ST.buildStage(c, 0, ['u0', 'u1', 'u2', 'u3', 'u4', 'u5'], { seedOf });
  const R = st.groups[0].rounds.length;
  const SPL = ST.SPL;
  // Đấu hết chặng 1 (hạt giống cao thắng) → có playoff chặng 1 ngay cả khi chặng 2 chưa đấu
  for (let k = 0; k < 40 && !st.sp; k++) for (const m of ST.playable(st)) if (SPL.blockOf(st.cfg, m.round, R) === 0) ST.recordResult(st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf });
  assert.ok(st.sp && st.sp[0] && !st.sp[1]);
  assert.deepStrictEqual(st.sp[0].seeds, ['u0', 'u1', 'u2']);
  const pm = st.sp[0].rounds.flat().map((id) => st.matches[id]);
  assert.strictEqual(pm.filter((m) => !m.bye).length, 2, '3 đội: một trận bán kết + chung kết (nhất chặng miễn đấu)');
  const before = JSON.stringify(ST.standings(st, seedOf)[0].stats.u2);
  const semi = pm.find((m) => !m.bye && m.a && m.b && !m.done);
  assert.ok(ST.playable(st).includes(semi), 'playoff chặng đấu được dù vòng tròn chưa xong');
  ST.recordResult(st, semi, 'u2', { seedOf });
  assert.strictEqual(JSON.stringify(ST.standings(st, seedOf)[0].stats.u2), before, 'không tính vào bảng mùa giải');
  // Huỷ một trận vòng tròn của chặng 1: playoff đã có trận đấu → khoá; trận cuối playoff huỷ được trước
  const rr = Object.values(st.matches).find((m) => m.sp == null && m.done && SPL.blockOf(st.cfg, m.round, R) === 0);
  assert.strictEqual(SPL.beforeUndo(st, rr), false);
  assert.strictEqual(E.estimate({ stages: [c, { type: 'single' }], players: 6 }).stages[0].matches, 30 + 2 * 2);
});
