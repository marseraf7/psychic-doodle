/*
 * Đối chiếu cách ghép hệ Thụy Sĩ của game (stages-pairing.js swissPairs, chế độ 'dutch') với hệ Hà Lan của FIDE
 * (Handbook C.04.3 "FIDE (Dutch) System", C.04.1 "Basic rules for Swiss Systems") trên các ca dựng tay. Không có máy ghép
 * tham chiếu (bbpPairings…) khi chạy offline nên kết quả mong đợi được viết tay theo đúng điều luật – trích số điều trong
 * chú thích; không chép mã của chương trình nào.
 * Khác biệt cố ý (ghi rõ, không phải lỗi):
 *   – Màu quân (C.04.3 mục E – ưu tiên màu, xen kẽ màu) KHÔNG do bộ ghép quyết định: ván caro của giải chọn bên đi trước
 *     theo luật của giải (đổi lượt từng ván trong Bo, phòng giải tự xếp). Cặp luôn trả về người xếp trên trước.
 *   – Không có "điểm ghép cặp" cho người miễn đấu khác điểm thật (C.04.1 – giải dùng điểm thật của game).
 *   – Tìm theo chiều sâu có giới hạn bước: giải rất lớn có thể dừng sớm và ghép lần lượt (không xảy ra ở cỡ giải của game).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { swissPairs } = require('../src/hub/stages-pairing.js');

const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
const playedOf = (pairs) => new Set(pairs.map(([a, b]) => key(a, b)));
const sc = (groups) => Object.fromEntries(Object.entries(groups).flatMap(([pts, ids]) => ids.map((u) => [u, Number(pts)])));
const ids = (n) => Array.from({ length: n }, (_, i) => 'p' + String(i + 1).padStart(2, '0'));
const P = ids(10);

test('C.04.3 B.1–B.2: vòng 1, nhóm điểm đồng nhất – nửa trên (S1) gặp nửa dưới (S2): 1–5, 2–6, 3–7, 4–8', () => {
  const r = swissPairs(P.slice(0, 8), new Set(), {}, 'dutch', sc({ 0: P.slice(0, 8) }));
  assert.deepStrictEqual(r.pairs, [['p01', 'p05'], ['p02', 'p06'], ['p03', 'p07'], ['p04', 'p08']]);
  assert.strictEqual(r.bye, null);
});

test('C.04.3 A.3, B.2: mỗi nhóm điểm ghép riêng (1–3, 2–4 ở nhóm 1 điểm; 5–7, 6–8 ở nhóm 0 điểm)', () => {
  const order = ['p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07', 'p08'];
  const played = playedOf([['p01', 'p05'], ['p02', 'p06'], ['p03', 'p07'], ['p04', 'p08']]);
  const r = swissPairs(order, played, {}, 'dutch', sc({ 1: order.slice(0, 4), 0: order.slice(4) }));
  assert.deepStrictEqual(r.pairs, [['p01', 'p03'], ['p02', 'p04'], ['p05', 'p07'], ['p06', 'p08']]);
});

test('C.04.1 b (không gặp lại) + C.04.3 D.1 (đổi chỗ trong S2 trước): 1–3 đã gặp → 1–4, 2–3', () => {
  const order = ['p01', 'p02', 'p03', 'p04'];
  const r = swissPairs(order, playedOf([['p01', 'p03']]), {}, 'dutch', sc({ 1: order }));
  assert.deepStrictEqual(r.pairs, [['p01', 'p04'], ['p02', 'p03']]);
});

test('C.04.3 A.4, B.3: nhóm lẻ – người thấp nhất nhóm "trôi" xuống, gặp người cao nhất nhóm dưới', () => {
  const order = P.slice(0, 8);
  const r = swissPairs(order, new Set(), {}, 'dutch', sc({ 1: order.slice(0, 3), 0: order.slice(3) }));
  // Nhóm 1 điểm [1, 2, 3]: S1 = [1], S2 = [2, 3] → 1–2, 3 trôi xuống gặp 4; còn [5, 6, 7, 8] → 5–7, 6–8
  assert.deepStrictEqual(r.pairs, [['p01', 'p02'], ['p03', 'p04'], ['p05', 'p07'], ['p06', 'p08']]);
});

test('C.04.3 A.4: người trôi xuống là người khác nếu cặp trong nhóm đã gặp (1–2 đã gặp → 1–3, 2 trôi xuống)', () => {
  const order = P.slice(0, 6);
  const r = swissPairs(order, playedOf([['p01', 'p02']]), {}, 'dutch', sc({ 1: order.slice(0, 3), 0: order.slice(3) }));
  assert.deepStrictEqual(r.pairs, [['p01', 'p03'], ['p02', 'p04'], ['p05', 'p06']]);
});

test('C.04.1 c–d: số lẻ – người xếp thấp nhất chưa từng được miễn đấu được miễn', () => {
  const order = P.slice(0, 5);
  assert.deepStrictEqual(swissPairs(order, new Set(), {}, 'dutch', sc({ 0: order })), { pairs: [['p01', 'p03'], ['p02', 'p04']], bye: 'p05' });
  const r = swissPairs(order, new Set(), { p05: 1 }, 'dutch', sc({ 0: order }));
  assert.strictEqual(r.bye, 'p04', 'p05 đã được miễn đấu');
  assert.deepStrictEqual(r.pairs, [['p01', 'p03'], ['p02', 'p05']]);
});

test('C.04.1 b đứng trên chọn người miễn đấu (C.04.3 C.1–C.2 tiêu chí tuyệt đối): đổi người miễn đấu để không ai gặp lại', () => {
  // A gặp hết B, C, D; C–D, B–D đã gặp; B, C đã được miễn đấu. Miễn đấu cho E (thấp nhất) thì A, B, C, D không ghép được
  // nếu không gặp lại – FIDE đòi chọn người miễn đấu khác (D): A–E, B–C.
  const order = ['A', 'B', 'C', 'D', 'E'];
  const played = playedOf([['A', 'B'], ['A', 'C'], ['A', 'D'], ['C', 'D'], ['B', 'D']]);
  const r = swissPairs(order, played, { B: 1, C: 1 }, 'dutch', sc({ 2: order }));
  assert.strictEqual(r.bye, 'D');
  assert.deepStrictEqual(r.pairs, [['A', 'E'], ['B', 'C']]);
  assert.ok(r.pairs.every(([a, b]) => !played.has(key(a, b))), 'không có cặp gặp lại');
});

test('mô phỏng 10 người × 5 vòng: không ai gặp lại, không ai được miễn đấu hai lần, cặp luôn là người xếp trên trước', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const n of [9, 10]) {
    const players = ids(n);
    const pts = Object.fromEntries(players.map((u) => [u, 0]));
    const played = new Set(), byes = {};
    for (let round = 0; round < 5; round++) {
      const order = players.slice().sort((a, b) => pts[b] - pts[a] || players.indexOf(a) - players.indexOf(b));
      const { pairs, bye } = swissPairs(order, played, byes, 'dutch', { ...pts });
      for (const [a, b] of pairs) {
        assert.ok(!played.has(key(a, b)), `vòng ${round + 1}: ${a}–${b} gặp lại`);
        assert.ok(order.indexOf(a) < order.indexOf(b), 'người xếp trên đứng trước');
        played.add(key(a, b));
        const x = rnd();
        if (x < 0.45) pts[a] += 1; else if (x < 0.9) pts[b] += 1; else { pts[a] += 0.5; pts[b] += 0.5; }
      }
      if (bye) { assert.ok(!byes[bye], `${bye} được miễn đấu hai lần`); byes[bye] = 1; pts[bye] += 1; }
      assert.strictEqual(pairs.length * 2 + (bye ? 1 : 0), n, 'ai cũng có cặp hoặc được miễn đấu');
    }
  }
});

test('miễn đấu – thêm ca: nhiều người đã được miễn, ai cũng đã gặp nhau, ai cũng đã được miễn, người vào muộn', () => {
  // Nhiều người đã được miễn (p05–p07): người thấp nhất chưa từng được miễn là p04
  const o7 = P.slice(0, 7);
  const r1 = swissPairs(o7, new Set(), { p05: 1, p06: 1, p07: 1 }, 'dutch', sc({ 0: o7 }));
  assert.strictEqual(r1.bye, 'p04');
  assert.strictEqual(r1.pairs.length, 3);
  // Ba người đã gặp hết nhau (C đã được miễn): không tránh được gặp lại – vẫn miễn cho B (thấp nhất chưa được miễn),
  // A–C gặp lại (ít cặp gặp lại nhất), không ai bị bỏ sót
  const all = playedOf([['A', 'B'], ['A', 'C'], ['B', 'C']]);
  const r2 = swissPairs(['A', 'B', 'C'], all, { C: 1 }, 'dutch', sc({ 1: ['A', 'B', 'C'] }));
  assert.deepStrictEqual(r2, { pairs: [['A', 'C']], bye: 'B' });
  // Ai cũng đã được miễn: người thấp nhất được miễn lần nữa, phần còn lại không gặp lại nếu được
  const o5 = ['A', 'B', 'C', 'D', 'E'];
  const r3 = swissPairs(o5, playedOf([['A', 'B'], ['C', 'D']]), { A: 1, B: 1, C: 1, D: 1, E: 1 }, 'dutch', sc({ 1: o5 }));
  assert.strictEqual(r3.bye, 'E');
  assert.ok(r3.pairs.every(([a, b]) => !['A|B', 'C|D'].includes(key(a, b))), JSON.stringify(r3.pairs));
  // Người vào muộn (E: chưa đấu, 0 điểm, chưa được miễn): được miễn, bốn người còn lại không gặp lại
  const played = playedOf([['A', 'C'], ['B', 'D']]);
  const r4 = swissPairs(o5, played, {}, 'dutch', sc({ 1: ['A', 'B'], 0: ['C', 'D', 'E'] }));
  assert.strictEqual(r4.bye, 'E');
  assert.deepStrictEqual(r4.pairs, [['A', 'B'], ['C', 'D']]);
  // Người vào muộn đứng giữa bảng (đã có điểm thưởng vào muộn), người thấp nhất đã được miễn: miễn cho người kế trên
  // chưa được miễn mà phần còn lại vẫn ghép được không gặp lại
  const p2 = playedOf([['A', 'B'], ['C', 'E'], ['A', 'D']]);
  const r5 = swissPairs(o5, p2, { E: 1 }, 'dutch', sc({ 1: ['A', 'B', 'C', 'D', 'E'] }));
  assert.notStrictEqual(r5.bye, 'E', 'E đã được miễn');
  assert.ok(r5.pairs.every(([a, b]) => !p2.has(key(a, b))), JSON.stringify(r5));
  assert.strictEqual(r5.pairs.length * 2 + 1, 5);
});
