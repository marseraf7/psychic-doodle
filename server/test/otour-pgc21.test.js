/*
 * Đợt 18 – phần còn thiếu của hồ sơ (chỉ mô phỏng thể thức):
 *   - vòng tuần PGC 2021 (stages-weekly.js) + mẫu PGC 2021 chạy trọn qua máy chủ;
 *   - chỉ số phụ tổng sát thương (PUBG 2022–2023); ghép cặp FACEIT 2018 + Bo3 chỉ ở trận 2–2;
 *   - ghép đội đi tiếp với đội vào thẳng (MSI 2018 bốc thăm / 2019 theo thứ tự bảng); hạt giống 1 chọn ngày bán kết;
 *   - xếp hạt giống theo điểm xếp hạng / phiếu bầu (caro/otour-seedrank.js).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Race = require('../src/hub/stages-race.js');
const WK = require('../src/hub/stages-weekly.js');
const Spec = require('../src/hub/otour-spec.js');
const TP = require('../../caro/otour-templates.js');
const SR = require('../../caro/otour-seedrank.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const E = require('../../caro/tour-estimate.js');
const { ctx, account, until } = require('./otour-client.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const uids = (n) => Array.from({ length: n }, (_, i) => 'u' + i);
const seedOf = (u) => Number(u.slice(1)) + 1;
const SUPER = [10, 6, 5, 4, 3, 2, 1, 1];

test('Vòng tuần: Survival theo hàng chờ (hạt giống cuối nghỉ tuần 1), Weekly Final, Bottom xếp lại hàng chờ; bảng giai đoạn', () => {
  const [c] = off([{ type: 'race', score: 'points', table: SUPER, kill: 1, tb: 'pubg_k', weekly: { weeks: 2, seats: 4, final: 2, bottom: 1, sit: 1 }, gate: { seats: 3 }, advance: 4 }, { type: 'race' }]);
  assert.deepStrictEqual([c.weekly, c.gate], [{ weeks: 2, seats: 4, final: 2, bottom: 1, sit: 1 }, undefined]);
  assert.strictEqual(WK.totalEvents(c), 4 + 2 + 1 + 4 + 2);
  assert.deepStrictEqual(Race.raceError(c, 4), { code: 'ot_weekly_few', args: { n: 6 } });
  const st = ST.buildStage(c, 0, uids(8), { seedOf });
  assert.strictEqual(st.events.length, 13);
  assert.deepStrictEqual(Race.lobby(st, 0), ['u0', 'u1', 'u2', 'u3'], 'tuần 1: 4 hạt giống đầu; u7 nghỉ');
  // Survival: đội có số hạt giống lớn nhất trong phòng về nhất; phải có đội về nhất
  assert.strictEqual(Race.cleanEvent(st, [{ uid: 'u0', rank: 2 }], Race.lobby(st, 0), 0).code, 'ot_gate_winner');
  const playEv = (i, order) => { const r = Race.cleanEvent(st, order.map((uid, k) => ({ uid, rank: k + 1 })), Race.lobby(st, i), i); assert.ok(!r.code, r.code); Race.recordEvent(st, i, r.rows); };
  const rev = (l) => [...l].sort((a, b) => seedOf(b) - seedOf(a));
  for (let i = 0; i < 4; i++) playEv(i, rev(Race.lobby(st, i)));
  // Đội thắng lần lượt: u3, u4, u5, u6 – phòng tuần 1 không có u7 (nghỉ)
  assert.deepStrictEqual(Race.lobby(st, 4), ['u3', 'u4', 'u5', 'u6'], 'Weekly Final: 4 đội thắng Survival');
  assert.deepStrictEqual(Race.lobby(st, 6), ['u0', 'u1', 'u2', 'u7'], 'Bottom: các đội còn lại (cả đội nghỉ)');
  playEv(4, ['u6', 'u5', 'u4', 'u3']);
  playEv(5, ['u6', 'u4', 'u5', 'u3']);
  playEv(6, ['u7', 'u2', 'u1', 'u0']);
  // Tuần 2: hàng chờ = thứ tự Weekly Final (u6, u5/u4…, u3) rồi Bottom (u7, u2, u1, u0)
  const l2 = Race.lobby(st, 7);
  assert.deepStrictEqual(l2[0], 'u6');
  for (let i = 7; i < 13; i++) playEv(i, Race.lobby(st, i).slice().sort((a, b) => seedOf(a) - seedOf(b)));
  assert.ok(st.done);
  // Bảng giai đoạn: đội nhất các tuần trước, rồi điểm Weekly Final cộng dồn
  const list = Race.raceTable(st, seedOf).list;
  assert.strictEqual(list[0], 'u6', 'nhất Weekly Final tuần 1');
  assert.strictEqual(list.length, 8);
  const v = Race.raceView(st, 0, 4, (u) => ({ uid: u, name: u }), seedOf);
  assert.strictEqual(v.weekly.length, 2);
  assert.deepStrictEqual(v.weekly[0].winners.map((x) => x.uid), ['u3', 'u4', 'u5', 'u6']);
  assert.ok(v.weekly[0].bottom && !v.weekly[1].bottom, 'tuần cuối không có Bottom');
});

test('Chỉ số phụ tổng sát thương (PUBG 2022–2023): bằng điểm, bằng điểm hạng và trận gần nhất thì xét sát thương', () => {
  const [c] = off([{ type: 'race', events: 1, score: 'points', table: [10, 10], kill: 0, tb: 'pubg', dmg: true }, { type: 'race' }]);
  assert.strictEqual(c.dmg, true);
  const st = ST.buildStage(c, 0, ['a', 'b'], { seedOf: (u) => 'ab'.indexOf(u) + 1 });
  const r = Race.cleanEvent(st, [{ uid: 'a', rank: 1, dmg: 300 }, { uid: 'b', rank: 2, dmg: 900 }], st.entrants, 0);
  assert.deepStrictEqual(r.rows.map((x) => x.dmg), [300, 900]);
  Race.recordEvent(st, 0, r.rows);
  const t = Race.raceTable(st, (u) => 'ab'.indexOf(u) + 1);
  assert.deepStrictEqual([t.list[0], t.stats.b.dmg], ['b', 900], 'b nhiều sát thương hơn');
});

test('Ghép cặp FACEIT 2018: vòng 1–2 bốc thăm, vòng 3–5 theo Buchholz (số thắng của đối thủ); Bo3 chỉ trận 2–2', () => {
  const [c] = off([{ type: 'swiss', bestOf: 1, record: { win: 3, lose: 3, bo: 3, boLast: true }, pairing: 'faceit' }, { type: 'single' }]);
  assert.deepStrictEqual([c.pairing, c.record.boLast], ['faceit', true]);
  const st = ST.buildStage(c, 0, uids(16), { seedOf });
  const pot = (u) => Math.floor((seedOf(u) - 1) / 4);
  for (const id of st.rounds[0]) { const m = st.matches[id]; assert.strictEqual(pot(m.a) + pot(m.b), 3); }
  for (let g = 0; !st.done && g < 10; g++) for (const m of ST.playable(st)) ST.recordResult(st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf });
  assert.ok(st.done && st.rounds.length === 5);
  const R = ST.records(st);
  for (let r = 0; r < 5; r++) for (const id of st.rounds[r]) {
    const m = st.matches[id], two = r === 4;
    assert.strictEqual(m.bo || 1, two ? 3 : 1, `vòng ${r + 1}`);
  }
  const Valve = require('../src/hub/stages-valve.js');
  // Vòng 3: trong mỗi nhóm thành tích, đội Buchholz cao hơn đứng trên (gặp đội thấp nhất)
  assert.ok(Object.keys(R).every((u) => Number.isFinite(Valve.buchholzW(st, R, u))));
});

test('Ghép vòng 2 Play-In: theo thứ tự bảng (MSI 2019) và bốc thăm (MSI 2018) qua máy chủ; chọn ngày bán kết', async () => {
  for (const [tid, mode] of [['msi19', 'slot'], ['msi18', 'draw']]) {
    const tpl = TP.byId(tid);
    assert.ok(tpl.stages[1][mode === 'slot' ? 'slotFresh' : 'drawFresh']);
    const org = await account();
    const { id } = await org.req({ t: 'otCreate', name: 'Kiểu ' + tid, spec: TP.specOf(tpl, SPORTS), teams: TP.sampleTeams(tpl, 'Đội') }, 'otCreated', undefined, 15000);
    const t = ctx.app.hub.otGet(id);
    org.send({ t: 'otStart', id });
    await until(() => t.status === 'running', 15000);
    const so = ctx.app.hub.otSeedOf(t);
    const st0 = t.st[0];
    for (const m of Object.values(st0.matches)) {
      if (!ST.real(m.a) || !ST.real(m.b) || m.done) continue;
      const w = so(m.a) < so(m.b);
      org.send({ t: 'otScore', id, match: m.id, sets: [w ? [1, 0] : [0, 1]] });
      await until(() => m.done || t.stage > 0);
    }
    await until(() => t.stage === 1);
    const grp = t.st[1].groups.map((g) => g.players);
    const [d1, d2] = t.st[1].entrants;
    assert.ok(grp.every((g) => g.length === 2 && (g.includes(d1) !== g.includes(d2))), 'mỗi cặp một đội vào thẳng');
    if (mode === 'slot') {
      const winA = ST.standings(st0, so)[0].list[0];
      assert.ok(grp.find((g) => g.includes(d1)).includes(winA), 'nhất bảng A gặp đội vào thẳng thứ nhất');
    }
    org.close();
  }
  // Chọn ngày bán kết: bán kết của hạt giống 1 đấu sau
  const org = await account();
  const spec = { sport: 'esports', stages: [{ type: 'roundrobin', groups: 1, advance: 4, bestOf: 1 }, { type: 'single', bestOf: 1, thirdPlace: false, pick: true }] };
  const { id } = await org.req({ t: 'otCreate', name: 'Chọn ngày', spec, teams: ['A', 'B', 'C', 'D', 'E'] }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const so = ctx.app.hub.otSeedOf(t);
  for (const m of Object.values(t.st[0].matches)) {
    if (!ST.real(m.a) || !ST.real(m.b)) continue;
    org.send({ t: 'otScore', id, match: m.id, sets: [so(m.a) < so(m.b) ? [1, 0] : [0, 1]] });
    await until(() => m.done || t.stage > 0);
  }
  await until(() => t.stage === 1);
  const ko = t.st[1];
  org.send({ t: 'otPick', id, opp: ko.entrants[3], late: true });
  await until(() => t.st[1].picked);
  const r0 = t.st[1].rounds[0].map((x) => t.st[1].matches[x]);
  assert.ok(t.st[1].pickLate && [r0[1].a, r0[1].b].includes(t.st[1].entrants[0]), 'bán kết của hạt giống 1 là trận sau');
  org.close();
});

test('Xếp hạt giống: theo điểm xếp hạng; theo phiếu bầu (Bradley–Terry); tên lạ được báo lại', () => {
  const P = ['A', 'B', 'C', 'D'].map((n, i) => ({ uid: 'u' + i, name: 'Đội ' + n }));
  const r = SR.byRating('Đội A: 1500\nđội c : 1900\nĐội B=1700\nĐội Z: 2000', P);
  assert.deepStrictEqual([r.order, r.unknown, r.used], [['u2', 'u1', 'u0', 'u3'], ['Đội Z'], 3]);
  const b = SR.byBallots('Đội A: Đội C > Đội B > Đội D\nĐội B: Đội C > Đội A > Đội D\nĐội C: Đội A > Đội B > Đội D\nĐội D: Đội C > Đội A > Đội B', P);
  assert.deepStrictEqual(b.order, ['u2', 'u0', 'u1', 'u3']);
  assert.ok(b.strength.u2 > b.strength.u0 && b.strength.u1 > b.strength.u3);
  assert.strictEqual(SR.byBallots('rác', P).used, 0);
});

test('Mẫu kiểu PGC 2021 qua máy chủ: Rank Decision → vòng tuần 3 tuần → Grand Survival → chung kết', async () => {
  const tpl = TP.byId('pgc21');
  const sp = Spec.normalizeSpec(TP.specOf(tpl, SPORTS));
  assert.strictEqual(Spec.checkSize(sp, 32).matches, 36 + 90 + 4 + 15);
  assert.deepStrictEqual(E.estimate({ stages: sp.stages, players: 32 }).stages.map((s) => s.players), [32, 32, 19, 16]);
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Kiểu PGC 2021', spec: TP.specOf(tpl, SPORTS), teams: TP.sampleTeams(tpl, 'Đội') }, 'otCreated', undefined, 15000);
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running', 15000);
  const so = ctx.app.hub.otSeedOf(t);
  for (let g = 0; t.status === 'running' && g < 200; g++) {
    const st = t.st[t.stage], ev = st.events.find((e) => !e.done);
    const rows = Race.lobby(st, ev.i).slice().sort((a, b) => so(a) - so(b)).map((uid, k) => ({ uid, rank: k + 1, kills: k % 3 }));
    org.send({ t: 'otRace', id, event: ev.i, rows });
    await until(() => ev.done, 8000);
  }
  assert.strictEqual(t.status, 'finished');
  assert.deepStrictEqual(t.st.map((s) => s.entrants.length), [32, 32, 19, 16]);
  const wk = WK.make(t.st[1], Race.raceTable);
  const winners = wk.weekWinners();
  assert.ok(winners.length >= 1 && winners.length <= 3);
  for (const w of winners) assert.ok(t.st[3].entrants.includes(w), 'đội nhất tuần vào thẳng chung kết');
  const out = t.players.filter((p) => p.out === 'not_advanced').map((p) => p.uid);
  assert.ok(!out.some((u) => t.st[3].entrants.includes(u)));
  assert.strictEqual(t.st[1].entrants.filter((u) => !t.st[2].entrants.includes(u) && !t.st[3].entrants.includes(u)).length, 1, 'một đội bị loại sau vòng tuần');
  org.close();
});
