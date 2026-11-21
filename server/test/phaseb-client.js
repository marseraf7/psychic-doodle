/*
 * Dùng chung cho các bài thử đợt B (insights, league, ladder, fairplay, recap): bật máy chủ trong bộ nhớ, mở kết nối
 * WebSocket, đăng ký tài khoản, ghi sẵn ván vào CSDL. Không phải file *.test.js nên `npm test` không chạy riêng nó.
 */
'use strict';
const WebSocket = require('ws');
const crypto = require('crypto');
const { start } = require('../server.js');

const PASS = 'Xk9!caroA#4821';

class Client {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.msgs = [];
    this.waiters = [];
    this.ws.on('message', (d) => {
      const m = JSON.parse(d);
      this.msgs.push(m);
      this.waiters = this.waiters.filter((w) => !w(m));
    });
  }
  open() { return new Promise((r) => this.ws.on('open', r)); }
  send(o) { this.ws.send(JSON.stringify(o)); }
  /** Tin mới (sau lúc gọi) thoả pred. */
  next(pred, ms = 5000) {
    return new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('Hết giờ chờ tin')), ms);
      this.waiters.push((m) => { if (pred(m)) { clearTimeout(to); res(m); return true; } return false; });
    });
  }
  /** Gửi o rồi chờ tin loại t (hoặc lỗi của đúng lệnh đó). */
  req(o, t, ms) {
    const p = this.next((m) => m.t === t || (m.t === 'error' && m.ctx === o.t), ms);
    this.send(o);
    return p;
  }
  close() { try { this.ws.close(); } catch { /* đã đóng */ } }
}

async function boot(opts = {}) {
  const app = start({ port: 0, dataFile: null, msgRate: 5000, admins: ['boss'], ...opts });
  await new Promise((r) => (app.server.listening ? r() : app.server.once('listening', r)));
  return { app, url: `ws://127.0.0.1:${app.server.address().port}/ws` };
}

async function guest(url) {
  const c = new Client(url);
  await c.open();
  const w = c.next((m) => m.t === 'welcome');
  c.send({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex') });
  c.me = (await w).me;
  return c;
}

/** Khách mới rồi đăng ký tài khoản username; trả về client (c.uid = id tài khoản). */
async function account(app, url, username) {
  const c = await guest(url);
  const w = c.next((m) => m.t === 'auth');
  c.send({ t: 'register', username, password: PASS, name: username });
  await w;
  c.uid = app.hub.store.byUsername.get(username).id;
  return c;
}

/** Ván giả lưu thẳng vào CSDL (thắng: 1 = X, 2 = O, 3 = hoà). */
function record(app, { x, o, winner = 1, moves, rule = 'vn', clock = '3+2', timeLimit = 0, reason = 'win' }) {
  moves = moves || [[0, 0], [5, 5], [1, 0], [5, 6], [2, 0], [5, 7], [3, 0], [5, 8], [4, 0]];
  return app.hub.store.recordGame({ kind: 'quick', timeLimit, clock, rule, xId: x, oId: o, xName: 'x', oName: 'o', winner, reason, moves });
}

module.exports = { Client, boot, guest, account, record, PASS };
