/*
 * Kiểm tra "phim minh hoạ" của phần Học (learn-demos.js) bằng luật thật (rules.js):
 * quân đặt vào ô trống trong hình 9×9, không ai thắng ngoài dự kiến, khung "thắng / đe doạ / cấm / chặn" đúng như phụ đề nói.
 *   node caro/tests/demos.test.js
 */
'use strict';
const assert = require('assert');
const C = require('../rules.js');
const { DEMOS, OPENINGS } = require('../learn-demos.js');

const P = { x: C.X, o: C.O };
const inBoard = (x, y) => x >= 0 && y >= 0 && x <= 8 && y <= 8;

function replay(id, d) {
  const b = new C.Board(d.rule);
  for (const [x, y, p] of d.init) {
    assert.ok(inBoard(x, y), `${id}: quân ban đầu ngoài hình (${x},${y})`);
    assert.strictEqual(b.get(x, y), C.EMPTY, `${id}: trùng ô (${x},${y})`);
    b.put(x, y, P[p]);
  }
  for (const [x, y, p] of d.init) assert.ok(!C.checkWin(b, x, y, P[p]), `${id}: thế ban đầu đã có người thắng`);
  d.frames.forEach((f, i) => {
    const tag = `${id} khung ${i + 1}`;
    let last = null;
    for (const [x, y, p] of f.s || []) {
      assert.ok(inBoard(x, y), `${tag}: ngoài hình (${x},${y})`);
      assert.strictEqual(b.get(x, y), C.EMPTY, `${tag}: ô (${x},${y}) đã có quân`);
      assert.strictEqual(C.forbidden(b, x, y, P[p]), null, `${tag}: (${x},${y}) là nước cấm`);
      b.play(x, y, P[p]);
      last = { x, y, p: P[p] };
    }
    for (const [x, y] of f.m || []) assert.ok(inBoard(x, y), `${tag}: dấu ngoài hình`);
    const won = last && !!C.checkWin(b, last.x, last.y, last.p);
    if (f.expect === 'win') assert.ok(won, `${tag}: phải thắng`);
    else assert.ok(!won, `${tag}: thắng ngoài dự kiến`);
    if (f.expect === 'threat') {
      const cells = C.winCellsAround(b, last.x, last.y, last.p).map(String);
      assert.ok(cells.length > 0, `${tag}: không tạo được ô thắng`);
      // dấu ✓ trong khung đe doạ = các ô thắng phụ đề chỉ ra
      for (const [x, y, k] of f.m || []) if (k === 'good') assert.ok(cells.includes(String([x, y])), `${tag}: (${x},${y}) không phải ô thắng`);
    }
    if (f.expect === 'block') {
      const q = C.other(last.p);
      assert.ok(!C.candidates(b, 1).some(([x, y]) => C.winsIfPlaced(b, x, y, q)), `${tag}: chặn chưa hết`);
    }
    if (f.expect === 'forbid') for (const [x, y, k] of f.m) if (k === 'bad') assert.ok(C.forbidden(b, x, y, C.X), `${tag}: (${x},${y}) không phải ô cấm`);
    if (f.line) {
      assert.ok(won, `${tag}: có đường thắng nhưng chưa thắng`);
      const cells = C.checkWin(b, last.x, last.y, last.p).map((c) => c.join());
      for (const c of f.line) assert.ok(cells.includes(c.join()), `${tag}: đầu đường thắng (${c}) không thuộc hàng thắng`);
    }
  });
}

const tests = {
  'mọi phim: nước hợp lệ, thắng / đe doạ / chặn / cấm đúng như phụ đề'() {
    let n = 0;
    for (const [id, d] of Object.entries(DEMOS)) { if (d.kind) continue; replay(id, d); n++; }
    assert.ok(n >= 14, 'số phim ' + n);
  },
  '26 thế khai cuộc: 13 + 13 vị trí X3 khác nhau, trong ô 5×5 quanh tâm, không trùng X1 / O2'() {
    for (const k of ['direct', 'indirect']) {
      const o = OPENINGS[k];
      assert.strictEqual(o.x3.length, 13);
      assert.strictEqual(new Set(o.x3.map(String)).size, 13);
      for (const [x, y] of o.x3) {
        assert.ok(Math.abs(x - 4) <= 2 && Math.abs(y - 4) <= 2);
        assert.ok(String([x, y]) !== '4,4' && String([x, y]) !== String(o.o2));
      }
    }
    // Hoa Nguyệt = trực chỉ số 4, Phố Nguyệt = gián chỉ số 7 (giống phim moon1 / moon2)
    assert.deepStrictEqual(OPENINGS.direct.x3[3], DEMOS.moon1.frames[2].s[0].slice(0, 2));
    assert.deepStrictEqual(OPENINGS.indirect.x3[6], DEMOS.moon2.frames[2].s[0].slice(0, 2));
  },
  'phụ đề: mọi khung của mọi phim có chữ ở đủ 4 ngôn ngữ, tên 13 + 13 thế khai cuộc'() {
    const D = {};
    globalThis.window = { I18N: { extend: (l, o) => { D[l] = Object.assign(D[l] || {}, o); } } };
    require('../i18n-demos.js');
    delete globalThis.window;
    assert.deepStrictEqual(Object.keys(D).sort(), ['en', 'ru', 'vi', 'zh']);
    for (const l of Object.keys(D)) {
      for (const [id, d] of Object.entries(DEMOS)) {
        if (d.kind) continue;
        d.frames.forEach((_, i) => assert.ok(D[l][`demo_${id}_${i + 1}`], `${l}: thiếu phụ đề demo_${id}_${i + 1}`));
        assert.ok(!D[l][`demo_${id}_${d.frames.length + 1}`], `${l}: thừa phụ đề demo_${id}_${d.frames.length + 1}`);
      }
      for (const k of ['direct', 'indirect']) assert.strictEqual(D[l]['open_names_' + k].split('|').length, 13, `${l}: tên thế ${k}`);
      assert.deepStrictEqual(Object.keys(D[l]).sort(), Object.keys(D.vi).sort(), `${l}: khoá khác tiếng Việt`);
    }
  },
};

let fail = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('✓', name); } catch (e) { fail++; console.log('✗', name, '\n   ', e.message); }
}
console.log(fail ? `${fail} lỗi` : 'Tất cả đều đạt');
process.exit(fail ? 1 : 0);
