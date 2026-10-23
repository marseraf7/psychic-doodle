// Kiểm thử canh khởi động (caro/watchdog.js) – hồi quy M-F3 (một phần): trước đây một file bị chặn / lỗi khiến trang đứng
// im không một lời giải thích. Watchdog nạp đầu tiên: trang nạp xong mà chưa khởi động (thiếu cờ __caroBooted) hoặc quá 60
// giây thì hiện thông báo kèm nút tải lại (đủ 4 ngôn ngữ); đã khởi động xong thì không quấy rầy.
// Chạy: node --test caro/tests/watchdog.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

function makePage(lang) {
  const created = [];
  const doc = {
    body: { children: [], appendChild(el) { this.children.push(el); } },
    getElementById: (id) => created.find((e) => e.id === id) || null,
    createElement(tag) {
      const el = { tag, id: '', textContent: '', children: [], listeners: {}, setAttribute() {}, appendChild(c) { this.children.push(c); }, addEventListener(k, f) { this.listeners[k] = f; } };
      created.push(el);
      return el;
    },
  };
  const timers = [];
  const listeners = {};
  const sandbox = {
    console, document: doc, reloaded: false, navigator: { language: 'en-US' },
    location: { reload() { sandbox.reloaded = true; } },
    localStorage: { getItem: (k) => (k === 'caro.lang' ? lang || null : null) },
    addEventListener: (k, f) => { listeners[k] = f; },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(__dirname + '/../watchdog.js', 'utf8'), sandbox);
  const fire = () => { listeners.load(); timers.filter((t) => t.ms === 0).forEach((t) => t.fn()); };
  const slow = () => timers.find((t) => t.ms === 60000).fn();
  const box = () => doc.body.children.find((e) => e.id === 'boot-fail');
  return { sandbox, fire, slow, box };
}

test('M-F3: trang nạp xong mà chưa khởi động (script hỏng / bị chặn) → thông báo + nút tải lại', () => {
  const p = makePage('vi');
  p.fire();
  const b = p.box();
  assert.ok(b, 'hộp thông báo phải xuất hiện');
  assert.match(b.children[0].textContent, /Không tải được/);
  const btn = b.children.find((e) => e.tag === 'button');
  btn.listeners.click();
  assert.strictEqual(p.sandbox.reloaded, true, 'bấm nút là tải lại trang');
});

test('M-F3: đã khởi động xong thì không hiện gì (kể cả khi quá 60 giây)', () => {
  const p = makePage('vi');
  p.sandbox.__caroBooted = true;
  p.fire();
  p.slow();
  assert.strictEqual(p.box(), undefined);
});

test('M-F3: mạng chậm – chưa nạp xong thì chỉ báo sau 60 giây (không báo nhầm lúc đang tải)', () => {
  const p = makePage('vi');
  assert.strictEqual(p.box(), undefined, 'chưa load, chưa hết 60 giây: không báo');
  p.slow();
  assert.ok(p.box(), 'quá 60 giây: báo');
});

test('M-F3: chữ theo ngôn ngữ đã chọn, đủ 4 ngôn ngữ; không chọn thì theo trình duyệt', () => {
  const want = { vi: /Tải lại/, en: /Reload/, ru: /Обновить/, zh: /重新加载/ };
  for (const [l, re] of Object.entries(want)) {
    const p = makePage(l);
    p.fire();
    assert.match(p.box().children[1].textContent, re, l);
  }
  const p = makePage(null); // navigator.language = en-US
  p.fire();
  assert.match(p.box().children[1].textContent, /Reload/);
});
