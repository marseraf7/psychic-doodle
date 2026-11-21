/*
 * Gộp mã giao diện cho trang chính (bước 1 của docs/nghien-cuu-viet-lai-rust-17-11-2026.md – tải trang nhanh hơn).
 *
 * caro/index.html nạp ~240 file JS lẻ ở cuối <body>, 62 trong số đó chỉ là chuỗi dịch đủ 4 ngôn ngữ (~40% số byte) dù
 * mỗi người chỉ dùng một. Máy chủ tự dựng lại (không cần công cụ ngoài, không sửa file nguồn):
 *   – Mã: nối các file theo đúng thứ tự trong index.html thành vài khối ~320 KB (`b/core-<băm>.js`), nạp `defer`
 *     (thứ tự chạy giữ nguyên, trước DOMContentLoaded như cũ). Mỗi file bọc try/catch: một file lỗi không chặn các file
 *     sau (như khi còn là thẻ <script> riêng); lỗi vẫn được ném lại để window.onerror (watchdog.js) thấy.
 *   – Chuỗi dịch: chạy từng file i18n-*.js trong vm, chỉ cho gọi window.I18N.extend → gom thành 4 gói, mỗi gói một
 *     ngôn ngữ (`b/i18n-<l>-<băm>.js`). File nào làm việc khác ngoài extend, hoặc có giá trị không phải chuỗi / số,
 *     thì giữ nguyên trong khối mã (an toàn hơn là gom sai).
 *   – `b/boot-<băm>.js` (nhỏ, chạy đồng bộ ngay sau khối chứa i18n.js): chọn ngôn ngữ như i18n.js (caro.lang đã lưu →
 *     ngôn ngữ trình duyệt → vi) rồi chèn thẻ `defer` của gói ngôn ngữ đó vào đúng vị trí – gói chạy sau i18n.js và
 *     trước mọi file mã phía sau. Đổi ngôn ngữ lúc đang dùng: i18n.js tự tải gói còn thiếu (window.CARO_PACKS).
 *   – sw.js: danh sách FILES thay các file lẻ đã gộp bằng các khối mới; tên CACHE thêm mã băm của bản gộp.
 * Tên khối có mã băm nội dung → được lưu lâu (immutable). Dựng lại khi index.html hoặc sw.js đổi (đổi file nào trong
 * caro/ cũng phải tăng CACHE trong sw.js – CLAUDE.md). Dựng lỗi thì phục vụ như cũ (từng file lẻ). Tắt: CARO_BUNDLE=0.
 * Thẻ <script> trong <head> (watchdog, theme…) không gộp. Trang khác (embed.html…) không đổi.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const LANGS = ['vi', 'en', 'ru', 'zh'];
const CHUNK = 200 * 1024; // một khối lớn quá là một việc CPU dài lúc khởi động (mỗi khối defer chạy thành một việc riêng) – A2: 320 → 200 KB, việc dài nhất @4× ~80 → ~60 ms
const TAG = /<script src="([^"]+)"><\/script>/g;
const TAG_LINE = /^([ \t]*)<script src="[^"]+"><\/script>[ \t]*\r?\n/gm; // cả dòng chứa thẻ (bỏ dòng, không để dòng trống)

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);

/** Chuỗi của một file dịch: { lang: { key: chuỗi } } nếu file chỉ gọi I18N.extend với chuỗi / số; null nếu không gom được. */
function langPacks(src) {
  const out = {};
  let ok = true;
  const extend = (l, obj) => {
    if (!LANGS.includes(l) || !obj || typeof obj !== 'object') { ok = false; return; }
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== 'string' && typeof v !== 'number') { ok = false; return; }
      (out[l] = out[l] || {})[k] = v;
    }
  };
  try {
    vm.runInNewContext(src, { window: { I18N: { extend } } }, { timeout: 1000 });
  } catch (e) { return null; }
  return ok && Object.keys(out).length ? out : null;
}

/** Bọc một file mã: lỗi của file không chặn các file sau; ném lại để window.onerror vẫn thấy. */
const wrap = (name, src) => `try {\n${src}\n} catch (e) { setTimeout(() => { throw e; }); console.error('[bundle] ${name}', e); }\n`;

/** Chia danh sách [tên, mã] thành các khối liền nhau ~CHUNK byte. */
function chunks(list) {
  const out = [];
  let cur = '';
  for (const [name, src] of list) {
    cur += wrap(name, src);
    if (cur.length >= CHUNK) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out;
}

function bootJs(packs) {
  return `// Tạo tự động bởi server/src/web-bundle.js – chọn gói chuỗi dịch như i18n.js
(function () {
  var P = ${JSON.stringify(packs)}, l = null;
  try { l = localStorage.getItem('caro.lang'); } catch (e) { /* riêng tư */ }
  if (!P[l]) {
    l = 'vi';
    var a = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < a.length; i++) { var c = String(a[i]).slice(0, 2).toLowerCase(); if (P[c]) { l = c; break; } }
  }
  window.CARO_PACKS = P;
  window.CARO_PACK = l;
  document.write('<script defer src="' + P[l] + '"><\\/script>');
})();
`;
}

/**
 * Dựng bản gộp từ thư mục caro/. → { html, sw, files: Map('b/…' → Buffer), names: [file lẻ đã gộp], key } hoặc ném lỗi.
 */
function build(dir) {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
  const bodyAt = html.indexOf('<body');
  if (bodyAt < 0) throw new Error('index.html không có <body>');
  const head = html.slice(0, bodyAt), body = html.slice(bodyAt);
  const names = [...body.matchAll(TAG)].map((m) => m[1]);
  // Thẻ <script> khác dạng chuẩn (có defer / type / async…) mà gộp thì nó chạy trước mọi khối defer – đổi thứ tự âm thầm.
  // Gặp là thôi gộp (phục vụ từng file như cũ) để lỗi lộ ra ngay ở bản gộp lẫn bản gốc.
  if ((body.match(/<script\b/g) || []).length !== names.length) throw new Error('có thẻ <script> trong <body> không đúng dạng <script src="…"></script>');
  if (names.length < 2) throw new Error('index.html không có thẻ <script> để gộp');
  for (const n of names) if (!/^[\w./-]+\.js$/.test(n) || n.includes('..')) throw new Error('tên file lạ: ' + n);

  // Phân loại: file chuỗi dịch gom được → gói ngôn ngữ; còn lại → mã, giữ thứ tự
  const packs = Object.fromEntries(LANGS.map((l) => [l, {}]));
  const before = [], after = []; // mã đến hết i18n.js / mã sau đó
  let seenCore = false, packed = 0;
  for (const n of names) {
    const src = fs.readFileSync(path.join(dir, n), 'utf8');
    const p = /^i18n-[\w-]+\.js$/.test(n) && seenCore ? langPacks(src) : null;
    if (p) {
      for (const l of LANGS) Object.assign(packs[l], p[l] || {});
      packed++;
      continue;
    }
    (seenCore ? after : before).push([n, src]);
    if (n === 'i18n.js') seenCore = true;
  }

  const files = new Map();
  const add = (base, text) => { const name = `b/${base}-${hash(text)}.js`; files.set(name, Buffer.from(text)); return name; };
  const tags = [];
  for (const c of chunks(before)) tags.push(`<script defer src="${add('core', c)}"></script>`);
  if (packed) {
    // Chuỗi còn thiếu ở một ngôn ngữ thì lấy tiếng Việt (như I18N.t) – để gói nào cũng tự đủ
    const urls = {};
    for (const l of LANGS) {
      const all = { ...packs.vi, ...packs[l] };
      urls[l] = add('i18n-' + l, `(function () { window.I18N.extend(${JSON.stringify(l)}, ${JSON.stringify(all)}); })();\n`);
    }
    tags.push(`<script src="${add('boot', bootJs(urls))}"></script>`);
  }
  for (const c of chunks(after)) tags.push(`<script defer src="${add('core', c)}"></script>`);

  // index.html: dòng có thẻ đầu tiên thay bằng các thẻ mới, các dòng thẻ còn lại bỏ
  let first = true;
  const body2 = body.replace(TAG_LINE, (_, ind) => {
    if (!first) return '';
    first = false;
    return tags.map((t) => ind + t + '\n').join('');
  });
  if (TAG.test(body2.replace(/<script (?:defer )?src="b\/[^"]+"><\/script>/g, ''))) throw new Error('còn thẻ <script> không nằm riêng một dòng');
  TAG.lastIndex = 0;

  // sw.js: lưu sẵn các khối mới thay cho file lẻ; tên CACHE theo bản gộp
  const key = hash([...files.keys()].join('|'));
  const fm = /const FILES = \[([\s\S]*?)\];/.exec(sw);
  const cm = /const CACHE = '([^']+)';/.exec(sw);
  if (!fm || !cm) throw new Error('sw.js không có FILES / CACHE');
  // Bỏ chú thích trước (chú thích trong FILES có thể nhắc tên trong dấu nháy – vd. bộ đệm 'caro-rapfi-nets-*' – không phải file)
  const list = [...fm[1].replace(/\/\/.*$/gm, '').matchAll(/'([^']*)'/g)].map((m) => m[1]);
  const gone = new Set(names);
  const next = list.filter((f) => !gone.has(f)).concat([...files.keys()]);
  const sw2 = sw.replace(fm[0], () => `const FILES = ${JSON.stringify(next)};`)
    .replace(cm[0], () => `const CACHE = '${cm[1]}-b${key}';`);

  return { html: head + body2, sw: sw2, files, names, key, packed };
}

/**
 * Bản gộp đang dùng cho thư mục dir; tự dựng lại khi index.html / sw.js đổi (kiểm tối đa mỗi giây một lần).
 * Giữ thêm các khối của bản trước: trang đang mở dở từ bản cũ vẫn tải được khối của nó.
 */
function makeBundle(dir, { log = console.error } = {}) {
  let cur = null, sig = '', checked = 0, old = new Map(), failed = '';
  function current() {
    const now = Date.now();
    if (now - checked < 1000) return cur;
    checked = now;
    // Chữ ký: index.html, sw.js và mọi file đã gộp (sửa một file JS mà quên tăng CACHE, hay cập nhật code ghi file lần
    // lượt, đều dựng lại – không phục vụ mãi một bản lẫn file cũ / mới)
    const sigOf = (names) => ['index.html', 'sw.js'].concat(names).map((f) => fs.statSync(path.join(dir, f)).mtimeMs).join(':');
    let s;
    try { s = sigOf(cur ? cur.names : []); } catch (e) { return cur; }
    if (s === sig) return cur;
    try {
      const b = build(dir);
      if (cur) old = cur.files;
      cur = b;
      sig = sigOf(b.names); // tính lại theo đúng các file vừa gộp
      failed = '';
    } catch (e) {
      sig = s;
      if (failed !== e.message) log('[bundle] không gộp được, phục vụ từng file như cũ:', e.message);
      failed = e.message;
      cur = null;
    }
    return cur;
  }
  /** File khối 'b/…' (bản hiện tại hoặc bản ngay trước), hoặc null. */
  function file(name) {
    const b = current();
    return (b && b.files.get(name)) || old.get(name) || null;
  }
  current(); // dựng ngay khi tạo (lúc máy chủ khởi động, trước khi nhận kết nối) – không để yêu cầu đầu tiên phải chờ
  return { current, file };
}

module.exports = { build, makeBundle, langPacks, LANGS };
