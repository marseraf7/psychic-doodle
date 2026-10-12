// Chạy: node caro/tests/study.test.js – phân tích ván, nhân vật máy, dữ liệu giải đố.
'use strict';
const assert = require('assert');
const path = require('path');
const C = require('../rules.js');
const A = require('../analysis.js');
const B = require('../bots.js');
const { X, O } = C;

function board(moves) {
  const b = new C.Board();
  moves.forEach(([x, y], i) => b.play(x, y, i % 2 ? O : X));
  return b;
}
function seeded(s) { return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

const tests = {
  'analyzeGame: khả năng thắng cho biểu đồ (giống Lichess) nằm trong [-1, 1], ±1 khi đã thắng chắc'() {
    // X xếp 4 quân hàng 0, O đánh rải rác; nước 6 của O bỏ mặc thế 3 mở -> X thắng chắc
    const g = [[0, 0], [0, 5], [1, 0], [1, 5], [2, 0], [5, 5], [3, 0]];
    const r = A.analyzeGame(g);
    assert.ok(r.moves.every((m) => typeof m.e === 'number' && m.e >= -1 && m.e <= 1), JSON.stringify(r.moves.map((m) => m.e)));
    assert.strictEqual(r.moves[5].cls, 'blunder');
    assert.strictEqual(r.moves[5].e, 1, 'O để thua -> X thắng chắc: +1');
    assert.strictEqual(r.moves[6].e, 1, 'X thắng: +1');
    assert.ok(Math.abs(r.moves[0].e) < 0.5, 'đầu ván còn cân');
    // Đổi vai: O thắng chắc -> -1
    const g2 = [[9, 9], [0, 0], [0, 5], [1, 0], [1, 5], [2, 0], [5, 5], [3, 0]];
    const r2 = A.analyzeGame(g2);
    assert.strictEqual(r2.moves[r2.moves.length - 1].e, -1);
  },
  'immediateWins: thấy ô thắng của 4 quân chặn 1 đầu'() {
    const b = board([[0, 0], [-1, 0], [1, 0], [9, 9], [2, 0], [9, 7], [3, 0]]);
    // X: 0..3 hàng 0, O chặn ở -1 -> X thắng ở (4,0)
    assert.deepStrictEqual(A.immediateWins(b, X), [[4, 0]]);
    assert.deepStrictEqual(A.immediateWins(b, O), []);
  },
  'forced: ba quân mở = thắng ngay (đánh thành bốn mở)'() {
    const b = board([[0, 0], [0, 5], [1, 0], [1, 5], [2, 0], [9, 9]]);
    const f = A.forced(b, X, 6, { deadline: Date.now() + 2000 });
    assert.ok(f && f.len === 1, JSON.stringify(f));
  },
  'forced: tìm được chuỗi ép 2 nước trong bài đố'() {
    const q = require(path.join(__dirname, '../puzzles.json')).find((z) => z.len === 2);
    const f = A.forced(board(q.m), q.p, 6, { deadline: Date.now() + 2000 });
    assert.ok(f && f.len === 2, JSON.stringify(f));
  },
  'winningMove: chỉ nước tạo bốn mở là đúng'() {
    const b = board([[0, 0], [0, 5], [1, 0], [1, 5], [2, 0], [9, 9]]);
    assert.ok(A.winningMove(b, X, [3, 0], 3, { deadline: Date.now() + 2000 }));
    assert.ok(!A.winningMove(b, X, [5, 5], 3, { deadline: Date.now() + 2000 }));
  },
  'analyzeGame: dùng lại các thế đã chấm sẵn (phân tích ngầm / lượt nhanh), chỉ chấm lại thế chấm chưa đủ kỹ'() {
    const g = [[0, 0], [0, 5], [1, 0], [1, 5], [2, 0], [5, 5], [3, 0]];
    const full = A.analyzeGame(g, { ms: 60 });
    assert.equal(full.evals.length, g.length + 1);
    assert.ok(full.evals.slice(0, g.length).every((e) => e && typeof e.score === 'number' && e.q === 60 && !e.pv));
    // Đủ kỹ: dùng nguyên (kể cả khi được chấm "giả")
    const fake = full.evals.map((e) => e && { ...e });
    fake[2] = { move: [9, 9], score: 0, mate: null, q: 500 };
    const r = A.analyzeGame(g, { ms: 60, evals: fake });
    assert.strictEqual(r.evals[2], fake[2]);
    assert.deepEqual(A.analyzeGame(g, { ms: 60, evals: full.evals }).moves.map((m) => m.cls), full.moves.map((m) => m.cls));
    // Chưa đủ kỹ (q nhỏ hơn ms) hoặc hỏng: chấm lại
    fake[3] = { ...fake[3], q: 10 };
    fake[4] = { move: [0, 0] };
    const r2 = A.analyzeGame(g, { ms: 60, evals: fake });
    assert.notStrictEqual(r2.evals[3], fake[3]);
    assert.equal(r2.evals[3].q, 60);
    assert.equal(typeof r2.evals[4].score, 'number');
    // Lượt nhanh (thời gian nhỏ): engine xem giờ chặt hơn, kết quả vẫn đủ thế
    const quick = A.analyzeGame(g, { ms: 20 });
    assert.equal(quick.moves.length, g.length);
    assert.ok(quick.evals.slice(0, g.length).every((e) => e.q === 20));
    assert.deepEqual(A.slim({ move: [1, 2], score: 5, mate: null, pv: [], nodes: 9 }, 20), { move: [1, 2], score: 5, mate: null, q: 20 });
  },
  'analyzeGame: bỏ mặc thế ba mở = sai lầm nặng, nước thắng = tốt nhất'() {
    const r = A.analyzeGame([[0, 0], [0, 5], [1, 0], [1, 5], [2, 0], [5, 5], [3, 0]]);
    assert.strictEqual(r.moves[5].cls, 'blunder');
    assert.ok(r.moves[5].best, 'có gợi ý nước chặn');
    const bb = board([[0, 0], [0, 5], [1, 0], [1, 5], [2, 0]]);
    bb.put(r.moves[5].best[0], r.moves[5].best[1], O);
    assert.ok(!A.forced(bb, X, 4, { deadline: Date.now() + 2000 }), 'nước gợi ý giữ được thế');
    assert.strictEqual(r.moves[6].cls, 'best');
    // Độ chính xác tính theo mức tụt khả năng thắng (như Lichess): X gần như không mất gì, O mất nhiều
    assert.ok(r.acc[X] >= 90, 'X ' + r.acc[X]);
    assert.ok(r.acc[O] < r.acc[X] - 15, 'O ' + r.acc[O]);
    // Lỗi nặng chỉ ở nước 6 (các nước "chưa chính xác" nhỏ có thể dao động theo thời gian tìm của engine)
    assert.deepStrictEqual(A.keyMoments(r).filter((m) => m.cls !== 'inacc').map((m) => m.i), [5]);
  },
  'analyzeGame: bỏ lỡ nước thắng ngay = bỏ lỡ'() {
    // X có 4 quân mở 2 đầu ở nước 7 nhưng đánh chỗ khác
    const r = A.analyzeGame([[0, 0], [0, 5], [1, 0], [1, 5], [2, 0], [2, 5], [9, 9]]);
    assert.strictEqual(r.moves[6].cls, 'miss');
    assert.strictEqual(r.moves[6].len, 1);
  },
  'analyzeGame: ván máy tự đánh không lỗi, X/O luân phiên'() {
    const rng = seeded(3);
    const b = new C.Board();
    const moves = [];
    let p = X;
    for (let t = 0; t < 60; t++) {
      const [x, y] = B.botMove(b, p, t % 2 ? 'ti' : 'bin', rng);
      b.play(x, y, p);
      moves.push([x, y]);
      if (C.checkWin(b, x, y, p)) break;
      p = C.other(p);
    }
    const r = A.analyzeGame(moves, { ms: 60 });
    assert.strictEqual(r.moves.length, moves.length);
    r.moves.forEach((m, i) => assert.strictEqual(m.p, i % 2 ? O : X));
    for (const p2 of [X, O]) assert.ok(r.acc[p2] >= 0 && r.acc[p2] <= 100);
  },
  'bots: 24 nhân vật = 6 mức × 4 lối đánh, Elo tăng theo mức, 3 mức đầu mở sẵn'() {
    assert.strictEqual(B.BOTS.length, 24);
    assert.strictEqual(new Set(B.BOTS.map((b) => b.id)).size, 24);
    assert.deepStrictEqual(B.STYLES, ['atk', 'def', 'dbl', 'trap']);
    for (let t = 1; t <= 6; t++) {
      const row = B.byTier(t);
      assert.deepStrictEqual(row.map((b) => b.style).sort(), [...B.STYLES].sort());
      assert.ok(row.every((b) => b.elo === B.TIERS[t - 1].elo));
      if (t > 1) assert.ok(B.TIERS[t - 1].elo > B.TIERS[t - 2].elo);
    }
    // 6 nhân vật cũ giữ id (lựa chọn đã lưu của người chơi cũ vẫn dùng được), mỗi người một mức
    assert.deepStrictEqual(['na', 'ti', 'bin', 'mai', 'minh', 'rong'].map((id) => B.get(id).tier), [1, 2, 3, 4, 5, 6]);
    assert.strictEqual(B.START_UNLOCKED, 3);
    for (const l of [1, 2, 3]) assert.ok(B.get(B.FROM_LEVEL[l]));
    assert.strictEqual(B.of(6, 'def').id, 'phao');
  },
  'bots: lối đánh đổi cách chấm điểm (nước đôi thưởng ô giao điểm, gài bẫy thưởng nước nhảy)'() {
    // X có 2 quân ngang (0,0),(1,0) và 2 quân dọc (3,2),(3,3): ô (3,0) là giao điểm
    const b = board([[0, 0], [9, 9], [1, 0], [9, 11], [3, 2], [11, 9], [3, 3]]);
    assert.ok(C.styleBonus(b, 3, 0, X, { dbl: 1 }) > C.styleBonus(b, -1, 0, X, { dbl: 1 }));
    assert.strictEqual(C.styleBonus(b, 3, 0, X, {}), 0);
    // nước nhảy (cách quân mình 1 ô, không sát quân nào) được thưởng; nước sát nước vừa đi của đối thủ bị trừ
    const t = board([[0, 0], [5, 5], [1, 0]]);
    assert.ok(C.styleBonus(t, 3, 2, X, { trap: 1 }) > 0, 'nước nhảy cách quân mình 1 ô');
    assert.ok(C.styleBonus(t, 2, 1, O, { trap: 1 }) < 0, 'đánh sát nước vừa đi của đối thủ bị trừ điểm');
  },
  'bots: nhân vật mạnh luôn thắng ngay và luôn chặn; Na đôi khi quên chặn'() {
    // O tới lượt, có 3 quân mở ở hàng 5: đánh thành 4 mở là thắng
    const win = board([[0, 0], [0, 5], [1, 0], [1, 5], [2, 0], [2, 5], [9, 9]]);
    for (const id of B.BOTS.filter((o) => o.tier >= 3).map((o) => o.id)) {
      const [x, y] = B.botMove(win, O, id, seeded(1));
      assert.ok(C.winsIfPlaced(win, x, y, O), id + ' bỏ lỡ nước thắng');
    }
    // Phải chặn: X có 4 quân chặn 1 đầu
    const blk = board([[0, 0], [-1, 0], [1, 0], [5, 5], [2, 0], [5, 7], [3, 0]]);
    for (const id of B.BOTS.filter((o) => o.tier >= 4).map((o) => o.id)) {
      const [x, y] = B.botMove(blk, O, id, seeded(2));
      // Chặn ở (4,0), hoặc ở (5,0) cũng được theo luật Caro Việt Nam (X đánh (4,0) thành 5 quân bị chặn hai đầu)
      const after = board([[0, 0], [-1, 0], [1, 0], [5, 5], [2, 0], [5, 7], [3, 0]]);
      after.put(x, y, O);
      const xWins = [[4, 0], [5, 0]].some(([wx, wy]) => !after.get(wx, wy) && C.winsIfPlaced(after, wx, wy, X));
      assert.ok(!xWins, id + ' không chặn: ' + [x, y]);
    }
    let binMissed = 0;
    for (let s = 1; s <= 200; s++) if (B.botMove(blk, O, 'bin', seeded(s))[0] !== 4) binMissed++;
    assert.ok(binMissed < 20, 'Ba Sáu (bin) quên chặn ' + binMissed + '/200');
    let missed = 0;
    for (let s = 1; s <= 200; s++) {
      const [x, y] = B.botMove(blk, O, 'na', seeded(s));
      if (x !== 4 || y !== 0) missed++;
    }
    assert.ok(missed > 20 && missed < 140, 'Na quên chặn ' + missed + '/200');
  },
  'giải đố: dữ liệu hợp lệ, lời giải đúng, không trùng'() {
    const list = require(path.join(__dirname, '../puzzles.json'));
    assert.ok(list.length >= 100, 'ít nhất 100 bài, có ' + list.length);
    const ids = new Set();
    let prevR = 0;
    for (const q of list) {
      assert.ok(!ids.has(q.id));
      ids.add(q.id);
      assert.ok(q.r >= prevR, 'sắp theo độ khó');
      prevR = q.r;
      assert.strictEqual(q.p, q.m.length % 2 ? O : X, `#${q.id}: bên đi không khớp`);
      assert.ok(q.len >= 2 && q.len <= 7);
      assert.ok(['vcf', 'vct'].includes(q.t), `#${q.id}: thiếu chủ đề VCF / VCT`);
      assert.ok(!q.rule || C.RULES.includes(q.rule));
      const b = new C.Board(q.rule);
      q.m.forEach(([x, y], i) => b.play(x, y, i % 2 ? O : X));
      assert.strictEqual(A.immediateWins(b, q.p).length, 0, `#${q.id}: đã có nước thắng ngay`);
      assert.strictEqual(A.immediateWins(b, C.other(q.p)).length, 0, `#${q.id}: đối thủ đang đe doạ`);
      assert.ok(A.winningMove(b, q.p, q.sol, q.len, { deadline: Date.now() + 20000 }), `#${q.id}: lời giải sai`); // rộng tay: chạy chung với đo độ phủ thì chậm
    }
    assert.ok(list.filter((q) => q.t === 'vcf').length >= 100 && list.filter((q) => q.t === 'vct').length >= 100, 'đủ bài VCF và VCT');
    assert.ok(list.some((q) => q.t === 'vcf' && q.rule === 'free' && q.len === 3), 'có bài VCF 3 nước cho bài học');
    const lens = new Set(list.map((q) => q.len));
    assert.ok(lens.has(2) && lens.has(3) && lens.has(4), 'đủ bài dễ / vừa / khó');
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('✓ ' + name); } catch (e) { failed++; console.log('✗ ' + name + '\n   ' + e.message); }
}
console.log(failed ? `${failed} bài kiểm tra lỗi` : 'Tất cả đều đạt');
process.exit(failed ? 1 : 0);
