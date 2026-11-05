'use strict';
// Dùng chung cho các bài thử giải đấu Offline (otour*.test.js): máy chủ thử, client WebSocket (giữ trang giải + áp bản vá),
// tạo tài khoản, chờ điều kiện.
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const crypto = require('crypto');
const { start } = require('../server.js');
const TourPatch = require('../../caro/tour-patch.js');

let app, url;
const ctx = {};
test.before(async () => {
  app = start({ port: 0, dataFile: null, msgRate: 2000, admins: ['boss'], timers: { TOUR_PUSH_MS: 20 } });
  await new Promise((r) => app.server.on('listening', r));
  url = `ws://127.0.0.1:${app.server.address().port}/ws`;
  ctx.app = app;
});
test.after(() => app.stop());

class Client {
  constructor() { this.msgs = []; this.waiters = []; this.ot = {}; this.patches = 0; }
  static async open() {
    const c = new Client();
    c.ws = new WebSocket(url);
    c.ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.t === 'ot' && m.tour) c.ot[m.id] = structuredClone(m.tour);
      if (m.t === 'otPatch') { assert.ok(TourPatch.apply(c.ot[m.id], structuredClone(m.patch)), 'áp bản vá được'); c.patches++; }
      c.msgs.push(m);
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    await new Promise((r) => c.ws.on('open', r));
    c.send({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex') });
    await c.wait('welcome', undefined, 15000);
    return c;
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(t, pred = () => true, ms = 3000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Hết giờ chờ ' + t + ' | ' + JSON.stringify(this.msgs.filter((m) => m.t === 'error').slice(-2)))), ms);
      this.waiters.push((m) => { if (m.t === t && pred(m)) { clearTimeout(timer); resolve(m); return true; } return false; });
    });
  }
  req(m, t, pred, ms) { const p = this.wait(t, pred, ms); this.send(m); return p; }
  close() { this.ws.close(); }
}
let seq = 0;
async function account() {
  for (const k of [...app.hub.fails.keys()]) if (k.startsWith('reg:')) app.hub.fails.delete(k);
  const c = await Client.open();
  await c.req({ t: 'register', username: 'ot_' + (++seq), password: 'caro-pass1' }, 'welcome', undefined, 15000);
  return c;
}
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('Hết giờ: ' + fn); await new Promise((r) => setTimeout(r, 10)); } };
const teams = (n, p = 'Đội') => Array.from({ length: n }, (_, i) => `${p} ${i + 1}`);
const real = (u) => typeof u === 'string' && u !== '-';

module.exports = { ctx, Client, account, until, teams, real };
