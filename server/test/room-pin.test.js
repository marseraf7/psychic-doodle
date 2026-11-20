/*
 * I-4 (rà soát bảo mật 20/11/2026): mật khẩu phòng riêng 4 chữ số (10.000 khả năng, trước 3 số); ROOM_PIN_DIGITS=3 tạm
 * quay về 3 số cho app điện thoại bản cũ. Ô nhập ở caro/index.html nhận cả 3 lẫn 4 số.
 * Chạy: npm test
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { roomPin } = require('../src/hub/rooms.js');

test('roomPin: mặc định 4 số, đủ dải 0000–9999 (có số 0 đầu)', () => {
  const saved = process.env.ROOM_PIN_DIGITS;
  delete process.env.ROOM_PIN_DIGITS;
  try {
    const seen = new Set();
    for (let i = 0; i < 3000; i++) { const p = roomPin(); assert.match(p, /^\d{4}$/); seen.add(p); }
    assert.ok(seen.size > 2000, 'phân bố rộng, không lặp lại vài giá trị');
    assert.ok([...seen].some((p) => p.startsWith('0')), 'giữ số 0 đầu');
    process.env.ROOM_PIN_DIGITS = '3';
    assert.match(roomPin(), /^\d{3}$/);
    process.env.ROOM_PIN_DIGITS = '7'; // giá trị lạ: về mặc định
    assert.match(roomPin(), /^\d{4}$/);
  } finally { if (saved === undefined) delete process.env.ROOM_PIN_DIGITS; else process.env.ROOM_PIN_DIGITS = saved; }
});

test('ô mật khẩu phòng ở trang chính nhận 3–4 số', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'caro', 'index.html'), 'utf8');
  const form = /<form class="dlg" id="join-form">[\s\S]*?<\/form>/.exec(html)[0];
  const input = /<input name="password"[^>]*>/.exec(form)[0];
  assert.match(input, /pattern="\\d\{3,4\}"/);
  assert.match(input, /maxlength="4"/);
});
