// Bản cổng game (server/scripts/build-portal.js): gói tĩnh tự đủ cho CrazyGames / itch.io – index.html ở gốc, đường dẫn
// tương đối, cờ bản cổng đặt lúc đóng gói, không service worker, ZIP đọc được; bản web chính không đổi.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { buildPortal, report, absolutePaths, serverOriginOf, portalHtml, SDK_URL } = require('../scripts/build-portal.js');
const { zipFiles } = require('../scripts/zip-lite.js');
const { unlinkHtml, externalLinks, isExternal, shownUrl } = require('../scripts/portal-links.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-portal-test-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** Đọc mục lục ZIP: [{ name, method, size, data }] (giải nén để so nội dung). */
function unzip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < n; i++) {
    assert.strictEqual(buf.readUInt32LE(at), 0x02014b50);
    const method = buf.readUInt16LE(at + 10), csize = buf.readUInt32LE(at + 20), size = buf.readUInt32LE(at + 24);
    const nl = buf.readUInt16LE(at + 28), xl = buf.readUInt16LE(at + 30), cl = buf.readUInt16LE(at + 32), off = buf.readUInt32LE(at + 42);
    const name = buf.slice(at + 46, at + 46 + nl).toString('utf8');
    const lnl = buf.readUInt16LE(off + 26), lxl = buf.readUInt16LE(off + 28);
    const raw = buf.slice(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
    out.push({ name, method, size, data: method === 8 ? zlib.inflateRawSync(raw) : raw, crc: buf.readUInt32LE(at + 16) });
    at += 46 + nl + xl + cl;
  }
  return out;
}

test('CrazyGames: gói tự đủ, cờ bản cổng, SDK, không service worker, đường dẫn tương đối, ZIP đọc được', () => {
  const out = path.join(tmp, 'cg'), zip = path.join(tmp, 'cg.zip');
  const r = buildPortal({ mode: 'crazygames', server: 'https://caro.example.com', out, zip });
  assert.deepStrictEqual(r.problems, []);
  assert.ok(r.files > 100 && r.files <= 1500 && r.total < 250 * 1024 * 1024 && r.initial < 50 * 1024 * 1024, report(r));
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const cfg = fs.readFileSync(path.join(out, 'portal-config.js'), 'utf8');
  assert.match(cfg, /window\.CARO_PORTAL = "crazygames";/);
  assert.match(cfg, /window\.CARO_SERVER = "https:\/\/caro\.example\.com";/);
  assert.match(cfg, /window\.CARO_LANG0 = 'en';/);
  assert.strictEqual(fs.readFileSync(path.join(out, 'config.js'), 'utf8'), cfg, 'config.js của gói trỏ cùng máy chủ');
  // Thứ tự trong <head>: SDK → cờ bản cổng → … → host-detect.js → portal-crazygames.js
  const head = html.slice(0, html.indexOf('</head>'));
  const order = ['<script src="' + SDK_URL + '">', 'portal-config.js', 'watchdog.js', 'host-detect.js', 'portal-crazygames.js'].map((s) => head.indexOf(s));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), 'thứ tự script trong <head>: ' + order);
  assert.ok(!/rel="manifest"/.test(html), 'không manifest (không cài PWA)');
  assert.match(html, /<html lang="en">/);
  assert.ok(!fs.existsSync(path.join(out, 'sw.js')), 'không có sw.js');
  for (const f of ['tests', 'README.md', 'api.html', 'connector.html', 'broadcast.html', 'embed.html', path.join('rapfi', 'nets')]) assert.ok(!fs.existsSync(path.join(out, f)), 'bỏ ' + f);
  for (const f of ['portal.js', 'portal-crazygames.js', 'host-detect.js', 'rapfi/worker.js', 'licenses.html', 'privacy.html']) assert.ok(fs.existsSync(path.join(out, f)), 'có ' + f);
  // Bản gộp: các khối mã + gói chuỗi; portal.js nằm trong khối cuối; sw-boot không đăng ký khi là bản cổng
  const chunks = [...html.matchAll(/<script defer src="(b\/core-[0-9a-f]+\.js)">/g)].map((m) => m[1]);
  assert.ok(chunks.length >= 2 && chunks.every((c) => fs.existsSync(path.join(out, c))));
  const code = chunks.map((c) => fs.readFileSync(path.join(out, c), 'utf8')).join('\n');
  assert.ok(code.includes("!window.CaroNative && !window.CARO_PORTAL"), 'sw-boot.js: không đăng ký service worker trong bản cổng');
  assert.ok(code.includes('window.CaroPortal = {'), 'portal.js đã gộp');
  assert.ok(code.includes('window.CARO_SERVER = "https://caro.example.com"'), 'config.js của gói (không phải config.js trang chính) nằm trong khối mã');
  assert.ok(!code.includes("location.hostname === 'marseraf7.github.io'"), 'không lẫn config.js của trang chính');
  for (const l of ['vi', 'en', 'ru', 'zh']) assert.ok(fs.readdirSync(path.join(out, 'b')).some((f) => f.startsWith('i18n-' + l + '-')), 'gói chuỗi ' + l);
  assert.deepStrictEqual(absolutePaths(out), [], 'mọi đường dẫn trong HTML / CSS là tương đối');
  // ZIP: index.html ở gốc, đúng nội dung, đủ file
  const z = unzip(fs.readFileSync(zip));
  assert.strictEqual(z.length, r.files);
  assert.strictEqual(z[0].name, 'index.html');
  assert.ok(z.every((e) => !e.name.startsWith('/') && !e.name.includes('..') && !e.name.includes('\\')));
  assert.strictEqual(z[0].data.toString('utf8'), html);
  const w = z.find((e) => e.name === 'rapfi/worker.js');
  assert.ok(w && w.data.equals(fs.readFileSync(path.join(out, 'rapfi', 'worker.js'))) && zlib.crc32(w.data) === w.crc);
  assert.match(report(r), /✓ Đạt giới hạn/);
  // Không link ra ngoài (quy định CrazyGames): mọi trang .html trong ZIP không còn <a href> http(s) / // / mailto:
  const htmls = z.filter((e) => /\.html$/.test(e.name));
  assert.ok(htmls.some((e) => e.name === 'privacy.html') && htmls.some((e) => e.name === 'licenses.html'));
  for (const e of htmls) {
    const ext = [...e.data.toString('utf8').matchAll(/<a\b[^>]*\bhref\s*=\s*["']?\s*((?:[a-z][a-z0-9+.-]*:|\/\/)[^"'\s>]*)/gi)]
      .map((m) => m[1]).filter((h) => !/^javascript:/i.test(h));
    assert.deepStrictEqual(ext, [], e.name + ': còn link ra ngoài');
  }
  assert.deepStrictEqual(externalLinks(out), []);
  // Giấy phép: địa chỉ mã nguồn vẫn hiện dạng chữ; trang đã bỏ khỏi gói (connector.html) không còn là link
  const lic = fs.readFileSync(path.join(out, 'licenses.html'), 'utf8');
  assert.ok(lic.includes('(github.com/dhbloo/rapfi/tree/') && lic.includes('<span class="ext-link">github.com/dhbloo/rapfi-networks</span>'));
  assert.ok(lic.includes('.ext-link { overflow-wrap: anywhere; }'));
  const priv = fs.readFileSync(path.join(out, 'privacy.html'), 'utf8');
  assert.ok(!/href="connector\.html"/.test(priv) && priv.includes('<span class="mail ext-link">'));
  assert.ok(priv.includes('href="#en"') && priv.includes('href="./"'), 'link nội bộ giữ nguyên');
  // Bản web chính không đổi
  assert.ok(fs.readFileSync(path.join(__dirname, '..', '..', 'caro', 'licenses.html'), 'utf8').includes('href="https://github.com/dhbloo/rapfi-networks"'));
});

test('itch.io: không nạp SDK CrazyGames, giới hạn 1000 file', () => {
  const out = path.join(tmp, 'itch');
  const r = buildPortal({ mode: 'itch', server: 'https://caro.example.com', out, zip: false });
  assert.deepStrictEqual(r.problems, []);
  assert.ok(r.files <= 1000 && r.zip === null);
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.ok(!html.includes('crazygames') && !fs.existsSync(path.join(out, 'portal-crazygames.js')));
  assert.match(fs.readFileSync(path.join(out, 'portal-config.js'), 'utf8'), /CARO_PORTAL = "itch"/);
});

test('tham số sai: báo lỗi rõ; http chỉ cho bài thử', () => {
  assert.throws(() => buildPortal({ mode: 'kongregate' }), /crazygames hoặc itch/);
  assert.throws(() => serverOriginOf('http://caro.example.com'), /https/);
  assert.strictEqual(serverOriginOf('http://localhost:8080', true), 'http://localhost:8080');
  assert.throws(() => serverOriginOf('https://caro.example.com/app'), /chỉ gồm giao thức/);
  assert.throws(() => serverOriginOf('rác'), /không hợp lệ/);
  assert.strictEqual(serverOriginOf(undefined), require('../src/site.js').DEFAULT_ORIGIN);
  assert.throws(() => portalHtml('<html lang="vi"><head></head><body></body></html>', 'itch'), /thiếu/);
});

test('soát đường dẫn tuyệt đối bắt đúng mẫu lỗi; ZIP rỗng / file nhỏ không nén', () => {
  const d = path.join(tmp, 'abs');
  fs.mkdirSync(path.join(d, 'x'), { recursive: true });
  fs.writeFileSync(path.join(d, 'index.html'), '<a href="/api/x">a</a><img src="ok.png"><a href="https://e.org/">e</a><a href="//cdn/x">c</a>');
  fs.writeFileSync(path.join(d, 'x', 's.css'), '.a { background: url(/img/a.png) } .b { background: url("img/b.png") }');
  assert.deepStrictEqual(absolutePaths(d), ['index.html: href="/api/x"', 'x/s.css: url(/img/a.png']);
  const z = unzip(zipFiles([{ name: 'a.txt', data: Buffer.from('x') }]));
  assert.strictEqual(z[0].method, 0, 'file nén không nhỏ hơn: lưu nguyên');
  assert.strictEqual(z[0].data.toString(), 'x');
  assert.strictEqual(zipFiles([]).length, 22, 'ZIP rỗng: chỉ phần kết');
});

test('portal-links: link ra ngoài thành chữ (giữ địa chỉ), link nội bộ giữ nguyên, kết quả cố định', () => {
  for (const h of ['https://e.org', 'http://e.org', '//cdn.x/a', 'mailto:a@b.c', 'tel:123', 'intent://x', ' HTTPS://E.ORG']) assert.ok(isExternal(h), h);
  for (const h of ['#vi', './', 'licenses.html', 'b/x.html?y=1', 'javascript:void(0)', 'data:text/plain,x', '']) assert.ok(!isExternal(h), h);
  assert.strictEqual(shownUrl('https://github.com/a/b/'), 'github.com/a/b');
  assert.strictEqual(shownUrl('mailto:a@b.c'), 'a@b.c');
  const src = '<html><head><title>t</title></head><body>'
    + '<a href="https://github.com/a/b" target="_blank" rel="noopener">Mã nguồn</a> · '
    + "<a class='mail' href='mailto:a@b.c'>a@b.c</a> · <a href=https://x.org/>x.org</a> · "
    + '<a href="#en">EN</a> · <a href="./">Về</a> · <a href="licenses.html">L</a> · <a href="connector.html#x">C</a> · <a name="k">k</a>'
    + '<A HREF="//cdn.x/p?a=1&amp;b=2"><b>CDN</b></A></body></html>';
  const out = unlinkHtml(src, (f) => f === 'licenses.html');
  assert.strictEqual(out, '<html><head><title>t</title><style>.ext-link { overflow-wrap: anywhere; }</style>\n</head><body>'
    + '<span class="ext-link">Mã nguồn (github.com/a/b)</span> · '
    + '<span class="mail ext-link">a@b.c</span> · <span class="ext-link">x.org</span> · '
    + '<a href="#en">EN</a> · <a href="./">Về</a> · <a href="licenses.html">L</a> · <span class="ext-link">C</span> · <a name="k">k</a>'
    + '<span class="ext-link"><b>CDN</b> (cdn.x/p?a=1&amp;b=2)</span></body></html>');
  assert.strictEqual(unlinkHtml(out), out, 'chạy lại không đổi gì (không thêm <style> lần hai)');
  assert.strictEqual(unlinkHtml('<a href="#x">x</a>'), '<a href="#x">x</a>', 'không đổi thì không chèn <style>');
  const d = path.join(tmp, 'links');
  fs.mkdirSync(path.join(d, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(d, 'index.html'), '<a href="https://e.org">e</a><a href="#a">a</a>');
  fs.writeFileSync(path.join(d, 'sub', 'p.htm'), "<a class=x href='//c.d'>c</a>");
  fs.writeFileSync(path.join(d, 'a.js'), '"<a href=\\"https://e.org\\">"');
  assert.deepStrictEqual(externalLinks(d), ['index.html: https://e.org', 'sub/p.htm: //c.d']);
});

test('báo cáo: vượt giới hạn thì liệt kê từng lỗi', () => {
  const s = report({ mode: 'itch', server: 'https://x.example', out: '/tmp/o', zip: null, files: 1200, total: 1, initial: 1, zipBytes: 0,
    limits: { files: 1000, total: 500 * 1024 * 1024, initial: null }, problems: ['quá nhiều file: 1200 > 1000'] });
  assert.match(s, /✗ Chưa đạt:\n {2}– quá nhiều file/);
  assert.ok(!/ZIP:/.test(s));
});
