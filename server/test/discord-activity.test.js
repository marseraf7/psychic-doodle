// Discord Activity (docs/discord-activity.md): máy chủ chỉ cho nhúng trong Discord ở lượt tải trang chính có đủ tham số
// khởi chạy (frame_id, instance_id, platform), chèn thẻ meta client id khi đặt DISCORD_CLIENT_ID; WebSocket nhận đúng Origin
// https://<DISCORD_CLIENT_ID>.discordsays.com (tắt được bằng DISCORD_WS=0); vendor/discord-sdk.js đúng bản đã dựng.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const E = require('../src/host-embed.js');
const { discordOriginAllowed, portalOriginAllowed } = require('../src/portal-origins.js');
const { wsOriginAllowed } = require('../src/web-net.js');
const { Store } = require('../src/store.js');
const { makeHandler, CSP } = require('../src/web.js');

const sp = (q) => new URLSearchParams(q);
const LAUNCH = 'instance_id=i-1-gc-1-2&location_id=gc-1-2&launch_id=x&channel_id=2&frame_id=f-1&platform=desktop&guild_id=1';
const ID = '123456789012345678';

test('dấu hiệu Discord: đủ frame_id + instance_id + platform desktop|mobile', () => {
  assert.strictEqual(E.isDiscordLaunch(sp(LAUNCH)), true);
  assert.strictEqual(E.isDiscordLaunch(sp(LAUNCH.replace('desktop', 'mobile'))), true);
  for (const q of ['', 'frame_id=a', 'frame_id=a&instance_id=b', 'frame_id=a&instance_id=b&platform=web', 'host=discord', 'frame_id=&instance_id=b&platform=desktop']) {
    assert.strictEqual(E.isDiscordLaunch(sp(q)), false, q);
  }
});

test('frame-ancestors Discord: discord.com (+ con), discordapp.com (+ con), *.discordsays.com; DISCORD_FRAME_ANCESTORS đổi được', () => {
  const c = E.discordCsp(CSP, {});
  assert.match(c, /frame-ancestors https:\/\/discord\.com https:\/\/\*\.discord\.com https:\/\/discordapp\.com https:\/\/\*\.discordapp\.com https:\/\/\*\.discordsays\.com;/);
  assert.ok(c.includes("script-src 'self' 'wasm-unsafe-eval'"), 'không thêm nguồn script nào (SDK tự phục vụ)');
  assert.ok(!c.includes('telegram') && !c.includes('vk.com'), 'không lẫn Telegram / VK');
  assert.match(E.discordCsp(CSP, { DISCORD_FRAME_ANCESTORS: 'none' }), /frame-ancestors 'none'/);
  assert.match(E.discordCsp(CSP, { DISCORD_FRAME_ANCESTORS: '* https://discord.com' }), /frame-ancestors https:\/\/discord\.com;/);
  assert.strictEqual(E.ancestors({ DISCORD_FRAME_ANCESTORS: 'https://x.example' }), E.DEFAULT_ANCESTORS.join(' '), 'biến của Discord không đổi Telegram / VK');
});

test('client id: DISCORD_CLIENT_ID chỉ chữ số (mục đầu) → thẻ meta, chỉ ở lượt mở Discord', () => {
  assert.strictEqual(E.discordClientId({ DISCORD_CLIENT_ID: ` ${ID} , 42424242 ` }), ID);
  assert.strictEqual(E.discordClientId({ DISCORD_CLIENT_ID: '12ab' }), '');
  assert.strictEqual(E.discordClientId({}), '');
  const html = '<html><head><title>x</title></head><body></body></html>';
  const env = { DISCORD_CLIENT_ID: ID };
  assert.ok(E.injectDiscord(html, sp(LAUNCH), env).includes(`<meta name="caro-discord-client-id" content="${ID}">\n</head>`));
  assert.strictEqual(E.injectDiscord(html, sp('room=123456'), env), html, 'trang thường: không chèn');
  assert.strictEqual(E.injectDiscord(html, sp(LAUNCH), {}), html, 'chưa đặt biến: không chèn');
  assert.strictEqual(E.injectDiscord(html, sp(LAUNCH), { DISCORD_CLIENT_ID: '"><script>' }), html);
  assert.strictEqual(E.injectDiscord(html, null, env), html);
});

test('máy chủ: header + thẻ meta Discord chỉ cho trang chính có dấu hiệu Discord', async () => {
  const get = (handle, url) => new Promise((done) => {
    const res = { status: 0, headers: {}, body: Buffer.alloc(0), setHeader(k, v) { this.headers[k] = v; }, removeHeader(k) { delete this.headers[k]; },
      writeHead(s, h) { this.status = s; Object.assign(this.headers, h || {}); return this; },
      end(b) { if (b) this.body = Buffer.concat([this.body, Buffer.from(b)]); done(this); }, on() { return this; }, once() { return this; }, emit() {}, write() { return true; } };
    handle({ method: 'GET', url, headers: { host: 'x' }, socket: { remoteAddress: '127.0.0.1' } }, res);
  });
  const old = process.env.DISCORD_CLIENT_ID;
  process.env.DISCORD_CLIENT_ID = ID;
  try {
    const h = makeHandler({ store: new Store(null), hub: { ogInfo: () => null }, bundle: true });
    for (const u of ['/?' + LAUNCH, '/index.html?' + LAUNCH.replace('desktop', 'mobile'), '/?' + LAUNCH + '&room=123456']) {
      const r = await get(h, u);
      assert.strictEqual(r.status, 200, u);
      assert.match(r.headers['content-security-policy'], /frame-ancestors https:\/\/discord\.com /, u);
      assert.ok(!r.headers['content-security-policy'].includes('telegram'), u);
      assert.strictEqual(r.headers['x-frame-options'], undefined, u + ': nhúng iframe được');
      assert.ok(r.body.toString().includes(`<meta name="caro-discord-client-id" content="${ID}">`), u);
    }
    for (const u of ['/', '/?room=123456', '/?frame_id=a&instance_id=b', '/licenses.html?' + LAUNCH, '/api.html?' + LAUNCH]) {
      const r = await get(h, u);
      assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/, u);
      assert.strictEqual(r.headers['x-frame-options'], 'DENY', u);
      assert.ok(!r.body.toString().includes('caro-discord-client-id'), u);
    }
  } finally {
    if (old === undefined) delete process.env.DISCORD_CLIENT_ID; else process.env.DISCORD_CLIENT_ID = old;
  }
});

test('Origin WebSocket: đúng https://<DISCORD_CLIENT_ID>.discordsays.com; DISCORD_WS=0 tắt; không nhận mọi discordsays.com', () => {
  const env = { DISCORD_CLIENT_ID: `${ID},987654321098765432` };
  for (const o of [`https://${ID}.discordsays.com`, 'https://987654321098765432.discordsays.com']) {
    assert.strictEqual(discordOriginAllowed(o, env), true, o);
    assert.strictEqual(portalOriginAllowed(o, env), true, o);
    assert.strictEqual(portalOriginAllowed(o, { ...env, PORTAL_WS: '0' }), true, 'PORTAL_WS=0 chỉ tắt mẫu bản cổng');
  }
  for (const o of ['https://111111111111111111.discordsays.com', `http://${ID}.discordsays.com`, `https://${ID}.discordsays.com.evil.example`,
    `https://x.${ID}.discordsays.com`, `https://${ID}.discordsays.com/path`, `https://${ID}.discordsays.com:8443`, 'https://discordsays.com', 'https://discord.com']) {
    assert.strictEqual(portalOriginAllowed(o, env), false, o);
  }
  assert.strictEqual(portalOriginAllowed(`https://${ID}.discordsays.com`, {}), false, 'chưa đặt DISCORD_CLIENT_ID: không nhận');
  assert.strictEqual(portalOriginAllowed(`https://${ID}.discordsays.com`, { ...env, DISCORD_WS: '0' }), false);
  assert.strictEqual(discordOriginAllowed(`https://${ID}.discordsays.com`, { DISCORD_CLIENT_ID: 'abc,' }), false);

  const old = process.env.DISCORD_CLIENT_ID;
  process.env.DISCORD_CLIENT_ID = ID;
  try {
    const req = (origin) => ({ headers: { origin, host: 'caro.example' } });
    assert.strictEqual(wsOriginAllowed(req(`https://${ID}.discordsays.com`)), true, 'web-net.js nhận qua portal-origins.js');
    assert.strictEqual(wsOriginAllowed(req('https://222222222222222222.discordsays.com')), false);
  } finally {
    if (old === undefined) delete process.env.DISCORD_CLIENT_ID; else process.env.DISCORD_CLIENT_ID = old;
  }
});

test('vendor/discord-sdk.js: đúng bản dựng từ @discord/embedded-app-sdk 2.5.0 + có toàn văn giấy phép của SDK và mọi thư viện gói kèm', () => {
  const dir = path.join(__dirname, '..', '..', 'caro', 'vendor');
  const src = fs.readFileSync(path.join(dir, 'discord-sdk.js'), 'utf8');
  assert.match(src.slice(0, 200), /@discord\/embedded-app-sdk 2\.5\.0/);
  const body = src.slice(src.indexOf('*/\n') + 3); // bỏ khối chú thích đầu file của mình
  // Băm của bản dựng (lệnh trong docs/discord-activity.md, esbuild 0.28.2). Nâng phiên bản: dựng lại, sửa số này và dòng đầu file
  assert.strictEqual(crypto.createHash('sha256').update(body).digest('hex'), '03fc814f5a111d027b9899c9348ab02a929d5cb6804b3fe03df4e45426b869e8');
  assert.ok(body.length < 160 * 1024, 'SDK nặng thêm: cân nhắc lại (hiện ~148 KB, chỉ nạp trong Discord)');
  const lic = fs.readFileSync(path.join(dir, 'discord-sdk-LICENSE.txt'), 'utf8');
  assert.match(lic, /Copyright \(c\) 2024 Discord Inc\.[\s\S]*Permission is hereby granted/);
  for (const re of [/zod \(MIT\)[\s\S]*Colin McDonnell/, /uuid \(MIT\)[\s\S]*Robert Kieffer/, /eventemitter3 \(MIT\)[\s\S]*Arnout Kazemier/,
    /decimal\.js-light[\s\S]*Michael Mclaughlin/, /lodash\.transform \(MIT\)[\s\S]*jQuery Foundation/, /big-integer \(Unlicense[\s\S]*public domain/,
    /tslib \(0BSD\)[\s\S]*Microsoft Corporation/]) assert.match(lic, re);
  assert.ok(!/GNU General Public|AGPL|LGPL/.test(lic), 'không thư viện GPL');
});
