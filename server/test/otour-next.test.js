'use strict';
// Thể thức đặc biệt đợt 4 – giải nhiều mùa (otour-next.js): tạo mùa sau giữ cấu hình, vô địch + đặc cách trọn đời tự
// vào mùa sau và đứng đầu (đội giữ cúp America's Cup vào thẳng trận tranh cúp), liên kết các mùa; đăng ký theo lời mời
// (otour-league.js): chỉ tài khoản được mời đăng ký được, người được mời nhận thông báo và xem được giải riêng tư.
const test = require('node:test');
const assert = require('node:assert');
const TP = require('../../caro/otour-templates.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const { cleanNames } = require('../src/hub/otour-next.js');
const { ctx, account, until } = require('./otour-client.js');

const who = (c) => [...c.msgs].reverse().find((m) => m.t === 'welcome').me; // lần chào sau khi đăng ký (lần đầu là khách)

test('Tên đặc cách: bỏ trùng (không phân biệt hoa thường), bỏ ký tự lạ, tối đa 200', () => {
  assert.deepStrictEqual(cleanNames('Đội A\n đội a \n\nĐội <B>|x'), ['Đội A', 'Đội Bx']);
  assert.strictEqual(cleanNames(Array.from({ length: 300 }, (_, i) => 'T' + i)).length, 200);
});

test('Mùa sau kiểu America’s Cup: đội thắng thành đội giữ cúp mùa sau (đứng đầu, vào thẳng trận tranh cúp)', async () => {
  const org = await account();
  const tpl = TP.byId('americas_cup');
  const { id } = await org.req({ t: 'otCreate', name: 'Cúp buồm', spec: TP.specOf(tpl, SPORTS), teams: TP.sampleTeams(tpl, 'Thuyền') }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  // Chưa kết thúc: không tạo được mùa sau
  assert.strictEqual((await org.req({ t: 'otNextSeason', id }, 'error')).code, 'ot_next_not_done');
  org.send({ t: 'otExempt', id, names: 'Thuyền 6\nthuyền 6\nKhông có' });
  await until(() => t.exempt && t.exempt.length === 2);
  assert.ok(t.players.find((p) => p.name === 'Thuyền 6').exempt && !t.players[0].exempt);
  // Giả lập giải đã xong: Thuyền 3 vô địch
  Object.assign(t, { status: 'finished', podium: [t.players[2].uid, t.players[0].uid] });
  org.send({ t: 'otNextSeason', id });
  const { id: id2 } = await org.wait('otCreated');
  const t2 = ctx.app.hub.otGet(id2);
  assert.deepStrictEqual(t2.players.map((p) => p.name), ['Thuyền 3', 'Thuyền 6', 'Không có'], 'vô địch đứng đầu, rồi đặc cách');
  assert.ok(t2.players.every((p) => p.exempt));
  assert.deepStrictEqual([t2.sport, t2.stages.length, t2.stages[2].direct, t2.esports.sides, t2.status], ['sailing', 3, 1, 'ps', 'draft']);
  assert.deepStrictEqual([t2.series.n, t2.series.prev, t.series.next, t.series.root, t2.series.root], [2, id, id2, id, id]);
  assert.strictEqual((await org.req({ t: 'otNextSeason', id }, 'error')).code, 'ot_next_exists');
  // Cấu hình mùa trước không đổi theo mùa sau
  t2.stages[0].meetings = 1;
  assert.strictEqual(t.stages[0].meetings, 2);
  // Người xem thấy liên kết mùa
  const v = await org.req({ t: 'otGet', id: id2 }, 'ot');
  assert.deepStrictEqual([v.tour.series.n, v.tour.series.prev.id, v.tour.exempt.length], [2, id, 3]);
  // Mùa 3 giữ cả danh sách đội
  Object.assign(t2, { status: 'finished', podium: [t2.players[1].uid] });
  t2.players.push({ uid: 't:x', name: 'Mới', seed: 4 });
  org.send({ t: 'otNextSeason', id: id2, carry: true });
  const { id: id3 } = await org.wait('otCreated', (m) => m.id !== id2);
  const t3 = ctx.app.hub.otGet(id3);
  assert.deepStrictEqual(t3.players.map((p) => [p.name, !!p.exempt]), [['Thuyền 6', true], ['Thuyền 3', true], ['Không có', true], ['Mới', false]]);
  assert.strictEqual(t3.series.n, 3);
  org.close();
});

test('Đăng ký theo lời mời: chỉ tài khoản được mời đăng ký được; người được mời xem được giải riêng tư', async () => {
  const org = await account(), a = await account(), b = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Giải mời', access: 'private', spec: { sport: 'golf', stages: [{ type: 'race', score: 'golf', events: 2 }] }, teams: [] }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otRegOpen', id, open: true, invite: true });
  await until(() => t.reg && t.reg.invite);
  assert.strictEqual((await a.req({ t: 'otGet', id }, 'error')).code, 'ot_not_found', 'chưa được mời: không thấy giải riêng tư');
  const r = await org.req({ t: 'otInvite', id, names: `@${who(a).username}\nkhong_co_ai` }, 'otInvited');
  assert.deepStrictEqual([r.n, r.miss], [1, ['khong_co_ai']]);
  await until(() => a.msgs.some((m) => m.t === 'notes'));
  const note = a.msgs.find((m) => m.t === 'notes');
  assert.deepStrictEqual([note.items[0].k, note.items[0].id], ['ot_invite', id]);
  const va = await a.req({ t: 'otGet', id }, 'ot');
  assert.ok(va.tour.reg.invite && va.mine.invited, 'người được mời thấy giải và biết mình được mời');
  a.send({ t: 'otRegister', id, name: 'Golfer A', roster: '' });
  await until(() => t.regs && t.regs.length === 1);
  assert.strictEqual((await b.req({ t: 'otRegister', id, name: 'Golfer B', roster: '' }, 'error')).code, 'ot_not_found');
  t.access = 'public';
  assert.strictEqual((await b.req({ t: 'otRegister', id, name: 'Golfer B', roster: '' }, 'error')).code, 'ot_reg_invite_only');
  const vo = await org.req({ t: 'otGet', id }, 'ot');
  assert.deepStrictEqual([vo.mine.regInvite, vo.mine.invited.map((x) => x.name)], [true, [who(a).name]]);
  org.send({ t: 'otUninvite', id, uid: who(a).uid });
  await until(() => t.reg.invited.length === 0);
  // Mở đăng ký lại không làm mất chế độ mời
  org.send({ t: 'otRegOpen', id, open: false });
  await until(() => !t.reg.open);
  assert.ok(t.reg.invite);
  org.close(); a.close(); b.close();
});
