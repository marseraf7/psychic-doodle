'use strict';
// App (Capacitor – app/): trang web nằm trong máy (https://localhost, capacitor://localhost), nên gọi API bằng đường dẫn
// tương đối (fetch('/api/…')) là hỏi chính app → 404. Mọi lệnh fetch / sendBeacon tới /api/ trong caro/ phải có tiền tố
// máy chủ: window.CARO_SERVER (config.js), CaroOnline.base (online.js) hoặc biến base tương tự.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'caro');
// fetch('/api… · fetch("/api… · fetch(`/api… (không có tiền tố máy chủ đứng trước)
const BAD = /\b(fetch|sendBeacon)\s*\(\s*['"`]\/api\//;

test('caro/: không gọi /api/ bằng đường dẫn tương đối (hỏng trong app)', () => {
  const bad = [];
  for (const f of fs.readdirSync(ROOT).filter((n) => n.endsWith('.js'))) {
    fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').forEach((line, i) => { if (BAD.test(line)) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`); });
  }
  assert.deepStrictEqual(bad, [], 'dùng (window.CARO_SERVER || "") / CaroOnline.base làm tiền tố');
});

test('broadcast.html nạp config.js (CARO_SERVER) trước broadcast.js', () => {
  const html = fs.readFileSync(path.join(ROOT, 'broadcast.html'), 'utf8');
  const cfg = html.indexOf('src="config.js"'), bc = html.indexOf('src="broadcast.js"');
  assert.ok(cfg > 0 && cfg < bc);
});
