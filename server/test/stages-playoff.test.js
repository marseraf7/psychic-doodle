'use strict';
// Playoff kiểu nhà nghề Mỹ (hub/stages-playoff.js) sau mùa giải: nhánh riêng từng miền, nhất bảng con giữ hạt giống đầu,
// play-in (NBA, MLS), nhánh theo bảng con (NHL), xếp lại cặp sau mỗi vòng (NFL), Bo từng vòng (MLB)
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const { BYE } = require('../src/hub/stages-base.js');
const PO = require('../src/hub/stages-playoff.js');
const TP = require('../../caro/otour-templates.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const Spec = require('../src/hub/otour-spec.js');
const E = require('../../caro/tour-estimate.js');

const ids = (n) => Array.from({ length: n }, (_, i) => 'u' + String(i).padStart(2, '0'));
/** Mùa giải của mẫu (đội số nhỏ luôn thắng) → { spec, seeds, seedOf, season }. */
function season(id) {
  const tpl = TP.byId(id), spec = Spec.normalizeSpec(TP.specOf(tpl, SPORTS));
  const seeds = ids(tpl.n), seedOf = (u) => seeds.indexOf(u) + 1;
  const st = ST.buildStage(spec.stages[0], 0, seeds, { seedOf });
  for (const m of Object.values(st.matches)) ST.recordResult(st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf, isActive: () => true });
  return { spec, seeds, seedOf, st };
}
/** Dựng playoff như otour-run.js. */
function playoff(s) {
  const cfg = s.spec.stages[1];
  const plan = PO.playoffPlan(s.st, cfg, ST.standings(s.st, s.seedOf));
  assert.ok(plan, 'có kế hoạch playoff');
  const p = ST.buildStage(cfg, 1, plan.seeds, { slots: plan.slots });
  PO.attachPre(p, plan);
  return { p, plan };
}
/** Đấu hết; pick(m) chọn người thắng (mặc định hạt giống mùa giải cao hơn). Trả số trận đã đấu. */
function playAll(p, s, pick) {
  let n = 0;
  for (let guard = 0; !p.done && guard < 100; guard++) {
    const ready = Object.values(p.matches).filter((m) => !m.done && ST.real(m.a) && ST.real(m.b));
    if (!ready.length) break;
    for (const m of ready) {
      n++;
      ST.recordResult(p, m, (pick && pick(m)) || (s.seedOf(m.a) < s.seedOf(m.b) ? m.a : m.b), { seedOf: s.seedOf });
      PO.reseed(p);
    }
  }
  return n;
}
const pair = (p, mid) => [p.matches[mid].a, p.matches[mid].b];

test('normalizePlayoff / need: chuẩn hoá và số đội mỗi miền phải đi tiếp', () => {
  assert.strictEqual(PO.normalizePlayoff(null), null);
  assert.deepStrictEqual(PO.normalizePlayoff({ per: 99, playin: 'x', playinBo: 4 }), { mode: 'seed', per: 16, divWin: false, playin: 'none', reseed: false, playinBo: 1 });
  assert.deepStrictEqual(PO.normalizePlayoff({ mode: 'div', per: 3, divWin: true, playin: 'nba' }), { mode: 'div', per: 8, divWin: false, playin: 'none', reseed: false, playinBo: 1 });
  assert.deepStrictEqual([PO.need({ per: 8, playin: 'nba' }), PO.need({ per: 8, playin: 'one' }), PO.need({ per: 7 }), PO.need(null)], [10, 9, 7, 0]);
  // Playoff chỉ giữ khi đứng ngay sau mùa giải
  const [a, b] = ST.normalizeStages([{ type: 'roundrobin', advance: 4 }, { type: 'single', playoff: { per: 4 }, boRounds: [3, 4, 5] }], { offline: true });
  assert.deepStrictEqual([a.type, b.playoff, b.boRounds], ['roundrobin', undefined, [3, 5]]);
});

test('Năm mẫu giải Mỹ: playoff đấu trọn, đúng số trận, khớp ước tính', () => {
  const want = { nba: [21, 6], nfl: [13, 0], mlb: [11, 0], nhl: [15, 0], mls: [17, 2] };
  for (const [id, [played, pre]] of Object.entries(want)) {
    const s = season(id), { p } = playoff(s);
    assert.strictEqual((p.pre || []).length, pre, id + ': số trận play-in');
    assert.strictEqual(playAll(p, s), played, id + ': số trận đã đấu');
    assert.ok(p.done, id + ': xong');
    assert.strictEqual(ST.podium(p, s.seedOf)[0], 'u00', id + ': nhất miền A thắng');
    assert.strictEqual(p.halves, 2, id + ': mỗi miền một nửa nhánh');
    const est = E.stage(s.spec.stages[1], ST.advancers(s.st, s.seedOf).seeds.length, true);
    assert.strictEqual(est.matches, played, id + ': ước tính đúng số trận');
  }
});

test('NFL: nhất bảng con giữ hạt giống 1–4, hạt giống 1 miễn đấu, xếp lại cặp sau vòng đầu', () => {
  const s = season('nfl'), { p, plan } = playoff(s);
  // Miền A: u00–u15, 4 bảng con 4 đội (u00–u03, u04–u07…): nhất từng bảng con theo bảng xếp hạng miền giữ hạt giống 1–4
  const list = ST.standings(s.st, s.seedOf)[0].list;
  const winners = [0, 4, 8, 12].map((b) => list.find((u) => s.seedOf(u) - 1 >= b && s.seedOf(u) - 1 < b + 4));
  const seeds = [...list.filter((u) => winners.includes(u)), ...list.filter((u) => !winners.includes(u))].slice(0, 7);
  assert.deepStrictEqual(plan.seeds.slice(0, 7), seeds);
  assert.deepStrictEqual(seeds.slice(0, 4).sort(), ['u00', 'u04', 'u08', 'u12']);
  assert.deepStrictEqual([plan.label[seeds[0]], plan.label[seeds[6]]], ['A1', 'A7']);
  const r0 = p.rounds[0].slice(0, 4).map((mid) => pair(p, mid));
  assert.deepStrictEqual(r0[0], [seeds[0], BYE], 'hạt giống 1 miễn đấu');
  assert.deepStrictEqual(r0[2], [seeds[1], seeds[6]], 'hạt giống 2 gặp 7');
  // Vòng đầu miền A: hạt giống 7 thắng hạt giống 2 → vòng 2: 1 gặp 7 (thấp nhất còn lại), 3 gặp 4
  const rank = (u) => plan.seeds.indexOf(u);
  playAll(p, s, (m) => (m.round === 0 && [m.a, m.b].includes(seeds[6]) ? seeds[6] : rank(m.a) < rank(m.b) ? m.a : m.b));
  const r1 = p.rounds[1].slice(0, 2).map((mid) => pair(p, mid));
  assert.deepStrictEqual(r1, [[seeds[0], seeds[6]], [seeds[2], seeds[3]]]);
  assert.ok(p.done);
});

test('NBA play-in: thắng 7–8 vào hạt giống 7, thua 7–8 gặp thắng 9–10 tranh hạt giống 8', () => {
  const s = season('nba'), { p } = playoff(s);
  const pre = p.pre.slice(0, 3).map((mid) => p.matches[mid]);
  assert.deepStrictEqual(pre.map((m) => [m.tag, m.a, m.b]), [['pi_78', 'u06', 'u07'], ['pi_910', 'u08', 'u09'], ['pi_last', null, null]]);
  assert.deepStrictEqual(pre.map((m) => ST.boOf(p, m)), [1, 1, 1], 'play-in một trận dù loạt playoff Bo7');
  // Hạt giống 8 thắng 7–8, hạt giống 10 thắng 9–10, hạt giống 7 thắng trận quyết định
  ST.recordResult(p, pre[0], 'u07', { seedOf: s.seedOf });
  ST.recordResult(p, pre[1], 'u09', { seedOf: s.seedOf });
  assert.deepStrictEqual([pre[2].a, pre[2].b], ['u06', 'u09']);
  ST.recordResult(p, pre[2], 'u06', { seedOf: s.seedOf });
  const r0 = p.rounds[0].slice(0, 4).map((mid) => pair(p, mid));
  assert.deepStrictEqual(r0, [['u00', 'u06'], ['u03', 'u04'], ['u01', 'u07'], ['u02', 'u05']], 'A1–A8 (u06 lấy suất 8), A2–A7 (u07 lấy suất 7)');
});

test('MLB: hạt giống 1, 2 miễn đấu; Bo từng vòng 3, 5, 7, 7', () => {
  const s = season('mlb'), { p } = playoff(s);
  assert.deepStrictEqual(p.rounds.map((r) => ST.boOf(p, p.matches[r[0]])), [3, 5, 7, 7]);
  const r0 = p.rounds[0].slice(0, 4).map((mid) => pair(p, mid));
  assert.deepStrictEqual(r0.map((x) => x[1] === BYE), [true, false, true, false]);
});

test('NHL: nhánh theo bảng con – nhất bảng con gặp vé vớt, nhì gặp ba', () => {
  const s = season('nhl'), { p, plan } = playoff(s);
  // Miền A: u00–u15, bảng con u00–u07 và u08–u15; 3 đội đầu mỗi bảng con + vé vớt u03, u04
  const r0 = p.rounds[0].slice(0, 4).map((mid) => pair(p, mid));
  assert.deepStrictEqual(r0, [['u00', 'u04'], ['u01', 'u02'], ['u08', 'u03'], ['u09', 'u10']]);
  assert.deepStrictEqual([plan.label.u03, plan.label.u04], ['A · WC1', 'A · WC2']);
});

test('MLS: play-in 8 gặp 9 (Bo trận play-in riêng), vòng đầu Bo3', () => {
  const s = season('mls');
  s.spec.stages[1].playoff.playinBo = 3;
  const { p } = playoff(s);
  const m = p.matches[p.pre[0]];
  assert.deepStrictEqual([m.tag, m.a, m.b, ST.boOf(p, m)], ['pi_89', 'u07', 'u08', 3]);
  assert.strictEqual(ST.boOf(p, p.matches[p.rounds[0][0]]), 3);
  assert.strictEqual(ST.boOf(p, p.matches[p.rounds[1][0]]), 1);
});

test('Không hợp thì không có kế hoạch (xếp nhánh như thường)', () => {
  const s = season('nba');
  const cfg = s.spec.stages[1];
  assert.strictEqual(PO.playoffPlan({ type: 'single' }, cfg, []), null, 'giai đoạn trước không phải mùa giải');
  assert.strictEqual(PO.playoffPlan(s.st, { ...cfg, playoff: { ...cfg.playoff, per: 16 } }, ST.standings(s.st, s.seedOf)), null, 'thiếu đội');
  assert.strictEqual(PO.playoffPlan(s.st, { ...cfg, playoff: { ...cfg.playoff, mode: 'div' } }, ST.standings(s.st, s.seedOf)), null, 'NHL cần đúng 2 bảng con');
  assert.strictEqual(PO.reseed({ type: 'single', cfg: {} }), false);
});
