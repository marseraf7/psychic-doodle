'use strict';
// Đợt 9 – thể thức các giải con Esports World Cup còn lại: vòng tranh hạt giống + cơ hội cuối (stages-kings.js – kiểu
// MOBA di động: nhất bảng tranh nhóm hạt giống, nhì bảng đá cơ hội cuối), match point chỉ tính từ trận thứ N (mp.min –
// kiểu Finalist Mode của đua xe ảo). Bóng đá ảo, bắn súng, đối kháng 2D dùng thể thức đã có (bảng GSL → loại trực tiếp).
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Race = require('../src/hub/stages-race.js');
const Spec = require('../src/hub/otour-spec.js');
const E = require('../../caro/tour-estimate.js');
const { ctx, account, until } = require('./otour-client.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const mkSeeds = (n) => { const s = Array.from({ length: n }, (_, i) => 'u' + i); return { s, seedOf: (u) => s.indexOf(u) + 1 }; };

test('Vòng tranh hạt giống: chỉ giải offline, chỉ giai đoạn giữa; số đội chia hết cho 4; 3/4 số đội đi tiếp', () => {
  assert.strictEqual(ST.normalizeStages([{ type: 'kings' }, { type: 'single' }])[0].type, 'roundrobin', 'giải Caro trực tuyến không có');
  const cfgs = off([{ type: 'gsl', bestOf: 3 }, { type: 'kings', bestOf: 3, boLow: 5, advance: 9 }, { type: 'single', direct: 2 }]);
  assert.deepStrictEqual(cfgs[1], { type: 'kings', bestOf: 3, boLow: 5 });
  assert.strictEqual(off([{ type: 'gsl' }, { type: 'kings', skip: 1 }])[1].type, 'single', 'ở cuối thì thành loại trực tiếp');
  assert.strictEqual(off([{ type: 'kings', bestOf: 3, boLow: 3 }, { type: 'single' }])[0].boLow, undefined, 'Bo nửa dưới như nửa trên: bỏ');
  assert.strictEqual(off([{ type: 'kings', skip: 1 }, { type: 'single' }, { type: 'single' }])[0].skip, undefined, 'không có "vào thẳng giai đoạn 3"');
  assert.deepStrictEqual(E.estimate({ stages: cfgs, players: 18 }).stages.map((x) => [x.players, x.matches, x.advance]), [[16, 20, 8], [8, 4, 6], [8, 8, null]]);
  assert.ok(Spec.checkSize(Spec.normalizeSpec({ sport: 'esports', stages: cfgs }), 18));
  const bad = (n) => { try { Spec.checkSize(Spec.normalizeSpec({ sport: 'esports', stages: [{ type: 'roundrobin', groups: 1, advance: n }, { type: 'kings' }, { type: 'single' }] }), 12); return null; } catch (e) { return e.code; } };
  assert.deepStrictEqual([bad(6), bad(8)], ['ot_kings_four', null]);
});

test('Vòng tranh hạt giống: cao gặp thấp mỗi nửa; thắng nửa trên → nhóm 1, thua → nhóm 2; nửa dưới thắng → nhóm 2, thua bị loại', () => {
  const [c] = off([{ type: 'kings', bestOf: 3, boLow: 5 }, { type: 'single' }]);
  const { s, seedOf } = mkSeeds(8);
  const st = ST.buildStage(c, 1, s, { seedOf });
  const pairs = (g) => st.groups[g].rounds[0].map((id) => st.matches[id]).map((m) => [m.a, m.b, ST.boOf(st, m)]);
  assert.deepStrictEqual([pairs(0), pairs(1)], [[['u0', 'u3', 3], ['u1', 'u2', 3]], [['u4', 'u7', 5], ['u5', 'u6', 5]]]);
  assert.strictEqual(ST.playable(st).length, 4, 'cả 4 trận đấu được cùng lúc');
  // Bất ngờ: u3 thắng u0, u6 thắng u5
  const M = (g, k) => st.matches[`s1k${g}m${k}`];
  ST.recordResult(st, M(0, 0), 'u3', { seedOf });
  ST.recordResult(st, M(0, 1), 'u1', { seedOf });
  ST.recordResult(st, M(1, 0), 'u4', { seedOf });
  assert.ok(!st.done);
  ST.recordResult(st, M(1, 1), 'u6', { seedOf });
  assert.ok(st.done);
  const adv = ST.advancers(st, seedOf);
  assert.deepStrictEqual(adv.tiers, [['u1', 'u3'], ['u0', 'u2'], ['u4', 'u6']]);
  assert.deepStrictEqual(adv.seeds, ['u1', 'u3', 'u0', 'u2', 'u4', 'u6']);
  assert.ok(adv.groupOf.u0 === adv.groupOf.u3 && adv.groupOf.u1 === adv.groupOf.u2 && adv.groupOf.u0 !== adv.groupOf.u1, 'hai đội đã gặp nhau cùng nhóm');
  const tabs = ST.kingsTables(st, (u) => ({ uid: u }), seedOf);
  assert.deepStrictEqual(tabs[0].map((x) => [x.uid, x.pool]), [['u1', 1], ['u3', 1], ['u0', 2], ['u2', 2]]);
  assert.deepStrictEqual(tabs[1].map((x) => [x.uid, x.pool || null, !!x.out]), [['u4', 2, false], ['u6', 2, false], ['u5', null, true], ['u7', null, true]]);
  // Nhánh sau: 2 đội vào thẳng + 6 đội; hạt giống 4 (u3) gặp 5 (u0) ở vòng 1 – đã gặp nhau → đổi cặp
  const [, single] = off([{ type: 'kings' }, { type: 'single', direct: 2 }]);
  const next = ST.buildStage(single, 2, ['d0', 'd1', ...adv.seeds], { groupOf: adv.groupOf });
  const firsts = next.rounds[0].map((id) => [next.matches[id].a, next.matches[id].b]);
  assert.ok(!firsts.some(([a, b]) => adv.groupOf[a] != null && adv.groupOf[a] === adv.groupOf[b]), 'không gặp lại ngay vòng 1: ' + JSON.stringify(firsts));
});

test('Match point từ trận thứ N: đạt ngưỡng sớm vẫn phải đợi tới trận N mới vô địch', () => {
  const [c] = off([{ type: 'race', score: 'points', events: 8, table: [25, 20, 16], mp: { at: 45, min: 4 } }]);
  assert.deepStrictEqual(c.mp, { at: 45, min: 4 });
  assert.deepStrictEqual(off([{ type: 'race', score: 'points', events: 3, mp: { at: 45, min: 9 } }])[0].mp, { at: 45, min: 3 }, 'tối đa số trận');
  assert.deepStrictEqual(off([{ type: 'race', score: 'points', events: 3, mp: { at: 45, min: 1 } }])[0].mp, { at: 45 });
  const { s, seedOf } = mkSeeds(3);
  const st = ST.buildStage(c, 0, s, { seedOf });
  const ev = (i) => Race.recordEvent(st, i, s.map((u, k) => ({ uid: u, rank: k + 1, dnf: false })));
  assert.strictEqual(ev(0), false);
  assert.strictEqual(ev(1), false);
  assert.strictEqual(ev(2), false, 'u0 đã có 50 điểm trước trận 3 nhưng match point chỉ tính từ trận 4');
  assert.strictEqual(ev(3), true, 'trận 4: thắng là vô địch');
  assert.strictEqual(st.mpWinner, 'u0');
});

test('Qua máy chủ: bảng GSL → tranh hạt giống + cơ hội cuối → loại trực tiếp có 2 đội vào thẳng; không nhận hoà, huỷ được kết quả', async () => {
  const org = await account();
  const spec = { sport: 'esports', stages: [{ type: 'gsl', bestOf: 1 }, { type: 'kings', bestOf: 1, boLow: 3 }, { type: 'single', bestOf: 1, thirdPlace: false, direct: 2 }] };
  const teams = Array.from({ length: 10 }, (_, i) => 'Đội ' + (i + 1));
  const { id } = await org.req({ t: 'otCreate', name: 'Tranh hạt giống', spec, teams }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const seedOf = ctx.app.hub.otSeedOf(t);
  const U = (n) => t.players[n - 1].uid;
  const win = async (m, w) => {
    const bo = ST.boOf(t.st[t.stage], m);
    org.send({ t: 'otScore', id, match: m.id, sets: Array.from({ length: (bo + 1) / 2 }, () => (w === m.a ? [1, 0] : [0, 1])) });
    await until(() => m.done);
  };
  for (let g = 0; t.stage === 0 && g < 4; g++) for (const m of ST.playable(t.st[0])) await win(m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b);
  await until(() => t.stage === 1);
  const st = t.st[1];
  // 8 đội đá bảng (hạt giống 3–10): nhất bảng A, B (Đội 3, 4) ở nửa trên, nhì bảng (Đội 5, 6) ở nửa dưới
  assert.deepStrictEqual(st.groups.map((g) => g.players), [[U(3), U(4)], [U(5), U(6)]]);
  const top = st.matches.s1k0m0, low = st.matches.s1k1m0;
  assert.strictEqual(ST.boOf(st, low), 3);
  assert.ok((await org.req({ t: 'otScore', id, match: top.id, sets: [[1, 1]] }, 'error')).code && !top.done, 'không có hoà');
  assert.ok(ST.linked('kings'), 'không có hoà, huỷ như loại trực tiếp');
  await win(top, U(4));
  org.send({ t: 'otUndo', id, match: top.id });
  await until(() => !top.done);
  await win(top, U(4));
  await win(low, U(5));
  await until(() => t.stage === 2);
  // Loại trực tiếp: 2 đội vào thẳng, thắng nửa trên, thua nửa trên, thắng nửa dưới
  assert.deepStrictEqual(t.st[2].entrants, [U(1), U(2), U(4), U(3), U(5)]);
  assert.strictEqual(t.players.find((p) => p.uid === U(6)).out, 'not_advanced');
  const v = (await org.req({ t: 'otGet', id }, 'ot', (m) => m.id === id && m.tour)).tour.stageViews[1];
  assert.deepStrictEqual([v.type, v.groups.map((g) => g.name), v.groups[0].table.map((x) => [x.name, x.pool])], ['kings', ['top', 'low'], [['Đội 4', 1], ['Đội 3', 2]]]);
  org.close();
});

// ---------------------------------------------------------------- Soát lại (review): các lỗi đã sửa
test('Thứ hạng chung cuộc cho giải tổng: bảng GSL ở giai đoạn cuối không làm hỏng trang tổng; golf đồng hạng cùng nhận điểm', () => {
  const M = require('../src/hub/otour-multi.js');
  const { s, seedOf } = mkSeeds(8);
  const cfgs = off([{ type: 'gsl' }]);
  const st = ST.buildStage(cfgs[0], 0, s, { seedOf });
  for (let g = 0; !st.done && g < 5; g++) for (const m of ST.playable(st)) ST.recordResult(st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf });
  const places = M.finalPlaces({ status: 'finished', stages: cfgs, st: [st], podium: ST.podium(st, seedOf) }, seedOf);
  assert.strictEqual(places.length, 8);
  assert.deepStrictEqual(places.slice(0, 3).map((x) => [x.uid, x.place]), [['u0', 1], ['u1', 2], ['u2', 3]]);
  // Golf: u0, u1 cùng −2 (u0 thắng đấu phụ), u2, u3 cùng E → 1, 2, T3, T3
  const [g] = off([{ type: 'race', score: 'golf', events: 1, par: [4, 4] }]);
  const gs = ST.buildStage(g, 0, s.slice(0, 4), { seedOf });
  Race.recordEvent(gs, 0, [{ uid: 'u1', s: 6 }, { uid: 'u0', s: 6 }, { uid: 'u2', s: 8 }, { uid: 'u3', s: 8 }]);
  gs.playoff = { winner: 'u1', holes: 1 };
  const gp = M.finalPlaces({ status: 'finished', stages: [g], st: [gs] }, seedOf);
  assert.deepStrictEqual(gp.map((x) => [x.uid, x.place]), [['u1', 1], ['u0', 2], ['u2', 3], ['u3', 3]]);
});

test('Match point không đi cùng chia lượt; vòng tranh hạt giống số đội lẻ: đội cao nhất nửa dưới miễn đấu, không ai bị bỏ sót', () => {
  assert.deepStrictEqual(off([{ type: 'race', score: 'points', events: 4, heat: 3, mp: { at: 15 } }])[0].heat, undefined);
  assert.strictEqual(off([{ type: 'race', score: 'points', events: 4, heat: 3 }])[0].heat, 3);
  const { s, seedOf } = mkSeeds(6);
  const [k] = off([{ type: 'kings' }, { type: 'single' }]);
  const st = ST.buildStage(k, 1, s, { seedOf });
  assert.deepStrictEqual([st.byes, st.groups[1].players, Object.keys(st.matches).length], [['u2', 'u3'], ['u4', 'u5', 'u2', 'u3'], 2]);
  for (const m of ST.playable(st)) ST.recordResult(st, m, m.b, { seedOf });
  const adv = ST.advancers(st, seedOf);
  assert.deepStrictEqual(adv.tiers, [['u1'], ['u0'], ['u2', 'u3', 'u5']]);
  const low = ST.kingsTables(st, (u) => ({ uid: u }), seedOf)[1];
  assert.deepStrictEqual(low.map((x) => [x.uid, x.pool || 0, !!x.bye, !!x.out]), [['u2', 2, true, false], ['u3', 2, true, false], ['u5', 2, false, false], ['u4', 0, false, true]]);
});
