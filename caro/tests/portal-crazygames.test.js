// Bản cổng CrazyGames (caro/portal-crazygames.js): khi nào là "đang chơi" (gameplayStart / gameplayStop của SDK v3) và
// bộ theo dõi không gọi trùng, lỗi của SDK không lan ra game. Cờ bản cổng (caro/host-detect.js · portalOf).
//   node --test caro/tests/portal-crazygames.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { isPlaying, makeTracker } = require('../portal-crazygames.js');
const { portalOf, PORTALS } = require('../host-detect.js');

const base = { shell: false, replay: false, ext: false, winner: null, online: null };
test('đang chơi: bàn cờ đang hiện, ván chưa xong (máy, online đủ 2 người, câu đố / bài học)', () => {
  assert.strictEqual(isPlaying(base), true, 'ván với máy chưa xong');
  assert.strictEqual(isPlaying({ ...base, winner: 1 }), false, 'hết ván');
  assert.strictEqual(isPlaying({ ...base, shell: true }), false, 'đang ở Trang chủ / trang khác');
  assert.strictEqual(isPlaying({ ...base, replay: true }), false, 'xem lại ván');
  assert.strictEqual(isPlaying({ ...base, ext: true }), true, 'câu đố / bài học');
  assert.strictEqual(isPlaying({ ...base, online: { watch: false, winner: 0, players: 2 } }), true, 'online đủ 2 người');
  assert.strictEqual(isPlaying({ ...base, online: { watch: false, winner: 0, players: 1 } }), false, 'phòng đang chờ đối thủ');
  assert.strictEqual(isPlaying({ ...base, online: { watch: true, winner: 0, players: 2 } }), false, 'đang xem ván người khác');
  assert.strictEqual(isPlaying({ ...base, online: { watch: false, winner: 2, players: 2 } }), false, 'online hết ván');
  assert.strictEqual(isPlaying(null), false);
});

test('bộ theo dõi: chỉ gọi khi đổi trạng thái; SDK ném lỗi không làm hỏng game', () => {
  const ev = [];
  const t = makeTracker({ gameplayStart: () => ev.push('start'), gameplayStop: () => ev.push('stop') });
  assert.strictEqual(t(false), false, 'chưa chơi → không chơi: không gọi');
  t(true); t(true); t(false); t(false); t(1);
  assert.deepStrictEqual(ev, ['start', 'stop', 'start']);
  const bad = makeTracker({ gameplayStart: () => { throw new Error('sdk'); }, gameplayStop: () => {} });
  assert.doesNotThrow(() => bad(true));
});

test('cờ bản cổng: chỉ crazygames / itch', () => {
  assert.deepStrictEqual(PORTALS, ['crazygames', 'itch']);
  assert.strictEqual(portalOf('itch'), 'itch');
  for (const v of [undefined, null, '', 'CrazyGames', 'poki', 1]) assert.strictEqual(portalOf(v), null, String(v));
});
