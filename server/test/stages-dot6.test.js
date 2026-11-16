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
