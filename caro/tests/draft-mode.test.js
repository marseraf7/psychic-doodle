// Kiểm thử Quân nháp (caro/draft-mode.js, Issue #128 hạng mục 7).
// Chạy: node --test caro/tests/draft-mode.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'draft-mode.js'), 'utf8');

function load() {
  let pushed = null;
  const sandbox = {
    window: {
      CaroApp: { setDrafts: (list) => { pushed = list; } },
      addEventListener: () => {},
    },
    document: { querySelectorAll: () => [] },
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { api: sandbox.window.CaroDraft, get pushed() { return pushed; } };
}

test('đặt quân nháp: bấm lại cùng loại thì gỡ, đổi loại thì thay', () => {
  const { api } = load();
  assert.equal(api.active(), false);
  api.setStone('X');
  assert.equal(api.active(), true);
  assert.equal(api.current(), 'X');
  api.place(3, 4);
  api.place(3, 4); // gỡ
  api.place(5, 5);
  api.setStone('O');
  api.place(5, 5); // thay X bằng O
  api.place(6, 6);
  assert.equal(api.current(), 'O');
});

test('setDrafts đẩy đúng danh sách [x, y, p] lên CaroApp', () => {
  const ctx = load();
  ctx.api.setStone('X');
  ctx.api.place(3, 4);
  ctx.api.place(7, 2);
  assert.deepEqual(ctx.pushed, [[3, 4, 'X'], [7, 2, 'X']]);
});

test('nước thật / ván mới / tắt chế độ: xóa hết quân nháp', () => {
  const ctx = load();
  ctx.api.setStone('O');
  ctx.api.place(1, 1);
  ctx.api.onRealMove();
  assert.deepEqual(ctx.pushed, []);
  ctx.api.place(2, 2);
  ctx.api.clear();
  assert.deepEqual(ctx.pushed, []);
  ctx.api.off();
  assert.equal(ctx.api.active(), false);
});
