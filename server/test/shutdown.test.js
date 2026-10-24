// Tắt máy chủ khi còn ván đang chạy: hẹn giờ hết giờ / xử thua của phòng không được chạy sau khi CSDL đã đóng
// (trước đây: ghi kết quả ván vào CSDL đã đóng → "statement has been finalized", sập tiến trình).
// Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { start } = require('../server.js');

test('tắt máy chủ giữa ván: hẹn giờ hết giờ và xử thua của phòng không chạy nữa', async () => {
  const app = start({ port: 0, dataFile: null, timers: { SECOND_MS: 20, OFFLINE_FORFEIT_MS: 100 } });
  await new Promise((r) => app.server.on('listening', r));
  const room = app.hub.makeRoom('room', 1, 0, { clock: '1+0' }); // 1 phút = 1,2 giây
  room.addPlayer({ id: 'g:x', name: 'X' }, 1);
  room.addPlayer({ id: 'g:y', name: 'Y' }, 2);
  app.hub.scheduleClock(room);
  app.hub.armForfeit(room, 'g:x'); // X không online: đếm giờ xử thua
  const errors = [];
  const onErr = (e) => errors.push(e);
  process.on('uncaughtException', onErr);
  await app.stop();
  await new Promise((r) => setTimeout(r, 1600)); // quá hạn cả hai hẹn giờ
  process.off('uncaughtException', onErr);
  assert.deepStrictEqual(errors, [], 'không có lỗi sau khi tắt');
  assert.strictEqual(room.winner, null, 'ván không bị quyết toán sau khi máy chủ đã tắt');
});
