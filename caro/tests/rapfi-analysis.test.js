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

function load({ cloudGets = [] } = {}) {
  const state = { auxDone: 0, auxReadyCalled: false, resolveAux: null, cloudCall: 0 };
  const sandbox = {
    Caro: require('../rules.js'),
    CaroAnalysis: { altNeeded: () => true },
    CaroRapfiBoard: { fit: () => ({ margin: 99 }), safe: async () => [] },
    CaroRapfi: {
      available: () => true,
      ready: async () => true,
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
