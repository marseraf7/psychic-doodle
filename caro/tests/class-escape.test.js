// Luật quét tĩnh — hồi quy M-F5: không file nào trong caro/ được nội suy THẲNG một giá
// trị (biến/thuộc tính) vào thuộc tính class="..." mà không qua esc(). Các giá trị này
// (status, result, ...) hôm nay là enum của máy chủ nên chưa khai thác được, nhưng chỉ
// cần máy chủ thêm một giá trị do người dùng ảnh hưởng là thành XSS lưu trữ. Mọi điểm
// cũ đã được bọc esc(); bài này giữ cho các điểm mới không tái phạm.
// Chạy: node --test caro/tests/class-escape.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const BARE = /\$\{\s*[A-Za-z_$][\w.$]*\s*\}/; // ${p.status} / ${cls} / ${k} — nội suy trần một giá trị
function classAttrs(src) {
  const out = [];
  const re = /class=\\"([^\\]*?)\\"|class="([^"]*?)"/g;
  let m;
  while ((m = re.exec(src))) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

test('M-F5: không còn nội suy trần vào thuộc tính class trong caro/*.js', () => {
  const dir = path.join(__dirname, '..');
  const bad = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const v of classAttrs(src)) if (BARE.test(v)) bad.push(`${f}: class="${v}"`);
  }
  assert.deepStrictEqual(bad, [], 'Các điểm nội suy trần vào class (phải qua esc()):\n' + bad.join('\n'));
});
