// Kiểm thử xử lý lưu ván và danh sách ván chờ (caro/local-save.js). Chạy: node --test caro/tests/local-save.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const LG = require('../local-games.js');

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function setupEnvironment() {
  const storage = fakeStorage();
  const store = LG.create(storage);
  const elements = {
    'lh-ask': { open: false, addEventListener() {}, showModal() { this.open = true; }, close() { this.open = false; } },
    'lh-ask-why': { textContent: '' },
    'lh-ask-q': { textContent: '' },
    'lh-ask-pick': { hidden: true },
    'lh-ask-list': { innerHTML: '', querySelectorAll: () => [] },
    'lh-ask-form': { always: { checked: false }, addEventListener() {} },
    'settings-form': null,
    'lh-ask-row': { classList: { toggle() {} } },
    'lh-online-list': { classList: { toggle() {} } },
    'lh-set-where': { textContent: '' },
    'lh-set-usage': { textContent: '' },
    'lh-set-clear': { disabled: false },
  };

  global.window = {
    CaroOnline: null,
    CaroLocalHist: { store, describe: () => ({ cls: 'win', res: 'win', opp: 'bot' }), when: () => '' },
    CaroLocalGames: LG,
    CaroApp: { esc: (s) => s },
    I18N: { t: (k) => k },
    dispatchEvent() {},
    addEventListener() {},
  };
  global.document = {
    getElementById: (id) => elements[id] || { textContent: '', classList: { toggle() {} } },
  };
  global.localStorage = storage;
  global.CustomEvent = class { constructor(t, d) { this.type = t; this.detail = d; } };

  // Xoá cache module để require nạp lại trạng thái mới
  delete require.cache[require.resolve('../local-save.js')];
  require('../local-save.js');
  return { store, elements, S: window.CaroLocalSave };
}

const mv = (n) => Array.from({ length: n }, (_, i) => [i, i % 2]);

test('thoát ván: ván tự lưu được gỡ khỏi ván chờ ngay, ván đã xoá không bị tự lưu lại', () => {
  const { store, elements, S } = setupEnvironment();
  // Ban đầu: hỏi từng ván
  store.setSettings({ on: true, ask: true, online: 'ask' });

  const gameAuto = { at: 100, kind: 'online', account: true, winner: 1, rule: 'vn', moves: mv(5) };
  const gameAsk = { at: 200, kind: 'bot', bot: 'ti', winner: 1, rule: 'vn', moves: mv(7) };

  // Hai ván kết thúc và được đưa vào hàng đợi chờ
  S.capture(gameAuto);
  S.capture(gameAsk);
  assert.strictEqual(S.pending.length, 2, 'hai ván đang chờ hỏi');

  // Người chơi đổi cài đặt ván tài khoản thành tự lưu (online: all)
  store.setSettings({ on: true, ask: true, online: 'all' });

  // Thoát ván: gameAuto được tự lưu vào kho, gameAsk mở hộp thoại hỏi
  S.exitGame();
  assert.strictEqual(store.count(), 1, 'gameAuto đã được tự lưu vào kho');
  assert.strictEqual(S.pending.length, 1, 'gameAuto phải được gỡ khỏi ván chờ ngay, chỉ còn gameAsk');
  assert.strictEqual(S.pending[0].at, 200, 'ván chờ còn lại là gameAsk');

  // Người dùng xoá gameAuto khỏi lịch sử
  const autoId = store.list()[0].id;
  store.remove([autoId]);
  assert.strictEqual(store.count(), 0, 'đã xoá gameAuto khỏi kho');

  // Hộp thoại hỏi gameAsk đóng lại hoặc người dùng sang trang khác / thoát ván lần nữa
  elements['lh-ask'].open = false;
  S.exitGame();

  // Ván đã xoá KHÔNG được tự lưu lại
  assert.strictEqual(store.count(), 0, 'ván đã xoá KHÔNG bị tự lưu lại từ hàng đợi chờ');
});

test('thoát ván khi có ván skip và ván tự lưu: dọn sạch ván chờ', () => {
  const { store, S } = setupEnvironment();
  store.setSettings({ on: true, ask: false, online: 'off' });

  const gameSkip = { at: 300, kind: 'online', account: true, winner: 1, rule: 'vn', moves: mv(5) };
  const gameSave = { at: 400, kind: 'bot', bot: 'ti', winner: 2, rule: 'vn', moves: mv(6) };

  // Giả lập ván chờ có cả ván cần bỏ qua (skip) và ván tự lưu (save)
  store.setPending([gameSkip, gameSave]);
  delete require.cache[require.resolve('../local-save.js')];
  require('../local-save.js');
  const S2 = window.CaroLocalSave;

  assert.strictEqual(S2.pending.length, 2);
  S2.exitGame();

  assert.strictEqual(store.count(), 1, 'chỉ lưu ván gameSave');
  assert.strictEqual(S2.pending.length, 0, 'ván chờ được dọn sạch hoàn toàn');
});
