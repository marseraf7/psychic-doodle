// Kiểm thử nút "Xin đi lại" kéo thả (caro/gamex.js, Issue #128 hạng mục 2).
// Chạy: node --test caro/tests/takeback-drag.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'gamex.js'), 'utf8');

function fakeButton() {
  const listeners = {};
  const classes = new Set(['ghost', 'sm', 'tb-float']);
  return {
    dataset: { gx: 'tb' },
    style: {},
    listeners,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: (t, fn) => { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
    getBoundingClientRect: () => ({ left: 600, top: 800, width: 80, height: 36 }),
    setPointerCapture: () => {},
    closest: (sel) => (sel === '.tb-float' || sel === '[data-gx]' ? thisBtn : null),
  };
}
// closest cần tham chiếu chính nút; gán sau khi tạo (tránh this trong object literal).
let thisBtn = null;

function load() {
  const docListeners = {};
  const winListeners = {};
  const store = new Map();
  const sent = [];
  thisBtn = fakeButton();
  thisBtn.closest = (sel) => (sel === '.tb-float' || sel === '[data-gx]' ? thisBtn : null);
  let button = thisBtn;
  const room = {
    players: [{ id: 'u1' }, { id: 'u2' }],
    winner: null, kind: 'private', moves: [[0, 0]], takeback: true, phase: null,
    takebackOffer: null, clock: true, tour: null,
  };
  const sandbox = {
    window: {
      innerWidth: 1200, innerHeight: 900,
      addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); },
      I18N: { t: (k) => k },
      CaroApp: { esc: (s) => String(s) },
      CaroOnline: {
        state: { me: { id: 'u1' }, room },
        renderInvites: () => {},
        on: () => {},
        send: (m) => sent.push(m),
      },
    },
    document: {
      addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); },
      querySelector: (sel) => (sel === '.tb-float' ? button : null),
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    },
    queueMicrotask: (fn) => fn(),
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  const fireDoc = (type, ev) => (docListeners[type] || []).forEach((fn) => fn(ev));
  const fireWin = (type, ev) => (winListeners[type] || []).forEach((fn) => fn(ev));
  const fireBtn = (type, ev) => (button.listeners[type] || []).forEach((fn) => fn(ev));
  return {
    api: sandbox.window.CaroGameX, room, sent, store,
    fireDoc, fireWin, fireBtn,
    get button() { return button; },
    setButton: (b) => { button = b; },
  };
}

test('nút Xin đi lại đứng riêng ngoài thẻ .gx-acts', () => {
  const { api } = load();
  const html = api.floatHtml();
  assert.ok(html.includes('tb-float'), 'có nút tb-float');
  const actsPart = html.split('gx-acts')[1].split('</div>')[0];
  assert.ok(!actsPart.includes('tb-float'), 'nút không nằm trong thẻ acts');
});

test('trạng thái đã gửi dùng aria-disabled (vẫn kéo được), không gửi lại khi bấm', () => {
  const { api, room, sent, fireDoc, button } = load();
  room.takebackOffer = 'u1';
  const html = api.floatHtml();
  assert.ok(html.includes('tb-sent') && html.includes('aria-disabled="true"'), 'có tb-sent + aria-disabled');
  assert.ok(!html.includes(' disabled>') && !html.includes(' disabled '), 'không dùng thuộc tính disabled (aria-disabled thì được)');
  button.classList.add('tb-sent');
  fireDoc('click', { target: button });
  assert.equal(sent.length, 0, 'bấm nút đã gửi không gửi yêu cầu');
});

test('bấm thường gửi yêu cầu; kéo quá 8px thì kéo và thả giữ nguyên chỗ thả', () => {
  const { api, sent, fireDoc, fireWin, fireBtn, button } = load();
  api.floatHtml();
  fireDoc('click', { target: button });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], { t: 'takeback' });

  fireDoc('pointerdown', { target: button, clientX: 640, clientY: 818, button: 0, pointerType: 'mouse' });
  fireWin('pointermove', { clientX: 644, clientY: 820 });
  assert.equal(button.classList.contains('dragging'), false, 'chưa quá 8px thì chưa kéo');
  fireWin('pointermove', { clientX: 700, clientY: 820 });
  assert.equal(button.classList.contains('dragging'), true);
  fireWin('pointerup', { clientX: 300, clientY: 400 });
  assert.equal(button.style.left, '300px');
  assert.equal(button.style.top, '400px');
  assert.equal(button.style.transform, 'none');
  let stopped = false, prevented = false;
  fireBtn('click', { stopPropagation: () => { stopped = true; }, preventDefault: () => { prevented = true; } });
  assert.equal(stopped, true, 'click ngay sau kéo bị chặn');
  assert.equal(prevented, true);
});

test('hết ván thì vị trí kéo tạm bị xóa; vị trí đã lưu (hạng mục 3) vẫn áp dụng', () => {
  const { api, room, setButton, store, fireDoc, fireWin, button } = load();
  api.floatHtml();
  // Kéo tới (300, 400) rồi kết thúc ván
  fireDoc('pointerdown', { target: button, clientX: 640, clientY: 818, button: 0, pointerType: 'mouse' });
  fireWin('pointermove', { clientX: 700, clientY: 820 });
  fireWin('pointerup', { clientX: 300, clientY: 400 });
  assert.equal(button.style.left, '300px');
  room.winner = 'u2';
  assert.equal(api.floatHtml(), '');
  // Ván mới, nút mới: không còn vị trí tạm
  const fresh = fakeButton();
  fresh.closest = (sel) => (sel === '.tb-float' || sel === '[data-gx]' ? fresh : null);
  setButton(fresh);
  room.winner = null;
  api.floatHtml();
  assert.equal(fresh.style.left, undefined, 'ván mới không còn vị trí kéo tạm');
  // Vị trí đã lưu thì áp dụng
  store.set('caro.tbpos', JSON.stringify({ fx: 0.5, fy: 0.5 }));
  api.floatHtml();
  assert.equal(fresh.style.left, '600px');
  assert.equal(fresh.style.top, '450px');
});
