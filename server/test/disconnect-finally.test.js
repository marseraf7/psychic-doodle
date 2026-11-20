/*
 * Rà soát cuối 20/11/2026: lỗi khi bỏ theo dõi (unwatch – ván xem, giải…) lúc đóng kết nối không được chặn bước gỡ kết
 * nối khỏi người chơi, kẻo họ thành "online ma" mãi (guardCall('disconnect') chỉ ghi log rồi bỏ qua phần còn lại).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Hub } = require('../src/hub/index.js');

test('disconnect: unwatch ném lỗi vẫn detach + wentOffline, rồi lỗi vẫn được báo lên', () => {
  const calls = [];
  const self = {
    conns: 1, lobbyWatchers: new Set(), closed: false,
    unwatch() { throw new Error('hỏng khi bỏ theo dõi'); },
    detach(c) { calls.push('detach:' + c.pid); },
    isOnline() { return false; },
    wentOffline(pid) { calls.push('offline:' + pid); },
  };
  const conn = { pid: 'u_1' };
  assert.throws(() => Hub.prototype.disconnect.call(self, conn), /hỏng khi bỏ theo dõi/);
  assert.deepStrictEqual(calls, ['detach:u_1', 'offline:u_1']);
  assert.strictEqual(conn.gone, true);
  assert.strictEqual(self.conns, 0);
});

test('disconnect: khách chưa hello (không pid) – không gỡ gì, không lỗi', () => {
  const self = { conns: 1, lobbyWatchers: new Set(), closed: false, unwatch() {}, detach() { throw new Error('không được gọi'); } };
  Hub.prototype.disconnect.call(self, {});
  assert.strictEqual(self.conns, 0);
});
