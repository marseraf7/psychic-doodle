// Connector MCP – từng tool qua client MCP thật: đường chạy đúng, lỗi đầu vào (lời nhắn sửa được, isError), máy cờ bận /
// quá giờ, và một ván với máy chơi tới khi kết thúc chỉ bằng play_caro (danh sách nước là toàn bộ trạng thái).
// Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { makeMcp } = require('../src/mcp/index.js');
const { Thinker } = require('../src/mcp/think.js');
const G = require('../src/mcp/game.js');
const { dailyPuzzle, allPuzzles } = require('../src/mcp/tools-info.js');
const C = require('../../caro/rules.js');
const Bots = require('../../caro/bots.js');
const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client');

const PLAYER = {
  id: 'secret-id', username: 'minh_k', name: 'Minh', rating: 1712, online: true, createdAt: Date.UTC(2026, 0, 2),
  perfs: { bullet: { rating: 1500, rd: 300, prov: true, games: 0 }, blitz: { rating: 1712, rd: 60, prov: false, games: 42 } },
  count: { wins: 30, losses: 11, draws: 1, rated: 42 },
};
const hub = {
  publicLeaderboard: (pool) => ({ pool, players: Array.from({ length: 30 }, (_, i) => ({ rank: i + 1, username: 'p' + i, name: i ? 'P' + i : 'p0', rating: 2000 - i, games: 10 })) }),
  publicPlayer: (u) => (u === 'minh_k' ? PLAYER : null),
};

let srv, mcp, client;
test.before(async () => {
  mcp = makeMcp({ hub });
  srv = http.createServer((req, res) => mcp(req, res));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  client = new Client({ name: 'test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${srv.address().port}/mcp`)));
});
test.after(async () => { await client.close(); await mcp.close(); await new Promise((r) => srv.close(r)); });

const call = (name, args) => client.callTool({ name, arguments: args });
const text = (r) => r.content[0].text;

test('play_caro: ván mới (người chơi X) chờ nước; người chơi O thì máy mở ở tâm; máy đáp và có link về game', async () => {
  let r = await call('play_caro', {});
  assert.ok(!r.isError);
  assert.deepStrictEqual(r.structuredContent.moves, []);
  assert.strictEqual(r.structuredContent.toMove, 'X');
  assert.match(text(r), /Your move \(X\).*Empty board/s);
  assert.match(text(r), /https:\/\/caroxo\.duckdns\.org/);
  r = await call('play_caro', { you_play: 'O', difficulty: 'easy', rule: 'free' });
  assert.deepStrictEqual(r.structuredContent.moves, [[0, 0]]);
  assert.strictEqual(r.structuredContent.you, 'O');
  assert.strictEqual(r.structuredContent.rule, 'free');
  r = await call('play_caro', { moves: [[0, 0]], difficulty: 'normal' });
  assert.strictEqual(r.structuredContent.moves.length, 2);
  assert.match(text(r), /Computer \(O, Normal.*\) played \[-?\d+,-?\d+\]/);
  assert.match(text(r), /moves: \[\[0,0\],/);
});

test('play_caro: máy thắng / chặn đúng lúc, trả hàng thắng; ván đã xong thì không đi thêm', async () => {
  // O (máy) có 4 quân liền 1 đầu trống ở luật free: máy phải thắng ngay
  const moves = [[0, 5], [0, 0], [1, 5], [1, 0], [2, 5], [2, 0], [5, 9], [3, 0], [7, 9]];
  let r = await call('play_caro', { moves, rule: 'free', difficulty: 'hard' });
  assert.strictEqual(r.structuredContent.winner, 'O');
  assert.strictEqual(r.structuredContent.line.length, 5);
  assert.match(text(r), /Computer wins/);
  const done = r.structuredContent.moves;
  r = await call('play_caro', { moves: done, rule: 'free' });
  assert.deepStrictEqual(r.structuredContent.moves, done, 'không đi thêm sau khi ván kết thúc');
  // Người chơi tự thắng (X 5 quân, luật tự do)
  r = await call('play_caro', { moves: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 0], [9, 9], [4, 0]], rule: 'free' });
  assert.strictEqual(r.structuredContent.winner, 'X');
  assert.match(text(r), /You win!/);
});

test('play_caro: lỗi đầu vào có lời nhắn sửa được', async () => {
  const bad = async (args, re) => { const r = await call('play_caro', args); assert.ok(r.isError, JSON.stringify(args)); assert.match(text(r), re); };
  await bad({ moves: [[0, 0], [0, 0]] }, /Move 2 \[0,0\] is on an occupied cell/);
  await bad({ moves: [[31, 0]] }, /off the board/);
  await bad({ moves: [[0, 0, 1]] }, /validation|Invalid/i);
  await bad({ moves: Array.from({ length: 401 }, (_, i) => [i % 30, Math.floor(i / 30)]) }, /validation|Too big|at most|400/i);
  await bad({ rule: 'chess' }, /validation|Invalid/i);
  await bad({ moves: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [4, 1], [9, 9]] }, /already ended at move 7 \(X won\)/); // luật vn: 4 mở hai đầu thắng ngay
  // Renju: X đánh 3-3 bị cấm
  await bad({ rule: 'renju', moves: [[1, 0], [9, 9], [2, 0], [9, 7], [0, 1], [7, 9], [0, 2], [-9, -9], [0, 0]] }, /forbidden move for X under Renju/);
});

test('suggest_caro_move: thắng ngay, chặn, bàn trống, ván đã xong', async () => {
  let r = await call('suggest_caro_move', { moves: [[0, 0], [5, 5], [1, 0], [5, 6], [2, 0], [6, 5], [3, 0], [9, 9]], rule: 'free' });
  assert.ok(!r.isError);
  assert.match(text(r), /Best move for X: \[(4|-1),0\]\. Wins immediately/);
  assert.strictEqual(r.structuredContent.reasonCode.k, 'win');
  r = await call('suggest_caro_move', { moves: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] });
  assert.strictEqual(r.structuredContent.reasonCode.k, 'block');
  r = await call('suggest_caro_move', { moves: [] });
  assert.deepStrictEqual(r.structuredContent.hint, [0, 0]);
  r = await call('suggest_caro_move', { moves: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0]], rule: 'free' });
  assert.ok(r.isError);
  assert.match(text(r), /already over/);
  r = await call('suggest_caro_move', { moves: [[0, 0], [3, 3], [1, 1], [4, 4], [6, 6], [0, 3], [5, 0]] });
  assert.ok(['search', 'forced', 'defend', 'block', 'win'].includes(r.structuredContent.reasonCode.k));
});

test('caro_puzzle: bài của ngày, theo số, kiểm nước trả lời, lời giải chỉ khi reveal', async () => {
  let r = await call('caro_puzzle', {});
  const sc = r.structuredContent;
  assert.strictEqual(sc.mode, 'puzzle');
  assert.ok(sc.puzzle.daily);
  assert.strictEqual(sc.solution, null);
  assert.match(text(r), /Solution hidden/);
  const q = allPuzzles().find((x) => x.id === 1);
  r = await call('caro_puzzle', { id: 1, answer: q.sol });
  assert.strictEqual(r.structuredContent.verdict, 'correct');
  assert.deepStrictEqual(r.structuredContent.solution, q.sol);
  r = await call('caro_puzzle', { id: 1, answer: [20, 20] });
  assert.strictEqual(r.structuredContent.verdict, 'wrong');
  assert.strictEqual(r.structuredContent.solution, null);
  r = await call('caro_puzzle', { id: 1, reveal: true });
  assert.match(text(r), new RegExp(`Solution: X plays \\[${q.sol[0]},${q.sol[1]}\\]`));
  r = await call('caro_puzzle', { id: 99999 });
  assert.ok(r.isError);
  assert.match(text(r), /No puzzle #99999/);
  r = await call('caro_puzzle', { id: 1, answer: q.m[0] });
  assert.ok(r.isError);
  assert.match(text(r), /occupied/);
  // Bài của ngày ổn định theo ngày, đổi theo ngày
  const a = dailyPuzzle(new Date('2026-11-20T10:00:00Z')).q.id, b = dailyPuzzle(new Date('2026-11-20T23:00:00Z')).q.id;
  assert.strictEqual(a, b);
  const ids = new Set(Array.from({ length: 10 }, (_, i) => dailyPuzzle(new Date(Date.UTC(2026, 0, 1 + i))).q.id));
  assert.ok(ids.size > 3);
});

test('caro_rules, caro_leaderboard, caro_player: dữ liệu công khai, không lộ mã tài khoản / online', async () => {
  let r = await call('caro_rules', {});
  for (const re of [/Vietnamese Caro/, /Freestyle/, /Standard Gomoku/, /double three/]) assert.match(text(r), re);
  r = await call('caro_leaderboard', { pool: 'blitz', limit: 3 });
  assert.match(text(r), /\(blitz rating\), top 3:\n1\. p0 – 2000 · 10 games\n2\. p1 \(P1\) – 1999/);
  assert.ok(!/p3 /.test(text(r)));
  r = await call('caro_leaderboard', {});
  assert.strictEqual(text(r).split('\n').filter((l) => /^\d+\./.test(l)).length, 10);
  r = await call('caro_leaderboard', { limit: 50 });
  assert.ok(r.isError, 'limit tối đa 20');
  r = await call('caro_player', { username: '@minh_k' });
  assert.match(text(r), /minh_k \(Minh\) – rating 1712/);
  assert.match(text(r), /blitz 1712 \(42 games\)/);
  assert.match(text(r), /won 30, lost 11, drawn 1 \(42 rated\)/);
  assert.match(text(r), /Joined: 2026-01-02/);
  assert.ok(!/secret-id|true/.test(text(r)), 'không lộ mã tài khoản / trạng thái online');
  r = await call('caro_player', { username: 'nobody1' });
  assert.ok(r.isError);
  assert.match(text(r), /No player named "nobody1"/);
  r = await call('caro_player', { username: 'a b' });
  assert.match(text(r), /3–20 characters/);
});

test('Máy cờ: hàng đợi đầy → báo bận; quá giờ → huỷ luồng, báo lỗi đọc được; lỗi trong luồng', async () => {
  const busy = new Thinker({ maxQueue: 0 });
  await assert.rejects(busy.run({ kind: 'bot', moves: [], rule: 'vn', bot: 'ti' }), /busy/);
  const slow = new Thinker({ hardMs: 5 });
  await assert.rejects(slow.run({ kind: 'analyse', moves: [[0, 0], [1, 1]], rule: 'vn', ms: 2000 }), /timeout/);
  const r = await slow.run({ kind: 'bot', moves: [], rule: 'vn', bot: 'ti' }).catch((e) => e);
  assert.ok(r instanceof Error || Array.isArray(r.move), 'luồng mới được tạo lại sau khi huỷ');
  await slow.close();
  const t = new Thinker();
  await assert.rejects(t.run({ kind: 'bot', moves: [[0, 0], [0, 0]], rule: 'vn', bot: 'ti' }), /occupied/);
  await t.close();
  // Qua tool: bận / lỗi máy cờ thành lời nhắn rõ ràng
  const m2 = makeMcp({ hub, thinker: new Thinker({ maxQueue: 0 }) });
  const s2 = http.createServer((req, res) => m2(req, res));
  await new Promise((ok) => s2.listen(0, '127.0.0.1', ok));
  const c2 = new Client({ name: 't2', version: '1' });
  try {
    await c2.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${s2.address().port}/mcp`)));
    let x = await c2.callTool({ name: 'play_caro', arguments: { moves: [[0, 0]] } });
    assert.ok(x.isError);
    assert.match(text(x), /busy.*try again/);
    m2.thinker.run = () => Promise.reject(new Error('boom'));
    x = await c2.callTool({ name: 'suggest_caro_move', arguments: { moves: [[0, 0]] } });
    assert.match(text(x), /could not answer \(boom\).*github\.com/);
  } finally { await c2.close(); await m2.close(); s2.close(); }
});

test('Ván trọn vẹn qua play_caro: người chơi (nhân vật mạnh) đấu máy mức Dễ tới khi có người thắng', async () => {
  let moves = [];
  let sc = null;
  for (let turn = 0; turn < 120; turn++) {
    const board = new C.Board('vn');
    moves.forEach((m, i) => board.play(m[0], m[1], i % 2 ? C.O : C.X));
    const mine = moves.length ? Bots.botMove(board, C.X, 'minh', () => 0.5) : [0, 0];
    const r = await call('play_caro', { moves: [...moves, mine], difficulty: 'easy' });
    assert.ok(!r.isError, text(r));
    sc = r.structuredContent;
    moves = sc.moves;
    if (sc.winner || sc.draw) break;
  }
  assert.ok(sc.winner, 'ván phải kết thúc');
  assert.strictEqual(sc.line.length >= 4, true);
  assert.strictEqual(G.replay(moves, 'vn').winner, sc.winner === 'X' ? C.X : C.O, 'kết quả khớp khi dựng lại');
});

test('game.js: bàn chữ, tên luật lạ, câu kết quả hoà', () => {
  assert.strictEqual(G.asciiBoard(G.replay([], 'vn')), '');
  const art = G.asciiBoard(G.replay([[0, 0], [1, 0]], 'vn'));
  assert.match(art, /X {2}o/);
  assert.throws(() => G.ruleArg('xx'), /Unknown rule "xx"/);
  assert.strictEqual(G.ruleArg(''), 'vn');
  assert.throws(() => G.replay('abc'), /must be an array/);
  assert.strictEqual(G.replay(null).moves.length, 0);
  assert.match(G.statusText({ winner: 0, draw: true }), /Draw/);
  assert.match(G.statusText({ winner: 0, draw: false, toMove: C.O }), /O to move/);
});
