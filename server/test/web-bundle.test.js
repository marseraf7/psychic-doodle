/*
 * Bản gộp trang chính (src/web-bundle.js – bước 1 của docs/nghien-cuu-viet-lai-rust-17-11-2026.md): không mất file nào,
 * giữ đúng thứ tự, gói chuỗi dịch đủ và đúng như các file gốc, chọn ngôn ngữ như i18n.js, service worker lưu đúng khối.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { build, langPacks, LANGS } = require('../src/web-bundle.js');
const { Store } = require('../src/store.js');
const { makeHandler } = require('../src/web.js');

const DIR = path.resolve(__dirname, '..', '..', 'caro');
const B = build(DIR);
const bodyNames = () => {
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  return [...html.slice(html.indexOf('<body')).matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
};
const text = (name) => B.files.get(name).toString();
const chunkNames = () => [...B.html.matchAll(/<script (?:defer )?src="(b\/[^"]+)"><\/script>/g)].map((m) => m[1]);

test('mọi file mã nằm trong một khối, đúng thứ tự index.html; file chuỗi dịch vào gói ngôn ngữ', () => {
  const names = bodyNames();
  assert.deepStrictEqual(B.names, names);
  const code = chunkNames().filter((n) => n.startsWith('b/core-')).map(text).join('');
  let at = -1, packed = 0;
  for (const n of names) {
    const src = fs.readFileSync(path.join(DIR, n), 'utf8');
    if (/^i18n-.+\.js$/.test(n) && langPacks(src)) { packed++; assert.ok(!code.includes(src), n + ' không lặp trong khối mã'); continue; }
    const i = code.indexOf(src);
    assert.ok(i > at, n + ' có trong khối mã và đứng sau file trước nó');
    at = i;
  }
  assert.strictEqual(packed, B.packed);
  assert.ok(B.packed >= 50, 'các file i18n-*.js được gom');
  // index.html không còn thẻ file lẻ nào trong <body>; thẻ trong <head> giữ nguyên
  const body = B.html.slice(B.html.indexOf('<body'));
  for (const n of names) assert.ok(!body.includes(`src="${n}"`), n + ' đã bỏ khỏi index.html');
  assert.ok(B.html.includes('<script src="watchdog.js"></script>'));
});

test('gói ngôn ngữ: đủ mọi khoá, đúng giá trị như chạy các file gốc lần lượt', () => {
  const want = Object.fromEntries(LANGS.map((l) => [l, {}]));
  for (const n of bodyNames()) {
    if (!/^i18n-.+\.js$/.test(n)) continue;
    const p = langPacks(fs.readFileSync(path.join(DIR, n), 'utf8'));
    if (p) for (const l of LANGS) Object.assign(want[l], p[l] || {});
  }
  const boot = text(chunkNames().find((n) => n.startsWith('b/boot-')));
  const urls = JSON.parse(/var P = (\{[^}]+\})/.exec(boot)[1]);
  for (const l of LANGS) {
    const got = {};
    vm.runInNewContext(text(urls[l]), { window: { I18N: { extend: (lang, o) => { assert.strictEqual(lang, l); Object.assign(got, o); } } } });
    assert.deepStrictEqual(got, { ...want.vi, ...want[l] }, 'gói ' + l);
    assert.strictEqual(Object.keys(got).length, Object.keys(want.vi).length, 'gói ' + l + ' đủ khoá như tiếng Việt');
  }
});

test('boot chọn ngôn ngữ như i18n.js và chèn gói đúng chỗ (sau khối có i18n.js, trước khối mã còn lại)', () => {
  const tags = chunkNames();
  const bi = tags.findIndex((n) => n.startsWith('b/boot-'));
  assert.ok(bi > 0 && bi < tags.length - 1);
  const before = tags.slice(0, bi).map(text).join('');
  assert.ok(before.includes(fs.readFileSync(path.join(DIR, 'i18n.js'), 'utf8')), 'i18n.js chạy trước gói');
  assert.ok(B.html.includes(`<script src="${tags[bi]}"></script>`), 'boot chạy đồng bộ (không defer) để document.write');
  const run = (stored, languages, lang0) => {
    let wrote = '';
    const win = { CARO_LANG0: lang0 };
    vm.runInNewContext(text(tags[bi]), {
      window: win, navigator: { languages },
      localStorage: { getItem: () => stored }, document: { write: (s) => { wrote += s; } },
    });
    return { lang: win.CARO_PACK, wrote };
  };
  assert.strictEqual(run('ru', ['en-US']).lang, 'ru', 'ngôn ngữ đã lưu thắng ngôn ngữ trình duyệt');
  assert.strictEqual(run(null, ['fr-FR', 'zh-CN']).lang, 'zh', 'ngôn ngữ trình duyệt đầu tiên có hỗ trợ');
  assert.strictEqual(run('xx', ['fr']).lang, 'vi', 'không khớp: tiếng Việt');
  // Bản cổng game (portal-config.js): chưa chọn thì CARO_LANG0 (tiếng Anh), không theo trình duyệt; đã chọn thì giữ
  assert.strictEqual(run(null, ['vi-VN'], 'en').lang, 'en');
  assert.strictEqual(run('ru', ['vi-VN'], 'en').lang, 'ru');
  assert.strictEqual(run(null, ['zh-CN'], 'xx').lang, 'zh', 'CARO_LANG0 lạ: như trang chính');
  assert.match(run('en', []).wrote, /^<script defer src="b\/i18n-en-[0-9a-f]+\.js"><\/script>$/);
});

test('service worker lưu sẵn các khối mới thay cho file lẻ; tên bộ đệm theo bản gộp', () => {
  const files = JSON.parse(/const FILES = (\[[^\]]*\]);/.exec(B.sw)[1]);
  for (const n of B.files.keys()) assert.ok(files.includes(n), n + ' được lưu sẵn');
  for (const n of B.names) assert.ok(!files.includes(n), n + ' không lưu trùng');
  assert.ok(files.every((f) => /^[\w./-]+$/.test(f)), 'FILES chỉ có tên file (không lẫn chữ trong chú thích, vd. caro-rapfi-nets-*)');
  // A2: khối mã + boot lưu ngay lúc cài (vỏ tối thiểu), gói chuỗi dịch lưu sau khi trang rảnh (tin precache)
  const shell = new RegExp(/const SHELL = \/(.+)\/;/.exec(B.sw)[1]);
  for (const n of B.files.keys()) assert.strictEqual(shell.test(n), !n.startsWith('b/i18n-'), n + (n.startsWith('b/i18n-') ? ' lưu sau' : ' lưu lúc cài'));
  const orig = /const CACHE = '([^']+)';/.exec(fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8'))[1];
  assert.strictEqual(/const CACHE = '([^']+)';/.exec(B.sw)[1], `${orig}-b${B.key}`);
});

test('file chuỗi dịch làm việc khác ngoài I18N.extend, hoặc có hàm, thì không gom', () => {
  assert.strictEqual(langPacks("(function(){ window.I18N.extend('vi', { a: 'x' }); document.title = 'y'; })();"), null);
  assert.strictEqual(langPacks("(function(){ window.I18N.extend('vi', { a: function () {} }); })();"), null);
  assert.strictEqual(langPacks("(function(){ window.I18N.extend('fr', { a: 'x' }); })();"), null);
  assert.deepStrictEqual(langPacks("(function(){ var X = window.I18N.extend; X('vi', { a: 'x' }); X('en', { a: 'y' }); })();"), { vi: { a: 'x' }, en: { a: 'y' } });
});

test('máy chủ: trang chính, sw.js và khối từ bản gộp; khối lưu lâu; CARO_BUNDLE tắt thì như cũ', async () => {
  const get = (handle, url) => new Promise((done) => {
    const res = { status: 0, headers: {}, body: Buffer.alloc(0), setHeader(k, v) { this.headers[k] = v; }, removeHeader() {},
      writeHead(s, h) { this.status = s; Object.assign(this.headers, h || {}); return this; },
      end(b) { if (b) this.body = Buffer.concat([this.body, Buffer.from(b)]); done(this); }, on() { return this; }, once() { return this; }, emit() {}, write() { return true; } };
    handle({ method: 'GET', url, headers: { host: 'x' }, socket: { remoteAddress: '127.0.0.1' } }, res);
  });
  const store = new Store(null);
  const on = makeHandler({ store, hub: {}, bundle: true });
  const page = await get(on, '/');
  assert.strictEqual(page.status, 200);
  assert.ok(page.body.toString().includes('src="b/core-'), 'trang chính dùng bản gộp');
  assert.strictEqual(page.headers['cache-control'], 'no-cache');
  const name = chunkNames()[0];
  const chunk = await get(on, '/' + name);
  assert.strictEqual(chunk.status, 200);
  assert.match(chunk.headers['cache-control'], /immutable/);
  assert.strictEqual(chunk.body.toString(), text(name));
  assert.ok((await get(on, '/sw.js')).body.toString().includes('-b' + B.key));
  assert.strictEqual((await get(on, '/b/core-0000000000.js')).status, 404, 'khối không có: 404');
  // ?bundle=0 (so tốc độ – docs/do-toc-do-tai-laplace) kèm tham số link chia sẻ (?t= …): vẫn là trang gốc từng file
  const raw = (await get(on, '/?bundle=0&t=abc123')).body.toString();
  assert.ok(!raw.includes('src="b/core-') && raw.includes('<script src="app.js"></script>'), '?bundle=0&t=…: không gộp');
  const off = makeHandler({ store, hub: {}, bundle: false });
  // Không gộp: trang chính đọc file gốc (luồng file – kiểm qua bản gộp tắt không dựng gì)
  assert.strictEqual((await get(off, '/' + name)).status, 404);
  store.close();
});

test('thẻ <script> trong <body> không đúng dạng (defer / type…) thì không gộp – tránh đổi thứ tự chạy âm thầm', () => {
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-bundle-'));
  for (const f of ['a.js', 'b.js', 'c.js']) fs.writeFileSync(path.join(dir, f), `(function () { window.${f[0]} = 1; })();`);
  fs.writeFileSync(path.join(dir, 'sw.js'), "const CACHE = 'caro-v1';\nconst FILES = ['./', 'a.js', 'b.js', 'c.js'];\n");
  const page = (extra) => `<html><head></head><body>\n  <script src="a.js"></script>\n  <script src="b.js"></script>\n${extra}</body></html>`;
  fs.writeFileSync(path.join(dir, 'index.html'), page(''));
  assert.ok(build(dir).files.size >= 1, 'dạng chuẩn: gộp được');
  fs.writeFileSync(path.join(dir, 'index.html'), page('  <script src="c.js" defer></script>\n'));
  assert.throws(() => build(dir), /không đúng dạng/);
  fs.rmSync(dir, { recursive: true, force: true });
});
