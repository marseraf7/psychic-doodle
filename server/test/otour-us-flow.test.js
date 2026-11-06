'use strict';
// Soát tổng thể giải Mỹ (mùa giải – playoff – lịch): chạy trọn 5 mẫu NBA, NFL, MLB, NHL, MLS qua máy chủ thật:
// tạo giải theo mẫu → tự xếp lịch (sân nhà, tự xếp giai đoạn sau) → hết mùa → playoff theo miền (play-in, miễn đấu,
// loạt Bo, xếp lại cặp) có lịch → vô địch. Kiểm: không đội nào đá 2 trận một ngày, playoff có giờ sau mùa giải, trận
// sau không có giờ sớm hơn trận nó chờ, nhập tỉ số đúng kiểu kết quả của môn (loạt Bo kiểu tỉ số của MLS có luân lưu).
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const SC = require('../../caro/otour-sched.js');
const TP = require('../../caro/otour-templates.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const { ctx, account, until } = require('./otour-client.js');

const DAY = SC.DAY;

/** Kết quả cho người thắng w của trận m theo kiểu kết quả của giải và Bo của trận. */
function result(t, st, m, w) {
  const bo = ST.boOf(st, m), need = Math.floor(bo / 2) + 1, a = w === m.a;
  const game = a ? [2, 1] : [1, 2];
  if (t.result === 'sets') return { sets: Array.from({ length: need }, () => game) };
  if (ST.isElim(st.type) && bo > 1) {
    // Loạt Bo kiểu tỉ số: trận đầu hoà, phân thắng thua bằng luân lưu
    return { sets: [[1, 1], ...Array.from({ length: need - 1 }, () => game)], pens: [a ? [5, 4] : [4, 5], ...Array.from({ length: need - 1 }, () => null)] };
  }
  return { score: game };
}

for (const id of ['nba', 'nfl', 'mlb', 'nhl', 'mls']) {
  test(`Mẫu ${id.toUpperCase()}: mùa giải → playoff → vô địch, có lịch tự xếp`, async () => {
    const org = await account();
    const tpl = TP.byId(id);
    const { id: tid } = await org.req({ t: 'otCreate', name: 'Kiểu ' + id, spec: TP.specOf(tpl, SPORTS), teams: TP.sampleTeams(tpl, 'Đội') }, 'otCreated', undefined, 15000);
    const t = ctx.app.hub.otGet(tid);
    org.send({ t: 'otStart', id: tid });
    await until(() => t.status === 'running', 15000);
    const start = new Date(Date.now() + DAY).toISOString().slice(0, 10);
    org.send({ t: 'otSchedAuto', id: tid, sched: { start, times: ['19:00'], home: true, auto: true, tz: 0 }, mode: 'empty' });
    const season = t.st[0], ms = Object.values(season.matches);
    await until(() => ms.every((m) => m.when), 15000);
    const cf = SC.conflicts(ms.map((m) => ({ id: m.id, a: m.a, b: m.b, when: m.when, venue: m.venue })), (w) => Math.floor(w / DAY));
    assert.deepStrictEqual(cf, [], 'mùa giải: không trùng lịch');
    // Hết mùa: đội xếp trên luôn thắng; trận cuối nhập qua máy chủ → bốc thăm playoff + tự xếp lịch playoff
    const seedOf = ctx.app.hub.otSeedOf(t);
    const last = ms.pop();
    for (const m of ms) ST.recordResult(season, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf, isActive: () => true });
    org.send({ t: 'otScore', id: tid, match: last.id, ...result(t, season, last, seedOf(last.a) < seedOf(last.b) ? last.a : last.b) });
    await until(() => t.st[1], 15000);
    const po = t.st[1], seasonEnd = Math.max(...Object.values(season.matches).map((m) => m.when));
    const pm = Object.values(po.matches).filter((m) => !m.bye && m.a !== '-' && m.b !== '-');
    assert.ok(pm.every((m) => m.when > seasonEnd), 'playoff có giờ, sau mùa giải');
    // Trận sau không sớm hơn trận nó chờ (người thắng / thua đi tới)
    for (const m of Object.values(po.matches)) {
      for (const ref of [m.next, m.loserTo].filter(Boolean)) {
        const to = po.matches[ref.to];
        if (m.when && to.when && !to.bye) assert.ok(to.when > m.when, `${to.id} sau ${m.id}`);
      }
    }
    // Đấu playoff qua máy chủ: hạt giống mùa giải cao hơn thắng
    for (let guard = 0; t.status === 'running' && guard < 60; guard++) {
      const ready = ST.playable(po);
      assert.ok(ready.length, 'còn trận đấu được');
      for (const m of ready) {
        org.send({ t: 'otScore', id: tid, match: m.id, ...result(t, po, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b) });
        await until(() => m.done || t.status !== 'running', 5000);
      }
    }
    assert.strictEqual(t.status, 'finished');
    assert.strictEqual(t.podium[0], t.players[0].uid, 'đội hạt giống 1 vô địch');
    if (id === 'mls') {
      const r0 = po.matches[po.rounds[0][1]];
      assert.deepStrictEqual([ST.boOf(po, r0), r0.sets.length, r0.pens[0] && r0.pens[0].length], [3, 2, 2], 'MLS vòng 1: loạt Bo3, trận hoà có luân lưu');
    }
    org.close();
  });
}

test('Loạt Bo kiểu tỉ số: báo lỗi trận hoà thiếu luân lưu, thiếu / thừa trận', async () => {
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Bo3 bóng đá', spec: { sport: 'football', stages: [{ type: 'single', bestOf: 3, thirdPlace: false }] }, teams: ['A', 'B'] }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const m = Object.values(t.st[0].matches).find((x) => x.a !== '-' && x.b !== '-');
  const err = async (x) => (await org.req({ t: 'otScore', id, match: m.id, ...x }, 'error')).code;
  assert.strictEqual(await err({ sets: [[1, 1], [2, 0]] }), 'ot_need_pen');
  assert.strictEqual(await err({ sets: [[2, 0]] }), 'ot_series_short');
  assert.strictEqual(await err({ sets: [[2, 0], [2, 0], [0, 1]] }), 'ot_series_after');
  org.send({ t: 'otScore', id, match: m.id, sets: [[0, 0], [0, 3], [1, 0]], pens: [[3, 2], null, null] });
  await until(() => m.done);
  assert.deepStrictEqual([m.winner === m.a, m.score, m.pens[0]], [true, [2, 1], [3, 2]]);
  const v = await org.req({ t: 'otGet', id }, 'ot');
  assert.deepStrictEqual(v.tour.stageViews[0].rounds[0][0].pens, [[3, 2], null, null]);
  org.close();
});
