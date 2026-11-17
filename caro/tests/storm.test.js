// Kiểm thử Puzzle Storm (caro/storm.js) — đợt 7 rà soát code 16/11/2026, mục 52.
// Chạy: node --test caro/tests/storm.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'storm.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function load(list) {
  const puzzles = list || [1, 2, 3, 4, 5, 6].map((i) => ({ id: 'q' + i, m: [[0, 0], [1, 1]], len: 1, sol: [2, 2], r: 1000 }));
  const starts = [];
  const sandbox = {
    window: {
      I18N: { t: (k, a) => k + (a ? ':' + JSON.stringify(a) : '') },
      Caro: { X: 1, O: 2 },
      CaroApp: { esc: (s) => String(s), exitExt() {} },
      CaroStudy: {
        loadPuzzles: async () => puzzles,
        pickNear: (list, target, avoid) => list.find((q) => !avoid.has(q.id)) || list[0] || null,
        Trainer: { start: (opts) => starts.push(opts), refresh() {}, exit() {} },
      },
      addEventListener() {},
    },
    document: {
      getElementById: () => ({ open: false, textContent: '' }),
      querySelectorAll: () => [],
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { Storm: sandbox.window.CaroStorm, starts };
}

test('mục 52: timer chuyển bài của phiên cũ không được thay bài đầu của phiên mới', async () => {
  const { Storm, starts } = load();
  try {
    await Storm.start(); // phiên 1
    assert.equal(starts.length, 1);
    starts[0].onSolved(true); // giải đúng → hẹn next() sau 350 ms
    starts[0].onExit(); // thoát ngay trong cửa sổ 350 ms
    await Storm.start(); // chơi lại: phiên 2
    assert.equal(starts.length, 2);
    await sleep(600); // quá 350 ms: timer phiên 1 bắn
    assert.equal(starts.length, 2, 'bài đầu phiên 2 không được bị timer phiên 1 thay mất');
  } finally {
    const cur = starts[starts.length - 1];
    if (cur && cur.onExit) cur.onExit(); // dừng phiên để ticker tự dọn, tiến trình test thoát được
    await sleep(300);
  }
});

test('mục 52: trong cùng phiên, timer chuyển bài vẫn chạy bình thường', async () => {
  const { Storm, starts } = load();
  try {
    await Storm.start();
    starts[0].onSolved(true);
    await sleep(500);
    assert.equal(starts.length, 2, 'giải đúng xong phải sang bài kế trong cùng phiên');
  } finally {
    const cur = starts[starts.length - 1];
    if (cur && cur.onExit) cur.onExit();
    await sleep(300);
  }
});


test('mục 53: Storm với danh sách bài rỗng — phiên kết thúc êm, không crash ở q.id', async () => {
  const { Storm, starts } = load([]);
  await Storm.start(); // trước sửa: next() ném TypeError vì pickNear trả null/undefined
  assert.equal(starts.length, 0, 'không có bài thì không mở Trainer');
  assert.equal(Storm.active, false, 'phiên phải đã kết thúc');
  await sleep(300); // cho ticker tự dọn
});
