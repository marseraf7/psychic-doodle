// Nguồn người chơi gửi kèm hello (caro/src-track.js). Chạy: node --test caro/tests/src-track.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('../src-track.js');

test('src-track: CARO_SRC hợp lệ thắng; app / desktop / trang nhúng / PWA / web', () => {
  assert.strictEqual(S.detect({ given: 'telegram', native: true }), 'telegram');
  assert.strictEqual(S.detect({ given: 'evil' }), 'web', 'giá trị lạ bỏ qua');
  assert.strictEqual(S.detect({ desktop: true, native: true }), 'desktop');
  assert.strictEqual(S.detect({ native: true }), 'app');
  assert.strictEqual(S.detect({ path: '/embed.html' }), 'embed');
  assert.strictEqual(S.detect({ standalone: true, path: '/' }), 'pwa');
  assert.strictEqual(S.detect({}), 'web');
});

test('src-track: ref chỉ lấy ở lần mở đầu, làm sạch, ≤ 24 ký tự', () => {
  assert.strictEqual(S.firstRef('?ref=FB_Group-1', true), 'fb_group-1');
  assert.strictEqual(S.firstRef('?utm_source=Tik%20Tok!<x>', true), 'tiktokx');
  assert.strictEqual(S.firstRef('?ref=a&utm_source=b', true), 'a');
  assert.strictEqual(S.firstRef('?ref=' + 'x'.repeat(40), true).length, 24);
  assert.strictEqual(S.firstRef('?ref=fb', false), '', 'không phải lần đầu');
  assert.strictEqual(S.cleanRef(5), '');
});

test('src-track: trên trình duyệt – lần đầu ghi caro.ref (kể cả rỗng), lần sau giữ; hello() có src + ref', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src-track.js'), 'utf8');
  const run = (store, search, extra = {}) => {
    const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
    const win = { localStorage: ls, location: { search, pathname: '/' }, navigator: {}, matchMedia: () => ({ matches: false }), ...extra };
    vm.runInNewContext(src, { window: win, URLSearchParams });
    return win.CaroSrc;
  };
  const store = {};
  assert.deepStrictEqual({ ...run(store, '?ref=zalo_oa').hello() }, { src: 'web', ref: 'zalo_oa' });
  assert.strictEqual(store['caro.ref'], 'zalo_oa');
  store['caro.guestKey'] = 'k';
  assert.strictEqual(run(store, '?ref=other').ref(), 'zalo_oa', 'lần sau giữ ref đầu');
  const old = { 'caro.token': 't' };
  assert.deepStrictEqual({ ...run(old, '?ref=fb').hello() }, { src: 'web', ref: null }, 'người cũ (đã có dữ liệu): không gán ref mới');
  assert.strictEqual(old['caro.ref'], undefined);
  assert.strictEqual(run({}, '', { CARO_SRC: 'vk' }).src(), 'vk');
  assert.strictEqual(run({}, '', { matchMedia: (q) => ({ matches: /standalone/.test(q) }) }).src(), 'pwa');
  const broken = { getItem() { throw new Error('riêng tư'); } };
  const win = { localStorage: broken, location: { search: '?ref=x', pathname: '/' }, navigator: {} };
  vm.runInNewContext(src, { window: win, URLSearchParams });
  assert.strictEqual(win.CaroSrc.ref(), 'x', 'không đọc được bộ nhớ: vẫn chạy');
});
