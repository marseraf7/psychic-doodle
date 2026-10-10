// Kiểm thử đợt D (học từ Lichess): kiểm duyệt nội dung, huỷ ván + cấm tạm vì bỏ ván, chống cày điểm,
// số liệu quản trị, thống kê sâu, ảnh xem trước + API công khai, thêm giờ / đi lại / Berserk.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const crypto = require('crypto');
const zlib = require('zlib');
const { start } = require('../server.js');
const R = require('../src/rating.js');
const M = require('../src/moderation.js');
const Perf = require('../src/perf.js');
const { Room } = require('../src/room.js');
const { encodePng, boardPng } = require('../src/png.js');

// ---------------------------------------------------------------- Không cần máy chủ
test('kiểm duyệt: từ tục 4 thứ tiếng (kể cả viết lách), không bắt nhầm từ thường', () => {
  assert.strictEqual(M.mask('đ.ị.t mày'), 'đ**** mày');
  assert.strictEqual(M.mask('сука блять'), 'с*** б****');
  assert.ok(M.mask('you f.u.c.k').includes('*'));
  assert.ok(M.mask('fuuuck you').includes('*'));
  assert.ok(M.mask('sh1t').includes('*'), 'leetspeak');
  assert.ok(M.mask('傻逼').includes('*'));
  for (const ok of ['lon nước ngọt', 'con chó nhà tôi', 'Dick Smith', 'classic', 'shitake', 'xin chào']) assert.strictEqual(M.mask(ok), ok);
  assert.strictEqual(M.isOffensiveName('BitchKing'), false, 'tên dính chữ không tách từ thì không bắt (tránh nhầm)');
  assert.strictEqual(M.isOffensiveName('fuck'), true);
  assert.strictEqual(M.isOffensiveName('Thằng chó'), true);
  assert.strictEqual(M.isOffensiveName('Bình'), false);
  // Không bắt nhầm từ thường tiếng Nga / Trung; viết tắt "cl" chỉ che trong tin nhắn, không cấm làm tên
  for (const ok of ['100 рубля', 'употребляя воду', 'Компания страхует дом', 'бляха', '我妈妈的生日', '他妈妈很好']) assert.strictEqual(M.mask(ok), ok);
  assert.ok(M.mask('他妈的').includes('*') && M.mask('ты нахуй').includes('*') && M.mask('заебал').includes('*'));
  assert.strictEqual(M.isOffensiveName('CL Hà Nội'), false);
  assert.ok(M.mask('vãi cl').includes('*'));
});

test('kiểm duyệt: mật khẩu yếu, tin nhắn dồn dập / lặp lại', () => {
  assert.ok(M.weakPassword('123456') && M.weakPassword('Password') && M.weakPassword('aaaaaaa') && M.weakPassword('binh_99', 'binh_99'));
  assert.ok(!M.weakPassword('caro-pass1', 'binh'));
  const f = new M.Flood({ limit: 5, windowMs: 10000 });
  const t0 = 1e6;
  assert.strictEqual(f.check('a', 'xin chào bạn', t0), null);
  assert.strictEqual(f.check('a', 'xin chào bạn', t0 + 10), 'duplicate');
  assert.strictEqual(f.check('a', 'xin chào bạn!', t0 + 20), 'duplicate', 'gần giống cũng tính lặp');
  assert.strictEqual(f.check('a', 'ok', t0 + 30), null);
  assert.strictEqual(f.check('a', 'ừ', t0 + 40), null, 'câu ngắn khác nhau không tính lặp');
  assert.strictEqual(f.check('a', 'ván nữa nhé', t0 + 50), null);
  assert.strictEqual(f.check('a', 'mai chơi tiếp', t0 + 60), null);
  assert.strictEqual(f.check('a', 'một tin nữa', t0 + 70), 'too_fast', '5 tin trong 10 giây');
  assert.strictEqual(f.check('a', 'một tin nữa', t0 + 11000), null);
  assert.strictEqual(f.check('b', 'xin chào bạn', t0 + 80), null, 'mỗi người đếm riêng');
});

test('Glicko: mỗi ván thay đổi tối đa 700 điểm; rd 60 -> 110 sau 1 năm', () => {
  const now = Date.now();
  const mk = (r, rd) => ({ pools: { bullet: { r, rd, vol: 0.06, n: 0, at: now }, blitz: R.newPool(), rapid: R.newPool(), classical: R.newPool() }, rating: r });
  const d = R.rateGame(mk(100, 350), mk(3500, 45), 'bullet', 1, now);
  assert.ok(Math.abs(d.a) <= R.MAX_DELTA);
  assert.ok(Math.abs(R.decayedRd({ rd: 60, at: now - 365 * 86400000 }, now) - 110) < 1);
});

test('thống kê sâu: điểm cao / thấp nhất, thắng đẹp, thua tệ, chuỗi; hoạt động 30 ngày', () => {
  const u = {};
  const at = Date.UTC(2026, 0, 10);
  Perf.addRated(u, 'blitz', { result: 'win', r: 1250, opp: { name: 'A', r: 1500 }, at });
  Perf.addRated(u, 'blitz', { result: 'win', r: 1300, opp: { name: 'B', r: 1300 }, at });
  Perf.addRated(u, 'blitz', { result: 'loss', r: 1280, opp: { name: 'C', r: 900 }, at });
  Perf.addRated(u, 'blitz', { result: 'loss', r: 1240, opp: { name: 'D', r: 1100 }, at });
  const p = u.perf.blitz;
  assert.deepStrictEqual([p.hi.r, p.lo.r], [1300, 1240]);
  assert.deepStrictEqual(p.best.map((x) => x.name), ['A', 'B']);
  assert.deepStrictEqual(p.worst.map((x) => x.name), ['C', 'D']);
  assert.deepStrictEqual([p.win.max, p.win.cur, p.loss.cur, p.loss.max], [2, 0, 2, 2]);
  Perf.addActivity(u, 'win', 'blitz', 12, at);
  Perf.addActivity(u, 'loss', 'blitz', -5, at);
  Perf.addActivity(u, 'draw', null, null, at - 40 * 86400000); // quá 30 ngày: bị xoá khi có ghi mới
  Perf.addActivity(u, 'win', null, null, at + 86400000);
  const act = Perf.activity(u);
  assert.strictEqual(act.length, 2);
  assert.deepStrictEqual(act[1], { day: '2026-01-10', w: 1, l: 1, d: 0, r: { blitz: 7 } });
  // Ngày theo múi giờ người chơi: 20 giờ UTC = 3 giờ sáng hôm sau ở Việt Nam (UTC+7)
  const vn = { tz: 420 };
  Perf.addActivity(vn, 'win', null, null, Date.UTC(2026, 0, 10, 20));
  assert.deepStrictEqual(Object.keys(vn.act), ['2026-01-11']);
});

function room2(opts) {
  const r = new Room({ code: '1', password: '1', ...opts });
  r.addPlayer({ id: 'A', name: 'A' }, 1);
  r.addPlayer({ id: 'B', name: 'B' }, 2);
  return r;
}

test('phòng: huỷ ván khi chưa quá 1 nước; quá hạn đi nước đầu thì tự huỷ', () => {
  const r = room2({});
  assert.ok(r.abortable);
  r.move('A', 0, 0);
  r.abort('B');
  assert.deepStrictEqual([r.winner, r.reason, r.abortedBy], [3, 'abort', 'B']);
  const r2 = room2({});
  r2.move('A', 0, 0); r2.move('B', 1, 1);
  assert.throws(() => r2.abort('A'), (e) => e.code === 'cannot_abort');
  const s = room2({ kind: 'series', bestOf: 3 });
  assert.throws(() => s.abort('A'), (e) => e.code === 'cannot_abort', 'trận Bo không huỷ được');
  const q = new Room({ code: '2', password: '1', firstMoveMs: 1000, clock: '3+2' });
  q.addPlayer({ id: 'A', name: 'A' }, 1);
  q.addPlayer({ id: 'B', name: 'B' }, 2);
  assert.ok(q.view().firstMove > 900 && q.turnEndsAt <= Date.now() + 1000, 'hạn đi nước đầu ngắn hơn đồng hồ');
  q.timeLoss();
  assert.deepStrictEqual([q.reason, q.abortedBy, q.noPlay], ['abort', 'A', true]);
});

test('phòng: thêm giờ, xin đi lại (chỉ phòng riêng), Berserk (chỉ giải Arena)', () => {
  const r = room2({ clock: '1+1', secondMs: 10 }); // 1 phút = 600ms
  r.moretime('A');
  assert.strictEqual(r.clockLeft.B, 750);
  assert.throws(() => room2({}).moretime('A'), (e) => e.code === 'cannot_moretime');
  // Đi lại: A đi, xin đi lại -> lùi 1 nước; A đi, B đáp, A xin -> lùi 2 nước
  const t = room2({});
  t.move('A', 0, 0);
  assert.strictEqual(t.offerTakeback('A'), 'offered');
  assert.throws(() => t.answerTakeback('A', true), (e) => e.code === 'no_takeback_offer');
  t.answerTakeback('B', true);
  assert.strictEqual(t.board.moves.length, 0);
  assert.strictEqual(t.actor(), 'A');
  t.move('A', 0, 0); t.move('B', 5, 5);
  t.offerTakeback('A');
  t.move('A', 1, 1); // đánh tiếp = huỷ lời xin
  assert.strictEqual(t.takebackOffer, null);
  t.move('B', 6, 6);
  t.offerTakeback('A');
  assert.strictEqual(t.offerTakeback('B'), 'done', 'cả hai cùng xin: đi lại luôn');
  assert.strictEqual(t.board.moves.length, 2);
  assert.strictEqual(t.actor(), 'A');
  assert.strictEqual(t.takebacks, 2);
  // Bị từ chối thì phải chờ mới xin lại được (chống bấm liên tục)
  const w = room2({ drawCooldownMs: 1000 });
  w.move('A', 0, 0);
  w.offerTakeback('A');
  w.answerTakeback('B', false);
  assert.throws(() => w.offerTakeback('A'), (e) => e.code === 'takeback_wait');
  w.takebackWait.A = 0;
  w.offerTakeback('A');
  w.move('B', 5, 5); // đánh tiếp = từ chối
  w.move('A', 1, 1);
  assert.throws(() => w.offerTakeback('A'), (e) => e.code === 'takeback_wait');
  const pub = room2({}); pub.public = true;
  pub.move('A', 0, 0);
  assert.throws(() => pub.offerTakeback('A'), (e) => e.code === 'cannot_takeback');
  // Berserk
  const b = room2({ clock: '1+1', secondMs: 10 });
  assert.throws(() => b.goBerserk('A'), (e) => e.code === 'cannot_berserk');
  const a = room2({ clock: '1+1', secondMs: 10 });
  a.tour = { arena: true };
  a.goBerserk('B');
  assert.strictEqual(a.clockLeft.B, 300);
  a.move('A', 0, 0);
  a.move('B', 5, 5);
  assert.ok(a.clockLeft.B <= 300, 'Berserk: không cộng giờ');
  assert.throws(() => a.goBerserk('A'), (e) => e.code === 'cannot_berserk', 'đã đi rồi thì không Berserk được');
});

test('phòng của giải: đối thủ sang trận khác thì người ở lại vẫn thấy ván vừa xong (phòng thường thì làm mới)', () => {
  const t = room2({});
  t.tour = { id: 't1' };
  t.move('A', 0, 0); t.move('B', 5, 5);
  t.resign('B');
  t.removePlayer('A'); // A được giải chuyển sang trận kế tiếp
  const v = t.view();
  assert.deepStrictEqual([v.winner, v.reason, v.moves.length, v.seats.x, v.seats.o, v.players.length], [1, 'resign', 2, 'A', 'B', 1]);
  const r = room2({});
  r.move('A', 0, 0); r.move('B', 5, 5);
  r.resign('B');
  r.removePlayer('A');
  assert.deepStrictEqual([r.winner, r.board.moves.length, r.seats[1]], [null, 0, null], 'phòng thường: chờ đối thủ mới');
});

test('ảnh PNG: đúng định dạng, đúng kích thước', () => {
  const png = boardPng([[0, 0], [1, 1], [1, 0]]);
  assert.deepStrictEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.strictEqual(png.readUInt32BE(16), 1200);
  assert.strictEqual(png.readUInt32BE(20), 630);
  const tiny = encodePng(2, 1, Buffer.from([255, 0, 0, 0, 0, 255]));
  const idatLen = tiny.readUInt32BE(33);
  const raw = zlib.inflateSync(tiny.subarray(41, 41 + idatLen));
  assert.deepStrictEqual([...raw], [0, 255, 0, 0, 0, 0, 255]);
  assert.ok(boardPng([]).length > 100, 'ván trống vẫn vẽ được');
});

// ---------------------------------------------------------------- Qua WebSocket / HTTP
let app, url, base;
test.before(async () => {
  app = start({ port: 0, dataFile: null, msgRate: 2000, admins: ['dd_admin'],
    timers: { THROTTLE_SCALE: 0, NEXT_GAME_MS: 50, OFFLINE_FORFEIT_MS: 300, SECOND_MS: 20, MATCH_TICK_MS: 30, LOBBY_DEBOUNCE_MS: 20, FIRST_MOVE_MS: 1500 } });
  await new Promise((r) => app.server.on('listening', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  url = base.replace('http', 'ws') + '/ws';
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
    const where = new Error().stack.split('\n')[2];
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
async function account(username, old = true) {
  for (const k of [...app.hub.fails.keys()]) if (k.startsWith('reg:')) app.hub.fails.delete(k);
  const c = await Client.open();
  await c.req({ t: 'register', username, password: 'caro-pass1', name: username }, 'welcome');
  if (old) app.store.users.get(c.me.uid).created -= 30 * 86400000; // tài khoản "cũ" (luật tài khoản mới không áp dụng)
  return c;
}
async function privateRoom(a, b, opts = {}) {
  await a.req({ t: 'createRoom', ...opts }, 'room');
  await b.req({ t: 'joinRoom', code: a.room.code, password: a.room.password }, 'room', (m) => m.room.players.length === 2);
  if (a.room.players.length !== 2) await a.wait('room', (m) => m.room.players.length === 2);
}
/** Tái đấu: chờ cả hai người nhận ván mới. */
async function rematch(a, b) {
  const no = a.room.gameNo + 1;
  const ok = (m) => m.room && m.room.gameNo === no && !m.room.winner;
  const w = Promise.all([a.wait('room', ok), b.wait('room', ok)]);
  b.send({ t: 'rematch' });
  a.send({ t: 'rematch' });
  await w;
}
async function mv(p, other, x, y) {
  const n = p.room.moves.length + 1;
  const done = (m) => m.room && (m.room.moves.length >= n || !!m.room.winner || m.room.moves.length < n - 1);
  const w = Promise.all([p.wait('room', done), other.wait('room', done)]);
  p.send({ t: 'move', x, y });
  await w;
}
/** Người thắng xếp 5 quân ở hàng row; người thua đánh rải rác ở hàng row + 9. */
async function playWin(w, l, row = 0) {
  let i = 0, j = 0;
  while (!w.room.winner) {
    if (w.room.actor === w.me.id) await mv(w, l, i++, row);
    else await mv(l, w, (j++) * 3, row + 9);
  }
}

test('đăng ký: chặn mật khẩu phổ biến và tên tục; tin nhắn bị che, gửi dồn / lặp thì bị từ chối', async () => {
  const c = await Client.open();
  assert.strictEqual((await c.req({ t: 'register', username: 'dd_weak', password: 'password' }, 'error')).code, 'weak_password');
  assert.strictEqual((await c.req({ t: 'register', username: 'dd_same', password: 'dd_same' }, 'error')).code, 'weak_password');
  assert.strictEqual((await c.req({ t: 'register', username: 'dd_name', password: 'caro-pass1', name: 'đồ chó đ.ị.t' }, 'error')).code, 'bad_name');
  c.close();
  const a = await account('dd_dm_a'), b = await account('dd_dm_b');
  await a.req({ t: 'friendAdd', username: 'dd_dm_b' }, 'toast');
  await b.req({ t: 'friendAdd', username: 'dd_dm_a' }, 'friends', (m) => m.friends.some((f) => f.id === a.me.uid));
  const got = await a.req({ t: 'dmSend', to: b.me.uid, text: 'đmm thua rồi' }, 'dm');
  assert.ok(got.msg.text.startsWith('đ**') && got.msg.text.endsWith('thua rồi'), got.msg.text);
  app.hub.T.THROTTLE_SCALE = 1; // bật chống spam cho phần này
  try {
    await a.req({ t: 'dmSend', to: b.me.uid, text: 'chơi ván nữa không?' }, 'dm');
    assert.strictEqual((await a.req({ t: 'dmSend', to: b.me.uid, text: 'chơi ván nữa không??' }, 'error')).code, 'dm_duplicate');
  } finally { app.hub.T.THROTTLE_SCALE = 0; }
  [a, b].forEach((x) => x.close());
});

test('huỷ ván: bấm huỷ / rời phòng khi chưa quá 1 nước; ván bị huỷ không tính gì', async () => {
  const a = await account('dd_ab_a'), b = await account('dd_ab_b');
  await privateRoom(a, b);
  assert.ok(a.room.abortable);
  const [x, o] = a.room.seats.x === a.me.id ? [a, b] : [b, a];
  await mv(x, o, 0, 0);
  const ab = await o.req({ t: 'abort' }, 'room', (m) => m.room.winner);
  assert.strictEqual(ab.room.reason, 'abort');
  assert.strictEqual(ab.room.share, null, 'không lưu ván');
  assert.deepStrictEqual(app.store.users.get(a.me.uid).stats, { wins: 0, losses: 0, draws: 0 });
  assert.strictEqual((await o.req({ t: 'abort' }, 'error')).code, 'cannot_abort');
  // Tái đấu, đi 2 nước: hết quyền huỷ
  await rematch(a, b);
  const [x2, o2] = a.room.seats.x === a.me.id ? [a, b] : [b, a];
  await mv(x2, o2, 0, 0);
  await mv(o2, x2, 5, 5);
  assert.strictEqual(a.room.abortable, false);
  assert.strictEqual((await a.req({ t: 'abort' }, 'error')).code, 'cannot_abort');
  [a, b].forEach((c) => c.close());
});

test('bỏ ván nhiều thì bị cấm tìm trận tạm thời; người hay bỏ ván được ghép với nhau', async () => {
  const s = await account('dd_sit'), n1 = await account('dd_nice1'), n2 = await account('dd_nice2');
  // Tìm nhanh rồi bỏ ván ngay (rời phòng trước khi đi) nhiều lần
  for (let i = 0; i < 4; i++) {
    await s.req({ t: 'quickMatch', timeLimit: 10 }, 'queue');
    await n1.req({ t: 'quickMatch', timeLimit: 10 }, 'room', (m) => m.room && m.room.players.length === 2);
    if (i === 3) break;
    const alone = n1.wait('room', (m) => !!m.room && m.room.players.length === 1);
    await s.req({ t: 'leaveRoom' }, 'room', (m) => m.room === null);
    await alone;
    await n1.req({ t: 'leaveRoom' }, 'room', (m) => m.room === null);
  }
  const ban = s.wait('toast', (m) => m.code === 'playban');
  s.send({ t: 'leaveRoom' });
  assert.strictEqual((await ban).args.n, 10, 'lần đầu: 10 phút (tài khoản cũ)');
  await n1.req({ t: 'leaveRoom' }, 'room', (m) => m.room === null);
  const err = await s.req({ t: 'quickMatch', timeLimit: 10 }, 'error');
  assert.strictEqual(err.code, 'playban');
  assert.strictEqual((await s.req({ t: 'createRoom', public: true }, 'error')).code, 'playban');
  assert.ok(s.me.playban > 0);
  const rec = app.store.users.get(n1.me.uid).play;
  assert.ok(!rec || !/[anr]/.test(rec.o), 'người bị bỏ lại không bị tính');
  // Hết cấm nhưng vẫn là "người hay bỏ ván": chờ người cùng loại, quá 20 giây (0,4 giây ở test) mới ghép với người khác
  const play = app.store.users.get(s.me.uid).play;
  play.bans[play.bans.length - 1].at -= 3600000;
  play.o = 'ga';
  await s.req({ t: 'quickMatch', timeLimit: 20 }, 'queue');
  n2.send({ t: 'quickMatch', timeLimit: 20 });
  await new Promise((r) => setTimeout(r, 150));
  assert.strictEqual(app.hub.queue.size, 2, 'chưa ghép ngay');
  await n2.wait('room', (m) => m.room && m.room.players.length === 2, 3000);
  [s, n1, n2].forEach((c) => c.close());
});

test('mất kết nối không bị tính là bỏ ván; bảng xếp hạng cho biết vì sao mình chưa có tên', async () => {
  const a = await account('dd_net_a'), b = await account('dd_net_b');
  await a.req({ t: 'quickMatch', timeLimit: 30 }, 'queue');
  await b.req({ t: 'quickMatch', timeLimit: 30 }, 'room', (m) => m.room && m.room.players.length === 2);
  if (!a.room || a.room.players.length !== 2) await a.wait('room', (m) => m.room && m.room.players.length === 2);
  const [x, o] = a.room.seats.x === a.me.id ? [a, b] : [b, a];
  await mv(x, o, 0, 0);
  await mv(o, x, 5, 5);
  const end = x.wait('room', (m) => m.room && m.room.winner, 3000);
  o.close(); // rớt mạng quá hạn: thua ván
  assert.strictEqual((await end).room.reason, 'timeout');
  const rec = app.store.users.get(o.me.uid).play;
  assert.ok(!rec || !/[anr]/.test(rec.o), 'mất kết nối không bị ghi là bỏ ván: ' + (rec && rec.o));
  // Đã có ván tính điểm nhưng rd còn cao: bảng xếp hạng báo độ lệch hiện tại
  const c = await account('dd_lb_c'), d = await account('dd_lb_d');
  await privateRoom(c, d);
  await playWin(c, d, 0);
  const lb = await c.req({ t: 'leaderboard' }, 'leaderboard');
  assert.ok(lb.me === null && lb.unranked && lb.unranked.rd > 75 && lb.unranked.need === 75 && lb.unranked.n === 1);
  [x, c, d].forEach((k) => k.close());
});

test('chống cày điểm: ván lặp lại y hệt không tính; tài khoản mới đầu hàng không tính; có đi lại không tính', async () => {
  const a = await account('dd_f_a'), b = await account('dd_f_b');
  await privateRoom(a, b);
  await playWin(a, b, 0);
  assert.strictEqual(a.room.unrated, false);
  await rematch(a, b);
  await playWin(a, b, 0); // cùng nước đi, cùng người thắng (đổi bên nhưng tọa độ y hệt)
  const g1 = await app.store.pairGames(a.me.uid, b.me.uid, 2);
  assert.strictEqual(g1.length, 2);
  // Hai ván có cùng 20 nước đầu chỉ khi người đi trước giống nhau; ván 2 đổi bên nên khác -> vẫn tính
  await rematch(a, b);
  await playWin(a, b, 0); // giống ván 1 (A lại đi trước, cùng nước, cùng thắng) -> không tính
  assert.strictEqual(a.room.unrated, true, 'ván lặp lại y hệt ván trước: không tính điểm');
  await rematch(a, b);
  await playWin(a, b, 30);
  assert.strictEqual(a.room.unrated, false, 'ván khác: tính điểm');
  // Đi lại trong ván: không tính điểm
  await rematch(a, b);
  const [x, o] = a.room.seats.x === a.me.id ? [a, b] : [b, a];
  await mv(x, o, 50, 50);
  await x.req({ t: 'takeback' }, 'room', (m) => m.room.takebackOffer === x.me.id);
  await o.req({ t: 'takebackAnswer', accept: true }, 'room', (m) => m.room.moves.length === 0 && m.room.takebacks === 1);
  await playWin(a, b, 60);
  assert.strictEqual(a.room.unrated, true, 'có đi lại: không tính điểm');
  [a, b].forEach((c) => c.close());
  // Tài khoản mới (dưới 7 ngày) thua vì đầu hàng: không tính
  const c = await account('dd_f_c'), d = await account('dd_f_d', false);
  await privateRoom(c, d);
  const [cx, cxo] = c.room.seats.x === c.me.id ? [c, d] : [d, c];
  for (let i = 0; i < 6; i++) { await mv(cx, cxo, i * 2, 3); await mv(cxo, cx, i * 2, 7); }
  const end = await d.req({ t: 'resign' }, 'room', (m) => m.room.winner);
  assert.strictEqual(end.room.unrated, true);
  [c, d].forEach((x) => x.close());
});

test('thêm giờ, xin đi lại (từ chối), hồ sơ có thống kê sâu và hoạt động', async () => {
  const a = await account('dd_m_a'), b = await account('dd_m_b');
  await privateRoom(a, b, { clock: '3+2' });
  const before = a.room.clocks;
  const tb = b.wait('toast', (m) => m.code === 'moretime_given');
  await a.req({ t: 'moretime' }, 'room', (m) => m.room.clocks && (a.room.seats.x === b.me.id ? m.room.clocks.x : m.room.clocks.o) > (a.room.seats.x === b.me.id ? before.x : before.o));
  await tb;
  const [x, o] = a.room.seats.x === a.me.id ? [a, b] : [b, a];
  await mv(x, o, 0, 0);
  await x.req({ t: 'takeback' }, 'room', (m) => m.room.takebackOffer);
  const no = x.wait('toast', (m) => m.code === 'takeback_declined');
  await o.req({ t: 'takebackAnswer', accept: false }, 'room', (m) => !m.room.takebackOffer);
  await no;
  await playWin(x, o, 2);
  assert.strictEqual(a.room.unrated, false);
  const pf = (await b.req({ t: 'profile', username: 'dd_m_a' }, 'profile')).profile;
  const pool = a.room.pool;
  assert.ok(pf.perf[pool] && pf.perf[pool].hi && pf.perf[pool].best.length + pf.perf[pool].worst.length === 1);
  assert.strictEqual(pf.activity.length, 1);
  assert.strictEqual(pf.activity[0].w + pf.activity[0].l, 1);
  [a, b].forEach((c) => c.close());
});

test('quản trị: số liệu máy chủ chỉ quản trị viên xem được', async () => {
  const u = await account('dd_user'), ad = await account('dd_admin');
  assert.strictEqual((await u.req({ t: 'adminStats' }, 'error')).code, 'admin_only');
  const s = (await ad.req({ t: 'adminStats' }, 'adminStats')).stats;
  assert.ok(s.conns >= 2 && s.online >= 2 && s.mem.rss > 0 && s.uptime >= 0);
  assert.ok(s.count.some(([t, n]) => t === 'hello' && n >= 2));
  assert.ok(Array.isArray(s.slow));
  [u, ad].forEach((c) => c.close());
});

test('HTTP: ảnh xem trước ván, thẻ og cho link chia sẻ, API công khai (CORS, giới hạn)', async () => {
  const a = await account('dd_h_a'), b = await account('dd_h_b');
  await privateRoom(a, b);
  await playWin(a, b, 0);
  const share = a.room.share;
  const png = await fetch(`${base}/api/replay/${share}.png`);
  assert.strictEqual(png.status, 200);
  assert.strictEqual(png.headers.get('content-type'), 'image/png');
  assert.ok((await png.arrayBuffer()).byteLength > 1000);
  assert.strictEqual((await fetch(`${base}/api/replay/khongco123.png`)).status, 404);
  const html = await (await fetch(`${base}/?replay=${share}`)).text();
  assert.ok(html.includes(`property="og:image" content="${base}/api/replay/${share}.png"`), 'có og:image');
  assert.ok(html.includes('og:title') && html.includes('dd_h_a'));
  const plain = await (await fetch(`${base}/?replay=<script>`)).text();
  assert.ok(!plain.includes('og:image') && !plain.includes('<script>alert'));
  // API công khai
  const p = await fetch(`${base}/api/player/dd_h_a`);
  assert.strictEqual(p.status, 200);
  assert.strictEqual(p.headers.get('access-control-allow-origin'), '*');
  const pj = await p.json();
  assert.strictEqual(pj.username, 'dd_h_a');
  assert.ok(pj.perfs.rapid && !('email' in pj) && !('pass' in pj) && !('friends' in pj));
  assert.strictEqual((await fetch(`${base}/api/player/khong_co_ai`)).status, 404);
  const lb = await (await fetch(`${base}/api/leaderboard?pool=blitz`)).json();
  assert.strictEqual(lb.pool, 'blitz');
  assert.ok(Array.isArray(lb.players));
  // Vẽ ảnh mới bị giới hạn theo IP (ảnh đã có sẵn thì không tính)
  const shares = [];
  for (let i = 0; i < 22; i++) shares.push(app.store.recordGame({ kind: 'room', xId: 'png' + i, oId: null, xName: 'a', oName: 'b', winner: 1, reason: 'win', moves: [[i, 0], [i, 1]] }));
  const codes = [];
  for (const sh of shares) { codes.push((await fetch(`${base}/api/replay/${sh}.png`)).status); await new Promise((r) => setTimeout(r, 130)); } // < 10 ảnh / giây
  assert.ok(codes.filter((c) => c === 429).length >= 1 && codes.filter((c) => c === 200).length >= 18 && !codes.includes(404), codes.join(','));
  assert.strictEqual((await fetch(`${base}/api/replay/${share}.png`)).status, 200, 'ảnh đã có sẵn vẫn trả về');
  const pre = await fetch(`${base}/api/leaderboard`, { method: 'OPTIONS' });
  assert.strictEqual(pre.status, 204);
  let last;
  for (let i = 0; i < 70; i++) last = await fetch(`${base}/api/leaderboard`);
  assert.strictEqual(last.status, 429, 'mỗi IP tối đa 60 lần / phút');
  [a, b].forEach((c) => c.close());
});
