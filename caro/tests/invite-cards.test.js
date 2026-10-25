// Kiểm thử thẻ lời mời nổi (caro/online-friends.js renderInvites):
// - Thẻ chờ không nhấp nháy: ticker mỗi giây chỉ cập nhật chữ đồng hồ, không vẽ lại thẻ
//   (hồi quy: trước đây ticker vẽ lại innerHTML mỗi giây nên animation pop chạy lại).
// - Thu gọn (−) thành bong bóng đếm ngược, bấm bong bóng khôi phục lại thẻ.
// - Tắt (×) chỉ xóa thẻ nổi, KHÔNG gửi từ chối.
// Chạy: node --test caro/tests/invite-cards.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'online-friends.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// DOM giả tối thiểu: innerHTML setter dựng lại chỉ mục các nút/span theo data-*,
// giống trình duyệt ở chỗ gán innerHTML tạo ra DOM mới (gen tăng, node cũ mất).
function parse(html) {
  const idx = { invClocks: [], mins: [], dismisses: [], restores: [], yeses: [], noes: [], cancels: [] };
  const m = html.match(/<span data-sent-clock>([^<]*)<\/span>/);
  if (m) idx.sentClock = { textContent: m[1] };
  for (const mm of html.matchAll(/<span data-inv-clock="([^"]+)">([^<]*)<\/span>/g))
    idx.invClocks.push({ dataset: { invClock: mm[1] }, textContent: mm[2] });
  for (const mm of html.matchAll(/<button[^>]*data-min="([^"]+)"[^>]*>/g))
    idx.mins.push({ dataset: { min: mm[1] }, onclick: null });
  for (const mm of html.matchAll(/<button[^>]*data-dismiss="([^"]+)"[^>]*>/g))
    idx.dismisses.push({ dataset: { dismiss: mm[1] }, onclick: null });
  for (const mm of html.matchAll(/<button[^>]*data-restore="([^"]+)"[^>]*>/g))
    idx.restores.push({ dataset: { restore: mm[1] }, onclick: null });
  for (const mm of html.matchAll(/<button[^>]*data-yes="([^"]+)"[^>]*>/g))
    idx.yeses.push({ dataset: { yes: mm[1] }, onclick: null });
  for (const mm of html.matchAll(/<button[^>]*data-no="([^"]+)"[^>]*>/g))
    idx.noes.push({ dataset: { no: mm[1] }, onclick: null });
  for (const mm of html.matchAll(/<button[^>]*data-cancel-sent[^>]*>/g))
    idx.cancels.push({ dataset: {}, onclick: null });
  return idx;
}

function fakeBox() {
  const el = {
    _html: '', gen: 0, index: parse(''),
    set innerHTML(v) { this._html = v; this.gen++; this.index = parse(v); },
    get innerHTML() { return this._html; },
    querySelector(sel) {
      if (sel === '[data-sent-clock]') return this.index.sentClock || null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '[data-inv-clock]') return this.index.invClocks;
      if (sel === '[data-min]') return this.index.mins;
      if (sel === '[data-dismiss]') return this.index.dismisses;
      if (sel === '[data-restore]') return this.index.restores;
      if (sel === '[data-yes]') return this.index.yeses;
      if (sel === '[data-no]') return this.index.noes;
      if (sel === '[data-cancel-sent]') return this.index.cancels;
      return [];
    },
  };
  return el;
}

function stubEl() {
  return { style: {}, classList: { add() {}, remove() {}, toggle() {} }, querySelector: () => null, querySelectorAll: () => [] };
}

function load() {
  const box = fakeBox();
  const inner = fakeBox();
  inner.hidden = true;
  const S = { me: { id: 'u_b' }, invites: new Map(), sent: null, room: null };
  const sent = [];
  const sandbox = {
    setInterval,
    clearInterval,
    window: {
      CaroApp: { esc: (s) => String(s).replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) },
      I18N: {
        t: (k) => k,
        tc: () => 'tc',
      },
      CaroTimeCtl: { fromValue: () => null },
    },
    document: {
      readyState: 'complete',
      addEventListener: () => {},
      getElementById: (id) => (id === 'invites' ? box : id === 'dlg-invites' ? inner : stubEl()),
      createElement: () => fakeBox(),
      body: { appendChild: () => {} },
    },
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  const ctx = { S, send: (m) => sent.push(m), openDlg: () => {}, roomActive: () => false, render: () => {} };
  const api = sandbox.window.CaroOnlineFriends(ctx);
  return { api, box, inner, S, sent };
}

test('thẻ chờ: ticker chỉ cập nhật chữ đồng hồ, không vẽ lại thẻ (hết nhấp nháy)', async () => {
  const { api, box, S } = load();
  try {
    S.sent = { id: 's1', to: { name: 'A' }, first: 'me', bestOf: 1, sentAt: Date.now() - 55000 };
    api.renderInvites();
    assert.equal(box.gen, 1);
    const clockBefore = box.index.sentClock.textContent;
    assert.match(clockBefore, /⏳ 4:0\d/);
    assert.match(box._html, /invite invite-right/);
    const spanBefore = box.querySelector('[data-sent-clock]');
    S.sent.sentAt -= 5000; // giả lập 5 giây trôi qua, không vẽ lại
    await sleep(1150); // ticker 1 giây chạy 1 lần
    assert.equal(box.gen, 1, 'ticker không được vẽ lại thẻ');
    assert.equal(box.querySelector('[data-sent-clock]'), spanBefore, 'cùng một node span');
    assert.notEqual(box.index.sentClock.textContent, clockBefore, 'chữ đồng hồ đã đổi');
  } finally {
    // Dọn ticker để tiến trình thoát (kể cả khi assert giữa chừng lỗi).
    S.sent = null;
    api.renderInvites();
  }
});

test('hết giờ lời gửi: ticker tự hủy + vẽ lại, thẻ biến mất', async () => {
  const { api, box, S, sent } = load();
  try {
    S.sent = { id: 's1', to: { name: 'A' }, first: 'me', bestOf: 1, sentAt: Date.now() - 300000 };
    api.renderInvites();
    const genBefore = box.gen;
    await sleep(1150);
    assert.equal(S.sent, null);
    assert.ok(sent.some((m) => m.t === 'challengeCancel' && m.id === 's1'));
    assert.ok(box.gen > genBefore, 'đổi trạng thái thì vẽ lại');
    assert.equal(box.querySelector('[data-sent-clock]'), null);
  } finally {
    S.sent = null;
    S.invites.clear();
    api.renderInvites();
  }
});

test('thẻ nhận hiện đầy đủ vẫn có đồng hồ đếm ngược 5 phút', () => {
  const { api, box, S } = load();
  try {
    S.invites.set('i1', { id: 'i1', from: { name: 'A' }, first: 'me', bestOf: 1 });
    api.renderInvites();
    assert.equal(box.index.invClocks.length, 1, 'thẻ nhận đầy đủ có 1 span đồng hồ');
    assert.match(box.index.invClocks[0].textContent, /⏳ 5:00|⏳ 4:5\d/);
  } finally {
    S.invites.clear(); // dọn ticker (còn lời mời thì ticker vẫn chạy)
    api.renderInvites();
  }
});

test('thu gọn: bấm − thành bong bóng đếm ngược, bấm bong bóng khôi phục lại thẻ', () => {
  const { api, box, inner, S } = load();
  try {
    S.invites.set('i1', { id: 'i1', from: { name: 'A' }, first: 'me', bestOf: 1 });
    api.renderInvites();
    assert.equal(box.index.mins.length, 1);
    assert.equal(box.index.restores.length, 0);
    assert.match(box._html, /invite invite-right has-ctl/);
    assert.doesNotMatch(inner._html, /data-min/, 'bản trong hộp thoại không có nút góc');
    box.index.mins[0].onclick();
    assert.equal(box.index.restores.length, 1);
    assert.equal(box.index.mins.length, 0);
    assert.match(box.index.invClocks[0].textContent, /⏳ 5:00|⏳ 4:5\d/);
    assert.match(inner._html, /data-yes/, 'thu gọn thẻ nổi nhưng hộp thoại vẫn nhận được');
    box.index.restores[0].onclick();
    assert.equal(box.index.mins.length, 1);
    assert.equal(box.index.restores.length, 0);
  } finally {
    S.invites.clear();
    api.renderInvites();
  }
});

test('tắt thẻ: bấm × chỉ ẩn thẻ nổi, lời mời vẫn còn và nhận được ở nơi khác', () => {
  const { api, box, inner, S, sent } = load();
  try {
    S.invites.set('i1', { id: 'i1', from: { name: 'A' }, first: 'me', bestOf: 1 });
    api.renderInvites();
    box.index.dismisses[0].onclick();
    assert.equal(S.invites.size, 1, 'không xóa lời mời khỏi S.invites (thẻ chat kiểm tra nó)');
    assert.equal(sent.filter((m) => m.t === 'challengeRespond').length, 0, 'không gửi challengeRespond');
    assert.doesNotMatch(box._html, /data-yes/, 'thẻ nổi biến mất');
    assert.match(inner._html, /data-yes/, 'hộp thoại Online vẫn nhận được');
    api.renderInvites(); // vẽ lại vẫn ẩn (trạng thái tắt được giữ)
    assert.doesNotMatch(box._html, /data-yes/);
  } finally {
    S.invites.clear();
    api.renderInvites();
  }
});
