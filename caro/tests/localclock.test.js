// Đồng hồ tổng khi chơi trên máy (caro/local-clock.js): chạy sau nước đầu, cộng giây, tạm dừng, hết giờ, khôi phục.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
global.window = { CaroTimeCtl: require('../timectl.js') };
require('../local-clock.js');
const LC = global.window.CaroLocalClock;

test('đồng hồ 2+1: chạy, cộng giây, tạm dừng, hết giờ', () => {
  assert.strictEqual(LC.create('11+1', 0), null, 'mức lạ: không có đồng hồ');
  const c = LC.create('2+1', 0);
  assert.deepStrictEqual([c.x, c.o, c.running], [120000, 120000, 0]);
  LC.run(c, 2, 1000); // X đi nước đầu (chưa tính giờ), tới lượt O
  LC.run(c, 2, 1500); // gọi lại không đổi gì
  assert.strictEqual(LC.left(c, 2, 11000), 110000);
  LC.press(c, 1, 11000); // không phải lượt X: bỏ qua
  LC.press(c, 2, 11000); // O đi xong sau 10 giây: +1 giây
  assert.strictEqual(c.o, 111000);
  LC.run(c, 1, 11000);
  LC.pause(c, 5000); // mở hộp thoại 5 giây: không tính
  assert.strictEqual(LC.left(c, 1, 21000), 115000);
  assert.ok(LC.left(c, 1, 11000 + 5000 + 120000) <= 0, 'hết giờ');
  const snap = LC.snapshot(c, 21000);
  assert.deepStrictEqual(snap, { spec: '2+1', x: 115000, o: 111000 });
  const back = LC.create('2+1', 0, snap);
  assert.deepStrictEqual([back.x, back.o], [115000, 111000], 'tải lại trang: giữ thời gian còn lại');
  assert.strictEqual(LC.create('2+1', 0, { x: -5, o: 1e12 }).x, 120000, 'số liệu hỏng: về thời gian gốc');
});
