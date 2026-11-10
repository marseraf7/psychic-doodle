'use strict';
// Soát tổng thể các thể thức đặc biệt (đợt 6): chạy trọn từng mẫu mới qua máy chủ thật với đủ số đội gợi ý – LoL Worlds
// (Play-In → Thụy Sĩ → loại trực tiếp), America's Cup (đội giữ cúp vào thẳng), Tour de France (184 tay đua × 21 chặng),
// The Masters (90 golfer, cắt sau vòng 2), Esports World Cup (giải tổng + 5 giải con → bảng điểm câu lạc bộ). Mỗi giải:
// tạo theo mẫu → bắt đầu → nhập mọi kết quả qua tin nhắn như ban tổ chức → kết thúc; bản xem đầy đủ gửi được cho khách.
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const TP = require('../../caro/otour-templates.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const { ctx, Client, account, until } = require('./otour-client.js');

/** Kết quả cho người thắng w của trận m theo kiểu kết quả của giải. */
function result(t, st, m, w) {
  const bo = ST.boOf(st, m), need = Math.floor(bo / 2) + 1, a = w === m.a;
  if (t.result === 'sets') return { sets: Array.from({ length: need }, () => (a ? [1, 0] : [0, 1])) };
  if (t.result === 'winner') return { winner: w };
  return { score: a ? [2, 1] : [1, 2] };
}
/** Bảng kết quả một chặng / vòng của giai đoạn race: người hạt giống cao về trước. */
function raceRows(st, i, seedOf) {
  const cfg = st.cfg, rows = st.entrants.map((u) => ({ u, s: seedOf(u) })).sort((x, y) => x.s - y.s);
  if (cfg.score === 'golf') {
    // Chỉ những người còn thi đấu (chưa bị cắt / rút lui)
    const ok = new Set(require('../src/hub/stages-golf.js').eligible(st, i));
    return rows.filter((x) => ok.has(x.u)).map((x) => ({ uid: x.u, s: 66 + Math.min(20, x.s) }));
  }
  if (cfg.score === 'gt') return rows.map((x, k) => ({ uid: x.u, rank: k + 1, time: 4 * 3600000 + Math.floor(k / 20) * 5000, ...(k === 0 ? { kom: 5, sp: 10 } : {}) }));
  if (cfg.score === 'time') return rows.map((x, k) => ({ uid: x.u, time: 60000 + k * 100 }));
  return rows.map((x, k) => ({ uid: x.u, rank: k + 1 }));
}
/** Đấu hết một giải (hạt giống cao luôn thắng). */
async function playOut(org, t) {
  const seedOf = ctx.app.hub.otSeedOf(t);
  for (let guard = 0; t.status === 'running' && guard < 400; guard++) {
    const st = t.st[t.stage];
    if (st.type === 'race') {
      const ev = st.events.find((e) => !e.done);
      org.send({ t: 'otRace', id: t.id, event: ev.i, rows: raceRows(st, ev.i, seedOf) });
      await until(() => ev.done, 8000);
      continue;
    }
    const ready = ST.playable(st);
    assert.ok(ready.length, t.name + ': còn trận đấu được ở giai đoạn ' + (t.stage + 1));
    for (const m of ready) {
      org.send({ t: 'otScore', id: t.id, match: m.id, ...result(t, st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b) });
      await until(() => m.done || t.status !== 'running' || t.st[t.stage] !== st, 8000);
    }
  }
}
/** Khách (không đăng nhập) tải được bản xem đầy đủ. */
async function guestView(id) {
  const g = await Client.open();
  const v = await g.req({ t: 'otGet', id }, 'ot', (m) => m.id === id);
  g.close();
  return v.tour;
}

for (const id of ['lol_worlds', 'americas_cup', 'tour_de_france', 'masters']) {
  test(`Mẫu ${id}: chạy trọn giải với đủ số đội gợi ý`, async () => {
    const org = await account();
    const tpl = TP.byId(id);
    const { id: tid } = await org.req({ t: 'otCreate', name: 'Kiểu ' + id, spec: TP.specOf(tpl, SPORTS), teams: TP.sampleTeams(tpl, 'Đội') }, 'otCreated', undefined, 15000);
    const t = ctx.app.hub.otGet(tid);
    assert.strictEqual(t.players.length, tpl.n);
    org.send({ t: 'otStart', id: tid });
    await until(() => t.status === 'running', 15000);
    await playOut(org, t);
    assert.strictEqual(t.status, 'finished', id);
    const v = await guestView(tid);
    assert.strictEqual(v.stageViews.length, tpl.stages.length);
    if (id === 'lol_worlds') assert.strictEqual(t.podium[0], t.players[0].uid);
    if (id === 'americas_cup') assert.strictEqual(t.podium[0], t.players[0].uid, 'đội giữ cúp (hạt giống 1) giữ cúp');
    if (id === 'tour_de_france') {
      const sv = v.stageViews[0];
      assert.deepStrictEqual([sv.table.length, sv.gt.teams.length, sv.gt.young.length, sv.events[20].lead.gc], [184, 23, 23, t.players[0].name]);
      assert.ok(sv.table[0].time < sv.table[1].time && sv.gt.kom[0].pts === 21 * 5);
    }
    if (id === 'masters') {
      const sv = v.stageViews[0];
      // 90 golfer, điểm theo hạt giống (hạt giống ≥ 20 cùng 86 gậy): sau vòng 2 cắt top 50 + đồng hạng → mọi người đồng hạng vạch cắt đều qua
      assert.strictEqual(sv.table.filter((x) => x.cut).length, 0, 'đồng hạng ở vạch cắt đều đi tiếp');
      assert.deepStrictEqual([sv.table[0].name, sv.table[0].toPar, sv.table[0].rounds.length], [t.players[0].name, (67 - 72) * 4, 4]);
    }
    org.close();
  });
}

test('Mẫu Esports World Cup: giải tổng + 5 giải con chạy trọn → bảng điểm câu lạc bộ', async () => {
  const org = await account();
  const tpl = TP.byId('esports_world_cup');
  const games = tpl.multi.games.map((g) => ({ name: 'Game ' + g.key, spec: TP.specOf(g, SPORTS), teams: Array.from({ length: g.n }, (_, i) => 'CLB ' + (i + 1)) }));
  const { id } = await org.req({ t: 'otCreate', name: 'Cúp các câu lạc bộ', spec: TP.specOf(tpl, SPORTS), teams: [], multi: { table: tpl.multi.table, games } }, 'otCreated', undefined, 15000);
  const P = ctx.app.hub.otGet(id);
  assert.strictEqual(P.multi.children.length, 5);
  for (const cid of P.multi.children) {
    const c = ctx.app.hub.otGet(cid);
    org.send({ t: 'otStart', id: cid });
    await until(() => c.status === 'running', 15000);
    await playOut(org, c);
    assert.strictEqual(c.status, 'finished', c.name);
    assert.strictEqual(c.podium[0], c.players[0].uid, c.name + ': hạt giống 1 vô địch');
  }
  assert.strictEqual(P.status, 'finished');
  const v = await guestView(id);
  // CLB 1 vô địch cả 5 game: 5 × 1000; CLB 2 về nhì cả 5: 5 × 750
  assert.deepStrictEqual(v.multi.clubs.slice(0, 2).map((c) => [c.name, c.pts, c.wins]), [['CLB 1', 5000, 5], ['CLB 2', 3750, 0]]);
  assert.ok(v.multi.children.every((c) => c.status === 'finished' && c.champ === 'CLB 1'));
  org.close();
});
