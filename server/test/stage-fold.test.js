'use strict';
// Khối "Tuỳ chọn nâng cao" thu gọn của giai đoạn (caro/tour-stage-fold.js): nhận ô ở giá trị mặc định, rút gọn lựa chọn dài,
// và (review 20/11/2026) thêm / bỏ giai đoạn thì khối đang mở đi theo đúng giai đoạn của nó – trước đây nhớ theo số thứ tự
// nên xoá giai đoạn 1 đang mở làm giai đoạn kế tiếp tự mở.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'caro', 'tour-stage-fold.js'), 'utf8');
function load() {
  const sb = { window: { CaroTourKit: { T: (k) => k } } };
  vm.createContext(sb);
  vm.runInContext(SRC, sb);
  return sb.window.CaroTourKit.stageFold;
}

test('isDefault / short: ô mặc định vào khối thu gọn, lựa chọn dài tách phần giải thích', () => {
  const F = load();
  assert.ok(F.isDefault('<input type="checkbox" data-k="direct">'));
  assert.ok(!F.isDefault('<input type="checkbox" data-k="direct" checked>'));
  assert.ok(F.isDefault('<input type="number" data-k="direct" value="0">'));
  assert.ok(!F.isDefault('<input type="number" data-k="direct" value="2">'));
  assert.ok(F.isDefault('<select data-k="x"><option value="a" selected>A</option><option value="b">B</option></select>'));
  assert.ok(!F.isDefault('<select data-k="x"><option value="a">A</option><option value="b" selected>B</option></select>'));
  assert.deepStrictEqual([...F.short('Chung kết tổng (nhánh thua thắng thì đá lại trận thứ hai)')], ['Chung kết tổng', 'nhánh thua thắng thì đá lại trận thứ hai']);
  assert.deepStrictEqual([...F.short('Ngắn (a)')], ['Ngắn (a)', '']);
});

test('shift: thêm giai đoạn ở đầu dời mọi khối mở +1; bỏ giai đoạn thì khối của nó đóng, khối sau dời −1', () => {
  const F = load();
  F.open.add(0); F.open.add(2);
  F.shift(0, 1); // thêm giai đoạn mới ở đầu
  assert.deepStrictEqual([...F.open].sort(), [1, 3]);
  F.shift(1, -1); // bỏ giai đoạn đang mở (số 1)
  assert.deepStrictEqual([...F.open].sort(), [2], 'giai đoạn đứng sau giai đoạn đã xoá không tự mở');
  F.shift(0, -1);
  assert.deepStrictEqual([...F.open], [1]);
});
