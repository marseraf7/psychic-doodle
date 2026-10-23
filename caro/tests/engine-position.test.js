/*
 * Kiểm tra chốt chặn C3 của engine-position.js: thế cờ trải quá rộng (> 512 ô một chiều) phải bị từ chối
 * có kiểm soát (lỗi mang mã position_too_large) thay vì cấp phát mảng theo khung bao tới hàng tỉ ô —
 * trước khi vá, analyse([[0,0],[100000,100000]]) văng "Array buffer allocation failed" làm chết Worker.
 *   node caro/tests/engine-position.test.js
 */
'use strict';
const assert = require('assert');
const C = require('../rules.js');
globalThis.Caro = C;
const E = require('../engine.js');

const tests = {
  'thế trải cực rộng bị từ chối có kiểm soát (position_too_large), không phải lỗi cấp phát'() {
    for (const mv of [[[0, 0], [100000, 100000]], [[0, 0], [-100000, 50000]]]) {
      let err = null;
      try { new E.Position(mv); } catch (e) { err = e; }
      assert.ok(err, 'phải ném lỗi: ' + JSON.stringify(mv));
      assert.strictEqual(err.code, 'position_too_large', 'lỗi có mã rõ ràng, nhận được: ' + err.message);
      assert.ok(!(err instanceof RangeError), 'không được là lỗi cấp phát bộ nhớ');
    }
    // Qua cửa phân tích cũng vậy (đường đi của Worker chấm thế)
    let err = null;
    try { E.analyse([[0, 0], [100000, 100000]], { ms: 10 }); } catch (e) { err = e; }
    assert.ok(err && err.code === 'position_too_large', 'analyse phải truyền lỗi có kiểm soát lên nơi gọi');
  },

  'vừa quá biên 512 một chiều cũng bị từ chối'() {
    // Khung bao 514 ô (0..513) theo chiều ngang / chiều dọc
    for (const mv of [[[0, 0], [513, 0]], [[0, 0], [0, 513]], [[-300, 0], [214, 0]]]) {
      assert.throws(() => new E.Position(mv), (e) => e.code === 'position_too_large', JSON.stringify(mv));
    }
  },

  'thế rộng đúng biên 512 vẫn dựng và phân tích được'() {
    const pos = new E.Position([[0, 0], [511, 0], [0, 511]]);
    assert.strictEqual(pos.W, 512 + 16, 'khung 512 + PAD hai phía');
    assert.strictEqual(pos.count, 3);
    // Ván dài đi xa dần trong giới hạn: 300 nước dọc đường chéo, khung 300
    const line = [];
    for (let i = 0; i < 300; i++) line.push([i, i]);
    const pos2 = new E.Position(line);
    assert.strictEqual(pos2.count, 300);
    // Thế nhỏ bình thường: phân tích vẫn trả nước đi
    const r = E.analyse([[0, 0], [1, 1], [0, 1]], { ms: 50 });
    assert.ok(Array.isArray(r.move), 'analyse thế thường vẫn chạy');
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('✓ ' + name); } catch (e) { failed++; console.log('✗ ' + name + '\n   ' + e.message); }
}
console.log(failed ? `${failed} bài kiểm tra lỗi` : 'Tất cả đều đạt');
process.exit(failed ? 1 : 0);
