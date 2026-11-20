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

test('M-F5 (Issue #93): status độc từ máy chủ không chèn được HTML qua class của renderFriends', () => {
  const payload = '"><img src=x onerror=alert(1)>';
  const S = { me: { id: 'me1', guest: false }, friends: { friends: [{ id: 'x1', name: 'X', username: 'x', status: payload }], incoming: [], outgoing: [] }, invites: new Set() };
  const api = global.window.CaroOnlineFriends({ S, send: () => true, openDlg: () => {} });
  api.renderFriends();
  assert.ok(!el.innerHTML.includes('<img'), 'HTML dựng ra không chứa thẻ img chèn vào');
  assert.ok(!el.innerHTML.includes('class="st ">'), 'payload không phá vỡ được thuộc tính class');
  assert.ok(el.innerHTML.includes('&quot;&gt;&lt;img'), 'payload chỉ còn dạng đã thoát ký tự trong class');
});

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

test('M-F6: chữ gõ vào ô cũ đúng lúc panel vẽ lại (ô cũ đã bị gỡ) vẫn được trả về ở lần vẽ sau', () => {
  const S = { me: { id: 'me1', guest: false }, friends: { friends: [], incoming: [], outgoing: [] }, invites: new Set() };
  const api = global.window.CaroOnlineFriends({ S, send: () => true, openDlg: () => {} });
  api.renderFriends();
  el.currentInput.value = '';
  el.currentInput.oninput({ target: el.currentInput }); // bỏ chữ còn nhớ từ bài thử trước (bộ nhớ dùng chung của module)
  api.renderFriends();
  const old = el.currentInput;
  api.renderFriends(); // vẽ lại ngay trước khi chữ kịp vào ô
  // Chữ rơi vào ô cũ đã bị gỡ: oninput của ô cũ vẫn chạy (như Playwright fill / bàn phím đang gõ dở)
  old.value = 'nguoi_la_';
  old.oninput({ target: old });
  assert.strictEqual(el.currentInput.value, '', 'ô mới chưa có chữ (đây là lúc chữ bị mất trước khi sửa)');
  api.renderFriends(); // cập nhật hiện diện tiếp theo
  assert.strictEqual(el.currentInput.value, 'nguoi_la_', 'lần vẽ sau lấy lại chữ đã gõ');
  // Xoá chữ bằng tay rồi vẽ lại: không hồi sinh chữ đã xoá
  const cur = el.currentInput;
  cur.value = '';
  cur.oninput({ target: cur });
  api.renderFriends();
  assert.strictEqual(el.currentInput.value, '', 'chữ đã xoá không quay lại');
});
