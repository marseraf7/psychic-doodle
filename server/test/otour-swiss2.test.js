/*
 * Đợt 21 – các cách ghép cặp Thụy Sĩ mới (stages-pairing.js) và cắt theo số thua (chỉ mô phỏng thể thức):
 *   Monrad / Danish / tăng tốc Baku, ghi đè theo vòng; King of the Hill + Gibsonization (Scrabble);
 *   cắt X-2 kiểu Pokémon VGC + chỉ số phụ tỉ lệ thắng của đối thủ (oppWinPct / oppOppWinPct).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const P = require('../src/hub/stages-pairing.js');
const E = require('../../caro/tour-estimate.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const uids = (n) => Array.from({ length: n }, (_, i) => 'u' + i);
const seedOf = (u) => Number(u.slice(1)) + 1;
const win = (st, m, w) => ST.recordResult(st, m, w, { seedOf });
const pairsOf = (st, r) => st.rounds[r].map((id) => st.matches[id]).filter((m) => !m.bye).map((m) => [m.a, m.b].map(seedOf).sort((a, b) => a - b));
const swiss = (cfg, n) => { const [c] = off([{ type: 'swiss', ...cfg }, { type: 'single' }]); return ST.buildStage(c, 0, uids(n), { seedOf }); };
/** Đấu xong vòng hiện tại: hạt giống cao thắng (hoặc theo pick). */
function playRound(st, pick = (m) => (seedOf(m.a) < seedOf(m.b) ? m.a : m.b)) {
  const r = st.rounds.length - 1;
  for (const id of st.rounds[r]) { const m = st.matches[id]; if (!m.done) win(st, m, pick(m)); }
}

test('Chuẩn hoá: Monrad / Danish / Baku chỉ ở giải offline; ghi đè theo vòng; lịch điểm ảo mặc định FIDE 9 vòng', () => {
  assert.strictEqual(ST.normalizeStages([{ type: 'swiss', pairing: 'monrad' }, { type: 'single' }])[0].pairing, 'dutch');
  const [b] = off([{ type: 'swiss', rounds: 9, pairing: 'baku' }, { type: 'single' }]);
  assert.deepStrictEqual(b.baku.virtual, [{ from: 1, to: 3, pts: 1 }, { from: 4, to: 5, pts: 0.5 }]);
  assert.deepStrictEqual([0, 2, 3, 4, 5].map((r) => P.bakuPoints(b, r)), [1, 1, 0.5, 0.5, 0]);
  const [d] = off([{ type: 'swiss', rounds: 5, pairingByRound: ['dutch', 'dutch', 'dutch', 'dutch', 'danish'] }, { type: 'single' }]);
  assert.deepStrictEqual([0, 4].map((r) => P.modeOf(d, r)), ['dutch', 'danish']);
  assert.strictEqual(off([{ type: 'swiss', record: { win: 3, lose: 3 }, pairing: 'monrad' }, { type: 'single' }])[0].pairing, 'dutch', 'Thụy Sĩ theo thắng / thua giữ cách ghép riêng');
});

test('Monrad: ghép thẳng 1–2, 3–4 theo bảng xếp hạng; cặp đã gặp thì hoán đổi tối thiểu', () => {
  const st = swiss({ rounds: 4, pairing: 'monrad' }, 8);
  assert.deepStrictEqual(pairsOf(st, 0), [[1, 2], [3, 4], [5, 6], [7, 8]], 'vòng 1: thứ tự hạt giống');
  playRound(st);
  // Sau vòng 1: 1, 3, 5, 7 thắng (cùng điểm) → 1–3, 5–7; 2, 4, 6, 8 → 2–4, 6–8
  assert.deepStrictEqual(pairsOf(st, 1), [[1, 3], [5, 7], [2, 4], [6, 8]]);
  playRound(st);
  // Không gặp lại ai
  const seen = new Set();
  for (let r = 0; r < st.rounds.length; r++) for (const p of pairsOf(st, r)) { assert.ok(!seen.has(p.join()), 'không gặp lại: ' + p); seen.add(p.join()); }
});

test('Danish vòng cuối: hạng 1 gặp hạng 2 dù đã gặp nhau; ghi đè theo vòng giữ Hà Lan cho các vòng trước', () => {
  const st = swiss({ rounds: 3, pairingByRound: ['dutch', 'dutch', 'danish'] }, 4);
  playRound(st); playRound(st);
  // Sau 2 vòng (Hà Lan, hạt giống cao thắng): u0 2 điểm, u1 / u2 1 điểm…; vòng 3 Danish: 1–2, 3–4 theo bảng xếp hạng
  const list = ST.standings(st, seedOf)[0].list;
  const r2 = st.rounds[2].map((id) => st.matches[id]).map((m) => [m.a, m.b]);
  assert.deepStrictEqual(r2, [[list[0], list[1]], [list[2], list[3]]]);
  const met = st.rounds.slice(0, 2).flat().map((id) => st.matches[id]).some((m) => [m.a, m.b].sort().join() === [list[0], list[1]].sort().join());
  assert.ok(met, 'cặp 1–2 vòng cuối đã gặp nhau trước đó (Danish cho gặp lại)');
});

test('Baku (32 người, 9 vòng): vòng 1 hạng 17 không gặp hạng 1; điểm ảo không lọt vào điểm thật / chỉ số phụ', () => {
  const st = swiss({ rounds: 9, pairing: 'baku', tiebreaks: ['bh', 'sb'] }, 32);
  const p0 = pairsOf(st, 0);
  assert.ok(!p0.some((p) => p[0] === 1 && p[1] === 17), 'không ghép 1–17 như Hà Lan thuần');
  assert.ok(p0.every((p) => (p[0] <= 16) === (p[1] <= 16)), 'vòng 1: GA gặp GA, GB gặp GB');
  playRound(st);
  const S = ST.standings(st, seedOf)[0].stats;
  assert.ok(Object.values(S).every((x) => x.pts === x.w * 3 + x.d), 'điểm thật = thắng × 3 + hoà (không có điểm ảo)');
  const plain = swiss({ rounds: 9, tiebreaks: ['bh', 'sb'] }, 32);
  for (const id of plain.rounds[0]) { const m = plain.matches[id]; win(plain, m, seedOf(m.a) < seedOf(m.b) ? m.a : m.b); }
  // Cùng kết quả thì cùng bảng điểm: chỉ cặp đấu khác nhau
  assert.strictEqual(Object.values(S).reduce((a, x) => a + x.pts, 0), Object.values(ST.standings(plain, seedOf)[0].stats).reduce((a, x) => a + x.pts, 0));
  assert.deepStrictEqual(st.pp, { r: 1, v: 1, ga: uids(16) }, 'vòng 2 (vừa ghép): vẫn +1 cho GA');
  for (let r = 1; r < 6; r++) { playRound(st); }
  assert.strictEqual(st.pp.v, 0, 'vòng 6: hết điểm ảo');
});

test('King of the Hill: các vòng cuối ghép thẳng 1–2, 3–4 theo bảng xếp hạng (cả khi đã gặp nhau)', () => {
  const st = swiss({ rounds: 4, koth: { rounds: 2 }, tiebreaks: ['gdiff'] }, 8);
  playRound(st); playRound(st);
  assert.strictEqual(P.modeOf(st.cfg, 2), 'koth');
  const list = ST.standings(st, seedOf)[0].list;
  assert.deepStrictEqual(st.rounds[2].map((id) => [st.matches[id].a, st.matches[id].b]), [[list[0], list[1]], [list[2], list[3]], [list[4], list[5]], [list[6], list[7]]]);
});

test('Gibsonization: người đã chắc suất (kể cả thua −swing mỗi trận còn lại) gặp người cao nhất đã hết cơ hội; lệch 1 điểm chênh lệch thì không', () => {
  const S = (pts, gw, gl) => ({ pts, gw, gl });
  const g = { spots: 1, swing: 1000 };
  // Còn 1 trận, thắng 2 điểm. A 10 điểm +500; B 8 điểm −1499: B tối đa 10 điểm, chênh lệch tối đa −499 < A tối thiểu −500? −499 > −500 → B vẫn vượt được
  const list = ['A', 'B', 'C', 'D'];
  const mk = (bSpread) => ({ A: S(10, 1500, 1000), B: S(8, 0, 1499 - bSpread), C: S(4, 0, 0), D: S(2, 0, 0) });
  assert.deepStrictEqual(P.gibsonSplit(list, mk(0), 1, 2, g).clinched, [], 'B −1499 + 1000 = −499 > A 500 − 1000 = −500: chưa chắc');
  const one = P.gibsonSplit(list, mk(-2), 1, 2, g);
  assert.deepStrictEqual(one.clinched, ['A'], 'B −1501 + 1000 = −501 < −500: A chắc hạng nhất');
  assert.deepStrictEqual(one.out, ['B', 'C', 'D'], 'A đã chắc hạng nhất: không ai khác còn cơ hội');
  // Trong giải (4 người, hạng nhất): u0 thắng 2 trận, chắc hạng nhất trước vòng cuối → gặp người cao nhất đã hết cơ hội
  const st = swiss({ rounds: 3, koth: { rounds: 1 }, gibson: { spots: 1, swing: 0 }, tiebreaks: ['gdiff'] }, 4);
  playRound(st); playRound(st);
  const L = ST.standings(st, seedOf)[0].list;
  assert.strictEqual(L[0], 'u0');
  assert.deepStrictEqual(st.gib, { u0: 2 });
  const gm = st.rounds[2].map((id) => st.matches[id]).find((m) => m.tag === 'gib');
  assert.deepStrictEqual([gm.a, gm.b], ['u0', L[1]], 'người chắc suất gặp người cao nhất đã hết cơ hội');
  // Hai suất (chung kết 2 người): chưa ai chắc suất sau 2 vòng → ghép thuần King of the Hill
  const s3 = swiss({ rounds: 3, koth: { rounds: 1 }, gibson: { spots: 2, swing: 1000 }, tiebreaks: ['gdiff'] }, 6);
  playRound(s3); playRound(s3);
  assert.ok(!s3.rounds[2].some((id) => s3.matches[id].tag === 'gib'));
  // Tắt Gibsonization: ghép thuần King of the Hill
  const s2 = swiss({ rounds: 3, koth: { rounds: 1 }, tiebreaks: ['gdiff'] }, 4);
  playRound(s2); playRound(s2);
  assert.ok(!s2.gib && !s2.rounds[2].some((id) => s2.matches[id].tag === 'gib'));
});

test('Cắt X-2 (kiểu VGC): mọi người thua ≤ 2 trận đi tiếp; 7–3 bị loại, 5–2 qua; nhánh sau miễn đấu đúng số', () => {
  const [c] = off([{ type: 'swiss', rounds: 3, advanceMode: 'record', cutLosses: 1, tiebreaks: ['oppWinPct', 'oppOppWinPct'] }, { type: 'single' }]);
  assert.deepStrictEqual([c.advanceMode, c.cutLosses], ['record', 1]);
  const st = ST.buildStage(c, 0, uids(16), { seedOf });
  for (let r = 0; r < 3; r++) { if (r) assert.ok(st.rounds.length === r + 1); playRound(st); }
  const S = ST.standings(st, seedOf)[0].stats;
  const adv = ST.advancers(st, seedOf).seeds;
  assert.ok(adv.length > 2 && adv.every((u) => S[u].l <= 1) && Object.keys(S).filter((u) => S[u].l <= 1).length === adv.length, 'đúng mọi người thua ≤ 1');
  // Nhánh sau: m người → 2^⌈log₂ m⌉ − m miễn đấu cho hạt giống cao
  const m = adv.length, B = 2 ** Math.ceil(Math.log2(m));
  const ko = ST.buildStage({ type: 'single', bestOf: 1, thirdPlace: false }, 1, adv, { seedOf });
  assert.strictEqual(ko.rounds[0].map((id) => ko.matches[id]).filter((x) => !x.bye).length, m - B / 2);
  // Chỉ số phụ tỉ lệ thắng của đối thủ: phần trăm, tối thiểu 25% mỗi đối thủ
  assert.ok(Object.values(S).every((x) => x.oppWinPct >= 25 && x.oppWinPct <= 100));
  assert.ok(ST.TIEBREAKS.includes('oppWinPct') && ST.TIEBREAKS.includes('oppOppWinPct'));
});

test('Cắt X-2: công thức miễn đấu khi 26 / 17 / 16 người qua cắt', () => {
  for (const [m, byes, first] of [[26, 6, 10], [17, 15, 1], [16, 0, 8]]) {
    const ko = ST.buildStage({ type: 'single', bestOf: 1, thirdPlace: false }, 1, uids(m), { seedOf });
    const r0 = ko.rounds[0].map((id) => ko.matches[id]);
    assert.deepStrictEqual([r0.filter((x) => x.bye).length, r0.filter((x) => !x.bye).length], [byes, first], m + ' người');
    assert.ok(r0.filter((x) => x.bye).every((x) => seedOf(x.winner) <= byes), 'miễn đấu cho hạt giống cao');
  }
});

test('Ước tính số trận khi cắt theo số thua: số người đi tiếp là kỳ vọng (≥ 2)', () => {
  const st = E.estimate({ stages: [{ type: 'swiss', rounds: 9, advanceMode: 'record', cutLosses: 2 }, { type: 'single' }], players: 64 }).stages;
  assert.ok(st[0].advance >= 2 && st[0].advance < 64 && st[0].cut, JSON.stringify(st[0]));
});

// ------------------------------------------------------------ Chạy trọn các mẫu mới qua máy chủ
const { startTpl, playAllServer } = require('./otour-tplrun.js');

test('Các mẫu Thụy Sĩ mới chạy trọn qua máy chủ (VGC cắt X-2, Baku, Monrad + Danish, Scrabble King of the Hill)', async () => {
  for (const tid of ['vgc_worlds', 'baku_open', 'monrad_club', 'scrabble_koth']) {
    const { org, t, id, so } = await startTpl(tid);
    await playAllServer(org, t, id, so);
    assert.strictEqual(t.status, 'finished', tid);
    if (tid === 'vgc_worlds') {
      // Mọi người qua cắt đều thua ≤ 2 trận; ngày 2 bắt đầu 0–0 (bảng ngày 2 chỉ tính trận ngày 2)
      const d1 = ST.standings(t.st[0], so)[0].stats, d2 = ST.standings(t.st[1], so)[0];
      assert.ok(t.st[1].entrants.every((u) => d1[u].l <= 2) && t.st[1].entrants.length === Object.values(d1).filter((x) => x.l <= 2).length, 'ngày 1: đúng mọi người thua ≤ 2');
      assert.ok(Object.values(d2.stats).every((x) => x.mp <= 6), 'ngày 2 không mang thành tích ngày 1');
      assert.strictEqual(t.st[2].entrants.length, Object.values(d2.stats).filter((x) => x.l <= 2).length);
    }
    if (tid === 'scrabble_koth') assert.strictEqual(t.st[1].entrants.length, 2, 'chung kết hai người');
    const v = (await org.req({ t: 'otGet', id }, 'ot', (x) => x.id === id && x.tour)).tour.stageViews[0];
    if (tid === 'baku_open') assert.ok(v.pp, 'trang giải có điểm ghép cặp Baku');
    org.close();
  }
});
