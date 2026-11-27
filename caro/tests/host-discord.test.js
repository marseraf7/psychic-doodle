// Discord Activity (caro/host-detect.js · detect / isDiscordLaunch, caro/host-discord.js · clientIdOf): nhận biết theo tham số
// khởi chạy Discord thêm vào (frame_id, instance_id, platform – như Embedded App SDK đòi) hoặc tên miền *.discordsays.com,
// không nhận nhầm trang web thường; client id công khai lấy từ tên miền, không có thì từ thẻ meta của máy chủ.
//   node --test caro/tests/host-discord.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { detect, isDiscordLaunch, startParam } = require('../host-detect.js');
const { clientIdOf } = require('../host-discord.js');

// Dạng tham số Discord thêm vào địa chỉ Activity (giá trị giả)
const LAUNCH = '?instance_id=i-1234567890-gc-111-222&location_id=gc-111-222&launch_id=abc&channel_id=222&frame_id=f-0a1b2c&platform=desktop&guild_id=111';

test('nhận biết Discord: đủ frame_id + instance_id + platform hợp lệ, hoặc tên miền discordsays.com', () => {
  assert.strictEqual(isDiscordLaunch(LAUNCH), true);
  assert.strictEqual(isDiscordLaunch(LAUNCH.replace('platform=desktop', 'platform=mobile')), true);
  assert.strictEqual(detect({ search: LAUNCH, hash: '' }), 'discord');
  assert.strictEqual(detect({ search: '', hash: '', hostname: '123456789012345678.discordsays.com' }), 'discord', 'tên miền của Discord');
  assert.strictEqual(detect({ search: '', hash: '', session: 'discord' }), 'discord', 'tải lại trong phiên');
});

test('không nhận nhầm: thiếu tham số, platform lạ, tên miền giống', () => {
  for (const q of ['', '?room=123456', '?frame_id=x', '?instance_id=x&platform=desktop', '?frame_id=x&instance_id=y',
    '?frame_id=x&instance_id=y&platform=web', '?frame_id=&instance_id=y&platform=desktop', '?host=discord']) {
    assert.strictEqual(isDiscordLaunch(q), false, q);
    assert.strictEqual(detect({ search: q, hash: '' }), null, q);
  }
  for (const h of ['discordsays.com.evil.example', 'evildiscordsays.com', 'discord.com', 'caroxo.duckdns.org', 'localhost']) {
    assert.strictEqual(detect({ search: '', hash: '', hostname: h }), null, h);
  }
  assert.strictEqual(detect({ search: '', hash: '', session: 'zalo' }), null);
});

test('Telegram / VK vẫn nhận như cũ khi có cả tham số lạ; Discord không có link sâu start_param', () => {
  assert.strictEqual(detect({ search: '?vk_app_id=1&sign=x&frame_id=a&instance_id=b&platform=desktop', hash: '' }), 'vk');
  assert.strictEqual(detect({ search: LAUNCH, hash: '#tgWebAppVersion=8.0' }), 'telegram');
  assert.strictEqual(startParam('discord', { search: LAUNCH + '&hash=room-123456', hash: '#room-1' }), '');
});

test('client id: từ tên miền <id>.discordsays.com, không có thì thẻ meta; sai dạng → null', () => {
  assert.strictEqual(clientIdOf('123456789012345678.discordsays.com', '999999'), '123456789012345678', 'tên miền đứng trước');
  assert.strictEqual(clientIdOf('localhost', ' 1234567 '), '1234567');
  assert.strictEqual(clientIdOf('abc.discordsays.com', ''), null);
  assert.strictEqual(clientIdOf('123456789012345678.discordsays.com.evil.example', ''), null);
  assert.strictEqual(clientIdOf('', '12ab'), null);
  assert.strictEqual(clientIdOf('', '"><script>'), null);
  assert.strictEqual(clientIdOf(undefined, undefined), null);
});
