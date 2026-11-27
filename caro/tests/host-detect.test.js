// Nhận biết Mini App Telegram / VK trước khi thư viện của nền tảng nạp, và link sâu start_param / hash → ?room= ?replay=
// ?t= ?o=… của trang chính (caro/host-detect.js).
//   node --test caro/tests/host-detect.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { detect, startParam, parseStart, routeSearch, vkLaunch, ROUTE_KEYS } = require('../host-detect.js');

const TG_HASH = '#tgWebAppData=' + encodeURIComponent('query_id=AA&user=%7B%22id%22%3A1%7D&auth_date=1&start_param=o-giai-tuan&hash=x') + '&tgWebAppVersion=8.0&tgWebAppPlatform=android';
const VK = '?vk_access_token_settings=&vk_app_id=51234567&vk_are_notifications_enabled=0&vk_is_app_user=1&vk_language=ru&vk_platform=desktop_web&vk_ref=other&vk_ts=1700000000&vk_user_id=1&sign=abcDEF';

test('Telegram: #tgWebAppData / tgWebAppVersion, ?tgWebAppStartParam, TelegramWebviewProxy; VK: vk_app_id + sign', () => {
  assert.strictEqual(detect({ search: '', hash: TG_HASH }), 'telegram');
  assert.strictEqual(detect({ search: '', hash: '#tgWebAppVersion=7.0' }), 'telegram');
  assert.strictEqual(detect({ search: '?tgWebAppStartParam=room-123456', hash: '' }), 'telegram');
  assert.strictEqual(detect({ search: '?host=tg', hash: '', tgProxy: true }), 'telegram', 'app Telegram điện thoại (địa chỉ Web App có ?host=tg)');
  assert.strictEqual(detect({ search: '?room=123456', hash: '', tgProxy: true }), null, 'trình duyệt trong app Telegram mở link thường: không phải Mini App');
  assert.strictEqual(detect({ search: VK, hash: '' }), 'vk');
  assert.strictEqual(detect({ search: '?vk_app_id=1', hash: '' }), null, 'thiếu sign: không phải VK');
  assert.strictEqual(detect({ search: '?host=tg', hash: '' }), null, '?host=tg chỉ là dấu cho máy chủ – mở bằng trình duyệt thường không phải Telegram');
  assert.strictEqual(detect({ search: '', hash: '', session: 'vk' }), 'vk', 'tải lại trong phiên (mất tham số)');
  assert.strictEqual(detect({ search: '', hash: '', session: 'zalo' }), null);
  assert.strictEqual(detect({ search: '?room=123456', hash: '#x' }), null, 'trang chính: không gì cả');
});

test('start_param: ?tgWebAppStartParam trước, không có thì trong tgWebAppData; VK: tham số hash', () => {
  assert.strictEqual(startParam('telegram', { search: '?tgWebAppStartParam=room-123456', hash: TG_HASH }), 'room-123456');
  assert.strictEqual(startParam('telegram', { search: '', hash: TG_HASH }), 'o-giai-tuan');
  assert.strictEqual(startParam('telegram', { search: '', hash: '#tgWebAppVersion=8.0' }), '');
  assert.strictEqual(startParam('vk', { search: VK + '&hash=replay-AbC123', hash: '' }), 'replay-AbC123');
  assert.strictEqual(startParam('vk', { search: VK, hash: '' }), '');
  assert.strictEqual(startParam('vk', { search: VK, hash: '#room-123456' }), 'room-123456', 'VK đưa phần sau # vào location.hash');
  assert.strictEqual(startParam('vk', { search: VK + '&hash=t-abc', hash: '#room-1' }), 't-abc', 'tham số hash đứng trước');
  assert.strictEqual(startParam(null, { search: '?hash=room-1' }), '');
});

test('parseStart: loại link sâu đã biết, giá trị an toàn; dấu nối - _ =', () => {
  assert.deepStrictEqual(parseStart('room-123456'), { key: 'room', value: '123456' });
  assert.deepStrictEqual(parseStart('replay_AbC-12'), { key: 'replay', value: 'AbC-12' });
  assert.deepStrictEqual(parseStart('t=abc123'), { key: 't', value: 'abc123' });
  assert.deepStrictEqual(parseStart('o-giai-tuan-12'), { key: 'o', value: 'giai-tuan-12' });
  assert.deepStrictEqual(parseStart('u-minh.caro'), { key: 'u', value: 'minh.caro' });
  assert.deepStrictEqual(parseStart('room%3D654321'), { key: 'room', value: '654321' }, 'hash VK đã mã hoá');
  for (const bad of ['', 'room', 'room-', 'admin-1', 'room-<script>', 'room-' + 'x'.repeat(65), 'ROOM-1', '%E0%A4%A', 'bc-abc']) assert.strictEqual(parseStart(bad), null, bad);
  assert.deepStrictEqual(ROUTE_KEYS, ['room', 'replay', 't', 'o', 'club', 'u', 'cls']);
});

test('routeSearch: thêm tham số vào địa chỉ, giữ tham số của nền tảng; đã có link sâu thì thôi', () => {
  assert.strictEqual(routeSearch('?host=tg&tgWebAppStartParam=room-123456', 'room-123456'), '?host=tg&tgWebAppStartParam=room-123456&room=123456');
  assert.strictEqual(routeSearch('', 'replay-AbC'), '?replay=AbC');
  assert.strictEqual(routeSearch('?room=111111', 't-abc'), null);
  assert.strictEqual(routeSearch('?x=1', 'nope'), null);
});

test('vkLaunch: giữ nguyên văn vk_… + sign cho đăng nhập (Đợt 3), bỏ sign khỏi địa chỉ, luôn có host=vk', () => {
  const r = vkLaunch(VK + '&hash=room-1&vk_access_token_settings2=a%2Cb');
  assert.strictEqual(r.raw, VK.slice(1) + '&vk_access_token_settings2=a%2Cb', 'nguyên văn, đúng thứ tự, giữ mã hoá');
  assert.ok(!/sign=/.test(r.search) && /^\?host=vk&vk_access_token_settings=/.test(r.search) && /&hash=room-1/.test(r.search), r.search);
  assert.strictEqual(vkLaunch('?host=vk&vk_app_id=1&sign=x').search, '?host=vk&vk_app_id=1', 'đã có host: không thêm lần nữa');
  assert.strictEqual(vkLaunch('?vk_app_id=1'), null, 'không có sign');
  assert.strictEqual(vkLaunch(''), null);
  assert.strictEqual(vkLaunch('?signx=1&vk_app_id=1'), null, 'signx không phải sign');
});
