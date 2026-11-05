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
  // Đổi tên đội khi đang chạy: cả giai đoạn đã xong (dựng sẵn một lần – otMemo) cũng hiện tên mới
  await until(() => guest.ot[id].stageViews.length === 2);
  org.send({ t: 'otTeamRename', id, team: t.players[0].uid, name: 'Đội Đổi Tên' });
  await until(() => JSON.stringify(guest.ot[id].stageViews[0]).includes('Đội Đổi Tên'));
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
  assert.strictEqual((await org.req({ t: 'otScore', id, match: m.id, sets: [[21, 19], [19, 21]] }, 'error')).code, 'ot_sets_short');
  const e = await org.req({ t: 'otScore', id, match: m.id, sets: [[21, 19], [22, 21]] }, 'error');
  assert.deepStrictEqual([e.code, e.args.n], ['ot_set_bad', 2], 'luật set cầu lông: 22–21 chưa xong set');
  assert.strictEqual((await org.req({ t: 'otScore', id, match: m.id, sets: [[21, 19], [21, 15], [21, 3]] }, 'error')).code, 'ot_sets_after');
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

test('Giải offline theo môn: bóng chuyền 3–2 (điểm thắng / thua sát, tỉ lệ điểm), khúc côn cầu luân lưu ở vòng tròn, hiệp phụ, tắt luật set', async () => {
  const org = await account();
  // Bóng chuyền: Bo5, set 25 / set quyết định 15; thắng 3–2 được 2 điểm, thua 2–3 được 1
  const { id } = await org.req({ t: 'otCreate', name: 'Bóng chuyền hè', spec: { sport: 'volleyball', stages: [{ type: 'roundrobin' }] }, teams: teams(3) }, 'otCreated');
  const t = app.hub.otGet(id);
  assert.deepStrictEqual([t.set, t.stages[0].points.wx, t.stages[0].points.lx, t.stages[0].tiebreaks], [{ to: 25, by: 2, cap: 0, last: 15 }, 2, 1, ['wins', 'gpct', 'ppct']]);
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const [m1, m2] = Object.values(t.st[0].matches).filter((x) => real(x.a) && real(x.b));
  assert.strictEqual((await org.req({ t: 'otScore', id, match: m1.id, sets: [[25, 20], [20, 25], [25, 22], [23, 25], [25, 20]] }, 'error')).code, 'ot_set_bad', 'set 5 chỉ tới 15');
  org.send({ t: 'otScore', id, match: m1.id, sets: [[25, 20], [20, 25], [25, 22], [23, 25], [15, 12]] });
  org.send({ t: 'otScore', id, match: m2.id, sets: [[25, 10], [25, 10], [25, 10]] });
  await until(() => m1.done && m2.done);
  assert.strictEqual(m1.ext, true);
  assert.strictEqual(m2.ext, false);
  const ST = require('../src/hub/stages.js');
  const tab = ST.standings(t.st[0], () => 1)[0];
  const pts = (u) => tab.stats[u].pts;
  const only1 = (u) => [m1, m2].filter((x) => x.a === u || x.b === u);
  for (const u of t.st[0].entrants) {
    const want = only1(u).reduce((n, x) => n + (x.winner === u ? (x.ext ? 2 : 3) : x.ext ? 1 : 0), 0);
    assert.strictEqual(pts(u), want, 'điểm bóng chuyền của ' + u);
  }
  // Điểm trong các set: cộng từ mọi trận của người đó (cột của mình theo ô a / b)
  for (const u of t.st[0].entrants) {
    const [pw, pl] = only1(u).reduce(([w, l], x) => { for (const q of x.sets) { w += q[x.a === u ? 0 : 1]; l += q[x.a === u ? 1 : 0]; } return [w, l]; }, [0, 0]);
    assert.deepStrictEqual([tab.stats[u].pw, tab.stats[u].pl, ST.tbValue('pdiff', tab.stats[u])], [pw, pl, pw - pl]);
  }
  // Khúc côn cầu: hoà ở vòng tròn → luân lưu, thắng / thua sát 2 – 1; hiệp phụ ghi cờ aet
  const h = await org.req({ t: 'otCreate', name: 'Khúc côn cầu', spec: { sport: 'hockey', stages: [{ type: 'roundrobin' }] }, teams: teams(2) }, 'otCreated');
  const th = app.hub.otGet(h.id);
  org.send({ t: 'otStart', id: h.id });
  await until(() => th.status === 'running');
  const hm = Object.values(th.st[0].matches).find((x) => real(x.a) && real(x.b));
  const viewer = await Client.open();
  await viewer.req({ t: 'otGet', id: h.id }, 'ot');
  org.send({ t: 'otScore', id: h.id, match: hm.id, score: [2, 2], pen: [3, 1], aet: true });
  await until(() => hm.done);
  assert.deepStrictEqual([hm.winner, hm.ext, hm.aet, hm.extra], [hm.a, true, true, [3, 1]]);
  const ht = ST.standings(th.st[0], () => 1)[0];
  assert.deepStrictEqual([ht.stats[hm.a].pts, ht.stats[hm.b].pts], [2, 1]);
  await until(() => { const v = viewer.ot[h.id]; return v && v.stageViews[0] && JSON.stringify(v.stageViews[0]).includes('"aet":true'); });
  // Tắt luật set (set: null): chỉ kiểm số set
  const f = await org.req({ t: 'otCreate', name: 'Cầu lông vui', spec: { sport: 'badminton', set: null, stages: [{ type: 'single', thirdPlace: false }] }, teams: teams(2) }, 'otCreated');
  const tf = app.hub.otGet(f.id);
  assert.strictEqual(tf.set, null);
  org.send({ t: 'otStart', id: f.id });
  await until(() => tf.status === 'running');
  const fm = Object.values(tf.st[0].matches).find((x) => real(x.a) && real(x.b));
  org.send({ t: 'otScore', id: f.id, match: fm.id, sets: [[15, 14], [15, 3]] });
  await until(() => tf.status === 'finished');
  [org, viewer].forEach((c) => c.close());
});

test('Giải offline thể thức mới: league phase (quốc gia) → knock-out 2 lượt; Thụy Sĩ theo thắng / thua không hoà; kiểm cấu hình league', async () => {
  const org = await account();
  // 16 đội, 4 nhóm, 4 trận (1 đối thủ mỗi nhóm), 8 đội đi tiếp → loại trực tiếp 2 lượt, chung kết 1 trận
  const names = teams(16).map((x, i) => `${x} | ${['ENG', 'ESP', 'GER', 'ITA'][i % 4]}`);
  const spec = { sport: 'football', stages: [{ type: 'roundrobin', league: { games: 4, pots: 4 }, advance: 8 }, { type: 'single', thirdPlace: false, legs: true }] };
  const bad = await org.req({ t: 'otCreate', name: 'Cúp lệch', spec, teams: names.slice(0, 15) }, 'otCreated');
  assert.strictEqual((await org.req({ t: 'otStart', id: bad.id }, 'error')).code, 'ot_league_pots', '15 đội không chia đều 4 nhóm');
  const { id } = await org.req({ t: 'otCreate', name: 'Cúp châu lục', spec, teams: names }, 'otCreated');
  const t = app.hub.otGet(id);
  assert.deepStrictEqual([t.players[1].name, t.players[1].country], ['Đội 2', 'ESP'], 'tách tên đội và quốc gia');
  org.send({ t: 'otStart', id });
  await until(() => t.status === 'running');
  const country = new Map(t.players.map((p) => [p.uid, p.country]));
  const ms = Object.values(t.st[0].matches);
  assert.strictEqual(ms.length, 32);
  assert.ok(ms.every((m) => country.get(m.a) !== country.get(m.b)), 'không gặp đội cùng quốc gia');
  for (const m of ms) { org.send({ t: 'otScore', id, match: m.id, score: [2, 1] }); await until(() => m.done); }
  await until(() => t.stage === 1);
  const st = t.st[1];
  const ko = () => Object.values(st.matches).find((m) => !m.done && real(m.a) && real(m.b));
  const m1 = ko();
  assert.ok(app.hub.matchView(t, m1, st).legs, 'trận 2 lượt');
  assert.strictEqual((await org.req({ t: 'otScore', id, match: m1.id, score: [1, 0] }, 'error')).code, 'tour_score_bad', 'phải nhập đủ 2 lượt');
  assert.strictEqual((await org.req({ t: 'otScore', id, match: m1.id, legs: [[1, 0], [0, 1]] }, 'error')).code, 'ot_need_pen', 'hoà tổng tỉ số cần luân lưu');
  org.send({ t: 'otScore', id, match: m1.id, legs: [[1, 0], [1, 2]], pen: [5, 4] });
  await until(() => m1.done);
  assert.deepStrictEqual([m1.score, m1.winner, m1.legs, m1.sets], [[2, 2], m1.a, true, [[1, 0], [1, 2]]]);
  for (let m = ko(); m; m = ko()) {
    const final = m.round === st.rounds.length - 1;
    assert.strictEqual(!!app.hub.matchView(t, m, st).legs, !final, 'chung kết 1 trận');
    org.send({ t: 'otScore', id, match: m.id, ...(final ? { score: [3, 0] } : { legs: [[2, 0], [0, 0]] }) });
    await until(() => m.done);
  }
  await until(() => t.status === 'finished');
  // Thụy Sĩ theo số thắng / thua: 8 người, 2 thắng đi tiếp / 2 thua bị loại; chỉ người thắng – không có hoà
  const c = await org.req({ t: 'otCreate', name: 'LoL mini', spec: { sport: 'esports', result: 'winner', stages: [{ type: 'swiss', record: { win: 2, lose: 2, bo: 3 }, advance: 4 }, { type: 'single' }] }, teams: teams(8, 'Team') }, 'otCreated');
  const tc = app.hub.otGet(c.id);
  org.send({ t: 'otStart', id: c.id });
  await until(() => tc.status === 'running');
  const first = tc.st[0].matches[tc.st[0].rounds[0][0]];
  assert.strictEqual((await org.req({ t: 'otScore', id: c.id, match: first.id, draw: true }, 'error')).code, 'tour_score_bad', 'không có hoà');
  for (let guard = 0; tc.stage === 0 && guard < 40; guard++) {
    const m = Object.values(tc.st[0].matches).find((x) => !x.done && real(x.a) && real(x.b));
    if (!m) break;
    org.send({ t: 'otScore', id: c.id, match: m.id, winner: m.a });
    await until(() => m.done);
  }
  await until(() => tc.stage === 1);
  const rec = require('../src/hub/stages.js').records(tc.st[0]);
  assert.ok(tc.st[1].entrants.every((u) => rec[u].w === 2), 'chỉ đội đủ 2 thắng vào vòng sau');
  assert.strictEqual(tc.st[1].entrants.length, 4);
  org.close();
});
