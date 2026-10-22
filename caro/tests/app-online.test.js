// Kiểm thử nước đi online lạc quan (caro/app-online.js) — hồi quy H-F1:
// nước đi hiện ngay trên bàn trước khi máy chủ xác nhận, nhưng trước đây không hề bị khoá:
// chạm đúp nhanh đặt thêm quân của đối thủ lên bàn mình; gửi đi không được (mất kết nối)
// thì quân "ma" ở lại mãi. Sau khi vá: đang chờ xác nhận thì không đặt thêm được; gửi
// thất bại -> dựng lại bàn theo phòng gần nhất ngay; quá 4 giây chưa có trạng thái phòng
// mới -> tự đồng bộ lại và báo người chơi.
// Chạy: node --test caro/tests/app-online.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { mock } = require('node:test');

const Caro = require('../rules.js');
global.window = { Caro, I18N: { t: (k) => k } };
global.document = {
  getElementById: () => null,
  body: { classList: { add() {}, remove() {}, toggle() {} } },
};
require('../app-online.js');

const { X, O, Board } = Caro;

function roomView(moves, actor) {
  return {
    gameNo: 1, rule: 'vn', moves, seats: { x: 'me', o: 'opp' },
    players: [{ id: 'me', name: 'Me' }, { id: 'opp', name: 'Opp' }],
    turn: moves.length % 2 === 0 ? X : O, winner: null, winCells: null,
    score: {}, actor, phase: null, turnLeft: null, clocks: null, code: 'T1', kind: 'single',
  };
}

function setup(sendOk) {
  const calls = { placed: [], sent: [], toasts: [] };
  const state = {
    board: new Board('vn'), turn: X, winner: null, winCells: null, winReason: null,
    online: null, ext: null, replay: null, thinking: false, pending: null,
    clock: null, clocks: null, optimistic: null, rule: 'vn',
  };
  const env = {
    state, cam: { size: 32 },
    esc: (s) => String(s), glyph: () => '', ruleChip: () => '',
    net: () => ({ send: (m) => { calls.sent.push(m); return sendOk(); } }),
    sfx: () => {},
    placeRaw: (x, y) => { state.board.play(x, y, state.turn); state.turn = state.turn === X ? O : X; calls.placed.push([x, y]); },
    vibrate: () => {}, updateUI: () => {}, requestDraw: () => {}, ensureVisible: () => {},
    animateCamera: () => {}, renderClock: () => {}, resetClock: () => {},
    showBanner: () => {}, hideBanner: () => {}, closeReplay: () => {}, exitExt: () => {},
    toBoard: () => {}, save: () => {}, load: () => {}, maybeAI: () => {}, isAITurn: () => false,
    toast: (msg) => calls.toasts.push(msg),
  };
  return { api: window.CaroAppOnline(env), state, calls };
}

test('H-F1: đang chờ xác nhận thì không đặt thêm quân được (chạm đúp)', (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const { api, state, calls } = setup(() => true);
  api.applyRoom(roomView([], 'me'), 'me');
  assert.strictEqual(api.canPlaceNow(), true, 'tới lượt mình thì đặt được');
  api.playOnline(3, 3);
  assert.deepStrictEqual(state.optimistic, [3, 3]);
  assert.strictEqual(api.canPlaceNow(), false, 'chưa được xác nhận thì bị khoá');
  api.playOnline(4, 4); // cú chạm thứ hai rất nhanh
  assert.strictEqual(calls.placed.length, 1, 'không đặt thêm quân của đối thủ lên bàn mình');
  assert.strictEqual(calls.sent.length, 1, 'không gửi thêm nước nào lên máy chủ');
});

test('H-F1: gửi nước đi thất bại (mất kết nối) thì bỏ quân ma ngay', (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const { api, state } = setup(() => false);
  api.applyRoom(roomView([], 'me'), 'me');
  api.playOnline(3, 3);
  assert.strictEqual(state.optimistic, null, 'không còn nước chờ xác nhận');
  assert.strictEqual(state.board.moves.length, 0, 'bàn cờ dựng lại theo phòng gần nhất — không còn quân ma');
  assert.strictEqual(state.turn, X, 'lượt quay về như trước khi đặt');
  assert.strictEqual(api.canPlaceNow(), true, 'người chơi đi lại được sau khi đồng bộ');
});

test('H-F1: quá hạn chờ xác nhận thì tự đồng bộ lại và báo người chơi', (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const { api, state, calls } = setup(() => true);
  api.applyRoom(roomView([], 'me'), 'me');
  api.playOnline(3, 3);
  mock.timers.tick(3999);
  assert.deepStrictEqual(state.optimistic, [3, 3], 'chưa quá hạn thì vẫn chờ');
  mock.timers.tick(1);
  assert.strictEqual(state.optimistic, null, 'quá hạn: hết trạng thái chờ');
  assert.strictEqual(state.board.moves.length, 0, 'quá hạn: bàn dựng lại theo phòng gần nhất');
  assert.deepStrictEqual(calls.toasts, ['move_unconfirmed'], 'quá hạn: báo cho người chơi');
});

test('H-F1: máy chủ xác nhận kịp thì không đồng bộ lại oan', (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const { api, state, calls } = setup(() => true);
  api.applyRoom(roomView([], 'me'), 'me');
  api.playOnline(3, 3);
  api.applyRoom(roomView([[3, 3]], 'opp'), 'me'); // máy chủ xác nhận: phòng mới có nước của mình
  assert.strictEqual(state.optimistic, null, 'đã xác nhận thì hết chờ');
  mock.timers.tick(10000);
  assert.strictEqual(state.board.moves.length, 1, 'nước đã xác nhận vẫn ở trên bàn');
  assert.deepStrictEqual(calls.toasts, [], 'không báo lỗi oan');
});
