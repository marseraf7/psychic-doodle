// Kiểm thử băm mật khẩu bất đồng bộ (scrypt chạy ở luồng phụ): không chặn máy chủ, không lọt giới hạn số lần thử.
// Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const crypto = require('crypto');
const { start } = require('../server.js');
const { hashPassword, checkPassword } = require('../src/store.js');

let app, url;
test.before(async () => {
  app = start({ port: 0, dataFile: null, msgRate: 2000 });
  await new Promise((r) => app.server.on('listening', r));
  url = `ws://127.0.0.1:${app.server.address().port}/ws`;
});
test.after(() => app.stop());

class Client {
  constructor() { this.msgs = []; this.waiters = []; }
  static async open() {
    const c = new Client();
    c.ws = new WebSocket(url);
    c.ws.on('message', (d) => {
      const m = JSON.parse(d);
      c.msgs.push(m);
      if (m.t === 'welcome') c.me = m.me;
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    await new Promise((r) => c.ws.on('open', r));
    c.send({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex') });
    await c.wait('welcome');
    return c;
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(t, pred = () => true, ms = 15000) {
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
const until = async (fn, ms = 15000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('Hết giờ chờ điều kiện');
    await new Promise((r) => setTimeout(r, 10));
  }
};

let seq = 0;
async function account() {
  for (const k of [...app.hub.fails.keys()]) if (k.startsWith('reg:')) app.hub.fails.delete(k);
  const c = await Client.open();
  const username = 'au_' + (++seq) + '_' + crypto.randomBytes(3).toString('hex');
  await c.req({ t: 'register', username, password: 'caro-pass1', name: 'Au' + seq }, 'welcome');
  return { c, username };
}

test('hashPassword / checkPassword: bất đồng bộ, đúng / sai mật khẩu, không có mật khẩu', async () => {
  const p = hashPassword('caro-pass1');
  assert.ok(p instanceof Promise, 'trả về Promise (không băm đồng bộ)');
  const pass = await p;
  assert.match(pass.salt, /^[0-9a-f]{32}$/);
  assert.match(pass.hash, /^[0-9a-f]{64}$/);
  assert.strictEqual(await checkPassword('caro-pass1', pass), true);
  assert.strictEqual(await checkPassword('caro-pass2', pass), false);
  assert.strictEqual(await checkPassword('caro-pass1', null), false);
  assert.notStrictEqual((await hashPassword('caro-pass1')).salt, pass.salt, 'muối ngẫu nhiên');
});

test('đăng nhập sai gửi dồn cùng lúc: vẫn chỉ 8 lần được thử, còn lại bị chặn (không lọt trong lúc đang băm)', async () => {
  const { c, username } = await account();
  c.close();
  const x = await Client.open();
  const errs = [];
  x.ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'error') errs.push(m.code); });
  for (let i = 0; i < 20; i++) x.send({ t: 'login', username, password: 'sai-mat-khau-' + i });
  await until(() => errs.length === 20);
  assert.strictEqual(errs.filter((e) => e === 'bad_login').length, 8, errs.join());
  assert.strictEqual(errs.filter((e) => e === 'too_many_attempts').length, 12, errs.join());
  x.close();
});

test('đăng nhập đúng không bị tính là lần sai; đổi mật khẩu sai / đúng', async () => {
  const { c, username } = await account();
  for (let i = 0; i < 10; i++) {
    const y = await Client.open();
    await y.req({ t: 'login', username, password: 'caro-pass1' }, 'welcome');
    y.close();
  }
  assert.ok(!app.hub.fails.get('login:' + '127.0.0.1:' + username)?.n, 'đúng mật khẩu: không còn đếm');
  assert.strictEqual((await c.req({ t: 'changePassword', current: 'sai-roi-1', next: 'caro-pass2' }, 'error')).code, 'wrong_password');
  await c.req({ t: 'changePassword', current: 'caro-pass1', next: 'caro-pass2' }, 'toast', (m) => m.code === 'password_changed');
  const z = await Client.open();
  assert.strictEqual((await z.req({ t: 'login', username, password: 'caro-pass1' }, 'error')).code, 'bad_login');
  await z.req({ t: 'login', username, password: 'caro-pass2' }, 'welcome');
  [c, z].forEach((k) => k.close());
});

test('trong lúc băm mật khẩu máy chủ vẫn trả lời người khác', async () => {
  const { c, username } = await account();
  c.close();
  const a = await Client.open();
  const b = await Client.open();
  const order = [];
  a.ws.on('message', (d) => { if (JSON.parse(d).t === 'welcome') order.push('a'); });
  b.ws.on('message', (d) => { if (JSON.parse(d).t === 'error') order.push('b'); });
  // 3 lần đăng nhập đúng (băm đồng bộ thì máy chủ đứng ~3 lần băm), rồi một lệnh rẻ từ người khác
  for (let i = 0; i < 3; i++) a.send({ t: 'login', username, password: 'caro-pass1' });
  await new Promise((r) => setTimeout(r, 5));
  b.send({ t: 'login', username: 'khong_co_ai_ten_nay', password: 'x' }); // không băm: trả lỗi ngay
  await until(() => order.length === 4);
  assert.notStrictEqual(order[order.length - 1], 'b', 'người khác không phải chờ hết các lần băm: ' + order.join());
  [a, b].forEach((k) => k.close());
});

test('kết nối đóng trong lúc đang băm: không gắn lại kết nối đã đóng (không "online ma")', async () => {
  const { c, username } = await account();
  const pid = 'u_' + c.me.uid;
  c.close();
  await until(() => !app.hub.isOnline(pid));
  const x = await Client.open();
  x.send({ t: 'login', username, password: 'caro-pass1' });
  x.ws.terminate(); // đóng ngay, trước khi băm xong
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(!app.hub.isOnline(pid), 'tài khoản không bị tính là đang online');
  for (const set of app.hub.byPid.values()) for (const conn of set) assert.ok(!conn.gone, 'kết nối đã đóng vẫn nằm trong byPid');
});
