// Hồi quy H-S4: quyền quản trị gắn theo ID tài khoản bất biến, không theo tên đăng nhập.
//  Lỗ cũ: isAdmin tra theo username — tài khoản quản trị tự xoá thì tên được giải phóng,
//  người lạ đăng ký lại đúng tên đó là nhận quyền quản trị ngay (duyệt câu lạc bộ/giải đấu,
//  xử tranh chấp, quyền sĩ quan mọi câu lạc bộ).
//  Sau khi vá: quyền gắn vào ID lúc khởi động (tài khoản có sẵn) hoặc lúc đăng ký (tên trong
//  cấu hình chưa có tài khoản — kèm cảnh báo/ghi log); tài khoản quản trị bị chặn tự xoá.
// Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');
const { start } = require('../server.js');

const PASS = 'Xk9!caroA#4821';

class Client {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.msgs = [];
    this.waiters = [];
    this.ws.on('message', (d) => {
      const m = JSON.parse(d);
      this.msgs.push(m);
      this.waiters = this.waiters.filter((w) => !w(m));
    });
  }
  open() { return new Promise((r) => this.ws.on('open', r)); }
  send(o) { this.ws.send(JSON.stringify(o)); }
  wait(pred, ms = 8000) {
    const hit = this.msgs.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('Hết giờ chờ tin')), ms);
      this.waiters.push((m) => { if (pred(m)) { clearTimeout(to); res(m); return true; } return false; });
    });
  }
  close() { try { this.ws.close(); } catch { /* đã đóng */ } }
}

async function boot(opts) {
  const app = start({ port: 0, dataFile: null, msgRate: 2000, admins: ['boss'], ...opts });
  await new Promise((r) => app.server.on('listening', r));
  return { app, url: `ws://127.0.0.1:${app.server.address().port}/ws` };
}

async function guest(url) {
  const c = new Client(url);
  await c.open();
  c.send({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex') });
  await c.wait((m) => m.t === 'welcome');
  return c;
}

test('H-S4: đăng ký trúng tên quản trị → quyền gắn theo ID; tài khoản quản trị không tự xoá được', async () => {
  const { app, url } = await boot({});
  const hub = app.hub;
  const c = await guest(url);
  c.send({ t: 'register', username: 'boss', password: PASS, name: 'Sếp' });
  const auth = await c.wait((m) => m.t === 'auth');
  const uid = hub.store.byUsername.get('boss').id;
  assert.ok(hub.adminIds.has(uid), 'quyền gắn theo ID tài khoản');
  assert.strictEqual(hub.store.users.get(uid).adminBind, 'boss', 'dấu gắn quyền lưu trên hồ sơ tài khoản');
  assert.ok(hub.isAdmin(uid));

  // Người thường đăng ký tên khác: không có quyền
  const c2 = await guest(url);
  c2.send({ t: 'register', username: 'thuong', password: PASS, name: 'Thường' });
  await c2.wait((m) => m.t === 'auth');
  const uid2 = hub.store.byUsername.get('thuong').id;
  assert.ok(!hub.isAdmin(uid2), 'tài khoản thường không có quyền');

  // Quản trị thử tự xoá tài khoản → bị chặn, tài khoản còn nguyên (lỗ chuyển quyền đã đóng)
  c.send({ t: 'deleteAccount', password: PASS });
  const err = await c.wait((m) => m.t === 'error');
  assert.strictEqual(err.code, 'admin_cannot_delete');
  assert.ok(hub.store.byUsername.get('boss'), 'tài khoản quản trị vẫn còn sau lần xoá bị chặn');
  assert.ok(hub.isAdmin(uid), 'quyền vẫn nguyên');

  c.close(); c2.close();
  app.stop();
});

test('H-S4: tài khoản có sẵn từ trước được gắn quyền lúc khởi động theo ID (kể cả sau khởi động lại)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-admin-'));
  const db = path.join(dir, 'caro.db');
  // Lần 1: chưa cấu hình quản trị — đăng ký tài khoản thường
  const b1 = await boot({ dataFile: db, admins: [] });
  const c = await guest(b1.url);
  c.send({ t: 'register', username: 'boss', password: PASS, name: 'Sếp' });
  await c.wait((m) => m.t === 'auth');
  const uid = b1.app.hub.store.byUsername.get('boss').id;
  assert.ok(!b1.app.hub.isAdmin(uid), 'chưa cấu hình: chưa có quyền');
  c.close();
  b1.app.stop();

  // Lần 2: cùng CSDL, cấu hình có tên boss → gắn quyền theo ID lúc khởi động
  const b2 = await boot({ dataFile: db, admins: ['boss'] });
  assert.ok(b2.app.hub.adminIds.has(uid), 'gắn quyền theo đúng ID cũ');
  assert.ok(b2.app.hub.isAdmin(uid));
  b2.app.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});
