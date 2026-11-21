// Hạng đấu tuần (league-core.js, hub/league.js, store-league.js): tuần ISO giờ Việt Nam, điểm + chống cày điểm,
// chốt tuần (một lần, qua khởi động lại), thông báo. Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const LC = require('../src/league-core.js');
const { Store } = require('../src/store.js');
const { boot, account } = require('./phaseb-client.js');

const at = (s) => Date.parse(s);

test('tuần ISO theo giờ Việt Nam (UTC+7)', () => {
  assert.strictEqual(LC.weekKey(at('2026-11-20T10:00:00Z')), '2026-W47');
  // Chủ nhật 23:30 giờ VN = 16:30 UTC vẫn thuộc tuần cũ; 17:00 UTC (00:00 thứ Hai giờ VN) sang tuần mới
  assert.strictEqual(LC.weekKey(at('2026-11-22T16:30:00Z')), '2026-W47');
  assert.strictEqual(LC.weekKey(at('2026-11-22T17:00:00Z')), '2026-W48');
  // Ranh giới năm ISO: 31/12/2026 (thứ Năm) thuộc 2026-W53; 1/1/2024 là thứ Hai → 2024-W01; 30/12/2024 → 2025-W01
  assert.strictEqual(LC.weekKey(at('2026-12-31T05:00:00Z')), '2026-W53');
  assert.strictEqual(LC.weekKey(at('2024-01-01T05:00:00Z')), '2024-W01');
  assert.strictEqual(LC.weekKey(at('2024-12-30T05:00:00Z')), '2025-W01');
  assert.strictEqual(LC.weekStart('2026-W48'), at('2026-11-22T17:00:00Z'));
  assert.strictEqual(LC.weekEnd('2026-W47'), at('2026-11-22T17:00:00Z'));
  assert.ok(Number.isNaN(LC.weekStart('xx')));
  // Một hàm tuần chung với bảng Storm tuần (A5) – hai bảng luôn sang tuần cùng lúc
  const P = require('../../caro/progress-merge.js');
  assert.strictEqual(LC.weekKey, P.weekKey);
  assert.strictEqual(LC.weekStart, P.weekStart);
});

test('điểm: thắng / hoà, gặp lại cùng đối thủ giảm dần, ván ngắn / bỏ ván, chuỗi đáng ngờ', () => {
  const g = (o) => LC.gamePoints({ moves: 30, reason: 'win', ...o });
  assert.deepStrictEqual(g({ result: 'win' }), { pts: 4, why: null });
  assert.strictEqual(g({ result: 'draw' }).pts, 2);
  assert.strictEqual(g({ result: 'loss' }).pts, 0);
  assert.strictEqual(g({ result: 'win', prior: ['loss'] }).pts, 4);
  assert.deepStrictEqual(g({ result: 'win', prior: ['loss', 'draw'] }), { pts: 2, why: 'same_opp' });
  assert.strictEqual(g({ result: 'draw', prior: ['loss', 'draw', 'win'] }).pts, 1);
  assert.strictEqual(g({ result: 'win', prior: ['loss', 'draw', 'win', 'draw'] }).pts, 0, 'từ ván 5 không có điểm');
  assert.deepStrictEqual(g({ result: 'win', moves: 9 }), { pts: 0, why: 'short' });
  assert.strictEqual(g({ result: 'win', reason: 'leave' }).why, 'abandoned');
  const s = g({ result: 'win', prior: ['win', 'win'] });
  assert.deepStrictEqual(s, { pts: 0, why: 'suspect', flag: true }, '3 ván liền cùng người thắng');
  assert.strictEqual(g({ result: 'loss', prior: ['loss', 'loss'] }).flag, true, 'cả người thua (đứng chung cặp) cũng 0');
  assert.strictEqual(g({ result: 'win', prior: ['win', 'draw'] }).why, 'same_opp', 'có hoà xen giữa: không đáng ngờ');
  assert.strictEqual(g({ result: 'win', flagged: true }).why, 'suspect');
});

test('chốt tuần: lên / xuống bậc theo nhóm, 0 điểm không lên, bậc cao nhất / thấp nhất', () => {
  const mk = (n, div, grp = 0) => Array.from({ length: n }, (_, i) => ({ uid: `u${div}_${grp}_${String(i).padStart(2, '0')}`, div, grp, pts: (n - i) * 4, games: 3, last: i }));
  const res = LC.rollover([...mk(30, 1), ...mk(3, 0, 0), ...mk(9, 5)]);
  const g1 = res.filter((r) => r.div === 1);
  assert.strictEqual(g1.filter((r) => r.outcome === 'up').length, 5);
  assert.strictEqual(g1.filter((r) => r.outcome === 'down').length, 5);
  assert.deepStrictEqual(g1.find((r) => r.rank === 1), { uid: 'u1_0_00', div: 1, grp: 0, rank: 1, size: 30, pts: 120, outcome: 'up', next: 2 });
  assert.strictEqual(g1.find((r) => r.rank === 30).next, 0);
  const g0 = res.filter((r) => r.div === 0);
  assert.strictEqual(g0.filter((r) => r.outcome === 'up').length, 1, 'nhóm 3 người: 1 người lên');
  assert.ok(g0.every((r) => r.outcome !== 'down'), 'bậc thấp nhất không xuống');
  const g5 = res.filter((r) => r.div === 5);
  assert.ok(g5.every((r) => r.outcome !== 'up'), 'bậc cao nhất không lên');
  assert.strictEqual(g5.filter((r) => r.outcome === 'down').length, 3);
  const zero = LC.rollover([{ uid: 'a', div: 0, grp: 0, pts: 0, games: 2 }, { uid: 'b', div: 0, grp: 0, pts: 0, games: 1 }, { uid: 'c', div: 0, grp: 0, pts: 0, games: 1 }]);
  assert.ok(zero.every((r) => r.outcome === 'stay'), '0 điểm không lên bậc');
  // Cùng điểm: ít ván hơn đứng trên, rồi đạt điểm sớm hơn
  const tie = LC.rollover([{ uid: 'x', div: 0, grp: 0, pts: 8, games: 4, last: 1 }, { uid: 'y', div: 0, grp: 0, pts: 8, games: 2, last: 9 }, { uid: 'z', div: 0, grp: 0, pts: 8, games: 2, last: 5 }]);
  assert.deepStrictEqual(tie.map((r) => r.uid), ['z', 'y', 'x']);
});

test('máy chủ: ván tính điểm cộng điểm, chống cày điểm theo cặp, nhóm tối đa 30 người', async () => {
  const { app, url } = await boot();
  try {
    const hub = app.hub;
    const a = await account(app, url, 'lg_a');
    const b = await account(app, url, 'lg_b');
    const ua = hub.store.users.get(a.uid), ub = hub.store.users.get(b.uid);
    const now = at('2026-11-18T05:00:00Z');
    const room = (winner, reason = 'win') => ({ winner, reason });
    const moves = Array.from({ length: 20 }, (_, i) => [i, 0]);
    hub.leagueOnRated(room(1), ua, ub, moves, now);
    hub.leagueOnRated(room(3), ua, ub, moves, now + 1);
    const r3 = hub.leagueOnRated(room(1), ua, ub, moves, now + 2);
    assert.deepStrictEqual(r3[a.uid], { pts: 2, why: 'same_opp' });
    const w = '2026-W47';
    assert.strictEqual(hub.store.lgMember(w, a.uid).pts, 4 + 2 + 2);
    assert.strictEqual(hub.store.lgMember(w, b.uid).pts, 2);
    assert.strictEqual(hub.store.lgMember(w, a.uid).games, 3);
    // Chuỗi đáng ngờ: a thắng thêm 2 ván liền (3 ván liền a thắng) → cặp bị đánh dấu, ván sau cũng 0
    hub.leagueOnRated(room(1), ua, ub, moves, now + 3);
    const s = hub.leagueOnRated(room(1), ua, ub, moves, now + 4);
    assert.strictEqual(s[a.uid].why, 'suspect');
    assert.strictEqual(hub.store.lgPair(w, a.uid, b.uid).flag, 1);
    assert.strictEqual(hub.leagueOnRated(room(2), ua, ub, moves, now + 5)[b.uid].why, 'suspect', 'đánh dấu cả tuần');
    // Ván ngắn
    const c = await account(app, url, 'lg_c');
    const uc = hub.store.users.get(c.uid);
    assert.strictEqual(hub.leagueOnRated(room(1), uc, ua, moves.slice(0, 5), now)[c.uid].why, 'short');
    // Nhóm đầy: người thứ 31 sang nhóm mới
    for (let i = 0; i < 30; i++) hub.store.lgJoin('2026-W30', 'fake' + i, 30);
    assert.strictEqual(hub.store.lgJoin('2026-W30', 'fake30', 30).grp, 1);
    assert.strictEqual(hub.store.lgJoin('2026-W30', 'fake5', 30).grp, 0, 'đã có thì giữ nguyên');
    // Trang hạng đấu
    const m = await a.req({ t: 'league' }, 'league');
    assert.strictEqual(m.t, 'league');
    assert.ok(Array.isArray(m.divs) && m.divs.length === 6);
    a.close(); b.close(); c.close();
  } finally { await app.stop(); }
});

test('chốt tuần một lần, qua khởi động lại; thông báo cho người chơi; huy hiệu hồ sơ', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-lg-'));
  const file = path.join(dir, 'caro.db');
  const { Hub } = require('../src/hub/index.js');
  let store = new Store(file);
  let hub = new Hub({ store });
  const notes = [];
  hub.pushNote = (uid, item) => notes.push([uid, item]);
  const W = at('2026-11-18T05:00:00Z');
  assert.strictEqual(hub.leagueTick(W), null, 'lần đầu: chỉ ghi tuần đang mở');
  const ids = Array.from({ length: 9 }, (_, i) => 'p' + i);
  for (const [i, id] of ids.entries()) { store.lgJoin('2026-W47', id, 30); store.lgAddPoints('2026-W47', id, (9 - i) * 4, W + i); }
  assert.strictEqual(hub.leagueTick(W + 3600e3), null, 'cùng tuần: không chốt');
  hub.close(); store.close();
  // Khởi động lại sang tuần mới: chốt tuần W47
  store = new Store(file);
  hub = new Hub({ store });
  hub.pushNote = (uid, item) => notes.push([uid, item]);
  const res = hub.leagueTick(at('2026-11-23T05:00:00Z'));
  assert.strictEqual(res.length, 9);
  assert.strictEqual(store.lgState('week'), '2026-W48');
  assert.ok(store.lgState('done:2026-W47'));
  assert.strictEqual(store.lgDiv('p0').div, 1, 'đầu nhóm lên Bạc');
  assert.strictEqual(store.lgDiv('p8').div, 0, 'Đồng không xuống nữa');
  assert.strictEqual(notes.length, 9);
  assert.deepStrictEqual(notes[0][1], { k: 'league', week: '2026-W47', outcome: 'up', div: 1, rank: 1 });
  // Chạy lại (vd. hai tiến trình / gọi lại): không chốt lần hai
  assert.deepStrictEqual(hub.leagueClose('2026-W47'), []);
  store.lgSetState('week', '2026-W47');
  assert.deepStrictEqual(hub.leagueTick(at('2026-11-23T06:00:00Z')), []);
  assert.strictEqual(store.lgDiv('p0').div, 1, 'không lên bậc hai lần');
  assert.strictEqual(store.lgHist('p0').length, 1);
  assert.deepStrictEqual(hub.leagueBadge('p0'), { div: 1, best: 1 });
  assert.strictEqual(hub.leagueBadge('nobody'), null);
  // Xoá tài khoản: dữ liệu hạng đấu đi theo
  store.lgUserGone('p0');
  assert.strictEqual(store.lgHist('p0').length, 0);
  hub.close(); store.close();
});
