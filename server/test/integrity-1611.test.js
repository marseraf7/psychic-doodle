/*
 * Toàn vẹn dữ liệu giải / CLB – đợt rà soát code 16/11/2026 (đợt 2):
 *   mục 3   – Swiss / race lấy đúng 1 đội đi tiếp khi đã có đội vào thẳng (min = 1);
 *   mục 16  – không có trận tranh hạng ba: hai đội thua bán kết xếp theo hạt giống;
 *   mục 7   – cắt bớt danh sách khiếu nại không làm mất khiếu nại còn mở;
 *   mục 13b – hộp thư CLB: quá 30 tin chưa đọc thì phần còn lại tới ở lần sau, không mất;
 *   mục 9a  – sửa giải offline với cấu hình sai: không trường nào bị đổi;
 *   mục 10  – tạo giải tổng chạm hạn mức giải con: không để lại giải tổng;
 *   mục 28  – mẫu giải "null" bị từ chối; nghi ngờ 1 – bảng điểm thiếu trường được bổ sung.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const { Disputes } = require('../src/hub/disputes.js');
const { ClubManage } = require('../src/hub/club-manage.js');
const R = require('../src/rating.js');
const { ctx, account, until } = require('./otour-client.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const uids = (n) => Array.from({ length: n }, (_, i) => 'u' + i);
const seedOf = (u) => Number(u.slice(1)) + 1;
const hi = (m) => (seedOf(m.a) < seedOf(m.b) ? m.a : m.b);
function playAll(st) {
  for (let g = 0; g < 200; g++) {
    const m = ST.playable(st)[0];
    if (!m) return;
    ST.recordResult(st, m, hi(m), { seedOf });
  }
}

test('mục 3: Swiss và race lấy đúng 1 đội khi min = 1 (đã có đội vào thẳng); mặc định vẫn tối thiểu 2', () => {
  const [c] = off([{ type: 'swiss', rounds: 2, advance: 1 }, { type: 'single' }]);
  const st = ST.buildStage(c, 0, uids(4), { seedOf });
  playAll(st);
  assert.strictEqual(ST.splitAdvancers(st, seedOf, 1).seeds.length, 1);
  assert.strictEqual(ST.splitAdvancers(st, seedOf).seeds.length, 2);
});

test('mục 16: tắt tranh hạng ba – hai đội thua bán kết xếp theo hạt giống, "3 đội đầu" không loại nhầm', () => {
  const [c] = off([{ type: 'single', thirdPlace: false }]);
  const st = ST.buildStage(c, 0, uids(4), { seedOf });
  playAll(st);
  assert.deepStrictEqual(ST.podium(st, seedOf), ['u0', 'u1', 'u2', 'u3']);
});

test('mục 7: quá 50 khiếu nại – bản ghi còn mở không bị cắt, chỉ cắt bản đã xử lý', () => {
  const hub = { tourManagers: () => [], player: () => null, send() {} };
  const t = { name: 'G', disputes: [] };
  const first = Disputes.prototype.openDispute.call(hub, t, { w: 'a', l: 'b' });
  for (let i = 0; i < 60; i++) Disputes.prototype.openDispute.call(hub, t, { w: 'a', l: 'b' });
  assert.ok(t.disputes.includes(first), 'khiếu nại mở đầu tiên còn');
  assert.strictEqual(t.disputes.length, 61);
  // Đóng 55 bản: chỉ giữ 50 bản đã đóng gần nhất + mọi bản còn mở
  t.disputes.slice(1, 56).forEach((d) => { d.status = 'confirmed'; });
  Disputes.prototype.openDispute.call(hub, t, { w: 'a', l: 'b' });
  assert.strictEqual(t.disputes.filter((d) => d.status === 'open').length, 7);
  assert.strictEqual(t.disputes.filter((d) => d.status !== 'open').length, 50);
  assert.ok(t.disputes.includes(first));
});

test('mục 13b: 40 tin CLB chưa đọc → lần đầu 30 tin cũ nhất, lần sau 10 tin còn lại, không mất tin nào', () => {
  const now = Date.now();
  const c = { id: 'c1', name: 'CLB', icon: '', members: { u: 'member' }, muted: [], seen: {}, joinedAt: { u: now - 86400000 },
    msgs: Array.from({ length: 40 }, (_, i) => ({ at: now - 40000 + i * 1000, text: 'tin ' + i })) };
  const hub = { clubs: new Map([[c.id, c]]), saveClub() {} };
  const got = [];
  const conn = { send: (m) => got.push(m.items.map((x) => x.msg.text)) };
  ClubManage.prototype.clubInbox.call(hub, conn, 'u');
  ClubManage.prototype.clubInbox.call(hub, conn, 'u');
  ClubManage.prototype.clubInbox.call(hub, conn, 'u');
  assert.deepStrictEqual(got.map((x) => x.length), [30, 10]);
  assert.deepStrictEqual([got[0][0], got[0][29], got[1][0], got[1][9]], ['tin 0', 'tin 29', 'tin 30', 'tin 39']);
});

test('nghi ngờ 1: bảng điểm thiếu trường / NaN được bổ sung, một ván sau đó không ra NaN', () => {
  const u = { rating: 1300, rated: 30, pools: { blitz: { r: 1300, rd: 80 } } };
  R.upgradePools(u);
  for (const p of R.POOLS) for (const k of ['r', 'rd', 'vol', 'n']) assert.ok(Number.isFinite(u.pools[p][k]), `${p}.${k}`);
  assert.strictEqual(u.pools.blitz.r, 1300, 'giá trị đang có giữ nguyên');
});

test('mục 9a: sửa giải với cấu hình sai → báo lỗi và KHÔNG đổi quyền xem / tên', async () => {
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Giải kín', access: 'private', spec: { sport: 'other', stages: [{ type: 'single' }] }, teams: ['A', 'B'] }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  const err = await org.req({ t: 'otEdit', id, name: 'Tên mới', access: 'public', spec: { sport: 'other', stages: [] } }, 'error');
  assert.match(err.code, /^ot_spec|^srv_ot_spec|spec/);
  assert.deepStrictEqual([t.access, t.name], ['private', 'Giải kín']);
  org.close();
});

test('mục 10: tạo giải tổng khi đã chạm hạn mức giải con trong ngày → lỗi, không để lại giải tổng, không tính lượt tạo', async () => {
  const org = await account();
  const me = [...ctx.app.store.users.values()].find((u) => u.username === [...org.msgs].reverse().find((m) => m.t === 'welcome').me.username);
  me.otKidDay = { d: new Date().toISOString().slice(0, 10), n: 100000 };
  const single = { sport: 'esports', stages: [{ type: 'single', bestOf: 1 }] };
  const err = await org.req({ t: 'otCreate', name: 'Cúp ma', spec: single, teams: [], multi: { table: [10], games: [{ name: 'Game A', spec: single, teams: ['A', 'B'] }] } }, 'error');
  assert.strictEqual(err.code, 'ot_daily_limit');
  assert.strictEqual(ctx.app.store.countActiveOTours(me.id), 0, 'không có giải tổng nào được lưu');
  assert.ok(!me.otDay || !me.otDay.n, 'lượt tạo trong ngày không bị tính');
  // mục 28: mẫu giải null
  assert.strictEqual((await org.req({ t: 'tourTplSave', name: 'Mẫu rỗng', data: null }, 'error')).code, 'bad_message');
  org.close();
});
