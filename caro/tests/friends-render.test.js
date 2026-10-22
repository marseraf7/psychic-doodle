// Kiểm thử renderFriends (caro/online-friends.js) với DOM giả — hồi quy M-F6:
// render() chạy lại mỗi khi có tin bạn bè/hiện diện mới và dựng lại toàn bộ panel,
// gồm form thêm bạn — trước đây người dùng đang gõ tên là mất chữ và mất focus.
// Sau khi vá: nội dung đang gõ, focus và vùng chọn được giữ qua lần dựng lại.
// Chạy: node --test caro/tests/friends-render.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const doc = { activeElement: null };
function makeInput() {
  return {
    value: '', selectionStart: 0, selectionEnd: 0,
    focus() { doc.activeElement = this; },
    setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; },
  };
}
const el = {
  gen: 0, currentInput: null, currentForm: null, _html: '',
  set innerHTML(v) {
    this._html = v; this.gen++;
    this.currentInput = makeInput(); // trình duyệt tạo lại DOM: ô nhập mới tinh, rỗng
    const inp = this.currentInput;
    this.currentForm = { u: inp, onsubmit: null, reset() { inp.value = ''; } };
  },
  get innerHTML() { return this._html; },
  querySelector(sel) { return sel.includes('input') && this.gen ? this.currentInput : null; },
  querySelectorAll() { return []; },
};
const stubEl = () => ({ u: makeInput(), onsubmit: null, style: {}, classList: { add() {}, remove() {}, toggle() {} }, querySelector: () => null, querySelectorAll: () => [] });
doc.getElementById = (id) => (id === 'friends' ? el : id === 'add-friend' ? el.currentForm : stubEl());

global.window = {
  CaroApp: { esc },
  I18N: { t: (k) => k },
  CaroAvatar: { html: () => '' },
  CaroPlayerSearch: { attach: () => {} },
  CaroTimeCtl: { fromValue: () => null },
};
global.document = doc;
require('../online-friends.js');

test('M-F6: render lại panel bạn bè giữ nguyên nội dung đang gõ, focus và vùng chọn', () => {
  const S = { me: { id: 'me1', guest: false }, friends: { friends: [], incoming: [], outgoing: [] }, invites: new Set() };
  const api = global.window.CaroOnlineFriends({ S, send: () => true, openDlg: () => {} });
  api.renderFriends();
  const first = el.currentInput;
  assert.ok(first, 'form thêm bạn đã được dựng');
  first.value = 'nguyenv';
  first.focus();
  first.setSelectionRange(4, 4);

  api.renderFriends(); // một tin hiện diện mới về -> dựng lại toàn bộ panel
  const second = el.currentInput;
  assert.notStrictEqual(second, first, 'DOM được tạo mới như trình duyệt thật');
  assert.strictEqual(second.value, 'nguyenv', 'nội dung đang gõ phải còn nguyên');
  assert.strictEqual(doc.activeElement, second, 'focus phải trở lại ô nhập');
  assert.strictEqual(second.selectionStart, 4, 'vị trí con trỏ được giữ');
});
