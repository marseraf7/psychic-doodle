// Kiểm thử cache ô cấm Renju + tên cột của caro/board-view.js — đợt 7 rà soát code 16/11/2026, mục 18 + 32.
// Mục 18: khoá cache cũ (số nước + toạ độ nước cuối) trùng giữa hai thế khác nhau (đi lại rồi đi đường khác,
// tua xem lại, vào giải đố) → hiện ô cấm của thế trước. Khoá nay là đối tượng bàn + đối tượng nước cuối + số nước.
// Mục 32: colName bijective base-26 ở các cột biên 0 / 25 / 26 / 701 / 702.
// Chạy: node --test caro/tests/forbidden-cache.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function load() {
  const ctxStub = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const canvas = { style: {}, clientWidth: 800, clientHeight: 600, addEventListener() {}, getContext: () => ctxStub };
  const sandbox = {
    console,
    document: { documentElement: {}, addEventListener() {} },
    navigator: {},
    location: { protocol: 'https:' },
    requestAnimationFrame: () => 0,
    performance: { now: () => 0 },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    setTimeout, clearTimeout,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('rules.js'), sandbox);
  vm.runInContext(read('rules-ai.js'), sandbox);
  vm.runInContext(read('board-rotate.js'), sandbox);
  vm.runInContext(read('board-view.js'), sandbox);
  const Caro = sandbox.Caro;
  const state = { board: null, turn: Caro.X, winner: null, replay: false, marks: [] };
  const view = sandbox.CaroBoardView({
    canvas, cam: { x: 0, y: 0, size: 30 }, state,
    canPlaceNow: () => true, save: () => {}, MIN_SIZE: 8, MAX_SIZE: 80,
  });
  return { Caro, state, view };
}

const key = (cells) => cells.map(([x, y]) => x + ',' + y).sort();
const direct = (Caro, b) => key(Caro.candidates(b, 2).filter(([x, y]) => Caro.forbidden(b, x, y, Caro.X)));
const play = (Caro, b, moves) => moves.forEach(([x, y], i) => b.play(x, y, i % 2 ? Caro.O : Caro.X));

test('mục 18: hai thế cùng số nước + cùng ô cuối nhưng khác ô cấm — mỗi thế ra đúng ô cấm của nó', () => {
  const { Caro, state, view } = load();
  assert.equal(typeof view.forbiddenCells, 'function', 'board-view phải xuất forbiddenCells để kiểm thử được');
  const b = new Caro.Board('renju');
  state.board = b;
  // Đường A: X có (0,0)(1,0)(2,0)(3,0) và (5,0) — đánh (4,0) thành 6 quân liền = ô cấm (overline)
  play(Caro, b, [[0, 0], [20, 20], [1, 0], [25, 21], [2, 0], [30, 19], [3, 0], [27, 30], [5, 0], [19, 28]]);
  assert.deepEqual(key(view.forbiddenCells()), ['4,0']);
  assert.deepEqual(key(view.forbiddenCells()), direct(Caro, b), 'gọi lại (cache hit) vẫn đúng');
  // Đi lại toàn bộ rồi đi đường B: vẫn 10 nước, nước cuối vẫn là O ở (19,28), nhưng X ở (6,0) thay vì (5,0)
  // → (4,0) thành nước thắng đúng 5, không còn ô cấm nào. Khoá cache cũ sẽ trả nhầm ['4,0'] của thế A.
  for (let i = 0; i < 10; i++) b.undo();
  play(Caro, b, [[0, 0], [20, 20], [1, 0], [25, 21], [2, 0], [30, 19], [3, 0], [27, 30], [6, 0], [19, 28]]);
  assert.deepEqual(key(view.forbiddenCells()), [], 'thế B không có ô cấm — cache không được trả kết quả của thế A');
  assert.deepEqual(key(view.forbiddenCells()), direct(Caro, b));
});

test('mục 32: colName bijective base-26 ở các cột biên', () => {
  const { view } = load();
  assert.equal(view.colName(0), 'a');
  assert.equal(view.colName(25), 'z');
  assert.equal(view.colName(26), 'aa');
  assert.equal(view.colName(51), 'az');
  assert.equal(view.colName(52), 'ba');
  assert.equal(view.colName(701), 'zz');
  assert.equal(view.colName(702), 'aaa');
});
