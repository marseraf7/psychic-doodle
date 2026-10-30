'use strict';
// Quy tắc (CLAUDE.md): giao diện không dùng confirm() / prompt() / alert() gốc của trình duyệt – trong trình duyệt
// nhúng (Zalo, Messenger…) chúng bị chặn hoặc tự đóng. Dùng window.CaroConfirm.ask / prompt / info (caro/confirm.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'caro');
// Gọi trần (không có dấu chấm đứng trước) hoặc qua window.
const CALL = /(^|[^.\w$])(confirm|prompt|alert)\s*\(|\bwindow\.(confirm|prompt|alert)\s*\(/;

/** Mọi file .js của giao diện (bỏ bài kiểm thử và thư viện ngoài trong rapfi/). */
function files(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['tests', 'rapfi', 'node_modules'].includes(e.name)) out.push(...files(p)); } else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('giao diện không dùng confirm() / prompt() / alert() gốc (dùng CaroConfirm)', () => {
  const bad = [];
  for (const f of files(ROOT)) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (/^\s*\*/.test(line) || !CALL.test(code)) return; // dòng chú thích
      bad.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepStrictEqual(bad, [], 'Thay bằng window.CaroConfirm.ask / prompt / info:\n' + bad.join('\n'));
});
