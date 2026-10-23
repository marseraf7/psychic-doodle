// Hồi quy C1 + C2: đổi danh tính trên một kết nối đang trong ván phải đi qua đúng
// luồng ngắt kết nối (xử thua khi offline), không được thoát ván / chuyển ghế.
//  C1: gửi lại hello giữa ván bằng guestKey mới → pid cũ bị xử thua (timeout).
//  C2a: khách đăng nhập giữa ván → giữ ghế cho tài khoản (hành vi đúng, giữ nguyên).
//  C2b: đang đăng nhập tài khoản X mà đăng nhập tiếp tài khoản Y giữa ván →
//       ghế vẫn của X, X bị xử thua khi offline; Y không cướp được ván.
// Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const crypto = require('crypto');
const { start } = require('../server.js');

let app, url;
test.before(async () => {
  app = start({
    port: 0, dataFile: null, msgRate: 2000,
    timers: { OFFLINE_FORFEIT_MS: 300, SECOND_MS: 20, NEXT_GAME_MS: 60, INVITE_TTL_MS: 1000 },
  });
  await new Promise((r) => app.server.on('listening', r));
  url = `ws://127.0.0.1:${app.server.address().port}/ws`;
});
test.after(() => app.stop());

class Client {
  constructor() { this.msgs = []; this.waiters = []; }
  static async open(guestKey) {
    const c = new Client();
    c.ws = new WebSocket(url);
    c.ws.on('message', (d) => {
      const m = JSON.parse(d);
      c.msgs.push(m);
      if (m.t === 'welcome') c.me = m.me;
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    await new Promise((r) => c.ws.on('open', r));
    c.send({ t: 'hello', guestKey: guestKey || crypto.randomBytes(16).toString('hex') });
    await c.wait('welcome');
    return c;
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(t, pred = () => true, ms = 8000) {
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastRoom = (c) => { const m = [...c.msgs].reverse().find((x) => x.t === 'room'); return m ? m.room : null; };
const until = async (fn, ms = 8000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('Hết giờ chờ điều kiện');
    await sleep(10);
  }
};
let seq = 0;
const PW = 'caro-pass1';

/** Đăng ký một tài khoản mới trên kết nối khách; trả về { c, username, pid } (kết nối đã đăng nhập). */
async function account() {
  for (const k of [...app.hub.fails.keys()]) if (k.startsWith('reg:')) app.hub.fails.delete(k);
  const c = await Client.open();
  const username = 'id_' + (++seq) + '_' + crypto.randomBytes(3).toString('hex');
  const w = await c.req({ t: 'register', username, password: PW, name: 'Id' + seq }, 'welcome');
  return { c, username, pid: w.me.id };
}

/** Mở phòng riêng 2 người: chủ phòng (phe 1) + người vào (phe 2). Trả về mã phòng. */
async function roomOfTwo(host, guest) {
  const created = await host.req(
    { t: 'createRoom', side: 1, timeLimit: 0, opening: 'free', rule: 'vn', public: false },
    'room', (m) => m.room && m.room.players.length === 1);
  const code = created.room.code;
  await guest.req({ t: 'joinRoom', code, password: created.room.password || '' },
    'room', (m) => m.room && m.room.players.length === 2);
  // Bản phòng gửi cho chủ phòng có thể đã đến trước khi kịp đăng ký chờ: đọc lịch sử tin.
  await until(() => { const r = lastRoom(host); return r && r.players.length === 2; });
  return code;
}

/** Mọi view phòng mà client đã nhận có người chơi mang pid này không. */
function sawPlayer(c, pid) {
  return c.msgs.some((m) => m.t === 'room' && m.room && m.room.players.some((p) => p.id === pid));
}

test('C1: gửi lại hello giữa ván bằng guestKey mới → bị xử thua, đối thủ thắng', async () => {
  const a = await Client.open();
  const b = await Client.open();
  await roomOfTwo(a, b);
  const aPid = a.me.id, bPid = b.me.id;

  // A "thoát thân": cùng một kết nối, gửi lại hello như một khách hoàn toàn mới
  const w2p = a.wait('welcome', (m) => m.me && m.me.id !== aPid);
  a.send({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex') });
  const w2 = await w2p;
  assert.ok(w2.me.id.startsWith('g_'), 'danh tính mới là khách');
  assert.strictEqual(w2.room, null, 'danh tính mới không ở trong phòng cũ');

  // Đối thủ B phải thắng vì A offline quá hạn — thay vì B bị ghi thua như trước khi vá
  const end = await b.wait('room', (m) => m.room && m.room.winner, 8000);
  assert.strictEqual(end.room.winner, 2, 'B (phe 2) thắng');
  assert.strictEqual(end.room.reason, 'timeout');
  assert.ok(end.room.players.some((p) => p.id === aPid), 'ghế thua vẫn mang pid cũ của A');
  assert.ok(end.room.players.some((p) => p.id === bPid));
  a.close(); b.close();
});

test('C2a: khách đăng nhập giữa ván → ghế được giữ cho tài khoản, ván không bị xử thua', async () => {
  const u = await account();
  u.c.close(); // tài khoản tồn tại sẵn; kết nối này chỉ để tạo tài khoản
  const g = await Client.open();
  const b = await Client.open();
  await roomOfTwo(g, b);

  const w = await g.req({ t: 'login', username: u.username, password: PW },
    'welcome', (m) => m.me && m.me.id === u.pid);
  assert.ok(w.room, 'sau đăng nhập vẫn ở trong phòng');
  assert.ok(w.room.players.some((p) => p.id === u.pid), 'ghế đã chuyển sang pid tài khoản');
  assert.strictEqual(w.room.winner, null);

  await sleep(1000); // quá 3 lần OFFLINE_FORFEIT_MS: không ai bị xử thua oan
  const lastB = [...b.msgs].reverse().find((m) => m.t === 'room');
  assert.strictEqual(lastB.room.winner, null, 'ván vẫn đang diễn ra');
  g.close(); b.close();
});

test('C2b: đổi sang tài khoản khác giữa ván → ghế không chuyển, tài khoản cũ bị xử thua', async () => {
  const x = await account();
  const y = await account();
  y.c.close();
  const b = await Client.open();
  await roomOfTwo(x.c, b);

  const w = await x.c.req({ t: 'login', username: y.username, password: PW },
    'welcome', (m) => m.me && m.me.id === y.pid);
  assert.strictEqual(w.room, null, 'tài khoản Y không được vào phòng của X');

  const end = await b.wait('room', (m) => m.room && m.room.winner, 8000);
  assert.strictEqual(end.room.winner, 2, 'đối thủ thắng vì X offline');
  assert.strictEqual(end.room.reason, 'timeout');
  assert.ok(end.room.players.some((p) => p.id === x.pid), 'ghế thua vẫn là của X');
  assert.ok(!sawPlayer(b, y.pid), 'Y không bao giờ xuất hiện trong phòng');
  x.c.close(); b.close();
});
