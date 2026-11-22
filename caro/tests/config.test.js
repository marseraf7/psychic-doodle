// Kiểm thử chọn máy chủ online theo nơi đăng giao diện (caro/config.js). Chạy: node --test caro/tests/config.test.js
'use strict';
const { DEFAULT_HOST: SITE_HOST, DEFAULT_ORIGIN: SITE_ORIGIN } = require('../../server/src/site.js'); // tên miền của game (một chỗ – set-domain.js)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');

function serverFor(hostname) {
  const sandbox = { window: {}, location: { hostname } };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox.window.CARO_SERVER;
}

test('bản GitHub Pages tự trỏ về máy chủ chính', () => {
  assert.equal(serverFor('marseraf7.github.io'), SITE_ORIGIN);
});

test('mọi nơi khác để trống (dùng máy chủ tại chỗ)', () => {
  assert.equal(serverFor(SITE_HOST), '');
  assert.equal(serverFor('localhost'), '');
  assert.equal(serverFor(''), '');
});
