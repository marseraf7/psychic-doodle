// Công cụ sửa hàng loạt chuỗi giao diện (scripts/i18n-set.js): sửa đúng khối ngôn ngữ, đúng khoá, giữ nguyên phần còn lại.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { setOne, block, apply } = require('../scripts/i18n-set.js');

const SRC = `(function () {
  const X = window.I18N.extend;
  X('vi', {
    a: 'Một', b: "Hai \\"x\\"", // chú thích giữ nguyên
    c: \`Ba\`,
  });
  X('en', {
    a: 'One', b: 'Two',
  });
})();`;

test('block: khoảng của từng khối ngôn ngữ', () => {
  const [a, b] = block(SRC, 'vi');
  assert.ok(SRC.slice(a, b).includes("a: 'Một'") && !SRC.slice(a, b).includes("'One'"));
  assert.strictEqual(block(SRC, 'zh'), null);
});

test('setOne: thay chuỗi của đúng ngôn ngữ, mọi kiểu dấu nháy, thoát ký tự đặc biệt', () => {
  let s = setOne(SRC, 'en', 'a', "It's");
  assert.ok(s.includes("a: 'It\\'s'") && s.includes("a: 'Một'"));
  s = setOne(s, 'vi', 'b', 'Hai\nmới');
  assert.ok(s.includes("b: 'Hai\\nmới', // chú thích giữ nguyên"));
  s = setOne(s, 'vi', 'c', 'Ba \\ mới');
  assert.ok(s.includes("c: 'Ba \\\\ mới'"));
  assert.throws(() => setOne(SRC, 'vi', 'khong_co', 'x'), /không thấy khoá/);
  assert.throws(() => setOne(SRC, 'ru', 'a', 'x'), /không thấy khối/);
  assert.throws(() => setOne('X(\'vi\', { a: `${x}` })', 'vi', 'a', 'y'), /không phải chuỗi đơn giản/);
});

test('apply (thử, không ghi): tìm file nạp sau cùng có khoá; khoá lạ báo lỗi', () => {
  const done = apply({ vi: { ot_title: 'Giải đấu Offline' } }, { dry: true });
  assert.deepStrictEqual(done, ['i18n-otour.js vi.ot_title']);
  assert.throws(() => apply({ vi: { khoa_khong_co_that: 'x' } }, { dry: true }), /khoá chưa có/);
});

test('setOne: khoá nằm ở khối ngôn ngữ thứ hai cùng file (vd. i18n-rapfi.js)', () => {
  const src = "X('vi', { a: 'Một' });\nX('en', { a: 'One' });\nif (ok) {\n  X('vi', { b: 'Hai' });\n}";
  const s = setOne(src, 'vi', 'b', 'Hai mới');
  assert.ok(s.includes("X('vi', { b: 'Hai mới' })") && s.includes("a: 'Một'"));
});
