/*
 * Thế cờ ghi sẵn trong kho cho kiểm thử đối chiếu (diff.js):
 *  - caro/puzzles.json: 363 bài đố, mỗi bài là một dãy nước (X đi trước) – chạy với cả 4 luật.
 *  - server/scripts/openings.json: khai cuộc theo từng luật – chạy với đúng luật của nó.
 *  - Các thế đặt tay trong caro/tests/rules.test.js (chép lại ở đây dạng danh sách quân).
 */
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');

/** Dãy (x,y) -> [[x, y, p]] với X đi trước, xen kẽ. */
const alt = (ms) => ms.map(([x, y], i) => [x, y, i % 2 ? 2 : 1]);

/** Ván ghi sẵn: [{ name, rule, moves: [[x, y, p]] }]. */
function fixtureGames(rules) {
  const out = [];
  const puzzles = require(path.join(ROOT, 'caro', 'puzzles.json'));
  for (const pz of puzzles) for (const rule of rules) out.push({ name: 'puzzle#' + pz.id, rule, moves: alt(pz.m) });
  const openings = require(path.join(ROOT, 'server', 'scripts', 'openings.json'));
  for (const rule of Object.keys(openings)) {
    openings[rule].forEach((ms, i) => out.push({ name: 'opening-' + rule + '#' + i, rule, moves: alt(ms) }));
  }
  return out;
}

const xs = (a) => a.map(([x, y]) => [x, y, 1]);
const os = (a) => a.map(([x, y]) => [x, y, 2]);
const row = (a, y, p) => a.map((x) => [x, y, p]);

/** Thế đặt tay (put, không theo lượt): [{ name, rule, stones: [[x, y, p]] }] – lấy từ caro/tests/rules.test.js. */
function fixtureStatic() {
  const R = (name, rule, stones) => ({ name, rule, stones });
  const renju = [
    ['33', [[1, 0], [2, 0], [0, 1], [0, 2]], []],
    ['33-gay', [[1, 0], [3, 0], [0, 1], [0, 2]], []],
    ['33-chan', [[1, 0], [2, 0], [0, 1], [0, 2]], [[3, 0]]],
    ['44', [[1, 0], [2, 0], [3, 0], [0, 1], [0, 2], [0, 3]], [[-1, 0], [0, -1]]],
    ['44-mot-duong', [[-3, 0], [-1, 0], [1, 0], [3, 0]], []],
    ['43', [[1, 0], [2, 0], [3, 0], [0, 1], [0, 2]], [[-1, 0]]],
    ['qua-nam', [[1, 0], [2, 0], [3, 0], [-1, 0], [-2, 0]], []],
    ['nam-thang', [[1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [0, 2], [0, 3]], [[0, -1]]],
    ['33-that-rif', [[1, 0], [2, 0], [0, 1], [0, 2], [-1, -3], [-1, -1], [-2, -2], [-3, -2], [-3, -1]], []],
    ['ba-doc-chan', [[1, 0], [2, 0], [0, 1], [0, 2]], [[0, 3]]],
    ['33-gia-44', [[1, 0], [2, 0], [0, 1], [0, 2], [1, -1], [2, -1], [3, -1]], [[0, 4]]],
    ['33-that-43', [[1, 0], [2, 0], [0, 1], [0, 2], [1, -1], [2, -1]], [[0, 4]]],
    ['33-gia-de-quy', [[1, 0], [2, 0], [0, 1], [0, 2], [1, -1], [2, -1], [1, -2], [2, -3]], [[0, 4]]],
    ['33-that-de-quy', [[1, 0], [2, 0], [0, 1], [0, 2], [1, -1], [2, -1], [1, -2]], [[0, 4]]],
    ['x6', [[0, 0], [1, 0], [2, 0], [4, 0], [5, 0]], []],
    ['o6', [], [[0, 0], [1, 0], [2, 0], [4, 0], [5, 0]]],
  ].map(([n, x, o]) => R('rules.test ' + n, 'renju', [...xs(x), ...os(o)]));
  const vn = [
    ['4-mo', row([0, 1, 2, 3], 0, 1)],
    ['4-chan-1', [...row([0, 1, 2, 3], 0, 1), [-1, 0, 2]]],
    ['5-chan-1', [...row([0, 1, 2, 3, 4], 0, 1), [-1, 0, 2]]],
    ['5-chan-2', [...row([0, 1, 2, 3, 4], 0, 1), [-1, 0, 2], [5, 0, 2]]],
    ['6-chan-2', [...row([0, 1, 2, 3, 4, 5], 0, 1), [-1, 0, 2], [6, 0, 2]]],
    ['cheo-4', xs([[0, 0], [1, 1], [2, 2], [3, 3]])],
    ['cheo-nguoc-5', [...xs([[0, 0], [1, -1], [2, -2], [3, -3], [4, -4]]), [5, -5, 2]]],
    ['xa', row([90000, 90001, 90002, 90003], -70000, 2)],
  ].map(([n, s]) => R('rules.test ' + n, 'vn', s));
  const free = R('rules.test free', 'free', [...row([1, 2, 3, 4], 0, 1), [0, 0, 2], [6, 0, 2], ...row([7, 8, 9, 10, 12], 1, 1)]);
  const std = R('rules.test std', 'std', [...row([0, 1, 2, 3, 5], 0, 1), ...row([0, 1, 2, 3], 3, 1), [-1, 3, 2]]);
  // Mỗi thế chạy thêm với cả 4 luật để so cả nhánh "không áp dụng"
  const base = [...renju, ...vn, free, std];
  const out = [];
  for (const f of base) for (const rule of ['vn', 'free', 'std', 'renju']) out.push({ ...f, rule, name: f.name + ' @' + rule });
  return out;
}

module.exports = { fixtureGames, fixtureStatic, alt };
