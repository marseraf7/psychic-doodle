// Kiểm thử rà soát giao diện 20/11/2026 (đợt 1):
//  - Dòng kết quả khi xem lại / phân tích ván (board-replay.js resultText): ván chưa kết thúc không ghi "<người cầm O> thắng".
//  - Số phiên bản ở cuối Cài đặt (settings-ui.js pickVersion): nhận cả tên bộ nhớ đệm của bản gộp "caro-vNNN-b<mã>".
// Chạy: node --test caro/tests/replay-result.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const T = (k, a) => k + (a ? ':' + JSON.stringify(a) : '');
const X = 1, O = 2;

function resultText() {
  const sb = { window: {} };
  vm.runInNewContext(src('board-replay.js'), sb);
  return sb.window.CaroBoardReplay.resultText;
}

test('ván chưa kết thúc: "Ván chưa kết thúc", không ghi người thắng / lý do', () => {
  const r = resultText();
  for (const winner of [null, undefined, 0]) {
    const d = { x: 'An', o: 'Bình', winner, reason: 'resign', moves: [] };
    assert.strictEqual(r(d, T, X), 'replay_unfinished');
    assert.strictEqual(r(d, T, X, true), '', 'chia sẻ: không ghi kết quả');
  }
});

test('ván đã xong: người thắng, hoà, lý do kết thúc', () => {
  const r = resultText();
  assert.strictEqual(r({ x: 'An', o: 'Bình', winner: O, reason: 'resign' }, T, X), 'replay_wins:{"name":"Bình"} · end_resign');
  assert.strictEqual(r({ x: 'An', o: 'Bình', winner: X, reason: 'win' }, T, X), 'replay_wins:{"name":"An"}');
  assert.strictEqual(r({ x: 'An', o: 'Bình', winner: 3, reason: 'draw' }, T, X, true), 'draw_short');
  assert.strictEqual(r({ x: '', o: 'Bình', winner: X }, T, X), 'replay_wins:{"name":"deleted_player"}');
});

test('chuỗi replay_unfinished đủ 4 ngôn ngữ', () => {
  const s = src('i18n-replay.js');
  assert.strictEqual((s.match(/replay_unfinished: '/g) || []).length, 4);
});

function pickVersion() {
  const sb = { module: { exports: {} } };
  vm.runInNewContext(src('settings-ui.js'), sb);
  return sb.module.exports.pickVersion;
}

test('số phiên bản: bản từng file, bản gộp, chọn số lớn nhất', () => {
  const p = pickVersion();
  assert.strictEqual(p(['caro-v214']), 'v214');
  assert.strictEqual(p(['caro-v215-b3fa9c01d2']), 'v215');
  assert.strictEqual(p(['caro-rapfi-nets-1', 'caro-v99', 'caro-v214-babc', 'caro-v120']), 'v214');
  assert.strictEqual(p(['caro-rapfi-nets', 'other']), '');
  assert.strictEqual(p([]), '');
  assert.strictEqual(p(null), '');
});
