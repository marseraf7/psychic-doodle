// Kiểm thử đợt B/C phía máy chủ: Glicko-2, đồng hồ tổng + cộng giờ, luật khai cuộc Swap2, xem trực tiếp, hồ sơ.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const crypto = require('crypto');
const { start } = require('../server.js');
const R = require('../src/rating.js');
const { Room } = require('../src/room.js');

// ---------------------------------------------------------------- Glicko-2 (không cần máy chủ)
test('Glicko-2: thắng lên, thua xuống; người mới thay đổi nhiều, người chơi lâu thay đổi ít', () => {
  const now = Date.now();
  const mk = (r, rd, n) => ({ pools: { bullet: { r, rd, vol: 0.06, n, at: now }, blitz: R.newPool(), rapid: R.newPool(), classical: R.newPool() }, rating: r });
  const a = mk(1500, 350, 0), b = mk(1500, 350, 0);
  const d = R.rateGame(a, b, 'bullet', 1, now);
  assert.ok(d.a > 100 && d.b < -100, JSON.stringify(d));
  assert.ok(a.pools.bullet.rd < 350, 'rd giảm sau khi có ván');
  assert.strictEqual(a.pools.bullet.n, 1);
  assert.strictEqual(a.rating, Math.round(a.pools.bullet.r), 'điểm chính = loại chơi nhiều nhất');
  const c = mk(1500, 60, 200), e = mk(1500, 60, 200);
  const d2 = R.rateGame(c, e, 'bullet', 1, now);
  assert.ok(d2.a > 0 && d2.a < 15, 'người chơi lâu năm: thay đổi ít ' + d2.a);
  // Hoà giữa hai người ngang nhau: gần như không đổi
  const f = mk(1500, 80, 50), g = mk(1500, 80, 50);
  const d3 = R.rateGame(f, g, 'bullet', 0.5, now);
  assert.ok(Math.abs(d3.a) <= 1 && Math.abs(d3.b) <= 1);
  // Thắng người mạnh hơn được nhiều hơn thắng người yếu hơn
  const h = mk(1500, 80, 50), strong = mk(1800, 80, 50), weak = mk(1200, 80, 50);
  const h2 = JSON.parse(JSON.stringify(h));
  const up1 = R.rateGame(h, strong, 'bullet', 1, now).a, up2 = R.rateGame(h2, weak, 'bullet', 1, now).a;
  assert.ok(up1 > up2 * 2, `${up1} vs ${up2}`);
});

test('Glicko-2: điểm tạm, rd tăng dần khi lâu không chơi, loại thời gian theo đồng hồ', () => {
  const now = Date.now();
  const p = { r: 1600, rd: 60, vol: 0.06, n: 100, at: now - 365 * 86400000 };
  assert.ok(Math.abs(R.decayedRd(p, now) - 350) < 1, 'sau 1 năm không chơi: rd ~350');
  assert.strictEqual(R.provisional(p, now), true);
  assert.strictEqual(R.provisional({ ...p, at: now }, now), false);
  assert.strictEqual(R.poolOf({ clock: '1+1' }), 'bullet');
  assert.strictEqual(R.poolOf({ clock: '3+2' }), 'blitz');
  assert.strictEqual(R.poolOf({ clock: '5+3' }), 'blitz');
  assert.strictEqual(R.poolOf({ clock: '10+5' }), 'rapid');
  assert.strictEqual(R.poolOf({ timeLimit: 10 }), 'blitz');
  assert.strictEqual(R.poolOf({ timeLimit: 30 }), 'rapid');
  assert.strictEqual(R.poolOf({ timeLimit: 0 }), 'classical');
  assert.strictEqual(R.parseClock('7+7'), null);
  // Tài khoản cũ chỉ có Elo: mọi loại bắt đầu từ Elo cũ, đã chơi nhiều thì không còn "tạm"
  const old = R.upgradePools({ rating: 1650, rated: 40 });
  assert.strictEqual(old.pools.blitz.r, 1650);
  assert.strictEqual(R.provisional(old.pools.blitz), false);
  assert.strictEqual(R.provisional(R.upgradePools({ rating: 1200, rated: 0 }).pools.rapid), true);
});

// ---------------------------------------------------------------- Phòng: Swap2 + đồng hồ (không cần mạng)
function room2(opts) {
  const r = new Room({ code: '1', password: '1', ...opts });
  r.addPlayer({ id: 'A', name: 'A' }, 1);
  r.addPlayer({ id: 'B', name: 'B' }, 2);
  return r;
}

test('Swap2: người đi trước đặt 3 quân, người kia chọn cầm X (đổi bên) hoặc cầm O', () => {
  const r = room2({ opening: 'swap2' });
  assert.strictEqual(r.phase, 'place3');
  assert.strictEqual(r.actor(), 'A');
  r.move('A', 0, 0); // X
  assert.throws(() => r.move('B', 1, 1), /lượt/, 'chỉ người đi trước được đặt 3 quân đầu');
  r.move('A', 5, 5); // O (do A đặt)
  r.move('A', 1, 0); // X
  assert.deepStrictEqual(r.board.moves.map((m) => m.p), [1, 2, 1], 'quân vẫn xen kẽ X/O');
  assert.strictEqual(r.phase, 'choose1');
  assert.strictEqual(r.actor(), 'B');
  assert.throws(() => r.move('B', 2, 2), (e) => e.code === 'swap_choose_first');
  assert.throws(() => r.swapChoose('A', 'x'), /lượt/);
  r.swapChoose('B', 'x');
  assert.strictEqual(r.phase, null);
  assert.strictEqual(r.seats[1], 'B', 'B chọn cầm X');
  assert.strictEqual(r.seats[2], 'A');
  assert.strictEqual(r.turn, 2);
  assert.strictEqual(r.actor(), 'A', 'tới lượt O (A) đi');
  r.move('A', 3, 3);
  assert.strictEqual(r.actor(), 'B');
  const v = r.view();
  assert.strictEqual(v.opening, 'swap2');
  assert.strictEqual(v.phase, null);

  const r2 = room2({ opening: 'swap2' });
  r2.move('A', 0, 0); r2.move('A', 5, 5); r2.move('A', 1, 0);
  r2.swapChoose('B', 'o');
  assert.strictEqual(r2.seats[1], 'A');
  assert.strictEqual(r2.actor(), 'B', 'B cầm O và đi tiếp');
});

test('Swap2: người kia đặt thêm 2 quân rồi người đi trước chọn bên', () => {
  const r = room2({ opening: 'swap2' });
  r.move('A', 0, 0); r.move('A', 5, 5); r.move('A', 1, 0);
  r.swapChoose('B', 'place2');
  assert.strictEqual(r.phase, 'place2');
  assert.strictEqual(r.actor(), 'B');
  r.move('B', 6, 6); // O
  r.move('B', 2, 0); // X
  assert.strictEqual(r.phase, 'choose2');
  assert.strictEqual(r.actor(), 'A');
  assert.throws(() => r.swapChoose('A', 'place2'), (e) => e.code === 'bad_message', 'chỉ được đặt thêm 1 lần');
  r.swapChoose('A', 'o');
  assert.strictEqual(r.seats[2], 'A');
  assert.strictEqual(r.seats[1], 'B');
  assert.strictEqual(r.actor(), 'A');
  assert.strictEqual(r.board.moves.length, 5);
  // Tái đấu: đổi bên và bắt đầu lại giai đoạn đặt quân
  r.resign('B');
  r.voteRematch('A'); r.voteRematch('B');
  assert.strictEqual(r.phase, 'place3');
  assert.strictEqual(r.actor(), r.seats[1]);
});

test('đồng hồ tổng: trừ thời gian nghĩ, cộng giờ sau mỗi nước, hết giờ thì thua', async () => {
  const r = room2({ clock: '1+1', secondMs: 10 }); // 1 phút = 600ms, cộng 10ms
  assert.strictEqual(r.timeLimit, 0);
  assert.strictEqual(r.clockLeft.A, 600);
  await new Promise((res) => setTimeout(res, 40));
  r.move('A', 0, 0);
  assert.ok(r.clockLeft.A < 600 && r.clockLeft.A > 500, String(r.clockLeft.A));
  const v = r.view();
  assert.strictEqual(v.clock, '1+1');
  assert.strictEqual(v.clocks.running, 2);
  assert.ok(v.clocks.o <= 600);
  r.clockLeft.B = 5;
  r.clockRun.since = Date.now() - 50; // B đã nghĩ quá thời gian còn lại
  r.move('B', 5, 5);
  assert.strictEqual(r.winner, 1, 'B hết giờ khi đánh -> thua');
  assert.strictEqual(r.reason, 'time');
  assert.strictEqual(r.view().clocks.o, 0);
});

// ---------------------------------------------------------------- Qua WebSocket
let app, url;
test.before(async () => {
  app = start({ port: 0, dataFile: null, msgRate: 2000,
    timers: { THROTTLE_SCALE: 0, NEXT_GAME_MS: 50, OFFLINE_FORFEIT_MS: 300, SECOND_MS: 20, MATCH_TICK_MS: 30, LOBBY_DEBOUNCE_MS: 20 } });
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
      if (m.t === 'room' && !m.watch) c.room = m.room;
      if (m.t === 'room' && m.watch) c.watched = m.room;
      if (m.t === 'welcome') { c.me = m.me; c.room = m.room; }
      if (m.t === 'me') c.me = m.me;
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    await new Promise((r) => c.ws.on('open', r));
    c.send({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex'), ...hello });
    await c.wait('welcome');
    return c;
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(t, pred = () => true, ms = 3000) {
    const where = new Error().stack.split('\n')[2]; // dòng gọi wait (dễ tìm khi hết giờ)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Hết giờ chờ ' + t + ' ' + where.trim() + ' | lỗi: ' + JSON.stringify(this.msgs.filter((m) => m.t === 'error').slice(-3)))), ms);
      this.waiters.push((m) => {
        if (m.t === t && pred(m)) { clearTimeout(timer); resolve(m); return true; }
        return false;
      });
    });
  }
  async req(m, t, pred) { const p = this.wait(t, pred); this.send(m); return p; }
  close() { this.ws.close(); }
}
async function account(username) {
  for (const k of [...app.hub.fails.keys()]) if (k.startsWith('reg:')) app.hub.fails.delete(k);
  const c = await Client.open();
  await c.req({ t: 'register', username, password: '123456', name: username }, 'welcome');
  return c;
}
const sideOf = (room, pid) => (room.seats.x === pid ? 1 : room.seats.o === pid ? 2 : 0);
/** Đánh cho tới khi người thắng xếp đủ 4 quân mở ở hàng 0 (đối thủ đánh ở hàng 9). */
async function playWin(w, l, i = 0) {
  let j = 0;
  for (let k = 0; k < 40 && !w.room.winner; k++) {
    const mover = w.room.actor === w.me.id ? w : l;
    const n = w.room.moves.length + 1;
    const done = (m) => m.room && (m.room.moves.length >= n || !!m.room.winner);
    const p = Promise.all([w.wait('room', done), l.wait('room', done)]);
    if (mover === w) mover.send({ t: 'move', x: i++, y: 0 }); else mover.send({ t: 'move', x: (j++) * 3, y: 9 });
    await p;
  }
}

test('tìm trận nhanh theo đồng hồ tổng: chỉ ghép cùng loại, phòng có đồng hồ; hết giờ thì thua', async () => {
  const a = await account('ck_a'), b = await account('ck_b'), c = await account('ck_c');
  await a.req({ t: 'quickMatch', clock: '1+1' }, 'queue', (m) => m.state === 'searching' && m.clock === '1+1');
  await c.req({ t: 'quickMatch', clock: '3+2' }, 'queue', (m) => m.state === 'searching');
  await new Promise((r) => setTimeout(r, 100));
  assert.strictEqual(app.hub.queue.size, 2, 'khác đồng hồ: không ghép');
  const pr = a.wait('room', (m) => m.room && m.room.players.length === 2);
  b.send({ t: 'quickMatch', clock: '1+1' });
  const { room } = await pr;
  assert.strictEqual(room.clock, '1+1');
  assert.strictEqual(room.pool, 'bullet');
  assert.ok(room.clocks && room.clocks.x > 0);
  // Không ai đánh: người cầm X hết 1 phút (1,2 giây ở test) thì thua
  const end = await a.wait('room', (m) => m.room.winner, 4000);
  assert.strictEqual(end.room.reason, 'time');
  assert.strictEqual(end.room.winner, 2);
  c.send({ t: 'quickCancel' });
  [a, b, c].forEach((x) => x.close());
});

test('phòng Swap2 qua mạng: đặt 3 quân, chọn bên, ván tính điểm Glicko trong đúng loại thời gian', async () => {
  const a = await account('sw_a'), b = await account('sw_b');
  await a.req({ t: 'createRoom', opening: 'swap2', timeLimit: 10 }, 'room');
  await b.req({ t: 'joinRoom', code: a.room.code, password: a.room.password }, 'room', (m) => m.room.players.length === 2);
  assert.strictEqual(b.room.phase, 'place3');
  assert.strictEqual(b.room.actor, a.me.id, 'chủ phòng (cầm X) đặt 3 quân đầu');
  for (const [x, y] of [[0, 0], [9, 9], [1, 0]]) await a.req({ t: 'move', x, y }, 'room', (m) => m.room.moves.some((q) => q[0] === x && q[1] === y));
  await b.wait('room', (m) => m.room.phase === 'choose1');
  const err = await b.req({ t: 'move', x: 3, y: 3 }, 'error');
  assert.strictEqual(err.code, 'swap_choose_first');
  await b.req({ t: 'swap', choice: 'x' }, 'room', (m) => m.room.phase === null);
  assert.strictEqual(sideOf(b.room, b.me.id), 1, 'B cầm X sau khi chọn');
  assert.strictEqual(b.room.actor, a.me.id);
  // B (X) có sẵn 2 quân ở hàng 0: đánh tiếp thành 4 mở
  await playWin(b, a, 2);
  assert.strictEqual(b.room.winner, 1);
  if (b.me.rated !== 1) await b.wait('me', (m) => m.me.rated === 1);
  assert.ok(b.me.pools.blitz.r > 1200 && b.me.pools.rapid.r === 1200, '10 giây mỗi nước = loại blitz');
  [a, b].forEach((x) => x.close());
});

test('xem trực tiếp: xem ván công khai / tìm nhanh, không xem được phòng riêng; danh sách ván hay; hồ sơ và bảng xếp hạng theo loại', async () => {
  const a = await account('tv_a'), b = await account('tv_b'), v = await Client.open({ guestName: 'Xem' });
  // Phòng riêng: không xem được
  await a.req({ t: 'createRoom' }, 'room');
  await b.req({ t: 'joinRoom', code: a.room.code, password: a.room.password }, 'room', (m) => m.room.players.length === 2);
  const no = await v.req({ t: 'watch', code: a.room.code }, 'error');
  assert.strictEqual(no.code, 'watch_unavailable');
  await a.req({ t: 'leaveRoom' }, 'room');
  // Phòng công khai: xem được, người xem không thấy mật khẩu, người chơi thấy số người xem
  await a.req({ t: 'createRoom', public: true, clock: '3+2' }, 'room');
  await b.req({ t: 'joinRoom', code: a.room.code }, 'room', (m) => m.room.players.length === 2);
  const w = await v.req({ t: 'watch', code: a.room.code }, 'room', (m) => m.watch && m.room);
  assert.strictEqual(w.room.password, null);
  assert.strictEqual(w.room.clock, '3+2');
  if (a.room.watchers !== 1) await a.wait('room', (m) => m.room.watchers === 1);
  const mine = await a.req({ t: 'watch', code: a.room.code }, 'error');
  assert.strictEqual(mine.code, 'watch_own_game');
  // Danh sách ván hay
  const tv = await v.req({ t: 'tv' }, 'tv');
  assert.ok(tv.games.some((g) => g.code === a.room.code && g.clock === '3+2'));
  // Người xem nhận nước đi; không đánh được
  const x = a.room.actor === a.me.id ? a : b;
  const seen = v.wait('room', (m) => m.watch && m.room && m.room.moves.length === 1);
  x.send({ t: 'move', x: 0, y: 0 });
  await seen;
  const deny = await v.req({ t: 'move', x: 5, y: 5 }, 'error');
  assert.strictEqual(deny.code, 'not_in_room');
  // Xem theo người chơi (bạn bè đang đấu)
  await v.req({ t: 'unwatch' }, 'room', (m) => m.watch && m.room === null);
  if (a.room.watchers !== 0) await a.wait('room', (m) => m.room.watchers === 0);
  await v.req({ t: 'watch', uid: a.me.uid }, 'room', (m) => m.watch && m.room && m.room.code === a.room.code);
  // Ván kết thúc rồi người chơi rời: người xem được báo phòng đóng
  await playWin(a, b, 1); // ô (0,0) đã có quân
  const closed = v.wait('room', (m) => m.watch && m.room === null);
  a.send({ t: 'leaveRoom' });
  b.send({ t: 'leaveRoom' });
  await closed;
  // Hồ sơ: điểm loại blitz (3+2), biểu đồ, chuỗi thắng
  const pf = (await v.req({ t: 'profile', username: 'tv_a' }, 'profile')).profile;
  assert.strictEqual(pf.username, 'tv_a');
  assert.strictEqual(pf.pools.blitz.n, 1);
  assert.ok(pf.history.blitz && pf.history.blitz.length === 1);
  assert.strictEqual(pf.streak.cur, 1);
  assert.strictEqual(pf.streak.best, 1);
  assert.ok(pf.recent.length >= 1 && pf.recent[0].clock === '3+2');
  assert.strictEqual(pf.self, false);
  const nf = await v.req({ t: 'profile', username: 'khong_co' }, 'error');
  assert.strictEqual(nf.code, 'player_not_found');
  // Bảng xếp hạng blitz: điểm còn tạm (1 ván) nên chưa lên bảng; bảng chung thì có
  const lb = await v.req({ t: 'leaderboard', pool: 'blitz' }, 'leaderboard');
  assert.strictEqual(lb.pool, 'blitz');
  assert.ok(!lb.top.some((u) => u.username === 'tv_a'));
  app.hub.store.users.get(a.me.uid).pools.blitz.rd = 80;
  app.hub.ratingsChanged(); // (đổi tay trong test: báo bảng xếp hạng dựng lại)
  const lb2 = await v.req({ t: 'leaderboard', pool: 'blitz' }, 'leaderboard');
  assert.ok(lb2.top.some((u) => u.username === 'tv_a'), 'hết tạm thì lên bảng blitz');
  const all = await v.req({ t: 'leaderboard' }, 'leaderboard');
  assert.ok(all.top.some((u) => u.username === 'tv_a'));
  [a, b, v].forEach((c) => c.close());
});

test('thách đấu và giải đấu mang theo đồng hồ / luật khai cuộc', async () => {
  const room = app.hub.makeRoom('series', 3, 20, { clock: '5+3', opening: 'swap2' });
  assert.strictEqual(room.clockSpec, '5+3');
  assert.strictEqual(room.timeLimit, 0);
  assert.strictEqual(room.opening, 'swap2');
  const bad = app.hub.makeRoom('room', 1, 20, { clock: '9+9', opening: 'renju' });
  assert.strictEqual(bad.clockSpec, null);
  assert.strictEqual(bad.timeLimit, 20);
  assert.strictEqual(bad.opening, 'free');
  app.hub.rooms.delete(room.code);
  app.hub.rooms.delete(bad.code);
});

test('chống spam: lệnh tốn tài nguyên gọi dồn thì bị từ chối; số người xem gom lại', async () => {
  const c = await Client.open({ guestName: 'Spam' });
  app.hub.T.THROTTLE_SCALE = 1;
  try {
    // Hồ sơ: truy vấn CSDL – gọi dồn bị từ chối
    await c.req({ t: 'profile', username: 'tv_a' }, 'profile');
    const e = await c.req({ t: 'profile', username: 'tv_b' }, 'error');
    assert.strictEqual(e.code, 'too_fast');
    // Danh sách ván / bảng xếp hạng: dùng lại kết quả dựng sẵn
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) await c.req({ t: 'tv' }, 'tv');
    for (let i = 0; i < 5; i++) await c.req({ t: 'leaderboard', pool: 'blitz' }, 'leaderboard');
    assert.ok(Date.now() - t0 < 1000);
  } finally { app.hub.T.THROTTLE_SCALE = 0; }
  c.close();
});

test('thách đấu bạn bè: chỉ bạn bè của người chơi xem được, không có trong danh sách chung', async () => {
  const a = await account('fw_a'), b = await account('fw_b'), f = await account('fw_f'), s = await account('fw_s');
  const U = (c) => app.hub.store.users.get(c.me.uid);
  U(a).friends.push(U(f).id);
  U(f).friends.push(U(a).id);
  const room = app.hub.makeRoom('series', 3, 0);
  app.hub.enter(room, a.me.id, 1);
  app.hub.enter(room, b.me.id, 2);
  assert.strictEqual(app.hub.canWatch(room, f.me.id), true, 'bạn của người chơi xem được');
  assert.strictEqual(app.hub.canWatch(room, s.me.id), false, 'người lạ không xem được');
  assert.strictEqual(app.hub.canWatch(room, 'g_khach'), false, 'khách không xem được');
  app.hub.tvCache = null;
  assert.ok(!app.hub.tvGames().some((g) => g.code === room.code), 'không có trong "Đang diễn ra"');
  [a, b, f, s].forEach((c) => c.close());
});
