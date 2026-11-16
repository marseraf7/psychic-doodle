'use strict';
// Quy tắc (CLAUDE.md): giao diện không dùng confirm() / prompt() / alert() gốc của trình duyệt – trong trình duyệt
// nhúng (Zalo, Messenger…) chúng bị chặn hoặc tự đóng. Dùng window.CaroConfirm.ask / prompt / info (caro/confirm.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'caro');
// Gọi trần (không có dấu chấm đứng trước) hoặc qua window.
// Bắt: gọi trần confirm( / prompt( / alert( (kể cả confirm?.( ), qua window. / globalThis. / self. / top., và dạng ['confirm']
const CALL = /(^|[^.\w$])(confirm|prompt|alert)\s*(\?\.)?\s*\(|\b(window|globalThis|self|top)\s*(\?\.|\.)\s*(confirm|prompt|alert)\b|\[\s*['"`](confirm|prompt|alert)['"`]\s*\]/;
/** Bỏ chú thích // ở cuối dòng – chỉ khi // đứng đầu dòng hoặc sau khoảng trắng (không cắt 'https://…' trong chuỗi). */
const stripComment = (line) => line.replace(/(^|\s)\/\/.*$/, '$1');

/** Mọi file .js của giao diện (bỏ bài kiểm thử và thư viện ngoài trong rapfi/). */
function files(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['tests', 'rapfi', 'node_modules'].includes(e.name)) out.push(...files(p)); } else if (e.name.endsWith('.js') || e.name.endsWith('.html')) out.push(p); // cả HTML (onclick="confirm(…)")
  }
  return out;
}

test('giao diện không dùng confirm() / prompt() / alert() gốc (dùng CaroConfirm)', () => {
  const bad = [];
  for (const f of files(ROOT)) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      const code = stripComment(line).replace(/<!--.*?-->/g, ''); // bỏ cả chú thích HTML trên một dòng
      if (/^\s*\*/.test(line) || !CALL.test(code)) return; // dòng chú thích
      bad.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepStrictEqual(bad, [], 'Thay bằng window.CaroConfirm.ask / prompt / info:\n' + bad.join('\n'));
});

test('bộ dò bắt được các dạng gọi hộp thoại gốc (và không báo nhầm CaroConfirm)', () => {
  const hit = (line) => CALL.test(stripComment(line));
  for (const line of [
    "if (confirm('Xoá?')) x();", 'const u = "https://a.b/c"; alert(1);', "window['confirm']('x')", 'globalThis.prompt("x")', 'confirm?.("x")',
    '<button onclick="confirm(\'x\')">', 'self.alert("x")', 'window?.alert("x")',
  ]) assert.ok(hit(line), 'phải bắt: ' + line);
  for (const line of [
    "await window.CaroConfirm.ask(T('x'))", 'CaroConfirm.prompt(T("x"), v)', 'x(); // confirm("cũ")', 'const confirmBtn = 1; showAlert(2);', "T('confirm_logout')",
  ]) assert.ok(!hit(line), 'không được báo nhầm: ' + line);
});
