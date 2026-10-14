// Kiểm thử mục Thiết bị (hub/devices.js, store-sessions.js, useragent.js). Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const crypto = require('crypto');
const { start } = require('../server.js');
const { Store } = require('../src/store.js');
const { parseUA } = require('../src/useragent.js');

const UA = {
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36',
};

let app, url;
test.before(async () => {
  app = start({ port: 0, dataFile: null, msgRate: 2000 });
  await new Promise((r) => app.server.on('listening', r));
  url = `ws://127.0.0.1:${app.server.address().port}/ws`;
});
test.after(() => app.stop());

class Client {
  constructor() { this.msgs = []; this.waiters = []; }
  static async open(hello = {}, ua = UA.win) {
    const c = new Client();
    c.ws = new WebSocket(url, { headers: { 'user-agent': ua } });
    c.ws.on('message', (d) => {
      const m = JSON.parse(d);
      c.msgs.push(m);
      if (m.t === 'welcome') c.me = m.me;
      if (m.t === 'auth') c.token = m.token;
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    await new Promise((r) => c.ws.on('open', r));
    c.send({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex'), ...hello });
    await c.wait('welcome');
    return c;
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(t, pred = () => true, ms = 2000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Hết giờ chờ ' + t)), ms);
      this.waiters.push((m) => {
        if (m.t === t && pred(m)) { clearTimeout(timer); resolve(m); return true; }
        return false;
      });
    });
  }
  async req(m, t, pred) { const p = this.wait(t, pred); this.send(m); return p; }
  close() { this.ws.close(); }
}

test('useragent: hệ điều hành, trình duyệt, đời máy, app điện thoại', () => {
  assert.deepStrictEqual(parseUA(UA.win, 'web'), { os: 'Windows', browser: 'Chrome', model: '', app: false, mobile: false });
  const ip = parseUA(UA.iphone, 'web');
  assert.strictEqual(ip.os, 'iOS 17');
  assert.strictEqual(ip.browser, 'Safari');
  assert.ok(ip.mobile);
  const sm = parseUA(UA.samsung, 'web');
  assert.strictEqual(sm.os, 'Android 14');
  assert.strictEqual(sm.browser, 'Samsung Internet');
  assert.strictEqual(sm.model, 'SM-S918B');
  // Chrome Android mới giấu đời máy ("K")
  assert.strictEqual(parseUA('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36').model, '');
  const appA = parseUA(UA.samsung, 'android');
  assert.ok(appA.app);
  assert.strictEqual(appA.browser, '');
  assert.strictEqual(parseUA('', 'ios').os, 'iOS');
  assert.strictEqual(parseUA('Mozilla/5.0 (iPad; CPU OS 16_1 like Mac OS X) Safari/604.1').os, 'iPadOS 16');
  assert.strictEqual(parseUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/131.0').browser, 'Firefox');
  assert.strictEqual(parseUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17 Safari/605').os, 'macOS');
  assert.strictEqual(parseUA('Mozilla/5.0 (X11; Linux x86_64) Chrome/129 Safari/537 Edg/129').browser, 'Edge');
  assert.strictEqual(parseUA('Mozilla/5.0 (X11; Linux x86_64) Chrome/129 OPR/110').os, 'Linux');
  assert.strictEqual(parseUA('Mozilla/5.0 (X11; CrOS x86_64) Chrome/129 Safari/537 coc_coc_browser/120').browser, 'Cốc Cốc');
  assert.strictEqual(parseUA('Mozilla/5.0 (X11; CrOS x86_64) Chrome/129').os, 'ChromeOS');
  assert.deepStrictEqual(parseUA(null), { os: '', browser: '', model: '', app: false, mobile: false });
});

test('store: phiên có thông tin thiết bị, cập nhật lần hoạt động, xoá theo mã', () => {
  const s = new Store(null);
  const u = s.createUser({ username: 'dev_store', name: 'D' });
  const t1 = s.newSession(u.id, { platform: 'web', ua: UA.win, ip: '1.2.3.4' });
  const t2 = s.newSession(u.id, { platform: 'android', ua: UA.samsung, ip: '5.6.7.8' });
  let list = s.sessionsOf(u.id);
  assert.strictEqual(list.length, 2);
  assert.ok(list.every((x) => /^[0-9a-f]{16}$/.test(x.id)));
  // Hoạt động lại từ IP khác: ghi IP mới
  s.touchSession(t1, { platform: 'web', ua: UA.win, ip: '9.9.9.9' });
  s.touchSession(t1, { platform: 'web', ua: UA.win, ip: '9.9.9.9' }); // không đổi gì: bỏ qua
  s.touchSession('khong-co', {});
  s.touchSession(null);
  list = s.sessionsOf(u.id);
  assert.strictEqual(list.find((x) => x.platform === 'web').ip, '9.9.9.9');
  const id2 = list.find((x) => x.platform === 'android').id;
  assert.strictEqual(s.dropSessionById(u.id, 'zz'), false);
  assert.strictEqual(s.dropSessionById('nguoi-khac', id2), false, 'không xoá được phiên của tài khoản khác');
  assert.strictEqual(s.dropSessionById(u.id, id2), true);
  assert.strictEqual(s.userByToken(t2), null);
  assert.strictEqual(s.userByToken(t1), u);
});

test('Thiết bị: xem danh sách, đăng xuất một thiết bị, đăng xuất mọi thiết bị khác', async () => {
  const pc = await Client.open({}, UA.win);
  await pc.req({ t: 'register', username: 'dev_a', password: 'caro-pass1' }, 'welcome');
  const phone = await Client.open({}, UA.samsung);
  await phone.req({ t: 'login', username: 'dev_a', password: 'caro-pass1' }, 'welcome');
  const app2 = await Client.open({ client: { platform: 'ios' } }, UA.iphone);
  await app2.req({ t: 'login', username: 'dev_a', password: 'caro-pass1' }, 'welcome');

  // Khách không có mục Thiết bị
  const guest = await Client.open();
  assert.strictEqual((await guest.req({ t: 'devices' }, 'error')).code, 'need_account');

  let m = await pc.req({ t: 'devices' }, 'devices');
  assert.strictEqual(m.list.length, 3);
  assert.ok(m.list[0].current, 'thiết bị đang dùng đứng đầu');
  assert.strictEqual(m.list[0].os, 'Windows');
  assert.strictEqual(m.list[0].browser, 'Chrome');
  assert.ok(m.list.every((d) => d.online));
  const sm = m.list.find((d) => d.model === 'SM-S918B');
  assert.ok(sm && sm.mobile && !sm.app);
  assert.ok(m.list.find((d) => d.app && d.os === 'iOS 17'));
  assert.ok(m.list.every((d) => d.ip && d.created && d.seen));

  // Không tự đăng xuất thiết bị đang dùng bằng lệnh này; mã sai báo lỗi
  assert.strictEqual((await pc.req({ t: 'dropDevice', id: m.list[0].id }, 'error')).code, 'bad_message');
  assert.strictEqual((await pc.req({ t: 'dropDevice', id: '0123456789abcdef' }, 'error')).code, 'device_not_found');

  // Đăng xuất điện thoại: kết nối của nó về làm khách ngay
  const out = phone.wait('loggedOut');
  m = await pc.req({ t: 'dropDevice', id: sm.id }, 'devices');
  assert.strictEqual((await out).reason, 'revoked');
  assert.strictEqual(m.list.length, 2);
  assert.strictEqual((await phone.req({ t: 'devices' }, 'error')).code, 'no_hello', 'kết nối cũ không dùng được tài khoản nữa');
  assert.ok((await Client.open({ token: phone.token })).me.guest, 'token cũ hết hiệu lực');

  // Thiết bị đã đóng app: vẫn trong danh sách nhưng không trực tuyến
  app2.close();
  await new Promise((r) => setTimeout(r, 100));
  m = await pc.req({ t: 'devices' }, 'devices');
  assert.strictEqual(m.list.find((d) => d.app).online, false);

  // Đăng xuất mọi thiết bị khác
  const t = await pc.req({ t: 'dropOtherDevices' }, 'toast', (x) => x.code === 'devices_removed');
  assert.strictEqual(t.args.n, 1);
  m = pc.msgs.filter((x) => x.t === 'devices').pop();
  assert.strictEqual(m.list.length, 1);
  assert.ok(m.list[0].current);
  assert.ok(!(await Client.open({ token: pc.token })).me.guest, 'thiết bị đang dùng vẫn đăng nhập');
  assert.ok((await Client.open({ token: app2.token })).me.guest);
  [pc, phone, guest].forEach((c) => c.close());
});

test('đổi mật khẩu: thiết bị khác đang mở bị đăng xuất ngay', async () => {
  const a = await Client.open();
  await a.req({ t: 'register', username: 'dev_pw', password: 'caro-pass1' }, 'welcome');
  const b = await Client.open({ token: a.token }); // cùng phiên (2 thẻ trên cùng máy): giữ nguyên
  const c = await Client.open();
  await c.req({ t: 'login', username: 'dev_pw', password: 'caro-pass1' }, 'welcome');
  const out = c.wait('loggedOut');
  await a.req({ t: 'changePassword', current: 'caro-pass1', next: 'moi-pass2' }, 'toast', (m) => m.code === 'password_changed');
  await out;
  assert.ok(!b.msgs.some((m) => m.t === 'loggedOut'), 'cùng phiên với thiết bị đang dùng: không bị đăng xuất');
  const m = await a.req({ t: 'devices' }, 'devices');
  assert.strictEqual(m.list.length, 1);
  [a, b, c].forEach((x) => x.close());
});
