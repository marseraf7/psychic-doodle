// Kiểm thử xuất ảnh ván (caro/share.js) — đợt 7 rà soát code 16/11/2026, mục 50.
// Chạy: node --test caro/tests/share.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'share.js'), 'utf8');
const Caro = require('../rules.js'); // Board / checkWin thật

function load() {
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', font: '', textAlign: '', textBaseline: '',
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {},
    fillText() {}, measureText: (s) => ({ width: String(s).length * 7 }),
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (cb) => cb({ type: 'image/png' }) };
  const el = () => ({ hidden: false, textContent: '', querySelector: () => ({ textContent: '' }) });
  const sandbox = {
    window: {
      Caro,
      I18N: { t: (k, a) => k + (a ? ':' + JSON.stringify(a) : '') },
      CaroStyle: { drawStone: () => {} },
      CaroOnline: { toast: () => {}, openDlg: () => {}, closeDlg: () => {} },
    },
    document: {
      documentElement: {},
      body: {},
      getElementById: () => el(),
      createElement: (tag) => (tag === 'canvas' ? canvas : el()),
    },
    getComputedStyle: () => ({ getPropertyValue: () => '', fontFamily: 'sans-serif' }),
    navigator: {},
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    setTimeout: () => 0,
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox.window.CaroShare;
}

const game = (moves) => ({ moves, rule: 'vn', x: 'An', o: 'Bình', result: 'An thắng' });

test('mục 50: xuất PNG ván có nước trùng ở cuối — không ném TypeError, vẫn ra ảnh', async () => {
  const S = load();
  const blob = await S.png(game([[0, 0], [1, 1], [0, 0]])); // nước cuối trùng ô đầu: Board bỏ qua khi vẽ
  assert.ok(blob && blob.type === 'image/png');
});

test('mục 50: xuất PNG ván có nước trùng ở giữa — không ném TypeError', async () => {
  const S = load();
  const blob = await S.png(game([[0, 0], [0, 0], [2, 2]]));
  assert.ok(blob && blob.type === 'image/png');
});

test('mục 50: ván hợp lệ vẫn xuất PNG như cũ', async () => {
  const S = load();
  const blob = await S.png(game([[0, 0], [1, 1], [2, 2], [3, 3]]));
  assert.ok(blob && blob.type === 'image/png');
});
