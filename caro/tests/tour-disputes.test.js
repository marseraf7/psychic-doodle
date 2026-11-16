// Kiểm thử phía client của xử khiếu nại giải đấu (caro/tour-disputes.js) — đợt 7 rà soát code 16/11/2026.
// Chạy: node --test caro/tests/tour-disputes.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'tour-disputes.js'), 'utf8');

/** Nạp tour-disputes.js với CaroTourKit giả lập; buttons: các nút giả cho kiểm thử mục 48. */
function load(buttons = []) {
  const sent = [];
  const errHandlers = [];
  const K = {
    O: {
      send: (m) => { sent.push(m); return true; },
      on: (t, fn) => { if (t === 'error') errHandlers.push(fn); },
    },
    T: (k, args) => k + (args ? ':' + JSON.stringify(args) : ''),
    esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    D: { skew: 0, tour: { id: 'T1' } },
    icon: () => '',
    can: () => true,
    acts: {},
    // Mẫu đồng hồ đếm ngược của tour.js: span .cd có data-at + data-prefix, tick() cập nhật mỗi giây
    cd: (at, prefix) => `<span class="cd" data-at="${at}" data-prefix="${prefix}">${prefix}</span>`,
  };
  const sandbox = {
    window: { CaroTourKit: K, CaroConfirm: { ask: async () => true } },
    document: { querySelectorAll: (sel) => (sel.includes('dispute') ? buttons : []) },
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { K, sent, errHandlers };
}

const dispute = (i, extra = {}) => ({ id: 'd' + i, status: 'open', l: { name: 'A' + i }, w: { name: 'B' + i }, ...extra });
const tourOf = (disputes) => ({ disputes, status: 'running', canManage: true, format: 'bracket' });

test('mục 45: hiện đủ mọi khiếu nại máy chủ gửi (20), không cắt còn 10', () => {
  const { K } = load();
  const list = Array.from({ length: 20 }, (_, i) => dispute(i));
  const html = K.disputesHtml(tourOf(list));
  const rows = (html.match(/<li class="dispute /g) || []).length;
  assert.equal(rows, 20, 'phải vẽ đủ 20 dòng khiếu nại');
  // Huy hiệu đếm khớp số dòng nhìn thấy được
  assert.ok(html.includes('<span class="count">20</span>'));
  // Khiếu nại cũ nhất (cuối danh sách máy chủ gửi, mới nhất trước) vẫn có nút xử lý
  assert.ok(html.includes('data-did="d19"'), 'khiếu nại cũ nhất phải có dòng + nút xử lý');
});

test('mục 46: hạn tự công nhận là đồng hồ .cd sống (data-at = deadline), không phải chữ tĩnh', () => {
  const { K } = load();
  const deadline = Date.now() + 5 * 60000;
  const html = K.disputesHtml(tourOf([dispute(1, { deadline })]));
  assert.ok(html.includes(`<span class="cd" data-at="${deadline}" data-prefix="dispute_auto_in_t">`),
    'phần chờ phải là span .cd để tick() của tour.js đếm ngược mỗi giây');
  // Khiếu nại Arena không có deadline: không hiện đồng hồ
  const html2 = K.disputesHtml(tourOf([dispute(2)]));
  assert.ok(!html2.includes('class="cd"'), 'không deadline thì không đồng hồ');
});

test('mục 45: danh sách ngắn vẫn vẽ bình thường, rỗng thì không khối', () => {
  const { K } = load();
  const html = K.disputesHtml(tourOf([dispute(1), dispute(2)]));
  assert.equal((html.match(/<li class="dispute /g) || []).length, 2);
  assert.equal(K.disputesHtml(tourOf([])), '');
});
