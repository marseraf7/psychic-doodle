// Kiểm thử link sâu trong app (caro/native.js) — hồi quy H-A5:
// trước đây app không có appUrlOpen/getLaunchUrl nào: bấm link mời trên điện thoại
// có cài app vẫn bị đẩy ra trình duyệt. Sau khi vá: link mở app được chép đúng các
// tham số ?room= ?replay= ?t= ?club= vào địa chỉ của app để mã web sẵn có xử lý tiếp.
// Chạy: node --test caro/tests/native-links.test.js
'use strict';
const { DEFAULT_HOST: SITE_HOST, DEFAULT_ORIGIN: SITE_ORIGIN } = require('../../server/src/site.js'); // tên miền của game (một chỗ – set-domain.js)
const test = require('node:test');
const assert = require('node:assert');

const assigns = [];
const listeners = {};
global.window = {
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: {
      App: {
        addListener: (name, fn) => { listeners[name] = fn; },
        getLaunchUrl: async () => ({ url: SITE_ORIGIN + '/?room=123456' }),
        minimizeApp: async () => {}, exitApp: async () => {},
      },
    },
  },
};
global.document = {
  documentElement: { classList: { add() {} } },
  getElementById: () => null,
  querySelectorAll: () => [],
};
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
const store = new Map(); // sessionStorage của WebView: giữ qua các lần nạp lại trang trong cùng phiên app
global.sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
Object.defineProperty(globalThis, 'location', { value: { assign: (u) => assigns.push(u) }, configurable: true });
require('../native.js');

test('H-A5: link khởi động (getLaunchUrl) được đưa vào app', async () => {
  await new Promise((r) => setImmediate(r)); // chờ promise getLaunchUrl chạy xong
  assert.deepStrictEqual(assigns, ['/?room=123456'], 'link mời mở app lần đầu vào thẳng phòng');
  assert.strictEqual(typeof window.CaroNative.routeLink, 'function');
  assert.strictEqual(typeof listeners.appUrlOpen, 'function', 'có nghe sự kiện appUrlOpen');
});

test('H-A5: appUrlOpen chép đúng các tham số link, bỏ qua link không liên quan', () => {
  assigns.length = 0;
  listeners.appUrlOpen({ url: SITE_ORIGIN + '/?replay=AbC123' });
  listeners.appUrlOpen({ url: 'io.github.marseraf7.caro://open?t=XYZ&club=Q7' });
  listeners.appUrlOpen({ url: SITE_ORIGIN + '/' }); // không có tham số link
  listeners.appUrlOpen({ url: SITE_ORIGIN + '/?utm_source=chat' }); // tham số lạ
  window.CaroNative.routeLink('không phải link');
  assert.deepStrictEqual(assigns, ['/?replay=AbC123', '/?t=XYZ&club=Q7'],
    'chỉ các link phòng/xem lại/giải/câu lạc bộ mới điều hướng; link lạ và tham số lạ bị bỏ qua');
});

test('H-A5: nạp lại trang sau khi mở link khởi động không mở lại link đó (không tải lại mãi)', async () => {
  assigns.length = 0;
  // Mô phỏng location.assign nạp lại trang: native.js chạy lại, getLaunchUrl vẫn trả đúng link cũ
  delete require.cache[require.resolve('../native.js')];
  require('../native.js');
  await new Promise((r) => setImmediate(r));
  assert.deepStrictEqual(assigns, [], 'link khởi động đã xử lý trong phiên này thì bỏ qua');
});

test('C3: link tường thuật ?bc= (cả ?cls=) mở trong app – ?bc= vào thẳng broadcast.html của app', () => {
  assigns.length = 0;
  listeners.appUrlOpen({ url: SITE_ORIGIN + '/?bc=o.cup-2026' });
  listeners.appUrlOpen({ url: 'io.github.marseraf7.caro://open?bc=abc123&utm_source=zalo' });
  listeners.appUrlOpen({ url: SITE_ORIGIN + '/?cls=0123456789ab' });
  assert.deepStrictEqual(assigns, ['/broadcast.html?bc=o.cup-2026', '/broadcast.html?bc=abc123', '/?cls=0123456789ab']);
});

test('C3: trang chính của app mở bằng /?bc= (link bấm trong app) tự chuyển sang broadcast.html', () => {
  const replaced = [];
  const loc = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { value: { assign: (u) => assigns.push(u), replace: (u) => replaced.push(u), pathname: '/', search: '?bc=t9x' }, configurable: true });
  try {
    delete require.cache[require.resolve('../native.js')];
    require('../native.js');
    assert.deepStrictEqual(replaced, ['/broadcast.html?bc=t9x']);
    // Trang khác (broadcast.html đã có ?bc=) không chuyển lại
    replaced.length = 0;
    globalThis.location.pathname = '/broadcast.html';
    delete require.cache[require.resolve('../native.js')];
    require('../native.js');
    assert.deepStrictEqual(replaced, []);
  } finally {
    Object.defineProperty(globalThis, 'location', loc);
  }
});
