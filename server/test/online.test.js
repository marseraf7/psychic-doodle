// Kiểm thử máy chủ bằng các client WebSocket thật. Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const crypto = require('crypto');
const { start } = require('../server.js');

let app, url;
test.before(async () => {
  app = start({
    port: 0,
    dataFile: null,
    googleClientId: 'test-client',
    verifyGoogle: async (cred) => {
      if (!cred.startsWith('ok:')) throw new Error('bad');
      const [, sub, email, name] = cred.split(':');
      return { sub, email, name };
    },
    timers: { NEXT_GAME_MS: 50, OFFLINE_FORFEIT_MS: 200, INVITE_TTL_MS: 500, SECOND_MS: 20 }, // 1 "giây" = 20ms
  });
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
      if (m.t === 'welcome') { c.me = m.me; c.room = m.room; }
      if (m.t === 'me') c.me = m.me;
      if (m.t === 'friends') c.friends = m;
      if (m.t === 'auth') c.token = m.token;
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    await new Promise((r) => c.ws.on('open', r));
    c.guestKey = hello.guestKey || crypto.randomBytes(16).toString('hex');
    c.send({ t: 'hello', guestKey: c.guestKey, ...hello });
    await c.wait('welcome');
    return c;
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(t, pred = () => true, ms = 2000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Hết giờ chờ ' + t + ' ' + pred.toString() + ' | cuối: ' + JSON.stringify(this.msgs.filter((m) => m.t === 'error')))), ms);
      this.waiters.push((m) => {
        if (m.t === t && pred(m)) { clearTimeout(timer); resolve(m); return true; }
        return false;
      });
    });
  }
  async req(m, t, pred) { const p = this.wait(t, pred); this.send(m); return p; }
  close() { this.ws.close(); }
}

const side = (room, pid) => (room.seats.x === pid ? 1 : room.seats.o === pid ? 2 : 0);

// Đánh 1 nước và chờ cả 2 client nhận được trạng thái mới.
async function move(who, other, x, y) {
  const n = who.room.moves.length + 1;
  const done = (m) => m.room && (m.room.moves.length === n || !!m.room.winner);
  const p = Promise.all([who.wait('room', done), other.room.moves.length === n ? null : other.wait('room', done)]);
  who.send({ t: 'move', x, y });
  await p;
}

async function playWin(winner, loser) {
  // Người thắng đánh 4 quân ngang không bị chặn ở hàng 0, người thua đánh rải rác ở hàng 5.
  let turnOf = side(winner.room, winner.me.id) === winner.room.turn ? winner : loser;
  let i = 0, j = 0;
  while (!winner.room.winner) {
    if (turnOf === winner) await move(winner, loser, i++, 0);
    else await move(loser, winner, (j++) * 3, 5);
    turnOf = turnOf === winner ? loser : winner;
  }
}

test('phòng: tạo, sai/đúng mật khẩu, chọn đi sau, thắng, tái đấu đổi bên', async () => {
  const a = await Client.open({ guestName: 'An' });
  const b = await Client.open({ guestName: 'Bình' });
  await a.req({ t: 'createRoom', side: 'second' }, 'room');
  const { code, password } = a.room;
  assert.match(code, /^\d{6}$/);
  assert.match(password, /^\d{3}$/);
  assert.strictEqual(side(a.room, a.me.id), 2, 'chủ phòng chọn đi sau -> cầm O');

  const wrong = String((Number(password) + 1) % 1000).padStart(3, '0');
  const err = await b.req({ t: 'joinRoom', code, password: wrong }, 'error');
  assert.match(err.msg, /mật khẩu/);
  const bad = await b.req({ t: 'joinRoom', code: '000000', password }, 'error');
  assert.match(bad.msg, /Không tìm thấy/);

  await b.req({ t: 'joinRoom', code, password }, 'room');
  assert.strictEqual(b.room.players.length, 2);
  assert.strictEqual(side(b.room, b.me.id), 1, 'người vào sau cầm X, đi trước');

  // Không đúng lượt thì bị từ chối.
  const e2 = await a.req({ t: 'move', x: 0, y: 0 }, 'error');
  assert.match(e2.msg, /lượt/);

  await playWin(b, a);
  assert.strictEqual(b.room.winner, 1);
  assert.strictEqual(b.room.score[b.me.id], 1);

  // Người thứ 3 không vào được.
  const c = await Client.open();
  const full = await c.req({ t: 'joinRoom', code, password }, 'error');
  assert.match(full.msg, /đủ/);

  // Tái đấu: cần cả 2 bấm, ván mới đổi bên đi trước.
  await a.req({ t: 'rematch' }, 'room', (m) => m.room.rematch.length === 1);
  await b.req({ t: 'rematch' }, 'room', (m) => m.room.gameNo === 2);
  assert.strictEqual(side(b.room, a.me.id), 1, 'ván 2: A đi trước');
  assert.strictEqual(b.room.moves.length, 0);
  await playWin(a, b);
  await a.req({ t: 'rematch' }, 'room');
  await b.req({ t: 'rematch' }, 'room', (m) => m.room.gameNo === 3);
  assert.strictEqual(side(b.room, b.me.id), 1, 'ván 3: lại đổi, B đi trước');
  assert.deepStrictEqual(b.room.score, { [a.me.id]: 1, [b.me.id]: 1 });

  // Đầu hàng.
  await a.req({ t: 'resign' }, 'room', (m) => m.room.reason === 'resign');
  assert.strictEqual(a.room.winner, side(a.room, b.me.id));
  [a, b, c].forEach((x) => x.close());
});

test('mất kết nối khi đang đánh: kết nối lại vẫn ở trong phòng, quá hạn thì xử thua', async () => {
  const a = await Client.open();
  const b = await Client.open();
  await a.req({ t: 'createRoom', side: 'first' }, 'room');
  await b.req({ t: 'joinRoom', code: a.room.code, password: a.room.password }, 'room');
  await a.req({ t: 'move', x: 0, y: 0 }, 'room', (m) => m.room.moves.length === 1);

  b.close();
  await a.wait('room', (m) => m.room.players.some((p) => !p.online));
  const b2 = await Client.open({ guestKey: b.guestKey });
  assert.ok(b2.room, 'kết nối lại được trả về phòng cũ');
  assert.strictEqual(b2.room.moves.length, 1);
  await b2.req({ t: 'move', x: 1, y: 1 }, 'room', (m) => m.room.moves.length === 2);

  b2.close();
  const m = await a.wait('room', (x) => x.room.reason === 'timeout', 3000);
  assert.strictEqual(m.room.winner, side(m.room, a.me.id));
  a.close();
});

test('tài khoản, kết bạn, trạng thái online, thách đấu Bo3 đổi bên mỗi ván', async () => {
  const a = await Client.open();
  await a.req({ t: 'register', username: 'an_test', password: '123456', name: 'An' }, 'welcome');
  assert.strictEqual(a.me.username, 'an_test');
  const dup = await a.req({ t: 'register', username: 'an_test', password: '123456' }, 'error');
  assert.match(dup.msg, /đã có/);

  const b = await Client.open();
  await b.req({ t: 'register', username: 'binh_test', password: 'abcdef', name: 'Bình' }, 'welcome');

  // Đăng nhập lại bằng token.
  const a2 = await Client.open({ token: a.token });
  assert.strictEqual(a2.me.username, 'an_test');
  a2.close();
  const badLogin = await (await Client.open()).req({ t: 'login', username: 'an_test', password: 'sai' }, 'error');
  assert.match(badLogin.msg, /Sai/);

  // Chưa là bạn thì không thách đấu được.
  const e = await a.req({ t: 'challenge', to: b.me.uid, bestOf: 3 }, 'error');
  assert.match(e.msg, /bạn bè/);

  await a.req({ t: 'friendAdd', username: 'binh_test' }, 'friends', (m) => m.outgoing.length === 1);
  await b.wait('friends', (m) => m.incoming.length === 1).catch(() => {});
  await b.req({ t: 'friendRespond', id: a.me.uid, accept: true }, 'friends', (m) => m.friends.length === 1);
  if (a.friends.friends.length !== 1) await a.wait('friends', (m) => m.friends.length === 1);
  assert.strictEqual(a.friends.friends[0].status, 'online');

  // Thách đấu Bo3, người mời đi trước.
  const invP = b.wait('invite');
  a.send({ t: 'challenge', to: b.me.uid, bestOf: 3, first: 'me' });
  const inv = await invP;
  assert.strictEqual(inv.invite.bestOf, 3);
  const roomP = a.wait('room', (m) => m.room && m.room.kind === 'series');
  await b.req({ t: 'challengeRespond', id: inv.invite.id, accept: true }, 'room');
  await roomP;
  assert.strictEqual(side(a.room, a.me.id), 1, 'ván 1: người mời đi trước');
  if (a.friends.friends[0].status !== 'playing') await a.wait('friends', (m) => m.friends[0].status === 'playing');

  await playWin(a, b); // 1-0
  await a.wait('room', (m) => m.room.gameNo === 2 && !m.room.winner);
  if (b.room.gameNo !== 2) await b.wait('room', (m) => m.room.gameNo === 2);
  assert.strictEqual(side(a.room, b.me.id), 1, 'ván 2: đổi bên, B đi trước');
  await playWin(b, a); // 1-1
  await a.wait('room', (m) => m.room.gameNo === 3 && !m.room.winner);
  if (b.room.gameNo !== 3) await b.wait('room', (m) => m.room.gameNo === 3);
  assert.strictEqual(side(a.room, a.me.id), 1, 'ván 3: lại đổi, A đi trước');
  await playWin(a, b); // 2-1 -> A thắng chung cuộc
  assert.strictEqual(a.room.seriesWinner, a.me.id);
  const late = await a.req({ t: 'move', x: 50, y: 50 }, 'error');
  assert.match(late.msg, /kết thúc/);

  // Thống kê được cập nhật.
  const a3 = await Client.open({ token: a.token });
  assert.deepStrictEqual(a3.me.stats, { wins: 2, losses: 1, draws: 0 });
  a3.close();

  // Offline -> bạn bè thấy trạng thái offline.
  const offP = a.wait('friends', (m) => m.friends[0].status === 'offline');
  b.close();
  await offP;
  a.close();
});

test('thách đấu ngẫu nhiên / đối thủ đi trước, từ chối và hết hạn', async () => {
  const a = await Client.open();
  await a.req({ t: 'register', username: 'c_test', password: '123456' }, 'welcome');
  const b = await Client.open();
  await b.req({ t: 'register', username: 'd_test', password: '123456' }, 'welcome');
  await a.req({ t: 'friendAdd', username: 'd_test' }, 'friends', (m) => m.outgoing.length === 1);
  await b.req({ t: 'friendAdd', username: 'c_test' }, 'friends', (m) => m.friends.length === 1); // tự chấp nhận

  let inv = b.wait('invite');
  a.send({ t: 'challenge', to: b.me.uid, bestOf: 5, first: 'them' });
  const i1 = await inv;
  const toast = a.wait('toast', (m) => /từ chối/.test(m.msg));
  b.send({ t: 'challengeRespond', id: i1.invite.id, accept: false });
  await toast;

  inv = b.wait('invite');
  a.send({ t: 'challenge', to: b.me.uid, bestOf: 1, first: 'random' });
  await inv;
  await a.wait('toast', (m) => /không trả lời/.test(m.msg), 2000);

  inv = b.wait('invite');
  a.send({ t: 'challenge', to: b.me.uid, bestOf: 5, first: 'them' });
  const i3 = await inv;
  await b.req({ t: 'challengeRespond', id: i3.invite.id, accept: true }, 'room');
  assert.strictEqual(b.room.bestOf, 5);
  assert.strictEqual(side(b.room, b.me.id), 1, 'chọn "đối thủ đi trước"');
  a.close(); b.close();
});

test('đăng nhập / liên kết Google', async () => {
  const g = await Client.open();
  await g.req({ t: 'google', credential: 'ok:sub1:gia.bao@gmail.com:Gia Bảo' }, 'welcome', (m) => !m.me.guest);
  assert.strictEqual(g.me.name, 'Gia Bảo');
  assert.strictEqual(g.me.username, 'gia.bao');
  const again = await Client.open();
  await again.req({ t: 'google', credential: 'ok:sub1:gia.bao@gmail.com:Gia Bảo' }, 'welcome', (m) => !m.me.guest);
  assert.strictEqual(again.me.uid, g.me.uid, 'cùng tài khoản Google -> cùng tài khoản');

  const u = await Client.open();
  await u.req({ t: 'register', username: 'link_test', password: '123456' }, 'welcome');
  await u.req({ t: 'google', credential: 'ok:sub2:x@gmail.com:X' }, 'me');
  assert.strictEqual(u.me.google, true);
  const taken = await u.req({ t: 'google', credential: 'ok:sub1:gia.bao@gmail.com:G' }, 'error');
  assert.match(taken.msg, /đã liên kết/);
  const bad = await (await Client.open()).req({ t: 'google', credential: 'fake' }, 'error');
  assert.match(bad.msg, /Không xác minh/);
  [g, again, u].forEach((x) => x.close());
});

test('khách đang trong phòng rồi đăng nhập vẫn giữ chỗ', async () => {
  const a = await Client.open();
  const b = await Client.open();
  await a.req({ t: 'createRoom', side: 'first' }, 'room');
  await b.req({ t: 'joinRoom', code: a.room.code, password: a.room.password }, 'room');
  await a.req({ t: 'register', username: 'mig_test', password: '123456' }, 'welcome');
  assert.ok(a.room && a.room.players.some((p) => p.id === a.me.id));
  assert.strictEqual(side(a.room, a.me.id), 1);
  a.close(); b.close();
});

test('bảo mật: header an toàn, chặn spam tin nhắn, token không lưu dạng gốc', async () => {
  const port = app.server.address().port;
  const r = await fetch(`http://127.0.0.1:${port}/`);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.strictEqual(r.headers.get('x-frame-options'), 'DENY');
  assert.strictEqual((await fetch(`http://127.0.0.1:${port}/`, { method: 'POST' })).status, 405);
  assert.strictEqual((await fetch(`http://127.0.0.1:${port}/..%2fserver%2fserver.js`)).status, 404);

  const u = await Client.open();
  await u.req({ t: 'register', username: 'sec_test', password: '123456' }, 'welcome');
  const raw = app.store.db.prepare('SELECT hash FROM sessions').all().map((r) => r.hash);
  assert.ok(raw.length && !raw.includes(u.token), 'không lưu token gốc');
  const again = await Client.open({ token: u.token });
  assert.strictEqual(again.me.username, 'sec_test');
  const bogus = await Client.open({ token: { evil: 1 } });
  assert.strictEqual(bogus.me.guest, true);

  const spam = await Client.open();
  const closed = new Promise((r2) => spam.ws.on('close', r2));
  for (let i = 0; i < 200; i++) spam.send({ t: 'setName', name: 'x' + i });
  await closed;
  [u, again, bogus].forEach((x) => x.close());
});

test('giới hạn thử sai theo từng phòng / tài khoản, không khoá cả IP (CGNAT)', async () => {
  const a = await Client.open();
  const b = await Client.open();
  const c = await Client.open();
  await a.req({ t: 'createRoom', side: 'first' }, 'room');
  await b.req({ t: 'createRoom', side: 'first' }, 'room');
  const wrong = String((Number(a.room.password) + 1) % 1000).padStart(3, '0');
  for (let i = 0; i < 8; i++) await c.req({ t: 'joinRoom', code: a.room.code, password: wrong }, 'error');
  const locked = await c.req({ t: 'joinRoom', code: a.room.code, password: a.room.password }, 'error');
  assert.match(locked.msg, /quá nhiều/);
  // Cùng IP nhưng phòng khác vẫn vào được.
  await c.req({ t: 'joinRoom', code: b.room.code, password: b.room.password }, 'room');
  assert.strictEqual(c.room.code, b.room.code);

  const u = await Client.open();
  await u.req({ t: 'register', username: 'rl_one', password: '123456' }, 'welcome');
  await u.req({ t: 'register', username: 'rl_two', password: '123456' }, 'welcome');
  const d = await Client.open();
  for (let i = 0; i < 8; i++) await d.req({ t: 'login', username: 'rl_one', password: 'sai' }, 'error');
  assert.match((await d.req({ t: 'login', username: 'rl_one', password: '123456' }, 'error')).msg, /quá nhiều/);
  await d.req({ t: 'login', username: 'rl_two', password: '123456' }, 'welcome', (m) => !m.me.guest);
  [a, b, c, u, d].forEach((x) => x.close());
});

test('mất kết nối trước nước đầu tiên vẫn bị xử thua', async () => {
  const a = await Client.open();
  const b = await Client.open();
  await a.req({ t: 'createRoom', side: 'first' }, 'room');
  await b.req({ t: 'joinRoom', code: a.room.code, password: a.room.password }, 'room');
  a.close(); // A cầm X, chưa đánh nước nào
  const m = await b.wait('room', (x) => x.room.reason === 'timeout', 3000);
  assert.strictEqual(m.room.winner, 2);
  b.close();
});

test('Bo3: rớt mạng giữa 2 ván thì ván sau vẫn bị xử thua, không treo', async () => {
  const a = await Client.open();
  await a.req({ t: 'register', username: 'gap_a', password: '123456' }, 'welcome');
  const b = await Client.open();
  await b.req({ t: 'register', username: 'gap_b', password: '123456' }, 'welcome');
  await a.req({ t: 'friendAdd', username: 'gap_b' }, 'friends', (m) => m.outgoing.length === 1);
  await b.req({ t: 'friendAdd', username: 'gap_a' }, 'friends', (m) => m.friends.length === 1);
  const inv = b.wait('invite');
  a.send({ t: 'challenge', to: b.me.uid, bestOf: 3, first: 'me' });
  const i = await inv;
  const roomA = a.wait('room', (m) => m.room && m.room.kind === 'series');
  await b.req({ t: 'challengeRespond', id: i.invite.id, accept: true }, 'room');
  await roomA;
  await playWin(a, b);
  b.close(); // rớt mạng ngay sau ván 1
  const m = await a.wait('room', (x) => x.room.gameNo === 2 && x.room.reason === 'timeout', 3000);
  assert.strictEqual(m.room.score[a.me.id], 2);
  assert.strictEqual(m.room.seriesWinner, a.me.id);
  a.close();
});

test('đăng xuất khi đang trong phòng thì rời phòng luôn', async () => {
  const a = await Client.open();
  await a.req({ t: 'register', username: 'out_a', password: '123456' }, 'welcome');
  const b = await Client.open();
  await a.req({ t: 'createRoom', side: 'first' }, 'room');
  await b.req({ t: 'joinRoom', code: a.room.code, password: a.room.password }, 'room');
  await move(a, b, 0, 0);
  const gone = b.wait('room', (m) => m.room.players.length === 1);
  await a.req({ t: 'logout' }, 'loggedOut');
  const m = await gone;
  assert.strictEqual(m.room.score[b.me.id], 0, 'người ở lại chờ đối thủ mới, tỉ số làm mới');
  assert.strictEqual(a.room, null);
  a.close(); b.close();
});

test('thách đấu: vào phòng khác thì lời mời bị huỷ; đang đánh thì không gửi được', async () => {
  const a = await Client.open();
  await a.req({ t: 'register', username: 'inv_a', password: '123456' }, 'welcome');
  const b = await Client.open();
  await b.req({ t: 'register', username: 'inv_b', password: '123456' }, 'welcome');
  await a.req({ t: 'friendAdd', username: 'inv_b' }, 'friends', (m) => m.outgoing.length === 1);
  await b.req({ t: 'friendAdd', username: 'inv_a' }, 'friends', (m) => m.friends.length === 1);
  const inv = b.wait('invite');
  a.send({ t: 'challenge', to: b.me.uid, bestOf: 1, first: 'me' });
  const i = await inv;
  const gone = b.wait('inviteGone', (m) => m.id === i.invite.id);
  await a.req({ t: 'createRoom', side: 'first' }, 'room');
  await gone;
  const late = await b.req({ t: 'challengeRespond', id: i.invite.id, accept: true }, 'error');
  assert.match(late.msg, /hết hạn/);

  const c = await Client.open();
  await c.req({ t: 'joinRoom', code: a.room.code, password: a.room.password }, 'room');
  const busy = await a.req({ t: 'challenge', to: b.me.uid, bestOf: 1, first: 'me' }, 'error');
  assert.match(busy.msg, /đang trong một ván/);
  [a, b, c].forEach((x) => x.close());
});

test('đồng hồ mỗi nước: hết giờ thì người đang tới lượt bị xử thua', async () => {
  const a = await Client.open();
  const b = await Client.open();
  await a.req({ t: 'createRoom', side: 'first', timeLimit: 10 }, 'room'); // 10 "giây" = 200ms trong test
  assert.strictEqual(a.room.timeLimit, 10);
  assert.strictEqual(a.room.turnLeft, null, 'chưa đủ 2 người thì chưa tính giờ');
  await b.req({ t: 'joinRoom', code: a.room.code, password: a.room.password }, 'room');
  assert.ok(b.room.turnLeft > 0 && b.room.turnLeft <= 200);
  // A (X) không đánh -> A thua vì hết giờ
  const m = await b.wait('room', (x) => x.room.reason === 'time', 2000);
  assert.strictEqual(m.room.winner, 2);

  // Ván mới: X đánh kịp, O để hết giờ -> O thua
  await a.req({ t: 'rematch' }, 'room');
  await b.req({ t: 'rematch' }, 'room', (x) => x.room.gameNo === 2);
  const xPlayer = side(b.room, a.me.id) === 1 ? a : b;
  const oPlayer = xPlayer === a ? b : a;
  await move(xPlayer, oPlayer, 0, 0);
  assert.ok(xPlayer.room.turnLeft > 0, 'lượt mới được tính lại giờ');
  const m2 = await xPlayer.wait('room', (x) => x.room.reason === 'time', 2000);
  assert.strictEqual(m2.room.winner, 1);
  [a, b].forEach((x) => x.close());
});

test('lỗi và thông báo có mã để giao diện tự dịch; thách đấu mang theo thời gian mỗi nước', async () => {
  const a = await Client.open();
  await a.req({ t: 'register', username: 'code_a', password: '123456' }, 'welcome');
  const b = await Client.open();
  await b.req({ t: 'register', username: 'code_b', password: '123456' }, 'welcome');
  const e = await b.req({ t: 'joinRoom', code: '999999', password: '000' }, 'error');
  assert.strictEqual(e.code, 'room_not_found');
  assert.deepStrictEqual(e.args, { code: '999999' });
  const toastB = b.wait('toast', (m) => m.code === 'friend_request_in');
  await a.req({ t: 'friendAdd', username: 'code_b' }, 'toast', (m) => m.code === 'friend_request_sent');
  assert.strictEqual((await toastB).args.name, 'code_a');
  await b.req({ t: 'friendAdd', username: 'code_a' }, 'friends', (m) => m.friends.length === 1);
  const inv = b.wait('invite');
  a.send({ t: 'challenge', to: b.me.uid, bestOf: 3, first: 'me', timeLimit: 20 });
  const i = await inv;
  assert.strictEqual(i.invite.timeLimit, 20);
  await b.req({ t: 'challengeRespond', id: i.invite.id, accept: true }, 'room');
  assert.strictEqual(b.room.timeLimit, 20);
  const bad = await (await Client.open()).req({ t: 'nope' }, 'error');
  assert.strictEqual(bad.code, 'unsupported');
  [a, b].forEach((x) => x.close());
});
