'use strict';
// Giải đấu Offline (hub/otour.js, otour-run.js, otour-spec.js, store-otour.js)
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const crypto = require('crypto');
const { start } = require('../server.js');
const TourPatch = require('../../caro/tour-patch.js');

let app, url;
test.before(async () => {
  app = start({ port: 0, dataFile: null, msgRate: 2000, admins: ['boss'], timers: { TOUR_PUSH_MS: 20 } });
  await new Promise((r) => app.server.on('listening', r));
  url = `ws://127.0.0.1:${app.server.address().port}/ws`;
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

test('Giải offline bóng đá: khách xem được (cả link riêng), riêng tư bị chặn, vòng bảng có hoà, loại trực tiếp cần luân lưu, bản vá cho người xem', async () => {
  const org = await account();
  const guest = await Client.open();
  assert.strictEqual((await guest.req({ t: 'otCreate', name: 'X', spec: {} }, 'error')).code, 'need_account', 'khách không tạo được');
  assert.strictEqual((await org.req({ t: 'otCreate', name: 'Cúp Làng', spec: { stages: [] } }, 'error')).code, 'ot_spec_stages');
  const spec = { sport: 'football', stages: [{ type: 'roundrobin', groups: 2, advance: 2 }, { type: 'single', thirdPlace: false }] };
  const { id } = await org.req({ t: 'otCreate', name: 'Cúp Làng 2026', slug: 'cup-lang', desc: '**Sân** xã', spec, teams: [...teams(8), 'Đội 1', ''] }, 'otCreated');
  const t = app.hub.otGet(id);
  assert.deepStrictEqual([t.players.length, t.sport, t.result, t.stages[0].points.w, t.stages[0].tiebreaks[0], t.status], [8, 'football', 'score', 3, 'gdiff', 'draft'], 'bỏ trùng tên, điểm / tie-break theo bóng đá');
  // Khách mở bằng link riêng; người xem nhận bản đầy đủ rồi bản vá
  const v = await guest.req({ t: 'otGet', id: 'cup-lang' }, 'ot');
  assert.strictEqual(v.tour.name, 'Cúp Làng 2026');
  assert.strictEqual(v.mine.canManage, false);
  assert.strictEqual((await guest.req({ t: 'otScore', id, match: 'x' }, 'error')).code, 'need_account');
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  await until(() => guest.ot[id].status === 'running');
  // Vòng bảng: một trận hoà
  const g = Object.values(t.st[0].matches);
  org.send({ t: 'otScore', id, match: g[0].id, score: [1, 1] });
  await until(() => g[0].done);
  assert.strictEqual(g[0].winner, null, 'vòng bảng được hoà');
  assert.strictEqual((await org.req({ t: 'otScore', id, match: g[0].id, score: [2, 0] }, 'error')).code, 'tour_match_done', 'phải huỷ trước khi nhập lại');
  org.send({ t: 'otUndo', id, match: g[0].id });
  await until(() => !g[0].done);
  for (const m of g) { org.send({ t: 'otScore', id, match: m.id, score: [3, 1] }); await until(() => m.done); }
  await until(() => t.stage === 1);
  // Loại trực tiếp: hoà phải có luân lưu
  const ko = () => Object.values(t.st[1].matches).find((m) => !m.done && real(m.a) && real(m.b));
  const m1 = ko();
  assert.strictEqual((await org.req({ t: 'otScore', id, match: m1.id, score: [2, 2] }, 'error')).code, 'ot_need_pen');
  org.send({ t: 'otScore', id, match: m1.id, score: [2, 2], pen: [4, 5] });
  await until(() => m1.done);
  assert.deepStrictEqual([m1.winner, m1.extra], [m1.b, [4, 5]]);
  for (let m = ko(); m; m = ko()) { org.send({ t: 'otScore', id, match: m.id, score: [1, 0] }); await until(() => m.done); }
  await until(() => t.status === 'finished');
  assert.strictEqual(t.podium.length >= 3, true);
  await until(() => guest.ot[id].status === 'finished' && guest.patches > 0);
  assert.deepStrictEqual(guest.ot[id].podium.map((x) => x.uid), t.podium.map((u) => u), 'bản vá áp đúng: người xem thấy bục trao giải');
  // Riêng tư: người ngoài không xem được
  await org.req({ t: 'otEdit', id, name: t.name, access: 'private', slug: 'cup-lang' }, 'otEdited');
  assert.strictEqual((await guest.req({ t: 'otGet', id }, 'error')).code, 'ot_not_found');
  [org, guest].forEach((c) => c.close());
});

test('Giải offline set (cầu lông) và chỉ người thắng (cờ, Thụy Sĩ); hạn mức; giới hạn số trận', async () => {
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Cầu lông phường', spec: { sport: 'badminton', stages: [{ type: 'single', thirdPlace: false }] }, teams: teams(4, 'VĐV') }, 'otCreated');
  const t = app.hub.otGet(id);
  assert.deepStrictEqual([t.result, t.stages[0].bestOf], ['sets', 3]);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const m = Object.values(t.st[0].matches).find((x) => real(x.a) && real(x.b));
  assert.strictEqual((await org.req({ t: 'otScore', id, match: m.id, sets: [[21, 19], [19, 21]] }, 'error')).code, 'tour_score_tie');
  org.send({ t: 'otScore', id, match: m.id, sets: [[21, 19], [19, 21], [21, 15]] });
  await until(() => m.done);
  assert.deepStrictEqual([m.winner, m.wins[m.a], m.wins[m.b]], [m.a, 2, 1]);
  // Cờ: chỉ người thắng / hoà
  const c = await org.req({ t: 'otCreate', name: 'Cờ vua CLB', spec: { sport: 'chess', stages: [{ type: 'swiss', rounds: 3 }] }, teams: teams(6, 'Kỳ thủ') }, 'otCreated');
  const tc = app.hub.otGet(c.id);
  org.send({ t: 'otStart', id: c.id });
  await until(() => tc.status === 'running');
  const r0 = tc.st[0].rounds[0].map((x) => tc.st[0].matches[x]).filter((x) => !x.bye);
  org.send({ t: 'otScore', id: c.id, match: r0[0].id, draw: true });
  org.send({ t: 'otScore', id: c.id, match: r0[1].id, winner: r0[1].b });
  await until(() => r0[0].done && r0[1].done);
  assert.deepStrictEqual([r0[0].winner, r0[1].winner], [null, r0[1].b]);
  // Quá nhiều trận: 512 đội, bảng 16, gặp nhau 3 lượt = 11 520 trận
  const big = await org.req({ t: 'otCreate', name: 'Siêu giải', spec: { stages: [{ type: 'roundrobin', groupSize: 16, meetings: 3 }] }, teams: teams(512) }, 'otCreated');
  assert.strictEqual((await org.req({ t: 'otStart', id: big.id }, 'error')).code, 'ot_many_matches');
  // Hạn mức: tối đa 10 giải chưa kết thúc, 20 lần tạo mỗi ngày
  for (let i = 0; i < 7; i++) await org.req({ t: 'otCreate', name: 'Giải ' + i, spec: { stages: [{ type: 'single' }] } }, 'otCreated');
  assert.strictEqual((await org.req({ t: 'otCreate', name: 'Giải 11', spec: { stages: [{ type: 'single' }] } }, 'error')).code, 'ot_active_limit');
  const me = app.hub.store.users.get(app.hub.otGet(id).owner);
  me.otDay = { d: new Date().toISOString().slice(0, 10), n: 20 };
  app.hub.store.flush();
  app.hub.store.db.prepare("UPDATE offline_tours SET status = 'finished' WHERE owner = ?").run(me.id);
  assert.strictEqual((await org.req({ t: 'otCreate', name: 'Giải mới', spec: { stages: [{ type: 'single' }] } }, 'error')).code, 'ot_daily_limit');
  const list = await org.req({ t: 'otList' }, 'otList');
  assert.strictEqual(list.mine.length, 10);
  org.close();
});

test('Giải offline: bỏ khỏi RAM khi lâu không ai đụng rồi nạp lại từ CSDL; xoá tài khoản thì xoá giải', async () => {
  const org = await account();
  const { id } = await org.req({ t: 'otCreate', name: 'Giải ngủ đông', slug: 'ngu-dong', spec: { stages: [{ type: 'single' }] }, teams: teams(5) }, 'otCreated');
  app.hub.store.flush();
  app.hub.otUsed.set(id, Date.now() - 31 * 60 * 1000);
  app.hub.otEvict();
  assert.ok(!app.hub.otours.has(id), 'đã bỏ khỏi RAM');
  const t = app.hub.otGet('ngu-dong');
  assert.ok(t && t.players.length === 5 && app.hub.otours.has(id), 'nạp lại theo link riêng');
  // Đang có người xem thì không bỏ
  const g = await Client.open();
  await g.req({ t: 'otGet', id }, 'ot');
  app.hub.otUsed.set(id, 0);
  app.hub.otEvict();
  assert.ok(app.hub.otours.has(id));
  const uid = t.owner;
  await org.req({ t: 'deleteAccount', password: 'caro-pass1' }, 'accountDeleted');
  assert.strictEqual(app.hub.store.loadOTour(id), null);
  assert.ok(!app.hub.otours.has(id));
  assert.strictEqual(app.hub.store.countActiveOTours(uid), 0);
  g.close();
});
