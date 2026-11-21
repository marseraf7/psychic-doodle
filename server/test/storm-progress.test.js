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

test('bảng Storm tuần: đúng thứ tự (điểm, rồi ai đạt trước) và nhanh với nhiều lượt (không O(n²))', () => {
  const { Store } = require('../src/store.js');
  const s = new Store(null);
  const ins = s.db.prepare('INSERT INTO storm_runs (uid, week, score, at) VALUES (?, ?, ?, ?)');
  s.db.exec('BEGIN');
  for (let i = 0; i < 20000; i++) ins.run('u' + (i % 2000), '2026-W47', (i * 7919) % 60, 1000 + i);
  // Ca biên: a và b cùng 70 điểm, b đạt trước; a có thêm lượt 70 muộn hơn; c điểm thấp hơn; tuần khác không tính
  for (const [uid, score, at] of [['a', 70, 500], ['a', 70, 900], ['b', 70, 400], ['c', 69, 1], ['z', 99, 1]]) ins.run(uid, uid === 'z' ? '2026-W46' : '2026-W47', score, at);
  s.db.exec('COMMIT');
  const t0 = Date.now();
  const board = s.stormBoard('2026-W47', 50);
  const mine = s.stormMine('a', '2026-W47');
  const ms = Date.now() - t0;
  assert.deepStrictEqual(board.slice(0, 3).map((r) => [r.uid, r.score, r.at]), [['b', 70, 400], ['a', 70, 500], ['c', 69, 1]]);
  assert.strictEqual(new Set(board.map((r) => r.uid)).size, board.length, 'mỗi người một dòng');
  assert.deepStrictEqual(mine, { score: 70, rank: 2 });
  assert.deepStrictEqual(s.stormMine('nobody', '2026-W47'), { score: 0, rank: null });
  assert.strictEqual(s.stormWeekScore('a', '2026-W47'), 70);
  assert.ok(ms < 1500, `20 000 lượt: bảng + hạng mất ${ms} ms`);
  s.close();
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

test('Storm: trần lượt / ngày tính cả lượt đã nộp trong storm_runs (khởi động lại máy chủ không đặt lại bộ đếm)', async () => {
  const hub = ctx.app.hub;
  const c = await account();
  const uc = [...hub.store.users.values()].at(-1);
  for (let i = 0; i < 100; i++) hub.store.stormAdd(uc.id, 1);
  hub.stormDaily().clear(); // như vừa khởi động lại: bộ đếm trong bộ nhớ rỗng
  const err = await c.req({ t: 'stormStart' }, 'error');
  assert.strictEqual(err.code, 'storm_limit');
  // Lượt của hôm qua (theo múi giờ thiết bị – chưa có thì giờ Việt Nam) không tính
  hub.store.db.prepare('UPDATE storm_runs SET at = at - 86400000 WHERE uid = ?').run(uc.id);
  await new Promise((r) => setTimeout(r, 5100)); // giới hạn 5 giây / lượt của kết nối
  assert.ok((await c.req({ t: 'stormStart' }, 'stormRun')).run);
  hub.store.deleteUser(uc);
  c.close();
});

test('Storm: "ngày" của trần lượt theo múi giờ thiết bị (tên IANA, đúng giờ mùa hè), không theo UTC', () => {
  const hub = ctx.app.hub;
  const limited = (u, t) => { try { hub.stormCap(u, t); return false; } catch (e) { assert.strictEqual(e.code, 'storm_limit'); return true; } };
  // New York: 100 lượt lúc 18:00 ngày 1/11 (23:00 UTC). 20:00 cùng ngày (đã sang ngày 2/11 giờ UTC): vẫn hết lượt
  const ny = { id: 'cap_ny', tzName: 'America/New_York', tz: -300 };
  for (let i = 0; i < 100; i++) hub.store.stormAdd(ny.id, 1, Date.UTC(2026, 10, 1, 23));
  assert.ok(limited(ny, Date.UTC(2026, 10, 2, 1)), '20:00 giờ New York: cùng ngày, hết lượt');
  assert.ok(limited(ny, Date.UTC(2026, 10, 2, 4, 59)), '23:59 EST (ngày 25 giờ – đổi giờ lúc 02:00)');
  assert.ok(!limited(ny, Date.UTC(2026, 10, 2, 5, 1)), '00:01 ngày 2/11 giờ New York: ngày mới');
  // Việt Nam: 100 lượt lúc 23:50 – 00:10 hôm sau chơi tiếp được
  const vn = { id: 'cap_vn', tzName: 'Asia/Ho_Chi_Minh' };
  for (let i = 0; i < 100; i++) hub.store.stormAdd(vn.id, 1, Date.UTC(2026, 10, 2, 16, 50));
  assert.ok(limited(vn, Date.UTC(2026, 10, 2, 16, 55)));
  assert.ok(!limited(vn, Date.UTC(2026, 10, 2, 17, 10)));
  // Bộ đếm trong bộ nhớ (lượt đã bắt đầu, chưa nộp) cũng theo ngày địa phương
  const mem = { id: 'cap_mem', tzName: 'Europe/Berlin' };
  for (let i = 0; i < 100; i++) hub.stormCap(mem, Date.UTC(2026, 2, 28, 23, 30)); // 00:30 CET 29/3 (ngày 23 giờ)
  assert.ok(limited(mem, Date.UTC(2026, 2, 29, 21, 59)), '23:59 CEST cùng ngày');
  assert.ok(!limited(mem, Date.UTC(2026, 2, 29, 22, 1)), '00:01 CEST 30/3');
  for (const u of [ny, vn, mem]) { hub.store.db.prepare('DELETE FROM storm_runs WHERE uid = ?').run(u.id); hub.stormDaily().delete(u.id); }
});

test('Storm: đổi múi giờ liên tục không chơi quá 2 × trần trong 24 giờ (trần cuộn – như ca biên 23:59 / 00:01)', () => {
  const hub = ctx.app.hub;
  const limited = (u, t) => { try { hub.stormCap(u, t); return false; } catch (e) { return true; } };
  const T = Date.UTC(2026, 10, 2, 12);
  const u = { id: 'cap_sw', tz: 0 };
  for (let i = 0; i < 100; i++) hub.store.stormAdd(u.id, 1, T - 10 * 60000); // 11:50 UTC
  assert.ok(limited(u, T));
  u.tz = -720; // UTC−12: lúc T là 00:00 ngày 2/11 – ngày mới bắt đầu sau 100 lượt kia
  for (let i = 0; i < 100; i++) assert.ok(!limited(u, T), 'ngày địa phương mới: được 100 lượt');
  assert.ok(limited(u, T), 'hết 100 lượt của ngày mới');
  u.tz = 660; // UTC+11: lúc T + 1 giờ là 00:00 ngày 3/11 – lại "ngày mới", nhưng 24 giờ qua đã 200 lượt
  assert.ok(limited(u, T + 3600000), 'trần cuộn 24 giờ: 2 × 100');
  assert.ok(!limited(u, T + 24 * 3600000), '24 giờ sau: chơi lại được');
  hub.store.db.prepare('DELETE FROM storm_runs WHERE uid = ?').run(u.id);
  hub.stormDaily().delete(u.id);
});

test('hồ sơ công khai: chuỗi ngày / huy hiệu tự báo bị giới hạn (ngày tương lai, chuỗi vô lý, huy hiệu tài khoản chưa đạt)', async () => {
  const hub = ctx.app.hub;
  const a = await account();
  const ua = [...hub.store.users.values()].at(-1);
  const today = new Date().toISOString().slice(0, 10);
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const future = Array.from({ length: 30 }, (_, i) => day(i + 3)); // 30 ngày ở tương lai (đồng hồ máy sai / tự sửa)
  const earned = Object.fromEntries(P.BADGE_IDS.map((id) => [id, today]));
  earned.first_game = day(400); // ngày đạt ở tương lai
  const r = await a.req({ t: 'progressSync', data: { habits: { days: ['2020-01-01', today, ...future], best: 99999, games: 3, earned } } }, 'progress');
  assert.deepStrictEqual(r.data.habits.days, [today], 'ngày tương lai / trước khi có tính năng bị bỏ');
  assert.ok(r.data.habits.best <= Math.round((Date.now() - Date.parse(P.SINCE)) / 86400000) + 2, 'chuỗi dài nhất không vượt số ngày có tính năng');
  assert.strictEqual(r.data.habits.earned.first_game, undefined);
  const prof = (await a.req({ t: 'profile', username: ua.username }, 'profile')).profile.progress;
  for (const id of ['online_10', 'online_100', 'win_streak_5', 'rating_1800', 'tour_win', 'daily_30']) {
    assert.ok(!prof.badges.includes(id), 'huy hiệu tài khoản chưa đạt không hiện: ' + id);
  }
  assert.ok(prof.badges.includes('beat_boat'), 'huy hiệu chỉ có trên máy: giữ như máy báo');
  assert.ok(prof.bestStreak < 1000);
  // Đạt thật (thống kê tài khoản): hiện
  ua.stats.wins = 12;
  ua.tours.won = 1;
  await new Promise((res) => setTimeout(res, 350)); // giới hạn 300 ms / lần xem hồ sơ
  const prof2 = (await a.req({ t: 'profile', username: ua.username }, 'profile')).profile.progress;
  assert.ok(prof2.badges.includes('online_10') && prof2.badges.includes('tour_win'));
  a.close();
});
