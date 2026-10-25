// Kiểm thử Issue #141 mục 3 (caro/app-online.js): mức phóng bàn cờ lúc vào ván online.
// Trước đây enterOnline giữ nguyên mức phóng của ván trên máy (có thể chỉ 14px/ô) nên bàn online
// mặc định quá nhỏ, dễ chạm nhầm ô. Nay: ưu tiên mức phóng đã lưu riêng cho online
// (localStorage 'caro.zoomOnline'), chưa có thì tự tính vừa màn hình — mỗi ô không dưới
// TOUCH_MIN 26px như ngưỡng chạm của board-input.js.
// Chạy: node --test caro/tests/fix141.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');

const Caro = require('../rules.js');
global.window = { Caro, I18N: { t: (k) => k }, innerWidth: 390, innerHeight: 844 };
global.document = {
  getElementById: () => null,
  body: { classList: { add() {}, remove() {}, toggle() {} } },
};
let store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
require('../app-online.js');

const { X, Board } = Caro;

function roomView() {
  return {
    gameNo: 1, rule: 'vn', moves: [], seats: { x: 'me', o: 'opp' },
    players: [{ id: 'me', name: 'Me' }, { id: 'opp', name: 'Opp' }],
    turn: X, winner: null, winCells: null,
    score: {}, actor: undefined, phase: null, turnLeft: null, clocks: null, code: 'T1', kind: 'single',
  };
}

function setup() {
  const calls = { camSizes: [] };
  const state = {
    board: new Board('vn'), turn: X, winner: null, winCells: null, winReason: null,
    online: null, ext: null, replay: null, thinking: false, pending: null,
    clock: null, clocks: null, optimistic: null, rule: 'vn',
  };
  const env = {
    state, cam: { size: 20 }, // mức phóng của ván trên máy đang nhỏ (14–20px/ô) — ca gây lỗi
    esc: (s) => String(s), glyph: () => '', ruleChip: () => '',
    net: () => ({ send: () => true }),
    sfx: () => {},
    placeRaw: () => {},
    vibrate: () => {}, updateUI: () => {}, requestDraw: () => {}, ensureVisible: () => {},
    animateCamera: (x, y, size) => calls.camSizes.push(size), renderClock: () => {}, resetClock: () => {},
    showBanner: () => {}, hideBanner: () => {}, closeReplay: () => {}, exitExt: () => {},
    toBoard: () => {}, save: () => {}, load: () => {}, maybeAI: () => {}, isAITurn: () => false,
    toast: () => {},
  };
  return { api: window.CaroAppOnline(env), state, calls };
}

test('mục 3: điện thoại 390×844, chưa lưu mức phóng → tự phóng vừa màn (26px/ô)', () => {
  store = {};
  global.window.innerWidth = 390; global.window.innerHeight = 844;
  const { api, calls } = setup();
  api.enterOnline(roomView(), 'me');
  assert.strictEqual(calls.camSizes.length, 1, 'vào ván có một lần đặt camera');
  assert.strictEqual(calls.camSizes[0], 26, 'ô không nhỏ hơn TOUCH_MIN 26px');
});

test('mục 3: có mức phóng đã lưu (44) → dùng đúng mức người chơi đã chọn', () => {
  store = { 'caro.zoomOnline': '44' };
  global.window.innerWidth = 390; global.window.innerHeight = 844;
  const { api, calls } = setup();
  api.enterOnline(roomView(), 'me');
  assert.strictEqual(calls.camSizes[0], 44);
});

test('mục 3: màn hình lớn 1600×1000, chưa lưu → vừa màn nhưng không quá 48px/ô', () => {
  store = {};
  global.window.innerWidth = 1600; global.window.innerHeight = 1000;
  const { api, calls } = setup();
  api.enterOnline(roomView(), 'me');
  assert.strictEqual(calls.camSizes[0], 48);
});

test('mục 3: mức phóng đã lưu không hợp lệ (8 < MIN_SIZE) → bỏ qua, tính vừa màn hình', () => {
  store = { 'caro.zoomOnline': '8' };
  global.window.innerWidth = 390; global.window.innerHeight = 844;
  const { api, calls } = setup();
  api.enterOnline(roomView(), 'me');
  assert.strictEqual(calls.camSizes[0], 26);
});
