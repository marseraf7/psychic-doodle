// Đồng bộ tiến độ trên máy ↔ tài khoản (caro/progress-sync.js – A5), chạy trong vm với CaroOnline giả:
// máy dùng chung – tiến độ của tài khoản A còn trên máy không được trộn vào tài khoản B khi B đăng nhập.
//   node --test caro/tests/progress-sync.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../progress-merge.js');

function boot(ls) {
  const handlers = {}, sent = [];
  const N = { connected: true, state: { me: null }, on: (t, f) => { (handlers[t] = handlers[t] || []).push(f); }, send: (m) => sent.push(m) };
  const localStorage = { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } };
  const timers = [];
  let clock = 1e12; // đồng hồ giả: mỗi lần chạy hẹn giờ tiến 3 giây (không phải chờ giới hạn 2,5 giây / lần gửi thật)
  const win = { CaroProgress: P, CaroOnline: N, dispatchEvent: () => {}, Event: class { constructor(t) { this.type = t; } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'progress-sync.js'), 'utf8'), {
    window: win, localStorage, Event: win.Event, Date: { now: () => clock }, JSON,
    setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout: () => {},
  });
  const login = (uid) => {
    N.state.me = { uid, guest: false };
    for (const f of handlers.welcome || []) f({});
    while (timers.length) { clock += 3000; timers.shift()(); }
  };
  const reply = (data) => { for (const f of handlers.progress || []) f({ t: 'progress', data }); };
  return { sent, login, reply };
}

test('máy chưa gắn tài khoản: gửi tiến độ trên máy để gộp; trả lời xong thì gắn với tài khoản đó', () => {
  const ls = { 'caro.puzzles': JSON.stringify({ r: 1300, n: 40, ok: 20 }) };
  const s = boot(ls);
  s.login('A');
  assert.strictEqual(s.sent.length, 1);
  assert.strictEqual(s.sent[0].data.pz.n, 40, 'gửi bản trên máy');
  s.reply(P.merge({}, s.sent[0].data));
  assert.strictEqual(ls['caro.progressOwner'], 'A');
});

test('máy đã gắn tài khoản A, B đăng nhập: không gửi tiến độ của A lên B, thay bằng bản của B', () => {
  const habits = { days: ['2026-11-18'], best: 1, games: 50, earned: { first_game: '2026-11-18', beat_boat: '2026-11-18' } };
  const ls = { 'caro.progressOwner': 'A', 'caro.puzzles': JSON.stringify({ r: 1900, n: 400, ok: 300 }), 'caro.habits': JSON.stringify(habits) };
  const s = boot(ls);
  s.login('B');
  assert.strictEqual(s.sent.length, 1);
  assert.strictEqual(Object.keys(s.sent[0].data).length, 0, 'chỉ xin bản của B');
  const mineB = P.clean({ pz: { r: 1100, n: 5, ok: 2 }, habits: { days: ['2026-11-20'], games: 2 } });
  s.reply(mineB);
  assert.strictEqual(JSON.parse(ls['caro.puzzles']).n, 5, 'trên máy giờ là tiến độ của B');
  assert.strictEqual(Object.keys(JSON.parse(ls['caro.habits']).earned).length, 0, 'huy hiệu của A không sang B');
  assert.strictEqual(ls['caro.progressOwner'], 'B');
  // Lần sau (vẫn B): gộp như thường
  s.login('B');
  assert.strictEqual(s.sent.at(-1).data.pz.n, 5);
});

test('thang nhân vật máy (caro.ladder) đi cùng tiến độ: máy chưa gắn thì gửi lên; máy của A thì không trộn vào B', () => {
  const ls = { 'caro.ladder': JSON.stringify({ r: { vn: 7 }, at: 5 }) };
  const s = boot(ls);
  s.login('A');
  assert.deepStrictEqual(s.sent[0].data.ladder, { r: { vn: 7 }, at: 5 }, 'gửi thang trên máy');
  s.reply(P.merge(s.sent[0].data, { ladder: { r: { free: 2 }, at: 9 } }));
  assert.deepStrictEqual(JSON.parse(ls['caro.ladder']).r, { vn: 7, free: 2 }, 'gộp thang từ tài khoản');
  // B đăng nhập trên máy của A: thang của A không lên B, máy nhận thang của B
  s.login('B');
  assert.strictEqual(Object.keys(s.sent.at(-1).data).length, 0);
  s.reply(P.clean({ ladder: { r: { renju: 1 }, at: 3 } }));
  assert.deepStrictEqual(JSON.parse(ls['caro.ladder']).r, { renju: 1 }, 'trên máy giờ là thang của B');
});
