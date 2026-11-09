'use strict';
// Thể thức đặc biệt đợt 2 – thách đấu kiểu America's Cup: đội giữ cúp vào thẳng trận tranh cúp, đội thách đấu đá vòng loại
// riêng (vòng tròn 2 lượt → loại trực tiếp giai đoạn giữa: bán kết Bo9, chung kết Bo13), trận tranh cúp Bo13; mỗi race
// ghi bên vào sân + thời gian về đích (chi tiết ván dùng chung với esports – caro/otour-draft.js).
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const DR = require('../../caro/otour-draft.js');
const E = require('../../caro/tour-estimate.js');
const TP = require('../../caro/otour-templates.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const { ctx, account, until } = require('./otour-client.js');

test('Loại trực tiếp làm giai đoạn giữa (chỉ giải offline): người đi tiếp theo thứ hạng chung cuộc', () => {
  const off = ST.normalizeStages([{ type: 'single', bestOf: 9, advance: 2, thirdPlace: false }, { type: 'single' }], { offline: true });
  assert.deepStrictEqual([off[0].type, off[0].advance], ['single', 2]);
  const on = ST.normalizeStages([{ type: 'single', advance: 2 }, { type: 'single' }]);
  assert.strictEqual(on[0].type, 'roundrobin', 'giải Caro trực tuyến: giai đoạn giữa vẫn chỉ vòng tròn / Thụy Sĩ');
  const seeds = ['a', 'b', 'c', 'd'], seedOf = (u) => seeds.indexOf(u) + 1;
  const st = ST.buildStage({ ...off[0], advance: 2 }, 0, seeds, { seedOf });
  for (let guard = 0; !st.done && guard < 10; guard++) for (const m of ST.playable(st)) ST.recordResult(st, m, seedOf(m.a) > seedOf(m.b) ? m.a : m.b, { seedOf });
  assert.deepStrictEqual(ST.advancers(st, seedOf).seeds, ['d', 'c'], 'vô địch, á quân của nhánh');
  const est = E.estimate({ stages: off, players: 4 });
  assert.deepStrictEqual(est.stages.map((s) => [s.players, s.matches]), [[4, 3], [2, 1]]);
});

test('Đua thuyền: bộ môn, cấu hình chi tiết race mặc định, thời gian về đích bắt buộc', () => {
  assert.deepStrictEqual([SPORTS.sailing.result, SPORTS.sailing.set, SPORTS.sailing.unit], ['sets', null, 'game']);
  const cfg = DR.cleanEsports(DR.defaults('sailing'));
  assert.deepStrictEqual([cfg.draft, cfg.fearless, cfg.stats, cfg.sides, DR.script(cfg).length], ['off', 'off', ['finish'], 'ps', 0]);
  assert.strictEqual(DR.cleanGame({ blue: 'a', st: { blue: { finish: 1500 }, red: {} } }, cfg).code, 'ot_g_stats');
  const g = DR.cleanGame({ blue: 'b', dur: 1520, st: { blue: { finish: 1500 }, red: { finish: 1532 } } }, cfg).game;
  assert.deepStrictEqual(g, { blue: 'b', dur: 1520, st: { blue: { finish: 1500 }, red: { finish: 1532 } } });
  assert.strictEqual(DR.cleanEsports({ sides: 'x' }).sides, 'br');
});

test('Mẫu America’s Cup qua máy chủ: đội giữ cúp vào thẳng trận tranh cúp; vòng loại đội thách đấu; Bo9 / Bo13', async () => {
  const org = await account();
  const tpl = TP.byId('americas_cup');
  const { id } = await org.req({ t: 'otCreate', name: 'Cúp thuyền', spec: TP.specOf(tpl, SPORTS), teams: TP.sampleTeams(tpl, 'Đội') }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  assert.deepStrictEqual([t.sport, t.esports.sides, t.stages.map((c) => c.type).join(',')], ['sailing', 'ps', 'roundrobin,single,single']);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const defender = t.players[0].uid, seedOf = ctx.app.hub.otSeedOf(t);
  assert.ok(!t.st[0].entrants.includes(defender) && t.st[0].entrants.length === 5 && t.direct[2][0] === defender, 'đội giữ cúp không đá vòng loại');
  // Vòng tròn 2 lượt: 20 trận; đội xếp trên luôn thắng; trận cuối nhập qua máy chủ
  const rr = Object.values(t.st[0].matches);
  assert.strictEqual(rr.length, 20);
  const last = rr.pop();
  for (const m of rr) ST.recordResult(t.st[0], m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf, isActive: () => true });
  org.send({ t: 'otScore', id, match: last.id, sets: [seedOf(last.a) < seedOf(last.b) ? [1, 0] : [0, 1]] });
  await until(() => t.st[1]);
  assert.deepStrictEqual(t.st[1].entrants, t.players.slice(1, 5).map((p) => p.uid), '4 đội thách đấu đầu vào bán kết');
  // Bán kết Bo9 (thắng 5), chung kết đội thách đấu Bo13 (thắng 7)
  const series = (k, aWins) => Array.from({ length: k }, () => (aWins ? [1, 0] : [0, 1]));
  for (let guard = 0; t.stage === 1 && guard < 5; guard++) {
    for (const m of ST.playable(t.st[1])) {
      const bo = ST.boOf(t.st[1], m);
      assert.strictEqual(bo, m.round === 0 ? 9 : 13);
      org.send({ t: 'otScore', id, match: m.id, sets: series((bo + 1) / 2, seedOf(m.a) < seedOf(m.b)) });
      await until(() => m.done);
    }
  }
  await until(() => t.st[2]);
  const challenger = t.players[1].uid;
  assert.deepStrictEqual(t.st[2].entrants, [defender, challenger], 'trận tranh cúp: đội giữ cúp gặp đội thắng vòng loại');
  // Race 1 có chi tiết: thuyền đội thách đấu vào từ mạn trái, về đích trước 18 giây
  const cup = Object.values(t.st[2].matches)[0];
  assert.strictEqual(ST.boOf(t.st[2], cup), 13);
  org.send({ t: 'otGame', id, match: cup.id, i: 0, game: { blue: cup.a === challenger ? 'a' : 'b', dur: 1700, st: { blue: { finish: 1682 }, red: { finish: 1700 } } } });
  await until(() => cup.esp && cup.esp[0]);
  // Đội giữ cúp thắng 7–1
  org.send({ t: 'otScore', id, match: cup.id, sets: [cup.a === defender ? [0, 1] : [1, 0], ...series(7, cup.a === defender)] });
  await until(() => t.status === 'finished');
  assert.strictEqual(t.podium[0], defender, 'đội giữ cúp bảo vệ thành công');
  const v = await org.req({ t: 'otGet', id }, 'ot');
  assert.ok(v.tour.esp && v.tour.esp.games === 1 && v.tour.esp.blueWins === 1, 'thống kê race: thuyền vào từ mạn trái (đội thách đấu) thắng race 1');
  org.close();
});

test('Giai đoạn sau phải có ít nhất 2 đội', () => {
  const Spec = require('../src/hub/otour-spec.js');
  const spec = Spec.normalizeSpec({ sport: 'sailing', stages: [{ type: 'single', advance: 1 }, { type: 'single' }] });
  assert.throws(() => Spec.checkSize(spec, 8), (e) => e.code === 'ot_stage_few' && e.args.n === 2);
  const ok = Spec.normalizeSpec({ sport: 'sailing', stages: [{ type: 'single', advance: 1 }, { type: 'single', direct: 1 }] });
  assert.strictEqual(Spec.checkSize(ok, 8).stages[1].players, 2, 'có đội vào thẳng thì được');
});
