// Hồi quy H-S5: một ván không được kéo dài vô hạn. Trước đây không có trần số nước: mỗi nước
// phát lại toàn bộ lịch sử cho cả phòng (O(n²)) và bản ghi ván lưu CSDL phình không giới hạn.
// Sau khi vá: chạm trần 2.000 nước thì ván tự hoà (thắng ngay tại nước cuối vẫn tính thắng).
// Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Room, DRAW, MAX_MOVES } = require('../src/room.js');

function room2(opts) {
  const r = new Room({ code: '1', password: '1', ...opts });
  r.addPlayer({ id: 'A', name: 'A' }, 1);
  r.addPlayer({ id: 'B', name: 'B' }, 2);
  return r;
}

// Ô thứ i trên lưới thưa (cách nhau 10 ô): không ô nào kề nhau nên không thể thành 5 quân
// liên tiếp, cũng không tạo nước cấm — ván chỉ có thể kết thúc vì chạm trần.
const cell = (i) => [(i % 45) * 10, Math.floor(i / 45) * 10];

const CAP = 2000; // trần theo đặc tả H-S5 (khớp hằng số MAX_MOVES trong room.js)

test('H-S5: ván chạm 2.000 nước tự hoà, không đi thêm được', () => {
  const r = room2({ opening: 'free', rule: 'vn' });
  for (let i = 0; i < CAP - 1; i++) {
    const [x, y] = cell(i);
    r.move(r.actor(), x, y);
  }
  assert.strictEqual(r.winner, null, 'chưa tới trần thì ván vẫn tiếp tục');
  const [x, y] = cell(CAP - 1);
  r.move(r.actor(), x, y);
  assert.strictEqual(r.winner, DRAW, 'nước thứ 2.000: ván tự hoà');
  assert.strictEqual(r.reason, 'draw');
  const [x2, y2] = cell(CAP);
  assert.throws(() => r.move(r.actor(), x2, y2), (e) => e.code === 'game_over', 'ván đã hoà thì không đi thêm');
});

test('H-S5: hằng số trần trong room.js đúng đặc tả', () => {
  assert.strictEqual(MAX_MOVES, CAP, 'MAX_MOVES phải là 2.000');
});

test('H-S5: thắng ngay trước trần vẫn tính thắng, không bị trần nuốt', () => {
  const r = room2({ opening: 'free', rule: 'free' });
  // A dựng 4 quân dọc ở cột 0 (cách xa lưới thưa), B đi các ô thưa; nước thắng là nước thứ 9
  r.move('A', 0, 0); r.move('B', 100, 100);
  r.move('A', 0, 1); r.move('B', 120, 100);
  r.move('A', 0, 2); r.move('B', 140, 100);
  r.move('A', 0, 3); r.move('B', 160, 100);
  r.move('A', 0, 4); // 5 quân liên tiếp -> thắng
  assert.strictEqual(r.winner, 1, 'X thắng như bình thường');
  assert.strictEqual(r.reason, 'win');
});
