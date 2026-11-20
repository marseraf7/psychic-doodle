// Cài ứng dụng (caro/pwa-install.js – A4): chọn cách cài theo trình duyệt / nơi mở trang.
//   node --test caro/tests/pwa-install.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { kindOf, intentUrl } = require('../pwa-install.js');

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const ZALO = CHROME_ANDROID + ' Zalo android/12100737 ZaloTheme/light ZaloLanguage/vi';
const MESSENGER_IOS = SAFARI_IPHONE.replace('Safari/604.1', '[FBAN/MessengerForiOS;FBAV/440.0]');
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';

test('có hộp cài của trình duyệt (beforeinstallprompt): nút Cài đặt', () => {
  assert.strictEqual(kindOf({ ua: CHROME_ANDROID, prompt: true }), 'prompt');
});
test('iPhone / iPad: gợi ý Chia sẻ → Thêm vào MH chính (cả iPad báo là Mac)', () => {
  assert.strictEqual(kindOf({ ua: SAFARI_IPHONE }), 'ios');
  assert.strictEqual(kindOf({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', touchMac: true }), 'ios');
});
test('trình duyệt trong Zalo / Messenger: gợi ý mở bằng trình duyệt, kể cả khi có hộp cài', () => {
  assert.strictEqual(kindOf({ ua: ZALO, prompt: true }), 'inapp');
  assert.strictEqual(kindOf({ ua: MESSENGER_IOS }), 'inapp');
  assert.strictEqual(kindOf({ ua: CHROME_ANDROID + ' [FB_IAB/Orca-Android;FBAV/440.0.0.30.110;]' }), 'inapp');
});
test('ẩn: app điện thoại, app máy tính, đã cài, trình duyệt không cài được', () => {
  assert.strictEqual(kindOf({ ua: CHROME_ANDROID, prompt: true, native: true }), 'none');
  assert.strictEqual(kindOf({ ua: ZALO, tauri: true }), 'none');
  assert.strictEqual(kindOf({ ua: SAFARI_IPHONE, standalone: true }), 'none');
  assert.strictEqual(kindOf({ ua: FIREFOX }), 'none');
});
test('link mở thẳng Chrome trên Android giữ nguyên đường dẫn và tham số', () => {
  assert.strictEqual(intentUrl('https://caro.example/?t=abc'), 'intent://caro.example/?t=abc#Intent;scheme=https;package=com.android.chrome;end');
});
