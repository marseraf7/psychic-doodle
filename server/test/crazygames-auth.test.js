// Đăng nhập bằng tài khoản CrazyGames (Full Launch – làm sẵn, tắt mặc định): kiểm JWT (src/crazygames-auth.js), nối vào
// host-auth.js / hub/host-login.js. Khoá RSA GIẢ sinh trong bài thử, JWKS giả thay cho máy chủ CrazyGames.
// Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const util = require('util');
const WebSocket = require('ws');
const CG = require('../src/crazygames-auth.js');
const H = require('../src/host-auth.js');
const { start } = require('../server.js');

const GAME = 'caro-x-gomoku-test';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwkOf = (pub, kid) => ({ ...pub.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' });
const JWKS = { keys: [jwkOf(publicKey, 'ingame-auth'), jwkOf(other.publicKey, 'ingame-auth-legacy')] };
const SEC = () => Math.floor(Date.now() / 1000);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** JWT ký RS256 bằng khoá giả. */
function jwt(payload = {}, { header = {}, key = privateKey } = {}) {
  const h = b64({ alg: 'RS256', typ: 'JWT', kid: 'ingame-auth', ...header });
  const p = b64({ userId: 'cgUser1', gameId: GAME, username: 'Player.One', profilePictureUrl: 'https://x/y.png', iat: SEC(), exp: SEC() + 3600, ...payload });
  const sig = crypto.sign('sha256', Buffer.from(h + '.' + p), key).toString('base64url');
  return h + '.' + p + '.' + sig;
}
function verifier(fetchJwks = async () => JWKS) {
  let calls = 0;
  const v = CG.makeCgVerifier({ gameId: GAME, fetchJwks: async () => { calls++; return fetchJwks(); }, log: () => {} });
  return { v, calls: () => calls };
}

// ------------------------------------------------------------------ hàm thuần
test('CrazyGames: token đúng → userId, tên từ username, mốc iat; khoá nhớ đệm (một lần tải cho nhiều token)', async () => {
  const { v, calls } = verifier();
  const r = await v.verify(jwt());
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.deepStrictEqual(r.user, { id: 'cgUser1', firstName: 'Player.One', username: 'Player.One', lang: '' });
  assert.ok(Number.isInteger(r.ts));
  assert.strictEqual((await v.verify(jwt({ userId: 'cgUser2' }))).ok, true);
  assert.strictEqual(calls(), 1);
});

test('CrazyGames: sai chữ ký / sửa nội dung / khoá khác / alg none, HS256, kid cũ / sai gameId / hết hạn / iat tương lai / userId lạ → từ chối', async () => {
  const { v } = verifier();
  const good = jwt();
  const [h, p, s] = good.split('.');
  const flip = (x) => x.slice(0, -2) + (x.slice(-2, -1) === 'A' ? 'B' : 'A') + x.slice(-1);
  assert.strictEqual((await v.verify(h + '.' + p + '.' + flip(s))).why, 'sig');
  assert.strictEqual((await v.verify(h + '.' + b64({ ...JSON.parse(Buffer.from(p, 'base64url')), userId: 'admin' }) + '.' + s)).why, 'sig');
  assert.strictEqual((await v.verify(jwt({}, { key: other.privateKey }))).why, 'sig');
  assert.strictEqual((await v.verify(jwt({}, { header: { kid: 'ingame-auth-legacy' }, key: other.privateKey }))).why, 'alg', 'không nhận khoá cũ');
  assert.strictEqual((await v.verify(b64({ alg: 'none', kid: 'ingame-auth' }) + '.' + p + '.')).why, 'format');
  assert.strictEqual((await v.verify(b64({ alg: 'none', kid: 'ingame-auth' }) + '.' + p + '.' + s)).why, 'alg');
  // HS256 dùng khoá công khai làm bí mật (lỗi "nhầm thuật toán" kinh điển): không có đường nào chạy HMAC
  const hh = b64({ alg: 'HS256', kid: 'ingame-auth' });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const hs = crypto.createHmac('sha256', pem).update(hh + '.' + p).digest('base64url');
  assert.strictEqual((await v.verify(hh + '.' + p + '.' + hs)).why, 'alg');
  assert.strictEqual((await v.verify(jwt({ gameId: 'game-khac' }))).why, 'game');
  assert.strictEqual((await v.verify(jwt({ gameId: undefined }))).why, 'game');
  assert.strictEqual((await v.verify(jwt({ exp: SEC() - 120 }))).why, 'expired');
  assert.strictEqual((await v.verify(jwt({ exp: SEC() - 30 }))).ok, true, 'đồng hồ lệch 30 giây vẫn nhận');
  assert.strictEqual((await v.verify(jwt({ exp: 'mai' }))).why, 'expired');
  assert.strictEqual((await v.verify(jwt({ iat: SEC() + 3600 }))).why, 'iat');
  for (const userId of ['', 'a b', 'x'.repeat(65), 123, null, '<script>']) {
    assert.strictEqual((await v.verify(jwt({ userId }))).why, 'user', String(userId));
  }
  for (const bad of [null, 12, '', 'a.b', 'a.b.c.d', 'x'.repeat(5000), '!!.!!.!!', b64('chuỗi') + '.' + p + '.' + s]) {
    assert.strictEqual((await v.verify(bad)).ok, false, String(bad).slice(0, 20));
  }
});

test('CrazyGames: JWKS tải lỗi / rỗng / khoá hỏng → từ chối (no_key), tải lại tối đa mỗi phút; khoá đổi (kid mới) thì tải lại', async () => {
  let mode = 'fail';
  const { v, calls } = verifier(async () => {
    if (mode === 'fail') throw new Error('mạng');
    if (mode === 'empty') return { keys: [{ kty: 'EC', kid: 'ingame-auth' }, { kty: 'RSA', kid: 'ingame-auth', n: '!!', e: 'AQAB' }] };
    return JWKS;
  });
  const t0 = Date.now();
  assert.strictEqual((await v.verify(jwt(), t0)).why, 'no_key');
  assert.strictEqual((await v.verify(jwt(), t0 + 1000)).why, 'no_key');
  assert.strictEqual(calls(), 1, 'token rác dồn dập không làm máy chủ gọi CrazyGames liên tục');
  mode = 'empty';
  assert.strictEqual((await v.verify(jwt(), t0 + 61000)).why, 'no_key');
  assert.strictEqual(calls(), 2);
  mode = 'ok';
  assert.strictEqual((await v.verify(jwt(), t0 + 122000)).ok, true);
  assert.strictEqual(calls(), 3);
  // Nhiều yêu cầu cùng lúc khi chưa có khoá: một lượt tải chung
  const w = verifier();
  const rs = await Promise.all([1, 2, 3, 4].map((i) => w.v.verify(jwt({ userId: 'u' + i }))));
  assert.ok(rs.every((r) => r.ok));
  assert.strictEqual(w.calls(), 1);
});

test('makeHostAuth: CRAZYGAMES_GAME_ID bật provider crazygames (verify trả Promise); sai dạng → tắt, log không có giá trị', async () => {
  assert.strictEqual(H.makeHostAuth({}), null);
  const logs = [];
  assert.strictEqual(H.makeHostAuth({ CRAZYGAMES_GAME_ID: 'có dấu cách <x>' }, (m) => logs.push(m)), null);
  assert.ok(logs.length === 1 && !logs[0].includes('<x>'));
  const a = H.makeHostAuth({ CRAZYGAMES_GAME_ID: GAME }, () => {}, { fetchJwks: async () => JWKS });
  assert.deepStrictEqual([...a.providers], ['crazygames']);
  const r = a.verify('crazygames', jwt());
  assert.ok(r instanceof Promise);
  assert.strictEqual((await r).ok, true);
  assert.strictEqual(a.verify('telegram', 'x').why, 'disabled');
});

// ------------------------------------------------------------------ máy chủ
let app, url;
const logs = [];
const cons = {};
test.before(async () => {
  for (const k of ['log', 'warn', 'error', 'info']) {
    cons[k] = console[k];
    console[k] = (...a) => { logs.push(a.map((x) => (typeof x === 'string' ? x : util.inspect(x))).join(' ')); };
  }
  const hostAuth = H.makeHostAuth({ CRAZYGAMES_GAME_ID: GAME }, () => {}, { fetchJwks: async () => JWKS });
  app = start({ port: 0, dataFile: null, msgRate: 2000, admins: ['boss_cg'], hostAuth, timers: { THROTTLE_SCALE: 0 } });
  await new Promise((r) => app.server.on('listening', r));
  url = `ws://127.0.0.1:${app.server.address().port}/ws`;
});
test.after(async () => {
  await app.stop();
  Object.assign(console, cons);
});
test.beforeEach(() => { if (app) app.hub.fails.clear(); });

async function open() {
  const c = { msgs: [], waiters: [] };
  c.ws = new WebSocket(url);
  c.ws.on('message', (d) => {
    const m = JSON.parse(d);
    c.msgs.push(m);
    if (m.t === 'welcome' || m.t === 'me') c.me = m.me;
    if (m.t === 'welcome') c.welcome = m;
    c.waiters = c.waiters.filter((w) => !w(m));
  });
  await new Promise((r) => c.ws.on('open', r));
  c.wait = (t, ms = 10000) => new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('Hết giờ chờ ' + t)), ms);
    c.waiters.push((m) => { if (m.t === t || (t !== 'error' && m.t === 'error')) { clearTimeout(timer); res(m); return true; } return false; });
  });
  c.send = (m) => c.ws.send(JSON.stringify(m));
  c.req = (m, t) => { const p = c.wait(t); c.send(m); return p; };
  c.send({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex') });
  await c.wait('welcome');
  return c;
}

test('máy chủ: welcome báo crazygames; im lặng → unlinked; tạo → tài khoản cg_<ngẫu nhiên> tên từ username; mở lại → vào đúng tài khoản', async () => {
  const c = await open();
  assert.deepStrictEqual(c.welcome.hostAuth, ['crazygames']);
  const st = await c.req({ t: 'hostLogin', provider: 'crazygames', data: jwt({ userId: 'cgA' }), mode: 'auto' }, 'hostState');
  assert.strictEqual(st.state, 'unlinked');
  const w = await c.req({ t: 'hostLogin', provider: 'crazygames', data: jwt({ userId: 'cgA', username: 'Neko_77' }), mode: 'create' }, 'welcome');
  assert.strictEqual(w.t, 'welcome');
  assert.match(c.me.username, /^cg_[a-z0-9]{8}$/);
  assert.strictEqual(c.me.name, 'Neko_77');
  assert.deepStrictEqual(c.me.hosts, ['crazygames']);
  const uid = c.me.uid;
  c.ws.close();
  const d = await open();
  const w2 = await d.req({ t: 'hostLogin', provider: 'crazygames', data: jwt({ userId: 'cgA', iat: SEC() + 1 }), mode: 'auto' }, 'welcome');
  assert.strictEqual(w2.t, 'welcome');
  assert.strictEqual(d.me.uid, uid);
  d.ws.close();
});

test('máy chủ: token sai / của game khác → host_auth_failed chung chung, log không kèm token; kết nối đóng trong lúc chờ khoá → không gắn phiên', async () => {
  const c = await open();
  const e = await c.req({ t: 'hostLogin', provider: 'crazygames', data: jwt({ gameId: 'khac' }), mode: 'create' }, 'error');
  assert.strictEqual(e.code, 'host_auth_failed');
  const tok = jwt({ userId: 'cgB' }, { key: other.privateKey });
  const e2 = await c.req({ t: 'hostLogin', provider: 'crazygames', data: tok, mode: 'create' }, 'error');
  assert.strictEqual(e2.code, 'host_auth_failed');
  assert.ok(!logs.some((l) => l.includes(tok.split('.')[1])), 'không ghi token vào log');
  assert.ok(c.me.guest);
  c.ws.close();
  // Kết nối đóng giữa lúc chờ: gọi thẳng handler với kết nối giả đã đóng
  const hub = app.hub;
  const fake = { pid: 'g_fakeclosed', ip: '10.9.9.9', sent: [], send(m) { this.sent.push(m); } };
  const p = hub.handle(fake, { t: 'hostLogin', provider: 'crazygames', data: jwt({ userId: 'cgClosed' }), mode: 'create' });
  fake.gone = true;
  await p;
  assert.strictEqual(hub.store.hlOwner('crazygames', 'cgClosed'), null, 'không tạo tài khoản cho kết nối đã đóng');
});
