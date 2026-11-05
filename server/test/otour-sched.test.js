'use strict';
// Tự xếp lịch thi đấu (caro/otour-sched.js + hub/otour-sched.js): ngày trong tuần, khung giờ, sân / sân nhà, ngày nghỉ
// giữa hai trận, ngày không đấu, loại trực tiếp đấu theo vòng; dời lượt đấu, hoãn + tìm ngày đá bù, cảnh báo trùng lịch
const test = require('node:test');
const assert = require('node:assert');
const SC = require('../../caro/otour-sched.js');
const ST = require('../src/hub/stages.js');
const { stageItems } = require('../src/hub/otour-sched.js');
const { ctx, account, until, teams } = require('./otour-client.js');

const ids = (n) => Array.from({ length: n }, (_, i) => 'u' + String(i).padStart(2, '0'));
const DAY = SC.DAY;
/** Ngày (theo giờ địa phương của cấu hình) và thứ trong tuần của một giờ đấu. */
const local = (cfg, when) => new Date(when - cfg.tz * 60000);

test('cleanSched: chuẩn hoá cấu hình, giờ viết nhiều kiểu', () => {
  const c = SC.cleanSched({ start: '2026-02-30', days: [5, 5, 9, 'x', 6], times: '7h30, 19:00; 25:00, 19', venues: 'Sân A\nSân <B>\nSân A', perSlot: 99, rest: -2, skip: ['2026-12-24', 'x'], tz: -420, auto: 1 });
  assert.strictEqual(SC.dateMs(c.start) != null, true, 'ngày sai → hôm nay');
  assert.deepStrictEqual([c.days, c.times, c.venues, c.perSlot, c.rest, c.skip, c.tz, c.auto], [[5, 6], ['07:30', '19:00'], ['Sân A', 'Sân B'], 64, 0, ['2026-12-24'], -420, false]);
  assert.deepStrictEqual(SC.cleanSched(null).days, [0, 1, 2, 3, 4, 5, 6]);
  assert.deepStrictEqual([SC.normTime('9'), SC.normTime('21.45'), SC.normTime('24:00')], ['09:00', '21:45', null]);
});

test('Mùa giải NBA: xếp đủ 1230 trận, mỗi đội tối đa 1 trận / ngày, đúng ngày và giờ cho phép, sân nhà', () => {
  const seeds = ids(30), seedOf = (u) => seeds.indexOf(u) + 1;
  const [cfg] = ST.normalizeStages([{ type: 'roundrobin', season: { confs: 2, divs: 3, div: { m: 4 }, conf: { m: 3, x: 6 }, inter: { m: 2 } } }], { offline: true });
  const st = ST.buildStage(cfg, 0, seeds, { seedOf });
  const items = stageItems(st, 0).map((it) => ({ ...it, homeVenue: 'Sân ' + it.a }));
  // Giờ Việt Nam (UTC+7): tz = −420; thứ 3, 5, 6, 7, CN; 19:00 và 21:30; ngày 1/1 nghỉ
  const sc = { start: '2026-10-20', days: [0, 2, 4, 5, 6], times: ['19:00', '21:30'], tz: -420, home: true, skip: ['2027-01-01'] };
  const { placed, unplaced } = SC.autoSchedule(items, sc);
  assert.deepStrictEqual([placed.length, unplaced.length], [1230, 0]);
  const c = SC.cleanSched(sc);
  const byId = new Map(placed.map((p) => [p.id, p]));
  const day = new Map();
  for (const it of items) {
    const p = byId.get(it.id), d = local(c, p.when);
    assert.ok([0, 2, 4, 5, 6].includes(d.getUTCDay()), 'đúng thứ');
    assert.ok(['19:00', '21:30'].includes(d.toISOString().slice(11, 16)), 'đúng giờ');
    assert.notStrictEqual(d.toISOString().slice(0, 10), '2027-01-01', 'ngày nghỉ');
    assert.strictEqual(p.venue, 'Sân ' + it.a, 'đá trên sân nhà đội chủ nhà');
    for (const u of [it.a, it.b]) {
      const k = u + d.toISOString().slice(0, 10);
      assert.ok(!day.has(k), `${u} đá 2 trận một ngày`);
      day.set(k, 1);
    }
  }
  // Lượt sau của một đội không đá trước lượt trước
  const last = new Map();
  for (const it of items) for (const u of [it.a, it.b]) { const w = byId.get(it.id).when; assert.ok(!last.has(u) || last.get(u) < w); last.set(u, w); }
  assert.deepStrictEqual(SC.conflicts(items.map((it) => ({ ...it, ...byId.get(it.id) })), (w) => Math.floor(w / DAY)), []);
});

test('Sân chung: mỗi giờ tối đa số sân, nghỉ tối thiểu giữa hai trận; loại trực tiếp đấu theo vòng', () => {
  const seeds = ids(8), seedOf = (u) => seeds.indexOf(u) + 1;
  const [rr, ko] = ST.normalizeStages([{ type: 'roundrobin', groups: 2, advance: 2 }, { type: 'single', thirdPlace: true }], { offline: true });
  const st0 = ST.buildStage(rr, 0, seeds, { seedOf, groups: 2 });
  const st1 = ST.buildStage(ko, 1, seeds.slice(0, 4), { seedOf });
  const items = [...stageItems(st0, 0), ...stageItems(st1, 1)];
  assert.strictEqual(items.length, 12 + 4, '12 trận vòng bảng + 2 bán kết, chung kết, tranh hạng ba');
  const sc = { start: '2026-11-07', days: [6], times: ['08:00', '10:00'], venues: ['Sân 1', 'Sân 2'], rest: 6 };
  const { placed } = SC.autoSchedule(items, sc);
  const at = new Map(placed.map((p) => [p.id, p]));
  const slot = new Map();
  for (const p of placed) { const k = p.when; slot.set(k, (slot.get(k) || 0) + 1); }
  assert.ok([...slot.values()].every((n) => n <= 2), 'tối đa 2 trận mỗi giờ (2 sân)');
  // Nghỉ 6 ngày + chỉ thứ 7: mỗi đội 1 trận / tuần
  const weeks = new Map();
  for (const it of stageItems(st0, 0)) for (const u of [it.a, it.b]) { const k = u + Math.floor(at.get(it.id).when / (7 * DAY)); assert.ok(!weeks.has(k)); weeks.set(k, 1); }
  const lastRR = Math.max(...stageItems(st0, 0).map((it) => at.get(it.id).when));
  const semis = st1.rounds[0].map((id) => at.get(id).when), final = at.get(st1.rounds[1][0]).when, third = at.get(st1.third).when;
  assert.ok(semis.every((w) => w > lastRR + 6 * DAY), 'loại trực tiếp sau vòng bảng');
  assert.ok(final > Math.max(...semis) + 6 * DAY && third > Math.max(...semis), 'chung kết sau bán kết');
});

test('Giữ trận đã có giờ, đá bù tìm ô trống, cảnh báo trùng lịch', () => {
  const items = [
    { id: 'm1', a: 'x', b: 'y', stage: 0, lvl: 0, when: Date.UTC(2026, 10, 7, 12), venue: 'S', keep: true },
    { id: 'm2', a: 'x', b: 'z', stage: 0, lvl: 1 },
    { id: 'm3', a: 'y', b: 'z', stage: 0, lvl: 1 },
  ];
  const sc = { start: '2026-11-07', times: ['12:00'], venues: ['S'] };
  const r = SC.autoSchedule(items, sc);
  assert.deepStrictEqual(r.placed.map((p) => [p.id, new Date(p.when).toISOString().slice(0, 13)]), [['m2', '2026-11-08T12'], ['m3', '2026-11-09T12']]);
  // Đá bù m3 từ 10/11: ô sớm nhất 11/11
  items[1].when = r.placed[0].when;
  const got = SC.findSlot(items, sc, 'm3', Date.UTC(2026, 10, 10, 5));
  assert.strictEqual(new Date(got.when).toISOString().slice(0, 10), '2026-11-11');
  assert.strictEqual(SC.findSlot(items, sc, 'nope', 0), null);
  const cf = SC.conflicts([{ id: 'a', a: 'x', b: 'y', when: 100, venue: 'S' }, { id: 'b', a: 'x', b: 'z', when: 200, venue: 'S' }, { id: 'c', a: 'q', b: 'w', when: 100, venue: 'S' }, { id: 'd', a: 'q', b: 'r' }], () => 0);
  // x đá 2 trận cùng ngày; sân S có 2 trận cùng giờ; trận chưa có giờ (d) bỏ qua
  assert.deepStrictEqual(cf.map((x) => [x.kind, x.who, x.ids]), [['team', 'x', ['a', 'b']], ['venue', 'S', ['a', 'c']]]);
});

test('Máy chủ: xếp lịch, dời lượt, hoãn + đá bù, xoá lịch, sân nhà, tự xếp giai đoạn sau', async () => {
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Giải lịch', spec: { sport: 'football', stages: [{ type: 'roundrobin', groups: 1, advance: 2 }, { type: 'single', thirdPlace: false }] }, teams: teams(4) }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otTeamHome', id, team: t.players[0].uid, home: 'Sân <Thống Nhất>' });
  await until(() => t.players[0].home === 'Sân Thống Nhất');
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const ms = () => Object.values(t.st[0].matches);
  const start = new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10);
  org.send({ t: 'otSchedAuto', id, sched: { start, times: ['18:00', '20:00'], venues: 'Sân 1, Sân 2', auto: true, tz: 0 }, mode: 'empty' });
  await until(() => ms().every((m) => m.when));
  assert.ok(t.sched.auto && ms().every((m) => ['Sân 1', 'Sân 2'].includes(m.venue)));
  const seen = await org.req({ t: 'otGet', id }, 'ot');
  assert.strictEqual(seen.tour.sched.venues.length, 2, 'trang giải nhận cấu hình lịch');
  assert.strictEqual(seen.tour.players[0].home, 'Sân Thống Nhất');
  // Dời lượt 1 thêm 7 ngày
  const r0 = t.st[0].groups[0].rounds[0].map((x) => t.st[0].matches[x]);
  const before = r0.map((m) => m.when);
  org.send({ t: 'otSchedShift', id, stage: 0, round: 0, days: 7 });
  await until(() => r0[0].when === before[0] + 7 * DAY);
  assert.deepStrictEqual(r0.map((m) => m.when), before.map((w) => w + 7 * DAY));
  assert.strictEqual((await org.req({ t: 'otSchedShift', id, stage: 0, round: 9, days: 1 }, 'error')).code, 'ot_sched_nothing');
  // Hoãn rồi đá bù
  const m = r0[0];
  org.send({ t: 'otPostpone', id, match: m.id });
  await until(() => m.postponed && m.when === null);
  const view = await org.req({ t: 'otGet', id }, 'ot');
  assert.ok(view.tour.stageViews[0].groups[0].rounds[0].some((x) => x.postponed), 'trang giải thấy trận hoãn');
  org.send({ t: 'otMakeup', id, match: m.id });
  await until(() => !m.postponed && m.when);
  assert.ok(m.when > Date.now());
  // Xoá lịch rồi xếp lại toàn bộ
  org.send({ t: 'otSchedClear', id });
  await until(() => ms().every((x) => !x.when));
  org.send({ t: 'otSchedAuto', id, sched: t.sched, mode: 'all' });
  await until(() => ms().every((x) => x.when));
  // Đấu hết vòng bảng → giai đoạn sau tự xếp lịch (auto)
  for (const x of ms()) {
    org.send({ t: 'otScore', id, match: x.id, score: [1, 0] });
    await until(() => x.done);
  }
  await until(() => t.st[1]);
  assert.ok(t.st[1].rounds[0].every((x) => t.st[1].matches[x].when > Date.now()), 'bán kết đã có giờ');
  assert.strictEqual((await org.req({ t: 'otMakeup', id, match: 's0g0r0m0' }, 'error')).code, 'tour_match_done');
});

test('Thứ tự đấu (mức) của nhánh thắng – thua, Thụy Sĩ, playoff có play-in', () => {
  const seeds = ids(8), seedOf = (u) => seeds.indexOf(u) + 1;
  const [dbl] = ST.normalizeStages([{ type: 'double', gf: '2' }], { offline: true });
  const d = stageItems(ST.buildStage(dbl, 0, seeds, { seedOf }), 0);
  const lv = (it) => it.lvl;
  // Nhánh thắng vòng r: mức 2r; nhánh thua vòng 0: 1, vòng j ≥ 1: j + 2; chung kết tổng sau cùng
  assert.deepStrictEqual(d.map((it) => it.id.slice(2) + ':' + lv(it)).join(' '),
    'w0m0:0 w0m1:0 w0m2:0 w0m3:0 l0m0:1 l0m1:1 w1m0:2 w1m1:2 l1m0:3 l1m1:3 w2m0:4 l2m0:4 l3m0:5 gf1:6 gf2:7');
  assert.ok(d.every((it) => it.seq));
  const [sw] = ST.normalizeStages([{ type: 'swiss', rounds: 3 }], { offline: true });
  const s = stageItems(ST.buildStage(sw, 0, seeds, { seedOf, isActive: () => true }), 0);
  assert.deepStrictEqual([s.length, s.every((it) => it.lvl === 0 && it.seq)], [4, true], 'Thụy Sĩ: vòng đã bốc thăm');
  // Playoff có play-in (stages-playoff.js): cặp đầu mức 0, trận quyết định mức 1, vòng 1 nhánh chính mức 2
  const st = { type: 'single', matches: { p0: { id: 'p0', a: 'x', b: 'y', tag: 'pi_78' }, p1: { id: 'p1', a: null, b: null, tag: 'pi_last' }, w: { id: 'w', a: 'z', b: null } }, pre: ['p0', 'p1'], rounds: [['w']] };
  assert.deepStrictEqual(stageItems(st, 1).map((it) => [it.id, it.lvl, it.stage]), [['p0', 0, 1], ['p1', 1, 1], ['w', 2, 1]]);
  assert.deepStrictEqual(stageItems({ type: 'race', events: [] }, 0), []);
});

test('Thụy Sĩ: vòng mới bốc thăm trong lúc đấu cũng được tự xếp lịch', async () => {
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Thụy Sĩ có lịch', spec: { sport: 'football', stages: [{ type: 'swiss', rounds: 3 }] }, teams: teams(4) }, 'otCreated');
  const t = ctx.app.hub.otGet(id);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const start = new Date(Date.now() + DAY).toISOString().slice(0, 10);
  org.send({ t: 'otSchedAuto', id, sched: { start, times: ['18:00'], auto: true, tz: 0 }, mode: 'empty' });
  await until(() => Object.values(t.st[0].matches).every((m) => m.when));
  for (const mid of t.st[0].rounds[0]) {
    const m = t.st[0].matches[mid];
    if (m.done) continue;
    org.send({ t: 'otScore', id, match: m.id, score: [1, 0] });
    await until(() => m.done);
  }
  await until(() => t.st[0].rounds.length === 2);
  const r1 = t.st[0].rounds[1].map((x) => t.st[0].matches[x]).filter((m) => !m.bye);
  const last0 = Math.max(...t.st[0].rounds[0].map((x) => t.st[0].matches[x].when || 0));
  assert.ok(r1.length && r1.every((m) => m.when > Date.now() && m.when >= last0), 'vòng 2 có giờ, sau vòng 1');
});
