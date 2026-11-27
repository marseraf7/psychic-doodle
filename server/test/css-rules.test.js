/*
 * Chuẩn giao diện (docs/chuan-giao-dien.md) – soát tĩnh các file caro/*.css, bắt những mẫu CSS đã gây lỗi hiển thị:
 *   1. text-overflow: ellipsis cùng display: flex / grid trong một luật – trình duyệt KHÔNG vẽ "…" trên khung flex / grid,
 *      chữ bị cắt cụt (E1 – tên giải trên thanh tiêu đề). Đặt chữ trong phần tử con (span.ellip) và cắt ở đó.
 *   2. display: flex / grid trên ô bảng td / th – ô rời khỏi lưới bảng, cột lệch hàng (L2 – cột "Phong độ").
 *      Bọc nội dung ô trong một span (inline-flex) thay vì đổi display của ô.
 *   3. Bảng tiêu đề dính (position: sticky) trong khung cuộn mà khung đó không có scroll-padding-top – cuộn tới / focus vào
 *      ô nhập sẽ nằm dưới thanh dính (L1). Hiện chỉ áp cho thanh tab giải (.ot-tabs) ↔ .otp-body / #tour-body.
 *   4. Thuộc tính vật lý trái/phải (margin/padding/border-left|right, left: / right: định vị, text-align / float / clear
 *      left|right, border-*-left|right-radius, viết tắt 4 giá trị không đối xứng của margin / padding / inset / border-*,
 *      border-radius không đối xứng trái–phải) – ngôn ngữ viết từ phải sang trái (RTL, <html dir="rtl">) sẽ không tự lật.
 *      Dùng thuộc tính logic (margin-inline-start, inset-inline-end, text-align: start…). Chỗ buộc phải giữ vật lý (căn giữa
 *      bằng left: 50% + translateX, JS đặt style.left, toạ độ bàn cờ…) ghi chú thích "ltr-ok: <lý do>" trên cùng dòng.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CARO = path.join(__dirname, '..', '..', 'caro');

/** Các luật CSS (bỏ chú thích, giữ số dòng): [{ file, line, sel, body, bodyLine, raw }] – kể cả luật lồng trong @media.
 *  bodyLine: dòng của dấu "{"; raw: các dòng gốc của file (còn chú thích, để đọc ghi chú ltr-ok). */
function rules() {
  const out = [];
  for (const file of fs.readdirSync(CARO).filter((f) => f.endsWith('.css'))) {
    const orig = fs.readFileSync(path.join(CARO, file), 'utf8');
    const raw = orig.split('\n');
    const src = orig.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    const re = /([^{}]+)\{([^{}]*)\}/g;
    for (let m; (m = re.exec(src));) {
      const sel = m[1].trim();
      if (!sel || sel.startsWith('@')) continue;
      const bodyLine = src.slice(0, m.index + m[0].indexOf('{')).split('\n').length;
      out.push({ file, line: src.slice(0, m.index + m[0].indexOf(sel)).split('\n').length, sel, body: m[2], bodyLine, raw });
    }
  }
  return out;
}

const FLEXY = /(^|[;\s])display\s*:\s*(inline-)?(flex|grid)\b/;
const where = (r) => `${r.file}:${r.line} ${r.sel.replace(/\s+/g, ' ')}`;

test('Không đặt text-overflow: ellipsis trên khung flex / grid (không có "…")', () => {
  const bad = rules().filter((r) => /text-overflow\s*:\s*ellipsis/.test(r.body) && FLEXY.test(r.body)).map(where);
  assert.deepStrictEqual(bad, []);
});

test('Không đổi display của ô bảng td / th sang flex / grid (ô rời khỏi lưới bảng)', () => {
  // Phần tử cuối của bộ chọn là td / th (td.form, table.stand th, …)
  const cell = (s) => /(^|[\s>+~])(td|th)([.#:[][^\s>+~]*)?$/.test(s.trim());
  const bad = rules().filter((r) => FLEXY.test(r.body) && r.sel.split(',').some(cell)).map(where);
  assert.deepStrictEqual(bad, []);
});

test('Khung cuộn chứa thanh tab dính của giải có scroll-padding-top (ô được cuộn tới không nằm dưới thanh tab)', () => {
  const all = rules();
  assert.ok(all.some((r) => /\.ot-tabs\b/.test(r.sel) && /position\s*:\s*sticky/.test(r.body)), 'thanh tab giải vẫn là sticky');
  for (const box of ['.otp-body', '#tour-body']) {
    assert.ok(all.some((r) => r.sel.split(',').map((s) => s.trim()).includes(box) && /scroll-padding-top\s*:\s*[1-9]/.test(r.body)), `${box} có scroll-padding-top`);
  }
});

test('Bộ đọc bắt đúng mẫu lỗi (ellipsis trên flex, td flex)', () => {
  const tmp = path.join(CARO, 'zz-css-probe.css');
  fs.writeFileSync(tmp, '.a { display: flex; overflow: hidden; text-overflow: ellipsis; }\n/* td.x { display: flex } */\ntable.s td.form { display: flex; gap: 2px; }\n.ok { display: block; text-overflow: ellipsis; }\n');
  try {
    const r = rules().filter((x) => x.file === 'zz-css-probe.css');
    assert.deepStrictEqual(r.filter((x) => /text-overflow\s*:\s*ellipsis/.test(x.body) && FLEXY.test(x.body)).map((x) => x.sel), ['.a']);
    assert.deepStrictEqual(r.filter((x) => FLEXY.test(x.body) && /(^|\s)td/.test(x.sel)).map((x) => [x.sel, x.line]), [['table.s td.form', 3]]);
  } finally { fs.unlinkSync(tmp); }
});

// ------------------------------------------------------------------ 4. Thuộc tính vật lý trái/phải (chuẩn bị RTL)
/** Khai báo trong một luật: [{ prop, value, line }] (tách theo ";" ngoài ngoặc, giữ số dòng). */
function decls(r) {
  const out = [];
  let start = 0, depth = 0;
  const b = r.body;
  for (let i = 0; i <= b.length; i++) {
    const ch = b[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (i === b.length || (ch === ';' && depth === 0)) {
      const m = /^(\s*)([-a-zA-Z]+)\s*:\s*([\s\S]*?)\s*(!\s*important)?\s*$/.exec(b.slice(start, i));
      if (m) out.push({ prop: m[2].toLowerCase(), value: m[3], line: r.bodyLine + (b.slice(0, start) + m[1]).split('\n').length - 1 });
      start = i + 1;
    }
  }
  return out;
}
/** Tách giá trị theo khoảng trắng ngoài ngoặc: "0 calc(1px + 2px) 0 4px" → 4 phần. */
const words = (v) => v.match(/(?:[^\s(]+|\([^()]*(?:\([^()]*\)[^()]*)*\))+/g) || [];
const PHYS_PROP = /^(margin|padding|scroll-margin|scroll-padding)-(left|right)$|^border-(left|right)(-(width|color|style))?$|^(left|right)$|^border-(top|bottom)-(left|right)-radius$/;
const BOX4 = /^(margin|padding|inset|scroll-margin|scroll-padding|border-width|border-color|border-style)$/;
/** Lý do khai báo là vật lý trái/phải, hoặc '' nếu không. */
function physical(d) {
  if (PHYS_PROP.test(d.prop)) return d.prop;
  if (/^(text-align|text-align-last|float|clear)$/.test(d.prop) && /^(left|right)$/i.test(d.value.trim())) return `${d.prop}: ${d.value.trim()}`;
  if (BOX4.test(d.prop)) {
    const w = words(d.value);
    if (w.length === 4 && w[1] !== w[3]) return `${d.prop} 4 giá trị trái ≠ phải`;
  }
  if (d.prop === 'border-radius') {
    const asym = d.value.split('/').some((h) => {
      const w = words(h);
      const [tl, tr, br, bl] = w.length === 1 ? [w[0], w[0], w[0], w[0]] : w.length === 2 ? [w[0], w[1], w[0], w[1]] : w.length === 3 ? [w[0], w[1], w[2], w[1]] : w;
      return tl !== tr || bl !== br;
    });
    if (asym) return 'border-radius trái ≠ phải';
  }
  return '';
}
/** Mọi khai báo vật lý trái/phải không có ghi chú ltr-ok trên cùng dòng: "file:dòng bộ chọn → lý do". */
function physicalDecls(all) {
  const bad = [];
  for (const r of all) {
    for (const d of decls(r)) {
      const why = physical(d);
      if (why && !/ltr-ok/.test(r.raw[d.line - 1] || '')) bad.push(`${r.file}:${d.line} ${r.sel.replace(/\s+/g, ' ')} → ${why}`);
    }
  }
  return bad;
}

test('Không dùng thuộc tính vật lý trái/phải trong caro/*.css (dùng thuộc tính logic để tự lật khi RTL; ngoại lệ ghi ltr-ok)', () => {
  assert.deepStrictEqual(physicalDecls(rules()), []);
});

test('Ghi chú ltr-ok luôn kèm lý do', () => {
  const bad = [];
  for (const file of fs.readdirSync(CARO).filter((f) => f.endsWith('.css'))) {
    fs.readFileSync(path.join(CARO, file), 'utf8').split('\n').forEach((l, i) => {
      if (/ltr-ok/.test(l) && !/ltr-ok:\s*\S{2,}/.test(l)) bad.push(`${file}:${i + 1}`);
    });
  }
  assert.deepStrictEqual(bad, []);
});

test('Bộ đọc bắt đúng mẫu vật lý trái/phải, bỏ qua bản logical / đối xứng / ltr-ok', () => {
  const tmp = path.join(CARO, 'zz-rtl-probe.css');
  fs.writeFileSync(tmp, [
    '.a { margin-left: 4px; padding-right: 2px; }',
    '.b { position: absolute; left: 0;',
    '  right: 8px; }',
    '.c { text-align: right; float: left; border-left: 1px solid; }',
    '.d { margin: 0 4px 0 8px; padding: 1px calc(2px + 1px) 3px 4px; border-radius: 4px 0 0 4px; }',
    '.e { border-top-left-radius: 3px; inset: 0 auto 0 0; }',
    '/* .f { left: 0 } */ .ok { margin: 0 4px; padding: 1px 2px 3px 2px; border-radius: 8px 8px 0 0; text-align: start; margin-inline-start: 4px; inset-inline: 0; }',
    '.g { left: 50%; transform: translateX(-50%); } /* ltr-ok: căn giữa */',
  ].join('\n') + '\n');
  try {
    const all = rules().filter((x) => x.file === 'zz-rtl-probe.css');
    const got = physicalDecls(all).map((s) => s.replace(/^zz-rtl-probe\.css:/, ''));
    assert.deepStrictEqual(got, [
      '1 .a → margin-left', '1 .a → padding-right',
      '2 .b → left', '3 .b → right',
      '4 .c → text-align: right', '4 .c → float: left', '4 .c → border-left',
      '5 .d → margin 4 giá trị trái ≠ phải', '5 .d → padding 4 giá trị trái ≠ phải', '5 .d → border-radius trái ≠ phải',
      '6 .e → border-top-left-radius', '6 .e → inset 4 giá trị trái ≠ phải',
    ]);
  } finally { fs.unlinkSync(tmp); }
});
