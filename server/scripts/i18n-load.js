/*
 * Đọc toàn bộ chuỗi giao diện trong caro/i18n*.js mà không cần trình duyệt – dùng cho bài thử chất lượng chuỗi
 * (server/test/i18n-quality.test.js) và công cụ soát chính tả (scripts/i18n-lt.js).
 *   loadAll() → { files: [{ file, langs: { vi: { khoá: chuỗi }, en, ru, zh } }], merged: { vi, en, ru, zh } }
 *   merged: như trình duyệt thấy (file nạp sau ghi đè file trước, theo thứ tự trong index.html).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CARO = path.join(__dirname, '..', '..', 'caro');
const LANGS = ['vi', 'en', 'ru', 'zh'];

/** Thứ tự nạp như index.html (file không có trong index.html xếp cuối, theo tên). */
function fileOrder() {
  const html = fs.readFileSync(path.join(CARO, 'index.html'), 'utf8');
  const listed = [...html.matchAll(/<script src="(i18n[\w-]*\.js)"/g)].map((m) => m[1]);
  const all = fs.readdirSync(CARO).filter((f) => /^i18n[\w-]*\.js$/.test(f)).sort();
  return [...new Set([...listed.filter((f) => all.includes(f)), ...all])];
}

/** Bảng gốc trong i18n.js (const DICT = { vi: {…}, … }). */
function baseDict(src) {
  const a = src.indexOf('const DICT = {');
  const b = src.indexOf('\n  };', a);
  if (a < 0 || b < 0) throw new Error('i18n.js: không thấy DICT');
  return vm.runInNewContext('(' + src.slice(a + 'const DICT = '.length, b + 4) + ')');
}

function loadAll() {
  const files = [];
  const merged = Object.fromEntries(LANGS.map((l) => [l, {}]));
  for (const file of fileOrder()) {
    const src = fs.readFileSync(path.join(CARO, file), 'utf8');
    const langs = Object.fromEntries(LANGS.map((l) => [l, {}]));
    if (file === 'i18n.js') {
      const d = baseDict(src);
      for (const l of LANGS) Object.assign(langs[l], d[l]);
    } else {
      const extend = (l, obj) => { if (langs[l]) Object.assign(langs[l], obj); };
      const window = { I18N: { extend, t: (k) => k, LANGS } };
      vm.runInNewContext(src, { window, console }, { filename: file });
    }
    for (const l of LANGS) Object.assign(merged[l], langs[l]);
    files.push({ file, langs });
  }
  return { files, merged, LANGS };
}

module.exports = { loadAll, LANGS };
