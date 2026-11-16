/*
 * Phòng thủ trước dữ liệu hỏng / vô lý – đợt rà soát code 16/11/2026:
 *   mục 4 – bản ghi ván hỏng không làm sập tiến trình khi vẽ ảnh xem trước / đọc ván;
 *   mục 5 – db.json cũ bị cắt dở hoặc một dòng tài khoản hỏng không làm máy chủ không khởi động được;
 *   mục 6 – bộ nhớ điểm dùng chung không nhận "nước tốt nhất" ở toạ độ ngoài bàn.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/store.js');
const { openDb } = require('../src/store-schema.js');
const { makeHandler } = require('../src/web.js');
const { EvalCache } = require('../src/evalcache.js');
const K = require('../../caro/eval-key.js');

const quiet = (fn) => { const e = console.error; console.error = () => {}; try { return fn(); } finally { console.error = e; } };

test('mục 4: ván hỏng (nước trùng ô / JSON hỏng) → ảnh xem trước trả 404, tiến trình còn sống', () => {
  const store = new Store(null);
  const handle = makeHandler({ store, hub: {} });
  const get = (url) => {
    const res = { status: 0, headers: {}, body: '', setHeader() {}, writeHead(s) { this.status = s; return this; }, end(b) { if (b) this.body += b; } };
    handle({ method: 'GET', url, headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res);
    return res;
  };
  const add = (share, moves) => store.db.prepare('INSERT INTO games (share, created, kind, time_limit, x_name, o_name, winner, reason, moves) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(share, Date.now(), 'casual', 0, 'X', 'O', 1, 'five', moves);
  add('trungo12', JSON.stringify([[0, 0], [1, 1], [0, 0]]));
  add('ngoaiban', JSON.stringify([[0, 0], [2000000, 5]]));
  add('jsonhong', '[[0,0],[1,');
  add('vantot12', JSON.stringify([[0, 0], [1, 1], [0, 1]]));
  quiet(() => {
    assert.strictEqual(get('/api/replay/trungo12.png').status, 404);
    assert.strictEqual(get('/api/replay/ngoaiban.png').status, 404);
    assert.strictEqual(get('/api/replay/jsonhong.png').status, 404);
    assert.strictEqual(store.gameByShare('jsonhong'), null);
  });
  assert.strictEqual(get('/api/replay/vantot12.png').status, 200, 'ván lành vẫn vẽ được sau các ván hỏng');
  store.close();
});

test('mục 5: db.json cũ bị cắt dở → máy chủ vẫn lên, file được đổi tên giữ lại; một dòng tài khoản hỏng không chặn các dòng khác', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-store-'));
  const legacy = path.join(dir, 'db.json');
  fs.writeFileSync(legacy, '{"users":[{"id":"a","username":"an"},{"id":"b","user');
  const s1 = quiet(() => new Store(null, legacy));
  assert.strictEqual(s1.users.size, 0);
  assert.ok(!fs.existsSync(legacy) && fs.readdirSync(dir).some((f) => f.startsWith('db.json.corrupt-')), 'file hỏng được đổi tên, không xoá');
  s1.close();
  // Một dòng users hỏng trong SQLite
  const file = path.join(dir, 'caro.db');
  const db = openDb(file);
  db.prepare('INSERT INTO users (id, username, data) VALUES (?,?,?)').run('u1', 'lanh', JSON.stringify({ id: 'u1', username: 'lanh', name: 'Lành' }));
  db.prepare('INSERT INTO users (id, username, data) VALUES (?,?,?)').run('u2', 'hong', '{"id":"u2","usern');
  db.close();
  const s2 = quiet(() => new Store(file));
  assert.deepStrictEqual([...s2.users.keys()], ['u1'], 'tài khoản lành vẫn nạp');
  s2.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('mục 6: hai người gửi khớp một nước ở toạ độ vô lý → không vào bộ nhớ dùng chung', () => {
  const ec = new EvalCache(openDb(null));
  const GAME = [[0, 0], [1, 0], [-1, 1], [1, 1], [2, -1]];
  const a = EvalCache.who('ua'), b = EvalCache.who('ub');
  for (const w of [a, b]) ec.submit(w, 'vn', K.ENGINE, 200000, [{ moves: GAME, move: [100000, 100000], score: 50, mate: null }]);
  assert.deepStrictEqual(ec.lookup('vn', K.ENGINE, 200000, [GAME]), []);
  // Nước hợp lệ vẫn được nhận
  for (const w of [a, b]) ec.submit(w, 'vn', K.ENGINE, 200000, [{ moves: GAME, move: [0, 1], score: 50, mate: null }]);
  assert.strictEqual(ec.lookup('vn', K.ENGINE, 200000, [GAME]).length, 1);
});
