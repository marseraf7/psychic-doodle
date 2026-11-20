// Phòng thủ chiều sâu cho đính kèm trận (rà soát bảo mật 20/11/2026, mục 4.1.1): attHtml() trong caro/tour-match-extra.js
// chỉ đặt link http(s) vào href (cùng LINK_RE của caro/rich-text.js); javascript: / data: / mailto: … hiện thành chữ thường.
// Máy chủ vốn đã chặn (server/src/hub/tour-opts.js) – đây là lớp thứ hai nếu dữ liệu cũ / lỗi máy chủ để lọt.
// Chạy: node --test caro/tests/match-att.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function load() {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const K = { O: { send() {}, on() {} }, T: (k) => k, esc, D: {}, icon: () => '', me: () => ({ uid: 'u1' }), when: () => 'lúc', acts: {}, binders: [] };
  const sandbox = { document: { addEventListener() {} }, console };
  sandbox.window = { CaroTourKit: K, I18N: { t: (k) => k } };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(read('rich-text.js'), sandbox);
  sandbox.window.CaroRich = sandbox.window.CaroRich || sandbox.CaroRich;
  vm.runInContext(read('tour-match-extra.js'), sandbox);
  return { K, R: sandbox.window.CaroRich };
}

test('CaroRich.isHttpLink: chỉ http(s) hợp lệ', () => {
  const { R } = load();
  for (const u of ['https://youtu.be/abc', 'http://x.vn/a?b=1#c', 'HTTPS://X.COM']) assert.strictEqual(R.isHttpLink(u), true, u);
  for (const u of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>', 'mailto:a@b.c', 'https://a b', '//evil.com', 'ftp://x', '', null, 5])
    assert.strictEqual(R.isHttpLink(u), false, String(u));
});

test('attHtml: link http(s) thành <a href>; scheme lạ hiện chữ thường, không có href', () => {
  const { K } = load();
  const t = { canManage: false, attachments: true };
  const m = { id: 'm1', a: { uid: 'u1', name: 'A' }, b: { uid: 'u2', name: 'B' }, att: [
    { id: '1', url: 'https://youtu.be/x', name: 'A', at: 1, by: 'u1' },
    { id: '2', url: 'javascript:alert(document.cookie)', name: 'B', at: 1, by: 'u2' },
    { id: '3', url: 'data:text/html,<script>alert(1)</script>', name: 'B', at: 1, by: 'u2' },
  ] };
  const html = K.matchAttHtml(t, { m, label: 'R1' });
  assert.match(html, /<a href="https:\/\/youtu\.be\/x" target="_blank" rel="noopener noreferrer nofollow ugc">/);
  assert.ok(!/href="(javascript|data):/i.test(html), 'không href nào mang scheme nguy hiểm');
  assert.match(html, /<span>javascript:alert\(document.cookie\)<\/span>/);
  assert.ok(!html.includes('<script>'), 'nội dung được thoát HTML');
  assert.strictEqual((html.match(/href=/g) || []).length, 1);
});
