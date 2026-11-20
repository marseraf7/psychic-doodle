// Kiểm thử BOAT dùng Rapfi gốc của app desktop (caro/native-boat.js nối vào caro/boat-rapfi.js): có
// window.CaroNativeEngine thì nước đi qua bản gốc, đúng khung toạ độ / luật / thời gian; bản gốc từ chối, quá hạn hay trả
// ô có quân thì về Worker WASM; người chơi đi lại / ván mới trong lúc bản gốc nghĩ thì bỏ câu trả lời cũ; không có
// CaroNativeEngine (web, Android, iOS) thì y như cũ. Worker WASM và CaroNativeEngine đều là bản giả.
// Chạy: node --test caro/tests/native-boat.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIR = path.join(__dirname, '..');
const SRC = ['rapfi-board.js', 'rapfi-ponder.js', 'native-boat.js', 'boat-rapfi.js'].map((f) => fs.readFileSync(path.join(DIR, f), 'utf8'));
const Caro = require('../rules.js');
// 9 quân (ngoài sách khai cuộc), X đi trước: tới O. Khung rộng 6 ô → cách mép ≥ 4 ô, không phải kiểm thế sát mép
const NINE = [[0, 0], [1, 2], [2, 1], [-1, -1], [-2, 1], [3, 1], [0, 3], [-2, -2], [3, -2]];
const tick = () => new Promise((r) => setImmediate(r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hẹn giờ dài (giới hạn bỏ máy của nghĩ trước 10 phút, hạn chờ Worker…) không giữ tiến trình Node sống sau khi bài thử xong
const later = (f, ms) => { const t = setTimeout(f, ms); if (ms > 1000) t.unref(); return t; };

/** Thế giới giả: window, Worker WASM giả (trả wasmReply theo toạ độ bàn Rapfi), CaroNativeEngine giả (native). */
function load({ native, wasmReply = (moves, size) => [size >> 1, (size >> 1) - 5] } = {}) {
  const w = { wasm: [], spawned: 0 };
  class FakeWorker {
    constructor(url) { this.url = url; this.ls = new Set(); if (url === 'rapfi/worker.js') w.spawned++; }
    addEventListener(t, f) { if (t === 'message') this.ls.add(f); }
    removeEventListener(t, f) { this.ls.delete(f); }
    emit(data) { setImmediate(() => { for (const f of [...this.ls]) f({ data }); }); }
    postMessage(d) {
      if (d.type === 'init') this.emit({ type: 'ready', threads: 1, mt: false });
      else if (d.type === 'move') { w.wasm.push(d); this.emit({ type: 'move', id: d.id, move: wasmReply(d.moves, d.size), ev: { cp: 0, mate: 0 }, used: d.ms }); }
    }
    terminate() {}
  }
  const win = {
    Caro, Worker: FakeWorker, WebAssembly: { validate: () => true }, location: { protocol: 'https:' },
    navigator: { hardwareConcurrency: 4 }, matchMedia: () => ({ matches: false }), document: { hidden: false, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} }, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    addEventListener() {}, dispatchEvent() {}, setTimeout: later, clearTimeout, Date, Promise, Math,
    CaroBots: { get: (id) => (id === 'boat' ? { id: 'boat', rapfi: { ms: 2500 } } : { id }) },
  };
  if (native) win.CaroNativeEngine = native;
  win.window = win;
  vm.createContext(win);
  for (const s of SRC) vm.runInContext(s, win);
  return { R: win.CaroRapfi, NB: win.CaroNativeBoat, w, win };
}

function boardOf(rule, moves) {
  const b = new Caro.Board(rule);
  moves.forEach(([x, y], i) => b.play(x, y, i % 2 ? Caro.O : Caro.X));
  return b;
}

/** CaroNativeEngine giả: ghi lại các lần gọi; reply(moves, rule, ms) → Promise / giá trị (toạ độ bàn Rapfi). */
function fakeNative(reply) {
  const calls = [];
  return { calls, available: true, bench: async () => ({}), bestMove: (moves, rule, ms) => { calls.push({ moves, rule, ms }); return Promise.resolve(reply(moves, rule, ms)); } };
}

test('có Rapfi gốc: BOAT đi bằng bản gốc, không dựng Worker WASM, đổi toạ độ đúng khung, đúng luật và thời gian', async () => {
  for (const [rule, n] of [['std', 15], ['vn', 20], ['free', 20], ['renju', 15]]) {
    const E = fakeNative((moves, r, ms) => [moves[0][0] + 2, moves[0][1] + 4]); // ô (2, 4) theo toạ độ game
    const { R, NB, w } = load({ native: E });
    assert.ok(R.handles('boat', rule) && !R.handles('ti', rule), 'chỉ BOAT dùng Rapfi');
    R.prepare('boat', rule);
    const b = boardOf(rule, NINE);
    const m = await R.move(b, Caro.O, 'boat');
    assert.deepStrictEqual([...m], [2, 4], rule + ': trả về toạ độ game');
    assert.equal(E.calls.length, 1);
    const c = E.calls[0];
    assert.equal(c.rule, rule);
    assert.equal(c.ms, 2500, 'cùng thời gian nghĩ với bản WASM (bots.js rapfi.ms)');
    // Toạ độ bàn Rapfi 0..n-1, cùng độ dời cho mọi quân, quân đầu là X (bản gốc tự tính bên đi theo số quân)
    const ox = NINE[0][0] - c.moves[0][0], oy = NINE[0][1] - c.moves[0][1];
    assert.deepStrictEqual(c.moves.map(([x, y]) => [x + ox, y + oy]), NINE);
    assert.ok(c.moves.every(([x, y]) => x >= 4 && y >= 4 && x < n - 4 && y < n - 4), rule + ': thế nằm giữa bàn ' + n);
    assert.equal(w.spawned, 0, 'không dựng / tải Worker WASM khi đã có bản gốc');
    assert.equal(R.stats.native, 1);
    assert.equal(R.stats.rapfi, 1);
    assert.equal(NB.stats.native, 1);
  }
});

test('bản gốc từ chối: nước này đi bằng WASM, rồi RETRY_MS không hỏi bản gốc; hết hạn thì hỏi lại', async () => {
  let fail = true;
  const E = fakeNative(() => (fail ? Promise.reject('lỗi luồng engine') : [1, 1]));
  const { R, NB, w } = load({ native: E });
  NB.cfg.retryMs = 80;
  const b = boardOf('std', NINE);
  const m = await R.move(b, Caro.O, 'boat');
  assert.ok(m, 'BOAT vẫn đi');
  assert.equal(w.wasm.length, 1, 'đi bằng Worker WASM');
  assert.equal(R.stats.native, 0);
  assert.equal(NB.stats.fail, 1);
  assert.match(NB.stats.last, /lỗi luồng engine/);
  assert.ok(!NB.on('std'), 'vừa lỗi: tạm thôi bản gốc');
  await R.move(b, Caro.O, 'boat');
  assert.equal(E.calls.length, 1, 'trong RETRY_MS không hỏi bản gốc');
  assert.equal(w.wasm.length, 2);
  await sleep(100);
  fail = false;
  assert.ok(NB.on('std'));
  await R.move(b, Caro.O, 'boat');
  assert.equal(E.calls.length, 2, 'hết RETRY_MS: hỏi lại bản gốc');
  assert.equal(R.stats.native, 1);
});

test('bản gốc quá hạn (2 × thời gian nghĩ + slack): WASM đi, câu trả lời muộn bị bỏ', async () => {
  let late = null;
  const E = { available: true, calls: 0, bestMove: () => { E.calls++; return new Promise((r) => { late = r; }); } };
  const { R, NB, w, win } = load({ native: E });
  win.CaroBots.get = () => ({ id: 'boat', rapfi: { ms: 20 } });
  NB.cfg.slack = 30;
  const t0 = Date.now();
  const b = boardOf('vn', NINE);
  const m = await R.move(b, Caro.O, 'boat');
  assert.ok(Date.now() - t0 >= 60, 'chờ đủ 2 × 20 + 30 ms');
  assert.ok(m);
  assert.equal(w.wasm.length, 1, 'WASM đi nước này');
  assert.equal(NB.stats.timeout, 1);
  late([0, 0]); // bản gốc trả lời muộn: không ai dùng
  await tick();
  assert.equal(R.stats.native, 0);
});

test('bản gốc trả ô đã có quân / ngoài bàn: không đi, chuyển sang WASM', async () => {
  for (const reply of [(mv) => mv[0], () => [99, 0]]) {
    const { R, NB, w } = load({ native: fakeNative(reply) });
    const b = boardOf('std', NINE);
    const m = await R.move(b, Caro.O, 'boat');
    assert.ok(m && b.get(m[0], m[1]) === Caro.EMPTY, 'nước cuối cùng là ô trống');
    assert.equal(w.wasm.length, 1);
    assert.equal(NB.stats.fail, 1);
    assert.equal(R.stats.native, 0);
  }
});

test('người chơi đi lại / ván mới trong lúc bản gốc nghĩ: bỏ câu trả lời cũ, không chuyển sang WASM', async () => {
  for (const cancel of ['undo', 'newgame']) {
    let answer = null;
    const E = { available: true, bestMove: () => new Promise((r) => { answer = r; }) };
    const { R, NB, w } = load({ native: E });
    const b = boardOf('free', NINE);
    const p = R.move(b, Caro.O, 'boat');
    await tick();
    if (cancel === 'undo') { b.undo(); b.play(5, 5, Caro.X); } // đi lại nước cuối: thế khác, vẫn tới BOAT
    else R.prepare('boat', 'free');
    answer([10, 10]);
    assert.equal(await p, null, cancel + ': câu trả lời cũ bị bỏ');
    assert.equal(NB.stats.stale, 1);
    assert.equal(w.wasm.length, 0, 'không hỏi WASM cho thế đã cũ');
    assert.equal(R.stats.native, 0);
    assert.ok(NB.on('free'), 'bỏ câu trả lời cũ không phải lỗi của bản gốc');
  }
});

test('lượt hỏi mới thay lượt cũ chưa xong: chỉ lượt mới được dùng', async () => {
  const pending = [];
  const E = { available: true, bestMove: () => new Promise((r) => pending.push(r)) };
  const { R, NB } = load({ native: E });
  const b = boardOf('std', NINE);
  const p1 = R.move(b, Caro.O, 'boat');
  await tick();
  const p2 = R.move(b, Caro.O, 'boat');
  await tick();
  pending[0]([0, 0]);
  pending[1]([3, 3]);
  assert.equal(await p1, null);
  assert.ok(await p2);
  assert.equal(NB.stats.stale, 1);
  assert.equal(NB.stats.native, 1);
});

test('không có CaroNativeEngine (web, Android, iOS) hoặc available = false: y như cũ, đi bằng WASM', async () => {
  for (const native of [undefined, { available: false, bestMove: () => { throw new Error('không được gọi'); } }]) {
    const { R, NB, w } = load({ native });
    assert.ok(!NB.on('std'));
    R.prepare('boat', 'std');
    assert.equal(w.spawned, 1, 'dựng Worker WASM từ lúc bắt đầu ván như trước');
    const m = await R.move(boardOf('std', NINE), Caro.O, 'boat');
    assert.ok(m);
    assert.equal(w.wasm.length, 1);
    assert.equal(R.stats.native, 0);
    assert.ok(w.wasm[0].play, 'WASM vẫn nhận cách nghĩ của BOAT (play)');
  }
});

test('bản gốc đi: không nghĩ trước bằng WASM; WASM đi (dự phòng / bản web): vẫn nghĩ trước như cũ', async () => {
  const desk = load({ native: fakeNative(() => [1, 1]) });
  await desk.R.move(boardOf('std', NINE), Caro.O, 'boat');
  assert.equal(desk.R.stats.native, 1);
  assert.equal(desk.R.stats.ponder, 0, 'không nghĩ trước khi nước do bản gốc đi');
  assert.equal(desk.w.spawned, 0);
  const web = load();
  web.R.prepare('boat', 'std');
  assert.ok(await web.R.ready('std', 1000));
  await web.R.move(boardOf('std', NINE), Caro.O, 'boat');
  assert.equal(web.R.stats.ponder, 1, 'bản web: nghĩ trước như cũ');
});
