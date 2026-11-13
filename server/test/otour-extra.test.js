/*
 * Đợt 26 – Nordic combined (nhảy cầu tính điểm → đuổi bắt đổi điểm thua ra giây), "assist" của Backyard Ultra, phiên draft kiểu
 * Magic: The Gathering (bốc ghế, chiều chuyền gói, vòng đầu ghép đối diện bàn, danh sách bài). Chỉ mô phỏng thể thức.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const Race = require('../src/hub/stages-race.js');
const PUR = require('../src/hub/stages-pursuit.js');
const DRF = require('../src/hub/stages-draft.js');
const E = require('../../caro/tour-estimate.js');
const TP = require('../../caro/otour-templates.js');
const IO = require('../../caro/otour-spec-io.js');
const { SPORTS } = require('../../caro/otour-sports.js');
const { until } = require('./otour-client.js');
const { startTpl, resultFor } = require('./otour-tplrun.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const ids = (n) => Array.from({ length: n }, (_, i) => 'u' + (i + 1));
const seedOf = (u) => Number(u.slice(1));
const side = (u) => ({ uid: u, name: u });

test('Nhảy cầu: tổng điểm các lượt, một chữ số thập phân, bỏ trống = không nhảy, dnf / dsq xếp cuối; điểm ngoài khoảng bị từ chối', () => {
  const [c] = off([{ type: 'race', score: 'skijump', events: 2 }]);
  assert.strictEqual(c.events, 2);
  assert.strictEqual(off([{ type: 'race', score: 'skijump', events: 9 }])[0].events, 4);
  const st = ST.buildStage(c, 0, ['a', 'b', 'c', 'd'], {});
  assert.deepStrictEqual(Race.cleanEvent(st, [{ uid: 'a', pts: 301 }], st.entrants, 0), { code: 'ot_sj_pts', args: { n: 300 } });
  const rec = (i, rows) => { const r = Race.cleanEvent(st, rows, st.entrants, i); assert.ok(!r.code, JSON.stringify(r)); Race.recordEvent(st, i, r.rows); };
  rec(0, [{ uid: 'a', pts: 120.5 }, { uid: 'b', pts: '118.25' }, { uid: 'c', pts: '' }, { uid: 'd', dsq: true }]);
  rec(1, [{ uid: 'a', pts: 100 }, { uid: 'b', pts: 103 }, { uid: 'c', pts: 130 }]);
  assert.ok(st.done);
  const v = Race.raceView(st, 0, 0, side, () => 0);
  // b: 118.3 (làm tròn 1 chữ số) + 103 = 221.3 > a: 220.5; c chỉ nhảy lượt 2 (130); d truất quyền
  assert.deepStrictEqual(v.table.map((x) => [x.name, x.total]), [['b', 221.3], ['a', 220.5], ['c', 130], ['d', null]]);
  assert.ok(v.table[3].dsq && v.jump);
});

test('Đuổi bắt sau nhảy cầu: mỗi điểm thua = perPoint giây (Gundersen 4 giây), người không có điểm xuất phát sau cùng', () => {
  const [, p] = off([{ type: 'race', score: 'skijump' }, { type: 'race', score: 'pursuit', pursuit: { wave: 0, perPoint: 4 } }]);
  assert.deepStrictEqual(p.pursuit, { wave: 0, perPoint: 4 });
  assert.strictEqual(off([{ type: 'race', score: 'pursuit', pursuit: { perPoint: 999 } }])[0].pursuit.perPoint, 4);
  const tables = [{ list: ['a', 'b', 'c', 'd'], stats: { a: { jump: 130 }, b: { jump: 127.5 }, c: { jump: 110 }, d: { jump: null } } }];
  const st = ST.buildStage(p, 1, ['a', 'b', 'c', 'd'], {});
  PUR.attachGaps(st, tables, ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(st.gaps, { a: 0, b: 10000, c: 80000, d: 80000 });
  assert.strictEqual(st.gapsBy, 'jump');
  const v = Race.raceView(st, 1, 0, side, () => 0);
  assert.ok(v.pursuit.byJump);
  assert.deepStrictEqual(v.pursuit.start.map((x) => [x.uid, x.start, !!x.wave]), [['a', 0, false], ['b', 10000, false], ['c', 80000, false], ['d', 80000, false]], 'wave 0: không xuất phát đồng loạt');
  // Sau giai đoạn tính giờ vẫn như cũ
  PUR.attachGaps(st, [{ list: ['a', 'b'], stats: { a: { time: 1000, fin: 1 }, b: { time: 4000, fin: 1 } } }], ['a', 'b']);
  assert.deepStrictEqual([st.gaps, st.gapsBy], [{ a: 0, b: 3000 }, 'time']);
});

test('Backyard Ultra: assist là người dừng ở vòng mà chỉ còn nhà vô địch về kịp; không có nhà vô địch thì không có assist', () => {
  const [c] = off([{ type: 'race', score: 'backyard' }]);
  const run = (yards) => {
    const st = ST.buildStage(c, 0, ['a', 'b', 'c', 'd'], {});
    for (const done of yards) {
      const i = st.events.findIndex((e) => !e.done);
      const r = Race.cleanEvent(st, done.length ? done.map((u) => ({ uid: u, done: true })) : [{ uid: 'a', done: false }], st.entrants, i);
      assert.ok(!r.code, JSON.stringify(r));
      Race.recordEvent(st, i, r.rows);
    }
    return Race.raceView(st, 0, 0, side, () => 0).table;
  };
  const t1 = run([['a', 'b', 'c', 'd'], ['a', 'b', 'c'], ['a'], ['a']]);
  assert.deepStrictEqual(t1.filter((x) => x.assist).map((x) => x.name), ['b', 'c']);
  assert.ok(t1[0].champ && !t1[0].assist && !t1.find((x) => x.name === 'd').assist);
  const t2 = run([['a', 'b'], ['a'], []]);
  assert.ok(!t2.some((x) => x.assist || x.champ), 'chạy một mình không xong: không vô địch, không assist');
});

test('Draft kiểu Magic: bốc ghế mỗi pod (giữ đúng người trong pod), chiều chuyền gói trái / phải, vòng đầu ghép đối diện bàn', () => {
  const [c, d] = off([{ type: 'swiss', rounds: 6, pod: { size: 8, rounds: 3 }, draft: { packs: 3, decklist: true }, advance: 8 }, { type: 'single', draft: {} }]);
  assert.deepStrictEqual(c.draft, { packs: 3, pass: ['left', 'right', 'left'], decklist: true, min: 40, cross: true });
  assert.strictEqual(d.draft.cross, false);
  assert.strictEqual(off([{ type: 'swiss', rounds: 5, draft: { packs: 3 } }])[0].draft, undefined, 'Thụy Sĩ không có pod: không draft');
  assert.strictEqual(off([{ type: 'swiss', rounds: 6, pod: { size: 8, rounds: 3 }, draft: { packs: 9 } }])[0].draft.packs, 5);
  const st = ST.buildStage(c, 0, ids(16), { seedOf });
  const D0 = st.drafts[0];
  assert.deepStrictEqual(D0.pods.map((p) => [...p].sort((a, b) => seedOf(a) - seedOf(b))), [ids(8), ids(16).slice(8)], 'ghế là hoán vị của đúng pod');
  for (const [k, p] of D0.pods.entries()) {
    const ms = st.rounds[0].map((id) => st.matches[id]).filter((m) => p.includes(m.a));
    assert.deepStrictEqual(ms.map((m) => [p.indexOf(m.a), p.indexOf(m.b)]), [[0, 4], [1, 5], [2, 6], [3, 7]], `pod ${k + 1}: ghế 1 gặp ghế 5…`);
  }
  // Thiếu danh sách bài: không nhập kết quả được; nộp đủ thì được
  const m = st.matches[st.rounds[0][0]];
  assert.ok(DRF.deckMissing(st, m));
  assert.deepStrictEqual(DRF.submitDeck(st, m.a, '17 Island\n22 Plains'), { code: 'ot_deck_small', args: { n: 40 } });
  assert.strictEqual(DRF.submitDeck(st, m.a, '17 Island\n23 Plains\nSideboard\n15 Mountain'), null);
  assert.strictEqual(DRF.submitDeck(st, m.b, '40 Plains'), null);
  assert.ok(!DRF.deckMissing(st, m));
  assert.strictEqual(DRF.submitDeck(st, 'x', '40 Plains'), 'ot_deck_none');
  assert.strictEqual(DRF.countCards('// main\n4x Lightning Bolt\nForest\n\n2 Shock'), 7);
  const v = DRF.view(st, side);
  assert.strictEqual(v.pods[0].find((x) => x.uid === m.a).deck, 40, 'chỉ lưu số lá');
  assert.ok(!JSON.stringify(st.drafts).includes('Island'), 'không lưu nội dung danh sách bài');
});

test('Draft: phiên mới mỗi khối vòng (pod đổi theo bảng xếp hạng, bốc ghế lại), Top 8 draft lại', () => {
  const [c] = off([{ type: 'swiss', rounds: 6, pod: { size: 8, rounds: 3 }, draft: { packs: 3 } }]);
  const st = ST.buildStage(c, 0, ids(16), { seedOf });
  for (let g = 0; !st.done && g < 10; g++) for (const m of ST.playable(st)) ST.recordResult(st, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b, { seedOf });
  assert.ok(st.done);
  assert.strictEqual(st.drafts.length, 2);
  assert.strictEqual(DRF.curBlock(st), 1);
  const p1 = st.drafts[1].pods.map((p) => [...p].sort().join());
  assert.deepStrictEqual(p1, st.podHist[1].map((p) => [...p].sort().join()));
  const [s] = off([{ type: 'single', draft: { packs: 3 } }]);
  const top = ST.buildStage(s, 1, ids(8), {});
  DRF.seatStage(top);
  assert.deepStrictEqual([...top.drafts[0].pods[0]].sort(), [...ids(8)].sort());
});

test('Các mẫu qua máy chủ: Nordic combined (khoảng thua theo điểm nhảy), MTG có draft (nộp danh sách bài qua otDeck)', async () => {
  {
    const { org, t, id, so } = await startTpl('nordic_combined');
    for (let g = 0; t.status === 'running' && g < 10; g++) {
      const st = t.st[t.stage], ev = st.events.find((e) => !e.done);
      const rows = st.cfg.score === 'skijump' ? st.entrants.map((uid) => ({ uid, pts: 140 - so(uid) * 0.5 })) : [...st.entrants].sort((a, b) => so(a) - so(b)).map((uid, k) => ({ uid, rank: k + 1 }));
      org.send({ t: 'otRace', id, event: ev.i, rows });
      await until(() => ev.done || t.status !== 'running', 8000);
    }
    assert.strictEqual(t.status, 'finished');
    assert.strictEqual(t.st[1].gapsBy, 'jump');
    assert.strictEqual(t.st[1].gaps[t.players[1].uid], 2000, 'hạt giống 2 thua 0,5 điểm = 2 giây');
    org.close();
  }
  {
    const { org, t, id, so } = await startTpl('mtg_gp');
    const st = t.st[0], m = st.matches[st.rounds[0][0]];
    const bad = await org.req({ t: 'otScore', id, match: m.id, sets: [[2, 0]] }, 'error');
    assert.strictEqual(bad.code, 'ot_deck_missing');
    const small = await org.req({ t: 'otDeck', id, uid: m.a, list: '10 Island' }, 'error');
    assert.strictEqual(small.code, 'ot_deck_small');
    // Đấu từng trận; trước mỗi trận nộp danh sách bài còn thiếu của phiên draft hiện tại
    for (let g = 0; t.status === 'running' && g < 200; g++) {
      const cur = t.st[t.stage], list = ST.playable(cur);
      if (!list.length) break;
      for (const x of list) {
        const b = DRF.curBlock(cur);
        for (const u of [x.a, x.b]) if (!cur.drafts[b].decks[u]) { org.send({ t: 'otDeck', id, uid: u, list: '40 Plains' }); await until(() => !!cur.drafts[b].decks[u]); }
        org.send({ t: 'otScore', id, match: x.id, ...resultFor(t, cur, x, so) });
        await until(() => x.done || t.st[t.stage] !== cur || t.status !== 'running');
      }
    }
    assert.strictEqual(t.status, 'finished');
    assert.strictEqual(t.st[0].drafts.length, 2);
    assert.ok(t.st[1].drafts && t.st[1].drafts[0].pods[0].length === 8, 'Top 8 draft lại');
    const v = (await org.req({ t: 'otGet', id }, 'ot', (x) => x.id === id && x.tour)).tour.stageViews[1];
    assert.strictEqual(v.draft.pods[0].length, 8);
    org.close();
  }
});

test('Mô tả + ước tính', () => {
  const T = (k, a) => k + (a ? ' ' + Object.values(a).join(' ') : '');
  const d = (tid) => IO.describeSpec(TP.specOf(TP.byId(tid), SPORTS), T).join(' ');
  assert.match(d('nordic_combined'), /ds_skijump 1.*ds_pursuit_nowave 0, ds_pu_per 4/);
  assert.match(d('mtg_gp'), /ds_mtg 3 ds_mtg_deck.*ds_mtg_top 3/);
  assert.strictEqual(E.estimate({ players: 50, stages: [{ type: 'race', score: 'skijump', events: 2 }] }).stages[0].matches, 2);
});
