'use strict';
// A5: tiến độ trong tài khoản (gộp không mất tiến độ), Puzzle Storm có kiểm (máy chủ phát bài, kiểm lời giải / thời gian /
// tốc độ), bảng xếp hạng tuần (tuần ISO theo giờ Việt Nam), API công khai, hồ sơ có chuỗi ngày + huy hiệu, xoá tài khoản.
const test = require('node:test');
const assert = require('node:assert');
const C = require('../../caro/rules.js');
const A = require('../../caro/analysis.js');
const P = require('../../caro/progress-merge.js');
const V = require('../src/storm-verify.js');
const { ctx, Client, account } = require('./otour-client.js');
const { puzzles } = require('../src/hub/progress.js');

/** Lời giải như study-trainer.js: nước giải, máy chặn, tìm tiếp chuỗi ép… tới khi thành 5. */
function solveLine(q) {
  const b = new C.Board('vn');
  q.m.forEach((m, i) => b.play(m[0], m[1], i % 2 ? C.O : C.X));
  const p = q.m.length % 2 ? C.O : C.X, o = C.other(p), line = [];
  let mv = q.sol;
  for (let k = 0; k < 8; k++) {
    b.play(mv[0], mv[1], p);
    line.push(mv);
    if (C.checkWin(b, mv[0], mv[1], p)) return line;
    const r = A.bestBlock(b, o, mv) || C.chooseMove(b, o, 2);
    b.play(r[0], r[1], o);
    line.push(r);
    mv = A.forced(b, p, 6, { deadline: Date.now() + 600 }).move;
  }
  return null;
}

test('progress-merge: gộp không mất tiến độ (lớn nhất / hợp tập / ngày đạt sớm nhất), làm sạch dữ liệu lạ', () => {
  const local = { pz: { r: 1300, n: 50, ok: 30, best: 7, daily: { d: '2026-11-19', ok: true }, recent: [1, 2] },
    storm: { best: 12, runs: 3, last: 9 }, habits: { days: ['2026-11-18', '2026-11-19'], best: 2, games: 10, bots: { ti: true }, earned: { first_game: '2026-11-18', hack: '2026-01-01' } } };
  const server = { pz: { r: 1100, n: 20, ok: 15, best: 9, daily: { d: '2026-11-20', ok: false }, recent: [3] },
    storm: { best: 20, runs: 5, last: 4 }, habits: { days: ['2026-11-15', '2026-11-16', '2026-11-17'], best: 3, games: 4, bots: { bin: true }, earned: { first_game: '2026-11-10', daily_3: '2026-11-17' } } };
  const m = P.merge(server, local);
  assert.strictEqual(m.pz.r, 1300, 'điểm giải đố theo bên đã làm nhiều bài hơn');
  assert.deepStrictEqual([m.pz.n, m.pz.ok, m.pz.best], [50, 30, 9]);
  assert.deepStrictEqual(m.pz.daily, { d: '2026-11-20', ok: false }, 'bài của ngày mới nhất');
  assert.deepStrictEqual(m.storm, { best: 20, runs: 5, last: 4 });
  assert.deepStrictEqual(m.habits.days, ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']);
  assert.strictEqual(m.habits.best, 5, 'chuỗi dài nhất tính lại từ các ngày đã hợp');
  assert.deepStrictEqual(m.habits.bots, { bin: true, ti: true });
  assert.deepStrictEqual(m.habits.earned, { first_game: '2026-11-10', daily_3: '2026-11-17' }, 'huy hiệu lạ bị bỏ, giữ ngày đạt sớm nhất');
  assert.deepStrictEqual(P.merge(m, {}), m, 'gộp với bản rỗng: không đổi');
  const junk = P.clean({ pz: { r: 'x', n: -5, recent: 'a' }, storm: { best: 1e9 }, habits: { days: ['2026-13-40x', 5, '2026-11-20'], bots: { '<b>': 1 } } });
  assert.deepStrictEqual([junk.pz.r, junk.pz.n, junk.storm.best, junk.habits.days, junk.habits.bots], [1000, 0, 1000, ['2026-11-20'], {}]);
  assert.strictEqual(P.streakOf(['2026-11-18', '2026-11-19'], '2026-11-20'), 2, 'hôm nay chưa chơi: tính từ hôm qua');
  assert.strictEqual(P.streakOf(['2026-11-18', '2026-11-20'], '2026-11-20'), 1);
});

test('tuần ISO theo giờ Việt Nam: đổi tuần lúc 00:00 thứ Hai UTC+7', () => {
  assert.strictEqual(P.weekKey(Date.parse('2026-11-22T16:59:59Z')), '2026-W47', 'CN 23:59:59 giờ VN: vẫn tuần 47');
  assert.strictEqual(P.weekKey(Date.parse('2026-11-22T17:00:00Z')), '2026-W48', 'thứ Hai 00:00 giờ VN: tuần 48');
  assert.strictEqual(P.weekKey(Date.parse('2027-01-01T05:00:00Z')), '2026-W53', 'tuần ISO vắt năm');
  assert.strictEqual(P.weekKey(Date.parse('2025-12-29T00:00:00Z')), '2026-W01');
});

test('huy hiệu: mã trong progress-merge.js khớp habits.js', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../../caro/habits.js'), 'utf8');
  const ids = [...src.matchAll(/\{ id: '([a-z0-9_]+)', icon:/g)].map((m) => m[1]);
  assert.deepStrictEqual(ids, P.BADGE_IDS);
});

test('storm-verify: danh sách theo seed, lời giải đúng / sai, kiểm cả lượt', () => {
  const { list, byId } = puzzles();
  const ids = V.stormList(list, 7);
  assert.deepStrictEqual(ids, V.stormList(list, 7), 'cùng seed: cùng danh sách');
  assert.strictEqual(new Set(ids).size, V.stormPool(list).length, 'đủ bài, không trùng');
  assert.ok(byId.get(ids[0]).r <= byId.get(ids[30]).r, 'bài đầu dễ hơn');
  const q = byId.get(ids[0]);
  const line = solveLine(q);
  assert.ok(V.verifySolve(q, line));
  assert.ok(!V.verifySolve(q, line.slice(0, -2)), 'chưa thành 5');
  assert.ok(!V.verifySolve(q, [[50, 50]].concat(line.slice(1))), 'nước đầu sai');
  assert.ok(!V.verifySolve(q, [q.m[0]]), 'ô đã có quân');
  assert.ok(!V.verifySolve(q, [line[0], [1.5, 2], line[2]]), 'toạ độ lạ');
  const run = { ids, at: 0 };
  const sub = (n) => ({ solved: ids.slice(0, n).map((id, i) => ({ i, line: solveLine(byId.get(id)) })), wrong: 1 });
  assert.deepStrictEqual(V.checkRun(run, sub(5), 60000, byId), { ok: true, score: 5 });
  assert.strictEqual(V.checkRun(run, sub(5), 2000, byId).reason, 'fast', '5 bài trong 2 giây: quá nhanh');
  assert.strictEqual(V.checkRun(run, sub(2), V.DURATION + V.MAX_BONUS + V.GRACE + 1, byId).reason, 'late');
  assert.strictEqual(V.checkRun(run, { solved: [{ i: 9, line: [] }], wrong: 0 }, 60000, byId).reason, 'index', 'bài thứ 10 khi mới thử 1 bài');
  assert.strictEqual(V.checkRun(run, { solved: [{ i: 0, line: solveLine(q) }, { i: 0, line: solveLine(q) }], wrong: 0 }, 60000, byId).reason, 'index', 'trùng bài');
  assert.strictEqual(V.checkRun(run, { solved: [{ i: 0, line: [[50, 50]] }], wrong: 0 }, 60000, byId).reason, 'line');
});

test('máy chủ: đồng bộ tiến độ, Storm có kiểm, bảng tuần, API, hồ sơ, xoá tài khoản', async () => {
  const hub = ctx.app.hub;
  const a = await account();
  const ua = [...hub.store.users.values()].at(-1); // tài khoản vừa tạo
  // Khách không đồng bộ được
  const g = await Client.open();
  const err = await g.req({ t: 'progressSync', data: {} }, 'error');
  assert.strictEqual(err.code, 'need_account');
  g.close();
  // Đồng bộ: gộp với bản trên máy chủ
  const today = new Date().toISOString().slice(0, 10);
  const r1 = await a.req({ t: 'progressSync', data: { pz: { r: 1200, n: 10, ok: 6 }, habits: { days: [today], games: 3, earned: { first_game: today } }, storm: { best: 2 } } }, 'progress');
  assert.strictEqual(r1.data.pz.n, 10);
  a.msgs.length = 0;
  await new Promise((r) => setTimeout(r, 2100)); // giới hạn 2 giây / lần
  const r2 = await a.req({ t: 'progressSync', data: { pz: { r: 900, n: 3, ok: 1 } } }, 'progress');
  assert.deepStrictEqual([r2.data.pz.r, r2.data.pz.n, r2.data.habits.games], [1200, 10, 3], 'máy khác ít tiến độ hơn: không mất tiến độ đã lưu');
  // Storm: nhận lượt, nộp lời giải đúng
  const run = await a.req({ t: 'stormStart' }, 'stormRun');
  assert.ok(run.run && run.ids.length > 100);
  const { byId } = puzzles();
  const u = ua;
  hub.stormRuns().get(u.id).at -= 60000; // giả như đã chơi 1 phút
  const solved = run.ids.slice(0, 4).map((id, i) => ({ i, line: solveLine(byId.get(id)) }));
  const res = await a.req({ t: 'stormEnd', run: run.run, solved, wrong: 2 }, 'stormResult');
  assert.deepStrictEqual([res.score, res.rank, res.weekBest, res.week], [4, 1, 4, P.weekKey()]);
  // Nộp lại cùng lượt: không được
  await new Promise((r) => setTimeout(r, 2100));
  assert.strictEqual((await a.req({ t: 'stormEnd', run: run.run, solved, wrong: 2 }, 'stormResult')).rejected, 'run');
  // Lượt gian lận (quá nhanh) – mở kết nối mới để không vướng giới hạn 5 giây / lượt của kết nối cũ
  const b = await account();
  const run2 = await b.req({ t: 'stormStart' }, 'stormRun');
  const solved2 = run2.ids.slice(0, 6).map((id, i) => ({ i, line: solveLine(byId.get(id)) }));
  assert.strictEqual((await b.req({ t: 'stormEnd', run: run2.run, solved: solved2, wrong: 0 }, 'stormResult')).rejected, 'fast');
  // Bảng tuần (WS + API công khai)
  const board = await a.req({ t: 'stormBoard' }, 'stormBoard');
  assert.strictEqual(board.players[0].score, 4);
  assert.deepStrictEqual(board.me, { score: 4, rank: 1 });
  const base = `http://127.0.0.1:${ctx.app.server.address().port}`;
  const api = await fetch(`${base}/api/storm/leaderboard`);
  assert.strictEqual(api.status, 200);
  assert.strictEqual(api.headers.get('access-control-allow-origin'), '*');
  const j = await api.json();
  assert.strictEqual(j.week, P.weekKey());
  assert.deepStrictEqual(Object.keys(j.players[0]).sort(), ['name', 'rank', 'score', 'username'], 'không có id tài khoản / trường riêng');
  // Hồ sơ: chuỗi ngày, huy hiệu, Storm
  const prof = await a.req({ t: 'profile', username: u.username }, 'profile');
  assert.deepStrictEqual([prof.profile.progress.streak, prof.profile.progress.badges, prof.profile.progress.storm], [1, ['first_game'], 4]);
  const pub = await (await fetch(`${base}/api/player/${u.username}`)).json();
  assert.strictEqual(pub.progress.stormWeek, 4);
  // Xoá tài khoản: xoá cả tiến độ + lượt Storm
  hub.store.deleteUser(u);
  assert.strictEqual(hub.store.progressGet(u.id), null);
  assert.strictEqual(hub.store.stormBestEver(u.id), 0);
  a.close(); b.close();
});
