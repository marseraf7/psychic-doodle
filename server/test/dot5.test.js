/*
 * Đợt 5 sửa lỗi rà soát code 16/11/2026 (các mục Claude chưa làm):
 *   mục 67  – on_tourScore không kiểm m.hold (bài thử ở tour.test.js);
 *   mục 74  – nhóm nhỏ CLB/giải, 10 ý con (trừ 74e hoàn quota AI: chờ Minh quyết ý đồ, không sửa);
 *   mục 75  – store.close() (bài thử ở flush.test.js);
 *   mục 76  – moderation mask() (bài thử ở batchd.test.js);
 *   mục 24  – club-talk topicDirty chỉ phát cho người có quyền đọc diễn đàn (bổ sung bài thử).
 * File này chứa các bài thử qua máy chủ thật cho mục 74 và mục 24.
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
  const { id } = await owner.req({ t: 'clubCreate', name: 'CLB Đợt 5 ' + (++n), join }, 'clubCreated');
  await B.req({ t: 'adminReview', kind: 'club', id, approve: true }, 'adminQueue');
  return { owner, id, c: ctx.app.hub.clubs.get(id) };
}
/** Dựng trạng thái "uid đang là thành viên của k CLB khác" bằng bản ghi tối thiểu (đủ trường cho các vòng
 *  duyệt clubs.values() khác không vấp: name/owner/status/members). */
function fakeMemberships(uid, k, tag) {
  const hub = ctx.app.hub;
  for (let i = 0; i < k; i++) hub.clubs.set(tag + i, { id: tag + i, name: 'CLB giả ' + tag + i, owner: 'dot5-none', status: 'approved', members: { [uid]: 'member' } });
  return () => { for (let i = 0; i < k; i++) hub.clubs.delete(tag + i); };
}

test('mục 74b: một người không gửi yêu cầu xin vào quá 20 CLB cùng lúc (trần toàn cục)', async () => {
  const x = await account();
  const X = uidOf(x);
  const owners = [];
  let sent = 0;
  // Gửi yêu cầu vào 21 CLB khác nhau: 20 cái đầu lọt, cái thứ 21 phải bị chặn
  for (let i = 0; i < 21; i++) {
    const k = await club('request');
    owners.push(k.owner);
    if (i < 20) {
      x.send({ t: 'clubJoin', id: k.id });
      await until(() => k.c.requests.includes(X));
      sent++;
    } else {
      assert.strictEqual((await x.req({ t: 'clubJoin', id: k.id }, 'error')).code, 'too_fast',
        'yêu cầu thứ 21 cùng lúc phải bị chặn bởi trần toàn cục');
      assert.ok(!k.c.requests.includes(X), 'yêu cầu bị chặn không được ghi vào CLB');
    }
  }
  assert.strictEqual(sent, 20);
  const total = [...ctx.app.hub.clubs.values()].filter((c) => (c.requests || []).includes(X)).length;
  assert.strictEqual(total, 20, 'tổng yêu cầu đang chờ trên mọi CLB đúng bằng trần');
  [...owners, x].forEach((k) => k.close());
});

test('mục 74a: duyệt yêu cầu và duyệt lại đều không lách trần 20 CLB của người được duyệt', async () => {
  const k1 = await club('request');
  const x = await account();
  const X = uidOf(x);
  // X gửi yêu cầu vào CLB 1 khi chưa chạm trần
  x.send({ t: 'clubJoin', id: k1.id });
  await until(() => k1.c.requests.includes(X));
  // CLB 2: X cũng gửi yêu cầu và bị từ chối trước khi chạm trần (để kiểm đường duyệt lại về sau)
  const k2 = await club('request');
  x.send({ t: 'clubJoin', id: k2.id });
  await until(() => k2.c.requests.includes(X));
  k2.owner.send({ t: 'clubRequest', id: k2.id, uid: X, accept: false });
  await until(() => k2.c.declined.some((d) => d.uid === X));
  // X chạm trần 20 CLB (dựng 20 bản ghi thành viên ở CLB khác)
  const cleanup = fakeMemberships(X, 20, 'dot5a');
  try {
    assert.strictEqual((await k1.owner.req({ t: 'clubRequest', id: k1.id, uid: X, accept: true }, 'error')).code, 'club_join_limit',
      'duyệt yêu cầu cho người đã ở 20 CLB phải bị chặn');
    assert.ok(k1.c.requests.includes(X), 'yêu cầu còn nguyên để duyệt lại sau');
    assert.ok(!k1.c.members[X], 'X chưa thành thành viên CLB 1');
    assert.strictEqual((await k2.owner.req({ t: 'clubReconsider', id: k2.id, uid: X, accept: true }, 'error')).code, 'club_join_limit',
      'duyệt lại cho người đã ở 20 CLB phải bị chặn');
    assert.ok(k2.c.declined.some((d) => d.uid === X), 'mục đã từ chối còn nguyên');
    assert.ok(!k2.c.members[X]);
    // X rời bớt một CLB -> duyệt yêu cầu ở CLB 1 được như thường
    ctx.app.hub.clubs.delete('dot5a0');
    k1.owner.send({ t: 'clubRequest', id: k1.id, uid: X, accept: true });
    await until(() => k1.c.members[X]);
    [k2.owner].forEach((k) => k.close());
  } finally {
    cleanup();
    [k1.owner, x].forEach((k) => k.close());
  }
});
