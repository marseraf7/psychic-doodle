'use strict';
// Mọi file JS của trình duyệt (caro/) phải biên dịch được – bắt lỗi cú pháp ở các file unit test không nạp
// (vd. otour-export.js, otour-pdf.js), trước khi tới bài thử trình duyệt.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

test('caro/*.js biên dịch được (không lỗi cú pháp)', () => {
  const dir = path.join(__dirname, '../../caro');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 100);
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.doesNotThrow(() => new vm.Script(src, { filename: f }), f);
  }
});
