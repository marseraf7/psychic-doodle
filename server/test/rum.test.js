/*
 * Số đo tốc độ từ máy người chơi (src/rum.js – bước 2 "đo thực địa"): xếp loại trình duyệt, chỉ nhận số hợp lệ, gộp
 * p50 / p75 / p95 theo loại (+ bản gộp), giới hạn mỗi IP, không giữ User-Agent.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('events');
const { Rum, kindOf } = require('../src/rum.js');

const UA = {
  zalo: 'Mozilla/5.0 (Linux; Android 13; SM-A245F Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 Zalo android/12100735 ZaloTheme/light',
  messenger: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/480.0]',
  facebook: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/490.0;]',
  webview: 'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36',
  chrome: 'Mozilla/5.0 (Linux; Android 14; SM-A245F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  edge: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0',
};

test('xếp loại trình duyệt: trình duyệt trong app trước trình duyệt thường; app riêng theo cờ app', () => {
  for (const [k, ua] of Object.entries(UA)) assert.strictEqual(kindOf(ua), k, k);
  assert.strictEqual(kindOf(UA.chrome, true), 'app');
  assert.strictEqual(kindOf(''), 'other');
});

test('gộp p50 / p75 / p95 theo loại và bản gộp; bỏ số vô lý; không giữ User-Agent', () => {
  const r = new Rum();
  for (let i = 1; i <= 100; i++) assert.ok(r.add({ fcp: i * 10, inp: i, cls: 0.05, bundle: true }, UA.zalo));
  assert.ok(r.add({ fcp: 500 }, UA.chrome));
  assert.strictEqual(r.add({ fcp: -5, inp: 'x', dcl: 1e9 }, UA.chrome), false, 'không có số hợp lệ');
  assert.strictEqual(r.add(null, UA.chrome), false);
  const s = r.summary();
  assert.deepStrictEqual(Object.keys(s.kinds), ['zalo+b', 'chrome']);
  assert.deepStrictEqual(s.kinds['zalo+b'].fcp, { p50: 510, p75: 760, p95: 960, n: 100 });
  assert.strictEqual(s.kinds['zalo+b'].cls.p75, 0.05);
  assert.strictEqual(s.kinds.chrome.n, 1);
  assert.ok(!JSON.stringify(s).includes('Zalo android'), 'không lưu chuỗi User-Agent');
});

test('/api/rum: POST nhận số (204), GET trả bảng gộp, quá 30 lần / phút thì 429, thân quá lớn thì 413', async () => {
  const r = new Rum();
  const call = (method, body, ip = '1.2.3.4') => new Promise((done) => {
    const req = Object.assign(new EventEmitter(), { method, headers: { 'user-agent': UA.messenger }, resume() {}, destroy() {} });
    const res = { status: 0, body: '', writeHead(s) { this.status = s; }, end(b) { this.body = b ? String(b) : ''; done(this); } };
    assert.ok(r.handle(req, res, '/api/rum', ip));
    if (method === 'POST') { req.emit('data', Buffer.from(body)); req.emit('end'); }
  });
  assert.strictEqual((await call('POST', JSON.stringify({ dcl: 1500, bundle: true }))).status, 204);
  assert.strictEqual((await call('POST', '{không phải json')).status, 400);
  const g = await call('GET');
  assert.strictEqual(JSON.parse(g.body).kinds['messenger+b'].dcl.p50, 1500);
  assert.strictEqual((await call('POST', 'x'.repeat(5000), '9.9.9.9')).status, 413);
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await call('POST', '{"fcp":1}', '5.5.5.5')).status;
  assert.strictEqual(last, 429);
  assert.strictEqual(r.handle({ method: 'GET' }, {}, '/api/khac', '1.1.1.1'), false, 'đường khác: không xử lý');
});
