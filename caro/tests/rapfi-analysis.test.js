// Kiểm thử rò Worker phụ NNUE khi huỷ phân tích Rapfi (caro/rapfi-analysis.js) — đợt 7 rà soát code 16/11/2026, mục 54.
// Chạy: node --test caro/tests/rapfi-analysis.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'rapfi-analysis.js'), 'utf8');
const MOVES = [[0, 0], [5, 5], [1, 0], [6, 5], [2, 0]]; // 5 nước, chưa ai thắng → 6 thế cần chấm (≥ 3: dùng 2 Worker)
const tick = () => new Promise((r) => setImmediate(r));

function load({ cloudGets = [], ready = async () => true } = {}) {
  const state = { auxDone: 0, auxReadyCalled: false, resolveAux: null, cloudCall: 0 };
  const sandbox = {
    Caro: require('../rules.js'),
    CaroAnalysis: { altNeeded: () => true },
    CaroRapfiBoard: { fit: () => ({ margin: 99 }), safe: async () => [] },
    CaroRapfi: {
      available: () => true,
      ready,
      auxReady: () => { state.auxReadyCalled = true; return new Promise((r) => { state.resolveAux = r; }); },
      auxDone: () => { state.auxDone++; },
      frame: () => ({ margin: 99 }),
      SIZE: { free: 15 },
      SAFE_EDGE: 4,
      ask: async () => ({ move: [0, 0], ev: { cp: 10, mate: 0 } }),
      check: async () => null,
    },
  };
  sandbox.window = sandbox;
  if (cloudGets.length) {
    sandbox.CaroEvalCloud = {
      get: () => cloudGets[Math.min(state.cloudCall++, cloudGets.length - 1)](),
      put: () => {},
    };
  }
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { An: sandbox.CaroRapfiAn, state };
}

async function until(fn) { for (let i = 0; i < 200 && !fn(); i++) await tick(); assert.ok(fn(), 'điều kiện chờ phải đạt'); }

test('mục 54: huỷ trong lúc chờ auxReady → vẫn phải gọi auxDone (không rò Worker phụ)', async () => {
  const { An, state } = load();
  const p = An.evaluate({ moves: MOVES, rule: 'free', ms: 100 });
  await until(() => state.auxReadyCalled);
  An.cancel(); // huỷ đúng lúc đang chờ Worker phụ sẵn sàng
  state.resolveAux(true);
  assert.equal(await p, null);
  assert.equal(state.auxDone, 1, 'auxDone phải được gọi đúng 1 lần để Worker phụ được hẹn dừng');
});

test('mục 54: huỷ trong lúc chờ cloud.get (thế sau nước tốt nhất) → vẫn phải gọi auxDone', async () => {
  let resolveSecond = null;
  const { An, state } = load({
    cloudGets: [
      async () => new Map(), // lần 1: thế thường — trả ngay
      () => new Promise((r) => { resolveSecond = r; }), // lần 2: thế sau nước tốt nhất — treo để huỷ giữa chừng
    ],
  });
  const p = An.evaluate({ moves: MOVES, rule: 'free', ms: 100 });
  await until(() => state.auxReadyCalled);
  state.resolveAux(true);
  await until(() => !!resolveSecond);
  An.cancel();
  resolveSecond(new Map());
  assert.equal(await p, null);
  assert.equal(state.auxDone, 1, 'auxDone phải được gọi đúng 1 lần dù huỷ ở đường cloud');
});

test('mục 54: không huỷ — auxDone vẫn đúng 1 lần như cũ', async () => {
  const { An, state } = load();
  const p = An.evaluate({ moves: MOVES, rule: 'free', ms: 100 });
  await until(() => state.auxReadyCalled);
  state.resolveAux(true);
  const ev = await p;
  assert.ok(Array.isArray(ev), 'phân tích phải hoàn thành');
  assert.equal(state.auxDone, 1);
});

// Rà soát 20/11/2026: phân tích đứng "0%" ~10 giây lúc nạp Rapfi (WASM + mạng) – báo giai đoạn 'load' (giao diện hiện
// "Đang nạp máy phân tích…") trong lúc chờ, 'run' khi bắt đầu chấm; warm() khởi động việc nạp sớm, không chờ.
test('onStage: "load" trong lúc chờ Rapfi, "run" trước tiến độ đầu tiên', async () => {
  let release;
  const { An, state } = load({ ready: () => new Promise((r) => { release = r; }) });
  const seen = [];
  const p = An.evaluate({ moves: MOVES, rule: 'free', ms: 100, onStage: (s) => seen.push(s), onProgress: () => { if (seen[seen.length - 1] !== 'prog') seen.push('prog'); } });
  await until(() => !!release);
  assert.deepEqual(seen, ['load'], 'đang chờ nạp: chỉ báo load, chưa có tiến độ');
  release(true);
  await until(() => state.auxReadyCalled);
  state.resolveAux(true);
  assert.ok(Array.isArray(await p));
  assert.deepEqual(seen.slice(0, 3), ['load', 'run', 'prog']);
});

test('onStage: huỷ trong lúc nạp thì không báo "run"', async () => {
  let release;
  const { An } = load({ ready: () => new Promise((r) => { release = r; }) });
  const seen = [];
  const p = An.evaluate({ moves: MOVES, rule: 'free', ms: 100, onStage: (s) => seen.push(s) });
  await until(() => !!release);
  An.cancel();
  release(true);
  assert.equal(await p, null);
  assert.deepEqual(seen, ['load']);
});

test('warm(rule): gọi ready(rule, 0) – không chờ; luật không có Rapfi thì thôi', () => {
  const calls = [];
  const { An } = load({ ready: (rule, ms) => { calls.push([rule, ms]); return Promise.resolve(true); } });
  An.warm('free');
  assert.deepEqual(calls, [['free', 0]]);
});
