/*
 * Chuẩn giao diện (docs/chuan-giao-dien.md, mục "Không lộ chuỗi mẫu"): mọi lời gọi T('khoá', {...}) trong caro/*.js phải
 * truyền đủ biến mà chuỗi tiếng Việt của khoá đó dùng ({bo}, {n}…) – thiếu thì người dùng thấy nguyên "Bo{bo}".
 * Đọc tĩnh mã nguồn: khoá viết thẳng ('a') hoặc chọn bằng điều kiện (x ? 'a' : 'b'); đối số thứ hai là object viết thẳng.
 * Đối số là biến / có "...": không đọc được nên bỏ qua (bài thử trình duyệt ui-audit.js bắt phần còn lại).
 * Lỗi gốc: kiểm thử 12–13/11/2026 (N4 – hộp nhập loạt Bo9 / Bo13 của America's Cup hiện "Bo{bo}").
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadAll } = require('../scripts/i18n-load.js');

const CARO = path.join(__dirname, '..', '..', 'caro');

/** Cắt đoạn từ vị trí i tới dấu phẩy / ngoặc đóng cùng cấp đầu tiên: [đoạn, vị trí dừng]. */
function untilTop(src, i) {
  let d = 0, q = null, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if ('({['.includes(c)) d++;
    else if (')}]'.includes(c)) { if (d === 0) break; d--; } else if (c === ',' && d === 0) break;
  }
  return [src.slice(i, j), j];
}

/** Khoá cấp một của object viết thẳng "{ a, b: 1, 'c': x }" (null nếu không đọc được). */
function objKeys(arg) {
  const s = arg.trim();
  if (!s.startsWith('{') || !s.endsWith('}') || s.includes('...')) return null;
  const keys = [];
  let i = 1;
  while (i < s.length - 1) {
    const [part, j] = untilTop(s, i);
    const k = (part.trim().match(/^['"]?([a-zA-Z_$][\w$]*)['"]?\s*(:|$)/) || [])[1];
    if (k) keys.push(k);
    i = j + 1;
  }
  return keys;
}

/** Mọi lời gọi T(...) thiếu biến trong một file. */
function scan(file, vi) {
  const src = fs.readFileSync(path.join(CARO, file), 'utf8');
  const out = [];
  const re = /(^|[^\w$.])T\(/g;
  for (let m; (m = re.exec(src));) {
    const start = m.index + m[0].length;
    const [first, j] = untilTop(src, start);
    const keys = [...first.matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]).filter((k) => typeof vi[k] === 'string');
    if (!keys.length) continue;
    let given = [];
    if (src[j] === ',') {
      const [second] = untilTop(src, j + 1);
      given = objKeys(second);
      if (!given) continue; // biến / spread: không đọc được
    }
    for (const k of keys) {
      const need = [...new Set([...vi[k].matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)].map((x) => x[1]))];
      const miss = need.filter((x) => !given.includes(x));
      if (miss.length) out.push(`${file}:${src.slice(0, m.index).split('\n').length} T('${k}') thiếu {${miss.join('}, {')}}`);
    }
  }
  return out;
}

test('Lời gọi T() truyền đủ biến cho chuỗi (không lộ "{bo}", "{n}" ra giao diện)', () => {
  const { vi } = loadAll().merged;
  const files = fs.readdirSync(CARO).filter((f) => f.endsWith('.js') && !f.startsWith('i18n') && f !== 'sw.js');
  const bad = files.flatMap((f) => scan(f, vi));
  assert.deepStrictEqual(bad, []);
});

test('Bộ đọc bắt được khoá chọn bằng điều kiện thiếu biến (đúng ca lỗi N4)', () => {
  const vi = { a_rule: 'Bo{bo} · x', a_one: 'một' };
  const tmp = path.join(CARO, '.i18n-vars-probe.js');
  fs.writeFileSync(tmp, "const r = T(bo > 1 ? 'a_rule' : 'a_one');\nconst ok = T(bo > 1 ? 'a_rule' : 'a_one', { bo });\nconst s = T('a_rule', { bo: f(1, 2) });\n");
  try {
    assert.deepStrictEqual(scan('.i18n-vars-probe.js', vi), ['.i18n-vars-probe.js:1 T(\'a_rule\') thiếu {bo}']);
  } finally { fs.unlinkSync(tmp); }
});
