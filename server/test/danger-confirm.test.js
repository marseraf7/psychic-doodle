/*
 * Chuẩn giao diện (docs/chuan-giao-dien.md – "Thao tác xoá luôn hỏi lại"): mọi nút xoá / đặt lại trong caro/index.html
 * (nút có class "danger" hoặc "danger-li" và có id) phải hỏi xác nhận bằng hộp trong app (CaroConfirm) trước khi làm.
 * Đọc tĩnh: tìm chỗ gắn onclick cho id đó trong caro/*.js, trong thân hàm phải có "CaroConfirm.".
 * Lỗi gốc: rà soát 16/11/2026 (R2 – nút "Xoá tỉ số" xoá ngay, không hỏi).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CARO = path.join(__dirname, '..', '..', 'caro');

/** Thân hàm bắt đầu ở dấu { đầu tiên sau vị trí i (đếm ngoặc). */
function bodyAt(src, i) {
  const a = src.indexOf('{', i);
  let d = 0;
  for (let j = a; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}' && --d === 0) return src.slice(a, j + 1);
  }
  return src.slice(a);
}

test('Nút xoá / đặt lại trong index.html đều hỏi xác nhận bằng CaroConfirm', () => {
  const html = fs.readFileSync(path.join(CARO, 'index.html'), 'utf8');
  const ids = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0])
    .filter((b) => /class="[^"]*\bdanger(-li)?\b/.test(b) && /\bid="/.test(b)).map((b) => b.match(/\bid="([^"]+)"/)[1]);
  assert.ok(ids.includes('reset-score') && ids.includes('lh-set-clear'), 'đọc được các nút xoá: ' + ids.join(', '));
  const js = fs.readdirSync(CARO).filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(path.join(CARO, f), 'utf8')]);
  const bad = [];
  for (const id of ids) {
    const re = new RegExp(`\\$\\('${id}'\\)\\.onclick\\s*=|getElementById\\('${id}'\\)\\.(onclick\\s*=|addEventListener\\('click')`);
    const hit = js.map(([f, src]) => { const m = re.exec(src); return m ? [f, bodyAt(src, m.index + m[0].length)] : null; }).find(Boolean);
    if (!hit) bad.push(`${id}: không thấy chỗ gắn sự kiện bấm`);
    else if (!/CaroConfirm\./.test(hit[1])) bad.push(`${id} (${hit[0]}): không hỏi CaroConfirm`);
  }
  assert.deepStrictEqual(bad, []);
});
