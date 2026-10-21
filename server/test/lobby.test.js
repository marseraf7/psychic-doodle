// Kiểm thử Sảnh (hub/lobby.js): pong kèm độ trễ máy chủ và số thật người online / ván đang đấu; tìm kỳ thủ theo tên.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const crypto = require('crypto');
const { start } = require('../server.js');

let app, url;
test.before(async () => {
  app = start({ port: 0, dataFile: null, msgRate: 2000, timers: { THROTTLE_SCALE: 0 } });
  await new Promise((r) => app.server.on('listening', r));
  url = `ws://127.0.0.1:${app.server.address().port}/ws`;
});
test.after(() => app.stop());

class Client {
  constructor() { this.msgs = []; this.waiters = []; }
  static async open(hello = {}) {
    const c = new Client();
    c.ws = new WebSocket(url);
    c.ws.on('message', (d) => {
      const m = JSON.parse(d);
      c.msgs.push(m);
      if (m.t === 'room') c.room = m.room;
      if (m.t === 'welcome') c.me = m.me;
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

const pong = async (c) => { app.hub.countsAt = null; return c.req({ t: 'ping' }, 'pong'); }; // bỏ số đếm đã giữ 5 giây

test('pong: số người online (mỗi người một lần dù mở nhiều kết nối) và số ván đang đấu là số thật', async () => {
  const a = await Client.open({ guestName: 'An' });
  let p = await pong(a);
  assert.strictEqual(p.players, 1);
  assert.strictEqual(p.games, 0);
  assert.ok(Number.isInteger(p.lag) && p.lag >= 0);
  const b = await Client.open({ guestName: 'Bình' });
  await a.req({ t: 'createRoom', side: 'second' }, 'room');
  await b.req({ t: 'joinRoom', code: a.room.code, password: a.room.password }, 'room');
  p = await pong(a);
  assert.strictEqual(p.players, 2);
  assert.strictEqual(p.games, 0, 'đủ 2 người nhưng chưa đi nước nào: chưa tính là đang đấu');
  await b.req({ t: 'move', x: 0, y: 0 }, 'room', (m) => m.room.moves.length === 1);
  p = await pong(a);
  assert.strictEqual(p.games, 1);
  // Cùng số liệu qua HTTP (update.sh --auto hỏi trước khi khởi động lại máy chủ)
  const st = await (await fetch(url.replace('ws:', 'http:').replace('/ws', '/api/stats'))).json();
  assert.deepStrictEqual(st, { players: 2, games: 1 });
  // Đã giữ số đếm: gọi dồn không đếm lại
  b.close();
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual((await a.req({ t: 'ping' }, 'pong')).players, 2);
  assert.strictEqual((await pong(a)).players, 1);
  a.close();
});

test('tìm kỳ thủ: theo đầu tên đăng nhập / tên hiển thị, bỏ @, tối đa 8, người đã chặn mình không hiện', async () => {
  const users = [];
  for (const [username, name] of [['tuan_anh', 'Tuấn Anh'], ['tuan99', 'Tú'], ['minh', 'Tuấn Minh'], ['lan', 'Lan']]) {
    const c = await Client.open();
    await c.req({ t: 'register', username, password: 'caro-pass1', name }, 'welcome');
    users.push(c);
  }
  const [, t99, minh, lan] = users;
  const r = await lan.req({ t: 'userSearch', q: '@TUAN', rid: 7 }, 'userSearch');
  assert.strictEqual(r.rid, 7);
  assert.strictEqual(r.q, 'tuan');
  // Khớp tên đăng nhập trước (tên ngắn trước), rồi khớp tên hiển thị ("Tuấn Minh" không khớp "tuan" – có dấu)
  assert.deepStrictEqual(r.users.map((u) => u.username), ['tuan99', 'tuan_anh']);
  assert.deepStrictEqual(Object.keys(r.users[0]).sort(), ['av', 'id', 'name', 'rating', 'status', 'username']);
  assert.strictEqual(r.users[0].status, 'online');
  // Theo tên hiển thị
  assert.deepStrictEqual((await lan.req({ t: 'userSearch', q: 'tuấn' }, 'userSearch')).users.map((u) => u.username).sort(), ['minh', 'tuan_anh']);
  // Dưới 2 ký tự: không tìm
  assert.deepStrictEqual((await lan.req({ t: 'userSearch', q: 't' }, 'userSearch')).users, []);
  // tuan99 chặn lan: lan không thấy tuan99 nữa, người khác vẫn thấy
  await t99.req({ t: 'block', id: lan.me.uid }, 'me');
  assert.deepStrictEqual((await lan.req({ t: 'userSearch', q: 'tuan' }, 'userSearch')).users.map((u) => u.username), ['tuan_anh']);
  assert.strictEqual((await minh.req({ t: 'userSearch', q: 'tuan' }, 'userSearch')).users.length, 2);
  // Khách cũng tìm được; nhiều người cùng đầu tên: tối đa 8
  const g = await Client.open({ guestName: 'Khách' });
  for (let i = 0; i < 9; i++) {
    const c = await Client.open();
    await c.req({ t: 'register', username: 'zz' + i, password: 'caro-pass1' }, 'welcome');
    c.close();
  }
  await new Promise((r2) => setTimeout(r2, 50));
  const many = await g.req({ t: 'userSearch', q: 'zz' }, 'userSearch');
  assert.strictEqual(many.users.length, 8);
  assert.ok(many.users.every((u) => u.status === 'offline'));
  for (const c of [...users, g]) c.close();
});

test('tìm kỳ thủ: gọi dồn thì lặng lẽ bỏ qua (đang gõ, không báo lỗi)', async () => {
  app.hub.T.THROTTLE_SCALE = 1;
  const c = await Client.open();
  const got = [];
  c.ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'userSearch' || m.t === 'error') got.push(m.t); });
  for (let i = 0; i < 5; i++) c.send({ t: 'userSearch', q: 'ab' + i });
  await new Promise((r) => setTimeout(r, 100));
  assert.deepStrictEqual(got, ['userSearch']);
  app.hub.T.THROTTLE_SCALE = 0;
  c.close();
});

test('trạng thái cho bạn bè: hoạt động trên máy (chỉ giá trị hợp lệ), ván đang đấu, online lần cuối khi offline', async () => {
  app.hub.T.THROTTLE_SCALE = 0;
  const a = await Client.open();
  await a.req({ t: 'register', username: 'pr_a', password: 'caro-pass1', name: 'A' }, 'welcome');
  const b = await Client.open();
  await b.req({ t: 'register', username: 'pr_b', password: 'caro-pass1', name: 'B' }, 'welcome');
  await a.req({ t: 'friendAdd', username: 'pr_b' }, 'friends');
  await b.req({ t: 'friendAdd', username: 'pr_a' }, 'friends', (m) => m.friends.length === 1);
  const fa = (m) => m.friends.find((f) => f.username === 'pr_a');

  // Chơi với máy: bạn bè thấy act + nhân vật máy
  a.send({ t: 'presence', act: 'bot', bot: 'boat' });
  let m = await b.wait('friends', (x) => fa(x) && fa(x).act === 'bot');
  assert.strictEqual(fa(m).bot, 'boat');
  assert.strictEqual(fa(m).status, 'online');
  // Giá trị lạ: coi như không làm gì (không lưu chuỗi tuỳ ý); tên nhân vật lạ: bỏ
  a.send({ t: 'presence', act: '<script>' });
  m = await b.wait('friends', (x) => fa(x) && !fa(x).act);
  a.send({ t: 'presence', act: 'bot', bot: 'x'.repeat(40) });
  m = await b.wait('friends', (x) => fa(x) && fa(x).act === 'bot');
  assert.strictEqual(fa(m).bot, undefined);
  // Gửi dồn: vẫn ra đúng giá trị cuối cùng
  app.hub.T.THROTTLE_SCALE = 1;
  for (const act of ['puzzle', 'learn', 'puzzle', 'learn']) a.send({ t: 'presence', act });
  m = await b.wait('friends', (x) => fa(x) && fa(x).act === 'learn', 4000);
  app.hub.T.THROTTLE_SCALE = 0;

  // Đang đấu ván online: bạn bè thấy loại ván, luật, thời gian (không còn act)
  await a.req({ t: 'createRoom', side: 'first', clock: '3+2', rule: 'free' }, 'room');
  const c = await Client.open({ guestName: 'Khách' });
  await c.req({ t: 'joinRoom', code: a.room.code, password: a.room.password }, 'room');
  a.send({ t: 'move', x: 0, y: 0 });
  m = await b.wait('friends', (x) => fa(x) && fa(x).status === 'playing');
  assert.deepStrictEqual(fa(m).game, { kind: 'room', rule: 'free', timeLimit: 0, clock: '3+2' });
  assert.strictEqual(fa(m).act, undefined);
  c.close();

  // Offline: online lần cuối
  const before = Date.now();
  a.close();
  m = await b.wait('friends', (x) => fa(x) && fa(x).status === 'offline');
  assert.ok(fa(m).seen >= before && fa(m).seen <= Date.now());
  assert.strictEqual(app.store.users.get(fa(m).id).seen, fa(m).seen);
  // Khách không báo được hoạt động (không có bạn bè)
  const g = await Client.open();
  g.send({ t: 'presence', act: 'bot' });
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(![...(app.hub.activity || new Map()).keys()].includes(g.me.id));
  b.close(); g.close();
});
