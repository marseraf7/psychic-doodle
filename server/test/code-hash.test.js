/*
 * L-1 (rà soát bảo mật 20/11/2026): mã 6 số đặt lại mật khẩu / xác minh email lưu bằng HMAC-SHA256 có khoá bí mật
 * (src/code-hash.js), không còn SHA-256 thuần – đọc được caro.db cũng không dò ngược ra mã khi thiếu khoá.
 * Mã cũ (SHA-256 thuần, phát trước bản cập nhật) vẫn nhận tới khi hết hạn.
 * Chạy: npm test
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { codeHash, codeMatches, useKeyFile } = require('../src/code-hash.js');
const { Store } = require('../src/store.js');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

test('codeHash: HMAC có tiền tố h1:, khác SHA-256 thuần, khác theo mục đích', () => {
  const h = codeHash('reset', '123456');
  assert.match(h, /^h1:[0-9a-f]{64}$/);
  assert.notStrictEqual(h.slice(3), sha256('123456'), 'không còn là SHA-256 thuần (dò được 10⁶ mã trong 1 giây)');
  assert.notStrictEqual(codeHash('email', '123456'), h, 'mã đặt lại không dùng được làm mã email');
  assert.strictEqual(codeMatches('reset', '123456', h), true);
  assert.strictEqual(codeMatches('reset', '123457', h), false);
  assert.strictEqual(codeMatches('email', '123456', h), false);
});

test('codeMatches: nhận mã cũ dạng SHA-256 thuần; dữ liệu lạ → false, không ném lỗi', () => {
  assert.strictEqual(codeMatches('reset', '000042', sha256('000042')), true, 'mã phát trước bản cập nhật vẫn dùng được tới khi hết hạn');
  assert.strictEqual(codeMatches('reset', '000043', sha256('000042')), false);
  for (const bad of [null, undefined, 42, '', 'h1:', 'h1:zz', 'h1:' + 'a'.repeat(63), 'A'.repeat(64), 'abc', {}]) {
    assert.strictEqual(codeMatches('reset', '000042', bad), false, String(bad));
  }
});

test('useKeyFile: tạo file khoá quyền 600, dùng lại qua các lần khởi động; file hỏng → báo lỗi', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-codekey-'));
  try {
    const file = path.join(dir, 'code-key');
    useKeyFile(file);
    assert.match(fs.readFileSync(file, 'utf8'), /^[0-9a-f]{64}\n$/);
    if (process.platform !== 'win32') assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
    const h = codeHash('email', '654321');
    useKeyFile(file); // khởi động lại: cùng khoá → mã đã gửi vẫn đúng
    assert.strictEqual(codeMatches('email', '654321', h), true);
    const other = path.join(dir, 'other-key');
    useKeyFile(other); // khoá khác → mã cũ hết hiệu lực
    assert.strictEqual(codeMatches('email', '654321', h), false);
    fs.writeFileSync(path.join(dir, 'bad'), 'khong-phai-hex');
    assert.throws(() => useKeyFile(path.join(dir, 'bad')), /file khoá hỏng/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Store: mã đặt lại lưu dạng HMAC; mã cũ SHA-256 còn hạn vẫn nhận; sai 5 lần thì khoá', () => {
  const store = new Store(null);
  try {
    store.setReset('u1', '111222', 60000);
    const row = store.q.getReset.get('u1');
    assert.match(row.code_hash, /^h1:[0-9a-f]{64}$/);
    assert.notStrictEqual(row.code_hash, sha256('111222'));
    assert.strictEqual(store.checkReset('u1', '999999'), false);
    assert.strictEqual(store.checkReset('u1', '111222'), true);
    assert.strictEqual(store.checkReset('u1', '111222'), false, 'dùng một lần');
    // Mã phát trước bản cập nhật (SHA-256 thuần) – vẫn đặt lại được
    store.q.setReset.run('u2', sha256('333444'), Date.now() + 60000);
    assert.strictEqual(store.checkReset('u2', '333444'), true);
    store.setReset('u3', '555666', 60000);
    for (let i = 0; i < 5; i++) assert.strictEqual(store.checkReset('u3', '000000'), false);
    assert.strictEqual(store.checkReset('u3', '555666'), false, 'quá 5 lần thử thì mã đúng cũng không nhận');
  } finally { store.close(); }
});
