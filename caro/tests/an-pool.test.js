// Kiểm thử an-pool khi Worker chết lặng (caro/an-pool.js) — đợt 7 rà soát code 16/11/2026, mục 71.
// Trước sửa: runTasks chỉ có onmessage, không onerror, không watchdog — Worker chết ở mức tiến trình
// thì Promise treo vĩnh viễn, study.js đứng ở trạng thái đang chấm (nhánh dự phòng chỉ chạy khi evaluate TRẢ VỀ null).
// Chạy: node --test caro/tests/an-pool.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'an-pool.js'), 'utf8');
const MOVES = [[0, 0], [1, 1], [2, 2]];
const micro = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
/** Promise có xong trong vài nhịp microtask không (không chờ thật)? */
const settled = async (p) => { let done = false; p.then(() => { done = true; }, () => { done = true; }); await micro(20); return done; };

/** Đồng hồ giả: setTimeout/clearTimeout điều khiển bằng advance(). */
function fakeTimers() {
  let now = 0, seq = 0;
  const q = new Map();
  return {
    setTimeout: (fn, ms) => { const id = ++seq; q.set(id, { fn, at: now + (ms || 0) }); return id; },
    clearTimeout: (id) => { q.delete(id); },
    advance(ms) {
      now += ms;
      for (;;) {
        const due = [...q.entries()].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) return;
        q.delete(due[0]);
        due[1].fn();
      }
    },
  };
}

function load(WorkerImpl) {
  const timers = fakeTimers();
  const instances = [];
  class W extends WorkerImpl { constructor(url) { super(url); instances.push(this); } }
  const sandbox = {
    window: {
      CaroAnalysis: { altNeeded: () => false },
      Caro: require('../rules.js'),
      Worker: W,
      matchMedia: undefined,
    },
    Worker: W, // an-pool gọi new Worker(...) trần (như trên trình duyệt, window.Worker là biến toàn cục)
    navigator: { hardwareConcurrency: 4, deviceMemory: 8 },
    location: { protocol: 'https:' },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { Pool: sandbox.window.CaroAnPool, instances, timers };
}

/** Worker không bao giờ trả lời (chết lặng). */
class SilentWorker {
  constructor(url) { this.url = url; this.sent = []; }
  postMessage(m) { this.sent.push(m); }
  terminate() { this.dead = true; }
}

/** Worker trả lời ngay, đúng giao thức ai-worker. */
class GoodWorker {
  constructor(url) { this.url = url; }
  postMessage(m) { this.onmessage({ data: { id: m.id, ev: { move: [0, 0], score: 5, mate: null, q: m.ms } } }); }
  terminate() { this.dead = true; }
}

test('mục 71: Worker báo onerror → evaluate trả null (study.js còn đường dự phòng), không treo', async () => {
  const { Pool, instances } = load(SilentWorker);
  const p = Pool.evaluate({ moves: MOVES, rule: 'vn', ms: 100 });
  await micro();
  assert.ok(instances.length >= 1 && instances[0].sent.length >= 1, 'Worker phải đã nhận việc');
  if (instances[0].onerror) instances[0].onerror(new Error('worker chết'));
  assert.equal(await settled(p), true, 'Promise phải kết thúc sau onerror');
  assert.equal(await p, null);
});

test('mục 71: Worker chết lặng hẳn (không message, không error) → watchdog bỏ lượt, trả null', async () => {
  const { Pool, instances, timers } = load(SilentWorker);
  const p = Pool.evaluate({ moves: MOVES, rule: 'vn', ms: 100 });
  await micro();
  assert.equal(await settled(p), false, 'chưa hết hạn watchdog thì vẫn chờ (không bỏ sớm)');
  timers.advance(31000); // quá hạn không tiến triển
  assert.equal(await settled(p), true, 'quá hạn không một thế nào xong thì Promise phải kết thúc');
  assert.equal(await p, null);
  assert.ok(instances.every((w) => w.dead), 'Worker cũ phải bị dừng để lượt sau tạo mới, không tái dùng Worker đã chết');
});

test('mục 71: Worker khoẻ — evaluate hoàn thành bình thường, watchdog không can thiệp', async () => {
  const { Pool, timers } = load(GoodWorker);
  const ev = await Pool.evaluate({ moves: MOVES, rule: 'vn', ms: 100 });
  assert.ok(Array.isArray(ev));
  assert.equal(ev[1].score, 5);
  timers.advance(60000); // hạn trôi qua sau khi đã xong: không được lỗi / không đổi kết quả
  assert.equal(ev[2].score, 5);
});
