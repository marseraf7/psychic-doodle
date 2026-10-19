// Bộ nhớ điểm dùng chung cho phân tích bằng Rapfi: khoá chuẩn (dời + 8 phép đối xứng), chỉ phát khi 2 tài khoản gửi khớp,
// từ chối dữ liệu sai, xoá theo tài khoản, dọn; tin nhắn evalGet / evalPut qua WebSocket.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const WebSocket = require('ws');
const K = require('../../caro/eval-key.js');
const { EvalCache, agree, position } = require('../src/evalcache.js');
const { openDb } = require('../src/store-schema.js');
const { start } = require('../server.js');

const GAME = [[0, 0], [1, 1], [-1, 1], [1, 0], [2, -1]]; // 5 nước, O tới lượt
// 8 phép đối xứng + dời: cùng một thế
const SYM = [
  (x, y) => [x, y], (x, y) => [-y, x], (x, y) => [-x, -y], (x, y) => [y, -x],
  (x, y) => [-x, y], (x, y) => [y, x], (x, y) => [x, -y], (x, y) => [-y, -x],
];
const moved = (f, dx, dy) => GAME.map(([x, y]) => { const [a, b] = f(x, y); return [a + dx, b + dy]; });

test('khoá chuẩn: 8 phép đối xứng + dời cho cùng khoá; đổi toạ độ đi – về khớp nhau', () => {
  const key = K.canon(GAME).key;
  for (let t = 0; t < 8; t++) {
    const mv = moved(SYM[t], 7 * t - 3, 5 - t);
    const c = K.canon(mv);
    assert.strictEqual(c.key, key, 'phép ' + t);
    for (const p of [[3, -2], [0, 0], [-5, 9]]) assert.deepStrictEqual(K.fromCanon(c, K.toCanon(c, p)), p);
    // Cùng một ô thật được đổi sang cùng một ô trong thế chuẩn
    const cell = SYM[t](4, 4).map((v, i) => v + (i ? 5 - t : 7 * t - 3));
    assert.deepStrictEqual(K.toCanon(c, cell), K.toCanon(K.canon(GAME), [4, 4]));
  }
  // Đổi thứ tự đi (cùng các quân) vẫn cùng khoá; đổi màu quân thì khác
  assert.strictEqual(K.canon([[-1, 1], [1, 0], [0, 0], [1, 1], [2, -1]]).key, key);
  assert.notStrictEqual(K.canon([[1, 1], [0, 0], [1, 0], [-1, 1], [2, -1]]).key, key);
  assert.strictEqual(K.validMoves([[0, 0], [0, 0]]), false);
  assert.strictEqual(K.validMoves([[0, 0.5]]), false);
  assert.strictEqual(K.validMoves([[0, 9999]]), false);
  assert.strictEqual(K.validMoves('x'), false);
});

test('EvalCache: một người gửi chưa phát; người thứ hai gửi khớp thì phát (đổi về toạ độ người hỏi)', () => {
  const ec = new EvalCache(openDb(null));
  const eng = K.ENGINE, nodes = 200000;
  const a = EvalCache.who('ua'), b = EvalCache.who('ub');
  assert.notStrictEqual(a, b);
  const r1 = ec.submit(a, 'vn', eng, nodes, [{ moves: GAME, move: [0, 1], score: 120, mate: null }]);
  assert.deepStrictEqual(r1, { accepted: 1, confirmed: 0 });
  assert.deepStrictEqual(ec.lookup('vn', eng, nodes, [GAME]), []);
  // Cùng người gửi lại: không tự xác nhận được
  assert.strictEqual(ec.submit(a, 'vn', eng, nodes, [{ moves: GAME, move: [0, 1], score: 120, mate: null }]).confirmed, 0);
  // Người thứ hai gửi thế đã xoay + dời, điểm lệch ít: xác nhận
  const t = 5, dx = 10, dy = -4;
  const mv = moved(SYM[t], dx, dy), m2 = SYM[t](0, 1).map((v, i) => v + (i ? dy : dx));
  assert.deepStrictEqual(ec.submit(b, 'vn', eng, nodes, [{ moves: mv, move: m2, score: 130, mate: null }]), { accepted: 1, confirmed: 1 });
  // Hỏi theo thế gốc: nước đi đổi về đúng toạ độ của người hỏi
  const hit = ec.lookup('vn', eng, nodes, [[[0, 0]], GAME]);
  assert.strictEqual(hit.length, 1);
  assert.strictEqual(hit[0].i, 1);
  assert.deepStrictEqual(hit[0].move, [0, 1]);
  assert.strictEqual(hit[0].score, 130);
  assert.strictEqual(hit[0].mate, null);
  // Hỏi kỹ hơn (nhiều nút hơn) / luật khác / bản engine khác: không có
  assert.deepStrictEqual(ec.lookup('vn', eng, nodes * 2, [GAME]), []);
  assert.deepStrictEqual(ec.lookup('free', eng, nodes, [GAME]), []);
  assert.deepStrictEqual(ec.lookup('vn', 'rapfi-old', nodes, [GAME]), []);
  // Ít nút hơn: dùng được kết quả kỹ hơn
  assert.strictEqual(ec.lookup('vn', eng, nodes / 2, [GAME]).length, 1);
});

test('EvalCache: không khớp thì không phát; dữ liệu sai bị từ chối', () => {
  const ec = new EvalCache(openDb(null));
  const eng = K.ENGINE, n = 1000, a = EvalCache.who('a'), b = EvalCache.who('b');
  ec.submit(a, 'vn', eng, n, [{ moves: GAME, move: [0, 1], score: 0, mate: null }]);
  assert.strictEqual(ec.submit(b, 'vn', eng, n, [{ moves: GAME, move: [0, 1], score: 900, mate: null }]).confirmed, 0, 'lệch xa');
  assert.strictEqual(ec.submit(b, 'vn', eng, n + 1, [{ moves: GAME, move: [0, 1], score: 0, mate: null }]).confirmed, 0, 'khác số nút');
  const bad = [
    { moves: GAME, move: [0, 0], score: 0, mate: null }, // ô đã có quân
    { moves: GAME, move: [0, 1], score: 5, mate: -3 }, // dấu thắng / thua chắc ngược dấu điểm
    { moves: GAME, move: [0, 1], score: 2e6, mate: null }, // ngoài thang
    { moves: GAME, move: [0, 1.5], score: 0, mate: null },
    { moves: [[0, 0], [0, 0]], move: [1, 1], score: 0, mate: null }, // nước trùng
    { moves: [[0, 0], [5, 5], [1, 0], [5, 6], [2, 0], [5, 7], [3, 0], [9, 9], [4, 0]], move: [8, 8], score: 0, mate: null }, // X đã thắng
    { moves: [], move: [0, 0], score: 0, mate: null },
    null, 'x',
  ];
  assert.strictEqual(ec.submit(a, 'vn', eng, n, bad).accepted, 0);
  assert.deepStrictEqual(ec.submit(a, 'vn', 'khac', n, [{ moves: GAME, move: [0, 1], score: 0, mate: null }]), { accepted: 0, confirmed: 0 });
  assert.deepStrictEqual(ec.submit(a, 'gomoku', eng, n, [{ moves: GAME, move: [0, 1], score: 0, mate: null }]).accepted, 0);
  assert.deepStrictEqual(ec.submit(a, 'vn', eng, n, Array(201).fill({ moves: GAME, move: [0, 1], score: 0, mate: null })).accepted, 0, 'quá nhiều thế');
  assert.strictEqual(position('vn', [[0, 0], [0, 0]]), null);
  // Thắng / thua chắc: khớp khi cùng dấu
  assert.ok(agree({ score: 999990, mate: 5 }, { score: 999980, mate: 10 }));
  assert.ok(!agree({ score: 999990, mate: 5 }, { score: 300, mate: null }));
  assert.ok(agree({ score: 10, mate: null }, { score: 60, mate: null }));
});

test('EvalCache: xoá theo người gửi, dọn lần gửi quá hạn', () => {
  const db = openDb(null), ec = new EvalCache(db), eng = K.ENGINE;
  const a = EvalCache.who('a');
  ec.submit(a, 'vn', eng, 10, [{ moves: GAME, move: [0, 1], score: 0, mate: null }], 1000);
  ec.dropWho(a);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM eval_sub').get().n, 0);
  ec.submit(a, 'vn', eng, 10, [{ moves: GAME, move: [0, 1], score: 0, mate: null }], 1000);
  ec.prune(1000 + 31 * 86400000);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM eval_sub').get().n, 0);
});

// ---------------------------------------------------------------- Qua WebSocket
let app, url;
test.before(async () => {
  app = start({ port: 0, dataFile: null, msgRate: 2000 });
  await new Promise((r) => app.server.on('listening', r));
  url = `ws://127.0.0.1:${app.server.address().port}/ws`;
});
test.after(() => app.stop());

async function client() {
  const c = { msgs: [], waiters: [] };
  c.ws = new WebSocket(url);
  c.ws.on('message', (d) => {
    const m = JSON.parse(d);
    c.msgs.push(m);
    c.waiters = c.waiters.filter((w) => !w(m));
  });
  await new Promise((r) => c.ws.on('open', r));
  c.send = (m) => c.ws.send(JSON.stringify(m));
  c.wait = (t, ms = 2000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Hết giờ chờ ' + t)), ms);
    c.waiters.push((m) => { if (m.t === t) { clearTimeout(timer); resolve(m); return true; } return false; });
  });
  c.req = (m, t) => { const p = c.wait(t); c.send(m); return p; };
  await c.req({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex') }, 'welcome');
  return c;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('evalGet / evalPut: khách hỏi được; gửi cần tài khoản ≥ 1 ngày; 2 tài khoản khớp thì ai cũng thấy', async () => {
  const eng = K.ENGINE, nodes = 5000, item = { moves: GAME, move: [0, 1], score: 40, mate: null };
  const guest = await client();
  const g = await guest.req({ t: 'evalGet', rid: 7, rule: 'vn', eng, nodes, list: [GAME] }, 'evalGot');
  assert.deepStrictEqual(g, { t: 'evalGot', rid: 7, hits: [] });
  // Khách gửi: bỏ qua lặng lẽ (không lỗi)
  guest.send({ t: 'evalPut', rule: 'vn', eng, nodes, items: [item] });
  const users = [];
  for (const name of ['ev_a', 'ev_b']) {
    const c = await client();
    await c.req({ t: 'register', username: name, password: 'caro-pass1' }, 'welcome');
    users.push(c);
  }
  // Tài khoản mới tạo: chưa được gửi
  users[0].send({ t: 'evalPut', rule: 'vn', eng, nodes, items: [item] });
  await sleep(150);
  assert.ok(!users[0].msgs.some((m) => m.t === 'evalPut' || m.t === 'error'));
  // Tài khoản đủ 1 ngày
  for (const u of app.store.users.values()) if (u.username.startsWith('ev_')) u.created = Date.now() - 2 * 86400000;
  assert.deepStrictEqual(await users[0].req({ t: 'evalPut', rule: 'vn', eng, nodes, items: [item] }, 'evalPut'), { t: 'evalPut', accepted: 1, confirmed: 0 });
  assert.deepStrictEqual(await users[1].req({ t: 'evalPut', rule: 'vn', eng, nodes, items: [{ ...item, score: 50 }] }, 'evalPut'), { t: 'evalPut', accepted: 1, confirmed: 1 });
  await sleep(450); // lần hỏi trước của khách vừa xong: chờ qua giới hạn tần suất
  const h = await guest.req({ t: 'evalGet', rid: 8, rule: 'vn', eng, nodes, list: [GAME] }, 'evalGot');
  assert.strictEqual(h.hits.length, 1);
  assert.deepStrictEqual(h.hits[0].move, [0, 1]);
  // Hỏi dồn: bỏ qua lặng lẽ
  guest.send({ t: 'evalGet', rid: 9, rule: 'vn', eng, nodes, list: [GAME] });
  await sleep(150);
  assert.ok(!guest.msgs.some((m) => m.rid === 9 || m.t === 'error'));
  // Xoá tài khoản: các lần gửi của người đó bị xoá
  const before = app.store.db.prepare('SELECT COUNT(*) AS n FROM eval_sub').get().n;
  await users[0].req({ t: 'deleteAccount', password: 'caro-pass1' }, 'welcome').catch(() => {});
  await sleep(100);
  assert.strictEqual(app.store.db.prepare('SELECT COUNT(*) AS n FROM eval_sub').get().n, before - 1);
  for (const c of [guest, ...users]) c.ws.close();
});
