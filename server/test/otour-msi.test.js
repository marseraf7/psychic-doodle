/*
 * Đợt 16 – kiểu LoL MSI 2018–2022, ghép cặp CS Major cũ, PGS 2023 / 2024 (chỉ mô phỏng thể thức):
 *   - vòng tròn 4 lượt, bảng ít đội gặp nhau nhiều lượt hơn (meetSmall); trận phụ cả ở hạng nhất (tbmTop);
 *   - hạt giống 1 chọn đối thủ bán kết (pick – otPick); Thụy Sĩ 'valve16' (1 gặp 16) và 'draw' (bốc thăm kiểu 2017);
 *   - dải hạng sau nhóm đi tiếp (routes after); đổi cặp bảng theo khối trận (rotBlock);
 *   - các mẫu chạy trọn qua máy chủ.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Race = require('../src/hub/stages-race.js');
const Spec = require('../src/hub/otour-spec.js');
const TP = require('../../caro/otour-templates.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const E = require('../../caro/tour-estimate.js');
const { ctx, account, until } = require('./otour-client.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const uids = (n) => Array.from({ length: n }, (_, i) => 'u' + i);
const seedOf = (u) => Number(u.slice(1)) + 1;
const win = (st, m, w) => ST.recordResult(st, m, w, { seedOf });

test('Vòng tròn 4 lượt (giải offline) và bảng ít đội gặp nhau nhiều lượt hơn (kiểu MSI 2021)', () => {
  assert.strictEqual(off([{ type: 'roundrobin', meetings: 4, advance: 2 }, { type: 'single' }])[0].meetings, 4);
  assert.strictEqual(ST.normalizeStages([{ type: 'roundrobin', meetings: 4, advance: 2 }, { type: 'single' }])[0].meetings, 1, 'giải Caro trực tuyến: tối đa 3');
  const [c] = off([{ type: 'roundrobin', groups: 3, meetings: 2, meetSmall: 4, advance: 2 }, { type: 'single' }]);
  const st = ST.buildStage(c, 0, uids(11), { seedOf });
  const per = st.groups.map((g) => [g.players.length, g.rounds.flat().filter((id) => !st.matches[id].bye).length]);
  assert.deepStrictEqual(per.sort(), [[3, 12], [4, 12], [4, 12]]);
  assert.strictEqual(E.estimate({ stages: [c, { type: 'single' }], players: 11 }).stages[0].matches, 36);
});

test('Trận phụ cả ở hạng nhất (tbmTop): bằng điểm ở hạng 1 thì đấu trận phụ, hạng 2 / 3 khác điểm thì không', () => {
  const [c] = off([{ type: 'roundrobin', groups: 1, meetings: 2, advance: 2, tbm: 'match', tbmTop: true }, { type: 'single' }]);
  assert.strictEqual(c.tbmTop, true);
  const st = ST.buildStage(c, 0, uids(4), { seedOf });
  // Hai lượt: u0 và u1 cùng 5 thắng (thắng nhau một trận), u2 và u3 cùng 1 thắng (thắng nhau một trận)
  for (const m of Object.values(st.matches)) {
    const pair = [m.a, m.b].sort().join();
    const w = pair === 'u0,u1' ? (m.round < 3 ? 'u0' : 'u1') : pair === 'u2,u3' ? (m.round < 3 ? 'u2' : 'u3') : seedOf(m.a) < seedOf(m.b) ? m.a : m.b;
    win(st, m, w);
  }
  const tbs = Object.values(st.matches).filter((m) => m.tb);
  assert.strictEqual(tbs.length, 1, 'hạng 2 / 3 không bằng điểm: chỉ trận phụ hạng nhất');
  assert.deepStrictEqual([tbs[0].a, tbs[0].b].sort(), ['u0', 'u1']);
  win(st, tbs[0], 'u1');
  assert.strictEqual(ST.standings(st, seedOf)[0].list[0], 'u1');
  assert.ok(st.done);
});

test('Ghép cặp CS Major trước 11/2023 (1 gặp 16) và kiểu 2017 (nhóm 1 gặp nhóm 4, sau đó cùng thành tích)', () => {
  const rec = { win: 3, lose: 3 };
  const [a] = off([{ type: 'swiss', record: rec, pairing: 'valve16' }, { type: 'single' }]);
  const st = ST.buildStage(a, 0, uids(16), { seedOf });
  const pairs = st.rounds[0].map((id) => [st.matches[id].a, st.matches[id].b].map(seedOf));
  assert.deepStrictEqual(pairs, Array.from({ length: 8 }, (_, i) => [i + 1, 16 - i]));
  const [b] = off([{ type: 'swiss', record: rec, pairing: 'draw' }, { type: 'single' }]);
  assert.strictEqual(off([{ type: 'swiss', pairing: 'draw' }, { type: 'single' }])[0].pairing, 'dutch', 'không theo thắng / thua');
  for (let k = 0; k < 5; k++) {
    const s2 = ST.buildStage(b, 0, uids(16), { seedOf });
    const pot = (u) => Math.floor((seedOf(u) - 1) / 4);
    for (const id of s2.rounds[0]) { const m = s2.matches[id]; assert.strictEqual(pot(m.a) + pot(m.b), 3, 'nhóm 1 – 4, 2 – 3'); }
    for (const id of s2.rounds[0]) { const m = s2.matches[id]; win(s2, m, m.a); }
    const R = ST.records(s2);
    for (const id of s2.rounds[1]) { const m = s2.matches[id]; assert.deepStrictEqual([R[m.a].w, R[m.a].l], [R[m.b].w, R[m.b].l], 'cùng thành tích'); }
  }
});

test('Dải hạng sau nhóm đi tiếp (routes after) và đổi cặp bảng theo khối trận (rotBlock)', () => {
  const s = off([{ type: 'race', events: 6, score: 'points', rot: true, rotBlock: 2, advance: 4, routes: [{ n: 2, to: 2, after: true }] }, { type: 'race', advance: 2 }, { type: 'race' }]);
  assert.deepStrictEqual([s[0].rotBlock, s[0].routes], [2, [{ n: 2, to: 2, after: true }]]);
  const st = ST.buildStage(s[0], 0, uids(9), { seedOf });
  const lob = st.events.map((ev) => Race.lobby(st, ev.i).join());
  assert.deepStrictEqual([lob[0] === lob[1], lob[2] === lob[3], lob[1] !== lob[2]], [true, true, true], 'mỗi cặp bảng 2 trận liền');
  for (const ev of st.events) { const l = Race.lobby(st, ev.i).sort((x, y) => seedOf(x) - seedOf(y)); Race.recordEvent(st, ev.i, l.map((uid, k) => ({ uid, rank: k + 1 }))); }
  const table = Race.raceTable(st, seedOf).list, sp = ST.splitAdvancers(st, seedOf);
  assert.deepStrictEqual(sp.seeds, table.slice(0, 4));
  assert.deepStrictEqual(sp.routes[0].uids, table.slice(4, 6), 'hạng 5–6 vào thẳng giai đoạn 3');
});

/** Tạo + bắt đầu giải từ mẫu qua máy chủ. */
async function startTpl(tid) {
  const tpl = TP.byId(tid);
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Kiểu ' + tid, spec: TP.specOf(tpl, SPORTS), teams: TP.sampleTeams(tpl, 'Đội') }, 'otCreated', undefined, 15000);
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running', 15000);
  return { org, t, id, so: ctx.app.hub.otSeedOf(t) };
}
/** Đấu hết các trận đang mở của giai đoạn hiện tại (hạt giống cao thắng) – trả khi sang giai đoạn khác / xong giải. */
async function playStage(org, t, id, so, beforeKo) {
  const s0 = t.stage;
  for (let g = 0; t.status === 'running' && t.stage === s0 && g < 60; g++) {
    const st = t.st[t.stage];
    if (beforeKo && st.cfg.pick && !st.picked) { await beforeKo(st); continue; }
    for (const m of ST.playable(st)) {
      const bo = ST.boOf(st, m), w = so(m.a) < so(m.b);
      org.send({ t: 'otScore', id, match: m.id, sets: Array.from({ length: (bo + 1) / 2 }, () => (w ? [1, 0] : [0, 1])) });
      await until(() => m.done || t.st[t.stage] !== st || t.status !== 'running');
    }
  }
}

test('Mẫu kiểu MSI 2018 qua máy chủ: Play-In → vòng 2 (2 cặp Bo5) → vòng bảng chính → nhất bảng chọn đối thủ bán kết', async () => {
  const { org, t, id, so } = await startTpl('msi18');
  const U = (n) => t.players[n - 1].uid;
  for (let k = 0; k < 3; k++) await playStage(org, t, id, so);
  assert.deepStrictEqual(t.st.map((s) => s.entrants.length), [8, 4, 6, 4]);
  const ko = t.st[3];
  assert.ok(ko.cfg.pick);
  // Chọn sai (hạt giống 2) → lỗi; chọn hạt giống 3 → 1 gặp 3
  const bad = await org.req({ t: 'otPick', id, opp: ko.entrants[1] }, 'error');
  assert.strictEqual(bad.code, 'ot_pick_bad');
  const s3 = ko.entrants[2];
  org.send({ t: 'otPick', id, opp: s3 });
  await until(() => t.st[3].picked === s3);
  const r0 = t.st[3].rounds[0].map((mid) => t.st[3].matches[mid]);
  assert.ok(r0.some((m) => [m.a, m.b].includes(t.st[3].entrants[0]) && [m.a, m.b].includes(s3)), 'hạt giống 1 gặp đội đã chọn');
  const again = await org.req({ t: 'otPick', id, opp: t.st[3].entrants[3] }, 'error');
  assert.strictEqual(again.code, 'ot_pick_bad', 'chỉ chọn một lần');
  const v = (await org.req({ t: 'otGet', id }, 'ot', (m) => m.id === id && m.tour)).tour.stageViews[3];
  assert.ok(v.pick && !v.pick.open && v.pick.picked.uid === s3);
  await playStage(org, t, id, so);
  assert.strictEqual(t.status, 'finished');
  assert.strictEqual(t.podium[0], U(1));
  org.close();
});

test('Mẫu kiểu MSI 2019 và MSI 2021–2022 chạy trọn qua máy chủ (vòng tranh suất thứ ba; bảng 3 đội 4 lượt)', async () => {
  for (const tid of ['msi19', 'msi21']) {
    const { org, t, id, so } = await startTpl(tid);
    for (let k = 0; k < 6 && t.status === 'running'; k++) await playStage(org, t, id, so, async (st) => { org.send({ t: 'otPick', id, opp: st.entrants[3] }); await until(() => t.st[t.stage].picked); });
    assert.strictEqual(t.status, 'finished', tid);
    if (tid === 'msi19') {
      assert.deepStrictEqual(t.st.map((s) => s.entrants.length), [8, 4, 2, 6, 4]);
      assert.strictEqual(t.st[3].entrants.filter((u) => t.st[1].entrants.includes(u)).length, 3, 'vòng bảng chính: 2 đội thắng vòng 2 + đội thắng trận tranh suất thứ ba');
    } else assert.deepStrictEqual(t.st.map((s) => s.entrants.length), [11, 6, 4]);
    assert.strictEqual(t.podium[0], t.players[0].uid, tid);
    org.close();
  }
});

test('Mẫu kiểu PGS 2023 / 2024 qua máy chủ: 3 bảng xoay vòng theo ngày; 8 đội cuối vòng bảng vào thẳng nhánh thua', async () => {
  for (const tid of ['pgs23', 'pgs24']) {
    const { org, t, id, so } = await startTpl(tid);
    for (let g = 0; t.status === 'running' && g < 120; g++) {
      const st = t.st[t.stage], ev = st.events.find((e) => !e.done);
      const rows = Race.lobby(st, ev.i).slice().sort((a, b) => so(a) - so(b)).map((uid, k) => ({ uid, rank: k + 1 }));
      org.send({ t: 'otRace', id, event: ev.i, rows });
      await until(() => ev.done, 8000);
    }
    assert.strictEqual(t.status, 'finished', tid);
    const U = (n) => t.players[n - 1].uid;
    if (tid === 'pgs23') {
      assert.deepStrictEqual(t.st.map((s) => s.entrants.length), [24, 16, 16, 16]);
      for (const n of [17, 24]) assert.ok(t.st[2].entrants.includes(U(n)), 'nhánh thua có đội ' + n);
      for (const n of [1, 8]) assert.ok(t.st[3].entrants.includes(U(n)) && !t.st[2].entrants.includes(U(n)), 'đội ' + n + ' vào thẳng chung kết');
    } else assert.deepStrictEqual(t.st.map((s) => s.entrants.length), [24, 16]);
    org.close();
  }
});

test('Mẫu mùa giải PGS: giải tổng 4 chặng, bảng điểm 300-180-120…', () => {
  const tpl = TP.byId('pgs_season');
  assert.deepStrictEqual(tpl.multi.table.slice(0, 4), [300, 180, 120, 90]);
  assert.strictEqual(tpl.multi.games.length, 4);
  for (const g of tpl.multi.games) assert.strictEqual(Spec.checkSize(Spec.normalizeSpec(TP.specOf(g, SPORTS)), 24).matches, 36);
});
