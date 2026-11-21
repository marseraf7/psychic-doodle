'use strict';
// C4: API công khai v1 (/api/v1/*) – từng đường dẫn, quyền riêng tư (lịch sử đấu ẩn, giải riêng tư), CORS, ETag / 304,
// lỗi thống nhất, giới hạn theo IP, OpenAPI 3.1 khớp các đường dẫn; bản ghi ván dạng chữ (caro/game-text.js).
const test = require('node:test');
const assert = require('node:assert');
const { ctx, Client, account } = require('./otour-client.js');
const GT = require('../../caro/game-text.js');
const { openapi } = require('../src/api-v1-openapi.js');
const { vnDay } = require('../src/hub/api-v1.js');

const base = () => `http://127.0.0.1:${ctx.app.server.address().port}`;
const uidOf = (c) => c.msgs.filter((m) => m.t === 'welcome').pop().me.uid;
const get = (p, h = {}) => fetch(base() + '/api/v1' + p, { headers: h });

test('game-text: xuất ván kiểu PGN theo ký hiệu Caro và đọc lại đúng nước, đúng kết quả', () => {
  const g = { x: 'An "Lớn"', o: 'Bình', winner: 1, reason: 'win', rule: 'vn', opening: 'free', clock: '3+2', created: Date.parse('2026-11-21T03:00:00Z'),
    moves: Array.from({ length: 30 }, (_, i) => [i % 7 - 3, Math.floor(i / 7) - 2]) };
  const txt = GT.toText(g, { site: 'https://caro.example/?replay=abc' });
  assert.match(txt, /^\[Event "Cờ Caro"\]/);
  assert.match(txt, /\[X "An \\"Lớn\\""\]/, 'dấu ngoặc kép trong tên được thoát');
  assert.match(txt, /\[Date "2026\.11\.21"\]/);
  assert.match(txt, /\[Result "1-0"\]/);
  assert.match(txt, /\n\n1\. e10 f10 2\. g10/);
  assert.ok(txt.split('\n').every((l) => l.length <= 80 || l.startsWith('[')), 'dòng nước đi không quá 80 ký tự');
  const back = GT.parse(txt);
  assert.deepStrictEqual(back.moves, g.moves);
  assert.strictEqual(back.winner, 1);
  assert.strictEqual(back.tags.X, 'An "Lớn"');
  assert.deepStrictEqual(GT.parse('1. zz20').moves, [[694, -12]], 'ô ngoài khung vẫn đọc được');
  assert.strictEqual(GT.parse('1. h8 ??'), null, 'nước không đọc được → null');
  assert.deepStrictEqual(GT.parse('1. h8 {chú thích} i9 1/2-1/2'), { tags: {}, moves: [[0, 0], [1, -1]], winner: 3 });
  assert.strictEqual(GT.result(null), '*');
  assert.match(GT.toText({ moves: [], winner: 2, timeLimit: 30, created: NaN }), /\[Result "0-1"\][\s\S]*TimeControl "30s\/move"[\s\S]*\n\n0-1\n$/);
});

test('API v1: hồ sơ, biểu đồ điểm, ván gần đây (theo quyền riêng tư), ván + bản chữ, bảng xếp hạng, bài đố của ngày', async () => {
  const a = await account();
  const b = await account();
  const hub = ctx.app.hub;
  const ua = hub.store.users.get(uidOf(a)), ub = hub.store.users.get(uidOf(b));
  const share = hub.store.recordGame({ kind: 'casual', timeLimit: 0, rule: 'vn', xId: ua.id, oId: ub.id, xName: ua.name, oName: ub.name, winner: 1, reason: 'win', moves: [[0, 0], [1, 1], [1, 0]] });
  hub.store.addRatingPoint(ua.id, 'blitz', 1234);

  const r = await get('/player/' + ua.username);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers.get('access-control-allow-origin'), '*');
  const p = await r.json();
  assert.strictEqual(p.username, ua.username);
  for (const k of ['bullet', 'blitz', 'rapid', 'classical']) assert.strictEqual(typeof p.perfs[k].rating, 'number', k);
  const txt = JSON.stringify(p);
  for (const bad of ['email', 'friends', 'blocked', 'pass', 'google', 'sessions', ua.id]) assert.ok(!txt.includes(bad), 'không lộ ' + bad);
  // Tên viết hoa vẫn tìm được; tên sai mẫu / không có → 404 với lỗi thống nhất
  assert.strictEqual((await get('/player/' + ua.username.toUpperCase())).status, 200);
  const nf = await get('/player/khong_co_ai');
  assert.strictEqual(nf.status, 404);
  assert.deepStrictEqual(await nf.json(), { error: 'not_found', message: 'Not found' });
  assert.strictEqual((await get('/player/%3Cb%3E')).status, 404);

  const rh = await (await get(`/player/${ua.username}/rating-history`)).json();
  assert.deepStrictEqual(rh.history.blitz.map((x) => x[1]), [1234]);

  // Lịch sử đấu công khai: có ván; để "Bạn bè" / "Chỉ mình tôi": ẩn
  const g1 = await (await get(`/player/${ua.username}/games?max=5`)).json();
  assert.strictEqual(g1.hidden, false);
  assert.strictEqual(g1.games[0].id, share);
  assert.strictEqual(g1.games[0].result, 'x');
  assert.ok(!JSON.stringify(g1).includes(ua.id), 'không lộ id tài khoản');
  ub.histVis = 'friends';
  const g2 = await (await get(`/player/${ub.username}/games`)).json();
  assert.deepStrictEqual(g2, { username: ub.username, hidden: true, games: [] });
  ub.histVis = 'private';
  assert.strictEqual((await (await get(`/player/${ub.username}/games`)).json()).hidden, true);
  const pb = await (await get('/player/' + ub.username)).json();
  assert.strictEqual(pb.historyPublic, false);

  // Ván theo mã chia sẻ + bản chữ
  const gj = await (await get('/game/' + share)).json();
  assert.deepStrictEqual(gj.notation, ['h8', 'i7', 'i8']);
  assert.strictEqual(gj.url, '/?replay=' + share);
  const gt = await get(`/game/${share}.txt`);
  assert.match(gt.headers.get('content-type'), /^text\/plain/);
  const body = await gt.text();
  assert.match(body, /\[Site "http:\/\/127\.0\.0\.1:\d+\/\?replay=/);
  assert.deepStrictEqual(GT.parse(body).moves, [[0, 0], [1, 1], [1, 0]]);
  assert.strictEqual((await get('/game/khongcoma1')).status, 404);
  assert.strictEqual((await get('/game/khongcoma1.txt')).status, 404);

  // Bảng xếp hạng + bài đố của ngày (cố định theo ngày, đổi theo ngày)
  const lb = await (await get('/leaderboard?pool=blitz')).json();
  assert.strictEqual(lb.pool, 'blitz');
  assert.ok(Array.isArray(lb.players));
  const pz = await (await get('/puzzle/daily?date=2026-11-21')).json();
  assert.strictEqual(pz.date, '2026-11-21');
  assert.strictEqual(pz.notation.length, pz.moves.length);
  assert.ok(pz.rating >= 800 && pz.rating <= 1600);
  assert.deepStrictEqual(await (await get('/puzzle/daily?date=2026-11-21')).json(), pz, 'cùng ngày cùng bài');
  assert.strictEqual((await (await get('/puzzle/daily?date=bad')).json()).date, vnDay(Date.now()), 'ngày sai mẫu: hôm nay theo giờ Việt Nam');
  assert.strictEqual(vnDay(Date.parse('2026-11-21T17:00:00Z')), '2026-11-22', '0:00 giờ Việt Nam đã sang ngày mới');
  a.close(); b.close();
});

test('API v1: giải công khai + bảng xếp hạng; giải riêng tư → 404', async () => {
  for (const k of [...ctx.app.hub.fails.keys()]) if (k.startsWith('reg:')) ctx.app.hub.fails.delete(k);
  const boss = await Client.open();
  await boss.req({ t: 'register', username: 'boss', password: 'caro-pass1', name: 'Boss' }, 'welcome', undefined, 15000);
  const soon = Date.now() + 5 * 60 * 1000;
  const { id } = await boss.req({ t: 'tourCreate', name: 'API Cup', format: 'bracket', startsAt: soon, timeLimit: 30, offline: true,
    stages: [{ type: 'roundrobin', groups: 1, bestOf: 1, points: { w: 3, d: 1, l: 0 } }] }, 'tourCreated');
  await boss.req({ t: 'tourAddPlayers', id, names: ['An', 'Bình', 'Chi'] }, 'tourAddResult');
  const t = await (await get('/tournament/' + id)).json();
  assert.strictEqual(t.name, 'API Cup');
  assert.strictEqual(t.players, 3);
  assert.strictEqual(t.url, '/?t=' + id);
  const s = await (await get(`/tournament/${id}/standings`)).json();
  assert.deepStrictEqual(s.players.map((p) => p.rank), [1, 2, 3]);
  assert.ok(s.players.every((p) => !('uid' in p) && !('online' in p)), 'không lộ id / online');
  const pv = await boss.req({ t: 'tourCreate', name: 'Riêng tư', format: 'bracket', startsAt: soon, timeLimit: 30, offline: true, access: 'private',
    stages: [{ type: 'single' }] }, 'tourCreated');
  assert.strictEqual((await get('/tournament/' + pv.id)).status, 404);
  assert.strictEqual((await get(`/tournament/${pv.id}/standings`)).status, 404);
  boss.close();
});

test('API v1: ETag / 304, CORS preflight, chỉ GET, đường lạ 404, OpenAPI khớp đường dẫn, giới hạn theo IP', async () => {
  const r1 = await get('/leaderboard');
  const tag = r1.headers.get('etag');
  assert.match(tag, /^W\/"/);
  assert.match(r1.headers.get('cache-control'), /max-age=60/);
  const r2 = await get('/leaderboard', { 'if-none-match': tag });
  assert.strictEqual(r2.status, 304);
  const pre = await fetch(base() + '/api/v1/leaderboard', { method: 'OPTIONS' });
  assert.strictEqual(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-methods'), /GET/);
  const post = await fetch(base() + '/api/v1/leaderboard', { method: 'POST' });
  assert.strictEqual(post.status, 405);
  assert.strictEqual((await post.json()).error, 'method_not_allowed');
  assert.strictEqual((await get('/khong-co')).status, 404);
  assert.strictEqual((await fetch(base() + '/api/v1')).status, 404);
  // OpenAPI 3.1: mọi đường dẫn mô tả đều trả lời (không 404 vì sai đường)
  const spec = await (await get('/openapi.json')).json();
  assert.strictEqual(spec.openapi, '3.1.0');
  assert.match(spec.servers[0].url, /\/api\/v1$/);
  assert.deepStrictEqual(Object.keys(openapi().paths), Object.keys(spec.paths));
  for (const path of ['/leaderboard', '/puzzle/daily', '/openapi.json']) assert.ok(spec.paths[path].get.responses[200], path);
  // Giới hạn 120 lần / phút / IP: lần thứ 121 trong phút → 429 + Retry-After, lỗi thống nhất
  let last;
  for (let i = 0; i < 125; i++) last = await get('/leaderboard');
  assert.strictEqual(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
  assert.strictEqual((await last.json()).error, 'too_many_requests');
});
