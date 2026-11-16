// Kiểm thử danh sách bài đố rỗng (caro/puzzles.js + caro/puzzle-home.js) — đợt 7 rà soát code 16/11/2026, mục 53.
// Dữ liệu thật có 363 bài nên đây là phòng thủ: puzzles.json rỗng / sai dạng không được làm crash các đường vào.
// Chạy: node --test caro/tests/puzzles.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'puzzles.js'), 'utf8');
const HOME = fs.readFileSync(path.join(__dirname, '..', 'puzzle-home.js'), 'utf8');

function fakeEl() {
  return {
    style: {}, dataset: {}, textContent: '', innerHTML: '', hidden: false, disabled: false, open: false, value: '0',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, querySelector: () => fakeEl(), querySelectorAll: () => [],
    appendChild() {}, click() {}, close() {}, showModal() {},
  };
}

function load(fetchJson) {
  const toasts = [];
  const trainerStarts = [];
  const sandbox = {
    window: {
      I18N: { t: (k, a) => k + (a ? ':' + JSON.stringify(a) : '') },
      Caro: { X: 1, O: 2 },
      CaroApp: { esc: (s) => String(s), online: false },
      CaroOnline: { toast: (m) => toasts.push(m) },
      CaroTrainer: { start: (o) => trainerStarts.push(o), refresh() {}, exit() {} },
      addEventListener() {},
    },
    document: { getElementById: () => fakeEl(), querySelectorAll: () => [], querySelector: () => fakeEl() },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, json: async () => fetchJson }),
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { P: sandbox.window.CaroPuzzles, toasts, trainerStarts, sandbox };
}

test('mục 53: pickNear / dailyPuzzle với danh sách rỗng trả null, không undefined', () => {
  const { P } = load([]);
  assert.strictEqual(P.pickNear([], 1000, new Set()), null);
  assert.strictEqual(P.dailyPuzzle([]), null);
  // Danh sách có bài nhưng bị lọc hết (mọi bài đều đã dùng)
  const one = [{ id: 'a', m: [[0, 0]], len: 1, r: 1000 }];
  assert.strictEqual(P.pickNear(one, 1000, new Set(['a'])), one[0], 'hết ứng viên thì quay về cả danh sách như cũ');
});

test('mục 53: startMode với puzzles.json rỗng — không crash, báo lỗi tải, không mở Trainer', async () => {
  const { P, toasts, trainerStarts } = load([]);
  await P.startMode('rated'); // trước sửa: nextPuzzle ném TypeError ở s.used.add(q.id)
  assert.equal(trainerStarts.length, 0);
  assert.ok(toasts.some((m) => m.startsWith('pz_load_fail')), 'phải báo cho người chơi thay vì chết lặng');
});

test('mục 53: thẻ "Câu đố hôm nay" (puzzle-home) ẩn đi khi không có bài nào, không crash render', async () => {
  const { P, sandbox } = load([]);
  const el = fakeEl();
  sandbox.window.CaroStudy = { loadPuzzles: P.loadPuzzles, dailyPuzzle: P.dailyPuzzle, startMode: P.startMode };
  sandbox.document.getElementById = (id) => (id === 'pz-today' ? el : fakeEl());
  let pageHandler = null;
  sandbox.window.addEventListener = (ev, fn) => { if (ev === 'caro:page') pageHandler = fn; };
  vm.runInContext(HOME, sandbox);
  pageHandler({ detail: { id: 'puzzles' } }); // render() chạy nền (handler không trả promise): dailyPuzzle([]) = null
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(el.hidden, true, 'không có bài thì ẩn thẻ hôm nay');
});
