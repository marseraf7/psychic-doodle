'use strict';
// Thể thức đặc biệt đợt 4 – golf đấu gậy kiểu The Masters (hệ Race, cách tính 'golf' – stages-golf.js): par từng lỗ,
// nhập tổng vòng / từng lỗ (lưu khi vòng đang dở, "đã đánh tới lỗ"), cắt top N + đồng hạng giữ điểm cộng dồn, rút lui,
// đấu phụ đột tử khi bằng điểm ở hạng nhất; mẫu The Masters qua máy chủ.
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Race = require('../src/hub/stages-race.js');
const G = require('../src/hub/stages-golf.js');
const TP = require('../../caro/otour-templates.js');
const RU = require('../../caro/otour-rules.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const { ctx, account, until } = require('./otour-client.js');

const mk = (n, cfg) => {
  const [c] = ST.normalizeStages([{ type: 'race', score: 'golf', ...cfg }], { offline: true });
  const ents = Array.from({ length: n }, (_, i) => 'g' + i), seedOf = (u) => ents.indexOf(u) + 1;
  return { st: ST.buildStage(c, 0, ents, { seedOf }), ents, seedOf };
};
const rec = (st, i, rows) => { const r = Race.cleanEvent(st, rows, undefined, i); assert.ok(r.rows, r.code); return Race.recordEvent(st, i, r.rows); };
const side = (u) => ({ uid: u, name: u });

test('Chuẩn hoá: par, cách nhập, cắt, lỗ đấu phụ; định dạng so với par', () => {
  const [c] = ST.normalizeStages([{ type: 'race', score: 'golf', events: 4, cut: { after: 9, top: 0 }, heat: 8, par: '3 4 5 9 x' }], { offline: true });
  assert.deepStrictEqual([c.par, c.input, c.cut, c.po, c.heat], [[3, 4, 5, 6, 4], 'round', { after: 3, top: 1 }, [], undefined]);
  const [d] = ST.normalizeStages([{ type: 'race', score: 'golf', events: 1, cut: { after: 1, top: 5 }, input: 'hole' }], { offline: true });
  assert.deepStrictEqual([d.par.reduce((a, b) => a + b), d.input, d.cut, d.po], [72, 'hole', undefined, [18, 10]]);
  assert.deepStrictEqual([-3, 0, 2].map(RU.fmtPar), ['−3', 'E', '+2']);
  assert.deepStrictEqual([-3, 0, 2].map(G.fmtPar), ['−3', 'E', '+2']);
});

test('Tổng vòng: lưu dở, cắt top N + đồng hạng, rút lui, bảng dẫn đầu đồng hạng, đấu phụ', () => {
  const { st, seedOf } = mk(6, { events: 3, cut: { after: 2, top: 3 } });
  // Vòng 1 lưu dở rồi lưu đủ
  assert.strictEqual(rec(st, 0, [{ uid: 'g0', s: 70 }]), false);
  assert.ok(!st.events[0].done);
  let v = Race.raceView(st, 0, 0, side, seedOf);
  assert.deepStrictEqual([v.table[0].name, v.table[0].toPar, v.table[0].thru, v.table[1].toPar], ['g0', -2, 'F', null]);
  rec(st, 0, [{ uid: 'g0', s: 70 }, { uid: 'g1', s: 71 }, { uid: 'g2', s: 72 }, { uid: 'g3', s: 73 }, { uid: 'g4', s: 74 }, { uid: 'g5', wd: true }]);
  assert.ok(st.events[0].done);
  // Lỗi: số gậy sai, người đã rút lui, bảng rỗng
  assert.strictEqual(Race.cleanEvent(st, [{ uid: 'g0', s: 5 }], undefined, 1).code, 'ot_golf_bad');
  assert.strictEqual(Race.cleanEvent(st, [{ uid: 'g5', s: 70 }], undefined, 1).code, 'ot_golf_out');
  assert.strictEqual(Race.cleanEvent(st, [{ uid: 'g0', s: '' }], undefined, 1).code, 'ot_race_empty');
  // Vòng 2: sau 2 vòng g0 −4, g1 −3, g2 −1, g3 −1, g4 +4 → top 3 + đồng hạng: g0 g1 g2 g3
  rec(st, 1, [{ uid: 'g0', s: 70 }, { uid: 'g1', s: 70 }, { uid: 'g2', s: 71 }, { uid: 'g3', s: 70 }, { uid: 'g4', s: 74 }]);
  v = Race.raceView(st, 0, 0, side, seedOf);
  assert.deepStrictEqual(v.table.map((x) => [x.name, x.rank, !!x.tie, x.cut || false, x.wd || 0]),
    [['g0', 1, false, false, 0], ['g1', 2, false, false, 0], ['g2', 3, true, false, 0], ['g3', 3, true, false, 0], ['g4', 5, false, true, 0], ['g5', 6, false, false, 1]]);
  assert.deepStrictEqual([v.golf.cutLine, v.golf.cutDone], [-1, true]);
  assert.strictEqual(Race.cleanEvent(st, [{ uid: 'g4', s: 70 }], undefined, 2).code, 'ot_golf_out', 'người bị cắt không đánh vòng 3');
  // Vòng 3: g0 74 (−2 tổng), g1 71 (−4), g3 69 (−4) → g1, g3 bằng điểm hạng nhất → chưa xong, cần đấu phụ
  assert.strictEqual(rec(st, 2, [{ uid: 'g0', s: 74 }, { uid: 'g1', s: 71 }, { uid: 'g2', s: 72 }, { uid: 'g3', s: 69 }]), false);
  v = Race.raceView(st, 0, 0, side, seedOf);
  assert.deepStrictEqual(v.golf.playoff.leaders.map((x) => x.name), ['g1', 'g3']);
  assert.deepStrictEqual(v.golf.low, { uid: 'g3', name: 'g3', strokes: 69, round: 3 });
  st.playoff = { winner: 'g3', holes: 2 };
  assert.strictEqual(G.settle(st), true);
  assert.deepStrictEqual(Race.raceTable(st, seedOf).list.slice(0, 2), ['g3', 'g1'], 'người thắng đấu phụ lên đầu');
  assert.ok(Race.raceView(st, 0, 0, side, seedOf).table[0].po);
  // Huỷ vòng cuối: bỏ luôn kết quả đấu phụ
  Race.undoEvent(st, 2);
  assert.ok(!st.playoff && !st.done);
});

test('Từng lỗ: "đã đánh tới lỗ", so với par theo các lỗ đã đánh, thống kê lỗ', () => {
  const { st, seedOf } = mk(2, { events: 2, input: 'hole', par: [4, 3, 5] });
  assert.strictEqual(Race.cleanEvent(st, [{ uid: 'g0', h: [4, 25] }], undefined, 0).code, 'ot_golf_bad');
  assert.strictEqual(Race.cleanEvent(st, [{ uid: 'g0', h: [4, 3, 5, 4] }], undefined, 0).code, 'ot_golf_bad');
  rec(st, 0, [{ uid: 'g0', h: [3, 3] }, { uid: 'g1', h: [4, 4, 4] }]);
  let v = Race.raceView(st, 0, 0, side, seedOf);
  assert.deepStrictEqual(v.table.map((x) => [x.name, x.toPar, x.thru, x.today]), [['g0', -1, 2, -1], ['g1', 0, 'F', 0]]);
  assert.ok(!st.events[0].done);
  rec(st, 0, [{ uid: 'g0', h: [3, 3, 7] }, { uid: 'g1', h: [4, 4, 4] }]);
  assert.ok(st.events[0].done);
  v = Race.raceView(st, 0, 0, side, seedOf);
  assert.deepStrictEqual(v.golf.holes.map((h) => [h.h, h.n, h.birdie, h.par0, h.bogey, h.dbl]), [[1, 2, 1, 1, 0, 0], [2, 2, 0, 1, 1, 0], [3, 2, 1, 0, 0, 1]]);
  assert.deepStrictEqual(v.events[0].rows[0], { uid: 'g0', h: [3, 3, 7] }, 'bảng đã lưu gửi về để sửa tiếp');
});

test('Mẫu The Masters qua máy chủ: nhập lần lượt, cắt sau vòng 2, đấu phụ rồi kết thúc', async () => {
  const org = await account();
  const tpl = TP.byId('masters');
  assert.deepStrictEqual([tpl.n, tpl.stages[0].cut], [90, { after: 2, top: 50 }]);
  const spec = TP.specOf(tpl, SPORTS);
  spec.stages[0].cut.top = 3;
  const { id } = await org.req({ t: 'otCreate', name: 'Áo xanh', spec, teams: TP.sampleTeams({ ...tpl, n: 6 }, 'Golfer') }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const st = t.st[0], u = st.entrants;
  const round = (i, ss) => org.send({ t: 'otRace', id, event: i, rows: ss.map((s, k) => (s == null ? null : { uid: u[k], s })).filter(Boolean) });
  assert.strictEqual((await org.req({ t: 'otRace', id, event: 1, rows: [{ uid: u[0], s: 70 }] }, 'error')).code, 'ot_gt_seq');
  round(0, [70, 71, 72, 73, 74, 75]);
  await until(() => st.events[0].done);
  round(1, [70, 70, 72, 73, 74, 75]); // sau 2 vòng: −4, −3, 0, +2, +4, +6 → 3 người đầu đánh tiếp
  await until(() => st.events[1].done);
  assert.strictEqual((await org.req({ t: 'otRaceUndo', id, event: 0 }, 'error')).code, 'ot_gt_undo_last');
  assert.strictEqual((await org.req({ t: 'otGolfPlayoff', id, winner: u[0] }, 'error')).code, 'ot_golf_no_po');
  round(2, [72, 71, 70]); round(3, [72, 72, 72]); // tổng: −4, −4, −2
  await until(() => st.events[3].done);
  assert.strictEqual(t.status, 'running', 'bằng điểm hạng nhất: chờ đấu phụ');
  const v = await org.req({ t: 'otGet', id }, 'ot');
  assert.deepStrictEqual(v.tour.stageViews[0].golf.playoff.leaders.map((x) => x.uid), [u[0], u[1]]);
  assert.strictEqual((await org.req({ t: 'otGolfPlayoff', id, winner: u[2] }, 'error')).code, 'bad_message');
  org.send({ t: 'otGolfPlayoff', id, winner: u[1], holes: 2 });
  await until(() => t.status === 'finished');
  assert.deepStrictEqual(t.podium.slice(0, 3), [u[1], u[0], u[2]]);
  org.close();
});
