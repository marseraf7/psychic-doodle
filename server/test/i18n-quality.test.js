// Chất lượng chuỗi giao diện 4 ngôn ngữ (caro/i18n*.js) – quy tắc ở docs/van-phong-4-ngon-ngu.md:
// đủ khoá ở cả 4 thứ tiếng, biến {x} khớp nhau, không thừa khoảng trắng, tiếng Việt một kiểu đặt dấu (hoà, xoá, tuỳ),
// thuật ngữ thống nhất theo bảng thuật ngữ, tiếng Anh viết kiểu Mỹ, tiếng Trung dùng dấu câu toàn khổ, tiếng Nga không
// lẫn chữ Latin trong một từ.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadAll, LANGS } = require('../scripts/i18n-load.js');

const { files, merged } = loadAll();
const vars = (s) => [...new Set(String(s).match(/\{\w+\}/g) || [])].sort().join(',');
/** Danh sách lỗi → thông báo dễ đọc (tối đa 15 dòng). */
const report = (bad) => bad.slice(0, 15).join('\n') + (bad.length > 15 ? `\n… và ${bad.length - 15} chỗ nữa` : '');

test('Mỗi file i18n có đủ khoá ở cả 4 ngôn ngữ', () => {
  const bad = [];
  for (const f of files) {
    const all = new Set(LANGS.flatMap((l) => Object.keys(f.langs[l])));
    for (const k of all) for (const l of LANGS) if (!(k in f.langs[l])) bad.push(`${f.file}: thiếu ${l}.${k}`);
  }
  assert.deepStrictEqual(bad, [], report(bad));
});

test('Biến {x} giống nhau ở cả 4 ngôn ngữ', () => {
  const bad = [];
  for (const k of Object.keys(merged.vi)) for (const l of LANGS) if (vars(merged[l][k]) !== vars(merged.vi[k])) bad.push(`${l}.${k}: ${vars(merged[l][k])} ≠ vi ${vars(merged.vi[k])}`);
  assert.deepStrictEqual(bad, [], report(bad));
});

test('Khoá có ở nhiều file (file sau ghi đè file trước) phải cùng nghĩa: cùng biến {x}', () => {
  // Hai tính năng lỡ đặt trùng tên khoá thì file nạp sau âm thầm thay chữ của tính năng kia (vd. tb_rule cũ)
  const bad = [];
  for (const l of LANGS) {
    const seen = {};
    for (const f of files) {
      for (const [k, s] of Object.entries(f.langs[l])) {
        if (k in seen && vars(seen[k].s) !== vars(s)) bad.push(`${l}.${k}: ${seen[k].file} {${vars(seen[k].s)}} ≠ ${f.file} {${vars(s)}}`);
        seen[k] = { s, file: f.file };
      }
    }
  }
  assert.deepStrictEqual(bad, [], report(bad));
});

test('Không có chuỗi rỗng, khoảng trắng thừa ở đầu / cuối hay hai dấu cách liền nhau', () => {
  const bad = [];
  for (const l of LANGS) {
    for (const [k, s] of Object.entries(merged[l])) {
      if (typeof s !== 'string' || !s.trim()) bad.push(`${l}.${k}: rỗng`);
      else if (/^\s/.test(s) && !/^ [·–—(]/.test(s)) bad.push(`${l}.${k}: khoảng trắng đầu chuỗi`); // " · …" là phần nối thêm
      else if (/\s$/.test(s)) bad.push(`${l}.${k}: khoảng trắng cuối chuỗi`);
      else if (/[^\s]  +[^\s]/.test(s)) bad.push(`${l}.${k}: hai dấu cách liền nhau`);
    }
  }
  assert.deepStrictEqual(bad, [], report(bad));
});

test('Tiếng Việt: một kiểu đặt dấu thanh (hoà, xoá, tuỳ, thuỷ – trừ tên riêng Thụy Sĩ)', () => {
  const NEW = /([òóỏõọ]a|[òóỏõọ]e|[ùúủũụ]y)(?![a-zà-ỹ])/i; // kiểu mới: hòa, xóa, tùy
  const bad = [];
  for (const [k, s] of Object.entries(merged.vi)) {
    for (const w of s.match(/[A-Za-zÀ-ỹ]+/g) || []) if (NEW.test(w) && !/^Thụy$/.test(w)) bad.push(`vi.${k}: «${w}»`);
  }
  assert.deepStrictEqual(bad, [], report(bad));
});

test('Tiếng Việt: thuật ngữ thống nhất theo bảng thuật ngữ', () => {
  // [cách viết không dùng, cách viết đúng]
  const TERMS = [
    [/hệ số phụ/i, 'chỉ số phụ'],
    [/tie-?break(?!\))/i, 'chỉ số phụ (chỉ giữ "(tie-break)" của quần vợt)'],
    [/Quick advance/i, 'chỉ ghi người thắng'],
    [/League phase/i, 'vòng phân hạng'],
    [/Single Race|Time Trial/i, 'đua 1 chặng / đua tính giờ'],
    [/\bSplit\b/, 'chia đôi'],
    [/\bpreview\b/i, 'xem trước'],
    [/\btick\b/i, 'đánh dấu'],
  ];
  const bad = [];
  for (const [k, s] of Object.entries(merged.vi)) for (const [re, good] of TERMS) if (re.test(s)) bad.push(`vi.${k}: «${s.match(re)[0]}» → ${good}`);
  assert.deepStrictEqual(bad, [], report(bad));
});

test('Tiếng Anh: chính tả kiểu Mỹ', () => {
  const UK = /\b(colour|behaviour|favour|centre|defence|analys(e|ed|es|ing)|organis(e|ed|er|ers|ing)|practis(e|ed|ing)|recognis|minimis|maximis|optimis|paralys(e|ed))/i;
  const bad = Object.entries(merged.en).filter(([, s]) => UK.test(s)).map(([k, s]) => `en.${k}: «${s.match(UK)[0]}»`);
  assert.deepStrictEqual(bad, [], report(bad));
});

test('Tiếng Trung: dấu câu toàn khổ sau chữ Hán', () => {
  const bad = Object.entries(merged.zh).filter(([, s]) => /[一-鿿][,;:?!](?!\d)/.test(s)).map(([k, s]) => `zh.${k}: ${s.slice(0, 40)}`);
  assert.deepStrictEqual(bad, [], report(bad));
});

test('Tiếng Nga: không lẫn chữ Latin trong một từ (vd. "Mатч" gõ nhầm chữ M Latin)', () => {
  const bad = [];
  for (const [k, s] of Object.entries(merged.ru)) {
    for (const w of s.match(/[A-Za-zА-Яа-яЁё]+/g) || []) if (/[A-Za-z]/.test(w) && /[А-Яа-яЁё]/.test(w)) bad.push(`ru.${k}: «${w}»`);
  }
  assert.deepStrictEqual(bad, [], report(bad));
});
