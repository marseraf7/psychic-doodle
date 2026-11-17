/*
 * an-pool.js – Worker sập giữa lượt phân tích (rà soát code 16/11/2026, nghi ngờ 9): lượt không treo, thế đang chấm coi
 * như chưa chấm (null), các Worker còn lại làm nốt; lượt sau tạo lại Worker.
 * Chạy: node --test caro/tests/an-pool.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(crashFirst) {
  const made = [];
  class FakeWorker {
    constructor() { this.n = made.length; made.push(this); this.dead = false; }
    postMessage(m) {
      setTimeout(() => {
        if (this.dead) return;
        if (crashFirst && this.n === 0) { if (this.onerror) this.onerror({ preventDefault() {} }); return; } // Worker đầu sập
        if (this.onmessage) this.onmessage({ data: { id: m.id, ev: { move: [9, 9], score: 10, mate: null, q: m.ms } } });
      }, 1);
    }
    terminate() { this.dead = true; }
  }
  const Caro = require('../rules.js');
  const window = { Worker: FakeWorker, Caro, CaroAnalysis: { altNeeded: () => false } };
  const ctx = { window, Worker: FakeWorker, navigator: { hardwareConcurrency: 3, deviceMemory: 8 }, location: { protocol: 'https:' }, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'an-pool.js'), 'utf8'), ctx);
  return { pool: window.CaroAnPool, made };
}

const MOVES = [[0, 0], [5, 5], [1, 0], [6, 6], [2, 0], [7, 7]];
const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('lượt phân tích bị treo')), ms))]);

test('Worker sập: lượt phân tích vẫn xong, thế của Worker sập là null, Worker khác làm nốt', async () => {
  const { pool, made } = load(true);
  const ev = await within(pool.evaluate({ moves: MOVES, rule: 'free', ms: 100 }), 2000);
  assert.ok(Array.isArray(ev));
  assert.strictEqual(ev.filter((e) => e === null).length, 1, 'đúng một thế chưa chấm');
  assert.strictEqual(ev.filter((e) => e && e.score === 10).length, MOVES.length);
  assert.ok(made[0].dead, 'Worker sập được dừng hẳn');
  // Lượt sau: tạo lại Worker cho đủ, không gửi việc vào Worker đã sập
  const before = made.length;
  await within(pool.evaluate({ moves: MOVES.slice(0, 4), rule: 'free', ms: 200 }), 2000);
  assert.ok(made.length > before);
  pool.cancel();
});

test('Không Worker nào sập: mọi thế đều có điểm', async () => {
  const { pool } = load(false);
  const ev = await within(pool.evaluate({ moves: MOVES, rule: 'free', ms: 100 }), 2000);
  assert.ok(ev.every((e) => e && e.score === 10));
  pool.cancel();
});
