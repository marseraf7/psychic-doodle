/*
 * Quyền trong câu lạc bộ – các lỗi của đợt rà soát code 16/11/2026:
 *   mục 1   – duyệt yêu cầu xin vào còn sót không đưa người đã bị chặn trở lại, không hạ cấp quản lý;
 *   mục 13a – người đã bị chặn không xoá được tin chat / bài diễn đàn của mình (bài đầu chủ đề mất là mất cả chủ đề);
 *   mục 13c – bị cấm nói, rời CLB rồi vào lại vẫn bị cấm nói;
 *   mục 14  – giải giao hữu CLB không trùng link riêng (slug) với giải khác.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { ctx, Client, account, until } = require('./otour-client.js');

const uidOf = (c) => { const m = c.msgs.filter((x) => x.t === 'welcome').pop().me; return m.uid; };
let boss = null, n = 0;
async function admin() {
  if (boss) return boss;
  for (const k of [...ctx.app.hub.fails.keys()]) if (k.startsWith('reg:')) ctx.app.hub.fails.delete(k);
  boss = await Client.open();
  await boss.req({ t: 'register', username: 'boss', password: 'caro-pass1' }, 'welcome', undefined, 15000);
  return boss;
}
/** CLB đã duyệt của một chủ mới: { owner, id, c (bản ghi trên máy chủ) }. */
async function club(join) {
  const B = await admin();
  const owner = await account();
  const { id } = await owner.req({ t: 'clubCreate', name: 'CLB An Toàn ' + (++n), join }, 'clubCreated');
  await B.req({ t: 'adminReview', kind: 'club', id, approve: true }, 'adminQueue');
  return { owner, id, c: ctx.app.hub.clubs.get(id) };
}

test('mục 1: yêu cầu xin vào còn sót không đưa người bị chặn trở lại và không hạ cấp quản lý', async () => {
  const { owner, id, c } = await club('request');
  const x = await account(), y = await account(), mod = await account();
  const X = uidOf(x), Y = uidOf(y), M = uidOf(mod);
  // mod: quản lý chỉ có quyền duyệt yêu cầu (thấp hơn quyền mời ra)
  mod.send({ t: 'clubJoin', id }); await until(() => c.requests.includes(M));
  owner.send({ t: 'clubRequest', id, uid: M, accept: true }); await until(() => c.members[M]);
  owner.send({ t: 'clubRole', id, uid: M, role: 'officer' }); await until(() => c.members[M] === 'officer');
  owner.send({ t: 'clubPerms', id, uid: M, perms: ['requests'] }); await until(() => (c.perms[M] || []).join() === 'requests');
  // X, Y gửi yêu cầu → CLB mở cửa → cả hai vào thẳng
  x.send({ t: 'clubJoin', id }); y.send({ t: 'clubJoin', id });
  await until(() => c.requests.includes(X) && c.requests.includes(Y));
  owner.send({ t: 'clubUpdate', id, join: 'open' }); await until(() => c.join === 'open');
  x.send({ t: 'clubJoin', id }); y.send({ t: 'clubJoin', id });
  await until(() => c.members[X] && c.members[Y]);
  assert.ok(!c.requests.includes(X) && !c.requests.includes(Y), 'vào rồi thì yêu cầu cũ được dọn');
  // Dựng lại đúng trạng thái dữ liệu cũ (yêu cầu còn sót): X bị mời ra kèm chặn, Y lên quản lý
  c.requests.push(X, Y);
  owner.send({ t: 'clubKick', id, uid: X, ban: true }); await until(() => !c.members[X] && c.banned[X]);
  owner.send({ t: 'clubRole', id, uid: Y, role: 'officer' }); await until(() => c.members[Y] === 'officer');
  owner.send({ t: 'clubPerms', id, uid: Y, perms: ['mod'] }); await until(() => (c.perms[Y] || []).join() === 'mod');
  mod.send({ t: 'clubRequest', id, uid: X, accept: true }); await until(() => !c.requests.includes(X));
  mod.send({ t: 'clubRequest', id, uid: Y, accept: true }); await until(() => !c.requests.includes(Y));
  assert.ok(!c.members[X] && c.banned[X], 'người bị chặn không được nhận lại qua yêu cầu cũ');
  assert.deepStrictEqual([c.members[Y], c.perms[Y]], ['officer', ['mod']], 'quản lý không bị hạ cấp');
  [owner, x, y, mod].forEach((k) => k.close());
});

test('mục 13a + 13c: người bị chặn không xoá được bài của mình; cấm nói không thoát được bằng rời rồi vào lại', async () => {
  const { owner, id, c } = await club('open');
  const a = await account(), b = await account();
  const A = uidOf(a), Bq = uidOf(b);
  a.send({ t: 'clubJoin', id }); b.send({ t: 'clubJoin', id }); await until(() => c.members[A] && c.members[Bq]);
  // a mở chủ đề + chat, rồi bị mời ra kèm chặn
  a.send({ t: 'clubTopicNew', id, title: 'Chủ đề của a', text: 'Bài đầu' });
  await until(() => ctx.app.store.clubTopics(id, 50, 0).length === 1);
  const topic = ctx.app.store.clubTopics(id, 50, 0)[0];
  const post = ctx.app.store.clubPosts(topic.id, 50, 0)[0];
  a.send({ t: 'clubChat', id, text: 'xin chào' });
  await until(() => ctx.app.store.clubChatList(id).length === 1);
  const chat = ctx.app.store.clubChatList(id)[0];
  owner.send({ t: 'clubKick', id, uid: A, ban: true }); await until(() => c.banned[A]);
  assert.strictEqual((await a.req({ t: 'clubPostDel', id, post: post.id }, 'error')).code, 'club_banned');
  assert.strictEqual((await a.req({ t: 'clubChatDel', id, msg: chat.id }, 'error')).code, 'club_banned');
  assert.strictEqual(ctx.app.store.clubTopics(id, 50, 0).length, 1, 'chủ đề còn nguyên');
  assert.strictEqual(ctx.app.store.clubChatList(id).length, 1, 'tin chat còn nguyên');
  // b bị cấm nói → rời → vào lại (CLB mở): vẫn bị cấm nói; chủ CLB gỡ được cả khi b đã rời
  owner.send({ t: 'clubTalkMute', id, uid: Bq, mute: true }); await until(() => c.talkMuted.includes(Bq));
  b.send({ t: 'clubLeave', id }); await until(() => !c.members[Bq]);
  assert.ok(c.talkMuted.includes(Bq), 'rời CLB: lệnh cấm nói giữ lại');
  b.send({ t: 'clubJoin', id }); await until(() => c.members[Bq]);
  b.send({ t: 'clubChat', id, text: 'né cấm nói' });
  await b.wait('error');
  assert.strictEqual(ctx.app.store.clubChatList(id).length, 1, 'vào lại vẫn không chat được');
  b.send({ t: 'clubLeave', id }); await until(() => !c.members[Bq]);
  owner.send({ t: 'clubTalkMute', id, uid: Bq, mute: false }); await until(() => !c.talkMuted.includes(Bq));
  [owner, a, b].forEach((k) => k.close());
});

test('mục 14: giải giao hữu CLB không trùng link riêng với giải đã có', async () => {
  const k1 = await club('open'), k2 = await club('open');
  k1.owner.send({ t: 'clubMatchCreate', id: k1.id, opp: k2.id, boards: 2, bestOf: 1, startsAt: Date.now() + 3600000, slug: 'giao-huu-chung' });
  await until(() => [...ctx.app.hub.tours.values()].some((t) => t.slug === 'giao-huu-chung'));
  assert.strictEqual((await k1.owner.req({ t: 'clubMatchCreate', id: k1.id, opp: k2.id, boards: 2, bestOf: 1, startsAt: Date.now() + 3600000, slug: 'giao-huu-chung' }, 'error')).code, 'tour_slug_taken');
  assert.strictEqual([...ctx.app.hub.tours.values()].filter((t) => t.slug === 'giao-huu-chung').length, 1);
  [k1.owner, k2.owner].forEach((k) => k.close());
});
