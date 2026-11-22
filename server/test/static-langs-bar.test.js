/*
 * Trang tĩnh có thanh 8 ngôn ngữ (licenses.html CSS riêng, privacy / connector dùng policy-page.css): ở màn 390px thanh
 * ngôn ngữ phải tự cuộn ngang (min-width: 0 + overflow-x: auto), nếu không cả trang bị cuộn ngang (lỗi gặp 22/11/2026).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CARO = path.resolve(__dirname, '..', '..', 'caro');
const rule = (css) => (/\.langs\s*\{([^}]*)\}/.exec(css) || [])[1] || '';

for (const [name, file] of [['licenses.html', 'licenses.html'], ['policy-page.css', 'policy-page.css']]) {
  test(`${name}: thanh ngôn ngữ cuộn ngang trong chính nó, không đẩy rộng trang`, () => {
    const r = rule(fs.readFileSync(path.join(CARO, file), 'utf8'));
    assert.match(r, /min-width:\s*0/);
    assert.match(r, /overflow-x:\s*auto/);
  });
}
