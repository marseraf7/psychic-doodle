/*
 * Hộp chọn "Thể thức" của giai đoạn giải (tour-stage-edit.js typeLabel): mỗi loại hiện T('fmt_<loại>', { n: 16 }).
 * Mọi loại có sẵn (single, double, roundrobin, swiss, gsl, race, kings) và mọi loại đăng ký trong registry K.kinds
 * (otour-knock-ui.js, otour-pools-ui.js, otour-graph-ui.js…) phải có nhãn fmt_<loại> đủ 4 ngôn ngữ, và chỉ dùng biến {n}
 * (biến khác không được truyền → hiện "{x}" / rỗng). Lỗi gốc: fmt_knock thiếu (rà soát 20/11/2026, đã sửa ở form giải Offline).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadAll } = require('../scripts/i18n-load.js');

const CARO = path.join(__dirname, '..', '..', 'caro');
const BUILTIN = ['single', 'double', 'roundrobin', 'swiss', 'gsl', 'race', 'kings'];

/** Loại đăng ký trong K.kinds (đọc tĩnh: "K.kinds.<loại> = {" hoặc "K.kinds['<loại>'] = {"). */
function registryKinds() {
  const out = new Map();
  for (const f of fs.readdirSync(CARO).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(CARO, f), 'utf8');
    for (const m of src.matchAll(/K\.kinds(?:\.(\w+)|\[['"](\w+)['"]\])\s*=\s*\{/g)) out.set(m[1] || m[2], f);
  }
  return out;
}

/** Như T() của i18n.js với { n: 16 }: biến khác thành rỗng – trả về các biến bị bỏ trống. */
const unfilled = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => k !== 'n');

test('registry K.kinds đọc được (có knock, pools, graph)', () => {
  const k = registryKinds();
  for (const x of ['knock', 'pools', 'graph']) assert.ok(k.has(x), 'thiếu loại ' + x + ' trong K.kinds');
});

test('mọi loại giai đoạn có nhãn fmt_<loại> đủ 4 ngôn ngữ, không còn {x} chưa thay', () => {
  const { merged } = loadAll();
  const kinds = [...BUILTIN, ...registryKinds().keys()];
  const bad = [];
  for (const lang of ['vi', 'en', 'ru', 'zh']) {
    for (const kind of kinds) {
      const s = merged[lang]['fmt_' + kind];
      if (typeof s !== 'string' || !s.trim()) bad.push(`${lang}: thiếu fmt_${kind}`);
      else if (unfilled(s).length) bad.push(`${lang}: fmt_${kind} còn {${unfilled(s).join('}, {')}} – "${s}"`);
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('nhãn riêng của loại trong registry (T(\'fmt_…\') trong file đăng ký) đủ 4 ngôn ngữ', () => {
  const { merged } = loadAll();
  const bad = [];
  for (const file of new Set(registryKinds().values())) {
    const src = fs.readFileSync(path.join(CARO, file), 'utf8');
    // khoá viết thẳng, hoặc tiền tố + biến ('fmt_knock_' + mode): mọi khoá bắt đầu bằng tiền tố đó
    for (const m of src.matchAll(/T\('(fmt_\w+)'(\s*\+)?/g)) {
      const keys = m[2] ? Object.keys(merged.vi).filter((k) => k.startsWith(m[1])) : [m[1]];
      if (!keys.length) bad.push(`${file}: không có khoá nào bắt đầu bằng ${m[1]}`);
      for (const k of keys) for (const lang of ['vi', 'en', 'ru', 'zh']) if (typeof merged[lang][k] !== 'string') bad.push(`${file}: ${lang} thiếu ${k}`);
    }
  }
  assert.deepStrictEqual(bad, []);
});
