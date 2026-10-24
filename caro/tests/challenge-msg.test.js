// Kiểm thử mã tin nhắn kèm lời thách đấu (caro/challenge-msg.js, Issue #128 hạng mục 5).
// Chạy: node --test caro/tests/challenge-msg.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'challenge-msg.js'), 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(SRC, sandbox);
const { marker, parse } = sandbox.window.CaroChallengeMsg;

test('marker / parse: đi về đúng id lời mời', () => {
  const id = 'a1b2c3d4e5f6';
  assert.equal(marker(id), '[challenge:a1b2c3d4e5f6]');
  assert.equal(parse(marker(id)), id);
});

test('parse: từ chối văn bản thường, mã sai dạng, khoảng trắng thừa', () => {
  assert.equal(parse('xin chào'), null);
  assert.equal(parse('[challenge:]'), null);
  assert.equal(parse('[challenge:XYZ]'), null); // chỉ nhận hex thường
  assert.equal(parse(' [challenge:a1b2]'), null);
  assert.equal(parse('[challenge:a1b2] thêm chữ'), null);
  assert.equal(parse(null), null);
  assert.equal(parse(undefined), null);
});
