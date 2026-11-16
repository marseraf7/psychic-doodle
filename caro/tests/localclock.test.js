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

test('đi lại với đồng hồ tổng: giây cộng của nước bị huỷ không được giữ (rà soát 16/11/2026, mục 19)', () => {
  const c = LC.create('5+3', 0);
  LC.run(c, 2, 0); // sau nước đầu của X: tới lượt O
  let now = 0, n = 1;
  const move = (p, think) => { now += think; LC.mark(c, n, now); LC.press(c, p, now); n++; LC.run(c, p === 1 ? 2 : 1, now); };
  move(2, 4000); // O nghĩ 4 giây rồi đi: 300 − 4 + 3
  assert.strictEqual(c.o, 299000);
  // Đi lại nước của O: quỹ giờ về đúng lúc O bấm (đã trừ 4 giây nghĩ, CHƯA cộng 3 giây)
  n--; assert.ok(LC.rewind(c, n, now)); LC.run(c, 2, now);
  assert.strictEqual(LC.left(c, 2, now), 296000);
  // Vòng đi → đi lại 20 lần (mỗi lần nghĩ 0,1 giây): quỹ giờ không tăng
  for (let i = 0; i < 20; i++) { move(2, 100); n--; LC.rewind(c, n, now); LC.run(c, 2, now); }
  assert.ok(LC.left(c, 2, now) <= 296000, 'không bơm được giây cộng: ' + LC.left(c, 2, now));
  assert.strictEqual(c.x, 300000, 'bên kia không đổi');
  // Không có mốc (vừa tải lại trang): giữ nguyên
  assert.strictEqual(LC.rewind(LC.create('5+3', 0), 3, 0), false);
});
