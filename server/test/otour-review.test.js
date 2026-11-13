/*
 * Bài thử cho các lỗi tìm được khi soát lại đợt 19–26 (giải offline – chỉ mô phỏng thể thức):
 *   - huỷ kết quả bị khoá thì giai đoạn giữ nguyên (trước đây đã bỏ người khỏi trận sau rồi mới báo khoá);
 *   - vòng vớt Olympic: huỷ chung kết không bị khoá vì trận vớt đã có kết quả;
 *   - loại trực tiếp dựng từng vòng (Shoot Out): huỷ rồi nhập lại thì bốc thăm lại đúng như cũ; bounty 'inherit' trả hạt giống;
 *   - pod Thụy Sĩ (MTG): nhiều pod cùng lẻ người (có người rút) thì không ai bị bỏ sót khỏi vòng.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const P = require('../src/hub/stages-pairing.js');
const { until } = require('./otour-client.js');
const { startTpl, resultFor } = require('./otour-tplrun.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const uids = (n) => Array.from({ length: n }, (_, i) => 'u' + i);
const seedOf = (u) => Number(u.slice(1)) + 1;
const win = (st, m, w) => ST.recordResult(st, m, w, { seedOf });
const hi = (m) => (seedOf(m.a) < seedOf(m.b) ? m.a : m.b);

test('Vòng vớt: huỷ bán kết bị khoá thì giai đoạn giữ nguyên; huỷ chung kết vẫn được khi trận vớt đã có kết quả', async () => {
  const { org, t, id, so } = await startTpl('judo_rep');
  // Đấu tới khi có nhánh vớt, nhập một trận vớt, chưa nhập chung kết
  const st0 = t.st[0];
  for (let g = 0; !st0.rep && g < 40; g++) {
    const m = ST.playable(st0).find((x) => x.rep == null && !x.final);
    if (!m) break;
    org.send({ t: 'otScore', id, match: m.id, ...resultFor(t, st0, m, so) });
    await until(() => m.done);
  }
  assert.ok(st0.rep, 'xong hai bán kết: có nhánh vớt');
  const rm = ST.playable(st0).find((x) => x.rep != null);
  org.send({ t: 'otScore', id, match: rm.id, ...resultFor(t, st0, rm, so) });
  await until(() => rm.done);
  const R = st0.rounds.length, sf = st0.matches[st0.rounds[R - 2][0]], fin = st0.matches[st0.rounds[R - 1][0]];
  const slot = sf.next.slot, before = fin[slot];
  const locked = await org.req({ t: 'otUndo', id, match: sf.id }, 'error');
  assert.strictEqual(locked.code, 'tour_undo_locked', 'bán kết: nhánh vớt đã có kết quả');
  const st = t.st[0];
  assert.strictEqual(st.matches[fin.id][slot], before, 'người thắng bán kết vẫn ở chung kết (không bị xoá dở)');
  assert.ok(st.matches[sf.id].done && st.rep, 'bán kết và nhánh vớt giữ nguyên');
  // Chung kết: nhập rồi huỷ được dù trận vớt đã có kết quả
  const F = st.matches[fin.id];
  org.send({ t: 'otScore', id, match: F.id, ...resultFor(t, st, F, so) });
  await until(() => F.done);
  org.send({ t: 'otUndo', id, match: F.id });
  await until(() => !F.done);
  assert.ok(st.rep && st.matches[rm.id].done, 'huỷ chung kết không đụng nhánh vớt');
  org.close();
});

test('Shoot Out: huỷ vòng trước (vòng sau chưa đấu) rồi nhập lại thì bốc thăm lại đúng như cũ (khớp hạt giống rng0)', () => {
  const [c] = off([{ type: 'knock', mode: 'shootout' }]);
  const st = ST.buildStage(c, 0, uids(16), { seedOf });
  for (const m of ST.playable(st)) win(st, m, hi(m));
  const draw1 = st.draws[1].map((p) => p.join('-')).join(' ');
  const m0 = st.matches[st.rounds[0][0]], w0 = m0.winner;
  assert.ok(require('../src/hub/stages-knock.js').beforeUndo(st, m0), 'vòng 2 chưa đấu: được huỷ');
  Object.assign(m0, { done: false, winner: null, loser: null });
  assert.strictEqual(st.rounds.length, 1);
  win(st, m0, w0);
  assert.strictEqual(st.draws[1].map((p) => p.join('-')).join(' '), draw1, 'bốc thăm vòng 2 như lần đầu');
});

test('BLAST Bounty "inherit": huỷ vòng 2 trả hạt giống hiện tại về như sau vòng 1', () => {
  const KN = require('../src/hub/stages-knock.js');
  const [c] = off([{ type: 'knock', mode: 'bounty', bounty: { seeding: 'inherit' } }]);
  const st = ST.buildStage(c, 0, uids(16), { seedOf });
  // Vòng 1: hạt giống thấp thắng (nhận hạt giống tốt hơn); vòng 2: hạt giống cao thắng
  for (const m of ST.playable(st)) win(st, m, seedOf(m.a) < seedOf(m.b) ? m.b : m.a);
  const after1 = { ...st.seedNow };
  for (const m of ST.playable(st)) win(st, m, hi(m));
  assert.strictEqual(st.rounds.length, 3);
  const m1 = st.matches[st.rounds[1][0]];
  assert.ok(KN.beforeUndo(st, m1));
  assert.deepStrictEqual(st.seedNow, after1, 'hạt giống như ngay sau vòng 1');
});

test('Pod Thụy Sĩ: có người rút giữa khối vòng làm nhiều pod cùng lẻ – người lẻ ghép với nhau, chỉ một người miễn đấu', () => {
  const mk = (n) => ({ cfg: { pod: { size: 8, rounds: 3 } }, entrants: uids(n), rounds: [] });
  const ctxOf = (order) => ({ order, played: new Set(), byes: {}, score: Object.fromEntries(order.map((u) => [u, 0])), seedIndex: seedOf, standings: () => ({ list: [...order] }) });
  // Vòng 1 chia pod (16 người: 2 pod 8), vòng 2 cùng khối: mỗi pod rút một người → hai pod 7 người
  const st = mk(16);
  P.pair(st, 0, ctxOf(uids(16)));
  const res = P.pair(st, 1, ctxOf(uids(16).filter((u) => u !== 'u3' && u !== 'u12')));
  const seen = res.pairs.flat();
  assert.strictEqual(new Set(seen).size, seen.length, 'không ai bị ghép hai lần');
  assert.strictEqual(seen.length, 14, '14 người đều có cặp');
  assert.strictEqual(res.bye, null);
  // 24 người (3 pod), mỗi pod rút một người: một người miễn đấu, còn lại đều có cặp
  const s3 = mk(24);
  P.pair(s3, 0, ctxOf(uids(24)));
  const r3 = P.pair(s3, 1, ctxOf(uids(24).filter((u) => !['u1', 'u9', 'u17'].includes(u))));
  assert.strictEqual(r3.pairs.flat().length + (r3.bye ? 1 : 0), 21, 'đủ 21 người');
  assert.ok(r3.bye);
  // Draft kiểu Magic (vòng đầu phiên ghép đối diện bàn): đủ cặp; phiên 2 có người rút ở hai pod → người lẻ vẫn có cặp
  const d = { ...mk(16), cfg: { pod: { size: 8, rounds: 3 }, draft: { packs: 3, cross: true } } };
  assert.strictEqual(P.pair(d, 0, ctxOf(uids(16))).pairs.length, 8, 'vòng 1: 8 cặp đối diện bàn');
  const r4 = P.pair(d, 3, ctxOf(uids(16).filter((u) => u !== 'u3' && u !== 'u12')));
  assert.deepStrictEqual([r4.pairs.flat().length, r4.bye], [14, null], 'phiên 2: 14 người đều có cặp');
});

test('Huỷ kết quả bị khoá ở playoff chặng (OWL) không làm mất playoff đã dựng', async () => {
  const { org, t, id, so } = await startTpl('owl_season');
  const st0 = t.st[0];
  // Đấu tới khi trận đầu của một playoff chặng có kết quả (chưa xong cả giai đoạn)
  const spDone = () => Object.values(st0.matches).some((m) => m.sp != null && m.done && !m.bye);
  for (let g = 0; !spDone() && g < 400; g++) {
    const m = ST.playable(st0).sort((x, y) => (y.sp != null) - (x.sp != null))[0];
    if (!m) break;
    org.send({ t: 'otScore', id, match: m.id, ...resultFor(t, st0, m, so) });
    await until(() => m.done);
  }
  assert.ok(st0.sp && Object.keys(st0.sp).length, 'có playoff chặng');
  const b = Number(Object.keys(st0.sp)[0]), ids = st0.sp[b].rounds.flat();
  const done = ids.map((x) => st0.matches[x]).find((m) => m.done && !m.bye);
  assert.ok(done, 'playoff chặng đã có trận xong');
  // Một trận vòng tròn của chặng đó: huỷ bị khoá (playoff chặng đã đấu) – playoff vẫn còn nguyên
  const main = Object.values(st0.matches).find((m) => m.sp == null && !m.tb && m.done && ST.SPL.blockOf(st0.cfg, m.round, st0.groups[0].rounds.length) === b);
  const err = await org.req({ t: 'otUndo', id, match: main.id }, 'error');
  assert.strictEqual(err.code, 'tour_undo_locked');
  assert.ok(t.st[0].sp[b] && t.st[0].matches[done.id].done, 'playoff chặng giữ nguyên');
  org.close();
});

test('Áp bản vá trên trang: trận vòng vớt và playoff chặng được cập nhật (caro/tour-patch.js – cùng các đường trận ở tourpush.js)', () => {
  const TourPatch = require('../../caro/tour-patch.js');
  const mk = (id, done) => ({ id, a: { uid: 'a' }, b: { uid: 'b' }, wa: done ? 1 : 0, wb: 0, done });
  const t = { stageViews: [{ index: 0, rounds: [[mk('m0', true)]], rep: [{ fin: { uid: 'a' }, rounds: [[mk('rp0', false)], [mk('rpb', false)]] }], splits: [{ b: 0, rounds: [[mk('sp0', false)]] }] }] };
  const ok = TourPatch.apply(t, { stages: [{ index: 0, matches: [mk('rp0', true), mk('rpb', true), mk('sp0', true)] }] });
  assert.ok(ok);
  const v = t.stageViews[0];
  assert.deepStrictEqual([v.rep[0].rounds[0][0].done, v.rep[0].rounds[1][0].done, v.splits[0].rounds[0][0].done], [true, true, true]);
});

test('Bridge: thang VP khớp bảng chính thức "WBF Continuous VP Scale" (làm tròn rồi chỉnh để mức tăng mỗi IMP không lớn dần)', () => {
  const BR = require('../../caro/otour-bridge.js');
  // Một số ô của bảng chính thức (12 / 14 / 16 ván) – công thức chỉ làm tròn lệch 0,01 ở các ô có dấu *
  const cells = [[16, 1, 1031], [16, 14, 1375], [16, 27, 1626], [16, 38, 1785], [16, 49, 1907], [16, 59, 1993], [16, 60, 2000],
    [14, 8, 1244], [14, 36, 1791], [14, 56, 1999], [14, 57, 2000], [12, 1, 1036], [12, 42, 1902], [12, 52, 2000]];
  for (const [b, m, want] of cells) assert.strictEqual(BR.vpWbf(m, b), want, `${b} ván, chênh ${m} IMP`);
  // Mọi số ván: tăng dần, mức tăng không lớn dần, chạm 20,00 rồi giữ nguyên
  for (let b = 1; b <= BR.MAX_BOARDS; b++) {
    let prev = 1000, step = Infinity;
    for (let m = 1; m < 400; m++) {
      const v = BR.vpWbf(m, b);
      assert.ok(v >= prev && v - prev <= step && v <= 2000, `${b} ván, ${m} IMP`);
      if (v < 2000) step = v - prev;
      prev = v;
    }
    assert.strictEqual(prev, 2000);
  }
});
