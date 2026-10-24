// Kiểm thử vị trí thanh công cụ (caro/bar-pos.js, Issue #128 hạng mục 1).
// Chạy: node --test caro/tests/bar-pos.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'bar-pos.js'), 'utf8');

function fakeBar() {
  const listeners = {};
  const classes = new Set();
  return {
    dataset: {},
    style: {},
    listeners,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: (t, fn) => { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
    getBoundingClientRect: () => ({ left: 100, top: 800, width: 300, height: 50, bottom: 850, right: 400 }),
    setPointerCapture: () => {},
  };
}

function load() {
  const winListeners = {};
  const store = new Map();
  const bar = fakeBar();
  const topBar = { getBoundingClientRect: () => ({ bottom: 60 }) };
  const sandbox = {
    window: {
      innerWidth: 1200,
      innerHeight: 900,
      addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); },
    },
    document: {
      readyState: 'complete',
      addEventListener: () => {},
      querySelector: (sel) => (sel === '.bar.top' ? topBar : null),
      querySelectorAll: () => [bar],
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    },
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  const fireWin = (type, ev) => (winListeners[type] || []).forEach((fn) => fn(ev));
  const fireBar = (type, ev) => (bar.listeners[type] || []).forEach((fn) => fn(ev));
  return { api: sandbox.window.CaroBarPos, bar, store, fireWin, fireBar };
}

test('snap: cạnh gần nhất thắng, hòa thì ưu tiên trái', () => {
  const { api } = load();
  assert.equal(api.snap(10, 450, 1200, 900), 'left');
  assert.equal(api.snap(1190, 450, 1200, 900), 'right');
  assert.equal(api.snap(600, 5, 1200, 900), 'top');
  assert.equal(api.snap(600, 895, 1200, 900), 'bottom');
  assert.equal(api.snap(600, 450, 1200, 900), 'top'); // giữa: top/bottom cùng 450, top thắng do thứ tự duyệt
});

test('mặc định là bottom, giá trị lưu hỏng cũng về bottom', () => {
  const { api, store } = load();
  assert.equal(api.saved(), 'bottom');
  store.set('caro.barpos', 'nonsense');
  assert.equal(api.saved(), 'bottom');
});

test('setSaved lưu lâu dài và áp lên thanh', () => {
  const { api, bar, store } = load();
  api.setSaved('left');
  assert.equal(store.get('caro.barpos'), 'left');
  assert.equal(bar.dataset.pos, 'left');
});

test('kéo thả: chưa quá 8px thì không kéo, quá thì kéo và thả snap về cạnh', () => {
  const { api, bar, fireWin, fireBar } = load();
  api.setSaved('bottom');
  fireBar('pointerdown', { clientX: 150, clientY: 820, button: 0, pointerType: 'mouse' });
  fireWin('pointermove', { clientX: 153, clientY: 822 });
  assert.equal(bar.classList.contains('dragging'), false);
  fireWin('pointermove', { clientX: 200, clientY: 820 });
  assert.equal(bar.classList.contains('dragging'), true);
  assert.equal(bar.style.left, '150px');
  fireWin('pointerup', { clientX: 30, clientY: 450 });
  assert.equal(bar.classList.contains('dragging'), false);
  assert.equal(bar.style.left, '');
  assert.equal(bar.dataset.pos, 'left');
  assert.equal(api.effective(), 'left');
});

test('kéo xong thì cú click ngay sau đó bị chặn', () => {
  const { bar, fireWin, fireBar } = load();
  fireBar('pointerdown', { clientX: 150, clientY: 820, button: 0, pointerType: 'mouse' });
  fireWin('pointermove', { clientX: 300, clientY: 820 });
  fireWin('pointerup', { clientX: 300, clientY: 820 });
  let stopped = false, prevented = false;
  fireBar('click', { stopPropagation: () => { stopped = true; }, preventDefault: () => { prevented = true; } });
  assert.equal(stopped, true);
  assert.equal(prevented, true);
});

test('hết ván (caro:newgame) thì vị trí kéo tạm bị xóa, trở về vị trí đã lưu', () => {
  const { api, bar, fireWin, fireBar } = load();
  api.setSaved('bottom');
  fireBar('pointerdown', { clientX: 150, clientY: 820, button: 0, pointerType: 'mouse' });
  fireWin('pointermove', { clientX: 300, clientY: 820 });
  fireWin('pointerup', { clientX: 1150, clientY: 450 });
  assert.equal(bar.dataset.pos, 'right');
  fireWin('caro:newgame', {});
  assert.equal(bar.dataset.pos, 'bottom');
  assert.equal(api.effective(), 'bottom');
});

test('vị trí top được đặt dưới thanh trên đo thật', () => {
  const { api, bar } = load();
  api.setSaved('top');
  assert.equal(bar.dataset.pos, 'top');
  assert.equal(bar.style.top, '68px'); // thanh trên bottom=60 + 8px khe hở
});
