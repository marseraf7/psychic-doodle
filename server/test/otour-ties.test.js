/*
 * Đợt 18 – trận phụ phân hạng theo luật Riot (MSI 2019 §6.1, MSI 2022 §6.2; chỉ mô phỏng thể thức):
 *   - hoà 4 đội ở vạch đi tiếp: hai trận Bo1 xếp theo tổng thời gian thắng (nhanh nhất gặp chậm nhất); đội thắng đi tiếp;
 *     trận phân hạng 1–2 / 3–4 là trận thừa (trừ khi có vạch hạng 1 / 3 – tbmLines);
 *   - hoà 3 đội: đội nhanh nhất được miễn; quyền chọn bên = đội có tổng thời gian thắng thấp hơn;
 *   - vạch hạng thêm (tbmLines – Rumble 2021: hạng 1 và 2).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ST = require('../src/hub/stages.js');
const TM = require('../src/hub/stages-tiematch.js');

const off = (list) => ST.normalizeStages(list, { offline: true });
const uids = (n) => Array.from({ length: n }, (_, i) => 'u' + i);
const seedOf = (u) => Number(u.slice(1)) + 1;
/** Nhập trận Bo1: người thắng + thời lượng ván (giây) theo bảng dur[người thắng]. */
function play(st, m, w, dur = {}) {
  m.sets = [w === m.a ? [1, 0] : [0, 1]];
  if (dur[w]) m.esp = [{ dur: dur[w] }];
  ST.recordResult(st, m, w, { seedOf });
}
/** Vòng tròn hai lượt 4 đội, mọi đội 3–3 (lượt về đảo kết quả lượt đi). */
const ALL33 = new Set(['u0>u1', 'u1>u2', 'u2>u3', 'u3>u0', 'u0>u2', 'u1>u3']);
const winner33 = (m) => { const first = ALL33.has(m.a + '>' + m.b) || ALL33.has(m.b + '>' + m.a); const fwd = ALL33.has(m.a + '>' + m.b) ? m.a : m.b; return m.round < 3 && first ? fwd : fwd === m.a ? m.b : m.a; };

test('Hoà 4 đội (cùng 3–3) ở vạch đi tiếp 2: hai trận Bo1 nhanh nhất – chậm nhất, nhì – ba; không đấu trận thừa', () => {
  const [c] = off([{ type: 'roundrobin', groups: 1, meetings: 2, advance: 2, tbm: 'h2h' }, { type: 'single' }]);
  const st = ST.buildStage(c, 0, uids(4), { seedOf });
  // Thời gian thắng mỗi ván: u2 nhanh nhất, rồi u0, u3, u1
  const dur = { u2: 1500, u0: 1700, u3: 1900, u1: 2100 };
  for (const m of Object.values(st.matches)) play(st, m, winner33(m), dur);
  const t = ST.standings(st, seedOf)[0];
  assert.ok(['u0', 'u1', 'u2', 'u3'].every((u) => t.stats[u].pts === t.stats.u0.pts), 'cả bốn đội bằng điểm');
  const vt = TM.victoryTimes(st, uids(4));
  assert.deepStrictEqual(vt, { u0: 5100, u1: 6300, u2: 4500, u3: 5700 });
  const tbs = st.tbx[0].map((id) => st.matches[id]);
  assert.deepStrictEqual(tbs.map((m) => [m.a, m.b]), [['u2', 'u1'], ['u0', 'u3']], 'nhanh nhất gặp chậm nhất (ô trên chọn bên), nhì gặp ba');
  play(st, tbs[0], 'u1');
  play(st, tbs[1], 'u0');
  assert.ok(st.done, 'không có trận thừa (phân hạng 1–2, 3–4)');
  assert.deepStrictEqual(new Set(ST.advancers(st, seedOf).seeds), new Set(['u1', 'u0']));
  // Có vạch hạng 1 (tbmLines): hai đội thắng đấu thêm một trận
  const [c2] = off([{ type: 'roundrobin', groups: 1, meetings: 2, advance: 2, tbm: 'h2h', tbmLines: [1] }, { type: 'single' }]);
  assert.deepStrictEqual(c2.tbmLines, [1]);
  const s2 = ST.buildStage(c2, 0, uids(4), { seedOf });
  for (const m of Object.values(s2.matches)) play(s2, m, winner33(m), dur);
  const x = s2.tbx[0].map((id) => s2.matches[id]);
  play(s2, x[0], 'u1');
  play(s2, x[1], 'u0');
  const fin = s2.matches[s2.tbx[0][2]];
  assert.deepStrictEqual([fin.a, fin.b], ['u0', 'u1'], 'trận tranh hạng nhất giữa hai đội thắng (u0 nhanh hơn chọn bên)');
  play(s2, fin, 'u1');
  assert.ok(s2.done);
  assert.deepStrictEqual(ST.standings(s2, seedOf)[0].list.slice(0, 2), ['u1', 'u0']);
});

test('Hoà 3 đội tranh hạng nhất (vạch 1): đội nhanh nhất được miễn, hai đội còn lại đấu, đội thắng gặp đội được miễn', () => {
  const [c] = off([{ type: 'roundrobin', groups: 1, meetings: 2, advance: 1, tbm: 'h2h' }, { type: 'single' }]);
  const st = ST.buildStage(c, 0, uids(3), { seedOf });
  // Ba đội vòng tròn hai lượt, mỗi đội 2–2: lượt đi u0>u1, u1>u2, u2>u0; lượt về đảo lại
  const fwd = new Set(['u0>u1', 'u1>u2', 'u2>u0']);
  const dur = { u0: 2000, u1: 1600, u2: 1800 };
  for (const m of Object.values(st.matches)) { const f = fwd.has(m.a + '>' + m.b) ? m.a : m.b; play(st, m, m.round < 3 ? f : f === m.a ? m.b : m.a, dur); }
  // Nhanh nhất: u1 (miễn); u2 gặp u0 trước – u2 nhanh hơn chọn bên
  let tb = st.matches[st.tbx[0][0]];
  assert.deepStrictEqual([tb.a, tb.b, tb.side], ['u2', 'u0', 'a']);
  play(st, tb, 'u0');
  tb = st.matches[st.tbx[0][1]];
  assert.deepStrictEqual([tb.a, tb.b], ['u1', 'u0'], 'đội được miễn (nhanh hơn) chọn bên');
  play(st, tb, 'u0');
  assert.ok(st.done);
  assert.deepStrictEqual(ST.standings(st, seedOf)[0].list, ['u0', 'u1', 'u2']);
  // Huỷ trận phụ đầu: trận sau (đã đấu) khoá; huỷ trận sau trước thì được
  assert.strictEqual(ST.tieBeforeUndo(st, st.matches[st.tbx[0][0]]), false);
  assert.strictEqual(ST.tieBeforeUndo(st, st.matches[st.tbx[0][1]]), true);
});

test('Đối đầu gộp (h2h) tách nhóm trước; chưa nhập thời lượng thì chọn bên theo đối đầu; vạch hạng 1 + 2 (Rumble 2021)', () => {
  const [c] = off([{ type: 'roundrobin', groups: 1, meetings: 1, advance: 4, tbm: 'h2h', tbmLines: [1, 2, 9] }, { type: 'single' }]);
  assert.deepStrictEqual(c.tbmLines, [1, 2, 9]);
  assert.deepStrictEqual([...TM.linesOf(c)].sort(), [1, 2, 4, 9]);
  // 6 đội vòng tròn một lượt: u0, u1, u2 cùng 4 thắng (u0>u1>u2>u0 – đối đầu gộp bằng nhau); u3 2 thắng, u4 1, u5 0
  const st = ST.buildStage(c, 0, uids(6), { seedOf });
  const beats = new Set(['u0>u1', 'u1>u2', 'u2>u0', 'u3>u4', 'u3>u5', 'u4>u5']);
  for (const m of Object.values(st.matches)) {
    const top = ['u0', 'u1', 'u2'];
    const w = beats.has(m.a + '>' + m.b) ? m.a : beats.has(m.b + '>' + m.a) ? m.b : top.includes(m.a) ? m.a : m.b;
    play(st, m, w);
  }
  // Ba đội bằng nhau ở hạng 1–3, vạch 1 và 2 đều có ý nghĩa: bậc thang 2 trận (không thời lượng → theo chỉ số phụ)
  assert.strictEqual(st.tbx[0].length, 1);
  const a = st.matches[st.tbx[0][0]];
  play(st, a, a.b);
  const b = st.matches[st.tbx[0][1]];
  assert.ok(b && [b.a, b.b].includes(a.b));
  play(st, b, b.a);
  assert.ok(st.done);
  const list = ST.standings(st, seedOf)[0].list;
  assert.deepStrictEqual(new Set(list.slice(0, 3)), new Set(['u0', 'u1', 'u2']));
  assert.deepStrictEqual(list.slice(3), ['u3', 'u4', 'u5']);
});

test('Giải lưu theo cách cũ (st.tbm / st.tbt – một trận mỗi vạch) vẫn đọc và huỷ được', () => {
  const [c] = off([{ type: 'roundrobin', groups: 1, advance: 1, tbm: 'match' }, { type: 'single' }]);
  const st = ST.buildStage(c, 0, uids(3), { seedOf });
  const fwd = new Set(['u0>u1', 'u1>u2', 'u2>u0']);
  // Ghi kết quả thô (không qua recordResult để không tạo trận phụ kiểu mới), rồi dựng trận phụ kiểu cũ
  for (const m of Object.values(st.matches)) { const w = fwd.has(m.a + '>' + m.b) ? m.a : m.b; Object.assign(m, { done: true, winner: w, loser: w === m.a ? m.b : m.a }); }
  const id = `${st.key}g0tb`;
  st.matches[id] = { id, round: 3, group: 0, tb: true, a: 'u2', b: 'u0', done: true, winner: 'u2', loser: 'u0', wins: {} };
  st.groups[0].rounds.push([id]);
  st.tbm = { 0: id };
  assert.strictEqual(TM.addTiebreaks(st, seedOf), false, 'không tạo thêm trận kiểu mới');
  const list = ST.standings(st, seedOf)[0].list;
  assert.ok(list.indexOf('u2') < list.indexOf('u0'), 'đội thắng trận phụ cũ xếp trên');
  const main = Object.values(st.matches).find((m) => !m.tb);
  assert.strictEqual(TM.beforeUndo(st, main), false, 'trận phụ cũ đã đấu: khoá huỷ');
  st.matches[id].done = false;
  assert.strictEqual(TM.beforeUndo(st, main), true);
  assert.ok(!st.matches[id] && st.tbm[0] == null);
  assert.strictEqual(TM.beforeUndo(st, { tb: true, group: 0 }), true);
});
