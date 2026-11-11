/*
 * Đợt 14 – thể thức PUBG Global Championship 2019 / 2022 / 2023 (chỉ mô phỏng thể thức):
 *   - dải hạng vào thẳng giai đoạn sau nữa (routes), tối đa 6 giai đoạn, đội vào thẳng xếp sau (directLast);
 *   - cổng thắng trận (gate – Grand Survival), mang nguyên điểm (carry), xoay N bảng (rot 4–8), chỉ số phụ PUBG cũ (pubg_k);
 *   - ba mẫu chạy trọn qua máy chủ; đội được chuyển thẳng không bị ghi "không đi tiếp"; phòng đấu được kiểm ở máy chủ.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Race = require('../src/hub/stages-race.js');
const Spec = require('../src/hub/otour-spec.js');
const RU = require('../../caro/otour-rules.js');
const TP = require('../../caro/otour-templates.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const E = require('../../caro/tour-estimate.js');
const { ctx, account, until } = require('./otour-client.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const uids = (n) => Array.from({ length: n }, (_, i) => 'u' + i);
const seedOf = (u) => Number(u.slice(1)) + 1;
const race = (c) => ({ type: 'race', events: 1, score: 'points', table: [10, 6, 5, 4, 3, 2, 1, 1], ...c });
/** Nhập một chặng: xếp hạng theo thứ tự danh sách. */
const play = (st, i, order, kills = {}) => {
  const ev = Race.cleanEvent(st, order.map((uid, k) => ({ uid, rank: k + 1, kills: kills[uid] || 0 })), Race.lobby(st, i));
  assert.ok(!ev.code, ev.code);
  Race.recordEvent(st, i, ev.rows);
};

test('Dải hạng (routes): chuẩn hoá – chỉ giai đoạn giữa không loại trực tiếp, đích ≥ i + 2, không vào playoff; advance 0 được giữ', () => {
  const s = off([race({ routes: [{ n: 8, to: 3 }, { n: 7, to: 4 }, { n: 2, to: 1 }], advance: 0 }), race({ advance: 8 }), race({ advance: 8 }), race({ advance: 4 }), race({})]);
  assert.deepStrictEqual(s[0].routes, [{ n: 8, to: 3 }, { n: 7, to: 4 }], 'bỏ đích quá gần');
  assert.strictEqual(s[0].advance, 0);
  assert.strictEqual(off([{ type: 'single', routes: [{ n: 2, to: 2 }], advance: 2 }, race({ advance: 2 }), race({})])[0].routes, undefined, 'loại trực tiếp không có dải hạng');
  assert.strictEqual(off([race({ routes: [{ n: 2, to: 2 }] }), race({})])[0].routes, undefined, 'không còn giai đoạn sau nữa');
  // Không có dải hạng hợp lệ: advance 0 thành mặc định
  assert.ok(off([race({ routes: [{ n: 2, to: 1 }], advance: 0 }), race({ advance: 2 }), race({})])[0].advance > 0);
  // routes thay cho skip
  assert.strictEqual(off([race({ skip: 2, routes: [{ n: 2, to: 2 }] }), race({ advance: 2 }), race({})])[0].skip, undefined);
  // Tối đa 6 giai đoạn; JSON 7 giai đoạn báo lỗi
  assert.strictEqual(off(Array.from({ length: 7 }, () => race({ advance: 4 }))).length, 6);
  assert.throws(() => Spec.normalizeSpec({ sport: 'esports', stages: Array.from({ length: 7 }, () => race({ advance: 4 })) }), (e) => e.code === 'ot_spec_stages');
  // directLast chỉ ở giai đoạn sau giai đoạn 1
  const d = off([race({ advance: 4, directLast: true }), race({ directLast: true })]);
  assert.deepStrictEqual([d[0].directLast, d[1].directLast], [undefined, true]);
});

test('Dải hạng qua splitAdvancers: chia 2 bảng – hạng 1–2 mỗi bảng sang giai đoạn 3, hạng 3–4 đi tiếp, còn lại bị loại', () => {
  const [c] = off([race({ groups: 2, routes: [{ n: 2, to: 2 }], advance: 2 }), race({ advance: 4 }), race({})]);
  const st = ST.buildStage(c, 0, uids(12), { seedOf });
  for (const ev of st.events) play(st, ev.i, Race.lobby(st, ev.i).slice().sort((a, b) => seedOf(a) - seedOf(b)));
  assert.ok(st.done);
  const sp = ST.splitAdvancers(st, seedOf);
  // Chia rắn: bảng A = u0, u3, u4, u7, u8, u11; bảng B = u1, u2, u5, u6, u9, u10
  assert.deepStrictEqual(new Set(sp.routes[0].uids), new Set(['u0', 'u3', 'u1', 'u2']));
  assert.strictEqual(sp.routes[0].to, 2);
  assert.deepStrictEqual(new Set(sp.seeds), new Set(['u4', 'u7', 'u5', 'u6']));
});

test('Cổng thắng trận: phòng đấu theo hàng chờ, đội về nhất rời phòng; phải có đội về nhất; nhập lần lượt', () => {
  const [c] = off([race({ events: 3, gate: { seats: 4 }, groups: 2, rot: true }), race({})]);
  assert.deepStrictEqual([c.gate, c.advance, c.groups, c.rot], [{ seats: 4 }, 3, undefined, undefined]);
  const st = ST.buildStage(c, 0, uids(6), { seedOf });
  assert.deepStrictEqual(Race.lobby(st, 0), ['u0', 'u1', 'u2', 'u3']);
  // Không có đội về nhất → lỗi
  assert.strictEqual(Race.cleanEvent(st, [{ uid: 'u0', rank: 2 }, { uid: 'u1', dnf: true }], Race.lobby(st, 0)).code, 'ot_gate_winner');
  // Đội ngoài phòng đấu không nhập được
  assert.ok(Race.cleanEvent(st, [{ uid: 'u5', rank: 1 }], Race.lobby(st, 0)).code);
  play(st, 0, ['u2', 'u0', 'u1', 'u3']);
  assert.deepStrictEqual(Race.lobby(st, 1), ['u0', 'u1', 'u3', 'u4'], 'u2 rời phòng, u4 vào thay');
  play(st, 1, ['u4', 'u0', 'u1', 'u3']);
  assert.deepStrictEqual(Race.lobby(st, 2), ['u0', 'u1', 'u3', 'u5']);
  play(st, 2, ['u0', 'u1', 'u3', 'u5']);
  assert.ok(st.done);
  assert.deepStrictEqual(ST.splitAdvancers(st, seedOf).seeds, ['u2', 'u4', 'u0'], 'đội thắng theo thứ tự trận');
  // Bảng xem: chặng chưa nhập kế tiếp có phòng đấu
  const st2 = ST.buildStage(c, 0, uids(6), { seedOf });
  const v = Race.raceView(st2, 0, 3, (u) => ({ uid: u, name: u }), seedOf);
  assert.deepStrictEqual(v.events[0].lobby, ['u0', 'u1', 'u2', 'u3']);
  assert.strictEqual(v.events[1].lobby, undefined);
});

test('Xoay N bảng: 4 bảng – các cặp bảng lần lượt gặp nhau, mỗi đội đấu 3/6 trận', () => {
  assert.deepStrictEqual(RU.rotPairs(4), [[0, 3], [1, 2], [0, 2], [1, 3], [0, 1], [2, 3]]);
  const [c] = off([race({ events: 6, rot: 4 }), race({})]);
  assert.strictEqual(c.rot, 4);
  assert.strictEqual(off([race({ rot: 3 })])[0].rot, true, '3 bảng giữ cách ghi cũ');
  const st = ST.buildStage(c, 0, uids(8), { seedOf });
  const cnt = {};
  for (let i = 0; i < 6; i++) { const l = Race.lobby(st, i); assert.strictEqual(l.length, 4); for (const u of l) cnt[u] = (cnt[u] || 0) + 1; }
  assert.ok(Object.values(cnt).every((n) => n === 3));
  assert.deepStrictEqual(Race.lobby(st, 0), ['u0', 'u3', 'u4', 'u7']);
});

test('Chỉ số phụ PUBG cũ: bằng điểm xét tổng hạ gục, rồi điểm trận cao nhất, hạ gục trận đó', () => {
  const [c] = off([race({ events: 2, kill: 1, tb: 'pubg_k' }), race({})]);
  const st = ST.buildStage(c, 0, ['a', 'b', 'c'], { seedOf: (u) => 'abc'.indexOf(u) + 1 });
  // a: 10 + 4 = 14 (0 hạ gục); b: 6 + 1 + 6 = … dựng sao cho a, b cùng 14 điểm, b nhiều hạ gục hơn
  play(st, 0, ['a', 'b', 'c'], { b: 2 }); // a 10, b 6 + 2 = 8, c 5
  play(st, 1, ['b', 'c', 'a'], { b: 0 }); // b + 10 = 18? điều chỉnh bằng điểm sửa tay ở dưới
  assert.strictEqual(Race.raceTable(st, (u) => 'abc'.indexOf(u) + 1).list[0], 'b');
  // Trường hợp bằng điểm: dùng điểm sửa tay
  const st2 = ST.buildStage(c, 0, ['a', 'b'], { seedOf: (u) => 'ab'.indexOf(u) + 1 });
  Race.recordEvent(st2, 0, [{ uid: 'a', rank: 1, kills: 0, pts: 10 }, { uid: 'b', rank: 2, kills: 4, pts: 10 }]);
  Race.recordEvent(st2, 1, [{ uid: 'a', rank: 1, kills: 0, pts: 5 }, { uid: 'b', rank: 2, kills: 0, pts: 5 }]);
  assert.strictEqual(Race.raceTable(st2, (u) => 'ab'.indexOf(u) + 1).list[0], 'b', 'bằng 15 điểm: b nhiều hạ gục hơn');
  const c2 = { ...c, tb: 'pubg' };
  const st3 = ST.buildStage(c2, 0, ['a', 'b'], { seedOf: (u) => 'ab'.indexOf(u) + 1 });
  Race.recordEvent(st3, 0, [{ uid: 'a', rank: 1, kills: 0, pts: 10 }, { uid: 'b', rank: 2, kills: 4, pts: 10 }]);
  Race.recordEvent(st3, 1, [{ uid: 'a', rank: 1, kills: 0, pts: 5 }, { uid: 'b', rank: 2, kills: 0, pts: 5 }]);
  assert.strictEqual(Race.raceTable(st3, (u) => 'ab'.indexOf(u) + 1).list[0], 'a', 'kiểu mới: tổng điểm hạng trước');
});

test('Ước tính mẫu PGC 2019 / 2022 / 2023 khớp số đội từng giai đoạn', () => {
  const want = { pgc19: [32, 16, 24, 16], pgc22: [32, 16, 16, 16, 19, 16], pgc23: [32, 16, 16, 16, 16] };
  for (const [id, sizes] of Object.entries(want)) {
    const sp = Spec.normalizeSpec(TP.specOf(TP.byId(id), SPORTS));
    const e = Spec.checkSize(sp, 32);
    assert.deepStrictEqual(e.stages.map((s) => s.players), sizes, id);
    const ce = E.estimate({ stages: sp.stages, players: 32 });
    assert.deepStrictEqual(ce.stages.map((s) => s.players), sizes, id + ' (trình duyệt)');
  }
});

/** Chạy trọn một mẫu qua máy chủ: mỗi chặng xếp hạng theo hạt giống trong phòng đấu (hạt giống cao về nhất). */
async function runTpl(tid, killsOf = () => 0) {
  const tpl = TP.byId(tid);
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Kiểu ' + tid, spec: TP.specOf(tpl, SPORTS), teams: TP.sampleTeams(tpl, 'Đội') }, 'otCreated', undefined, 15000);
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running', 15000);
  const so = ctx.app.hub.otSeedOf(t);
  const snap = [];
  for (let g = 0; t.status === 'running' && g < 400; g++) {
    const st = t.st[t.stage], ev = st.events.find((e) => !e.done);
    const rows = Race.lobby(st, ev.i).slice().sort((a, b) => so(a) - so(b)).map((uid, k) => ({ uid, rank: k + 1, kills: killsOf(uid, k) }));
    org.send({ t: 'otRace', id, event: ev.i, rows });
    await until(() => ev.done, 8000);
    if (!snap[t.stage]) snap[t.stage] = { head: { ...(t.st[t.stage].head || {}) } };
  }
  return { org, t, id, U: (n) => t.players[n - 1].uid };
}

test('Mẫu kiểu PGC 2019 qua máy chủ: 8 đội đầu mỗi bảng vào thẳng bán kết, vòng loại mang điểm, bán kết 3 bảng xoay vòng', async () => {
  const { org, t, U } = await runTpl('pgc19', () => 1); // mọi đội 1 hạ gục: đội hạng 9–16 cũng có điểm để mang sang
  assert.strictEqual(t.status, 'finished');
  assert.deepStrictEqual(t.st.map((st) => st.entrants.length), [32, 16, 24, 16]);
  // Hạt giống 1–16 (hạng 1–8 mỗi bảng) vào thẳng bán kết, không bị ghi "không đi tiếp"
  for (let n = 1; n <= 16; n++) assert.ok(t.st[2].entrants.includes(U(n)), 'hạt giống ' + n + ' vào thẳng bán kết');
  assert.ok(!t.st[1].entrants.includes(U(1)));
  assert.deepStrictEqual(new Set(t.st[1].entrants), new Set(Array.from({ length: 16 }, (_, i) => U(17 + i))));
  // Vòng loại: mang nguyên điểm vòng bảng (đội có điểm ở vòng bảng thì có điểm cộng sẵn)
  assert.ok(Object.keys(t.st[1].head || {}).length > 0, 'mang điểm');
  for (const [u, p] of Object.entries(t.st[1].head)) assert.strictEqual(p, ST.standings(t.st[0], ctx.app.hub.otSeedOf(t)).flatMap((x) => x.list.map((v) => [v, x.stats[v].pts])).find(([v]) => v === u)[1]);
  assert.strictEqual(t.st[2].cfg.rot, true);
  assert.strictEqual(t.podium[0], U(1));
  assert.ok(t.players.filter((p) => p.out === 'not_advanced').length === 32 - 16 - 8 + 8, '8 đội bị loại ở vòng loại, 8 ở bán kết');
  org.close();
});

test('Mẫu kiểu PGC 2022 qua máy chủ: nhánh thắng / 2 nhánh thua song song, Grand Survival theo cổng thắng trận', async () => {
  const { org, t, U } = await runTpl('pgc22');
  assert.strictEqual(t.status, 'finished');
  assert.deepStrictEqual(t.st.map((st) => st.entrants.length), [32, 16, 16, 16, 19, 16]);
  const so = ctx.app.hub.otSeedOf(t);
  const range = (a, b) => new Set(Array.from({ length: b - a + 1 }, (_, i) => U(a + i)));
  assert.deepStrictEqual(new Set(t.st[1].entrants), range(17, 32), 'nhánh thua 1: hạng 9–16 mỗi bảng');
  assert.deepStrictEqual(new Set(t.st[2].entrants), range(1, 16), 'nhánh thắng: hạng 1–8 mỗi bảng');
  // Nhánh thua 2: 8 đội đầu nhánh thua 1 + 8 đội sau nhánh thắng
  assert.deepStrictEqual(new Set(t.st[3].entrants), new Set([...range(17, 24), ...range(9, 16)]));
  // Grand Survival: 12 đội cuối nhánh thua 2 xếp trước, 7 đội từ nhánh thua 1 (hạng 9–15) xếp sau (directLast)
  const gs = t.st[4].entrants;
  assert.deepStrictEqual(new Set(gs.slice(12)), range(25, 31));
  assert.ok(!gs.includes(U(32)), 'hạng 16 nhánh thua 1 bị loại');
  // Chung kết: 8 đội nhánh thắng + 4 nhánh thua 2 + 4 đội thắng trận Grand Survival
  const fin = new Set(t.st[5].entrants);
  for (const u of range(1, 8)) assert.ok(fin.has(u));
  for (const w of Race.gateWinners(t.st[4])) assert.ok(fin.has(w));
  assert.strictEqual(Race.gateWinners(t.st[4]).length, 4);
  assert.strictEqual(t.podium[0], U(1));
  // Trang xem: đội vào thẳng có nhãn giai đoạn đích
  const v = (await org.req({ t: 'otGet', id: t.id }, 'ot', (m) => m.id === t.id && m.tour)).tour.stageViews[1];
  const tag = v.table.filter((x) => x.skip).map((x) => x.to);
  assert.deepStrictEqual([tag.filter((x) => x === 4).length, tag.filter((x) => x === 5).length], [8, 7]);
  assert.ok(so(gs[0]) > 0);
  org.close();
});

test('Mẫu kiểu PGC 2023 qua máy chủ: nhánh thua đấu trước, nhánh thắng vào thẳng chung kết, Last Chance', async () => {
  const { org, t, U } = await runTpl('pgc23');
  assert.strictEqual(t.status, 'finished');
  assert.deepStrictEqual(t.st.map((st) => st.entrants.length), [32, 16, 16, 16, 16]);
  const range = (a, b) => new Set(Array.from({ length: b - a + 1 }, (_, i) => U(a + i)));
  assert.deepStrictEqual(new Set(t.st[3].entrants), new Set([...range(17, 24), ...range(9, 16)]), 'Last Chance');
  assert.deepStrictEqual(new Set(t.st[4].entrants), new Set([...range(1, 8), ...range(9, 16)]), 'chung kết');
  for (const n of [25, 32]) assert.strictEqual(t.players.find((p) => p.uid === U(n)).out, 'not_advanced');
  for (const n of [1, 9]) assert.notStrictEqual(t.players.find((p) => p.uid === U(n)).out, 'not_advanced');
  org.close();
});

// ---------------------------------------------------------------- Đợt 15: hệ Circuit (kiểu PGC 2024)
const CI = require('../src/hub/stages-circuit.js');

test('Hệ Circuit: ngày 1 hạng 9–24, ngày 2 giữ 12 + hạng 5–8, Final giữ 12 + hạng 1–4; vòng sau theo kết quả vòng trước', () => {
  const [c] = off([race({ events: 2, kill: 1, tb: 'pubg', circuit: { n: 2, days: 3, keep: 12, late: [4, 4] }, groups: 2, rot: true, advance: 16 }), race({})]);
  assert.deepStrictEqual([c.circuit, c.groups, c.rot], [{ n: 2, days: 3, keep: 12, late: [4, 4] }, undefined, undefined]);
  assert.deepStrictEqual(CI.daySizes(c, 24), [16, 16, 16]);
  assert.strictEqual(Race.raceError(c, 24), null);
  assert.deepStrictEqual(Race.raceError(c, 20), { code: 'ot_circuit_few', args: { n: 21 } });
  const st = ST.buildStage(c, 0, uids(24), { seedOf });
  assert.strictEqual(st.events.length, 12);
  const lob = [];
  // Mỗi trận: hạt giống thấp hơn về trước (đảo ngược) – để thứ tự các ngày khác thứ tự hạt giống
  for (const ev of st.events) { const l = Race.lobby(st, ev.i); lob.push(l.map(seedOf)); play(st, ev.i, [...l].sort((a, b) => seedOf(b) - seedOf(a))); }
  assert.deepStrictEqual(lob[0], Array.from({ length: 16 }, (_, k) => 9 + k), 'ngày 1: hạng 9–24');
  assert.deepStrictEqual(lob[2].slice(12), [5, 6, 7, 8], 'ngày 2: thêm hạng 5–8');
  assert.deepStrictEqual(lob[4].slice(12), [1, 2, 3, 4], 'Final: thêm hạng 1–4');
  assert.deepStrictEqual(lob[2].slice(0, 12), [24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13], 'ngày 2: 12 đội đầu ngày 1');
  // Vòng 2, ngày 1: hạng 9–24 của vòng 1 = hạng 9–16 Final, 4 đội dừng ở ngày 2, 4 đội dừng ở ngày 1
  assert.deepStrictEqual(lob[6], [16, 15, 14, 13, 4, 3, 2, 1, 8, 7, 6, 5, 12, 11, 10, 9]);
  assert.deepStrictEqual(lob[10].slice(12), [24, 23, 22, 21], 'vòng 2 Final: hạng 1–4 của vòng 1');
  assert.ok(st.done);
  // Chỉ điểm ngày Final cộng dồn: đội hạt giống 9–12 (dừng ở ngày 1 vòng 1, ngày 1 vòng 2 rồi …) có điểm 0 nếu chưa vào Final
  const tb = Race.raceTable(st, seedOf);
  const ptsOf = (n) => tb.stats['u' + (n - 1)].pts;
  const finals = st.events.filter((e) => CI.isFinal(c, e.i));
  const sum = (n) => finals.reduce((a, e) => a + (e.rows.filter((x) => x.uid === 'u' + (n - 1)).map((x) => Race.rowPts(c, x))[0] || 0), 0);
  for (let n = 1; n <= 24; n++) assert.strictEqual(ptsOf(n), sum(n), 'đội ' + n);
  assert.strictEqual(ST.splitAdvancers(st, seedOf).seeds.length, 16);
});

test('Hệ Circuit qua máy chủ (mẫu kiểu PGC 2024): nhập lần lượt, chỉ đội của ngày; 16 đội điểm Final cao nhất vào chung kết', async () => {
  const tpl = TP.byId('pgc24');
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Kiểu PGC 2024', spec: TP.specOf(tpl, SPORTS), teams: TP.sampleTeams(tpl, 'Đội') }, 'otCreated', undefined, 15000);
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running', 15000);
  assert.deepStrictEqual([t.st[0].entrants.length, t.st[0].events.length], [24, 54]);
  const U = (n) => t.players[n - 1].uid, so = ctx.app.hub.otSeedOf(t);
  // Đội hạt giống 1 chưa đấu ngày 1; nhập trận 2 trước trận 1 cũng bị chặn
  const bad = await org.req({ t: 'otRace', id, event: 0, rows: [{ uid: U(1), rank: 1 }] }, 'error');
  assert.ok(bad.code);
  const skip = await org.req({ t: 'otRace', id, event: 1, rows: Race.lobby(t.st[0], 1).map((uid, k) => ({ uid, rank: k + 1 })) }, 'error');
  assert.strictEqual(skip.code, 'ot_gt_seq');
  // Trang xem: trận kế tiếp có danh sách đội, bảng ngày đang đấu
  let v = (await org.req({ t: 'otGet', id }, 'ot', (m) => m.id === id && m.tour)).tour.stageViews[0];
  assert.strictEqual(v.events[0].lobby.length, 16);
  assert.deepStrictEqual(v.circuit.map((d) => [d.c, d.j]), [[0, 0]]);
  for (let g = 0; t.status === 'running' && g < 100; g++) {
    const st = t.st[t.stage], ev = st.events.find((e) => !e.done);
    const rows = Race.lobby(st, ev.i).slice().sort((a, b) => so(a) - so(b)).map((uid, k) => ({ uid, rank: k + 1, kills: k % 3 }));
    org.send({ t: 'otRace', id, event: ev.i, rows });
    await until(() => ev.done, 8000);
    if (t.stage === 0 && ev.i === 20) {
      v = (await org.req({ t: 'otGet', id }, 'ot', (m) => m.id === id && m.tour)).tour.stageViews[0];
      assert.deepStrictEqual(v.circuit.map((d) => [d.c, d.j, d.final]), [[0, 0, false], [0, 1, false], [0, 2, true], [1, 0, false]]);
      assert.strictEqual(v.circuit[0].table.filter((x) => x.adv).length, 12);
    }
  }
  assert.strictEqual(t.status, 'finished');
  assert.deepStrictEqual(t.st.map((st) => st.entrants.length), [24, 16]);
  // Chung kết: đúng 16 đội có tổng điểm các ngày Final cao nhất; không mang điểm
  const tb = Race.raceTable(t.st[0], so);
  assert.deepStrictEqual(new Set(t.st[1].entrants), new Set(tb.list.slice(0, 16)));
  assert.ok(!t.st[1].head || !Object.keys(t.st[1].head).length);
  assert.strictEqual(t.podium[0], U(1));
  org.close();
});
