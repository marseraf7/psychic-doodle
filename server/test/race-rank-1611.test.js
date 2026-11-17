/*
 * Xếp hạng / tính điểm các kiểu đua – đợt rà soát code 16/11/2026 (phần 2):
 *   36 – mass start: trần thứ hạng theo số người thực của cuộc đua (không cứng 48);
 *   61 – mass start: bị truất quyền ở chung kết không đứng trên người dừng ở bán kết;
 *   37 – đuổi bắt: người không có thời gian xuất phát cùng người thua xa nhất;
 *   38 / 59 – omnium: vắng mặt / bỏ cuộc points race xếp sau, không có điểm đua đó;
 *   43 / 60 – nhảy cầu: bỏ một lượt chỉ mất điểm lượt đó; chưa nhảy không đồng hạng với người 0,0;
 *   62 – backyard: chạm trần số yard thì chốt giải.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const MS = require('../src/hub/stages-massstart.js');
const PU = require('../src/hub/stages-pursuit.js');
const OM = require('../src/hub/stages-omnium.js');
const SJ = require('../src/hub/stages-skijump.js');
const BY = require('../src/hub/stages-backyard.js');

const ids = (n) => Array.from({ length: n }, (_, k) => 'u' + String(k + 1).padStart(2, '0'));
function stage(mod, c, entrants) {
  const cfg = {};
  mod.normalize(c, cfg);
  return { cfg, entrants, events: Array.from({ length: cfg.events }, (_, i) => ({ i, done: false, rows: null })), done: false };
}
const seedOf = (u) => Number(u.slice(1));

test('mục 36: mass start 72 người không bán kết – hạng 72 hợp lệ, hạng 73 bị từ chối; bán kết 6 người – hạng 7 bị từ chối', () => {
  const E = ids(72), st = stage(MS, { massStart: {} }, E);
  const all = E.map((u, k) => ({ uid: u, rank: k + 1 }));
  assert.ok(MS.clean(st, 0, all).rows, 'hạng 49–72 phải nhập được');
  assert.strictEqual(MS.clean(st, 0, [{ uid: E[0], rank: 73 }]).code, 'ot_race_rank');
  const s2 = stage(MS, { massStart: { semis: true, heat: 6, adv: 2 } }, ids(12));
  assert.strictEqual(MS.clean(s2, 0, [{ uid: 'u01', rank: 7 }]).code, 'ot_race_rank');
  assert.ok(MS.clean(s2, 0, [{ uid: 'u01', rank: 6 }]).rows);
});

test('mục 61 / 44: truất quyền ở chung kết xếp sau người dừng ở bán kết; cùng bỏ cuộc xếp theo hạt giống', () => {
  const E = ids(12), st = stage(MS, { massStart: { semis: true, heat: 6, adv: 2 } }, E);
  const heats = MS.heatsOf(st);
  MS.record(st, 0, MS.clean(st, 0, heats.flatMap((h) => h.map((u, k) => ({ uid: u, rank: k + 1 })))).rows);
  const q = MS.qualifiers(st);
  MS.record(st, 1, MS.clean(st, 1, [{ uid: q[0], dsq: true }, ...q.slice(1).map((u, k) => ({ uid: u, rank: k + 1 }))]).rows);
  const C = MS.calc(st, seedOf);
  assert.strictEqual(C.order[C.order.length - 1], q[0], 'bị truất quyền xếp sau cùng');
  assert.ok(C.order.indexOf(heats[0][2]) < C.order.indexOf(q[0]));
  const R = MS.rankRace({ cfg: st.cfg, entrants: ['a', 'b', 'c'] }, [{ uid: 'c', dnf: true }, { uid: 'b', dnf: true }, { uid: 'a', rank: 1 }]);
  assert.deepStrictEqual(R.map((x) => x.uid), ['a', 'b', 'c']);
});

test('mục 37: đuổi bắt theo thời gian – người không có thời gian nhận khoảng thua lớn nhất, không xuất phát cùng người dẫn đầu', () => {
  const tb = { list: ['a', 'b', 'c'], stats: { a: { time: 60000, fin: 1 }, b: { time: 75000, fin: 2 }, c: { time: 0, fin: 0 } } };
  assert.deepStrictEqual(PU.gapsFrom([tb], ['a', 'b', 'c'], {}), { a: 0, b: 15000, c: 15000 });
});

test('mục 38 / 59: omnium – vắng mặt hoặc bỏ cuộc points race xếp sau người về đích và không có điểm đua đó', () => {
  const E = ['a', 'b', 'c', 'd'], st = stage(OM, {}, E);
  for (let i = 0; i < 3; i++) OM.record(st, i, OM.clean(st, i, E.map((u, k) => ({ uid: u, rank: k + 1 }))).rows);
  // a (đang dẫn) vắng mặt; b bỏ cuộc nhưng có khai 50 điểm sprint + 1 vòng
  OM.record(st, 3, OM.clean(st, 3, [{ uid: 'b', dnf: true, sp: 50, lap: 1 }, { uid: 'c', rank: 1, sp: 5 }, { uid: 'd', rank: 2 }]).rows);
  const C = OM.calc(st, seedOf2);
  assert.deepStrictEqual(C.order, ['c', 'd', 'a', 'b']);
  assert.ok(C.stats.a.dnf && C.stats.b.dnf);
  assert.strictEqual(C.stats.b.total, 38 * 3, 'bỏ cuộc: không cộng điểm sprint / vòng');
});
const seedOf2 = (u) => u.charCodeAt(0);

test('mục 43 / 60: nhảy cầu – bỏ một lượt chỉ mất điểm lượt đó; chưa nhảy không đồng hạng với người 0,0', () => {
  const E = ['a', 'b', 'c', 'd', 'e'], st = stage(SJ, { events: 2 }, E);
  SJ.record(st, 0, SJ.clean(st, 0, [{ uid: 'a', pts: 100 }, { uid: 'b', pts: 50 }, { uid: 'c', pts: 0 }, { uid: 'e', dnf: true }]).rows);
  SJ.record(st, 1, SJ.clean(st, 1, [{ uid: 'a', dnf: true }, { uid: 'b', pts: 49 }, { uid: 'c', pts: 0 }, { uid: 'e', dnf: true }]).rows);
  const side = (u) => ({ uid: u });
  const v = SJ.plug.view(st, 0, 0, side, seedOf2);
  const by = Object.fromEntries(v.table.map((x) => [x.uid, x]));
  assert.deepStrictEqual(v.table.map((x) => x.uid), ['a', 'b', 'c', 'd', 'e']);
  assert.strictEqual(by.a.total, 100, '100 + bỏ lượt = 100, xếp trên 50 + 49');
  assert.ok(!by.a.dnf && by.e.dnf, 'chỉ người không có lượt nào có điểm mới là bỏ cuộc');
  assert.notStrictEqual(by.c.rank, by.d.rank, 'người 0,0 và người chưa nhảy không đồng hạng');
});

test('mục 62: backyard chạm trần số yard mà còn 2 người – giải chốt (không có nhà vô địch), không treo', () => {
  const st = stage(BY, {}, ['a', 'b']);
  let done = false;
  for (let i = 0; i < BY.MAX_YARDS; i++) done = BY.record(st, i, BY.clean(st, i, [{ uid: 'a', done: true }, { uid: 'b', done: true }]).rows);
  assert.strictEqual(st.events.length, BY.MAX_YARDS);
  assert.ok(done && st.done);
  assert.strictEqual(st.backyard.status, 'none');
});
