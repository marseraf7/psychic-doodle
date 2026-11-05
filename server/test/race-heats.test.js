'use strict';
// Hệ Race – chia lượt (heat) cho đoàn rất đông (hub/stages-race.js, hub/otour-race.js)
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const R = require('../src/hub/stages-race.js');
const { ctx, account, until, teams } = require('./otour-client.js');

const OFF = { offline: true };
const ids = (n) => Array.from({ length: n }, (_, i) => 'd' + i);

test('chia lượt: đều nhau (chênh tối đa 1), kiểu rắn ở chặng đầu, chặng sau đổi đối thủ; đoàn nhỏ hơn heat thì không chia', () => {
  const d = ids(20);
  const hs = R.heatsFor(d, 8, 0);
  assert.deepStrictEqual(hs.map((h) => h.uids.length), [7, 7, 6], '20 người, tối đa 8 → 3 lượt 7-7-6');
  assert.deepStrictEqual(hs[0].uids.slice(0, 3), ['d0', 'd5', 'd6'], 'rắn: hạt giống 1, 6, 7… cùng lượt 1');
  const all = hs.flatMap((h) => h.uids).sort();
  assert.deepStrictEqual(all, [...d].sort(), 'mỗi người đúng một lượt');
  const hs1 = R.heatsFor(d, 8, 1);
  assert.notDeepStrictEqual(hs1.map((h) => h.uids.join()), hs.map((h) => h.uids.join()), 'chặng 2: các lượt khác chặng 1');
  assert.deepStrictEqual(hs1.flatMap((h) => h.uids).sort(), [...d].sort());
  // Cấu hình
  const [cfg] = ST.normalizeStages([{ type: 'race', events: 2, heat: 8, score: 'time' }], OFF);
  assert.strictEqual(cfg.heat, 8);
  assert.strictEqual(ST.normalizeStages([{ type: 'race', heat: 1 }], OFF)[0].heat, undefined, 'heat < 2: không chia');
  assert.strictEqual(ST.buildStage(cfg, 0, ids(6), {}).events[0].heats, undefined, '6 người ≤ 8: không chia');
  assert.deepStrictEqual(R.raceError({ type: 'race' }, 300), { code: 'ot_race_many', args: { n: R.MAX_RACE } });
  assert.strictEqual(R.raceError({ type: 'race', heat: 10 }, 300), null, 'có chia lượt: tới 512 người');
});

test('Time Trial chia lượt: nhập từng lượt, gộp xếp theo thời gian; điểm: hạng trong lượt; huỷ một lượt', () => {
  const [cfg] = ST.normalizeStages([{ type: 'race', events: 1, heat: 4, score: 'time' }], OFF);
  const d = ids(8);
  const st = ST.buildStage(cfg, 0, d, {});
  const ev = st.events[0];
  assert.strictEqual(ev.heats.length, 2);
  const [h0, h1] = ev.heats.map((h) => h.uids);
  // Người ngoài lượt → lỗi
  assert.strictEqual(R.cleanEvent(st, [{ uid: h1[0], time: 1000 }], h0).code, 'tour_score_bad');
  const r0 = R.cleanEvent(st, h0.map((u, k) => ({ uid: u, time: 60000 + k * 1000 })), h0);
  assert.ok(!r0.code);
  assert.strictEqual(R.recordHeat(st, 0, 0, r0.rows), false);
  assert.strictEqual(ev.done, false, 'mới một lượt: chặng chưa xong');
  const r1 = R.cleanEvent(st, h1.map((u, k) => ({ uid: u, time: 59500 + k * 1000 })), h1); // lượt 2 nhanh hơn 0,5 giây
  assert.strictEqual(R.recordHeat(st, 0, 1, r1.rows), true, 'đủ lượt: giai đoạn xong');
  const v = R.raceView(st, 0, 0, (u) => ({ uid: u, name: u }), (u) => d.indexOf(u));
  assert.deepStrictEqual(v.table.slice(0, 2).map((x) => x.uid), [h1[0], h0[0]], 'gộp hai lượt: xếp theo thời gian');
  assert.strictEqual(v.events[0].heats.length, 2);
  assert.strictEqual(v.events[0].heats[1].rows[0].uid, h1[0]);
  assert.ok(!('uids' in v.events[0].heats[0]), 'không gửi người trong lượt (trình duyệt tự tính)');
  const RU = require('../../caro/otour-rules.js');
  assert.deepStrictEqual(RU.heatsOf(v.entrants.map((p) => p.uid), cfg.heat, 0), [h0, h1], 'trình duyệt tính lại đúng như máy chủ');
  R.undoHeat(st, 0, 1);
  assert.ok(!ev.done && !st.done && ev.heats[0].done && !ev.heats[1].done, 'huỷ lượt 2: lượt 1 giữ nguyên');
  // Điểm: hạng tối đa = số người trong lượt
  const [pc] = ST.normalizeStages([{ type: 'race', events: 1, heat: 4 }], OFF);
  const sp = ST.buildStage(pc, 0, d, {});
  const p0 = sp.events[0].heats[0].uids;
  assert.strictEqual(R.cleanEvent(sp, [{ uid: p0[0], rank: 5 }], p0).code, 'ot_race_rank');
  R.recordHeat(sp, 0, 0, R.cleanEvent(sp, p0.map((u, k) => ({ uid: u, rank: k + 1 })), p0).rows);
  const p1 = sp.events[0].heats[1].uids;
  R.recordHeat(sp, 0, 1, R.cleanEvent(sp, p1.map((u, k) => ({ uid: u, rank: k + 1 })), p1).rows);
  const tb = R.raceTable(sp, (u) => d.indexOf(u));
  assert.strictEqual(tb.stats[p0[0]].pts, 25);
  assert.strictEqual(tb.stats[p1[0]].pts, 25, 'nhất mỗi lượt đều 25 điểm');
});

test('trên máy chủ: otRace / otRaceUndo theo lượt', async () => {
  const org = await account();
  const hub = ctx.app.hub;
  const spec = { sport: 'running', stages: [{ type: 'race', events: 1, score: 'time', heat: 5 }] };
  const { id } = await org.req({ t: 'otCreate', name: 'Chạy 12 người', spec, teams: teams(12) }, 'otCreated');
  const t = hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const ev = t.st[0].events[0];
  assert.strictEqual(ev.heats.length, 3);
  const err = async (m) => (await org.req(m, 'error')).code;
  assert.strictEqual(await err({ t: 'otRace', id, event: 0, rows: [{ uid: ev.heats[0].uids[0], time: 1000 }] }), 'bad_message', 'chặng chia lượt: phải ghi lượt');
  assert.strictEqual(await err({ t: 'otRace', id, event: 0, heat: 9, rows: [] }), 'bad_message');
  for (const [h, x] of ev.heats.entries()) {
    org.send({ t: 'otRace', id, event: 0, heat: h, rows: x.uids.map((u, k) => ({ uid: u, time: 600000 + h * 100 + k * 1000 })) });
    await until(() => x.done);
    if (h === 0) {
      assert.strictEqual(await err({ t: 'otRace', id, event: 0, heat: 0, rows: x.uids.map((u) => ({ uid: u, time: 1 })) }), 'tour_match_done');
      org.send({ t: 'otRaceUndo', id, event: 0, heat: 0 });
      await until(() => !x.done);
      org.send({ t: 'otRace', id, event: 0, heat: 0, rows: x.uids.map((u, k) => ({ uid: u, time: 600000 + k * 1000 })) });
      await until(() => x.done);
    }
  }
  await until(() => t.status === 'finished');
  assert.strictEqual(t.podium.length >= 3, true);
  org.close();
});
