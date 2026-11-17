// Kiểm thử kho tiến độ Học (caro/learn.js) — đợt 7 rà soát code 16/11/2026, mục 51.
// Chạy: node --test caro/tests/learn.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'learn.js'), 'utf8');
const DEMOS = fs.readFileSync(path.join(__dirname, '..', 'learn-demos.js'), 'utf8'); // dữ liệu thuần, learn.js cần lúc nạp

/** Phần tử DOM giả: mọi thuộc tính gán được, mọi hàm gọi được. */
function fakeEl() {
  const el = {
    children: [], style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    textContent: '', innerHTML: '', hidden: false, disabled: false, open: false,
    addEventListener() {}, removeEventListener() {}, querySelector: () => fakeEl(), querySelectorAll: () => [],
    appendChild() {}, click() {}, close() {}, showModal() {},
  };
  return el;
}

function load(storeValue) {
  const store = new Map();
  if (storeValue !== undefined) store.set('caro.learn', storeValue);
  const sandbox = {
    window: {
      I18N: { t: (k, a) => k + (a ? ':' + JSON.stringify(a) : '') },
      Caro: require('../rules.js'),
      CaroAnalysis: {},
      CaroApp: { esc: (s) => String(s) },
      CaroOnline: { openDlg() {}, closeDlg() {}, isOpen: () => false },
      CaroLearnBoard: { stop() {}, build() {} },
      addEventListener() {},
      dispatchEvent() {},
    },
    document: {
      getElementById: () => fakeEl(),
      querySelectorAll: () => [],
      querySelector: () => fakeEl(),
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    navigator: { webdriver: true }, // như kiểm thử tự động: welcome() tự bỏ qua
    location: { search: '' },
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(DEMOS, sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox.window.CaroLearn;
}

test('mục 51: kho caro.learn là JSON hợp lệ nhưng không phải object → doneCount không crash, coi như rỗng', () => {
  for (const bad of ['null', '5', '"chuỗi"', '[1,2]', 'true']) {
    const L = load(bad);
    assert.equal(L.doneCount(), 0, `kho = ${bad}: doneCount phải là 0 thay vì ném TypeError`);
  }
});

test('mục 51: kho rỗng / object đúng vẫn chạy như cũ', () => {
  assert.equal(load(undefined).doneCount(), 0);
  assert.equal(load('{}').doneCount(), 0);
  assert.equal(load('{"done":["five","blocked"]}').doneCount(), 2);
  assert.equal(load('{hỏng').doneCount(), 0); // JSON hỏng: đường cũ đã cứu
});
