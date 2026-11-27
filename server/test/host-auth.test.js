// Đăng nhập bằng Telegram / VK Mini App: kiểm chữ ký (src/host-auth.js), liên kết (src/store-hostlinks.js), luồng trên
// máy chủ (src/hub/host-login.js). Vector tự tạo bằng token / khoá giả theo đúng thuật toán của tài liệu chính thức, cộng
// vector VK chính thức (github.com/VKCOM/vk-apps-launch-params/examples/node.js).
// Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const WebSocket = require('ws');
const H = require('../src/host-auth.js');
const { Store } = require('../src/store.js');
const { start } = require('../server.js');

// Bí mật GIẢ chỉ dùng trong bài thử
const TG_TOKEN = '123456789:TEST-fake-bot-token_ABCDEFGHIJKLMNOP';
const VK_SECRET = 'fakeVkSecretKey0123';
const VK_APP = '7654321';
const NOW = Date.now();
const SEC = Math.floor(NOW / 1000);

/** initData ký bằng token giả. fields: { key: giá trị chưa mã hoá }; opts.order: thứ tự key trong chuỗi; opts.hash: ghi đè. */
function tgData(fields, { token = TG_TOKEN, order = null, hash = null, extra = '' } = {}) {
  const keys = Object.keys(fields);
  const dcs = [...keys].sort().map((k) => k + '=' + fields[k]).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const h = hash || crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  const q = new URLSearchParams();
  for (const k of order || keys) q.append(k, fields[k]);
  q.append('hash', h);
  return q.toString() + extra;
}
const tgUser = (id, more = {}) => JSON.stringify({ id, first_name: 'Ivan', username: 'ivan_tg', language_code: 'ru', ...more });
const tgFields = (id = 111, more = {}) => ({ query_id: 'AAE' + id, user: tgUser(id), auth_date: String(SEC), signature: 'c2lnbmF0dXJl', ...more });

/** Chuỗi tham số VK ký bằng khoá giả (giá trị mã hoá bằng encodeURIComponent như VK). */
function vkData(params, { secret = VK_SECRET, extra = '', sign = null } = {}) {
  const vk = Object.keys(params).filter((k) => k.startsWith('vk_')).sort();
  const str = vk.map((k) => k + '=' + encodeURIComponent(params[k])).join('&');
  const s = sign || crypto.createHmac('sha256', secret).update(str).digest('base64url');
  return Object.keys(params).map((k) => k + '=' + encodeURIComponent(params[k])).join('&') + '&sign=' + s + extra;
}
const vkParams = (id = '222', more = {}) => ({ vk_user_id: id, vk_app_id: VK_APP, vk_is_app_user: '1', vk_language: 'ru', vk_platform: 'desktop_web', vk_ts: String(SEC), ...more });

// ------------------------------------------------------------------ Telegram – hàm thuần
test('Telegram: chữ ký đúng (có cả trường signature trong data_check_string) → id, tên, username, ngôn ngữ', () => {
  const r = H.tgVerify(tgData(tgFields(111)), TG_TOKEN, { now: NOW });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.deepStrictEqual(r.user, { id: '111', firstName: 'Ivan', username: 'ivan_tg', lang: 'ru' });
  assert.strictEqual(r.authDate, SEC);
  // Tính hash mà BỎ signature khỏi chuỗi (cách của kiểm bên thứ ba) → máy chủ phải từ chối: signature nằm trong chuỗi
  const f = tgFields(111);
  const noSig = { ...f };
  delete noSig.signature;
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TG_TOKEN).digest();
  const wrong = crypto.createHmac('sha256', secret).update(Object.keys(noSig).sort().map((k) => k + '=' + noSig[k]).join('\n')).digest('hex');
  assert.strictEqual(H.tgVerify(tgData(f, { hash: wrong }), TG_TOKEN, { now: NOW }).why, 'sig');
  // Không có signature (bản Telegram cũ) vẫn đúng
  assert.strictEqual(H.tgVerify(tgData({ user: tgUser(5), auth_date: String(SEC) }), TG_TOKEN, { now: NOW }).ok, true);
});

test('Telegram: sai 1 ký tự (hash / dữ liệu), sai token, thiếu hash, hash sai dạng, trùng key → từ chối', () => {
  const good = tgData(tgFields(111));
  const h = new URLSearchParams(good).get('hash');
  const flip = (s, i) => s.slice(0, i) + (s[i] === 'a' ? 'b' : 'a') + s.slice(i + 1);
  assert.strictEqual(H.tgVerify(good.replace(h, flip(h, 10)), TG_TOKEN, { now: NOW }).why, 'sig');
  assert.strictEqual(H.tgVerify(good.replace('Ivan', 'Ivam'), TG_TOKEN, { now: NOW }).why, 'sig');
  assert.strictEqual(H.tgVerify(good, '123456789:another-token-xxxxxxxxxxxxxxxx', { now: NOW }).why, 'sig');
  assert.strictEqual(H.tgVerify(good.replace(/&hash=[0-9a-f]+/, ''), TG_TOKEN, { now: NOW }).why, 'no_hash');
  assert.strictEqual(H.tgVerify(good.replace(h, h.slice(0, 63)), TG_TOKEN, { now: NOW }).why, 'hash_format', 'hash ngắn hơn: không ném lỗi');
  assert.strictEqual(H.tgVerify(good.replace(h, h + '00'), TG_TOKEN, { now: NOW }).why, 'hash_format');
  assert.strictEqual(H.tgVerify(good.replace(h, h.toUpperCase()), TG_TOKEN, { now: NOW }).ok, true, 'hash chữ hoa vẫn nhận');
  assert.strictEqual(H.tgVerify(good + '&auth_date=' + SEC, TG_TOKEN, { now: NOW }).why, 'dup', 'trùng key');
  assert.strictEqual(H.tgVerify(good + '&hash=' + h, TG_TOKEN, { now: NOW }).why, 'dup', 'trùng hash');
  assert.strictEqual(H.tgVerify('', TG_TOKEN).why, 'format');
  assert.strictEqual(H.tgVerify(null, TG_TOKEN).why, 'format');
  assert.strictEqual(H.tgVerify({ hash: h }, TG_TOKEN).why, 'format');
  assert.strictEqual(H.tgVerify('a=' + 'x'.repeat(5000), TG_TOKEN).why, 'format', 'quá dài');
  assert.strictEqual(H.tgVerify(good, '').why, 'disabled');
});

test('Telegram: thứ tự key trong chuỗi khác vẫn đúng; auth_date quá hạn / tương lai / thiếu', () => {
  const f = tgFields(111);
  assert.strictEqual(H.tgVerify(tgData(f, { order: ['user', 'signature', 'auth_date', 'query_id'] }), TG_TOKEN, { now: NOW }).ok, true);
  const at = (s, o = {}) => H.tgVerify(tgData(tgFields(111, { auth_date: String(s) })), TG_TOKEN, { now: NOW, ...o });
  assert.strictEqual(at(SEC - 86400).ok, true, 'đúng 24 giờ: còn nhận');
  assert.strictEqual(at(SEC - 86401).why, 'ts_expired');
  assert.strictEqual(at(SEC + 299).ok, true, 'lệch giờ < 5 phút');
  assert.strictEqual(at(SEC + 301).why, 'ts_future');
  assert.strictEqual(at(SEC - 120, { maxAgeSec: 60 }).why, 'ts_expired', 'cấu hình rút ngắn');
  assert.strictEqual(at('abc').why, 'ts_format');
  const noDate = tgFields(111);
  delete noDate.auth_date;
  assert.strictEqual(H.tgVerify(tgData(noDate), TG_TOKEN, { now: NOW }).why, 'ts_format');
});

test('Telegram: user JSON hỏng / thiếu id / id sai kiểu (đã ký đúng) → từ chối; tên làm sạch', () => {
  const v = (user) => H.tgVerify(tgData(tgFields(1, { user })), TG_TOKEN, { now: NOW });
  assert.strictEqual(v('{"id":1,').why, 'user_json');
  assert.strictEqual(v('{"first_name":"A"}').why, 'user');
  assert.strictEqual(v('{"id":"12"}').why, 'user');
  assert.strictEqual(v('{"id":-5}').why, 'user');
  assert.strictEqual(v('[1]').why, 'user');
  const noUser = tgFields(1);
  delete noUser.user;
  assert.strictEqual(H.tgVerify(tgData(noUser), TG_TOKEN, { now: NOW }).why, 'user');
  const r = v(JSON.stringify({ id: 7, first_name: ' A\u0000B ' + 'x'.repeat(100) }));
  assert.strictEqual(r.user.firstName.length, 64);
  assert.ok(r.user.firstName.startsWith('AB'));
  assert.strictEqual(r.user.username, '');
});

// ------------------------------------------------------------------ VK – hàm thuần
test('VK: vector chính thức (VKCOM/vk-apps-launch-params) cho đúng sign; thiếu vk_ts thì vẫn từ chối (bắt buộc vk_ts)', () => {
  const url = 'https://example.com/?vk_user_id=494075&vk_app_id=6736218&vk_is_app_user=1&vk_are_notifications_enabled=1&vk_language=ru&vk_access_token_settings=&vk_platform=android&sign=htQFduJpLxz7ribXRZpDFUH-XEUhC9rBPTJkjUFEkRA';
  const q = url.slice(url.indexOf('?'));
  assert.strictEqual(H.vkSign(q, 'wvl68m4dR1UpLrVRli'), 'htQFduJpLxz7ribXRZpDFUH-XEUhC9rBPTJkjUFEkRA');
  assert.strictEqual(H.vkVerify(q, 'wvl68m4dR1UpLrVRli').why, 'ts_format');
  assert.strictEqual(H.vkVerify(q, 'sai-khoa').why, 'sig');
  assert.strictEqual(H.vkSign('host=vk', 'k'), null);
  assert.strictEqual(H.vkSign('%E0%A4%A', 'k'), null);
});

test('VK: chữ ký đúng; tham số không phải vk_ bị chèn không ảnh hưởng; chèn thêm vk_ thì sai; giá trị cần mã hoá', () => {
  const ok = (s, o = {}) => H.vkVerify(s, VK_SECRET, { now: NOW, appId: VK_APP, ...o });
  const r = ok('?' + vkData(vkParams('222')));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.deepStrictEqual(r.user, { id: '222', firstName: '', username: '', lang: 'ru' });
  assert.strictEqual(ok(vkData(vkParams('222'), { extra: '&host=vk&hash=room-123456&foo=bar&odr_enabled=1&' })).ok, true, 'host / hash / foo không nằm trong chữ ký');
  assert.strictEqual(ok('host=vk&' + vkData(vkParams('222'))).ok, true);
  assert.strictEqual(ok(vkData(vkParams('222'), { extra: '&vk_is_favorite=1' })).why, 'sig', 'thêm vk_ không có trong chữ ký');
  assert.strictEqual(ok(vkData(vkParams('222')).replace('vk_user_id=222', 'vk_user_id=223')).why, 'sig', 'đổi người dùng');
  assert.strictEqual(ok(vkData(vkParams('222', { vk_access_token_settings: 'friends,photos', vk_ref: 'catalog recommendation' }))).ok, true, 'giá trị có dấu phẩy / dấu cách');
  // Thứ tự tham số trong chuỗi không quan trọng
  const parts = vkData(vkParams('222')).split('&').reverse().join('&');
  assert.strictEqual(ok(parts).ok, true);
  // Không kiểm appId khi không đặt; đặt mà khác → từ chối
  assert.strictEqual(ok(vkData(vkParams('222', { vk_app_id: '1' })), { appId: '' }).ok, true);
  assert.strictEqual(ok(vkData(vkParams('222', { vk_app_id: '1' }))).why, 'app_id');
});

test('VK: sai 1 ký tự sign, sign sai độ dài / có "=" cuối, thiếu sign, trùng key, mã hoá hỏng, vk_ts, vk_user_id', () => {
  const ok = (s, o = {}) => H.vkVerify(s, VK_SECRET, { now: NOW, appId: VK_APP, ...o });
  const good = vkData(vkParams('222'));
  const sign = good.split('sign=')[1];
  const flip = sign.slice(0, 5) + (sign[5] === 'A' ? 'B' : 'A') + sign.slice(6);
  assert.strictEqual(ok(good.replace(sign, flip)).why, 'sig');
  assert.strictEqual(ok(good + '=').ok, true, 'nhận cả khi còn "=" cuối');
  assert.strictEqual(ok(good.replace(sign, sign.slice(0, 40))).why, 'sign_format', 'độ dài khác: không ném lỗi');
  assert.strictEqual(ok(good.replace(sign, sign + 'AAAA')).why, 'sign_format');
  assert.strictEqual(ok(good.replace('&sign=' + sign, '')).why, 'no_sign');
  assert.strictEqual(ok(good + '&sign=' + sign).why, 'dup');
  assert.strictEqual(ok(good + '&vk_user_id=222').why, 'dup');
  assert.strictEqual(ok(good + '&x=%E0%A4%A').why, 'format');
  assert.strictEqual(ok('sign=' + sign).why, 'no_params');
  assert.strictEqual(ok('').why, 'format');
  assert.strictEqual(ok(123).why, 'format');
  assert.strictEqual(H.vkVerify(good, '').why, 'disabled');
  assert.strictEqual(ok(vkData(vkParams('222', { vk_ts: String(SEC - 86401) }))).why, 'ts_expired');
  assert.strictEqual(ok(vkData(vkParams('222', { vk_ts: String(SEC + 301) }))).why, 'ts_future');
  const noTs = vkParams('222');
  delete noTs.vk_ts;
  assert.strictEqual(ok(vkData(noTs)).why, 'ts_format');
  assert.strictEqual(ok(vkData(vkParams('0'))).why, 'user');
  assert.strictEqual(ok(vkData(vkParams('abc'))).why, 'user');
  const noUser = vkParams('1');
  delete noUser.vk_user_id;
  assert.strictEqual(ok(vkData(noUser)).why, 'user');
});

test('so sánh timing-safe: độ dài khác / rỗng / không phải Buffer → false, không ném lỗi', () => {
  assert.strictEqual(H.sameBytes(Buffer.from('ab'), Buffer.from('abc')), false);
  assert.strictEqual(H.sameBytes(Buffer.alloc(0), Buffer.alloc(0)), false);
  assert.strictEqual(H.sameBytes('ab', 'ab'), false);
  assert.strictEqual(H.sameBytes(Buffer.from('ab'), Buffer.from('ab')), true);
  // Bảo đảm có dùng crypto.timingSafeEqual
  const orig = crypto.timingSafeEqual;
  let called = 0;
  crypto.timingSafeEqual = (a, b) => { called++; return orig(a, b); };
  try { H.tgVerify(tgData(tgFields(1)), TG_TOKEN, { now: NOW }); H.vkVerify(vkData(vkParams('1')), VK_SECRET, { now: NOW }); } finally { crypto.timingSafeEqual = orig; }
  assert.strictEqual(called, 2);
});

test('makeHostAuth: thiếu biến môi trường → tắt (null); sai dạng → tắt / bỏ qua, log không chứa bí mật; bí mật không lộ khi in đối tượng', () => {
  const logs = [];
  const log = (m) => logs.push(m);
  assert.strictEqual(H.makeHostAuth({}, log), null);
  assert.strictEqual(H.makeHostAuth({ TELEGRAM_BOT_TOKEN: '  ', VK_APP_SECRET: '' }, log), null);
  assert.strictEqual(H.makeHostAuth({ TELEGRAM_BOT_TOKEN: 'khong-dung-dang-secret-xyz' }, log), null);
  assert.ok(logs.some((m) => /TELEGRAM_BOT_TOKEN sai/.test(m)) && !logs.join().includes('khong-dung-dang-secret-xyz'));
  const a = H.makeHostAuth({ TELEGRAM_BOT_TOKEN: TG_TOKEN, VK_APP_SECRET: VK_SECRET, VK_APP_ID: 'abc', HOST_AUTH_MAX_AGE: '5' }, log);
  assert.deepStrictEqual([...a.providers], ['telegram', 'vk']);
  assert.strictEqual(a.maxAgeSec, 86400, 'giá trị sai → mặc định');
  assert.ok(logs.some((m) => /VK_APP_ID/.test(m)) && logs.some((m) => /HOST_AUTH_MAX_AGE/.test(m)));
  assert.strictEqual(H.makeHostAuth({ VK_APP_SECRET: VK_SECRET, HOST_AUTH_MAX_AGE: '600' }).maxAgeSec, 600);
  assert.deepStrictEqual([...H.makeHostAuth({ VK_APP_SECRET: VK_SECRET }).providers], ['vk']);
  assert.strictEqual(H.makeHostAuth({ VK_APP_SECRET: VK_SECRET }).verify('telegram', 'x').why, 'disabled');
  assert.strictEqual(a.verify('zalo', 'x').why, 'disabled');
  assert.strictEqual(a.verify('telegram', tgData(tgFields(9))).ok, true);
  assert.strictEqual(a.verify('vk', vkData(vkParams('9', { vk_app_id: '5' }))).ok, true, 'VK_APP_ID sai dạng → không kiểm app id');
  const shown = JSON.stringify(a) + util.inspect(a, { depth: 5, showHidden: true }) + String(a.verify);
  for (const s of [TG_TOKEN, VK_SECRET]) assert.ok(!shown.includes(s), 'bí mật không nằm trong đối tượng');
  assert.ok(Object.isFrozen(a));
});

// ------------------------------------------------------------------ Lưu trữ
test('store: bảng host_links (có trên CSDL cũ, thêm cột seen), duy nhất theo (provider, id) và (tài khoản, provider), xoá tài khoản xoá liên kết', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-hl-'));
  const file = path.join(dir, 'caro.db');
  const { DatabaseSync } = require('node:sqlite');
  const old = new DatabaseSync(file); // CSDL "bản cũ": chưa có host_links
  old.exec('CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, data TEXT NOT NULL)');
  // Bảng host_links của bản thử trước (chưa có cột seen) → tự thêm cột
  old.exec('CREATE TABLE host_links (provider TEXT NOT NULL, ext_id TEXT NOT NULL, uid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (provider, ext_id))');
  old.close();
  const s = new Store(file);
  const a = s.createUser({ username: 'hl_a', name: 'A' });
  const b = s.createUser({ username: 'hl_b', name: 'B' });
  assert.strictEqual(s.hlLink('telegram', '1', a.id, 5), true);
  assert.strictEqual(s.hlLink('telegram', '1', b.id), false, 'một Telegram chỉ gắn một tài khoản');
  assert.strictEqual(s.hlLink('telegram', '2', a.id), false, 'một tài khoản chỉ gắn một Telegram');
  assert.strictEqual(s.hlLink('vk', '1', a.id), true, 'cùng số id nhưng nền tảng khác');
  assert.strictEqual(s.hlOwner('telegram', '1'), a.id);
  assert.deepStrictEqual(s.hlList(a.id), [{ provider: 'telegram', at: 5 }, { provider: 'vk', at: s.hlList(a.id)[1].at }]);
  const cols = s.db.prepare('PRAGMA table_info(host_links)').all().map((c) => c.name);
  assert.deepStrictEqual(cols, ['provider', 'ext_id', 'uid', 'at', 'seen'], 'chỉ lưu dữ liệu tối thiểu');
  // Mốc dữ liệu khởi chạy (chống phát lại): chỉ nhận mốc không cũ hơn; không có liên kết / mốc sai → false
  assert.strictEqual(s.hlSeen('telegram', '1', 100), true, 'chưa có mốc');
  assert.strictEqual(s.hlSeen('telegram', '1', 100), true, 'bằng mốc cũ');
  assert.strictEqual(s.hlSeen('telegram', '1', 99), false, 'cũ hơn');
  assert.strictEqual(s.hlSeen('telegram', '1', 200), true);
  assert.strictEqual(s.hlSeen('telegram', '1', 150), false);
  assert.strictEqual(s.hlSeen('telegram', '404', 300), false, 'không có liên kết');
  assert.strictEqual(s.hlSeen('telegram', '1', NaN), false);
  assert.strictEqual(s.hlSeen('telegram', '1', undefined), false);
  assert.strictEqual(s.hlUnlink(a.id, 'vk'), true);
  assert.strictEqual(s.hlUnlink(a.id, 'vk'), false);
  s.deleteUser(a);
  assert.strictEqual(s.hlOwner('telegram', '1'), null, 'xoá tài khoản → xoá liên kết');
  assert.deepStrictEqual(s.hlList(a.id), []);
  s.hlLink('vk', '9', 'mo-coi');
  s.hlDrop('vk', '9');
  assert.strictEqual(s.hlOwner('vk', '9'), null);
  const orig = s.hlQ().add.run;
  s.hlQ().add.run = () => { throw new Error('disk I/O error'); };
  assert.throws(() => s.hlLink('vk', '10', b.id), /disk/, 'lỗi khác lỗi trùng: ném ra');
  s.hlQ().add.run = orig;
  s.close();
});

// ------------------------------------------------------------------ Máy chủ (WebSocket)
let app, url, off, offUrl;
const sent = []; // mọi tin máy chủ gửi về (chuỗi) – kiểm không có bí mật
const logs = []; // mọi dòng console trong lúc chạy
const cons = {};
test.before(async () => {
  for (const k of ['log', 'warn', 'error', 'info']) {
    cons[k] = console[k];
    console[k] = (...a) => { logs.push(a.map((x) => (typeof x === 'string' ? x : util.inspect(x))).join(' ')); };
  }
  const hostAuth = H.makeHostAuth({ TELEGRAM_BOT_TOKEN: TG_TOKEN, VK_APP_SECRET: VK_SECRET, VK_APP_ID: VK_APP });
  app = start({ port: 0, dataFile: null, msgRate: 2000, admins: ['boss_hl'], hostAuth, timers: { THROTTLE_SCALE: 0 } });
  off = start({ port: 0, dataFile: null, msgRate: 2000, hostAuth: null });
  await Promise.all([app, off].map((x) => new Promise((r) => x.server.on('listening', r))));
  url = `ws://127.0.0.1:${app.server.address().port}/ws`;
  offUrl = `ws://127.0.0.1:${off.server.address().port}/ws`;
});
test.after(async () => {
  await app.stop();
  await off.stop();
  Object.assign(console, cons);
});
test.beforeEach(() => { if (app) app.hub.fails.clear(); });

class Client {
  constructor() { this.msgs = []; this.waiters = []; }
  static async open(hello = {}, to = url) {
    const c = new Client();
    c.ws = new WebSocket(to);
    c.ws.on('message', (d) => {
      sent.push(String(d));
      const m = JSON.parse(d);
      c.msgs.push(m);
      if (m.t === 'welcome' || m.t === 'me') c.me = m.me;
      if (m.t === 'welcome') c.welcome = m;
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    await new Promise((r) => c.ws.on('open', r));
    c.send({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex'), ...hello });
    await c.wait('welcome');
    return c;
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(t, pred = () => true, ms = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Hết giờ chờ ' + t)), ms);
      this.waiters.push((m) => {
        if (m.t === t && pred(m)) { clearTimeout(timer); resolve(m); return true; }
        return false;
      });
    });
  }
  async req(m, t, pred) { const p = this.wait(t, pred); this.send(m); return p; }
  /** Gửi m, chờ tin lỗi hoặc tin t (cái nào đến trước). */
  async ask(m, t) {
    const p = Promise.race([this.wait('error'), this.wait(t)]);
    this.send(m);
    return p;
  }
  close() { this.ws.close(); }
}
let seq = 0;
async function account(name) {
  const c = await Client.open();
  const username = name || 'hl_' + (++seq) + '_' + crypto.randomBytes(2).toString('hex');
  await c.req({ t: 'register', username, password: 'caro-pass1', name: 'Hl' + seq }, 'welcome');
  return { c, username };
}
const tg = (id, more) => tgData(tgFields(id, more));
const vk = (id, more) => vkData(vkParams(String(id), more));

test('máy chủ: welcome báo nền tảng bật; tắt (không có biến môi trường) → lỗi "không hỗ trợ", lần thử ngầm chỉ báo failed', async () => {
  const c = await Client.open();
  assert.deepStrictEqual(c.welcome.hostAuth, ['telegram', 'vk']);
  assert.ok(c.me.guest && !('hosts' in c.me));
  const d = await Client.open({}, offUrl);
  assert.deepStrictEqual(d.welcome.hostAuth, []);
  assert.strictEqual((await d.ask({ t: 'hostLogin', provider: 'telegram', data: tg(1), mode: 'create' }, 'auth')).code, 'host_auth_disabled');
  const st = await d.ask({ t: 'hostLogin', provider: 'telegram', data: tg(1), mode: 'auto' }, 'hostState');
  assert.strictEqual(st.state, 'failed');
  assert.strictEqual((await c.ask({ t: 'hostLogin', provider: 'zalo', data: 'x' }, 'auth')).code, 'host_auth_disabled');
  assert.deepStrictEqual(await c.req({ t: 'hostLogin', provider: 'zalo', data: 'x', mode: 'auto' }, 'hostState'), { t: 'hostState', provider: null, state: 'failed' });
  c.close(); d.close();
});

test('luồng c) khách chưa liên kết: im lặng → unlinked; bấm Lưu tiến độ → tài khoản mới không mật khẩu, tên từ first_name, username tg_<ngẫu nhiên>', async () => {
  const c = await Client.open();
  const st = await c.req({ t: 'hostLogin', provider: 'telegram', data: tg(501), mode: 'auto' }, 'hostState');
  assert.strictEqual(st.state, 'unlinked');
  assert.ok(c.me.guest, 'không tự tạo tài khoản khi chưa bấm');
  const auth = c.wait('auth');
  await c.req({ t: 'hostLogin', provider: 'telegram', data: tg(501, { user: tgUser(501, { first_name: '  Иван <b>  ' }) }), mode: 'create' }, 'welcome');
  assert.match((await auth).token, /\S{20,}/);
  assert.strictEqual(c.me.guest, false);
  assert.match(c.me.username, /^tg_[a-z0-9]{8}$/, 'không chứa id Telegram');
  assert.ok(!c.me.username.includes('501'));
  assert.strictEqual(c.me.name, 'Иван b');
  assert.strictEqual(c.me.hasPassword, false);
  assert.deepStrictEqual(c.me.hosts, ['telegram']);
  const u = app.store.users.get(c.me.uid);
  assert.ok(!JSON.stringify(u).includes('ivan_tg') && !JSON.stringify(u).includes('501'), 'không lưu username / id Telegram trong tài khoản');
  // VK: không có tên trong tham số → tên máy khách gợi ý; tên tục / trống → "Player"
  const v = await Client.open();
  await v.req({ t: 'hostLogin', provider: 'vk', data: vk(7001), mode: 'create', name: 'Пётр' }, 'welcome');
  assert.match(v.me.username, /^vk_[a-z0-9]{8}$/);
  assert.strictEqual(v.me.name, 'Пётр');
  const w = await Client.open();
  await w.req({ t: 'hostLogin', provider: 'vk', data: vk(7002), mode: 'create', name: 12 }, 'welcome');
  assert.strictEqual(w.me.name, 'Player');
  c.close(); v.close(); w.close();
});

test('luồng a) đã liên kết: lần mở sau (máy mới, mất dữ liệu trình duyệt) đăng nhập im lặng đúng tài khoản; khách đang ngồi phòng giữ chỗ', async () => {
  const c = await Client.open();
  await c.req({ t: 'hostLogin', provider: 'telegram', data: tg(601), mode: 'create' }, 'welcome');
  const uid = c.me.uid;
  c.close();
  const d = await Client.open();
  await d.req({ t: 'createRoom', timeLimit: 0 }, 'room');
  const auth = d.wait('auth');
  await d.req({ t: 'hostLogin', provider: 'telegram', data: tg(601), mode: 'auto' }, 'welcome');
  await auth;
  assert.strictEqual(d.me.uid, uid);
  assert.ok(d.welcome.room && d.welcome.room.players.some((p) => p.id === 'u_' + uid), 'phòng của khách chuyển sang tài khoản');
  // Đã đăng nhập đúng tài khoản rồi mà gửi lại → linked, không cấp phiên mới
  assert.strictEqual((await d.req({ t: 'hostLogin', provider: 'telegram', data: tg(601), mode: 'auto' }, 'hostState')).state, 'linked');
  // VK cũng vậy
  const v = await Client.open();
  await v.req({ t: 'hostLogin', provider: 'vk', data: vk(7101), mode: 'create' }, 'welcome');
  const vid = v.me.uid;
  v.close();
  const v2 = await Client.open();
  await v2.req({ t: 'hostLogin', provider: 'vk', data: vk(7101, { vk_platform: 'mobile_android' }) + '&host=vk', mode: 'auto' }, 'welcome');
  assert.strictEqual(v2.me.uid, vid);
  d.close(); v2.close();
});

test('luồng b) đang đăng nhập tài khoản Caro → gắn (sau xác nhận ở máy khách); trùng / tài khoản đã gắn id khác / đang đăng nhập mà bấm tạo', async () => {
  const { c } = await account();
  assert.deepStrictEqual(c.me.hosts, []);
  const n = await c.req({ t: 'hostLogin', provider: 'telegram', data: tg(701), mode: 'link' }, 'toast');
  assert.strictEqual(n.code, 'host_linked_telegram');
  await c.wait('me', () => true, 50).catch(() => {});
  assert.deepStrictEqual(c.me.hosts, ['telegram']);
  assert.strictEqual((await c.req({ t: 'hostLogin', provider: 'telegram', data: tg(701), mode: 'link' }, 'toast')).code, 'host_linked_telegram', 'gắn lại cùng id: không lỗi');
  assert.strictEqual((await c.ask({ t: 'hostLogin', provider: 'telegram', data: tg(702), mode: 'link' }, 'toast')).code, 'host_has_other');
  assert.strictEqual((await c.ask({ t: 'hostLogin', provider: 'telegram', data: tg(703), mode: 'create' }, 'auth')).code, 'host_logged_in');
  const { c: other } = await account();
  assert.strictEqual((await other.ask({ t: 'hostLogin', provider: 'telegram', data: tg(701), mode: 'link' }, 'toast')).code, 'host_taken');
  // Đang đăng nhập tài khoản khác mà Telegram đã gắn tài khoản c: không tự đổi tài khoản
  assert.strictEqual((await other.ask({ t: 'hostLogin', provider: 'telegram', data: tg(701), mode: 'create' }, 'auth')).code, 'host_taken');
  assert.strictEqual((await other.req({ t: 'hostLogin', provider: 'telegram', data: tg(701), mode: 'auto' }, 'hostState')).state, 'failed');
  const g = await Client.open();
  assert.strictEqual((await g.ask({ t: 'hostLogin', provider: 'telegram', data: tg(704), mode: 'link' }, 'toast')).code, 'need_account');
  c.close(); other.close(); g.close();
});

test('luồng d) hủy liên kết: còn mật khẩu → hủy ngay; chỉ còn Telegram → phải xác nhận; chưa gắn → lỗi', async () => {
  const { c } = await account();
  await c.req({ t: 'hostLogin', provider: 'vk', data: vk(7201), mode: 'link' }, 'toast');
  assert.strictEqual((await c.req({ t: 'hostUnlink', provider: 'vk' }, 'toast')).code, 'host_unlinked_vk');
  await new Promise((r) => setTimeout(r, 30));
  assert.deepStrictEqual(c.me.hosts, []);
  assert.strictEqual((await c.ask({ t: 'hostUnlink', provider: 'vk' }, 'toast')).code, 'host_not_linked');
  assert.strictEqual((await c.ask({ t: 'hostUnlink', provider: 'zalo' }, 'toast')).code, 'host_not_linked');
  const t = await Client.open();
  await t.req({ t: 'hostLogin', provider: 'telegram', data: tg(801), mode: 'create' }, 'welcome');
  assert.strictEqual((await t.ask({ t: 'hostUnlink', provider: 'telegram' }, 'toast')).code, 'host_unlink_last');
  assert.strictEqual((await t.ask({ t: 'hostUnlink', provider: 'telegram', confirm: 'yes' }, 'toast')).code, 'host_unlink_last', 'chỉ nhận confirm: true');
  // Gắn thêm VK → còn cách khác → hủy Telegram không cần xác nhận
  await t.req({ t: 'hostLogin', provider: 'vk', data: vk(7202), mode: 'link' }, 'toast');
  assert.strictEqual((await t.req({ t: 'hostUnlink', provider: 'telegram' }, 'toast')).code, 'host_unlinked_telegram');
  assert.strictEqual((await t.req({ t: 'hostUnlink', provider: 'vk', confirm: true }, 'toast')).code, 'host_unlinked_vk');
  await new Promise((r) => setTimeout(r, 30));
  assert.deepStrictEqual(t.me.hosts, []);
  assert.strictEqual(t.me.guest, false, 'vẫn đăng nhập (phiên hiện tại)');
  const g = await Client.open();
  assert.strictEqual((await g.req({ t: 'hostLogin', provider: 'telegram', data: tg(801), mode: 'auto' }, 'hostState')).state, 'unlinked');
  assert.strictEqual((await g.ask({ t: 'hostUnlink', provider: 'telegram' }, 'toast')).code, 'need_account');
  c.close(); t.close(); g.close();
});

test('huỷ liên kết / xoá tài khoản ghi mốc: dữ liệu khởi chạy cũ (bản bị lộ) không tạo / gắn lại được; dữ liệu mở mới sau đó thì được', async () => {
  const old = Math.floor(Date.now() / 1000) - 60; // bản initData của lần mở 1 phút trước (giả như bị lộ)
  const t = await Client.open();
  await t.req({ t: 'hostLogin', provider: 'telegram', data: tg(901, { auth_date: String(old) }), mode: 'create' }, 'welcome');
  assert.strictEqual((await t.req({ t: 'hostUnlink', provider: 'telegram', confirm: true }, 'toast')).code, 'host_unlinked_telegram');
  assert.ok(app.store.hlFloor('telegram', '901') >= old + 60 - 2, 'ghi mốc huỷ');
  // Kẻ xấu dùng lại bản cũ: tạo tài khoản mới / gắn vào tài khoản của hắn đều bị từ chối
  const x = await Client.open();
  assert.strictEqual((await x.ask({ t: 'hostLogin', provider: 'telegram', data: tg(901, { auth_date: String(old) }), mode: 'create' }, 'welcome')).code, 'host_auth_failed');
  const { c: y } = await account();
  assert.strictEqual((await y.ask({ t: 'hostLogin', provider: 'telegram', data: tg(901, { auth_date: String(old) }), mode: 'link' }, 'toast')).code, 'host_auth_failed');
  // Chủ thật mở lại Mini App (dữ liệu mới hơn mốc huỷ): tạo lại được
  const fresh = Math.floor(Date.now() / 1000) + 2;
  await x.req({ t: 'hostLogin', provider: 'telegram', data: tg(901, { auth_date: String(fresh) }), mode: 'create' }, 'welcome');
  assert.deepStrictEqual(x.me.hosts, ['telegram']);
  // Xoá tài khoản cũng ghi mốc (store.deleteUser → hlUserGone)
  const u = app.store.users.get(x.me.uid);
  app.store.deleteUser(u);
  assert.ok(app.store.hlFloor('telegram', '901') >= fresh - 3);
  assert.strictEqual(app.store.hlOwner('telegram', '901'), null);
  t.close(); x.close(); y.close();
});

test('quản trị viên: không gắn được, không đăng nhập được bằng Telegram / VK (kể cả đã gắn trước khi thành quản trị); tên tự sinh tránh tên quản trị', async () => {
  const { c } = await account('boss_hl');
  assert.ok(c.me.admin);
  assert.strictEqual((await c.ask({ t: 'hostLogin', provider: 'telegram', data: tg(901), mode: 'link' }, 'toast')).code, 'host_admin_blocked');
  assert.strictEqual(app.store.hlOwner('telegram', '901'), null);
  // Tài khoản gắn Telegram rồi mới được cấp quyền quản trị
  const t = await Client.open();
  await t.req({ t: 'hostLogin', provider: 'telegram', data: tg(902), mode: 'create' }, 'welcome');
  const uid = t.me.uid;
  t.close();
  app.hub.adminIds.add(uid);
  try {
    const g = await Client.open();
    assert.strictEqual((await g.req({ t: 'hostLogin', provider: 'telegram', data: tg(902), mode: 'auto' }, 'hostState')).state, 'failed');
    assert.strictEqual((await g.ask({ t: 'hostLogin', provider: 'telegram', data: tg(902), mode: 'create' }, 'auth')).code, 'host_admin_blocked');
    assert.ok(g.me.guest);
    assert.ok(logs.some((l) => /chặn đăng nhập tài khoản quản trị bằng telegram/.test(l)));
    g.close();
  } finally { app.hub.adminIds.delete(uid); }
  // Tên tự sinh trùng tên đã có / tên quản trị → sinh lại
  const has = app.store.byUsername.has.bind(app.store.byUsername);
  let n = 0;
  app.store.byUsername.has = (k) => (n++ < 2 ? true : has(k));
  app.hub.admins.add('__never__');
  try { assert.match(app.hub.hostFreeUsername('vk'), /^vk_[a-z0-9]{8}$/); } finally { delete app.store.byUsername.has; app.hub.admins.delete('__never__'); }
  assert.strictEqual(n, 3);
  c.close();
});

test('xoá tài khoản (chỉ có Telegram – gõ lại tên đăng nhập) → xoá liên kết; mở lại Mini App là khách chưa liên kết', async () => {
  const t = await Client.open();
  await t.req({ t: 'hostLogin', provider: 'telegram', data: tg(1001), mode: 'create' }, 'welcome');
  assert.ok(app.store.hlOwner('telegram', '1001'));
  await t.req({ t: 'deleteAccount', confirm: t.me.username }, 'accountDeleted');
  assert.strictEqual(app.store.hlOwner('telegram', '1001'), null);
  const g = await Client.open();
  assert.strictEqual((await g.req({ t: 'hostLogin', provider: 'telegram', data: tg(1001), mode: 'auto' }, 'hostState')).state, 'unlinked');
  // Dòng mồ côi (không nên có) được dọn khi gặp
  app.store.hlLink('vk', '1002', 'khong-ton-tai');
  assert.strictEqual((await g.req({ t: 'hostLogin', provider: 'vk', data: vk(1002), mode: 'auto' }, 'hostState')).state, 'unlinked');
  assert.strictEqual(app.store.hlOwner('vk', '1002'), null);
  t.close(); g.close();
});

test('dữ liệu sai chữ ký / hết hạn → từ chối chung chung, log một dòng không kèm dữ liệu; giới hạn theo IP và theo kết nối', async () => {
  const c = await Client.open();
  logs.length = 0;
  const bad = tg(1101).replace(/hash=[0-9a-f]{4}/, 'hash=0000');
  const e1 = await c.ask({ t: 'hostLogin', provider: 'telegram', data: bad, mode: 'create' }, 'auth');
  assert.strictEqual(e1.code, 'host_auth_failed');
  assert.ok(!JSON.stringify(e1).includes('sig'), 'không gửi lý do');
  const e2 = await c.ask({ t: 'hostLogin', provider: 'telegram', data: tg(1101, { auth_date: String(SEC - 90000) }), mode: 'create' }, 'auth');
  assert.strictEqual(e2.code, 'host_auth_failed');
  assert.strictEqual(logs.filter((l) => /host-auth/.test(l)).length, 2);
  assert.ok(logs.every((l) => !l.includes('1101') && !l.includes('Ivan') && !l.includes('127.0.0.1')), logs.join('\n'));
  // 30 lần sai / IP / 10 phút
  for (let i = 0; i < 28; i++) await c.ask({ t: 'hostLogin', provider: 'vk', data: 'vk_user_id=1&sign=x', mode: 'create' }, 'auth');
  assert.strictEqual((await c.ask({ t: 'hostLogin', provider: 'vk', data: vk(1102), mode: 'create' }, 'auth')).code, 'too_many_attempts');
  assert.strictEqual((await c.req({ t: 'hostLogin', provider: 'vk', data: vk(1102), mode: 'auto' }, 'hostState')).state, 'failed');
  // IP của kết nối thử như máy chủ thấy (127.0.0.1 hay ::1 / ::ffff:127.0.0.1 tuỳ máy – CI dùng IPv6)
  const ip = [...app.hub.fails.keys()].find((k) => k.startsWith('host:')).slice(5);
  app.hub.fails.clear();
  // Mỗi kết nối tối đa 1 lần / giây
  app.hub.T.THROTTLE_SCALE = 1;
  try {
    const d = await Client.open();
    const errs = [];
    d.ws.on('message', (x) => { const m = JSON.parse(x); if (m.t === 'error') errs.push(m.code); });
    d.send({ t: 'hostLogin', provider: 'telegram', data: tg(1103), mode: 'link' });
    d.send({ t: 'hostLogin', provider: 'telegram', data: tg(1103), mode: 'link' });
    await new Promise((r) => setTimeout(r, 200));
    assert.deepStrictEqual(errs, ['need_account', 'too_fast']);
    d.close();
  } finally { app.hub.T.THROTTLE_SCALE = 0; }
  // Tạo tài khoản dùng chung hạn mức reg:<IP> với đăng ký thường
  app.hub.fails.set('reg:' + ip, { n: 30, t: Date.now() });
  assert.strictEqual((await c.ask({ t: 'hostLogin', provider: 'telegram', data: tg(1104), mode: 'create' }, 'auth')).code, 'too_many_attempts');
  app.hub.fails.clear();
  c.close();
});

test('phát lại: dữ liệu khởi chạy cũ hơn lần dùng gần nhất của cùng Telegram / VK bị từ chối (cùng lần mở vẫn dùng lại được)', async () => {
  const c = await Client.open();
  await c.req({ t: 'hostLogin', provider: 'telegram', data: tg(1201, { auth_date: String(SEC - 600) }), mode: 'create' }, 'welcome');
  const uid = c.me.uid;
  c.close();
  // Người chơi mở lại Mini App (dữ liệu mới hơn) → vào được; tải lại đúng lần mở đó (cùng dữ liệu) → vẫn vào được
  for (const at of [SEC - 300, SEC - 300]) {
    const d = await Client.open();
    await d.req({ t: 'hostLogin', provider: 'telegram', data: tg(1201, { auth_date: String(at) }), mode: 'auto' }, 'welcome');
    assert.strictEqual(d.me.uid, uid);
    d.close();
  }
  // Kẻ giữ bản initData của lần mở trước không dùng lại được nữa
  const e = await Client.open();
  assert.strictEqual((await e.req({ t: 'hostLogin', provider: 'telegram', data: tg(1201, { auth_date: String(SEC - 600) }), mode: 'auto' }, 'hostState')).state, 'failed');
  assert.strictEqual((await e.ask({ t: 'hostLogin', provider: 'telegram', data: tg(1201, { auth_date: String(SEC - 600) }), mode: 'create' }, 'auth')).code, 'host_auth_failed');
  assert.ok(e.me.guest);
  // VK: tương tự theo vk_ts; gắn từ trong tài khoản cũng ghi mốc
  const { c: a } = await account();
  await a.req({ t: 'hostLogin', provider: 'vk', data: vk(7301, { vk_ts: String(SEC - 200) }), mode: 'link' }, 'toast');
  const f = await Client.open();
  assert.strictEqual((await f.req({ t: 'hostLogin', provider: 'vk', data: vk(7301, { vk_ts: String(SEC - 900) }), mode: 'auto' }, 'hostState')).state, 'failed');
  await f.req({ t: 'hostLogin', provider: 'vk', data: vk(7301, { vk_ts: String(SEC - 100) }), mode: 'auto' }, 'welcome');
  assert.strictEqual(f.me.uid, a.me.uid);
  a.close(); e.close(); f.close();
});

test('token bot / khoá VK không xuất hiện trong bất cứ tin gửi máy khách hay dòng log nào', async () => {
  await new Promise((r) => setTimeout(r, 50));
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TG_TOKEN).digest('hex');
  const all = sent.join('\n') + '\n' + logs.join('\n');
  assert.ok(sent.length > 50, 'đã thu đủ tin');
  for (const s of [TG_TOKEN, TG_TOKEN.split(':')[1], VK_SECRET, secretKey]) assert.ok(!all.includes(s), 'lộ bí mật');
  assert.ok(!util.inspect(app.hub.hostAuth, { depth: 5, showHidden: true }).includes(TG_TOKEN));
});
