'use strict';
// Thể thức đặc biệt đợt 5 – giải tổng gom nhiều giải con kiểu Esports World Cup (otour-multi.js): giải con thể thức
// riêng, đội gắn câu lạc bộ (cột "Đội"), bảng điểm câu lạc bộ theo thứ hạng chung cuộc (đồng hạng khi bị loại cùng
// vòng, mỗi câu lạc bộ lấy đội xếp cao nhất mỗi giải, bằng điểm xét số lần hạng cao hơn), trạng thái giải tổng, lịch
// gộp, hạn mức không tính giải con, gắn / gỡ / xoá.
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const M = require('../src/hub/otour-multi.js');
const { ctx, account, until } = require('./otour-client.js');

const single = { sport: 'esports', stages: [{ type: 'single', bestOf: 1, thirdPlace: false }] };
// Đấu hết giải: hạt giống cao luôn thắng
async function playAll(org, t) {
  const seedOf = ctx.app.hub.otSeedOf(t);
  for (let g = 0; t.status === 'running' && g < 20; g++) {
    const st = t.st[t.stage];
    for (const m of ST.playable(st)) {
      org.send({ t: 'otScore', id: t.id, match: m.id, sets: [seedOf(m.a) < seedOf(m.b) ? [1, 0] : [0, 1]] });
      await until(() => m.done);
    }
  }
}

test('Bảng điểm theo hạng: chuẩn hoá; thứ hạng chung cuộc đồng hạng theo vòng bị loại', () => {
  assert.deepStrictEqual(M.cleanTable('10, 5 x -3'), [10, 5, 0, 0]);
  assert.deepStrictEqual(M.cleanTable(''), M.TABLE);
  const seeds = Array.from({ length: 8 }, (_, i) => 'u' + i), seedOf = (u) => seeds.indexOf(u) + 1;
  const [cfg] = ST.normalizeStages([{ type: 'single', thirdPlace: false }], { offline: true });
  const st = ST.buildStage(cfg, 0, seeds, { seedOf });
  for (let g = 0; !st.done && g < 5; g++) for (const m of ST.playable(st)) ST.recordResult(st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf });
  const t = { status: 'finished', stages: [cfg], st: [st], podium: ST.podium(st, seedOf) };
  const pl = M.finalPlaces(t, seedOf);
  assert.deepStrictEqual(pl.map((x) => x.place), [1, 2, 3, 3, 5, 5, 5, 5]);
  assert.deepStrictEqual(pl.slice(0, 2).map((x) => x.uid), ['u0', 'u1']);
  assert.deepStrictEqual(M.finalPlaces({ ...t, status: 'running' }, seedOf), []);
});

test('Giải tổng qua máy chủ: giải con không tính hạn mức, điểm câu lạc bộ, trạng thái, gắn / gỡ / xoá', async () => {
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Cúp đa môn', spec: single, teams: [], multi: { table: [100, 60, 30],
    games: [{ name: 'Game MOBA', spec: single, teams: ['A1 |  | Alpha', 'B1 |  | Beta', 'C1 |  | Gamma', 'A2 |  | Alpha'] }, { name: 'x', spec: single }, { name: 'Hỏng', spec: { stages: 5 } }] } }, 'otCreated');
  const P = ctx.app.hub.otGet(id);
  // Bản đầy đủ của đúng giải đang hỏi (bản cập nhật của giải khác có thể tới xen giữa)
  const get = async (x) => (await org.req({ t: 'otGet', id: x }, 'ot', (m) => m.id === x && m.tour)).tour;
  assert.deepStrictEqual([P.multi.table, P.multi.children.length, P.status], [[100, 60, 30], 1, 'draft']);
  assert.strictEqual((await org.req({ t: 'otStart', id }, 'error')).code, 'ot_multi_no_start');
  const c1 = ctx.app.hub.otGet(P.multi.children[0]);
  assert.deepStrictEqual([c1.parent, c1.players.length, c1.players[0].team], [id, 4, 'Alpha']);
  // Thêm giải con qua otCreate (parent) – 12 giải con vẫn không chạm hạn mức 10 giải đang chạy
  let id2;
  for (let i = 0; i < 11; i++) ({ id: id2 } = await org.req({ t: 'otCreate', name: 'Game ' + i, parent: id, spec: single, teams: ['B9 |  | Beta', 'A9 |  | Alpha'] }, 'otCreated', (m) => !P.multi.children.slice(0, -1).includes(m.id) && m.id !== id));
  assert.strictEqual(P.multi.children.length, 12);
  assert.strictEqual(ctx.app.store.countActiveOTours(P.owner), 1, 'chỉ giải tổng tính vào hạn mức');
  const list = await org.req({ t: 'otList' }, 'otList');
  assert.deepStrictEqual(list.mine.map((x) => x.id), [id], 'danh sách không liệt kê riêng giải con');
  // Người khác không thêm được giải con
  const other = await account();
  assert.strictEqual((await other.req({ t: 'otCreate', name: 'Lạ mặt', parent: id, spec: single, teams: [] }, 'error')).code, 'tour_managers_only');
  // Đấu giải con 1: A1 > B1 > (C1, A2 đồng hạng 3)
  org.send({ t: 'otStart', id: c1.id });
  await until(() => c1.status === 'running' && P.status === 'running');
  const m0 = Object.values(c1.st[0].matches).find((m) => !m.done);
  org.send({ t: 'otMatchInfo', id: c1.id, match: m0.id, when: Date.now() + 3600000, venue: 'Sân A' });
  await until(() => m0.when);
  let v = (await get(id));
  assert.deepStrictEqual([v.multi.sched.length, v.multi.sched[0].game, v.multi.children.length, v.multi.clubs.length], [1, 'Game MOBA', 12, 0]);
  await playAll(org, c1);
  assert.strictEqual(c1.status, 'finished');
  // Giải con 2 (Beta hạt giống 1 thắng Alpha)
  const c2 = ctx.app.hub.otGet(id2);
  org.send({ t: 'otStart', id: id2 });
  await until(() => c2.status === 'running');
  await playAll(org, c2);
  v = (await get(id));
  // Alpha: 100 (A1 nhất; A2 hạng 3 không tính) + 60 = 160; Beta: 60 + 100 = 160 → bằng điểm, cùng 1 hạng nhất, 1 hạng nhì → theo tên
  assert.deepStrictEqual(v.multi.clubs.map((c) => [c.name, c.pts, c.wins]), [['Alpha', 160, 1], ['Beta', 160, 1], ['Gamma', 30, 0]]);
  assert.deepStrictEqual(v.multi.clubs[0].res[c1.id], { place: 1, pts: 100 });
  assert.strictEqual(v.multi.children.find((x) => x.id === c1.id).champ, 'A1');
  assert.strictEqual(P.status, 'running', 'còn giải con chưa xong');
  // Trang giải con có liên kết về giải tổng
  assert.deepStrictEqual((await get(c1.id)).parent, { id, slug: P.slug || null, name: 'Cúp đa môn' });
  // Đổi bảng điểm; giải con riêng tư không hiện / không cộng điểm
  org.send({ t: 'otMultiCfg', id, table: '10 1' });
  await until(() => P.multi.table[0] === 10);
  c2.access = 'private';
  v = (await get(id));
  assert.deepStrictEqual([v.multi.clubs.map((c) => [c.name, c.pts]), v.multi.hidden], [[['Alpha', 10], ['Beta', 1], ['Gamma', 0]], 1]);
  c2.access = 'public';
  // Gỡ mọi giải con chưa đấu → chỉ còn 2 giải đã xong → giải tổng kết thúc; giải gỡ ra thành giải thường
  for (const cid of P.multi.children.filter((x) => x !== c1.id && x !== id2)) org.send({ t: 'otMultiDetach', id, child: cid });
  await until(() => P.multi.children.length === 2);
  assert.strictEqual(P.status, 'finished');
  assert.strictEqual(ctx.app.store.countActiveOTours(P.owner), 10);
  // Gắn lại một giải có sẵn; giải tổng không làm giải con được
  const loose = (await org.req({ t: 'otList' }, 'otList')).mine.find((x) => x.id !== id);
  assert.strictEqual((await org.req({ t: 'otMultiAttach', id, child: id }, 'error')).code, 'ot_multi_bad_child');
  org.send({ t: 'otMultiAttach', id, child: loose.id });
  await until(() => P.multi.children.length === 3 && P.status === 'running');
  // Xoá giải con → rời giải tổng; xoá giải tổng → giải con thành giải thường
  await org.req({ t: 'otDelete', id: loose.id }, 'otDeleted');
  assert.strictEqual(P.multi.children.length, 2);
  await org.req({ t: 'otDelete', id }, 'otDeleted');
  assert.ok(!c1.parent && !c2.parent && ctx.app.hub.otGet(c1.id));
  org.close(); other.close();
});

test('Mẫu Esports World Cup: mọi giải con trong mẫu chuẩn hoá được và đủ cỡ với số đội gợi ý', () => {
  const TP = require('../../caro/otour-templates.js');
  const { SPORTS } = require('../../caro/otour-sports.js');
  const Spec = require('../src/hub/otour-spec.js');
  const tpl = TP.byId('esports_world_cup');
  assert.deepStrictEqual([tpl.multi.table, tpl.multi.games.map((g) => g.key)], [M.TABLE, ['moba', 'fps', 'br', 'fighting', 'chess']]);
  for (const g of tpl.multi.games) {
    const spec = Spec.normalizeSpec(TP.specOf(g, SPORTS));
    assert.deepStrictEqual(spec.stages.map((c) => c.type), g.stages.map((c) => c.type), g.key);
    assert.ok(Spec.checkSize(spec, g.n).matches > 0, g.key);
  }
});
