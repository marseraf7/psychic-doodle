// Kiểm thử Board ở biên toạ độ và ô đã có quân (caro/rules.js) — hồi quy H-E1:
// khóa số cũ (x + 2^20) * 2^21 + (y + 2^20) trùng nhau ngoài khoảng ±1.048.576 nên hai ô
// khác nhau ghi đè lên nhau; play() đặt chồng làm cells và moves lệch nhau vĩnh viễn;
// winsIfPlaced() trên ô đã có quân thì xoá luôn quân đang nằm ở đó.
// Chạy: node --test caro/tests/rules-board.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../rules.js');
const { Board, X, O } = C;

test('H-E1: hai ô từng trùng khóa số cũ vẫn là hai ô khác nhau', () => {
  const b = new Board('free');
  b.play(0, 0, X);
  b.play(1, -2097152, O); // khóa số cũ: (1,-2097152) trùng khóa với (0,0)
  assert.strictEqual(b.get(0, 0), X, 'quân ở (0,0) còn nguyên');
  assert.strictEqual(b.get(1, -2097152), O, 'quân ở (1,-2097152) đọc đúng');
  assert.strictEqual(b.moves.length, 2);
  const m = b.undo();
  assert.deepStrictEqual([m.x, m.y], [1, -2097152]);
  assert.strictEqual(b.get(0, 0), X, 'undo ô xa không đụng tới ô gốc');
  assert.strictEqual(b.get(1, -2097152), C.EMPTY);
});

test('H-E1: play() vào ô đã có quân bị từ chối, bàn không đổi', () => {
  const b = new Board('vn');
  b.play(2, 2, X);
  assert.throws(() => b.play(2, 2, O), /occupied/, 'đặt chồng phải bị từ chối');
  assert.strictEqual(b.get(2, 2), X, 'quân cũ còn nguyên');
  assert.strictEqual(b.moves.length, 1, 'không ghi thêm nước trùng vào lịch sử');
  b.undo();
  assert.strictEqual(b.get(2, 2), C.EMPTY, 'undo sau đó vẫn khớp: ô trống, hết lệch cells/moves');
  b.play(2, 2, O); // ô đã trống lại thì đặt lại được bình thường
  assert.strictEqual(b.get(2, 2), O);
});

test('H-E1: winsIfPlaced() trên ô đã có quân trả false và không xoá quân', () => {
  const b = new Board('free');
  b.play(0, 0, X); b.play(5, 5, O); b.play(1, 0, X); b.play(6, 5, O); b.play(2, 0, X); b.play(7, 5, O); b.play(3, 0, X);
  assert.strictEqual(C.winsIfPlaced(b, 0, 0, X), false, 'ô đã có quân: không xét thắng');
  assert.strictEqual(b.get(0, 0), X, 'quân đang nằm trên ô vẫn còn sau winsIfPlaced');
  assert.strictEqual(C.winsIfPlaced(b, 4, 0, X), true, 'ô trống hoàn thành 5 quân vẫn báo thắng như cũ');
  assert.strictEqual(b.get(4, 0), C.EMPTY, 'đặt thử xong phải dọn sạch');
});

test('H-E1: toạ độ rất xa vẫn thắng/thua đúng luật', () => {
  const b = new Board('free');
  const bx = 3000000, by = -3000000; // ngoài hẳn khoảng an toàn của khóa số cũ
  for (let i = 0; i < 4; i++) { b.play(bx + i, by, X); b.play(bx + i, by + 10, O); }
  b.play(bx + 4, by, X);
  assert.ok(C.checkWin(b, bx + 4, by, X), '5 quân liền ở toạ độ xa vẫn thắng');
  assert.strictEqual(b.moves.length, 9);
});
