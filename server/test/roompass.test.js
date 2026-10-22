// Hồi quy M-S4: mật khẩu phòng trước đây chỉ có 3 số và được gửi trong view cho CẢ hai
// người chơi (đối thủ thấy được mật khẩu sẽ rò cho người thứ ba vào phòng). Sau khi vá:
// mật khẩu 6 số, và chỉ chủ phòng (người tạo) mới thấy mật khẩu trong view của mình.
// Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const crypto = require('crypto');
const { start } = require('../server.js');

let app, url;
test.before(async () => {
  app = start({ port: 0, dataFile: null });
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
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    await new Promise((r) => c.ws.on('open', r));
    c.send({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex') });
    await c.wait('welcome');
    return c;
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(t, pred = () => true, ms = 3000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Hết giờ chờ ' + t)), ms);
      this.waiters.push((m) => { if (m.t === t && pred(m)) { clearTimeout(timer); resolve(m); return true; } return false; });
    });
  }
  lastRoom() { const r = this.msgs.filter((m) => m.t === 'room' && m.room); return r.length ? r[r.length - 1].room : null; }
  async until(fn, ms = 3000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 25)); }
    return fn();
  }
  close() { this.ws.close(); }
}

test('M-S4: mật khẩu phòng 6 số và chỉ chủ phòng mới thấy', async () => {
  const host = await Client.open();
  const guest = await Client.open();
  const third = await Client.open();
  try {
    const created = host.wait('room', (m) => m.room && m.room.players.length === 1);
    host.send({ t: 'createRoom' });
    const hostRoom = (await created).room;
    assert.match(hostRoom.password, /^\d{6}$/, 'mật khẩu phòng phải có 6 số');
    const code = hostRoom.code;

    // Người thứ ba đoán sai mật khẩu: bị từ chối (luồng cũ giữ nguyên)
    const denied = third.wait('error', (m) => m.code === 'wrong_room_password');
    third.send({ t: 'joinRoom', code, password: hostRoom.password === '000000' ? '111111' : '000000' });
    await denied;

    // Khách vào đúng mật khẩu: vào được, nhưng view của khách KHÔNG chứa mật khẩu
    const joined = guest.wait('room', (m) => m.room && m.room.code === code && m.room.players.length === 2);
    guest.send({ t: 'joinRoom', code, password: hostRoom.password });
    const guestRoom = (await joined).room;
    assert.strictEqual(guestRoom.password, null, 'người vào chơi không được thấy mật khẩu phòng');

    // Chủ phòng vẫn thấy mật khẩu trong các view sau đó (để còn gửi cho bạn bè)
    const hostLatest = await host.until(() => { const r = host.lastRoom(); return r && r.players.length === 2 ? r : null; });
    assert.strictEqual(hostLatest.password, hostRoom.password, 'chủ phòng vẫn thấy đúng mật khẩu của phòng mình');
  } finally {
    host.close(); guest.close(); third.close();
  }
});
