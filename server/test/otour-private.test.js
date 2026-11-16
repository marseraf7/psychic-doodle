/*
 * Giải offline riêng tư không lộ qua liên kết (rà soát code 16/11/2026, mục 8 – họ hàng của N6):
 *   8a – trang mùa công khai không kèm mã / tên mùa riêng tư (chủ giải vẫn thấy qua phần riêng của mình);
 *   8b – người được mời vào giải tổng riêng tư mở được giải con riêng tư cùng chủ (đã thấy nó ở trang giải tổng);
 *   8c – người chỉ được mời vào giải con không thấy mã / tên giải tổng riêng tư.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { ctx, account, until } = require('./otour-client.js');

const who = (c) => [...c.msgs].reverse().find((m) => m.t === 'welcome').me;
const single = { sport: 'esports', stages: [{ type: 'single', bestOf: 1, thirdPlace: false }] };
const get = (c, id) => c.req({ t: 'otGet', id }, 'ot', (m) => m.id === id && m.tour);
const view = (m) => ({ ...m.tour, ...m.mine }); // như trang: phần riêng ghi đè phần chung

test('8a: mùa riêng tư không lộ ở trang mùa công khai; chủ giải vẫn có liên kết', async () => {
  const org = await account(), guest = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Mùa một', spec: single, teams: ['A', 'B', 'C', 'D'] }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  Object.assign(t, { status: 'finished', podium: [t.players[0].uid, t.players[1].uid] });
  org.send({ t: 'otNextSeason', id });
  const { id: id2 } = await org.wait('otCreated');
  const t2 = ctx.app.hub.otGet(id2);
  t2.access = 'private';
  const g = await get(guest, id);
  assert.strictEqual(view(g).series.next, null, 'khách: không thấy mùa sau riêng tư');
  assert.ok(!JSON.stringify(g).includes(id2), 'mã mùa riêng tư không có trong dữ liệu gửi cho khách');
  assert.strictEqual(view(await get(org, id)).series.next.id, id2, 'chủ giải: vẫn có liên kết mùa sau');
  assert.strictEqual(ctx.app.hub.publicOTour(id).series.next, null, 'trang công khai JSON: không lộ');
  t2.access = 'public';
  assert.strictEqual(view(await get(guest, id)).series.next.id, id2, 'mùa công khai: ai cũng thấy');
  [org, guest].forEach((c) => c.close());
});

test('8b + 8c: quyền xem giải tổng / giải con riêng tư thống nhất hai chiều', async () => {
  const org = await account(), inP = await account(), inC = await account(), out = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Cúp kín', access: 'private', spec: single, teams: [],
    multi: { table: [100, 60], games: [{ name: 'Game kín', spec: single, teams: ['A1 |  | Alpha', 'B1 |  | Beta'] }] } }, 'otCreated');
  const P = ctx.app.hub.otGet(id), cid = P.multi.children[0], C = ctx.app.hub.otGet(cid);
  assert.strictEqual(C.access, 'private');
  // inP được mời vào giải tổng; inC chỉ được mời vào giải con
  org.send({ t: 'otRegOpen', id, open: true, invite: true }); await until(() => P.reg && P.reg.invite);
  await org.req({ t: 'otInvite', id, names: '@' + who(inP).username }, 'otInvited');
  org.send({ t: 'otRegOpen', id: cid, open: true, invite: true }); await until(() => C.reg && C.reg.invite);
  await org.req({ t: 'otInvite', id: cid, names: '@' + who(inC).username }, 'otInvited');
  // 8b: người được mời giải tổng thấy giải con ở trang giải tổng VÀ mở được giải con, có liên kết về giải tổng
  assert.deepStrictEqual(view(await get(inP, id)).multi.children.map((x) => x.id), [cid]);
  assert.strictEqual(view(await get(inP, cid)).parent.id, id);
  // 8c: người chỉ được mời giải con mở được giải con nhưng không thấy mã / tên giải tổng; không mở được giải tổng
  const vc = await get(inC, cid);
  assert.strictEqual(view(vc).parent, null);
  assert.ok(!JSON.stringify(vc).includes(id) && !JSON.stringify(vc).includes('Cúp kín'), 'không lộ mã / tên giải tổng');
  assert.strictEqual((await inC.req({ t: 'otGet', id }, 'error')).code, 'ot_not_found');
  // Người ngoài: không mở được cả hai; chủ giải: đủ liên kết
  assert.strictEqual((await out.req({ t: 'otGet', id: cid }, 'error')).code, 'ot_not_found');
  assert.strictEqual(view(await get(org, cid)).parent.id, id);
  // Giải con công khai dưới giải tổng riêng tư: trang công khai của giải con không lộ giải tổng
  C.access = 'public';
  assert.strictEqual(view(await get(out, cid)).parent, null);
  [org, inP, inC, out].forEach((c) => c.close());
});
