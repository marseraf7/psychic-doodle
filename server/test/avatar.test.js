// Kiểm thử ảnh đại diện: kiểm ảnh (avatar.js – loại theo byte đầu, kích thước, dung lượng), đổi / xoá qua WebSocket
// (hub/avatar.js), phục vụ qua HTTP /api/avatar/<id>, xoá khi xoá tài khoản.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const crypto = require('crypto');
const Avatar = require('../src/avatar.js');
const { start } = require('../server.js');

// Ảnh mẫu: máy chủ chỉ đọc phần đầu ảnh (không giải mã), nên phần đầu đúng là đủ
function png(w, h, extra = 64) {
  const b = Buffer.alloc(33 + extra);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
function jpeg(w, h) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(40)]);
}
function webpLossless(w, h) {
  const b = Buffer.alloc(40);
  b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(32, 4); b.write('WEBP', 8, 'latin1'); b.write('VP8L', 12, 'latin1');
  b.writeUInt32LE(20, 16); b[20] = 0x2f; b.writeUInt32LE((w - 1) | ((h - 1) << 14), 21);
  return b;
}
function webpLossy(w, h) {
  const b = Buffer.alloc(40);
  b.write('RIFF', 0, 'latin1'); b.write('WEBP', 8, 'latin1'); b.write('VP8 ', 12, 'latin1');
  b[23] = 0x9d; b[24] = 0x01; b[25] = 0x2a; b.writeUInt16LE(w, 26); b.writeUInt16LE(h, 28);
  return b;
}
const b64 = (buf) => buf.toString('base64');

test('kiểm ảnh: loại theo byte đầu file, kích thước tối đa 256, dung lượng tối đa 10 KB', () => {
  assert.deepStrictEqual(Avatar.sniff(png(128, 128)), { type: 'image/png', w: 128, h: 128 });
  assert.deepStrictEqual(Avatar.sniff(jpeg(100, 90)), { type: 'image/jpeg', w: 100, h: 90 });
  assert.deepStrictEqual(Avatar.sniff(webpLossless(128, 64)), { type: 'image/webp', w: 128, h: 64 });
  assert.deepStrictEqual(Avatar.sniff(webpLossy(96, 96)), { type: 'image/webp', w: 96, h: 96 });
  assert.strictEqual(Avatar.parse(b64(png(128, 128))).type, 'image/png');
  assert.strictEqual(Avatar.parse('data:image/webp;base64,' + b64(webpLossy(64, 64))).type, 'image/webp');
  // Ảnh nhỏ về dung lượng nhưng rất nhiều điểm ảnh (bom giải nén): từ chối
  assert.strictEqual(Avatar.parse(b64(png(10000, 10000))).error, 'bad_avatar');
  assert.strictEqual(Avatar.parse(b64(jpeg(300, 100))).error, 'bad_avatar');
  assert.strictEqual(Avatar.parse(b64(png(0, 10))).error, 'bad_avatar');
  // Không phải ảnh (HTML, SVG có script…), base64 sai, quá 10 KB, không phải chuỗi
  assert.strictEqual(Avatar.parse(b64(Buffer.from('<svg onload="alert(1)"></svg>'))).error, 'bad_avatar');
  assert.strictEqual(Avatar.parse('@@@').error, 'bad_avatar');
  assert.strictEqual(Avatar.parse(b64(png(64, 64, 11 * 1024))).error, 'avatar_too_big');
  assert.strictEqual(Avatar.parse({}).error, 'avatar_too_big');
  // JPEG hỏng (không có khung kích thước)
  assert.strictEqual(Avatar.parse(b64(Buffer.from([0xff, 0xd8, 0xff, 0x00, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).error, 'bad_avatar');
});

let app, url, base;
test.before(async () => {
  app = start({ port: 0, dataFile: null, msgRate: 2000 });
  await new Promise((r) => app.server.on('listening', r));
  url = `ws://127.0.0.1:${app.server.address().port}/ws`;
  base = `http://127.0.0.1:${app.server.address().port}`;
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
      if (m.t === 'welcome' || m.t === 'me') c.me = m.me;
      if (m.t === 'friends') c.friends = m;
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    await new Promise((r) => c.ws.on('open', r));
    c.send({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex') });
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
}

test('đổi / xoá ảnh đại diện: khách không được; ảnh phục vụ qua HTTP đúng loại; bạn bè thấy phiên bản mới; xoá tài khoản thì xoá ảnh', async () => {
  const g = await Client.open();
  assert.strictEqual((await g.req({ t: 'avatarSet', data: b64(png(64, 64)) }, 'error')).code, 'need_account');
  const a = await Client.open();
  await a.req({ t: 'register', username: 'av_a', password: 'caro-pass1', name: 'A' }, 'welcome');
  const b = await Client.open();
  await b.req({ t: 'register', username: 'av_b', password: 'caro-pass1', name: 'B' }, 'welcome');
  await a.req({ t: 'friendAdd', username: 'av_b' }, 'friends');
  await b.req({ t: 'friendAdd', username: 'av_a' }, 'friends', (m) => m.friends.length === 1);
  assert.strictEqual(a.me.av, 0);
  const uid = a.me.uid;
  assert.strictEqual((await fetch(`${base}/api/avatar/${uid}`)).status, 404);

  // Ảnh sai: báo lỗi, không lưu
  assert.strictEqual((await a.req({ t: 'avatarSet', data: b64(Buffer.from('<html>')) }, 'error')).code, 'bad_avatar');
  // Ảnh đúng: các kết nối của chủ tài khoản nhận phiên bản mới, bạn bè cũng thấy
  const seen = b.wait('friends', (m) => m.friends[0].av > 0);
  const me = await a.req({ t: 'avatarSet', data: b64(webpLossy(128, 128)) }, 'me', (m) => m.me.av > 0);
  const v = me.me.av;
  assert.strictEqual((await seen).friends[0].av, v);
  let r = await fetch(`${base}/api/avatar/${uid}?v=${v}`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers.get('content-type'), 'image/webp');
  assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'; sandbox/);
  assert.match(r.headers.get('cache-control'), /immutable/);
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(webpLossy(128, 128)));
  // Phiên bản cũ / không có: không giữ lâu
  assert.strictEqual((await fetch(`${base}/api/avatar/${uid}?v=1`)).headers.get('cache-control'), 'no-cache');
  // Hồ sơ và tìm kỳ thủ cũng có phiên bản ảnh
  assert.strictEqual((await b.req({ t: 'profile', id: uid }, 'profile')).profile.av, v);
  assert.strictEqual((await b.req({ t: 'userSearch', q: 'av_a' }, 'userSearch')).users[0].av, v);
  // Đổi ảnh lần nữa: phiên bản tăng
  const v2 = (await a.req({ t: 'avatarSet', data: b64(png(96, 96)) }, 'me', (m) => m.me.av > v)).me.av;
  r = await fetch(`${base}/api/avatar/${uid}?v=${v2}`);
  assert.strictEqual(r.headers.get('content-type'), 'image/png');

  // Xoá ảnh
  await a.req({ t: 'avatarClear' }, 'me', (m) => m.me.av === 0);
  assert.strictEqual((await fetch(`${base}/api/avatar/${uid}`)).status, 404);
  // Đặt lại rồi xoá tài khoản: ảnh mất theo
  await a.req({ t: 'avatarSet', data: b64(jpeg(64, 64)) }, 'me', (m) => m.me.av > 0);
  assert.strictEqual((await fetch(`${base}/api/avatar/${uid}`)).status, 200);
  await a.req({ t: 'deleteAccount', password: 'caro-pass1', confirm: 'av_a' }, 'accountDeleted');
  assert.strictEqual((await fetch(`${base}/api/avatar/${uid}`)).status, 404);
  assert.strictEqual(app.store.db.prepare('SELECT COUNT(*) AS n FROM avatars WHERE uid = ?').get(uid).n, 0);
  for (const c of [g, a, b]) c.ws.close();
});

test('đổi ảnh dồn dập: tối đa 10 lần / 10 phút', async () => {
  const a = await Client.open();
  await a.req({ t: 'register', username: 'av_spam', password: 'caro-pass1' }, 'welcome');
  for (let i = 0; i < 10; i++) await a.req({ t: 'avatarSet', data: b64(png(32 + i, 32)) }, 'toast', (m) => m.code === 'avatar_saved');
  assert.strictEqual((await a.req({ t: 'avatarSet', data: b64(png(32, 32)) }, 'error')).code, 'too_many_attempts');
  a.ws.close();
});
