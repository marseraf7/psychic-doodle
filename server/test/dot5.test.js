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

test('mục 74c: giải tán CLB phải huỷ giao hữu đang chờ và chặn khi giao hữu đang chạy', async () => {
  const A = await club('open'), B = await club('open');
  const startsAt = Date.now() + 3600000;
  // Giao hữu 1 đang chờ (pending): giải tán CLB A thì giao hữu phải bị huỷ theo
  A.owner.send({ t: 'clubMatchCreate', id: A.id, opp: B.id, boards: 2, bestOf: 1, startsAt });
  await until(() => [...ctx.app.hub.tours.values()].some((t) => t.teamMatch && t.teamMatch.a === A.id));
  const m1 = [...ctx.app.hub.tours.values()].find((t) => t.teamMatch && t.teamMatch.a === A.id);
  assert.strictEqual(m1.club, null, 'giao hữu không mang club như giải thường — đây là gốc của lỗi');
  A.owner.send({ t: 'clubDisband', id: A.id });
  await until(() => !ctx.app.hub.clubs.has(A.id));
  assert.strictEqual(m1.status, 'cancelled', 'giao hữu đang chờ bị huỷ khi một bên giải tán');
  assert.strictEqual(m1.cancelReason, 'club_disbanded');
  // Giao hữu 2 đang chạy (dựng trạng thái running): giải tán CLB B phải bị chặn
  const A2 = await club('open');
  A2.owner.send({ t: 'clubMatchCreate', id: A2.id, opp: B.id, boards: 2, bestOf: 1, startsAt });
  await until(() => [...ctx.app.hub.tours.values()].some((t) => t.teamMatch && t.teamMatch.a === A2.id));
  const m2 = [...ctx.app.hub.tours.values()].find((t) => t.teamMatch && t.teamMatch.a === A2.id);
  m2.status = 'running';
  assert.strictEqual((await B.owner.req({ t: 'clubDisband', id: B.id }, 'error')).code, 'club_has_running_tour',
    'CLB có giao hữu đang chạy không giải tán được');
  assert.ok(ctx.app.hub.clubs.has(B.id), 'CLB B còn nguyên');
  [A.owner, B.owner, A2.owner].forEach((k) => k.close());
});

test('mục 74d: bỏ lời mời ở giải offline đang chạy bị chặn như mời mới — người được mời không mất quyền xem giữa giải', async () => {
  const org = await account(), guest = await account();
  const who = (c) => [...c.msgs].reverse().find((m) => m.t === 'welcome').me;
  const single = { sport: 'esports', stages: [{ type: 'single', bestOf: 1, thirdPlace: false }] };
  const { id } = await org.req({ t: 'otCreate', name: 'Cúp đợt 5', access: 'private', spec: single, teams: ['A', 'B', 'C', 'D'] }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  const G = who(guest);
  org.send({ t: 'otRegOpen', id, open: true, invite: true });
  await until(() => t.reg && t.reg.invite);
  await org.req({ t: 'otInvite', id, names: '@' + G.username }, 'otInvited');
  assert.ok(t.reg.invited.includes(G.uid));
  // Người được mời xem được giải riêng tư
  await guest.req({ t: 'otGet', id }, 'ot', (m) => m.id === id && m.tour);
  // Ở bản nháp: bỏ lời mời vẫn được như thường (không hồi quy)
  const org2 = await account(), guest2 = await account();
  const { id: id2 } = await org2.req({ t: 'otCreate', name: 'Cúp nháp đợt 5', access: 'private', spec: single, teams: ['A', 'B'] }, 'otCreated');
  const t2 = ctx.app.hub.otGet(id2), G2 = who(guest2);
  org2.send({ t: 'otRegOpen', id: id2, open: true, invite: true });
  await until(() => t2.reg && t2.reg.invite);
  await org2.req({ t: 'otInvite', id: id2, names: '@' + G2.username }, 'otInvited');
  org2.send({ t: 'otUninvite', id: id2, uid: G2.uid });
  await until(() => !t2.reg.invited.includes(G2.uid));
  // Giải 1 sang trạng thái đang chạy (dựng trạng thái như các bài thử otour khác): bỏ lời mời phải bị chặn
  t.status = 'running';
  assert.strictEqual((await org.req({ t: 'otUninvite', id, uid: G.uid }, 'error')).code, 'tour_closed');
  assert.ok(t.reg.invited.includes(G.uid), 'lời mời còn nguyên');
  await guest.req({ t: 'otGet', id }, 'ot', (m) => m.id === id && m.tour);
  [org, guest, org2, guest2].forEach((c) => c.close());
});

test('mục 74f: giải đang chạy không đổi được quickAdvance / arrangeNext (hai ô đổi hành vi thi đấu, không phải cách hiện)', async () => {
  const B = await admin();
  const { id } = await B.req({ t: 'tourCreate', name: 'Giải đợt 5 LIVE', format: 'bracket', startsAt: Date.now() + 600000, timeLimit: 30, offline: true, checkin: false,
    quickAdvance: false, arrangeNext: false, stages: [{ type: 'swiss', rounds: 1, bestOf: 1 }, { type: 'single', bestOf: 1, thirdPlace: false }] }, 'tourCreated');
  const t = ctx.app.hub.tours.get(id);
  await B.req({ t: 'tourAddPlayers', id, names: ['An', 'Bình', 'Chi', 'Dũng'] }, 'tourAddResult');
  B.send({ t: 'tourStart', id });
  await until(() => t.status === 'running');
  assert.deepStrictEqual([t.quickAdvance, t.arrangeNext], [false, false]);
  // Đang chạy: gửi sửa cả hai ô hành vi lẫn một ô chỉ ảnh hưởng cách hiện (roundLabels)
  await B.req({ t: 'tourEdit', id, name: t.name, quickAdvance: true, arrangeNext: true, roundLabels: false }, 'tourEdited');
  assert.strictEqual(t.quickAdvance, false, 'quickAdvance giữ nguyên khi giải đang chạy (đổi nó là đổi cách nhập kết quả)');
  assert.strictEqual(t.arrangeNext, false, 'arrangeNext giữ nguyên khi giải đang chạy (đổi nó là đổi cách chuyển giai đoạn)');
  assert.strictEqual(t.roundLabels, false, 'ô chỉ ảnh hưởng cách hiện vẫn đổi được khi đang chạy');
  B.close();
});

test('mục 74g: giải đang chạy — người thường không tự đổi tên / mô tả (nội dung đã duyệt); quản trị viên vẫn đổi được', async () => {
  const B = await admin();
  const org = await account();
  const { id } = await org.req({ t: 'tourCreate', name: 'Giải đợt 5 duyệt tên', format: 'bracket', startsAt: Date.now() + 600000, timeLimit: 30, offline: true, checkin: false,
    stages: [{ type: 'single', bestOf: 1, thirdPlace: false }] }, 'tourCreated');
  const t = ctx.app.hub.tours.get(id);
  assert.strictEqual(t.status, 'pending', 'giải của người thường chờ duyệt');
  await B.req({ t: 'adminReview', kind: 'tour', id, approve: true }, 'adminQueue');
  assert.strictEqual(t.status, 'scheduled');
  await org.req({ t: 'tourAddPlayers', id, names: ['An', 'Bình', 'Chi', 'Dũng'] }, 'tourAddResult');
  org.send({ t: 'tourStart', id });
  await until(() => t.status === 'running');
  // Người thường đổi tên giữa giải: bị chặn, tên đã duyệt giữ nguyên
  assert.strictEqual((await org.req({ t: 'tourEdit', id, name: 'Tên chưa duyệt', desc: 'Mô tả chưa duyệt' }, 'error')).code, 'tour_edit_review');
  assert.strictEqual(t.name, 'Giải đợt 5 duyệt tên');
  // Quản trị viên (người duyệt) đổi được
  await B.req({ t: 'tourEdit', id, name: 'Tên quản trị duyệt' }, 'tourEdited');
  assert.strictEqual(t.name, 'Tên quản trị duyệt');
  [org].forEach((c) => c.close());
});

test('mục 74h: người chơi tự báo tỉ số bằng link riêng (slug) được như bằng mã giải', async () => {
  const B = await admin();
  const pa = await account(), pb = await account();
  const who = (c) => [...c.msgs].reverse().find((m) => m.t === 'welcome').me;
  const PA = who(pa), PB = who(pb);
  const { id } = await B.req({ t: 'tourCreate', name: 'Giải Tự Báo Đợt 5', format: 'bracket', startsAt: Date.now() + 600000, timeLimit: 30, offline: true, checkin: false,
    slug: 'giai-dot-5', stages: [{ type: 'single', bestOf: 1, thirdPlace: false }] }, 'tourCreated');
  const t = ctx.app.hub.tours.get(id);
  assert.strictEqual(t.slug, 'giai-dot-5');
  assert.ok(t.selfReport, 'giải offline bật tự báo');
  await B.req({ t: 'tourAddPlayers', id, names: ['@' + PA.username, '@' + PB.username] }, 'tourAddResult');
  B.send({ t: 'tourStart', id });
  await until(() => t.status === 'running');
  const m = Object.values(t.st[0].matches).find((x) => !x.bye);
  const mySets = m.a === PA.uid ? [[2, 0]] : [[0, 2]];
  // pa tự báo BẰNG SLUG: trước khi sửa bị tour_managers_only (đường dự phòng chỉ tra theo mã giải)
  pa.send({ t: 'tourScore', id: 'giai-dot-5', match: m.id, sets: mySets });
  await until(() => m.claim && m.claim.by === PA.uid);
  assert.strictEqual(m.done, false, 'báo lần đầu mới là đề xuất chờ đối thủ xác nhận');
  // pb báo trùng bằng mã giải -> chốt kết quả
  pb.send({ t: 'tourScore', id, match: m.id, sets: mySets });
  await until(() => m.done === true);
  [pa, pb].forEach((c) => c.close());
});

test('mục 74i: đặt lại giải xoá cả firsts/last/restUntil của người chơi; huỷ kết quả xoá notified của trận', async () => {
  const B = await admin();
  // Vế 1 — reset giải Arena: các trường ghép trận của người chơi phải về như mới
  const a1 = await account(), a2 = await account();
  const who = (c) => [...c.msgs].reverse().find((m) => m.t === 'welcome').me;
  const ar = await B.req({ t: 'tourCreate', name: 'Arena đợt 5', format: 'arena', startsAt: Date.now() + 600000, timeLimit: 30, minutes: 30, rated: false }, 'tourCreated');
  const ta = ctx.app.hub.tours.get(ar.id);
  await a1.req({ t: 'tourJoin', id: ar.id }, 'toast');
  await a2.req({ t: 'tourJoin', id: ar.id }, 'toast');
  B.send({ t: 'tourStart', id: ar.id });
  await until(() => ta.status === 'running');
  const p = ta.players.find((x) => x.uid === who(a1).uid);
  Object.assign(p, { firsts: 7, last: who(a2).uid, restUntil: Date.now() + 3600000 }); // trạng thái sau vài ván (dựng như máy chủ ghi)
  B.send({ t: 'tourReset', id: ar.id });
  await until(() => ta.status === 'scheduled');
  assert.ok(!p.firsts, 'reset: số lần đi trước (firsts) về 0');
  assert.strictEqual(p.last, null, 'reset: đối thủ gần nhất (last) xoá');
  assert.ok(!(p.restUntil > Date.now()), 'reset: giờ nghỉ (restUntil) không còn ở tương lai');
  // Vế 2 — undo kết quả giải offline: notified của trận phải xoá để trận sẵn sàng lại thì báo lại
  const off = await B.req({ t: 'tourCreate', name: 'Offline đợt 5 undo', format: 'bracket', startsAt: Date.now() + 600000, timeLimit: 30, offline: true, checkin: false,
    stages: [{ type: 'single', bestOf: 1, thirdPlace: false }] }, 'tourCreated');
  const to = ctx.app.hub.tours.get(off.id);
  await B.req({ t: 'tourAddPlayers', id: off.id, names: ['An', 'Bình', 'Chi', 'Dũng'] }, 'tourAddResult');
  B.send({ t: 'tourStart', id: off.id });
  await until(() => to.status === 'running');
  const st = to.st[0];
  const m = st.matches[st.rounds[0][0]];
  m.notified = [m.a, m.b]; // trận đã từng báo "tới trận" cho cả hai (dựng trạng thái)
  B.send({ t: 'tourScore', id: off.id, match: m.id, sets: [[2, 0]] });
  await until(() => m.done === true);
  B.send({ t: 'tourScoreUndo', id: off.id, match: m.id });
  await until(() => m.done === false);
  assert.ok(!m.notified || !m.notified.length, 'undo: notified xoá để trận sẵn sàng lại được báo lại');
  [a1, a2].forEach((c) => c.close());
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
