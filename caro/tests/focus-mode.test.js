// Kiểm thử Chế độ tập trung (caro/focus-mode.js, Issue #128 hạng mục 4).
// Chạy: node --test caro/tests/focus-mode.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'focus-mode.js'), 'utf8');

function load() {
  const winListeners = {};
  const bodyClasses = new Set();
  const btnListeners = {};
  const btn = {
    hidden: true,
    addEventListener: (t, fn) => { (btnListeners[t] = btnListeners[t] || []).push(fn); },
  };
  let dialogOpen = false;
  const sandbox = {
    window: {
      addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); },
    },
    document: {
      readyState: 'complete',
      addEventListener: () => {},
      body: {
        classList: {
          add: (c) => bodyClasses.add(c),
          remove: (c) => bodyClasses.delete(c),
          contains: (c) => bodyClasses.has(c),
        },
      },
      getElementById: (id) => (id === 'focus-exit-btn' ? btn : null),
      querySelector: (sel) => (sel === 'dialog[open]' && dialogOpen ? {} : null),
    },
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  const fireKey = (key) => (winListeners.keydown || []).forEach((fn) => fn({ key }));
  const clickBtn = () => (btnListeners.click || []).forEach((fn) => fn({}));
  return {
    api: sandbox.window.CaroFocus, btn, bodyClasses, fireKey, clickBtn,
    setDialogOpen: (v) => { dialogOpen = v; },
  };
}

test('vào / ra / đổi trạng thái: class body + nút thoát đồng bộ', () => {
  const { api, btn, bodyClasses } = load();
  assert.equal(api.isOn(), false);
  api.enter();
  assert.equal(bodyClasses.has('focus-mode'), true);
  assert.equal(btn.hidden, false);
  api.exit();
  assert.equal(bodyClasses.has('focus-mode'), false);
  assert.equal(btn.hidden, true);
  api.toggle();
  assert.equal(api.isOn(), true);
  api.toggle();
  assert.equal(api.isOn(), false);
});

test('phím Esc thoát khi đang bật, không làm gì khi đang tắt', () => {
  const { api, fireKey } = load();
  fireKey('Escape');
  assert.equal(api.isOn(), false);
  api.enter();
  fireKey('Escape');
  assert.equal(api.isOn(), false);
});

test('đang mở hộp thoại thì Esc để hộp thoại xử lý, không thoát chế độ tập trung', () => {
  const { api, fireKey, setDialogOpen } = load();
  api.enter();
  setDialogOpen(true);
  fireKey('Escape');
  assert.equal(api.isOn(), true);
});

test('bấm nút thoát thì ra khỏi chế độ', () => {
  const { api, clickBtn } = load();
  api.enter();
  clickBtn();
  assert.equal(api.isOn(), false);
});
