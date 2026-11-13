/*
 * Chuẩn giao diện (docs/chuan-giao-dien.md) – soát tĩnh các file caro/*.css, bắt những mẫu CSS đã gây lỗi hiển thị:
 *   1. text-overflow: ellipsis cùng display: flex / grid trong một luật – trình duyệt KHÔNG vẽ "…" trên khung flex / grid,
 *      chữ bị cắt cụt (E1 – tên giải trên thanh tiêu đề). Đặt chữ trong phần tử con (span.ellip) và cắt ở đó.
 *   2. display: flex / grid trên ô bảng td / th – ô rời khỏi lưới bảng, cột lệch hàng (L2 – cột "Phong độ").
 *      Bọc nội dung ô trong một span (inline-flex) thay vì đổi display của ô.
 *   3. Bảng tiêu đề dính (position: sticky) trong khung cuộn mà khung đó không có scroll-padding-top – cuộn tới / focus vào
 *      ô nhập sẽ nằm dưới thanh dính (L1). Hiện chỉ áp cho thanh tab giải (.ot-tabs) ↔ .otp-body / #tour-body.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CARO = path.join(__dirname, '..', '..', 'caro');

/** Các luật CSS (bỏ chú thích, giữ số dòng): [{ file, line, sel, body }] – kể cả luật lồng trong @media. */
function rules() {
  const out = [];
  for (const file of fs.readdirSync(CARO).filter((f) => f.endsWith('.css'))) {
    const src = fs.readFileSync(path.join(CARO, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    const re = /([^{}]+)\{([^{}]*)\}/g;
    for (let m; (m = re.exec(src));) {
      const sel = m[1].trim();
      if (!sel || sel.startsWith('@')) continue;
      out.push({ file, line: src.slice(0, m.index + m[0].indexOf(sel)).split('\n').length, sel, body: m[2] });
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
