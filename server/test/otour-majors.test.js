'use strict';
// Đợt 10–12 – thể thức các giải Esports lớn. Đợt 10: ghép cặp Thụy Sĩ kiểu CS Major (stages-valve.js – theo luật công khai
// của Valve: vòng 1 hạt giống i gặp i + n/2; sau đó cùng thành tích, theo độ khó rồi hạt giống giai đoạn, cao gặp thấp; nhóm
// 6 đội theo bảng ưu tiên), giải offline tối đa 4 giai đoạn, mẫu kiểu CS Major (3 giai đoạn Thụy Sĩ + playoff).
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Valve = require('../src/hub/stages-valve.js');
const Spec = require('../src/hub/otour-spec.js');
const TP = require('../../caro/otour-templates.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const E = require('../../caro/tour-estimate.js');
const { ctx, account, until } = require('./otour-client.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const mkSeeds = (n) => { const s = Array.from({ length: n }, (_, i) => 'u' + i); return { s, seedOf: (u) => s.indexOf(u) + 1 }; };
const ids = (st, r) => st.rounds[r].map((id) => st.matches[id]).filter((m) => !m.bye).map((m) => m.a + '-' + m.b);

test('Kiểu CS Major: chỉ Thụy Sĩ theo thắng / thua của giải offline; giải offline tối đa 4 giai đoạn, giải Caro 3', () => {
  assert.strictEqual(off([{ type: 'swiss', record: { win: 3, lose: 3 }, pairing: 'valve' }])[0].pairing, 'valve');
  assert.strictEqual(off([{ type: 'swiss', pairing: 'valve' }])[0].pairing, 'dutch', 'không theo thắng / thua');
  assert.strictEqual(ST.normalizeStages([{ type: 'swiss', record: { win: 3, lose: 3 }, pairing: 'valve' }])[0].pairing, 'dutch', 'giải Caro trực tuyến');
  assert.strictEqual(off(Array.from({ length: 6 }, () => ({ type: 'swiss', record: { win: 3, lose: 3 } }))).length, 4);
  assert.strictEqual(ST.normalizeStages(Array.from({ length: 6 }, () => ({ type: 'swiss' }))).length, 3);
  assert.throws(() => Spec.normalizeSpec({ sport: 'esports', stages: Array.from({ length: 5 }, () => ({ type: 'single' })) }), (e) => e.code === 'ot_spec_stages');
  // Vào thẳng giai đoạn 3 (skip) chỉ từ giai đoạn 1
  const four = off([{ type: 'swiss', skip: 2 }, { type: 'swiss', skip: 2 }, { type: 'swiss' }, { type: 'single' }]);
  assert.deepStrictEqual(four.map((c) => c.skip || 0), [2, 0, 0, 0]);
});

test('Kiểu CS Major: vòng 1 hạt giống i gặp i + 8; vòng 2–3 cao gặp thấp theo độ khó; không gặp lại; Bo3 trận quyết định', () => {
  const [c] = off([{ type: 'swiss', bestOf: 1, record: { win: 3, lose: 3, bo: 3 }, pairing: 'valve' }, { type: 'single' }]);
  const { s, seedOf } = mkSeeds(16);
  const st = ST.buildStage(c, 0, s, { seedOf });
  assert.deepStrictEqual(ids(st, 0), ['u0-u8', 'u1-u9', 'u2-u10', 'u3-u11', 'u4-u12', 'u5-u13', 'u6-u14', 'u7-u15']);
  // Bất ngờ: u8 thắng u0
  for (const m of ST.playable(st)) ST.recordResult(st, m, m.a === 'u0' ? 'u8' : m.a, { seedOf });
  // Nhóm 1–0: độ khó bằng nhau (đối thủ đều 0–1) → theo hạt giống giai đoạn: u1…u7, u8 → u1 gặp u8, u2 gặp u7…
  assert.deepStrictEqual(ids(st, 1).slice(0, 4), ['u1-u8', 'u2-u7', 'u3-u6', 'u4-u5']);
  const played = new Set(Object.values(st.matches).map((m) => [m.a, m.b].sort().join('|')));
  for (let g = 0; !st.done && g < 10; g++) for (const m of ST.playable(st)) ST.recordResult(st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf });
  const pairs = Object.values(st.matches).map((m) => [m.a, m.b].sort().join('|'));
  assert.strictEqual(new Set(pairs).size, pairs.length, 'không cặp nào gặp lại');
  assert.ok(played.size >= 8);
  // Trận vòng 3 của nhóm 2–0 và 0–2 là trận quyết định: Bo3; nhóm 1–1: Bo1
  const r3 = st.rounds[2].map((id) => st.matches[id]);
  assert.deepStrictEqual(r3.map((m) => m.bo || 1).sort(), [1, 1, 1, 1, 3, 3, 3, 3]);
  // 8 đội đi tiếp, thứ tự: 3–0, 3–1, 3–2 rồi độ khó, hạt giống giai đoạn
  const adv = ST.advancers(st, seedOf).seeds;
  assert.strictEqual(adv.length, 8);
  const r2 = ST.records(st);
  for (let i = 1; i < adv.length; i++) assert.ok(r2[adv[i - 1]].l <= r2[adv[i]].l, 'thua ít xếp trước');
});

test('Kiểu CS Major: độ khó như ví dụ của luật; nhóm 6 đội theo bảng ưu tiên (dòng đầu không gặp lại)', () => {
  // A đã gặp đội 2–0 và đội 1–1 → độ khó 2; B gặp hai đội 1–1 → 0
  const st = { entrants: ['A', 'B', 'x', 'y', 'z'], matches: {
    m1: { done: true, a: 'A', b: 'x', winner: 'A', loser: 'x' }, m2: { done: true, a: 'A', b: 'y', winner: 'A', loser: 'y' },
    m3: { done: true, a: 'B', b: 'z', winner: 'B', loser: 'z' } } };
  const rec = { A: { w: 2, l: 0 }, B: { w: 1, l: 0 }, x: { w: 2, l: 0 }, y: { w: 1, l: 1 }, z: { w: 1, l: 1 } };
  const d = Valve.difficulty(st, rec);
  assert.deepStrictEqual([d.A, d.B], [2, 0]);
  // Nhóm 6: dòng 1 (1–6, 2–5, 3–4) bị chặn bởi 1–6 đã gặp → dòng 2 (1–6…) cũng bị chặn → dòng 3: 1–5, 2–6, 3–4
  const st6 = { entrants: ['a', 'b', 'c', 'd', 'e', 'f'], rounds: [[]], matches: {} };
  const rec6 = Object.fromEntries(st6.entrants.map((u) => [u, { w: 2, l: 1 }]));
  const p = Valve.valvePairs(st6, rec6, st6.entrants, new Set(['a|f']));
  assert.deepStrictEqual(p, [['a', 'e'], ['b', 'f'], ['c', 'd']]);
  assert.strictEqual(Valve.valvePairs(st6, rec6, ['a', 'b', 'c'], new Set()), null, 'số lẻ: ghép như thường');
});

test('Mẫu kiểu CS Major qua máy chủ: 32 đội, 4 giai đoạn, đội vào thẳng giai đoạn 2 và 3 đúng hạt giống, playoff 8 đội', async () => {
  const tpl = TP.byId('cs_major');
  const spec = Spec.normalizeSpec(TP.specOf(tpl, SPORTS));
  assert.deepStrictEqual(spec.stages.map((c) => [c.type, c.pairing || null, c.direct || 0]), [['swiss', 'valve', 0], ['swiss', 'valve', 8], ['swiss', 'valve', 8], ['single', null, 0]]);
  assert.deepStrictEqual(E.estimate({ stages: spec.stages, players: 32 }).stages.map((x) => x.players), [16, 16, 16, 8]);
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Kiểu CS Major', spec: TP.specOf(tpl, SPORTS), teams: TP.sampleTeams(tpl, 'Đội') }, 'otCreated', undefined, 15000);
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running', 15000);
  const U = (n) => t.players[n - 1].uid;
  assert.deepStrictEqual(t.st[0].entrants, Array.from({ length: 16 }, (_, i) => U(17 + i)), 'giai đoạn 1: hạt giống 17–32');
  assert.deepStrictEqual([t.direct[1], t.direct[2]], [Array.from({ length: 8 }, (_, i) => U(9 + i)), Array.from({ length: 8 }, (_, i) => U(1 + i))]);
  const seedOf = ctx.app.hub.otSeedOf(t);
  for (let g = 0; t.status === 'running' && g < 60; g++) {
    const st = t.st[t.stage];
    for (const m of ST.playable(st)) {
      const bo = ST.boOf(st, m), w = seedOf(m.a) < seedOf(m.b);
      org.send({ t: 'otScore', id, match: m.id, sets: Array.from({ length: (bo + 1) / 2 }, () => (w ? [1, 0] : [0, 1])) });
      await until(() => m.done || t.st[t.stage] !== st || t.status !== 'running');
    }
  }
  assert.strictEqual(t.status, 'finished');
  assert.deepStrictEqual(t.st.map((st) => st.entrants.length), [16, 16, 16, 8]);
  assert.deepStrictEqual(t.st[1].entrants.slice(0, 8), Array.from({ length: 8 }, (_, i) => U(9 + i)), 'giai đoạn 2: đội vào thẳng là hạt giống 1–8 của giai đoạn');
  assert.ok(Object.values(t.st[2].matches).every((m) => ST.boOf(t.st[2], m) === 3), 'giai đoạn 3 toàn Bo3');
  const fin = t.st[3].matches[t.st[3].rounds[2][0]];
  assert.deepStrictEqual([ST.boOf(t.st[3], fin), t.podium[0]], [5, U(1)]);
  org.close();
});

// ---------------------------------------------------------------- Đợt 11: sinh tồn chia bảng cố định + hệ số phụ kiểu PUBG
const Race = require('../src/hub/stages-race.js');
const RU = require('../../caro/otour-rules.js');

test('Sinh tồn chia bảng cố định: chia rắn, mỗi trận một bảng, xếp hạng + vào thẳng giai đoạn 3 theo bảng; không đi cùng xoay vòng / match point / chia lượt', () => {
  const [c] = off([{ type: 'race', score: 'points', events: 2, groups: 2, table: [3, 2, 1], rot: true, heat: 3, mp: { at: 9 }, advance: 2, skip: 1 }, { type: 'race' }, { type: 'race' }]);
  assert.deepStrictEqual([c.groups, c.rot, c.heat, c.mp, c.skip], [2, undefined, undefined, undefined, 1]);
  assert.strictEqual(off([{ type: 'race', score: 'time', groups: 2 }])[0].groups, undefined, 'chỉ cách tính điểm');
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5].map((j) => RU.snakeGroup(j, 2)), [0, 1, 1, 0, 0, 1]);
  const { s, seedOf } = mkSeeds(8);
  const st = ST.buildStage(c, 0, s, { seedOf });
  assert.deepStrictEqual([st.events.length, Race.lobby(st, 0), Race.lobby(st, 1)], [4, ['u0', 'u3', 'u4', 'u7'], ['u1', 'u2', 'u5', 'u6']]);
  assert.strictEqual(Race.cleanEvent(st, [{ uid: 'u1', rank: 1 }], Race.lobby(st, 0), 0).code, 'tour_score_bad', 'đội bảng B không đấu trận của bảng A');
  // Hạng ngược hạt giống ở bảng A (u7 nhất), theo hạt giống ở bảng B
  for (const ev of st.events) {
    const mem = Race.lobby(st, ev.i), order = ev.g === 0 ? [...mem].reverse() : mem;
    Race.recordEvent(st, ev.i, Race.cleanEvent(st, order.map((u, k) => ({ uid: u, rank: k + 1 })), mem, ev.i).rows);
  }
  assert.deepStrictEqual(ST.standings(st, seedOf).map((x) => x.list), [['u7', 'u4', 'u3', 'u0'], ['u1', 'u2', 'u5', 'u6']]);
  const sp = ST.splitAdvancers(st, seedOf);
  assert.deepStrictEqual([sp.skip, sp.seeds], [['u1', 'u7'], ['u2', 'u4', 'u3', 'u5']], 'nhất mỗi bảng vào thẳng; còn lại 2 đội mỗi bảng');
  assert.throws(() => Spec.checkSize(Spec.normalizeSpec({ sport: 'esports', stages: [{ type: 'race', score: 'points', groups: 4 }] }), 7), (e) => e.code === 'ot_race_groups_few');
});

test('Hệ số phụ kiểu PUBG: bằng tổng điểm xét tổng điểm hạng (không tính hạ gục), rồi điểm trận gần nhất', () => {
  const { s, seedOf } = mkSeeds(3);
  const run = (tb) => {
    const [c] = off([{ type: 'race', score: 'points', events: 2, table: [10, 6, 5], kill: 1, ...(tb ? { tb } : {}) }]);
    const st = ST.buildStage(c, 0, s, { seedOf });
    // u0: nhất trận 1 (10) + hạng 3 trận 2 (5) = 15; u1: hạng 3 trận 1 (5) + 4 hạ gục, nhì trận 2 (6) = 15 (điểm hạng 11)
    Race.recordEvent(st, 0, [{ uid: 'u0', rank: 1 }, { uid: 'u2', rank: 2 }, { uid: 'u1', rank: 3, kills: 4 }].map((x) => ({ dnf: false, ...x })));
    Race.recordEvent(st, 1, [{ uid: 'u2', rank: 1 }, { uid: 'u1', rank: 2 }, { uid: 'u0', rank: 3 }].map((x) => ({ dnf: false, ...x })));
    return Race.raceTable(st, seedOf);
  };
  const a = run(null), b = run('pubg');
  assert.deepStrictEqual([a.stats.u0.pts, a.stats.u1.pts, b.stats.u0.place, b.stats.u1.place], [15, 15, 15, 11]);
  assert.deepStrictEqual(a.list.slice(1), ['u0', 'u1'], 'countback: u0 có một lần về nhất');
  assert.deepStrictEqual(b.list.slice(1), ['u0', 'u1'], 'PUBG: u0 nhiều điểm hạng hơn');
  assert.strictEqual(off([{ type: 'race', score: 'points', tb: 'pubg' }])[0].tb, 'pubg');
});

test('Mẫu kiểu PGC qua máy chủ: 33 đội, 2 bảng cố định → vòng vớt → chung kết 16 đội (đặc cách + 10 đội vào thẳng + 5)', async () => {
  const tpl = TP.byId('pgc');
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Kiểu PGC', spec: TP.specOf(tpl, SPORTS), teams: TP.sampleTeams(tpl, 'Đội') }, 'otCreated', undefined, 15000);
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running', 15000);
  const U = (n) => t.players[n - 1].uid;
  assert.deepStrictEqual([t.st[0].entrants.length, t.st[0].events.length, t.direct[2]], [32, 36, [U(1)]]);
  const seedOf = ctx.app.hub.otSeedOf(t);
  for (let g = 0; t.status === 'running' && g < 200; g++) {
    const st = t.st[t.stage], ev = st.events.find((e) => !e.done);
    const rows = Race.lobby(st, ev.i).slice().sort((a, b) => seedOf(a) - seedOf(b)).map((uid, k) => ({ uid, rank: k + 1, kills: k < 3 ? 2 : 0 }));
    org.send({ t: 'otRace', id, event: ev.i, rows });
    await until(() => ev.done, 8000);
  }
  assert.strictEqual(t.status, 'finished');
  assert.deepStrictEqual(t.st.map((st) => st.entrants.length), [32, 16, 16]);
  // Chung kết: đặc cách (hạt giống 1), rồi nhất – năm mỗi bảng (hạt giống 2–11), rồi 5 đội từ vòng vớt
  assert.strictEqual(t.st[2].entrants[0], U(1));
  assert.deepStrictEqual(new Set(t.st[2].entrants.slice(1, 11)), new Set(Array.from({ length: 10 }, (_, i) => U(2 + i))));
  assert.deepStrictEqual(new Set(t.st[1].entrants), new Set(Array.from({ length: 16 }, (_, i) => U(12 + i))), 'vòng vớt: hạng 6–13 mỗi bảng');
  assert.strictEqual(t.podium[0], U(1));
  const v = (await org.req({ t: 'otGet', id }, 'ot', (m) => m.id === id && m.tour)).tour.stageViews[0];
  assert.deepStrictEqual([v.groups.length, v.groups[0].table.length, v.groups[0].table.filter((x) => x.skip).length], [2, 16, 5]);
  org.close();
});

// ---------------------------------------------------------------- Đợt 12: trận phụ phân hạng, bốc thăm theo thành tích Thụy Sĩ
const RD = require('../src/hub/stages-recdraw.js');
/** Kết quả một trận vòng tròn theo danh sách "a>b". */
const playRR = (st, beats, seedOf) => { for (const m of Object.values(st.matches)) if (!m.done) ST.recordResult(st, m, beats.has(m.a + '>' + m.b) ? m.a : m.b, { seedOf }); };

test('Trận phụ phân hạng: đúng hai đội bằng điểm ở vạch đi tiếp; kiểu "đối đầu trước"; ba đội bằng điểm thì không; không tính điểm', () => {
  assert.strictEqual(off([{ type: 'roundrobin', tbm: 'match' }, { type: 'single' }])[0].tbm, 'match');
  assert.strictEqual(off([{ type: 'roundrobin', tbm: 'match' }])[0].tbm, undefined, 'giai đoạn cuối: không có vạch đi tiếp');
  assert.strictEqual(off([{ type: 'roundrobin', tbm: 'x' }, { type: 'single' }])[0].tbm, undefined);
  assert.strictEqual(ST.normalizeStages([{ type: 'roundrobin', tbm: 'match' }, { type: 'single' }])[0].tbm, undefined, 'giải Caro trực tuyến');
  const { s, seedOf } = mkSeeds(4);
  // u0 và u1 cùng 2 thắng (u0 thắng u1), u2, u3 cùng 1 thắng; đi tiếp 1 đội
  const beats = new Set(['u0>u1', 'u0>u2', 'u3>u0', 'u1>u2', 'u1>u3', 'u2>u3']);
  const mk = (tbm) => { const [c] = off([{ type: 'roundrobin', groups: 1, advance: 1, tbm, points: { w: 1, d: 0, l: 0 } }, { type: 'single' }]); return ST.buildStage(c, 0, s, { seedOf }); };
  let st = mk('match');
  playRR(st, beats, seedOf);
  assert.ok(!st.done && st.tbm && st.tbm[0]);
  const tb = st.matches[st.tbm[0]];
  assert.deepStrictEqual([tb.a, tb.b, tb.tag], ['u0', 'u1', 'tb'], 'đội xếp trên theo đối đầu đứng ô trên (chọn bên)');
  ST.recordResult(st, tb, 'u1', { seedOf });
  const tab = ST.standings(st, seedOf)[0];
  assert.ok(st.done);
  assert.deepStrictEqual([tab.list.slice(0, 2), tab.stats.u1.pts, tab.stats.u1.mp], [['u1', 'u0'], 2, 3], 'thắng trận phụ xếp trên; trận phụ không tính điểm');
  st = mk('h2h');
  playRR(st, beats, seedOf);
  assert.ok(st.done && !st.tbm, 'đối đầu khác nhau: không cần trận phụ');
  // Đi tiếp 2: u1 (2 thắng) rồi ba đội u0? — dựng ba đội bằng điểm ở vạch: u0 3 thắng, u1 u2 u3 mỗi đội 1 thắng
  const [c3] = off([{ type: 'roundrobin', groups: 1, advance: 2, tbm: 'match', points: { w: 1, d: 0, l: 0 } }, { type: 'single' }]);
  const st3 = ST.buildStage(c3, 0, s, { seedOf });
  playRR(st3, new Set(['u0>u1', 'u0>u2', 'u0>u3', 'u1>u2', 'u2>u3', 'u3>u1']), seedOf);
  assert.ok(st3.done && !st3.tbm, 'ba đội bằng điểm: xếp theo chỉ số phụ');
  // Huỷ trận chính: trận phụ chưa đấu bị bỏ; trận phụ đã đấu thì khoá
  st = mk('match');
  playRR(st, beats, seedOf);
  const main = Object.values(st.matches).find((m) => !m.tb);
  assert.strictEqual(ST.tieBeforeUndo(st, main), true);
  assert.ok(!st.tbm[0] && !Object.values(st.matches).some((m) => m.tb) && st.groups[0].rounds.every((r) => r.every((id) => st.matches[id])));
});

test('Bốc thăm nhánh theo thành tích Thụy Sĩ: 3–0 gặp 3–2, hai đội 3–0 ở hai nửa, tránh cùng khu vực', () => {
  const { s, seedOf } = mkSeeds(16);
  const [c] = off([{ type: 'swiss', bestOf: 1, record: { win: 3, lose: 3 } }, { type: 'single', draw: 'record' }]);
  assert.strictEqual(off([{ type: 'swiss', record: { win: 3, lose: 3 } }, { type: 'single', draw: 'record' }])[1].draw, 'record');
  assert.strictEqual(off([{ type: 'roundrobin' }, { type: 'single', draw: 'record' }])[1].draw, undefined, 'giai đoạn trước không phải Thụy Sĩ thắng / thua');
  const st = ST.buildStage(c, 0, s, { seedOf });
  for (let g = 0; !st.done && g < 10; g++) for (const m of ST.playable(st)) ST.recordResult(st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf });
  const seeds = ST.advancers(st, seedOf).seeds, rec = ST.records(st);
  const country = (u) => ['KR', 'CN', 'EU', 'NA'][s.indexOf(u) % 4];
  let i = 0;
  const r = (n) => (i++ * 7) % n; // ngẫu nhiên giả, lặp lại được
  for (let k = 0; k < 5; k++) {
    const slots = RD.recordDraw(st, seeds, country, r);
    assert.strictEqual(slots.length, 8);
    assert.deepStrictEqual(new Set(slots), new Set(seeds));
    const pairs = [[0, 1], [2, 3], [4, 5], [6, 7]].map(([x, y]) => [slots[x], slots[y]]);
    for (const [a, b] of pairs) if (rec[a].l === 0) assert.strictEqual(rec[b].l, 2, '3–0 gặp 3–2');
    const tops = slots.map((u, j) => (rec[u].l === 0 ? j : -1)).filter((j) => j >= 0);
    assert.ok(tops.length === 2 && (tops[0] < 4) !== (tops[1] < 4), 'hai đội 3–0 ở hai nửa nhánh');
    assert.ok(!pairs.some(([a, b]) => country(a) === country(b)), 'không cùng khu vực');
  }
  assert.strictEqual(RD.recordDraw(st, seeds.slice(0, 6), country), null, 'không phải luỹ thừa của 2');
});

test('Qua máy chủ: trận phụ phân hạng (không nhận hoà, huỷ trận chính bỏ trận phụ) rồi giai đoạn sau nhận đội thắng trận phụ', async () => {
  const org = await account();
  const spec = { sport: 'esports', stages: [{ type: 'roundrobin', groups: 1, advance: 2, bestOf: 1, tbm: 'match', points: { w: 1, d: 0, l: 0 } }, { type: 'single', bestOf: 1, thirdPlace: false }] };
  const { id } = await org.req({ t: 'otCreate', name: 'Trận phụ', spec, teams: ['A', 'B', 'C', 'D', 'E'] }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const U = (n) => t.players.find((p) => p.name === n).uid;
  // A 4 thắng; B, C mỗi đội 2 thắng (C thắng B); D, E mỗi đội 1 → đi tiếp 2: trận phụ C – B ở vạch đi tiếp
  const beats = new Set([['A', 'B'], ['A', 'C'], ['A', 'D'], ['A', 'E'], ['B', 'D'], ['B', 'E'], ['C', 'B'], ['C', 'D'], ['E', 'C'], ['D', 'E']].map(([a, b]) => U(a) + '>' + U(b)));
  const st = t.st[0];
  const send = async (m, w) => { org.send({ t: 'otScore', id, match: m.id, sets: [w === m.a ? [1, 0] : [0, 1]] }); await until(() => m.done); };
  const main = Object.values(st.matches).filter((m) => m.a !== '-' && m.b !== '-' && m.a && m.b);
  for (const m of main) await send(m, beats.has(m.a + '>' + m.b) ? m.a : m.b);
  const tb = st.matches[st.tbm && st.tbm[0]];
  assert.ok(tb && !tb.done && t.stage === 0, 'trận phụ, chưa sang giai đoạn sau');
  assert.ok((await org.req({ t: 'otScore', id, match: tb.id, sets: [[1, 1]] }, 'error')).code, 'trận phụ không nhận hoà');
  // Huỷ một trận chính: trận phụ chưa đấu bị bỏ; nhập lại thì có lại trận phụ
  const any = main[0];
  org.send({ t: 'otUndo', id, match: any.id });
  await until(() => !any.done);
  assert.ok(!st.tbm[0] && !st.matches[tb.id]);
  await send(any, beats.has(any.a + '>' + any.b) ? any.a : any.b);
  const tb2 = st.matches[st.tbm[0]];
  assert.deepStrictEqual([tb2.a, tb2.b], [U('C'), U('B')], 'C thắng đối đầu: đứng ô trên (chọn bên)');
  await send(tb2, tb2.b);
  await until(() => t.stage === 1);
  assert.deepStrictEqual(t.st[1].entrants, [U('A'), U('B')], 'B thắng trận phụ: đi tiếp');
  org.close();
});

test('Mẫu kiểu LoL MSI, LoL Worlds 2022 và LoL Worlds (bốc thăm theo thành tích) chạy trọn qua máy chủ', async () => {
  for (const tid of ['lol_msi', 'lol_worlds22', 'lol_worlds']) {
    const tpl = TP.byId(tid);
    const org = await account();
    const { id } = await org.req({ t: 'otCreate', name: 'Kiểu ' + tid, spec: TP.specOf(tpl, SPORTS), teams: TP.sampleTeams(tpl, 'Đội') }, 'otCreated', undefined, 15000);
    const t = ctx.app.hub.otGet(id);
    org.send({ t: 'otStart', id });
    await until(() => t.status === 'running', 15000);
    const seedOf = ctx.app.hub.otSeedOf(t);
    for (let g = 0; t.status === 'running' && g < 80; g++) {
      const st = t.st[t.stage];
      for (const m of ST.playable(st)) {
        const bo = ST.boOf(st, m), w = seedOf(m.a) < seedOf(m.b);
        org.send({ t: 'otScore', id, match: m.id, sets: Array.from({ length: (bo + 1) / 2 }, () => (w ? [1, 0] : [0, 1])) });
        await until(() => m.done || t.st[t.stage] !== st || t.status !== 'running');
      }
    }
    assert.strictEqual(t.status, 'finished', tid);
    assert.strictEqual(t.podium[0], t.players[0].uid, tid + ': hạt giống 1 vô địch');
    if (tid === 'lol_worlds') {
      const sw = t.st[1], ko = t.st[2], rec = ST.records(sw);
      for (const id0 of ko.rounds[0]) { const m = ko.matches[id0]; if (rec[m.a].l === 0 || rec[m.b].l === 0) assert.strictEqual(Math.max(rec[m.a].l, rec[m.b].l), 2, 'tứ kết: 3–0 gặp 3–2'); }
    }
    if (tid === 'lol_msi') assert.deepStrictEqual(t.st.map((x) => x.entrants.length), [4, 8]);
    org.close();
  }
});
