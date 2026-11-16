/*
 * Đợt 6 (Laplace) – sửa các lỗi stages còn lại của đợt rà soát code 16/11/2026 (mục 34–44, 56, 57, 62 trong
 * DANH-SACH-LOI-RA-SOAT-CODE-CARO-16-11-2026.md): mỗi mục một bài thử tái hiện trước khi sửa.
 * Các mục 58 (play-in per nhỏ) và 59/60/61 (cách tính DNF/dsq) chờ chủ dự án chốt ý đồ — không đụng vào.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Race = require('../src/hub/stages-race.js');
const PUR = require('../src/hub/stages-pursuit.js');
const SJ = require('../src/hub/stages-skijump.js');
const BY = require('../src/hub/stages-backyard.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const ids = (n, p = 'u') => Array.from({ length: n }, (_, i) => p + i);
const seedOf = (u) => Number(String(u).slice(1)) + 1;
const side = (u) => ({ uid: u, name: u });

test('Mục 37 – Pursuit: người không có thời gian Sprint nhận khoảng thua lớn nhất (như nhánh nhảy cầu), không phải 0', () => {
  const tables = [{ list: ['a', 'b', 'c'], stats: { a: { time: 100000, fin: 1 }, b: { time: 110000, fin: 1 }, c: {} } }];
  assert.deepStrictEqual(PUR.gapsFrom(tables, ['a', 'b', 'c'], {}), { a: 0, b: 10000, c: 10000 });
  // Đối chứng: ai cũng có thời gian thì giữ nguyên như cũ
  const full = [{ list: ['a', 'b'], stats: { a: { time: 100000, fin: 1 }, b: { time: 130000, fin: 1 } } }];
  assert.deepStrictEqual(PUR.gapsFrom(full, ['a', 'b'], {}), { a: 0, b: 30000 });
  // Đối chứng: nhánh nhảy cầu không đổi (người không có điểm vẫn nhận khoảng thua lớn nhất)
  const jump = [{ list: ['a', 'b', 'c'], stats: { a: { jump: 100 }, b: { jump: 90 }, c: {} } }];
  assert.deepStrictEqual(PUR.gapsFrom(jump, ['a', 'b', 'c'], {}), { a: 0, b: 40000, c: 40000 });
});

test('Mục 43 – Skijump (view): người chưa nhảy lượt nào không đồng hạng với người được 0.0 điểm', () => {
  const [c] = off([{ type: 'race', score: 'skijump', events: 1 }]);
  const st = ST.buildStage(c, 0, ['a', 'b', 'c', 'd', 'e'], {});
  Race.recordEvent(st, 0, Race.cleanEvent(st, [{ uid: 'a', pts: 100 }, { uid: 'b', pts: 0 }, { uid: 'd', dsq: true }, { uid: 'e', dnf: true }], st.entrants, 0).rows);
  const v = SJ.plug.view(st, 0, 0, side, seedOf);
  // a nhất (100), b hạng 2 (0.0 điểm thật), c chưa nhảy phải xếp sau b (hạng 3, tổng null), dsq/dnf nối tiếp
  assert.deepStrictEqual(v.table.map((x) => [x.uid, x.rank, x.total]), [['a', 1, 100], ['b', 2, 0], ['c', 3, null], ['d', 4, null], ['e', 5, null]]);
  // Đối chứng: hai người cùng điểm thật vẫn đồng hạng như cũ
  const st2 = ST.buildStage(c, 0, ['a', 'b', 'c'], {});
  Race.recordEvent(st2, 0, Race.cleanEvent(st2, [{ uid: 'a', pts: 50 }, { uid: 'b', pts: 50 }, { uid: 'c', pts: 30 }], st2.entrants, 0).rows);
  assert.deepStrictEqual(SJ.plug.view(st2, 0, 0, side, seedOf).table.map((x) => [x.uid, x.rank]), [['a', 1], ['b', 1], ['c', 3]]);
});

test('Mục 62 – Backyard: chạm trần 300 yard mà còn ≥ 2 người thì giải kết thúc (không vô địch), không kẹt running', () => {
  const [c] = off([{ type: 'race', score: 'backyard' }]);
  const st = ST.buildStage(c, 0, ['a', 'b'], {});
  for (let k = 0; k < 300; k++) {
    const i = st.events.findIndex((e) => !e.done);
    assert.notStrictEqual(i, -1, 'còn yard để nhập ở vòng ' + k);
    const r = BY.clean(st, i, [{ uid: 'a', done: true }, { uid: 'b', done: true }]);
    assert.ok(!r.code, JSON.stringify(r));
    BY.record(st, i, r.rows);
  }
  assert.strictEqual(st.events.length, 300);
  assert.strictEqual(st.done, true, 'giai đoạn phải xong ở yard 300');
  assert.deepStrictEqual([st.backyard.status, st.backyard.winner], ['none', null]);
  // Đối chứng: chưa chạm trần thì vẫn running và có yard kế tiếp như cũ
  const st2 = ST.buildStage(c, 0, ['a', 'b'], {});
  const r2 = BY.clean(st2, 0, [{ uid: 'a', done: true }, { uid: 'b', done: true }]);
  BY.record(st2, 0, r2.rows);
  assert.deepStrictEqual([st2.done, st2.events.length], [false, 2]);
});
