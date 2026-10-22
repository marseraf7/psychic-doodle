// Hồi quy L-F6 + L-S1 (báo cáo review trước phát hành):
//  L-F6: máy khách lỡ tin trạng thái phòng (đồng hồ online đứng ở 0:00) hỏi lại bằng syncRoom → máy chủ gửi lại phòng.
//  L-S1: bản ghi mật khẩu hỏng (thiếu muối / mã băm sai độ dài) thì checkPassword trả false, không ném lỗi.
// Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const crypto = require('crypto');
const { start } = require('../server.js');
const { hashPassword, checkPassword } = require('../src/store.js');

let app, url;
test.before(async () => {
  app = start({ port: 0, dataFile: null, msgRate: 2000 });
  await new Promise((r) => app.server.on('listening', r));
  url = `ws://127.0.0.1:${app.server.address().port}/ws`;
});
test.after(() => app.stop());

async function client() {
  const ws = new WebSocket(url);
  const msgs = [];
  let waiters = [];
  ws.on('message', (d) => { const m = JSON.parse(d); msgs.push(m); waiters = waiters.filter((w) => !w(m)); });
  await new Promise((r) => ws.on('open', r));
  const c = {
    send: (m) => ws.send(JSON.stringify(m)),
    wait: (t, pred = () => true) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Hết giờ chờ ' + t)), 8000);
      waiters.push((m) => { if (m.t === t && pred(m)) { clearTimeout(timer); resolve(m); return true; } return false; });
    }),
    close: () => ws.close(),
  };
  c.req = (m, t, pred) => { const p = c.wait(t, pred); c.send(m); return p; };
  await c.req({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex') }, 'welcome');
  return c;
}

test('L-F6: syncRoom gửi lại trạng thái phòng; không ở phòng nào thì room = null', async () => {
  const a = await client();
  const none = await a.req({ t: 'syncRoom' }, 'room');
  assert.strictEqual(none.room, null, 'chưa vào phòng: room null');
  const created = await a.req({ t: 'createRoom', side: 1, timeLimit: 0, opening: 'free', rule: 'vn', public: false }, 'room', (m) => m.room);
  const again = await a.req({ t: 'syncRoom' }, 'room');
  assert.ok(again.room && again.room.code === created.room.code, 'đang trong phòng: nhận lại đúng phòng đó');
  a.close();
});

test('L-S1: bản ghi mật khẩu hỏng → sai mật khẩu, không ném lỗi', async () => {
  const good = await hashPassword('caro-pass1');
  assert.strictEqual(await checkPassword('caro-pass1', good), true);
  for (const bad of [{ hash: good.hash }, { salt: good.salt, hash: 'abc' }, { salt: good.salt }, { salt: '', hash: good.hash }, 'chuỗi lạ']) {
    assert.strictEqual(await checkPassword('caro-pass1', bad), false, JSON.stringify(bad));
  }
});
