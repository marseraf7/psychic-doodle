#!/usr/bin/env node
/*
 * Sửa hàng loạt chuỗi giao diện: đọc file JSON { "vi": { "khoá": "chuỗi mới" }, "en": {…} } rồi thay đúng chuỗi đó trong
 * caro/i18n*.js (file nạp sau cùng có khoá đó – chính là chuỗi người dùng đang thấy). Không đổi thứ tự / chú thích.
 *   node server/scripts/i18n-set.js sua.json [--dry]
 * Khoá chưa có ở đâu: báo lỗi (thêm khoá mới thì sửa tay trong file i18n theo chủ đề).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadAll } = require('./i18n-load.js');

const CARO = path.join(__dirname, '..', '..', 'caro');
const MARK = /(?:\bX|\bI\.extend|\bI18N\.extend|\bextend)\(\s*'(vi|en|ru|zh)'\s*,\s*\{|^ {4}(vi|en|ru|zh): \{/gm;

/** Các khoảng [đầu, cuối) của mọi khối ngôn ngữ lang trong file (một file có thể có nhiều khối, vd. i18n-rapfi.js). */
function blocks(src, lang) {
  const ms = [...src.matchAll(MARK)];
  const out = [];
  ms.forEach((m, i) => { if ((m[1] || m[2]) === lang) out.push([m.index, i + 1 < ms.length ? ms[i + 1].index : src.length]); });
  return out;
}
/** Khối đầu tiên (giữ cho bài thử cũ). */
const block = (src, lang) => blocks(src, lang)[0] || null;

/** Đọc chuỗi JS bắt đầu ở src[at] (', " hoặc `) → vị trí ngay sau dấu đóng. */
function literalEnd(src, at) {
  const q = src[at];
  if (!`'"\``.includes(q)) return -1;
  for (let i = at + 1; i < src.length; i++) {
    if (src[i] === '\\') { i++; continue; }
    if (q === '`' && src[i] === '$' && src[i + 1] === '{') return -1; // chuỗi có biểu thức: sửa tay
    if (src[i] === q) return i + 1;
  }
  return -1;
}

const quote = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";

function setOne(src, lang, key, value) {
  const bs = blocks(src, lang);
  if (!bs.length) throw new Error(`không thấy khối ${lang}`);
  let last = null;
  for (const b of bs) {
    const re = new RegExp(`(^|[\\s,{])['"]?${key.replace(/[$]/g, '\\$')}['"]?\\s*:\\s*`, 'gm');
    re.lastIndex = b[0];
    let m;
    while ((m = re.exec(src)) && m.index < b[1]) last = m; // khoá trùng: cái sau cùng thắng (như khi trình duyệt nạp)
  }
  if (!last) throw new Error(`không thấy khoá ${lang}.${key}`);
  const at = last.index + last[0].length;
  const end = literalEnd(src, at);
  if (end < 0) throw new Error(`${lang}.${key}: không phải chuỗi đơn giản`);
  return src.slice(0, at) + quote(value) + src.slice(end);
}

function apply(changes, { dry = false } = {}) {
  const { files } = loadAll();
  const out = new Map(); // file → nội dung mới
  const done = [];
  for (const [lang, map] of Object.entries(changes)) {
    for (const [key, value] of Object.entries(map)) {
      const owner = [...files].reverse().find((f) => f.langs[lang] && key in f.langs[lang]);
      if (!owner) throw new Error(`khoá chưa có: ${lang}.${key}`);
      const many = files.filter((f) => f.langs[lang] && key in f.langs[lang]);
      if (many.length > 1) console.warn(`Chú ý: ${lang}.${key} có ở ${many.map((f) => f.file).join(', ')} – sửa ở ${owner.file} (file nạp sau)`);
      const p = path.join(CARO, owner.file);
      const src = out.get(p) || fs.readFileSync(p, 'utf8');
      out.set(p, setOne(src, lang, key, value));
      done.push(`${owner.file} ${lang}.${key}`);
    }
  }
  if (!dry) for (const [p, s] of out) fs.writeFileSync(p, s);
  return done;
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('Cách dùng: node server/scripts/i18n-set.js sua.json [--dry]'); process.exit(1); }
  const done = apply(JSON.parse(fs.readFileSync(file, 'utf8')), { dry: process.argv.includes('--dry') });
  console.log(`${done.length} chuỗi${process.argv.includes('--dry') ? ' (thử, chưa ghi)' : ''}`);
}

module.exports = { apply, setOne, block, blocks };
