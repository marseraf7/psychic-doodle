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

test('giải offline vừa kết thúc: trong 24 giờ huỷ được kết quả chung kết để nhập lại; quá hạn hoặc đã có mùa sau thì khoá', async () => {
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Giải sửa chung kết', spec: { sport: 'other', stages: [{ type: 'single', thirdPlace: false }] }, teams: ['A', 'B'] }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otStart', id }); await until(() => t.status === 'running');
  const m = Object.values(t.st[0].matches)[0];
  org.send({ t: 'otScore', id, match: m.id, score: [1, 0] }); await until(() => t.status === 'finished');
  const champ = t.podium[0];
  org.send({ t: 'otUndo', id, match: m.id }); await until(() => t.status === 'running');
  assert.ok(!m.done && t.podium === null && !t.finishedAt, 'giải mở lại, trận về chưa đấu');
  org.send({ t: 'otScore', id, match: m.id, score: [0, 2] }); await until(() => t.status === 'finished');
  assert.notStrictEqual(t.podium[0], champ, 'nhà vô địch theo tỉ số mới');
  // Quá 24 giờ: khoá, giải giữ nguyên
  t.finishedAt = Date.now() - 25 * 3600 * 1000;
  assert.strictEqual((await org.req({ t: 'otUndo', id, match: m.id }, 'error')).code, 'tour_undo_locked');
  assert.ok(t.status === 'finished' && m.done && t.podium);
  // Trận không tồn tại: báo lỗi và giải vẫn "đã kết thúc" (không mở lại dở)
  t.finishedAt = Date.now();
  await org.req({ t: 'otUndo', id, match: 's0-khong-co' }, 'error');
  assert.ok(t.status === 'finished' && t.podium && t.finishedAt);
  org.close();
});

test('mục 34 / 35 / 56: chuyển giai đoạn kiểm cỡ theo số đội THỰC – không vừa thì báo lỗi có mã, kết quả vừa nhập vẫn lưu, giai đoạn không chuyển', async () => {
  const Spec = require('../src/hub/otour-spec.js');
  // Hàm kiểm dùng chung: giai đoạn sau có < 2 đội; The Split có < 4 đội
  assert.deepStrictEqual(Spec.stageSizeError({ type: 'single' }, 1, 1), { code: 'ot_stage_few', args: { n: 2 } });
  assert.strictEqual(Spec.stageSizeError({ type: 'single' }, 2, 1), null);
  // Qua máy chủ (đúng ca của mục 34): Thụy Sĩ theo số thắng / thua (3 thắng đi tiếp, 2 thua bị loại) → vòng tranh hạt giống →
  // loại trực tiếp, 10 đội. Số đội đủ 3 thắng không cố định; không vừa cỡ vòng tranh hạt giống thì phải báo lỗi có mã
  const org = await account();
  const spec = { sport: 'other', stages: [{ type: 'swiss', record: { win: 3, loss: 2 } }, { type: 'kings' }, { type: 'single' }] };
  const either = (send) => { const n = org.msgs.length; org.send(send); return until(() => org.msgs.slice(n).some((x) => x.t === 'otCreated' || x.t === 'error' || x.t === 'ot')).then(() => org.msgs.slice(n).find((x) => x.t === 'otCreated' || x.t === 'error') || {}); };
  const made = await either({ t: 'otCreate', name: 'Giải lệch cỡ', spec, teams: Array.from({ length: 6 }, (_, k) => 'Đ' + k) }); // 6 đội: ước tính 4 đội đi tiếp, thực tế số đội đủ 3 thắng có thể khác
  if (made.t === 'otCreated') {
    const t = ctx.app.hub.otGet(made.id);
    const n0 = org.msgs.length;
    org.send({ t: 'otStart', id: t.id });
    await until(() => t.status === 'running' || org.msgs.slice(n0).some((x) => x.t === 'error'));
    if (t.status !== 'running') { console.log('bắt đầu bị từ chối:', org.msgs.slice(n0).find((x) => x.t === 'error').code); org.close(); return; }
    org.msgs.length = 0;
    const so = ctx.app.hub.otSeedOf(t);
    let err = null;
    for (let g = 0; g < 200 && t.stage === 0 && t.status === 'running' && !err; g++) {
      const m = ST.playable(t.st[0])[0];
      if (!m) break;
      org.send({ t: 'otScore', id: t.id, match: m.id, score: so(m.a) < so(m.b) ? [1, 0] : [0, 1] });
      await until(() => m.done || org.msgs.some((x) => x.t === 'error'));
      err = org.msgs.find((x) => x.t === 'error') || null;
    }
    const last = t.st[t.st.length - 1];
    // Hoặc chuyển giai đoạn được với giai đoạn mới CÓ trận, hoặc dừng ở giai đoạn 1 với lỗi có mã – không bao giờ là giai đoạn 0 trận
    if (t.stage === 0) assert.match(err ? err.code : '', /^ot_/, 'không chuyển được thì phải có lỗi có mã');
    else assert.ok(Object.keys(last.matches || {}).length > 0, 'giai đoạn mới phải có trận');
    assert.ok(t.st[0].done, 'kết quả cuối của giai đoạn 1 vẫn được ghi');
  }
  org.close();
});
