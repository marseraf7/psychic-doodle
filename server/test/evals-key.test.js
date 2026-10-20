// Mã người gửi điểm phân tích (evalcache.js): HMAC với khoá bí mật nằm ngoài caro.db – lộ CSDL (có bảng users) cũng không
// dò ngược được ai gửi; khoá đọc / tạo ở file DATA_DIR/eval-key, giữ nguyên qua các lần khởi động; xoá tài khoản xoá đúng
// các lần gửi của người đó. File riêng: khoá là biến chung của module (node --test chạy mỗi file một tiến trình).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const K = require('../../caro/eval-key.js');
const { EvalCache } = require('../src/evalcache.js');
const { start } = require('../server.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-evalkey-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('mã người gửi: HMAC theo khoá, không phải băm trơn của id (tính ngược được từ bảng users)', () => {
  const plain = (uid) => crypto.createHash('sha256').update('caro-eval:' + uid).digest('hex').slice(0, 32);
  const w = EvalCache.who('u1');
  assert.match(w, /^[0-9a-f]{32}$/);
  assert.notStrictEqual(w, plain('u1'));
  assert.notStrictEqual(w, crypto.createHash('sha256').update('u1').digest('hex').slice(0, 32));
  assert.strictEqual(EvalCache.who('u1'), w, 'cùng khoá: cùng mã');
  assert.notStrictEqual(EvalCache.who('u2'), w);
});

test('file khoá: tạo mới (32 byte, quyền 600), đọc lại cho cùng mã; khoá khác → mã khác; file hỏng thì báo lỗi', () => {
  const f = path.join(tmp, 'eval-key');
  EvalCache.useKeyFile(f);
  const hex = fs.readFileSync(f, 'utf8').trim();
  assert.match(hex, /^[0-9a-f]{64}$/);
  if (process.platform !== 'win32') assert.strictEqual(fs.statSync(f).mode & 0o777, 0o600);
  const w = EvalCache.who('u1');
  assert.strictEqual(w, crypto.createHmac('sha256', Buffer.from(hex, 'hex')).update('u1').digest('hex').slice(0, 32));
  EvalCache.useKeyFile(f); // khởi động lại: đọc đúng khoá cũ, không ghi đè
  assert.strictEqual(fs.readFileSync(f, 'utf8').trim(), hex);
  assert.strictEqual(EvalCache.who('u1'), w);
  const g = path.join(tmp, 'eval-key-2');
  EvalCache.useKeyFile(g);
  assert.notStrictEqual(EvalCache.who('u1'), w, 'máy chủ khác khoá: mã khác');
  const bad = path.join(tmp, 'eval-key-bad');
  fs.writeFileSync(bad, 'abc\n');
  assert.throws(() => EvalCache.useKeyFile(bad), /khoá hỏng/);
  assert.strictEqual(fs.readFileSync(bad, 'utf8'), 'abc\n', 'không tự tạo lại khoá');
  assert.throws(() => EvalCache.useKeyFile(path.join(tmp, 'khong-co', 'eval-key')), { code: 'ENOENT' });
});

test('máy chủ dùng DATA_DIR/eval-key; xoá tài khoản xoá đúng các lần gửi của người đó', async () => {
  const dir = path.join(tmp, 'data');
  fs.mkdirSync(dir);
  const app = start({ port: 0, dataFile: path.join(dir, 'caro.db') });
  await new Promise((r) => app.server.on('listening', r));
  try {
    const key = path.join(dir, 'eval-key');
    assert.ok(fs.existsSync(key), 'tạo file khoá cạnh caro.db');
    const hex = fs.readFileSync(key, 'utf8').trim();
    const store = app.hub.store, db = store.db;
    const ec = new EvalCache(db);
    const ida = 'id-a', idb = 'id-b'; // deleteUser chỉ cần id
    const GAME = [[0, 0], [1, 1], [-1, 1]];
    ec.submit(EvalCache.who(ida), 'vn', K.ENGINE, 10, [{ moves: GAME, move: [0, 1], score: 0, mate: null }]);
    ec.submit(EvalCache.who(idb), 'vn', K.ENGINE, 10, [{ moves: GAME, move: [0, 1], score: 0, mate: null }]);
    // Mã lưu trong bảng đúng là HMAC theo khoá trong file (không chứa id)
    const rows = db.prepare('SELECT who FROM eval_sub ORDER BY who').all().map((r) => r.who);
    const mac = (id) => crypto.createHmac('sha256', Buffer.from(hex, 'hex')).update(id).digest('hex').slice(0, 32);
    assert.deepStrictEqual(rows, [mac(ida), mac(idb)].sort());
    assert.ok(!rows.some((w) => w.includes('id-')));
    store.deleteUser({ id: ida });
    assert.deepStrictEqual(db.prepare('SELECT who FROM eval_sub').all().map((r) => r.who), [mac(idb)]);
  } finally {
    app.stop();
  }
});
