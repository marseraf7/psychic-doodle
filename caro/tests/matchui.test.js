// Kiểm thử trang Cài đặt "Giao diện ván đấu" (caro/matchui.js, Issue #128 hạng mục 3).
// Chạy: node --test caro/tests/matchui.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'matchui.js'), 'utf8');

function fakeEl(rect, extra = {}) {
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
      toggle: (c, force) => {
        if (force === undefined) { if (classes.has(c)) classes.delete(c); else classes.add(c); }
        else if (force) classes.add(c); else classes.delete(c);
      },
    },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: (t, fn) => { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
    getBoundingClientRect: () => rect,
    offsetWidth: rect.width,
    offsetHeight: rect.height,
    setPointerCapture: () => {},
    ...extra,
  };
}

function load() {
  const winListeners = {};
  const store = new Map();
  let savedBar = 'bottom';
  const bar = fakeEl({ left: 180, top: 640, width: 200, height: 50 });
  const tb = fakeEl({ left: 240, top: 600, width: 80, height: 36 });
  const prev = fakeEl({ left: 100, top: 200, width: 360, height: 520 });
  const reset = fakeEl({ left: 0, top: 0, width: 100, height: 30 });
  const presets = ['bottom', 'top', 'left', 'right'].map((pos) => {
    const el = fakeEl({ left: 0, top: 0, width: 100, height: 30 });
    el.dataset.muPos = pos;
    return el;
  });
  const byId = { 'mu-bar': bar, 'mu-tb': tb, 'mu-preview': prev, 'mu-reset': reset };
  const sandbox = {
    window: {
      innerWidth: 1200, innerHeight: 900,
      addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); },
      CaroBarPos: {
        saved: () => savedBar,
        setSaved: (v) => { savedBar = v; },
        snap: (cx, cy, w, h) => {
          const d = { left: cx, right: w - cx, top: cy, bottom: h - cy };
          let best = 'left';
          for (const p of ['right', 'top', 'bottom']) if (d[p] < d[best]) best = p;
          return best;
        },
      },
    },
    document: {
      readyState: 'complete',
      addEventListener: () => {},
      getElementById: (id) => byId[id] || null,
      querySelectorAll: (sel) => (sel === '[data-mu-pos]' ? presets : []),
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  const fireWin = (type, ev) => (winListeners[type] || []).forEach((fn) => fn(ev));
  const fireEl = (el, type, ev) => (el.listeners[type] || []).forEach((fn) => fn(ev));
  return {
    api: sandbox.window.CaroMatchUI, bar, tb, prev, reset, presets, store,
    fireWin, fireEl,
    get savedBar() { return savedBar; },
  };
}

test('sync: áp vị trí thanh + vị trí nút đã lưu, đánh dấu nút chọn sẵn', () => {
  const { api, bar, tb, presets, store } = load();
  store.set('caro.tbpos', JSON.stringify({ fx: 0.5, fy: 0.5 }));
  api.sync();
  assert.equal(bar.dataset.pos, 'bottom');
  assert.equal(presets.find((p) => p.dataset.muPos === 'bottom').classList.contains('sel'), true);
  assert.equal(tb.style.left, '180px'); // 0.5*360, kẹp 360-80=280 -> 180
  assert.equal(tb.style.top, '260px'); // 0.5*520
});

test('bấm nút chọn sẵn đổi vị trí thanh đã lưu và đồng bộ xem trước', () => {
  const { api, bar, presets, fireEl } = load();
  api.sync();
  fireEl(presets.find((p) => p.dataset.muPos === 'left'), 'click', {});
  assert.equal(bar.dataset.pos, 'left');
  assert.equal(presets.find((p) => p.dataset.muPos === 'left').classList.contains('sel'), true);
});

test('kéo nút Xin đi lại trong khung: thả đâu lưu tỉ lệ đó', () => {
  const { tb, store, fireWin, fireEl } = load();
  fireEl(tb, 'pointerdown', { clientX: 280, clientY: 618, pointerType: 'mouse' });
  fireWin('pointermove', { clientX: 300, clientY: 630 });
  fireWin('pointerup', { clientX: 200, clientY: 300 });
  const saved = JSON.parse(store.get('caro.tbpos'));
  assert.ok(Math.abs(saved.fx - 100 / 360) < 0.01, 'fx = ' + saved.fx);
  assert.ok(Math.abs(saved.fy - 100 / 520) < 0.01, 'fy = ' + saved.fy);
  assert.equal(tb.style.left, '100px');
  assert.equal(tb.style.top, '100px');
});

test('kéo thanh công cụ trong khung: thả gần mép trái thì snap sang dọc trái', () => {
  const { bar, fireWin, fireEl } = load();
  fireEl(bar, 'pointerdown', { clientX: 280, clientY: 665, pointerType: 'mouse' });
  fireWin('pointermove', { clientX: 200, clientY: 600 });
  fireWin('pointerup', { clientX: 110, clientY: 400 });
  assert.equal(bar.dataset.pos, 'left');
});

test('nút Về mặc định: xóa vị trí nút, thanh về ngang dưới', () => {
  const { api, bar, store, fireEl, reset } = load();
  store.set('caro.tbpos', JSON.stringify({ fx: 0.2, fy: 0.2 }));
  api.sync();
  fireEl(reset, 'click', {});
  assert.equal(store.get('caro.tbpos'), null);
  assert.equal(bar.dataset.pos, 'bottom');
});
