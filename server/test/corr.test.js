'use strict';
// C1: Chơi theo lượt – mời / nhận / từ chối, đánh đúng lượt + đúng luật, nước gửi lại không thành hai nước, xin hoà / đi lại,
// đầu hàng, quét hết giờ (chạy lại không xử lý hai lần), điểm loại 'corr', Lịch sử đấu, thông báo lưu, sống qua khởi động lại.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ctx, account, until, Client } = require('./otour-client.js');
const { Store } = require('../src/store.js');
const R = require('../src/rating.js');

const uidOf = (c) => c.msgs.filter((m) => m.t === 'welcome').pop().me.uid;
const nameOf = (c) => ctx.app.hub.store.users.get(uidOf(c)).username;
const lastGame = (c, id) => c.msgs.filter((m) => m.t === 'corrGame' && (!id || m.game.id === id)).pop()?.game;
const errs = (c) => c.msgs.filter((m) => m.t === 'error').map((m) => m.code);

async function newGame(a, b, opts = {}) {
  const seen = new Set(b.msgs.filter((m) => m.t === 'corrGame').map((m) => m.game.id));
  a.send({ t: 'corrCreate', username: nameOf(b), days: 3, rated: true, side: 'x', ...opts });
  const fresh = () => b.msgs.filter((m) => m.t === 'corrGame' && !seen.has(m.game.id)).pop();
  await until(() => fresh());
  const g = fresh().game;
  assert.strictEqual(g.status, 'invite');
  b.send({ t: 'corrAnswer', id: g.id, accept: true });
  await until(() => lastGame(a, g.id)?.status === 'active');
  return g.id;
}
const move = async (c, id, x, y, other) => {
  const n = lastGame(c, id).moves.length;
  c.send({ t: 'corrMove', id, x, y, n });
  await until(() => lastGame(other, id).moves.length === n + 1 || lastGame(other, id).status === 'done');
};

test('Chơi theo lượt: mời, đánh đúng lượt / luật, gửi lại không thành hai nước, thắng → điểm corr + Lịch sử đấu + thông báo', async () => {
  const a = await account(), b = await account();
  ctx.app.hub.T.THROTTLE_SCALE = 0;
  const id = await newGame(a, b);
  assert.ok(R.POOLS.includes('corr'));
  const g0 = lastGame(a, id);
  assert.strictEqual(g0.x, uidOf(a));
  assert.ok(g0.deadline - Date.now() > 2.9 * 86400000 && g0.deadline - Date.now() <= 3 * 86400000, 'hạn nước đầu: 3 ngày');
  // Sai lượt / ô đã có quân / gửi lại cùng nước (n cũ)
  b.send({ t: 'corrMove', id, x: 0, y: 0, n: 0 });
  await until(() => errs(b).includes('not_your_turn'));
  await move(a, id, 0, 0, b);
  a.send({ t: 'corrMove', id, x: 0, y: 1, n: 0 }); // bấm lại trên bàn cũ: bỏ qua, không thành nước
  await new Promise((r) => setTimeout(r, 100));
  assert.strictEqual(lastGame(b, id).moves.length, 1);
  b.send({ t: 'corrMove', id, x: 0, y: 0, n: 1 });
  await until(() => errs(b).includes('cell_taken'));
  // Người offline nhận "tới lượt" khi vào lại: thông báo đã gửi ngay cho b (đang online)
  assert.ok(b.msgs.some((m) => m.t === 'notes' && m.items.some((x) => x.k === 'corr_turn' && x.id === id)), 'b nhận thông báo tới lượt');
  // X xếp 5 quân hàng 0, O đánh hàng 5 (luật Việt Nam: chặn 1 đầu vẫn thắng)
  for (let i = 1; i < 5; i++) { await move(b, id, i * 3, 5, a); await move(a, id, i, 0, b); }
  const g = lastGame(a, id);
  assert.strictEqual(g.status, 'done');
  assert.strictEqual(g.winner, 1);
  assert.strictEqual(g.reason, 'win');
  assert.ok(g.share && g.delta && g.delta.x > 0, 'tính điểm loại corr, có mã xem lại');
  const ua = ctx.app.hub.store.users.get(uidOf(a));
  assert.strictEqual(ua.pools.corr.n, 1);
  assert.strictEqual(ua.pools.rapid.n, 0, 'không trộn với ván trực tiếp');
  assert.strictEqual(ctx.app.hub.store.history(ua.id, 1)[0].kind, 'corr', 'ván vào Lịch sử đấu');
  assert.ok(a.msgs.some((m) => m.t === 'notes' && m.items.some((x) => x.k === 'corr_end' && x.res === 'win')));
  // Danh sách: ván đã xong vẫn có
  a.send({ t: 'corrList' });
  await until(() => a.msgs.some((m) => m.t === 'corrList' && m.games.some((x) => x.id === id && x.status === 'done')));
  // Ván xong: không đánh tiếp được
  b.send({ t: 'corrMove', id, x: 9, y: 9, n: g.moves.length });
  await until(() => errs(b).includes('game_over'));
  a.close(); b.close();
});

test('Chơi theo lượt: từ chối lời mời, xin hoà / đồng ý, xin đi lại / đồng ý, đầu hàng, khách không chơi được, người ngoài không xem được', async () => {
  const a = await account(), b = await account(), c = await account();
  a.send({ t: 'corrCreate', username: nameOf(b), days: 1, rated: false, side: 'o' });
  await until(() => lastGame(b));
  const inv = lastGame(b);
  assert.strictEqual(inv.o, uidOf(a));
  b.send({ t: 'corrAnswer', id: inv.id, accept: false });
  await until(() => lastGame(a, inv.id)?.reason === 'declined');
  // Sai số ngày / tự mời mình
  a.send({ t: 'corrCreate', username: nameOf(b), days: 4 });
  await until(() => errs(a).includes('bad_message'));
  a.send({ t: 'corrCreate', username: nameOf(a), days: 1 });
  await until(() => errs(a).includes('corr_self'));

  const id = await newGame(a, b, { days: 1 });
  await move(a, id, 0, 0, b);
  // Đi lại: chỉ người vừa đánh được xin; đối thủ đồng ý → nước bị bỏ
  b.send({ t: 'corrTakeback', id });
  await until(() => errs(b).includes('corr_takeback_turn'));
  a.send({ t: 'corrTakeback', id });
  await until(() => lastGame(b, id).takebackOffer === uidOf(a));
  b.send({ t: 'corrDecline', id, what: 'takeback' });
  await until(() => lastGame(a, id).takebackOffer === null);
  a.send({ t: 'corrTakeback', id });
  await until(() => lastGame(b, id).takebackOffer === uidOf(a));
  b.send({ t: 'corrTakeback', id });
  await until(() => lastGame(a, id).moves.length === 0);
  // Người ngoài không mở / không đánh được
  c.send({ t: 'corrOpen', id });
  await until(() => errs(c).includes('corr_not_found'));
  // Hoà: xin rồi đồng ý
  await move(a, id, 0, 0, b);
  b.send({ t: 'corrDraw', id });
  await until(() => lastGame(a, id).drawOffer === uidOf(b));
  a.send({ t: 'corrDraw', id });
  await until(() => lastGame(b, id).status === 'done');
  assert.strictEqual(lastGame(b, id).winner, 3);
  assert.strictEqual(lastGame(b, id).delta, null, 'ván không tính điểm');
  // Đầu hàng
  const id2 = await newGame(a, b);
  b.send({ t: 'corrResign', id: id2 });
  await until(() => lastGame(a, id2).status === 'done');
  assert.deepStrictEqual([lastGame(a, id2).winner, lastGame(a, id2).reason], [1, 'resign']);
  // Khách: cần tài khoản
  const guest = await Client.open();
  guest.send({ t: 'corrList' });
  await until(() => errs(guest).includes('need_account'));
  [a, b, c, guest].forEach((x) => x.close());
});

test('Chơi theo lượt: quét hết giờ – bên tới lượt thua; chạy lại không xử lý hai lần; < 2 nước thì huỷ; lời mời hết hạn', async () => {
  const hub = ctx.app.hub;
  const a = await account(), b = await account();
  const id = await newGame(a, b, { days: 1 });
  await move(a, id, 0, 0, b);
  await move(b, id, 1, 1, a);
  const ua = hub.store.users.get(uidOf(a)), ub = hub.store.users.get(uidOf(b));
  const before = { wa: ua.stats.wins, lb: ub.stats.losses, n: ua.pools.corr.n };
  const later = Date.now() + 1.01 * 86400000; // quá hạn 1 ngày: tới lượt X (a)
  assert.strictEqual(hub.corrSweep(later), 1);
  assert.strictEqual(hub.corrSweep(later), 0, 'chạy lại: không còn gì');
  const g = hub.store.corrGet(id);
  assert.deepStrictEqual([g.status, g.winner, g.reason], ['done', 2, 'timeout']);
  assert.strictEqual(ub.stats.wins >= 1 && ua.stats.losses >= 1, true);
  assert.strictEqual(ua.stats.wins, before.wa, 'không cộng hai lần');
  assert.strictEqual(ua.pools.corr.n, before.n, 'hết giờ khi chưa tới 10 nước: không tính điểm (như ván trực tiếp)');
  // corrFinish gọi lại trên bản cũ (giả lập người chơi đánh đúng lúc quét): không ghi, không tính điểm / thống kê lần nữa
  const stale = { ...g, status: 'active' };
  assert.strictEqual(hub.corrFinish(stale, 1, 'win'), false);
  assert.strictEqual(ua.pools.corr.n, before.n);
  // Chưa đủ 2 nước: huỷ, không ai thua
  const id3 = await newGame(a, b, { days: 1 });
  const lossesB = ub.stats.losses;
  hub.corrSweep(Date.now() + 2 * 86400000);
  assert.deepStrictEqual([hub.store.corrGet(id3).reason, ub.stats.losses], ['abort', lossesB]);
  // Lời mời không trả lời 7 ngày: hết hạn
  const seen = new Set(b.msgs.filter((m) => m.t === 'corrGame').map((m) => m.game.id));
  a.send({ t: 'corrCreate', username: nameOf(b), days: 2 });
  await until(() => b.msgs.some((m) => m.t === 'corrGame' && !seen.has(m.game.id)));
  const inv = b.msgs.filter((m) => m.t === 'corrGame' && !seen.has(m.game.id)).pop().game.id;
  hub.corrSweep(Date.now() + 8 * 86400000);
  assert.strictEqual(hub.store.corrGet(inv).reason, 'expired');
  a.close(); b.close();
});

test('Chơi theo lượt: ván sống qua khởi động lại (CSDL trên đĩa)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-corr-'));
  const file = path.join(dir, 'c.db');
  const s1 = new Store(file);
  const g = { id: 'abcdef012345', x: 'u1', o: 'u2', status: 'active', moves: [[0, 0]], updated: 1, deadline: 99, days: 1, rule: 'vn' };
  s1.corrPut(g);
  s1.flush(); s1.db.close();
  const s2 = new Store(file);
  assert.deepStrictEqual(s2.corrGet('abcdef012345').moves, [[0, 0]]);
  assert.deepStrictEqual(s2.corrDue(100), ['abcdef012345']);
  assert.strictEqual(s2.corrGet('xx'), null);
  assert.strictEqual(s2.corrCount('u1'), 1);
  s2.corrUserGone('u1');
  s2.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Chơi theo lượt: máy chủ ngừng lâu – hạn chót được dời đúng khoảng ngừng (một lần mỗi khoảng), không ai thua vì máy chủ', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-corr-down-'));
  const file = path.join(dir, 'c.db');
  const { Hub } = require('../src/hub/index.js');
  const H = 3600000, now = Date.now();
  let store = new Store(file);
  const put = (id, status, deadline) => store.corrPut({ id, x: 'u1', o: 'u2', status, moves: [[0, 0], [1, 1], [2, 2]], updated: 1, deadline, days: 1, rule: 'vn' });
  // Máy chủ tắt lúc now - 10 giờ; ván a còn 3 giờ lúc tắt (đã "quá hạn" 7 giờ theo đồng hồ), lời mời b, ván xong c,
  // ván d của người đã xoá tài khoản (deadline = 1: huỷ ở lượt quét sau, không dời)
  put('aaaaaaaaaaaa', 'active', now - 7 * H);
  put('bbbbbbbbbbbb', 'invite', now + 2 * H);
  put('cccccccccccc', 'done', null);
  put('dddddddddddd', 'active', 1);
  assert.strictEqual(store.corrBeat(now - 10 * H, 120000), 0, 'nhịp đầu tiên: chỉ ghi');
  store.flush(); store.db.close();
  // Khởi động lại: Hub bù 10 giờ trước lượt quét đầu tiên
  store = new Store(file);
  const hub = new Hub({ store });
  try {
    const a = store.corrGet('aaaaaaaaaaaa');
    assert.ok(Math.abs(a.deadline - (now + 3 * H)) < 60000, 'ván đang chơi: còn đúng 3 giờ như lúc máy chủ tắt');
    assert.ok(Math.abs(store.corrGet('bbbbbbbbbbbb').deadline - (now + 12 * H)) < 60000, 'lời mời cũng được dời');
    assert.strictEqual(store.corrGet('cccccccccccc').deadline, null, 'ván xong không đổi');
    assert.deepStrictEqual(store.corrDue(Date.now()), ['dddddddddddd'], 'cột deadline (chỉ mục quét) cũng được dời; ván d vẫn bị huỷ');
    hub.sweep();
    assert.strictEqual(store.corrGet('aaaaaaaaaaaa').status, 'active', 'lượt quét không xử thua vì thời gian máy chủ ngừng');
    // Chạy lại (lượt quét sau, nhịp lúc tắt) không bù thêm
    const d0 = store.corrGet('aaaaaaaaaaaa').deadline;
    assert.strictEqual(hub.corrBeat(), 0);
    const t0 = Date.now() + 60000;
    assert.strictEqual(store.corrBeat(t0, 120000), 0, 'nhịp đều mỗi phút: không bù');
    assert.strictEqual(store.corrGet('aaaaaaaaaaaa').deadline, d0, 'không dời hai lần cho cùng một khoảng');
    // Treo giữa chừng (máy ảo bị dừng 30 phút): lượt quét kế tiếp bù 30 phút
    const t1 = t0 + 30 * 60000;
    assert.strictEqual(store.corrBeat(t1, 120000), 30 * 60000);
    assert.strictEqual(store.corrGet('aaaaaaaaaaaa').deadline, d0 + 30 * 60000);
  } finally {
    hub.close(); store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Chơi theo lượt: luật chống cày điểm như ván trực tiếp (đi lại, tài khoản mới đầu hàng), nước gửi sau hạn chót, một lời mời / cặp, xoá tài khoản', async () => {
  const hub = ctx.app.hub;
  hub.T.THROTTLE_SCALE = 0;
  const a = await account(), b = await account();
  const ua = hub.store.users.get(uidOf(a)), ub = hub.store.users.get(uidOf(b));
  // Có đi lại (đã đồng ý) rồi thắng 5 quân: không tính điểm
  const id = await newGame(a, b);
  await move(a, id, 0, 0, b);
  a.send({ t: 'corrTakeback', id });
  await until(() => lastGame(b, id).takebackOffer === uidOf(a));
  b.send({ t: 'corrTakeback', id });
  await until(() => lastGame(a, id).moves.length === 0);
  await move(a, id, 0, 0, b);
  for (let i = 1; i < 5; i++) { await move(b, id, i * 3, 5, a); await move(a, id, i, 0, b); }
  assert.strictEqual(lastGame(a, id).status, 'done');
  assert.strictEqual(lastGame(a, id).delta, null, 'có đi lại: không tính điểm');
  assert.strictEqual(ua.pools.corr.n, 0);
  // Tài khoản mới (dưới 7 ngày) đầu hàng sau vài nước: không tính điểm
  const id2 = await newGame(a, b);
  await move(a, id2, 0, 0, b);
  await move(b, id2, 1, 1, a);
  b.send({ t: 'corrResign', id: id2 });
  await until(() => lastGame(a, id2).status === 'done');
  assert.strictEqual(lastGame(a, id2).delta, null, 'tài khoản mới đầu hàng: không tính điểm');
  // Nước gửi tới sau hạn chót (lượt quét chưa chạy): xử lý hết giờ ngay, không đánh được
  const id3 = await newGame(a, b, { rated: false });
  await move(a, id3, 0, 0, b);
  await move(b, id3, 1, 1, a);
  const g3 = hub.store.corrGet(id3);
  g3.deadline = Date.now() - 1000;
  hub.store.corrPut(g3);
  a.send({ t: 'corrMove', id: id3, x: 2, y: 2, n: 2 });
  await until(() => lastGame(b, id3).status === 'done');
  assert.deepStrictEqual([lastGame(b, id3).reason, lastGame(b, id3).winner, lastGame(b, id3).moves.length], ['timeout', 2, 2]);
  assert.ok(errs(a).includes('game_over'));
  // Mỗi cặp chỉ một lời mời đang chờ (không chiếm hết 30 chỗ của người khác)
  a.send({ t: 'corrCreate', username: nameOf(b), days: 2 });
  await until(() => b.msgs.some((m) => m.t === 'corrGame' && m.game.status === 'invite' && m.game.from === uidOf(a)));
  a.send({ t: 'corrCreate', username: nameOf(b), days: 3 });
  await until(() => errs(a).includes('corr_invite_pending'));
  assert.strictEqual(hub.store.corrCount(ub.id), 1);
  // Xoá tài khoản: ván đang chơi huỷ ở lượt quét kế tiếp (đối thủ không mất điểm), tên người đã xoá bỏ khỏi ván
  const id4 = await newGame(b, a);
  await move(b, id4, 0, 0, a);
  await move(a, id4, 1, 1, b);
  const lossesA = ua.stats.losses;
  hub.store.deleteUser(ub);
  assert.strictEqual(hub.corrSweep(Date.now()), 1, 'quét ngay sau khi xoá: huỷ ván đang chơi');
  const g4 = hub.store.corrGet(id4);
  assert.deepStrictEqual([g4.status, g4.reason, ua.stats.losses], ['done', 'abort', lossesA]);
  assert.strictEqual(g4.xName, '', 'tên người đã xoá bị bỏ');
  assert.strictEqual(hub.store.corrGet(id).oName, '', 'cả ở ván đã xong');
  a.close(); b.close();
});
