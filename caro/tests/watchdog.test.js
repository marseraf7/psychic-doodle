// Kiểm thử canh khởi động (caro/watchdog.js) và meta CSP tĩnh — hồi quy:
// M-F3 (một phần): trước đây một file bị chặn/mạng rất chậm khiến trang đứng im không
//   một lời giải thích. Watchdog nạp đầu tiên: sau 15 giây chưa khởi động xong thì
//   hiện thông báo kèm nút tải lại; đã khởi động xong thì không quấy rầy.
// M-F4: index.html (và privacy.html, licenses.html) phải mang meta CSP sao đúng chính
//   sách của máy chủ Node — nơi host tĩnh (GitHub Pages...) không đặt được header vẫn
//   có CSP; chỉ thị đổi ở máy chủ mà quên ở meta sẽ làm bài này đỏ nhắc đồng bộ.
// Chạy: node --test caro/tests/watchdog.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

function makePage() {
  const created = [];
  const doc = {
    body: { children: [], appendChild(el) { this.children.push(el); } },
    getElementById: (id) => created.find((e) => e.id === id) || null,
    createElement(tag) {
      const el = { tag, id: '', children: [], listeners: {}, setAttribute() {}, appendChild(c) { this.children.push(c); }, addEventListener(k, f) { this.listeners[k] = f; } };
      created.push(el);
      return el;
    },
  };
  const sandbox = { console, document: doc, location: { reload() { sandbox.reloaded = true; } }, reloaded: false };
  sandbox.window = sandbox;
  sandbox.setTimeout = (fn, ms) => { sandbox.timer = { fn, ms }; return 1; };
  vm.runInNewContext(fs.readFileSync(__dirname + '/../watchdog.js', 'utf8'), sandbox);
  return { sandbox, doc };
}

test('M-F3: quá 15 giây chưa khởi động xong thì hiện thông báo lỗi kèm nút tải lại', () => {
  const { sandbox, doc } = makePage();
  assert.strictEqual(sandbox.timer.ms, 15000);
  sandbox.timer.fn();
  const box = doc.body.children.find((e) => e.id === 'boot-fail');
  assert.ok(box, 'hộp thông báo lỗi khởi động phải xuất hiện');
  const btn = box.children.find((e) => e.tag === 'button');
  assert.ok(btn && btn.listeners.click, 'có nút bấm tải lại');
  btn.listeners.click();
  assert.strictEqual(sandbox.reloaded, true, 'bấm nút là tải lại trang');
});

test('M-F3: đã khởi động xong (cờ hoặc vỏ hiện) thì watchdog không hiện gì', () => {
  const a = makePage();
  a.sandbox.__caroBooted = true;
  a.sandbox.timer.fn();
  assert.strictEqual(a.doc.body.children.length, 0);
  const b = makePage();
  b.sandbox.CaroShell = { visible: true };
  b.sandbox.timer.fn();
  assert.strictEqual(b.doc.body.children.length, 0);
});

test('M-F4: cả ba trang HTML đều có meta CSP khớp các chỉ thị chính của máy chủ', () => {
  for (const f of ['index.html', 'privacy.html', 'licenses.html']) {
    const html = fs.readFileSync(__dirname + '/../' + f, 'utf8');
    const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
    assert.ok(m, f + ' phải có meta CSP');
    for (const dir of ["default-src 'self'", "'wasm-unsafe-eval'", 'https://accounts.google.com/gsi/client', 'https://cdn.jsdelivr.net', "object-src 'none'"]) {
      assert.ok(m[1].includes(dir), f + ' thiếu chỉ thị: ' + dir);
    }
  }
});
