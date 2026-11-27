// Bản CrazyGames Full Launch (caro/portal-crazygames-full.js – làm sẵn, tắt mặc định): khi nào được xin quảng cáo midgame
// (chỉ điểm nghỉ, không online, cách nhau ≥ 3 phút) và phiên trong game so với tài khoản CrazyGames (đăng nhập / đăng xuất).
//   node --test caro/tests/portal-crazygames-full.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { adAllowed, sessionAction, AD_GAP_MS } = require('../portal-crazygames-full.js');

const NOW = 10 * AD_GAP_MS;
const rest = { full: true, playing: false, online: false, replay: false, busy: false, now: NOW, last: 0 };
test('quảng cáo midgame: chỉ bản Full, ở điểm nghỉ, không online / xem lại / đang chạy quảng cáo, cách lần trước ≥ 3 phút', () => {
  assert.strictEqual(adAllowed(rest), true);
  assert.strictEqual(adAllowed({ ...rest, full: false }), false, 'bản Basic: không bao giờ');
  assert.strictEqual(adAllowed({ ...rest, playing: true }), false, 'đang chơi');
  assert.strictEqual(adAllowed({ ...rest, online: true }), false, 'ván online (có tính giờ)');
  assert.strictEqual(adAllowed({ ...rest, replay: true }), false);
  assert.strictEqual(adAllowed({ ...rest, busy: true }), false);
  assert.strictEqual(adAllowed({ ...rest, last: NOW - AD_GAP_MS + 1 }), false, 'chưa đủ 3 phút');
  assert.strictEqual(adAllowed({ ...rest, last: NOW - AD_GAP_MS }), true);
  assert.strictEqual(adAllowed(null), false);
});

test('phiên theo tài khoản CrazyGames: khách + có CrazyGames → đăng nhập; đổi người / CrazyGames đăng xuất → đăng xuất phiên cũ', () => {
  assert.strictEqual(sessionAction({ cg: 'u1', guest: true, mine: '' }), 'login');
  assert.strictEqual(sessionAction({ cg: null, guest: true, mine: '' }), 'none', 'khách, chưa đăng nhập CrazyGames');
  assert.strictEqual(sessionAction({ cg: 'u1', guest: false, mine: 'u1' }), 'none', 'đúng người');
  assert.strictEqual(sessionAction({ cg: 'u2', guest: false, mine: 'u1' }), 'logout', 'máy dùng chung: người khác đăng nhập CrazyGames');
  assert.strictEqual(sessionAction({ cg: null, guest: false, mine: 'u1' }), 'logout', 'CrazyGames đã đăng xuất');
  assert.strictEqual(sessionAction({ cg: 'u1', guest: false, mine: '' }), 'logout', 'phiên tài khoản không đến từ CrazyGames này');
  assert.strictEqual(sessionAction({ cg: null, guest: false, mine: '' }), 'none', 'tài khoản cũ, không có CrazyGames: để nguyên');
});
