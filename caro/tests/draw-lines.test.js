// Kiểm thử vẽ đường chuột phải (caro/draw-lines.js, Issue #128 hạng mục 8).
// Chạy: node --test caro/tests/draw-lines.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'draw-lines.js'), 'utf8');

function load() {
  let pushed = null;
  const sandbox = {
    window: {
      CaroApp: { setDrawLines: (list, prev) => { pushed = [list, prev]; } },
      addEventListener: () => {},
    },
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { api: sandbox.window.CaroDraw, get pushed() { return pushed; } };
}

test('snap: ngang khi dx áp đảo, dọc khi dy áp đảo, chéo 45° còn lại', () => {
  const { api } = load();
  assert.deepEqual(api.snap(2, 2, 6, 3), [2, 2, 6, 2]); // ngang
  assert.deepEqual(api.snap(2, 2, 3, 7), [2, 2, 2, 7]); // dọc
  assert.deepEqual(api.snap(2, 2, 5, 5), [2, 2, 5, 5]); // chéo
  assert.deepEqual(api.snap(2, 2, 6, 4), [2, 2, 4, 4]); // chéo, lấy min
  assert.deepEqual(api.snap(5, 5, 2, 8), [5, 5, 2, 8]); // chéo ngược
  assert.equal(api.snap(3, 3, 3, 3), null); // không nhích: không đường
});

test('kéo rồi thả: chốt đường, vẽ được nhiều đường, bấm không kéo thì không đường', () => {
  const ctx = load();
  ctx.api.begin(2, 2, 'X');
  ctx.api.move(6, 3);
  ctx.api.end();
  assert.deepEqual(ctx.pushed[0], [[2, 2, 6, 2, 'X']]);
  ctx.api.begin(1, 1, 'O');
  ctx.api.move(1, 5);
  ctx.api.end();
  assert.deepEqual(ctx.pushed[0], [[2, 2, 6, 2, 'X'], [1, 1, 1, 5, 'O']]);
  ctx.api.begin(4, 4, 'X');
  ctx.api.end(); // không kéo
  assert.deepEqual(ctx.pushed[0], [[2, 2, 6, 2, 'X'], [1, 1, 1, 5, 'O']]);
});

test('nước thật xóa hết đường', () => {
  const ctx = load();
  ctx.api.begin(2, 2, 'X');
  ctx.api.move(5, 2);
  ctx.api.end();
  assert.equal(ctx.pushed[0].length, 1);
  ctx.api.onRealMove();
  assert.deepEqual(ctx.pushed[0], []);
});
