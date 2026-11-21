// Nhịp chạy giải (hub/tour-run.js – tourTick): một giải hỏng dữ liệu (đang chạy mà chưa có giai đoạn – t.st null) không
// được làm cả nhịp văng lỗi, chặn các giải khác (bắt đầu giải đã tới giờ, mở trận…) và ghi log mỗi giây.
// Gốc lỗi "lỗi ở việc hẹn giờ tourTick … reading 'matches'" khi chạy coverage: bài thử dot5 mục 74c dựng giao hữu
// 'running' mà chưa bốc thăm – runBracket đọc curStage(t) = null.
//   node --test server/test/tour-tick.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Hub } = require('../src/hub/index.js');

function fakeHub(tours) {
  const started = [];
  const h = Object.create(Hub.prototype);
  Object.assign(h, {
    closed: false,
    tours: new Map(tours.map((t) => [t.id, t])),
    inCheckin: () => false,
    startTour: (t) => started.push(t.id),
  });
  return { h, started };
}

test('tourTick: giải đang chạy chưa có giai đoạn (t.st null) không chặn giải khác, không văng lỗi', () => {
  const broken = { id: 'a1', status: 'running', format: 'bracket', st: null, stage: 0, stages: [{ type: 'single' }] };
  const later = { id: 'b2', status: 'scheduled', format: 'bracket', startsAt: Date.now() - 1000 };
  const { h, started } = fakeHub([broken, later]);
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  try {
    assert.doesNotThrow(() => h.tourTick());
    assert.doesNotThrow(() => h.tourTick());
  } finally { console.error = orig; }
  assert.deepStrictEqual(started, ['b2', 'b2'], 'giải tới giờ vẫn được bắt đầu dù giải trước hỏng');
  assert.strictEqual(errs.length, 0, 'giai đoạn chưa dựng: bỏ qua lặng lẽ (không phải lỗi)');
});

test('tourTick: lỗi bất ngờ ở một giải chỉ ghi log (kèm mã giải), các giải sau vẫn chạy', () => {
  const bad = { id: 'c3', status: 'running', format: 'arena' };
  const later = { id: 'd4', status: 'scheduled', format: 'bracket', startsAt: Date.now() - 1000 };
  const { h, started } = fakeHub([bad, later]);
  h.tickArena = () => { throw new Error('hỏng'); };
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.map(String).join(' '));
  try { assert.doesNotThrow(() => h.tourTick()); } finally { console.error = orig; }
  assert.deepStrictEqual(started, ['d4']);
  assert.ok(errs.length === 1 && errs[0].includes('c3'), 'log nêu mã giải lỗi');
});
