// Kiểm thử máy chủ bằng các client WebSocket thật. Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const crypto = require('crypto');
const { start } = require('../server.js');

let app, url, base;
const mails = []; // thư "gửi" đi (giả lập SMTP)
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
    sendMail: async (to, subject, text) => { mails.push({ to, subject, text }); },
    msgRate: 2000, // test đánh rất nhanh; phần chặn spam vẫn kiểm tra bằng tin gửi dồn
    timers: { NEXT_GAME_MS: 50, OFFLINE_FORFEIT_MS: 200, INVITE_TTL_MS: 500, SECOND_MS: 20, DRAW_COOLDOWN_MS: 300, MATCH_TICK_MS: 50, LOBBY_DEBOUNCE_MS: 30 }, // 1 "giây" = 20ms
  });
  await new Promise((r) => app.server.on('listening', r));
  url = `ws://127.0.0.1:${app.server.address().port}/ws`;
  base = `http://127.0.0.1:${app.server.address().port}`;
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

async function playWin(winner, loser, row = 0) {
  // Người thắng đánh 4 quân ngang không bị chặn ở hàng row, người thua đánh rải rác ở hàng row + 5.
  let turnOf = side(winner.room, winner.me.id) === winner.room.turn ? winner : loser;
  let i = 0, j = 0;
  while (!winner.room.winner) {
    if (turnOf === winner) await move(winner, loser, i++, row);
    else await move(loser, winner, (j++) * 3, row + 5);
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
  await a.req({ t: 'register', username: 'an_test', password: 'caro-pass1', name: 'An' }, 'welcome');
  assert.strictEqual(a.me.username, 'an_test');
  const dup = await a.req({ t: 'register', username: 'an_test', password: 'caro-pass1' }, 'error');
  assert.match(dup.msg, /đã có/);

  const b = await Client.open();
  await b.req({ t: 'register', username: 'binh_test', password: 'pass-abc2', name: 'Bình' }, 'welcome');

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
  await a.req({ t: 'register', username: 'c_test', password: 'caro-pass1' }, 'welcome');
  const b = await Client.open();
  await b.req({ t: 'register', username: 'd_test', password: 'caro-pass1' }, 'welcome');
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
  await u.req({ t: 'register', username: 'link_test', password: 'caro-pass1' }, 'welcome');
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
  await a.req({ t: 'register', username: 'mig_test', password: 'caro-pass1' }, 'welcome');
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
  await u.req({ t: 'register', username: 'sec_test', password: 'caro-pass1' }, 'welcome');
  const raw = app.store.db.prepare('SELECT hash FROM sessions').all().map((r) => r.hash);
  assert.ok(raw.length && !raw.includes(u.token), 'không lưu token gốc');
  const again = await Client.open({ token: u.token });
  assert.strictEqual(again.me.username, 'sec_test');
  const bogus = await Client.open({ token: { evil: 1 } });
  assert.strictEqual(bogus.me.guest, true);

  const spam = await Client.open();
  const closed = new Promise((r2) => spam.ws.on('close', r2));
  for (let i = 0; i < 1500; i++) spam.send({ t: 'setName', name: 'x' + i });
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
  await u.req({ t: 'register', username: 'rl_one', password: 'caro-pass1' }, 'welcome');
  await u.req({ t: 'register', username: 'rl_two', password: 'caro-pass1' }, 'welcome');
  const d = await Client.open();
  for (let i = 0; i < 8; i++) await d.req({ t: 'login', username: 'rl_one', password: 'sai' }, 'error');
  assert.match((await d.req({ t: 'login', username: 'rl_one', password: 'caro-pass1' }, 'error')).msg, /quá nhiều/);
  await d.req({ t: 'login', username: 'rl_two', password: 'caro-pass1' }, 'welcome', (m) => !m.me.guest);
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
  await a.req({ t: 'register', username: 'gap_a', password: 'caro-pass1' }, 'welcome');
  const b = await Client.open();
  await b.req({ t: 'register', username: 'gap_b', password: 'caro-pass1' }, 'welcome');
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
  await a.req({ t: 'register', username: 'out_a', password: 'caro-pass1' }, 'welcome');
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
  await a.req({ t: 'register', username: 'inv_a', password: 'caro-pass1' }, 'welcome');
  const b = await Client.open();
  await b.req({ t: 'register', username: 'inv_b', password: 'caro-pass1' }, 'welcome');
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
  await a.req({ t: 'register', username: 'code_a', password: 'caro-pass1' }, 'welcome');
  const b = await Client.open();
  await b.req({ t: 'register', username: 'code_b', password: 'caro-pass1' }, 'welcome');
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

// ------------------------------------------------------------------ tính năng mới
/** Mã 6 số trong thư gần nhất gửi tới địa chỉ này (thư được gửi chạy nền nên chờ một chút). */
async function mailCode(to) {
  for (let i = 0; i < 50; i++) {
    const m = [...mails].reverse().find((x) => x.to === to);
    if (m) return m.text.match(/\b(\d{6})\b/)[1];
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Không thấy thư gửi tới ' + to);
}
async function account(username, name) {
  // Mọi client test cùng 1 IP: bỏ đếm giới hạn "30 tài khoản / IP / 10 phút" giữa các bài test
  for (const k of [...app.hub.fails.keys()]) if (k.startsWith('reg:')) app.hub.fails.delete(k);
  const c = await Client.open();
  await c.req({ t: 'register', username, password: 'caro-pass1', name: name || username }, 'welcome');
  return c;
}
async function befriend(a, b) {
  await a.req({ t: 'friendAdd', username: b.me.username }, 'toast', (m) => m.code === 'friend_request_sent');
  await b.req({ t: 'friendAdd', username: a.me.username }, 'friends', (m) => m.friends.some((f) => f.id === a.me.uid));
}
async function roomOf(a, b) {
  await a.req({ t: 'createRoom' }, 'room');
  await b.req({ t: 'joinRoom', code: a.room.code, password: a.room.password }, 'room');
  if (a.room.players.length < 2) await a.wait('room', (m) => m.room.players.length === 2);
}

test('xin hoà: đồng ý thì hoà, từ chối thì báo lại, đánh tiếp coi như từ chối', async () => {
  const a = await account('draw_a'), b = await account('draw_b');
  await roomOf(a, b);
  const x = side(a.room, a.me.id) === 1 ? a : b, o = x === a ? b : a;
  await move(x, o, 0, 0);
  // Xin hoà rồi bị từ chối
  const offered = o.wait('toast', (m) => m.code === 'draw_offered');
  await x.req({ t: 'drawOffer' }, 'room', (m) => m.room.drawOffer === x.me.id);
  await offered;
  const declined = x.wait('toast', (m) => m.code === 'draw_declined');
  await o.req({ t: 'drawAnswer', accept: false }, 'room', (m) => !m.room.drawOffer);
  await declined;
  // Không có lời xin hoà thì không trả lời được
  assert.strictEqual((await o.req({ t: 'drawAnswer', accept: true }, 'error')).code, 'no_draw_offer');
  // Vừa bị từ chối thì phải chờ mới được xin lại (chống spam lời xin hoà)
  const wait = await x.req({ t: 'drawOffer' }, 'error');
  assert.strictEqual(wait.code, 'draw_wait');
  assert.ok(wait.args.n >= 1);
  await new Promise((r) => setTimeout(r, 350));
  // Xin hoà nhiều lần khi lời xin trước còn chờ: đối thủ chỉ nhận 1 thông báo
  let notes = 0;
  o.waiters.push((m) => { if (m.t === 'toast' && m.code === 'draw_offered') notes++; return false; });
  await x.req({ t: 'drawOffer' }, 'room', (m) => m.room.drawOffer === x.me.id);
  for (let i = 0; i < 3; i++) x.send({ t: 'drawOffer' });
  await new Promise((r) => setTimeout(r, 150));
  assert.strictEqual(notes, 1);
  // Đối thủ đánh tiếp -> lời xin hoà bị huỷ, và cũng tính là bị từ chối
  await move(o, x, 5, 5);
  assert.strictEqual(o.room.drawOffer, null);
  assert.strictEqual((await x.req({ t: 'drawOffer' }, 'error')).code, 'draw_wait');
  // Xin hoà, đồng ý -> ván hoà
  await o.req({ t: 'drawOffer' }, 'room', (m) => m.room.drawOffer === o.me.id);
  await x.req({ t: 'drawAnswer', accept: true }, 'room', (m) => m.room.winner === 3);
  assert.strictEqual(x.room.reason, 'draw');
  assert.deepStrictEqual(Object.values(x.room.score), [0, 0]);
  if (a.me.stats.draws !== 1) await a.wait('me', (m) => m.me.stats.draws === 1); // cập nhật ngay, không cần tải lại
  const a2 = await Client.open({ token: a.token });
  assert.deepStrictEqual(a2.me.stats, { wins: 0, losses: 0, draws: 1 });
  assert.strictEqual(a2.me.rating, 1200, 'hoà sau 3 nước: không tính Elo');
  assert.strictEqual(a2.me.rated, 0);
  assert.strictEqual(x.room.unrated, true, 'giao diện được báo ván không tính Elo');
  assert.deepStrictEqual(x.room.h2h, { wins: 0, losses: 0, draws: 1 });
  assert.strictEqual((await x.req({ t: 'drawOffer' }, 'error')).code, 'cannot_draw');
  [a, a2, b].forEach((c) => c.close());
});

test('chat nhanh trong phòng: chỉ câu có sẵn, giới hạn tốc độ, người đã chặn không nhận', async () => {
  const a = await account('quick_a'), b = await account('quick_b');
  await roomOf(a, b);
  const got = b.wait('quick');
  a.send({ t: 'quick', id: 'gg' });
  const q = await got;
  assert.deepStrictEqual([q.from, q.id], [a.me.id, 'gg']);
  assert.strictEqual((await a.req({ t: 'quick', id: 'nice' }, 'error')).code, 'too_fast');
  assert.strictEqual((await a.req({ t: 'quick', id: '<b>hi</b>' }, 'error')).code, 'bad_message');
  // B chặn A: A vẫn gửi được nhưng B không nhận
  await b.req({ t: 'block', id: a.me.uid }, 'me', (m) => m.me.blocked.length === 1);
  await new Promise((r) => setTimeout(r, 1300));
  const none = b.wait('quick', () => true, 400).then(() => 'got', () => 'none');
  a.send({ t: 'quick', id: 'hello' });
  assert.strictEqual(await none, 'none');
  [a, b].forEach((c) => c.close());
});

test('lịch sử 10 trận, xem lại qua link chia sẻ, đối đầu, Elo và bảng xếp hạng', async () => {
  const a = await account('hist_a', 'An'), b = await account('hist_b', 'Bình');
  const g = await Client.open({ guestName: 'Khách' });
  await roomOf(a, g); // ván với khách: có lịch sử, không có Elo / đối đầu
  await playWin(a, g);
  assert.strictEqual(a.room.h2h, null);
  await a.req({ t: 'leaveRoom' }, 'room');
  g.close();
  await roomOf(a, b);
  for (let i = 0; i < 11; i++) {
    await playWin(i % 2 ? b : a, i % 2 ? a : b, i * 20); // mỗi ván một khác (ván lặp lại y hệt thì không tính điểm)
    await a.req({ t: 'rematch' }, 'room', (m) => m.room.rematch.length === 1);
    await b.req({ t: 'rematch' }, 'room', (m) => m.room.gameNo === i + 2);
    if (a.room.gameNo !== i + 2) await a.wait('room', (m) => m.room.gameNo === i + 2);
  }
  // Ván cuối: A thắng -> 7 thắng 5 thua? (6 ván A thắng với B, 5 ván B thắng) + 1 ván thắng khách
  const h = await a.req({ t: 'history' }, 'history');
  assert.strictEqual(h.games.length, 10, 'chỉ giữ 10 trận gần nhất');
  assert.ok(h.games.every((x) => x.opponent === 'Bình'));
  assert.strictEqual(h.games[0].result, 'win'); // ván thứ 11 (i = 10): A thắng
  assert.ok(h.games[0].moves >= 7);
  // Xem lại qua HTTP, không lộ id tài khoản
  const r = await fetch(base + '/api/replay/' + h.games[0].share);
  assert.strictEqual(r.status, 200);
  const rep = await r.json();
  assert.ok(Array.isArray(rep.moves) && rep.moves.length === h.games[0].moves);
  assert.ok(!('x_id' in rep) && !JSON.stringify(rep).includes(a.me.uid));
  assert.strictEqual((await fetch(base + '/api/replay/khongco12')).status, 404);
  assert.strictEqual((await fetch(base + '/api/replay/../../etc')).status, 404);
  // Đối đầu
  const hh = await a.req({ t: 'h2h', id: b.me.uid }, 'h2h');
  assert.deepStrictEqual(hh.record, { wins: 6, losses: 5, draws: 0 });
  // Elo: A thắng nhiều hơn -> điểm cao hơn B; tổng gần như không đổi.
  // Bảng xếp hạng chỉ có người điểm đã chắc chắn (rd ≤ 75): 5 ván chưa đủ
  assert.strictEqual((await a.req({ t: 'leaderboard' }, 'leaderboard')).me, null);
  for (const c of [a, b]) for (const p of Object.values(app.store.users.get(c.me.uid).pools)) p.rd = Math.min(p.rd, 70);
  app.hub.ratingsChanged();
  const lb = await a.req({ t: 'leaderboard' }, 'leaderboard');
  const ra = lb.top.find((u) => u.username === 'hist_a'), rb = lb.top.find((u) => u.username === 'hist_b');
  assert.ok(ra.rating > rb.rating, JSON.stringify(lb.top));
  assert.strictEqual(ra.games, 5, 'mỗi cặp chỉ tính Elo 5 ván/ngày (chống cày điểm)');
  assert.ok(Math.abs(ra.rating + rb.rating - 2400) <= 5);
  assert.ok(lb.me && lb.me.rank >= 1);
  assert.ok(lb.top.every((u, i) => i === 0 || lb.top[i - 1].rating >= u.rating));
  [a, b].forEach((c) => c.close());
});

test('nhắn tin bạn bè: chỉ với bạn, chưa đọc, lịch sử, chặn và báo cáo', async () => {
  const a = await account('dm_a', 'An'), b = await account('dm_b', 'Bình'), c = await account('dm_c');
  assert.strictEqual((await a.req({ t: 'dmSend', to: c.me.uid, text: 'hi' }, 'error')).code, 'not_friends');
  await befriend(a, b);
  const inB = b.wait('dm');
  await a.req({ t: 'dmSend', to: b.me.uid, text: '  chào\u0000 bạn  ' }, 'dm');
  const m = await inB;
  assert.strictEqual(m.peer, a.me.uid);
  assert.strictEqual(m.msg.text, 'chào  bạn');
  assert.strictEqual((await a.req({ t: 'dmSend', to: b.me.uid, text: '   ' }, 'error')).code, 'message_empty');
  // Đánh dấu đã đọc với người không tồn tại: không ghi gì vào CSDL
  const before = app.store.db.prepare('SELECT COUNT(*) AS n FROM dm_read').get().n;
  for (let i = 0; i < 5; i++) b.send({ t: 'dmRead', peer: 'rac' + i, lastId: 1 });
  await b.req({ t: 'dmHistory', peer: a.me.uid }, 'dmHistory');
  assert.strictEqual(app.store.db.prepare('SELECT COUNT(*) AS n FROM dm_read').get().n, before);
  // Chưa đọc hiển thị trong danh sách bạn bè khi đăng nhập lại
  const b2 = await Client.open({ token: b.token });
  if (!b2.friends) await b2.wait('friends');
  assert.strictEqual(b2.friends.friends[0].unread, 1);
  const hist = await b2.req({ t: 'dmHistory', peer: a.me.uid }, 'dmHistory');
  assert.deepStrictEqual(hist.msgs.map((x) => x.text), ['chào  bạn']);
  b2.send({ t: 'dmRead', peer: a.me.uid, lastId: hist.msgs[0].id });
  await new Promise((r) => setTimeout(r, 50));
  const b3 = await Client.open({ token: b.token });
  if (!b3.friends) await b3.wait('friends');
  assert.strictEqual(b3.friends.friends[0].unread, 0);
  // Báo cáo: máy chủ lưu kèm tin nhắn gần nhất
  await b.req({ t: 'report', id: a.me.uid, reason: 'spam' }, 'toast', (x) => x.code === 'reported');
  const rep = app.store.reports(1)[0];
  assert.strictEqual(rep.target, a.me.uid);
  assert.match(rep.context, /dm_a: chào/);
  assert.strictEqual((await b.req({ t: 'report', id: a.me.uid, reason: 'x' }, 'error')).code, 'bad_message');
  // Chặn: huỷ kết bạn, không nhắn / kết bạn / thách đấu được nữa
  await b.req({ t: 'block', id: a.me.uid }, 'friends', (x) => x.friends.length === 0);
  assert.strictEqual((await a.req({ t: 'dmSend', to: b.me.uid, text: 'hi' }, 'error')).code, 'not_friends');
  assert.strictEqual((await a.req({ t: 'friendAdd', username: 'dm_b' }, 'error')).code, 'blocked');
  assert.strictEqual((await b.req({ t: 'friendAdd', username: 'dm_a' }, 'error')).code, 'blocked');
  await b.req({ t: 'unblock', id: a.me.uid }, 'me', (x) => x.me.blocked.length === 0);
  await a.req({ t: 'friendAdd', username: 'dm_b' }, 'toast', (x) => x.code === 'friend_request_sent');
  [a, b, b2, b3, c].forEach((x) => x.close());
});

test('đổi mật khẩu (đăng xuất thiết bị khác), email, quên mật khẩu qua email', async () => {
  const a = await account('pw_a');
  const other = await Client.open({ token: a.token });
  assert.strictEqual(other.me.username, 'pw_a');
  assert.strictEqual((await a.req({ t: 'changePassword', current: 'sai', next: 'moi123' }, 'error')).code, 'wrong_password');
  assert.strictEqual((await a.req({ t: 'changePassword', current: 'caro-pass1', next: '123' }, 'error')).code, 'short_password');
  await a.req({ t: 'changePassword', current: 'caro-pass1', next: 'moi123' }, 'toast', (m) => m.code === 'password_changed');
  const old = await Client.open({ token: other.token || a.token });
  // token của a vẫn dùng được (thiết bị hiện tại); token cũ trên thiết bị khác thì không
  assert.strictEqual(old.me.username, 'pw_a');
  const login = await Client.open();
  await login.req({ t: 'login', username: 'pw_a', password: 'moi123' }, 'welcome');
  const tokenB = login.token;
  await a.req({ t: 'changePassword', current: 'moi123', next: 'moi456' }, 'toast', (m) => m.code === 'password_changed');
  assert.ok((await Client.open({ token: tokenB })).me.guest, 'thiết bị khác bị đăng xuất');
  assert.ok(!(await Client.open({ token: a.token })).me.guest, 'thiết bị đang dùng vẫn đăng nhập');

  // Email
  assert.strictEqual((await a.req({ t: 'setEmail', email: 'khong-hop-le', password: 'moi456' }, 'error')).code, 'email_invalid');
  assert.strictEqual((await a.req({ t: 'setEmail', email: 'a@x.com', password: 'sai' }, 'error')).code, 'wrong_password');
  // Email mới chỉ có hiệu lực sau khi nhập đúng mã gửi tới địa chỉ đó
  mails.length = 0;
  await a.req({ t: 'setEmail', email: 'A@X.com', password: 'moi456', lang: 'en' }, 'me', (m) => m.me.pendingEmail === 'a@x.com');
  assert.strictEqual(a.me.email, '', 'chưa xác minh thì chưa có hiệu lực');
  const vcode = await mailCode('a@x.com');
  assert.match(mails[mails.length - 1].subject, /verification/);
  const vwrong = String((Number(vcode) + 1) % 1e6).padStart(6, '0');
  assert.strictEqual((await a.req({ t: 'verifyEmail', code: vwrong }, 'error')).code, 'email_bad_code');
  await a.req({ t: 'verifyEmail', code: vcode }, 'me', (m) => m.me.email === 'a@x.com' && !m.me.pendingEmail);
  assert.strictEqual((await a.req({ t: 'verifyEmail', code: vcode }, 'error')).code, 'email_bad_code', 'mã chỉ dùng 1 lần');
  const b = await account('pw_b');
  assert.strictEqual((await b.req({ t: 'setEmail', email: 'a@x.com', password: 'caro-pass1' }, 'error')).code, 'email_taken');
  // Nhập email người khác mà không xác minh: thư khôi phục mật khẩu không gửi tới đó
  await b.req({ t: 'setEmail', email: 'nan-nhan@x.com', password: 'caro-pass1' }, 'me', (m) => m.me.pendingEmail === 'nan-nhan@x.com');
  await new Promise((r) => setTimeout(r, 30));
  const sentBefore = mails.length;
  await (await Client.open()).req({ t: 'forgot', login: 'pw_b' }, 'forgotSent');
  await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(mails.length, sentBefore, 'email chưa xác minh không nhận thư khôi phục');

  // Quên mật khẩu: tài khoản không tồn tại cũng trả lời giống hệt, không gửi thư
  const guest = await Client.open();
  mails.length = 0;
  await guest.req({ t: 'forgot', login: 'khongco' }, 'forgotSent');
  assert.strictEqual(mails.length, 0);
  await guest.req({ t: 'forgot', login: 'a@x.com', lang: 'en' }, 'forgotSent');
  const code = await mailCode('a@x.com'); // thư được gửi chạy nền
  assert.strictEqual(mails.length, 1);
  assert.match(mails[0].subject, /password reset/);
  const wrong = String((Number(code) + 1) % 1e6).padStart(6, '0');
  assert.strictEqual((await guest.req({ t: 'reset', login: 'pw_a', code: wrong, password: 'reset1' }, 'error')).code, 'reset_bad_code');
  await guest.req({ t: 'reset', login: 'pw_a', code, password: 'reset1' }, 'welcome');
  assert.strictEqual(guest.me.username, 'pw_a');
  assert.ok((await Client.open({ token: a.token })).me.guest, 'đặt lại mật khẩu = đăng xuất mọi nơi');
  assert.strictEqual((await guest.req({ t: 'reset', login: 'pw_a', code, password: 'reset2' }, 'error')).code, 'reset_bad_code', 'mã chỉ dùng 1 lần');
  const l2 = await Client.open();
  await l2.req({ t: 'login', username: 'pw_a', password: 'reset1' }, 'welcome');
  [a, b, other, old, login, guest, l2].forEach((c) => c.close());
});

test('Elo: đầu hàng / hoà quá sớm không tính điểm; thắng thật thì tính', async () => {
  const a = await account('elo_a'), b = await account('elo_b');
  await roomOf(a, b);
  const x = side(a.room, a.me.id) === 1 ? a : b, o = x === a ? b : a;
  await move(x, o, 0, 0);
  await o.req({ t: 'resign' }, 'room', (m) => !!m.room.winner);
  assert.strictEqual(o.room.unrated, true);
  const lb = await a.req({ t: 'leaderboard' }, 'leaderboard');
  assert.ok(!lb.top.some((u) => u.username === 'elo_a'), 'chưa có ván tính điểm thì chưa lên bảng');
  await a.req({ t: 'rematch' }, 'room', (m) => m.room.rematch.length === 1);
  await b.req({ t: 'rematch' }, 'room', (m) => m.room.gameNo === 2);
  if (a.room.gameNo !== 2) await a.wait('room', (m) => m.room.gameNo === 2);
  await playWin(a, b);
  assert.strictEqual(a.room.unrated, false);
  if (a.me.rating === 1200) await a.wait('me', (m) => m.me.rating !== 1200);
  // Glicko-2: người mới (rd 350) lên nhiều sau ván thắng đầu tiên; ván không giới hạn thời gian = loại classical
  assert.ok(a.me.rating > 1300 && a.me.rating < 1450, String(a.me.rating));
  assert.strictEqual(a.me.rated, 1);
  assert.strictEqual(a.me.pools.classical.r, a.me.rating);
  assert.strictEqual(a.me.pools.classical.prov, true, 'mới 1 ván: điểm còn tạm');
  assert.strictEqual(a.me.pools.blitz.r, 1200, 'loại thời gian khác không đổi');
  assert.ok(b.room.delta && b.room.delta[b.me.id] < 0, 'người thua thấy điểm bị trừ');
  [a, b].forEach((c) => c.close());
});

test('email: giới hạn số lần lưu (chống dò email đã đăng ký); quên mật khẩu không chờ gửi thư', async () => {
  const g = await Client.open();
  await g.req({ t: 'google', credential: 'ok:sub-mail:m@x.com:Mail' }, 'welcome');
  assert.strictEqual(g.me.hasPassword, false);
  for (let i = 0; i < 9; i++) await g.req({ t: 'setEmail', email: `probe${i}@x.com` }, 'me');
  await g.req({ t: 'setEmail', email: 'probe9@x.com' }, 'me');
  await g.req({ t: 'verifyEmail', code: await mailCode('probe9@x.com') }, 'me', (m) => m.me.email === 'probe9@x.com');
  const err = await g.req({ t: 'setEmail', email: 'last@x.com' }, 'error');
  assert.strictEqual(err.code, 'too_many_attempts');
  // Máy chủ gửi thư chậm (hoặc treo): vẫn trả lời ngay
  const hang = app.hub.sendMail;
  app.hub.sendMail = () => new Promise(() => {});
  const c = await Client.open();
  const t0 = Date.now();
  await c.req({ t: 'forgot', login: 'probe9@x.com' }, 'forgotSent');
  assert.ok(Date.now() - t0 < 500);
  app.hub.sendMail = hang;
  [g, c].forEach((x) => x.close());
});

test('xoá tài khoản: cần mật khẩu, xoá dữ liệu cá nhân, bạn bè và lịch sử của người khác được dọn đúng', async () => {
  const a = await account('del_a', 'Sẽ xoá'), b = await account('del_b', 'Bạn');
  await befriend(a, b);
  await a.req({ t: 'dmSend', to: b.me.uid, text: 'tin riêng' }, 'dm');
  await roomOf(a, b);
  await playWin(a, b);
  const aUid = a.me.uid;
  assert.strictEqual((await a.req({ t: 'deleteAccount', password: 'sai' }, 'error')).code, 'wrong_password');
  const bFriends = b.wait('friends', (m) => m.friends.length === 0);
  const other = await Client.open({ token: a.token }); // thiết bị thứ 2 của A
  const gone2 = other.wait('accountDeleted');
  await a.req({ t: 'deleteAccount', password: 'caro-pass1' }, 'accountDeleted');
  await gone2;
  await bFriends;
  // Tài khoản không còn: token hết hiệu lực, không đăng nhập được, tên đăng nhập dùng lại được
  assert.ok((await Client.open({ token: a.token })).me.guest);
  assert.strictEqual((await (await Client.open()).req({ t: 'login', username: 'del_a', password: 'caro-pass1' }, 'error')).code, 'bad_login');
  assert.ok(!app.store.users.has(aUid));
  assert.strictEqual(app.store.db.prepare('SELECT COUNT(*) AS n FROM dm WHERE a = ? OR b = ?').get(aUid, aUid).n, 0);
  assert.strictEqual(app.store.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE uid = ?').get(aUid).n, 0);
  assert.strictEqual(app.store.db.prepare('SELECT COUNT(*) AS n FROM games WHERE x_id = ? OR o_id = ? OR x_name = ? OR o_name = ?').get(aUid, aUid, 'Sẽ xoá', 'Sẽ xoá').n, 0);
  // B vẫn giữ ván đã chơi, nhưng không còn tên / id của người đã xoá
  const h = await b.req({ t: 'history' }, 'history');
  assert.strictEqual(h.games.length, 1);
  assert.strictEqual(h.games[0].opponent, '');
  const rep = await (await fetch(base + '/api/replay/' + h.games[0].share)).json();
  assert.ok([rep.x, rep.o].includes('') && [rep.x, rep.o].includes('Bạn'));
  const again = await Client.open();
  for (const k of [...app.hub.fails.keys()]) if (k.startsWith('reg:')) app.hub.fails.delete(k);
  await again.req({ t: 'register', username: 'del_a', password: 'pass-abc2' }, 'welcome');
  assert.notStrictEqual(again.me.uid, aUid);
  [a, b, other, again].forEach((c) => c.close());
});

test('xoá tài khoản chỉ có Google: gõ lại tên đăng nhập để xác nhận', async () => {
  const g = await Client.open();
  await g.req({ t: 'google', credential: 'ok:sub-del:del@x.com:Del' }, 'welcome');
  assert.strictEqual((await g.req({ t: 'deleteAccount', confirm: 'nham' }, 'error')).code, 'confirm_username');
  await g.req({ t: 'deleteAccount', confirm: g.me.username.toUpperCase() }, 'accountDeleted');
  // Đăng nhập lại cùng Google = tài khoản mới
  const g2 = await Client.open();
  await g2.req({ t: 'google', credential: 'ok:sub-del:del@x.com:Del' }, 'welcome');
  assert.notStrictEqual(g2.me.uid, g.me.uid);
  [g, g2].forEach((c) => c.close());
});

test('app điện thoại quá cũ được yêu cầu cập nhật; web và app mới vào bình thường', async () => {
  app.hub.minAppVersion = '1.2.0';
  app.hub.updateUrls = { android: 'https://play.google.com/store/apps/details?id=io.github.marseraf7.caro', ios: '' };
  try {
    const c = new Client();
    c.ws = new WebSocket(url);
    c.ws.on('message', (d) => { const m = JSON.parse(d); c.msgs.push(m); c.waiters = c.waiters.filter((w) => !w(m)); });
    await new Promise((r) => c.ws.on('open', r));
    const up = await c.req({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex'), client: { platform: 'android', version: '1.1.9' } }, 'updateRequired');
    assert.strictEqual(up.min, '1.2.0');
    assert.match(up.url, /play\.google\.com/);
    const bad = await c.req({ t: 'createRoom' }, 'error');
    assert.strictEqual(bad.code, 'no_hello', 'chưa vào được online');
    c.close();
    const ok = await Client.open({ client: { platform: 'android', version: '1.2.0' } });
    assert.ok(ok.me.guest);
    const ios = await Client.open({ client: { platform: 'ios', version: '1.10.0' } }); // 1.10 > 1.2
    assert.ok(ios.me);
    const web = await Client.open({ client: { platform: 'web', version: null } });
    assert.ok(web.me);
    [ok, ios, web].forEach((x) => x.close());
  } finally {
    app.hub.minAppVersion = '';
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('tìm trận nhanh: hợp thời gian mới ghép, chọn Elo gần nhất, không ghép người đã chặn nhau', async () => {
  const a = await Client.open({ guestName: 'Nhanh A' });
  const b = await Client.open({ guestName: 'Nhanh B' });
  const q = await a.req({ t: 'quickMatch', timeLimit: 10 }, 'queue');
  assert.strictEqual(q.state, 'searching');
  assert.strictEqual(q.timeLimit, 10);
  await b.req({ t: 'quickMatch', timeLimit: 20 }, 'queue', (m) => m.state === 'searching');
  await sleep(150);
  assert.ok(!a.room && !b.room, 'khác thời gian mỗi nước: không ghép');
  await b.req({ t: 'quickCancel' }, 'queue', (m) => m.state === 'idle');
  assert.ok(!app.hub.queue.has(b.me.id));

  // "Sao cũng được" ghép với người chọn 10 giây -> phòng 10 giây, đi trước ngẫu nhiên
  const c = await Client.open({ guestName: 'Nhanh C' });
  const found = a.wait('toast', (m) => m.code === 'match_found');
  const room = a.wait('room', (m) => m.room && m.room.players.length === 2);
  c.send({ t: 'quickMatch', timeLimit: 'any' });
  assert.strictEqual((await found).args.name, 'Nhanh C');
  const r = (await room).room;
  assert.ok(r.quick && !r.public);
  assert.strictEqual(r.timeLimit, 10);
  assert.deepStrictEqual(new Set([r.seats.x, r.seats.o]), new Set([a.me.id, c.me.id]));
  await c.wait('room', (m) => m.room && m.room.players.length === 2);
  assert.strictEqual(app.hub.queue.size, 0);

  [a, c].forEach((x) => x.close()); // (phòng 10 "giây" = 200ms trong test: hết giờ rất nhanh)

  // Đang trong ván thì không tìm trận được; vào phòng khác / mất kết nối thì ra khỏi hàng chờ
  const d = await Client.open(), e = await Client.open();
  await d.req({ t: 'quickMatch' }, 'queue');
  await e.req({ t: 'quickMatch' }, 'room', (m) => m.room && m.room.players.length === 2);
  assert.strictEqual(e.room.timeLimit, 0, 'cả hai "sao cũng được": không giới hạn thời gian');
  const busy = await d.req({ t: 'quickMatch' }, 'error');
  assert.strictEqual(busy.code, 'busy_in_game');
  [d, e].forEach((x) => x.close());
  await b.req({ t: 'quickMatch' }, 'queue', (m) => m.state === 'searching');
  await b.req({ t: 'createRoom' }, 'queue', (m) => m.state === 'idle');
  b.send({ t: 'leaveRoom' });
  await b.req({ t: 'quickMatch' }, 'queue', (m) => m.state === 'searching');
  b.close();
  await sleep(50);
  assert.strictEqual(app.hub.queue.size, 0, 'mất kết nối: bỏ khỏi hàng chờ');

  // Elo: người 1500 được ghép với 1520 chứ không với 2400
  const p = await account('qm_p'), hi = await account('qm_hi'), near = await account('qm_near');
  const setR = (uid, r) => { for (const pool of Object.values(app.hub.store.users.get(uid).pools)) pool.r = r; };
  setR(p.me.uid, 1500);
  setR(hi.me.uid, 2400);
  setR(near.me.uid, 1520);
  await p.req({ t: 'quickMatch' }, 'queue');
  await hi.req({ t: 'quickMatch' }, 'queue');
  const pr = p.wait('room', (m) => m.room && m.room.players.length === 2);
  near.send({ t: 'quickMatch' });
  const pair = (await pr).room;
  assert.deepStrictEqual(new Set(pair.players.map((x) => x.id)), new Set([p.me.id, near.me.id]));
  assert.ok(app.hub.queue.has(hi.me.id), 'người Elo xa vẫn chờ');
  // Chờ lâu thì khoảng chênh được nới ra: 2400 ghép được với người 1200
  const g = await Client.open();
  const hr = hi.wait('room', (m) => m.room && m.room.players.length === 2, 3000);
  g.send({ t: 'quickMatch' });
  assert.ok((await hr).room.quick);
  // Đang chờ trận mới mà cùng đối thủ cũ tái đấu: thôi tìm trận
  await p.req({ t: 'resign' }, 'room', (m) => !!m.room.winner);
  await p.req({ t: 'quickMatch' }, 'queue', (m) => m.state === 'searching');
  await near.req({ t: 'rematch' }, 'room');
  const idle = p.wait('queue', (m) => m.state === 'idle');
  await p.req({ t: 'rematch' }, 'room', (m) => m.room.gameNo === 2);
  await idle;

  // Đã chặn nhau thì không bao giờ ghép
  const x = await account('qm_x'), y = await account('qm_y');
  await x.req({ t: 'block', id: y.me.uid }, 'me', (m) => m.me.blocked.length === 1);
  await x.req({ t: 'quickMatch' }, 'queue');
  await y.req({ t: 'quickMatch' }, 'queue');
  await sleep(300);
  assert.ok(!x.room && !y.room);
  await y.req({ t: 'logout' }, 'loggedOut');
  assert.ok(!app.hub.queue.has(y.me.id), 'đăng xuất: bỏ khỏi hàng chờ');
  await x.req({ t: 'quickCancel' }, 'queue', (m) => m.state === 'idle');
  [p, hi, near, g, x, y].forEach((k) => k.close());
});

test('phòng công khai: hiện trong sảnh, vào không cần mật khẩu, đầy / chủ phòng offline thì ẩn', async () => {
  const w = await Client.open({ guestName: 'Xem sảnh' });
  const first = await w.req({ t: 'lobbyWatch', on: true }, 'lobby');
  assert.deepStrictEqual(first.rooms, []);
  const h = await Client.open({ guestName: 'Chủ phòng' });
  const listed = w.wait('lobby', (m) => m.rooms.length === 1);
  await h.req({ t: 'createRoom', timeLimit: 20, public: true }, 'room');
  assert.ok(h.room.public);
  const entry = (await listed).rooms[0];
  assert.strictEqual(entry.code, h.room.code);
  assert.strictEqual(entry.timeLimit, 20);
  assert.strictEqual(entry.host.name, 'Chủ phòng');
  assert.strictEqual(entry.password, undefined, 'sảnh không lộ mật khẩu');
  assert.deepStrictEqual((await h.req({ t: 'lobby' }, 'lobby')).rooms, [], 'không thấy phòng của chính mình');

  // Phòng riêng không hiện trong sảnh
  const priv = await Client.open();
  await priv.req({ t: 'createRoom' }, 'room');
  await sleep(80);
  assert.strictEqual(w.msgs.filter((m) => m.t === 'lobby').pop().rooms.length, 1);

  // Vào không cần mật khẩu -> đầy -> biến khỏi sảnh; đối thủ rời -> hiện lại
  const j = await Client.open({ guestName: 'Khách vào' });
  const gone = w.wait('lobby', (m) => m.rooms.length === 0);
  await j.req({ t: 'joinRoom', code: entry.code }, 'room', (m) => m.room.players.length === 2);
  await gone;
  const back = w.wait('lobby', (m) => m.rooms.length === 1);
  j.send({ t: 'leaveRoom' });
  await back;

  // Chủ phòng chặn người xem: người đó không thấy phòng và không vào được
  const ha = await account('lob_host'), va = await account('lob_view');
  await ha.req({ t: 'block', id: va.me.uid }, 'me', (m) => m.me.blocked.length === 1);
  await ha.req({ t: 'createRoom', public: true }, 'room');
  const seen = (await va.req({ t: 'lobby' }, 'lobby')).rooms.map((r) => r.code);
  assert.ok(seen.includes(entry.code) && !seen.includes(ha.room.code));
  const blk = await va.req({ t: 'joinRoom', code: ha.room.code }, 'error');
  assert.strictEqual(blk.code, 'blocked');

  // Chủ phòng mất kết nối -> ẩn; tắt xem sảnh thì không nhận nữa
  const hidden = w.wait('lobby', (m) => !m.rooms.some((r) => r.code === entry.code));
  h.close();
  await hidden;
  w.send({ t: 'lobbyWatch', on: false });
  await sleep(30);
  const n = w.msgs.length;
  ha.send({ t: 'leaveRoom' });
  await sleep(120);
  assert.strictEqual(w.msgs.filter((m) => m.t === 'lobby').length, w.msgs.slice(0, n).filter((m) => m.t === 'lobby').length);
  [w, priv, j, ha, va].forEach((k) => k.close());
});

test('chỉ tin X-Forwarded-For khi kết nối đến từ proxy (chính máy chủ / mạng nội bộ), không tin IP Internet', () => {
  const { fromProxy } = require('../server.js');
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '10.0.0.4', '172.17.0.1', '172.31.255.1', '192.168.1.2', 'fd00::1', 'fc12:3::1']) {
    assert.strictEqual(fromProxy(a), true, a);
  }
  for (const a of ['8.8.8.8', '::ffff:20.1.2.3', '172.32.0.1', '172.15.0.1', '11.0.0.1', '2001:db8::1', 'fe80::1', '', undefined]) {
    assert.strictEqual(fromProxy(a), false, String(a));
  }
});
