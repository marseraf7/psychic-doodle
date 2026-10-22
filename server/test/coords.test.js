// Hồi quy C3 (phía máy chủ): trần toạ độ một nước đi là ±512 (COORD_LIMIT, khớp MAX_COORD của
// caro/eval-key.js). Trước khi vá trần là ±1_000_000 — hai người chơi cố tình đánh xa nhau là tạo
// được ván trải rộng khiến engine phân tích cấp phát bộ nhớ khổng lồ khi xem lại / phân tích.
// Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const crypto = require('crypto');
const { start } = require('../server.js');

let app, url;
test.before(async () => {
  app = start({ port: 0, dataFile: null, msgRate: 2000 });
  await new Promise((r) => app.server.on('listening', r));
  url = `ws://127.0.0.1:${app.server.address().port}/ws`;
});
test.after(() => app.stop());

class Client {
  constructor() { this.msgs = []; this.waiters = []; }
  static async open() {
    const c = new Client();
    c.ws = new WebSocket(url);
    c.ws.on('message', (d) => {
      const m = JSON.parse(d);
      c.msgs.push(m);
      if (m.t === 'welcome') c.me = m.me;
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    await new Promise((r) => c.ws.on('open', r));
    c.send({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex') });
    await c.wait('welcome');
    return c;
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(t, pred = () => true, ms = 8000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Hết giờ chờ ' + t)), ms);
      this.waiters.push((m) => {
        if (m.t === t && pred(m)) { clearTimeout(timer); resolve(m); return true; }
        return false;
      });
    });
  }
  async req(m, t, pred) { const p = this.wait(t, pred); this.send(m); return p; }
  close() { this.ws.close(); }
}

const lastRoom = (c) => { const m = [...c.msgs].reverse().find((x) => x.t === 'room'); return m ? m.room : null; };
const until = async (fn, ms = 8000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('Hết giờ chờ điều kiện');
    await new Promise((r) => setTimeout(r, 10));
  }
};

test('nước đi quá ±512 bị từ chối (bad_move); đúng biên ±512 vẫn đi được', async () => {
  const a = await Client.open();
  const b = await Client.open();
  const created = await a.req(
    { t: 'createRoom', side: 1, timeLimit: 0, opening: 'free', rule: 'vn', public: false },
    'room', (m) => m.room && m.room.players.length === 1);
  await b.req({ t: 'joinRoom', code: created.room.code, password: created.room.password || '' },
    'room', (m) => m.room && m.room.players.length === 2);
  await until(() => { const r = lastRoom(a); return r && r.players.length === 2; });

  // A (X) đi nước đầu ở gốc, B (O) trả lời ở đúng biên xa nhất cho phép
  a.send({ t: 'move', x: 0, y: 0 });
  await until(() => { const r = lastRoom(a); return r && r.moves.length === 1; });
  b.send({ t: 'move', x: 512, y: -512 });
  await until(() => { const r = lastRoom(a); return r && r.moves.length === 2; });

  // A thử đi quá biên: phải bị từ chối, ván không đổi, vẫn tới lượt A
  const err = await a.req({ t: 'move', x: 513, y: 0 }, 'error', (m) => m.code === 'bad_move');
  assert.ok(err, 'quá ±512 phải nhận lỗi bad_move');
  assert.strictEqual(lastRoom(a).moves.length, 2, 'nước quá biên không được ghi vào ván');

  // A đi lại nước hợp lệ gần gốc: ván chạy tiếp bình thường
  a.send({ t: 'move', x: 1, y: 0 });
  await until(() => { const r = lastRoom(a); return r && r.moves.length === 3; });
  a.close(); b.close();
});
