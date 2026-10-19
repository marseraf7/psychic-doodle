/*
 * Kiểm tra engine giới hạn theo số nút (opts.nodes) và điểm trung bình hai lớp cuối (opts.smooth) – nền của phân tích ván
 * tất định (analysis.js evaluate): cùng thế cờ → cùng kết quả, bất kể máy nhanh / chậm, Worker nào, thứ tự nào.
 *   node caro/tests/engine-budget.test.js
 */
'use strict';
const assert = require('assert');
const C = require('../rules.js');
globalThis.Caro = C;
const E = require('../engine.js');
const A = require('../analysis.js');

// Ván thử (study.e2e.js): X xếp 4 quân hàng 0, O bỏ mặc thế ba mở
const GAME = [[0, 0], [0, 5], [1, 0], [1, 5], [2, 0], [5, 5], [3, 0]];
// Thế yên tĩnh (chưa có chuỗi ép) để so điểm từng lớp
const QUIET = [[0, 0], [1, 1], [-1, 1], [1, 0]];
const pick = (r) => JSON.stringify([r.move, r.score, r.depth, r.nodes, r.mate, r.pv]);

const tests = {
  'giới hạn theo nút: cùng thế cho cùng kết quả, không phụ thuộc các lần chấm trước, dừng đúng số nút'() {
    const a = E.analyse(QUIET, { nodes: 8000, ms: 1e6, rule: 'vn' });
    E.analyse(GAME.slice(0, 5), { nodes: 20000, ms: 1e6, rule: 'vn' }); // chấm thế khác ở giữa
    const b = E.analyse(QUIET, { nodes: 8000, ms: 1e6, rule: 'vn' });
    assert.strictEqual(pick(a), pick(b));
    assert.ok(a.nodes <= 8000 + 1, 'số nút ' + a.nodes);
    // Nhiều nút hơn thì tìm sâu hơn (hoặc bằng)
    assert.ok(E.analyse(QUIET, { nodes: 40000, ms: 1e6, rule: 'vn' }).depth >= a.depth);
  },
  'giới hạn theo nút: ms là giới hạn cứng cho máy quá chậm'() {
    const t = Date.now();
    const r = E.analyse(QUIET, { nodes: 1e9, ms: 150, rule: 'vn' });
    assert.ok(Date.now() - t < 1500, 'dừng theo giờ ' + (Date.now() - t) + ' ms');
    assert.ok(r.move && r.depth >= 1);
  },
  'smooth: điểm = trung bình hai lớp cuối (triệt tiêu lệch chẵn / lẻ do tempo ở lá), nước đi không đổi'() {
    const at = (d, smooth) => E.analyse(QUIET, { nodes: 1e8, ms: 1e6, rule: 'vn', maxDepth: d, smooth });
    const d4 = at(4, false), d5 = at(5, false), s5 = at(5, true);
    assert.strictEqual(s5.score, Math.round((d4.score + d5.score) / 2));
    assert.deepStrictEqual(s5.move, d5.move);
    // Lệch chẵn / lẻ có thật: điểm thô hai lớp liền nhau khác nhau rõ
    assert.ok(Math.abs(d4.score - d5.score) > 50, `d4 ${d4.score} d5 ${d5.score}`);
    // Thắng / thua chắc: giữ nguyên điểm
    const m = E.analyse(GAME.slice(0, 6), { nodes: 50000, ms: 1e6, rule: 'vn', smooth: true });
    assert.ok(m.mate > 0 && m.score >= E.MATE);
  },
  'analysis.evaluate: thứ tự chấm nào cũng ra cùng kết quả (nhiều Worker = một Worker)'() {
    const pos = Array.from({ length: GAME.length }, (_, i) => GAME.slice(0, i));
    const fwd = pos.map((m) => A.evaluate(m, 40, 'vn'));
    const rev = pos.slice().reverse().map((m) => A.evaluate(m, 40, 'vn')).reverse();
    assert.deepStrictEqual(fwd, rev);
    assert.ok(fwd.every((e) => e.q === 40));
    // Ván phân tích hai lần: từng nước xếp loại như nhau
    const r1 = A.analyzeGame(GAME, { ms: 40 }), r2 = A.analyzeGame(GAME, { ms: 40 });
    assert.deepStrictEqual(r1.moves.map((m) => [m.cls, m.drop]), r2.moves.map((m) => [m.cls, m.drop]));
    assert.deepStrictEqual(r1.acc, r2.acc);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('✓ ' + name); } catch (e) { failed++; console.log('✗ ' + name + '\n   ' + e.message); }
}
console.log(failed ? `${failed} bài kiểm tra lỗi` : 'Tất cả đều đạt');
process.exit(failed ? 1 : 0);
