// Kiểm thử câu lạc bộ, giải đấu (Arena, loại trực tiếp) và duyệt của quản trị viên. Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');
const { start } = require('../server.js');
const TourPatch = require('../../caro/tour-patch.js');

const TIMERS = {
  NEXT_GAME_MS: 50, OFFLINE_FORFEIT_MS: 400, INVITE_TTL_MS: 500, SECOND_MS: 300, DRAW_COOLDOWN_MS: 300,
  MATCH_TICK_MS: 50, LOBBY_DEBOUNCE_MS: 30,
  TOUR_TICK_MS: 30, TOUR_CHECKIN_MS: 10 * 60 * 1000, TOUR_NOSHOW_MS: 400, TOUR_MIN_LEAD_MS: 0, TOUR_PUSH_MS: 20,
  ARENA_REST_MS: 50, ARENA_REPEAT_MS: 300, TOUR_DISPUTE_MS: 300,
};
let app, url;
test.before(async () => {
  app = start({ port: 0, dataFile: null, msgRate: 2000, admins: ['boss'], timers: TIMERS });
  await new Promise((r) => app.server.on('listening', r));
  url = `ws://127.0.0.1:${app.server.address().port}/ws`;
});
test.after(() => app.stop());

class Client {
  constructor() { this.msgs = []; this.waiters = []; this.tours = {}; this.patches = 0; }
  static async open(u = url) {
    const c = new Client();
    c.ws = new WebSocket(u);
    c.ws.on('message', (d) => {
      let m = JSON.parse(d);
      // Bản vá trang giải: áp như client thật (caro/tour-patch.js), rồi coi như nhận bản đầy đủ
      // shared = phần chung máy chủ gửi; tour = phần chung + phần riêng (như client thật ghép lại)
      if (m.t === 'tour' && m.tour) {
        c.tours[m.id] = structuredClone(m.tour);
        if (m.mine) m = { ...m, shared: m.tour, tour: { ...m.tour, ...m.mine } };
      }
      if (m.t === 'tourPatch') {
        const cur = c.tours[m.id];
        assert.ok(cur, 'nhận bản vá khi chưa có bản đầy đủ');
        assert.ok(TourPatch.apply(cur, structuredClone(m.patch)), 'áp bản vá được');
        c.patches++;
        m = { t: 'tour', id: m.id, shared: structuredClone(cur), tour: { ...structuredClone(cur), ...m.mine }, mine: m.mine, patched: true };
      }
      c.msgs.push(m);
      if (m.t === 'room') c.room = m.room;
      if (m.t === 'welcome') { c.me = m.me; c.room = m.room; }
      if (m.t === 'me') c.me = m.me;
      if (m.t === 'tour') c.tour = m.tour;
      if (m.t === 'club') c.club = m.club;
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    await new Promise((r) => c.ws.on('open', r));
    c.send({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex') });
    await c.wait('welcome');
    return c;
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(t, pred = () => true, ms = 3000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Hết giờ chờ ' + t + ' ' + pred.toString() + ' | lỗi: ' + JSON.stringify(this.msgs.filter((m) => m.t === 'error').slice(-3)))), ms);
      this.waiters.push((m) => {
        if (m.t === t && pred(m)) { clearTimeout(timer); resolve(m); return true; }
        return false;
      });
    });
  }
  async req(m, t, pred) { const p = this.wait(t, pred); this.send(m); return p; }
  close() { this.ws.close(); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Chờ phòng hiện tại (hoặc phòng sắp nhận) thoả điều kiện – không bỏ lỡ tin đã tới trước khi gọi. */
function waitRoom(c, pred, ms) {
  if (c.room && pred(c.room)) return Promise.resolve(c.room);
  return c.wait('room', (m) => m.room && pred(m.room), ms).then((m) => m.room);
}
async function until(fn, ms = 3000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('Hết giờ chờ: ' + fn.toString());
    await sleep(10);
  }
}
let seq = 0;
async function account(prefix, rating) {
  for (const k of [...app.hub.fails.keys()]) if (k.startsWith('reg:')) app.hub.fails.delete(k);
  const c = await Client.open();
  const username = (prefix + '_' + (++seq)).slice(0, 20);
  await c.req({ t: 'register', username, password: 'caro-pass1', name: prefix + seq }, 'welcome');
  if (rating) app.hub.store.users.get(c.me.uid).rating = rating;
  return c;
}
let boss;
async function admin() {
  if (boss) return boss;
  for (const k of [...app.hub.fails.keys()]) if (k.startsWith('reg:')) app.hub.fails.delete(k);
  boss = await Client.open();
  await boss.req({ t: 'register', username: 'boss', password: 'caro-pass1', name: 'Boss' }, 'welcome');
  return boss;
}
const soon = () => Date.now() + 5 * 60 * 1000;

/** Người đến lượt đánh nước thắng: X ở hàng 0, O rải rác ở hàng 5 (chờ cả hai nhận trạng thái mới). */
async function playOut(winner, loser) {
  const code = winner.room.code;
  const side = (c) => (c.room.seats.x === c.me.id ? 1 : 2);
  let i = 0, j = 0;
  // Dừng khi ván kết thúc hoặc khi máy chủ đã chuyển người chơi sang phòng trận kế tiếp (giải đấu)
  while (winner.room.code === code && !winner.room.winner) {
    const turnC = side(winner) === winner.room.turn ? winner : loser;
    const other = turnC === winner ? loser : winner;
    const n = turnC.room.moves.length + 1;
    const done = (m) => m.room && (m.room.code !== code || m.room.moves.length >= n || !!m.room.winner);
    const p = Promise.all([turnC.wait('room', done), other.wait('room', done)]);
    turnC.send(turnC === winner ? { t: 'move', x: i++, y: 0 } : { t: 'move', x: (j++) * 3, y: 5 });
    try { await p; } catch (e) {
      // Hết giờ chờ: in thêm lỗi của cả hai người và trạng thái phòng để biết nguyên nhân
      const info = (c) => ({ me: c.me.id, errors: c.msgs.filter((m) => m.t === 'error').slice(-3),
        room: c.room && { code: c.room.code, turn: c.room.turn, moves: c.room.moves.length, winner: c.room.winner, seats: c.room.seats } });
      e.message += ' | người đi: ' + JSON.stringify(info(turnC)) + ' | người kia: ' + JSON.stringify(info(other));
      throw e;
    }
  }
}

test('quản trị viên duyệt câu lạc bộ; người khác chỉ thấy CLB đã duyệt', async () => {
  const B = await admin();
  const owner = await account('own');
  const other = await account('oth');
  const created = await owner.req({ t: 'clubCreate', name: 'CLB Sấm Sét', desc: 'Chơi vui', join: 'request' }, 'clubCreated');
  assert.strictEqual(created.status, 'pending');
  assert.strictEqual((await B.wait('adminCount', (m) => m.n >= 1)).t, 'adminCount');
  // Chưa duyệt: người khác không thấy
  assert.ok(!(await other.req({ t: 'clubList' }, 'clubList')).clubs.some((c) => c.id === created.id));
  assert.strictEqual((await other.req({ t: 'clubGet', id: created.id }, 'error')).code, 'club_not_found');
  // Không phải quản trị viên thì không xem được hàng chờ
  assert.strictEqual((await other.req({ t: 'adminQueue' }, 'error')).code, 'admin_only');
  const q = await B.req({ t: 'adminQueue' }, 'adminQueue');
  assert.ok(q.clubs.some((c) => c.id === created.id && c.owner.name === owner.me.name));
  // Trùng tên thì không tạo được
  assert.strictEqual((await other.req({ t: 'clubCreate', name: 'clb sấm sét' }, 'error')).code, 'club_name_taken');
  const ok = owner.wait('toast', (m) => m.code === 'club_approved');
  await B.req({ t: 'adminReview', kind: 'club', id: created.id, approve: true }, 'adminQueue');
  await ok;
  assert.ok((await other.req({ t: 'clubList' }, 'clubList')).clubs.some((c) => c.id === created.id));
  // Từ chối kèm lý do
  const c2 = await other.req({ t: 'clubCreate', name: 'Spam club' }, 'clubCreated');
  const no = other.wait('toast', (m) => m.code === 'club_rejected');
  await B.req({ t: 'adminReview', kind: 'club', id: c2.id, approve: false, note: 'Tên không phù hợp' }, 'adminQueue');
  assert.match((await no).msg, /Tên không phù hợp/);
  // CLB của quản trị viên được duyệt luôn
  assert.strictEqual((await B.req({ t: 'clubCreate', name: 'CLB Admin', join: 'open' }, 'clubCreated')).status, 'approved');
  [owner, other].forEach((c) => c.close());
});

test('câu lạc bộ: vào tự do / gửi yêu cầu / mã mời, vai trò, mời ra, chủ không rời được', async () => {
  const B = await admin();
  const owner = await account('cown');
  const a = await account('ca'), b = await account('cb'), d = await account('cd');
  const { id } = await owner.req({ t: 'clubCreate', name: 'CLB Yêu cầu ' + seq, join: 'request' }, 'clubCreated');
  await B.req({ t: 'adminReview', kind: 'club', id, approve: true }, 'adminQueue');
  await owner.req({ t: 'clubGet', id }, 'club');
  // Gửi yêu cầu -> chủ thấy -> duyệt
  const reqIn = owner.wait('club', (m) => m.club.requests.length === 1);
  await a.req({ t: 'clubJoin', id }, 'toast', (m) => m.code === 'club_request_sent');
  await reqIn;
  await owner.req({ t: 'clubRequest', id, uid: a.me.uid, accept: true }, 'club', (m) => m.club.members.length === 2);
  // Thành viên thường không duyệt / mời ra được
  assert.strictEqual((await a.req({ t: 'clubKick', id, uid: owner.me.uid }, 'error')).code, 'club_officers_only');
  // Đổi sang mã mời: sai mã / đúng mã
  await owner.req({ t: 'clubUpdate', id, join: 'code', announcement: 'Giải tối thứ 7!' }, 'club', (m) => m.club.join === 'code');
  const code = owner.club.code;
  assert.match(code, /^[0-9A-F]{8}$/);
  assert.strictEqual((await b.req({ t: 'clubJoin', id, code: 'SAI' }, 'error')).code, 'club_bad_code');
  await b.req({ t: 'clubJoin', id, code: code.toLowerCase() }, 'toast', (m) => m.code === 'club_joined');
  // Thăng quản lý: quản lý duyệt / mời ra được thành viên thường
  await owner.req({ t: 'clubRole', id, uid: a.me.uid, role: 'officer' }, 'club', (m) => m.club.members.some((x) => x.id === a.me.uid && x.role === 'officer'));
  const kicked = b.wait('toast', (m) => m.code === 'club_kicked');
  await a.req({ t: 'clubKick', id, uid: b.me.uid }, 'error').catch(() => {}); // a chưa mở trang CLB: không nhận 'club'
  await kicked;
  const view = await d.req({ t: 'clubGet', id }, 'club');
  assert.strictEqual(view.club.members.length, 2);
  assert.strictEqual(view.club.announcement, 'Giải tối thứ 7!');
  assert.strictEqual(view.club.code, null, 'người ngoài không thấy mã mời');
  assert.strictEqual((await owner.req({ t: 'clubLeave', id }, 'error')).code, 'club_owner_leave');
  // Trao quyền chủ rồi rời đi
  await owner.req({ t: 'clubRole', id, uid: a.me.uid, role: 'owner' }, 'club', (m) => m.club.members.find((x) => x.id === a.me.uid).role === 'owner');
  await owner.req({ t: 'clubLeave', id }, 'club', (m) => m.club.members.length === 1);
  [owner, a, b, d].forEach((c) => c.close());
});

test('giải loại trực tiếp: duyệt, điểm danh, hạt giống theo Elo, miễn đấu, tranh hạng 3, vô địch', async () => {
  const B = await admin();
  // 5 người đăng ký, 1 người không điểm danh -> 4 người (không cần miễn đấu); thêm 1 người rút trước giờ
  const org = await account('org');
  const ps = [await account('p', 1600), await account('p', 1500), await account('p', 1400), await account('p', 1300), await account('p', 1250)];
  const created = await org.req({ t: 'tourCreate', name: 'Cúp Mùa Thu', format: 'knockout', startsAt: soon(), timeLimit: 30, bestOf: 1, thirdPlace: true, checkin: true }, 'tourCreated');
  assert.strictEqual(created.status, 'pending');
  const { id } = created;
  // Chưa duyệt: không đăng ký được (người khác không thấy giải)
  assert.strictEqual((await ps[0].req({ t: 'tourJoin', id }, 'error')).code, 'tour_not_found');
  await B.req({ t: 'adminReview', kind: 'tour', id, approve: true }, 'adminQueue');
  for (const p of ps) await p.req({ t: 'tourJoin', id }, 'toast', (m) => m.code === 'tour_joined');
  const late = await account('late');
  await late.req({ t: 'tourJoin', id }, 'toast');
  await late.req({ t: 'tourLeave', id }, 'error').catch(() => {});
  await sleep(50);
  assert.ok(!app.hub.tours.get(id).players.some((p) => p.uid === late.me.uid), 'rút trước giờ = xoá khỏi danh sách');
  // Đang trong giờ điểm danh (TOUR_CHECKIN_MS lớn): đăng ký = đã điểm danh; người thứ 5 bỏ điểm danh
  app.hub.tours.get(id).players.find((p) => p.uid === ps[4].me.uid).checkedIn = false;
  // Ban tổ chức bắt đầu ngay
  const v0 = await org.req({ t: 'tourGet', id }, 'tour');
  assert.ok(v0.tour.canManage && v0.tour.checkin);
  const starts = ps.slice(0, 4).map((p) => p.wait('room', (m) => m.room && m.room.tour && m.room.tour.id === id));
  const noCheck = ps[4].wait('toast', (m) => m.code === 'tour_no_checkin');
  org.send({ t: 'tourStart', id });
  await Promise.all(starts);
  await noCheck;
  const t = app.hub.tours.get(id);
  assert.deepStrictEqual(t.players.filter((p) => p.seed).sort((a, b) => a.seed - b.seed).map((p) => p.uid), ps.slice(0, 4).map((p) => p.me.uid), 'hạt giống theo Elo');
  // Bán kết: 1 gặp 4, 2 gặp 3
  assert.strictEqual(ps[0].room.code, ps[3].room.code);
  assert.strictEqual(ps[1].room.code, ps[2].room.code);
  assert.strictEqual((await ps[0].req({ t: 'rematch' }, 'error')).code, 'tour_no_rematch');
  // Hạt giống 4 thắng hạt giống 1, hạt giống 2 thắng 3
  await playOut(ps[3], ps[0]);
  await playOut(ps[1], ps[2]);
  // Chung kết 4 vs 2 và tranh hạng 3: 1 vs 3 tự bắt đầu
  const fresh = (other) => (r) => r.tour && r.players.some((p) => p.id === other.me.id) && !r.winner;
  await Promise.all([waitRoom(ps[3], fresh(ps[1])), waitRoom(ps[1], fresh(ps[3])), waitRoom(ps[0], fresh(ps[2])), waitRoom(ps[2], fresh(ps[0]))]);
  await playOut(ps[1], ps[3]);
  await playOut(ps[2], ps[0]);
  await until(() => t.status === 'finished');
  assert.deepStrictEqual(t.podium, [ps[1].me.uid, ps[3].me.uid, ps[2].me.uid]);
  const fin = await ps[0].req({ t: 'tourGet', id }, 'tour');
  assert.strictEqual(fin.tour.winner, ps[1].me.name);
  assert.strictEqual(fin.tour.stageViews[0].rounds[0][0].games.length, 1, 'ván đã chơi có link xem lại');
  [org, late, ...ps].forEach((c) => c.close());
});

test('loại trực tiếp: 3 người (miễn đấu), Bo3, rời trận = thua cả trận, vắng mặt thì bị xử thua', async () => {
  const B = await admin();
  const ps = [await account('k', 1700), await account('k', 1600), await account('k', 1500)];
  const { id } = await B.req({ t: 'tourCreate', name: 'Bo3 nhỏ', format: 'knockout', startsAt: soon(), timeLimit: 30, bestOf: 3, thirdPlace: false, checkin: false }, 'tourCreated');
  for (const p of ps) await p.req({ t: 'tourJoin', id }, 'toast');
  B.send({ t: 'tourStart', id });
  await waitRoom(ps[1], (r) => r.tour && r.players.length === 2);
  await waitRoom(ps[2], (r) => r.tour && r.players.length === 2);
  const t = app.hub.tours.get(id);
  assert.ok(Object.values(t.st[0].matches).some((m) => m.bye && m.winner === ps[0].me.uid), 'hạt giống 1 được miễn đấu');
  // Hạt giống 2 thắng ván 1 rồi hạt giống 3 rời phòng giữa 2 ván -> thua cả trận
  await playOut(ps[1], ps[2]);
  assert.strictEqual(ps[1].room.seriesWinner, null);
  ps[2].send({ t: 'leaveRoom' });
  // Chung kết: hạt giống 1 offline -> quá giờ bị xử thua, hạt giống 2 vô địch
  ps[0].close();
  await until(() => t.status === 'finished');
  assert.strictEqual(t.podium[0], ps[1].me.uid);
  assert.ok(t.st[0].matches[t.st[0].rounds[1][0]].walkover);
  [ps[1], ps[2]].forEach((c) => c.close());
});

test('Arena: tự ghép ván, thắng 2 điểm, chuỗi thắng 🔥 được 4 điểm, hoà sớm 0 điểm, tạm nghỉ, kết thúc theo giờ', async () => {
  const B = await admin();
  const [a, b] = [await account('ar', 1500), await account('ar', 1490)];
  const { id } = await B.req({ t: 'tourCreate', name: 'Arena tối', format: 'arena', startsAt: soon(), timeLimit: 30, minutes: 30, rated: false }, 'tourCreated');
  await a.req({ t: 'tourJoin', id }, 'toast');
  await b.req({ t: 'tourJoin', id }, 'toast');
  B.send({ t: 'tourStart', id });
  const newGame = (r) => r.tour && r.tour.arena && !r.winner && r.moves.length === 0 && r.players.length === 2;
  await waitRoom(a, newGame);
  await waitRoom(b, newGame);
  const t = app.hub.tours.get(id);
  const P = (c) => t.players.find((p) => p.uid === c.me.uid);
  // 3 ván a thắng liên tiếp: 2 + 2 + 4 (🔥)
  for (let g = 0; g < 3; g++) {
    await playOut(a, b);
    await until(() => P(a).games === g + 1);
    await waitRoom(a, newGame);
    await waitRoom(b, newGame);
  }
  assert.strictEqual(P(a).score, 8);
  assert.strictEqual(P(a).wins, 3);
  assert.strictEqual(P(b).score, 0);
  // Ván không tính Elo (giải không tính Elo)
  assert.strictEqual(app.hub.store.users.get(a.me.uid).rating, 1500);
  // Ván 4: xin hoà sớm (dưới 10 nước) -> 0 điểm, mất chuỗi 🔥
  await a.req({ t: 'drawOffer' }, 'room', (m) => !!m.room.drawOffer);
  await b.req({ t: 'drawAnswer', accept: true }, 'room', (m) => m.room.winner === 3);
  await until(() => P(a).games === 4);
  assert.strictEqual(P(a).score, 8);
  assert.strictEqual(P(a).streak, 0);
  // Tạm nghỉ: không được ghép thêm
  await b.req({ t: 'tourGet', id }, 'tour');
  await b.req({ t: 'tourPause', id, paused: true }, 'tour', (m) => m.mine && m.mine.me.paused); // phần riêng của mình nằm trong mine
  await sleep(300);
  assert.ok(a.room.winner, 'không có ván mới khi đối thủ đang nghỉ');
  // Hết giờ -> kết thúc, a vô địch
  t.endsAt = Date.now();
  await until(() => t.status === 'finished');
  assert.strictEqual(t.podium[0], a.me.uid);
  const v = await a.req({ t: 'tourGet', id }, 'tour');
  assert.strictEqual(v.tour.players[0].uid, a.me.uid);
  assert.ok(v.tour.games.length >= 4 && v.tour.games.filter((g) => g.share).length === 3, 'ván có nước đi có link xem lại');
  [a, b].forEach((c) => c.close());
});

test('đang ở Arena mà trận loại trực tiếp (giải khác) tới lượt: ưu tiên trận loại trực tiếp', async () => {
  const B = await admin();
  const [a, b, c] = [await account('pr', 1500), await account('pr', 1500), await account('pr', 1500)];
  const ar = await B.req({ t: 'tourCreate', name: 'Arena song song', format: 'arena', startsAt: soon(), timeLimit: 30, minutes: 60 }, 'tourCreated');
  const ko = await B.req({ t: 'tourCreate', name: 'KO song song', format: 'knockout', startsAt: soon(), timeLimit: 30, bestOf: 1, checkin: false }, 'tourCreated');
  for (const p of [a, b]) await p.req({ t: 'tourJoin', id: ar.id }, 'toast');
  for (const p of [a, c]) await p.req({ t: 'tourJoin', id: ko.id }, 'toast');
  B.send({ t: 'tourStart', id: ar.id });
  await waitRoom(a, (r) => r.tour && r.tour.id === ar.id && r.players.length === 2);
  B.send({ t: 'tourStart', id: ko.id });
  await sleep(100);
  // a đang đánh ván Arena: trận loại trực tiếp chờ; xong ván Arena thì vào ngay trận loại trực tiếp
  const kst = app.hub.tours.get(ko.id).st[0];
  assert.ok(!kst.matches[kst.rounds[0][0]].room);
  await waitRoom(b, (r) => r.tour && r.tour.id === ar.id);
  await playOut(a, b);
  await waitRoom(a, (r) => r.tour && r.tour.id === ko.id && !r.winner);
  await waitRoom(c, (r) => r.tour && r.tour.id === ko.id && !r.winner);
  [a, b, c].forEach((x) => x.close());
});

/** Đánh hết các trận của giải: decide(a, b) trả về client thắng (null = hoà) cho mỗi trận đang mở. */
async function autoPlay(t, clients, decide, ms = 20000) {
  const t0 = Date.now();
  while (t.status === 'running') {
    if (Date.now() - t0 > ms) throw new Error('autoPlay quá giờ');
    // Lấy trận đang mở từ máy chủ (trạng thái chuẩn), rồi chờ cả hai client nhận đúng phòng đó
    const r = [...app.hub.rooms.values()].find((x) => x.tour && x.tour.id === t.id && x.active && x.full);
    if (!r) { await sleep(30); continue; }
    const [c, other] = r.players.map((p) => clients.find((x) => x.me.id === p.id));
    const fresh = (rr) => rr.code === r.code && rr.players.length === 2 && !rr.winner;
    await waitRoom(c, fresh);
    await waitRoom(other, fresh);
    const w = decide(c, other);
    if (w === null) {
      const seen = waitRoom(c, (rr) => rr.code === r.code && rr.winner === 3);
      await c.req({ t: 'drawOffer' }, 'room', (m) => !!m.room.drawOffer);
      await other.req({ t: 'drawAnswer', accept: true }, 'room', (m) => m.room.winner === 3);
      await seen; // cả hai đã thấy ván hoà
    } else await playOut(w, w === c ? other : c);
  }
}

test('nhiều vòng: vòng bảng (vòng tròn 2 bảng) -> playoff loại trực tiếp; nhất bảng gặp nhì bảng kia', async () => {
  const B = await admin();
  const ps = [];
  for (let i = 0; i < 6; i++) ps.push(await account('g', 1800 - i * 50));
  const { id } = await B.req({ t: 'tourCreate', name: 'Bảng + Playoff', format: 'bracket', startsAt: soon(), timeLimit: 30, checkin: false,
    stages: [{ type: 'roundrobin', groups: 2, bestOf: 1, advance: 2, points: { w: 3, d: 1, l: 0 } }, { type: 'single', bestOf: 1, thirdPlace: false }] }, 'tourCreated');
  for (const p of ps) await p.req({ t: 'tourJoin', id }, 'toast');
  B.send({ t: 'tourStart', id });
  const t = app.hub.tours.get(id);
  await until(() => t.status === 'running');
  assert.deepStrictEqual(t.st[0].groups.map((g) => g.players.length), [3, 3]);
  // Hạt giống cao hơn luôn thắng (trừ một trận hoà ở bảng B)
  const seed = (c) => t.players.find((p) => p.uid === c.me.uid).seed;
  await autoPlay(t, ps, (a, b) => {
    if (t.stage === 0 && [seed(a), seed(b)].sort().join() === '3,6') return null;
    return seed(a) < seed(b) ? a : b;
  }, 60000);
  assert.strictEqual(t.status, 'finished');
  assert.strictEqual(t.st.length, 2);
  // Bảng A: 1, 4, 5; bảng B: 2, 3, 6 -> vào bán kết 1, 4 (A) và 2, 3 (B); bán kết không gặp người cùng bảng
  const semis = t.st[1].rounds[0].map((mid) => t.st[1].matches[mid]);
  const grp = (u) => t.st[0].groups.findIndex((g) => g.players.includes(u));
  for (const m of semis) assert.notStrictEqual(grp(m.a), grp(m.b));
  assert.strictEqual(t.podium[0], ps[0].me.uid);
  const v = await ps[5].req({ t: 'tourGet', id }, 'tour');
  assert.strictEqual(v.tour.stageViews.length, 2);
  assert.strictEqual(v.tour.stageViews[0].groups[1].table.find((r) => r.uid === ps[2].me.uid).d, 1, 'hạt giống 3 có 1 trận hoà');
  assert.ok(v.tour.players.find((p) => p.uid === ps[5].me.uid).out === 'not_advanced');
  ps.forEach((c) => c.close());
});

test('xếp bảng như Challonge: chỉ ban tổ chức, trước khi bắt đầu; bốc thăm theo bảng đã xếp', async () => {
  const B = await admin();
  const ps = [];
  for (let i = 0; i < 4; i++) ps.push(await account('xb', 1900 - i * 10));
  const { id } = await B.req({ t: 'tourCreate', name: 'Xếp bảng', format: 'bracket', startsAt: soon(), timeLimit: 30, checkin: false,
    stages: [{ type: 'roundrobin', groupSize: 2, bestOf: 1, advance: 1 }, { type: 'single', bestOf: 1, thirdPlace: false }] }, 'tourCreated');
  for (const p of ps) await p.req({ t: 'tourJoin', id }, 'toast');
  const u = ps.map((c) => c.me.uid);
  // Ban tổ chức thấy bảng dự kiến (chia kiểu rắn theo Elo: 1-4, 2-3); người chơi thì không
  const draft = (await B.req({ t: 'tourGet', id }, 'tour', (m) => m.id === id)).tour.groupDraft;
  assert.deepStrictEqual(draft.groups.map((g) => g.map((x) => x.uid)), [[u[0], u[3]], [u[1], u[2]]]);
  assert.strictEqual(draft.manual, false);
  assert.strictEqual((await ps[0].req({ t: 'tourGet', id }, 'tour', (m) => m.id === id)).tour.groupDraft, null);
  // Chỉ ban tổ chức được xếp; dữ liệu sai bị từ chối
  assert.strictEqual((await ps[0].req({ t: 'tourGroups', id, groups: [u] }, 'error')).code, 'tour_managers_only');
  assert.strictEqual((await B.req({ t: 'tourGroups', id, groups: [[u[0], u[0]], [u[1]]] }, 'error')).code, 'tour_groups_bad');
  assert.strictEqual((await B.req({ t: 'tourGroups', id, groups: [['u_khong_co']] }, 'error')).code, 'tour_groups_bad');
  assert.strictEqual((await B.req({ t: 'tourGroups', id, groups: 'x' }, 'error')).code, 'tour_groups_bad');
  // Xếp tay: 1-2 cùng bảng, 3-4 cùng bảng
  const t = app.hub.tours.get(id);
  B.send({ t: 'tourGroups', id, groups: [[u[0], u[1]], [u[2], u[3]]] });
  await until(() => !!t.groupPlan);
  const d2 = (await B.req({ t: 'tourGet', id }, 'tour', (m) => m.id === id)).tour.groupDraft;
  assert.strictEqual(d2.manual, true);
  assert.deepStrictEqual(d2.groups.map((g) => g.map((x) => x.uid)), [[u[0], u[1]], [u[2], u[3]]]);
  // Trả về chia tự động rồi xếp lại
  B.send({ t: 'tourGroups', id, groups: null });
  await until(() => t.groupPlan === null);
  B.send({ t: 'tourGroups', id, groups: [[u[0], u[1]], [u[2], u[3]]] });
  await until(() => !!t.groupPlan);
  B.send({ t: 'tourStart', id });
  await until(() => t.status === 'running');
  assert.deepStrictEqual(t.st[0].groups.map((g) => g.players), [[u[0], u[1]], [u[2], u[3]]]);
  assert.strictEqual((await B.req({ t: 'tourGroups', id, groups: null }, 'error')).code, 'tour_groups_closed');
  B.send({ t: 'tourCancel', id });
  await until(() => t.status === 'cancelled');
  // Giải không có vòng bảng
  const ko = await B.req({ t: 'tourCreate', name: 'Không bảng', format: 'bracket', startsAt: soon(), timeLimit: 30, stages: [{ type: 'single' }] }, 'tourCreated');
  assert.strictEqual((await B.req({ t: 'tourGroups', id: ko.id, groups: null }, 'error')).code, 'tour_no_groups');
  // Giải loại trực tiếp kiểu cũ đang chạy dở khi nâng cấp: huỷ với lý do riêng
  const old = { format: 'knockout', status: 'running', bestOf: 3, thirdPlace: true };
  app.hub.upgradeTour(old);
  assert.strictEqual(old.format, 'bracket');
  assert.strictEqual(old.status, 'cancelled');
  assert.strictEqual(old.cancelReason, 'upgrade');
  assert.strictEqual(old.stages[0].type, 'single');
  ps.forEach((c) => c.close());
});

test('cập nhật trang giải: phần chung dựng một lần, phần riêng từng người; nén tin lớn; tối đa 512 người', async () => {
  const B = await admin();
  const [p1, p2] = [await account('pu'), await account('pu')];
  // Tối đa 512 người mỗi giải
  const big = await B.req({ t: 'tourCreate', name: 'Giải lớn', format: 'arena', startsAt: soon(), timeLimit: 30, maxPlayers: 9999 }, 'tourCreated');
  assert.strictEqual(app.hub.tours.get(big.id).maxPlayers, 512);
  B.send({ t: 'tourCancel', id: big.id });
  const { id } = await B.req({ t: 'tourCreate', name: 'Cập nhật', format: 'bracket', startsAt: soon(), timeLimit: 30, checkin: false,
    stages: [{ type: 'roundrobin', groups: 1, bestOf: 1, advance: 1 }, { type: 'single', bestOf: 1 }] }, 'tourCreated');
  await B.req({ t: 'tourGet', id }, 'tour', (m) => m.id === id);
  await p1.req({ t: 'tourGet', id }, 'tour', (m) => m.id === id);
  // p2 đăng ký -> người đang xem nhận bản cập nhật
  const gotB = B.wait('tour', (m) => m.id === id && m.mine && m.shared.count === 1);
  const got1 = p1.wait('tour', (m) => m.id === id && m.mine && m.shared.count === 1);
  await p2.req({ t: 'tourJoin', id }, 'toast');
  const [mb, m1] = await Promise.all([gotB, got1]);
  const strip = (x) => ({ ...x, now: 0 });
  assert.deepStrictEqual(strip(mb.shared), strip(m1.shared), 'phần chung giống hệt nhau');
  for (const k of ['groupDraft', 'reviewNote', 'canManage', 'me', 'myMatch']) assert.ok(!(k in mb.shared), 'phần chung không có ' + k);
  assert.strictEqual(mb.mine.canManage, true);
  assert.strictEqual(mb.mine.groupDraft.groups.flat().length, 1, 'ban tổ chức thấy bảng dự kiến');
  assert.strictEqual(m1.mine.canManage, false);
  assert.strictEqual(m1.mine.groupDraft, null, 'người khác không thấy bảng dự kiến');
  // Giải đông người: giãn nhịp cập nhật tới 2 giây
  const fake = (n) => ({ players: Array.from({ length: n }, () => ({})) });
  assert.strictEqual(app.hub.pushDelay(fake(3)), app.hub.T.TOUR_PUSH_MS);
  assert.strictEqual(app.hub.pushDelay(fake(128)), 512);
  assert.strictEqual(app.hub.pushDelay(fake(512)), 2000);
  // Kết nối WebSocket có nén (permessage-deflate)
  assert.match(B.ws.extensions, /permessage-deflate/);
  B.send({ t: 'tourCancel', id });
  [p1, p2].forEach((c) => c.close());
});

test('chống spam mở trang giải: dùng lại phần chung đã lưu, giới hạn lượt theo IP, hết lượt thì nhận ở nhịp sau', async () => {
  const B = await admin();
  const { id } = await B.req({ t: 'tourCreate', name: 'Chống spam', format: 'bracket', startsAt: soon(), timeLimit: 30, stages: [{ type: 'single' }] }, 'tourCreated');
  const t = app.hub.tours.get(id);
  // Phần chung chỉ dựng lại khi giải đổi
  let builds = 0;
  const orig = app.hub.tourShared;
  app.hub.tourShared = function (tt, ...a) { if (tt.id === id) builds++; return orig.call(this, tt, ...a); };
  try {
    const cs = [await Client.open(), await Client.open(), await Client.open()]; // cùng IP 127.0.0.1
    app.hub.fullBuckets?.clear();
    const got = cs.map(() => 0);
    cs.forEach((c, i) => c.ws.on('message', (d) => { if (String(d).startsWith('{"t":"tour",')) got[i]++; }));
    // Đợt 1: mở trang lần đầu (dựng phần chung + mốc so sánh cho cập nhật)
    cs.forEach((c) => c.send({ t: 'tourGet', id }));
    await until(() => got.every((n) => n > 0));
    await sleep(150);
    const b1 = builds;
    // Đợt 2: spam 57 lần nữa khi giải không đổi -> không dựng lại lần nào
    for (let k = 0; k < 19; k++) cs.forEach((c) => c.send({ t: 'tourGet', id }));
    await sleep(150);
    assert.strictEqual(builds, b1, `spam mở trang khi giải không đổi không được dựng lại phần chung (${b1} -> ${builds})`);
    const now = got.reduce((a, b) => a + b, 0);
    // 40 lượt theo IP + mỗi kết nối nhận thêm tối đa 1 bản ở nhịp cập nhật kế tiếp (trong kiểm thử: 20 ms)
    assert.ok(now >= 40 && now <= 40 + 2 * cs.length, `trả ngay khoảng 40 lần (hết lượt theo IP): ${now}`);
    // Người hết lượt vẫn nhận trang giải ở nhịp cập nhật kế tiếp
    const waiting = () => [...app.hub.byPid.values()].flatMap((set) => [...set]).filter((c) => c.watchTour === id && c.tourFull);
    await until(() => got.every((n) => n > 0) && !waiting().length, 3000);
    // Máy chủ vẫn trả lời bình thường
    assert.strictEqual((await cs[0].req({ t: 'tourList' }, 'tourList')).t, 'tourList');
    // Giải đổi -> bỏ bản đã lưu
    const before = builds;
    app.hub.pushTour(t);
    app.hub.fullBuckets.clear();
    await cs[1].req({ t: 'tourGet', id }, 'tour', (m) => m.id === id);
    assert.ok(builds > before, 'giải đổi thì dựng lại phần chung');
    cs.forEach((c) => c.close());
  } finally {
    app.hub.tourShared = orig;
    B.send({ t: 'tourCancel', id });
  }
});

/** Ban tổ chức riêng cho từng bài (mỗi người chỉ có tối đa 3 giải chưa kết thúc). */
async function organizer() {
  const o = await account('org');
  app.hub.admins.add(o.me.username);
  return o;
}
/** Người chơi mất kết nối rồi vào lại (đăng nhập ở kết nối mới). */
async function reconnect(c) {
  const n = await Client.open();
  await n.req({ t: 'login', username: c.me.username, password: 'caro-pass1' }, 'welcome');
  return n;
}

test('loại trực tiếp Bo3: mất kết nối thì trận tạm dừng; ban tổ chức huỷ kết quả -> đánh tiếp từ tỉ số trước', async () => {
  const B = await organizer();
  const keep = app.hub.T.TOUR_DISPUTE_MS;
  app.hub.T.TOUR_DISPUTE_MS = 60000; // không tự công nhận trong lúc test
  try {
    const p1 = await account('dc', 1600);
    let p2 = await account('dc', 1500);
    const { id } = await B.req({ t: 'tourCreate', name: 'Mất mạng', format: 'knockout', startsAt: soon(), timeLimit: 30, bestOf: 3, thirdPlace: false, checkin: false }, 'tourCreated');
    for (const p of [p1, p2]) await p.req({ t: 'tourJoin', id }, 'toast');
    B.send({ t: 'tourStart', id });
    await waitRoom(p1, (r) => r.tour && r.players.length === 2);
    await waitRoom(p2, (r) => r.tour && r.players.length === 2);
    const t = app.hub.tours.get(id);
    const m = Object.values(t.st[0].matches)[0];
    await playOut(p1, p2); // ván 1: p1 thắng
    await waitRoom(p1, (r) => r.gameNo === 2 && !r.winner);
    // Ván 2: p2 mất kết nối quá hạn -> thua ván, trận tạm dừng chờ ban tổ chức
    p2.close();
    await until(() => !!m.hold);
    assert.strictEqual(m.done, false);
    const d = t.disputes[t.disputes.length - 1];
    assert.deepStrictEqual([d.kind, d.status, d.w, d.l], ['bracket', 'open', p1.me.uid, p2.me.uid]);
    assert.strictEqual(m.wins[p1.me.uid], 1, 'ván mất kết nối chưa được tính');
    const v = await B.req({ t: 'tourGet', id }, 'tour');
    assert.ok(v.tour.disputes.some((x) => x.id === d.id && x.status === 'open'));
    assert.ok(v.tour.stageViews[0].rounds[0].some((x) => x && x.held), 'trang giải: trận đang chờ quyết định');
    // Người không phải ban tổ chức không xử lý được
    assert.strictEqual((await p1.req({ t: 'tourDispute', id, dispute: d.id, action: 'confirm' }, 'error')).code, 'tour_managers_only');
    // p2 vào lại; ban tổ chức huỷ kết quả ván đó -> trận mở lại với tỉ số 1–0, ván thứ 2
    p2 = await reconnect(p2);
    const back = waitRoom(p2, (r) => r.tour && r.players.length === 2 && !r.winner, 3000);
    await B.req({ t: 'tourDispute', id, dispute: d.id, action: 'annul' }, 'toast', (x) => x.code === 'tour_dispute_saved');
    const r = await back;
    assert.strictEqual(d.status, 'annulled');
    assert.strictEqual(r.gameNo, 2);
    assert.strictEqual(r.score[p1.me.id], 1);
    assert.strictEqual(r.score[p2.me.id], 0);
    // Xử lý lại lần nữa: không được
    assert.strictEqual((await B.req({ t: 'tourDispute', id, dispute: d.id, action: 'confirm' }, 'error')).code, 'dispute_gone');
    await waitRoom(p1, (x) => x.code === r.code && !x.winner);
    await playOut(p1, p2); // p1 thắng ván 2 -> 2–0, vô địch
    await until(() => t.status === 'finished');
    assert.strictEqual(t.podium[0], p1.me.uid);
    [p1, p2, B].forEach((c) => c.close());
  } finally { app.hub.T.TOUR_DISPUTE_MS = keep; }
});

test('Arena: mất kết nối -> điểm tính ngay; ban tổ chức cho đấu lại -> trả lại điểm, ghép lại hai người', async () => {
  const B = await organizer();
  const a = await account('ad', 1500);
  let b = await account('ad', 1490);
  const { id } = await B.req({ t: 'tourCreate', name: 'Arena mất mạng', format: 'arena', startsAt: soon(), timeLimit: 30, minutes: 30, rated: false }, 'tourCreated');
  await a.req({ t: 'tourJoin', id }, 'toast');
  await b.req({ t: 'tourJoin', id }, 'toast');
  B.send({ t: 'tourStart', id });
  const newGame = (r) => r.tour && r.tour.arena && !r.winner && r.players.length === 2;
  await waitRoom(a, newGame);
  const t = app.hub.tours.get(id);
  const P = (uid) => t.players.find((p) => p.uid === uid);
  b.close();
  await until(() => P(a.me.uid).games === 1);
  assert.strictEqual(P(a.me.uid).score, 2, 'thắng vì đối thủ mất kết nối: được điểm ngay');
  const d = t.disputes[t.disputes.length - 1];
  assert.deepStrictEqual([d.kind, d.status], ['arena', 'open']);
  b = await reconnect(b);
  await sleep(100);
  const again = waitRoom(b, newGame, 3000);
  await B.req({ t: 'tourDispute', id, dispute: d.id, action: 'replay' }, 'toast', (x) => x.code === 'tour_dispute_saved');
  await again;
  assert.strictEqual(P(a.me.uid).score, 0, 'điểm được trả lại');
  assert.strictEqual(P(a.me.uid).games, 0);
  assert.strictEqual(P(b.me.uid).losses, 0);
  assert.ok(t.games.find((g) => g.gid === d.gid).annulled);
  assert.strictEqual(d.status, 'replayed');
  // Giải kết thúc: không đổi được nữa
  t.endsAt = Date.now();
  b.send({ t: 'resign' });
  await until(() => t.status === 'finished');
  assert.strictEqual((await B.req({ t: 'tourDispute', id, dispute: d.id, action: 'annul' }, 'error')).code, 'dispute_gone');
  [a, b, B].forEach((c) => c.close());
});

test('Thụy Sĩ 4 người 3 vòng (có hoà, không gặp lại) và nhánh thắng-thua 3 người', async () => {
  const B = await admin();
  const ps = [];
  for (let i = 0; i < 4; i++) ps.push(await account('sw', 1700 - i * 10));
  const sw = await B.req({ t: 'tourCreate', name: 'Thụy Sĩ', format: 'bracket', startsAt: soon(), timeLimit: 30, checkin: false,
    stages: [{ type: 'swiss', rounds: 3, bestOf: 1, points: { w: 2, d: 1, l: 0 } }] }, 'tourCreated');
  // (4 người: đánh đủ 3 vòng vẫn luôn ghép được mà không ai gặp lại)
  for (const p of ps) await p.req({ t: 'tourJoin', id: sw.id }, 'toast');
  B.send({ t: 'tourStart', id: sw.id });
  const t = app.hub.tours.get(sw.id);
  await until(() => t.status === 'running');
  let n = 0;
  await autoPlay(t, ps, (a, b) => (++n === 2 ? null : a), 60000);
  assert.strictEqual(t.status, 'finished');
  const pairs = Object.values(t.st[0].matches).map((m) => [m.a, m.b].sort().join());
  assert.strictEqual(new Set(pairs).size, pairs.length, 'không gặp lại');
  assert.strictEqual(t.st[0].rounds.length, 3);
  assert.strictEqual(t.podium.length, 3);
  // Nhánh thắng-thua 3 người: ai cũng phải thua 2 trận mới bị loại (trừ vô địch)
  const de = await B.req({ t: 'tourCreate', name: 'Thắng thua', format: 'bracket', startsAt: soon(), timeLimit: 30, checkin: false,
    stages: [{ type: 'double', bestOf: 1, reset: true }] }, 'tourCreated');
  for (const p of ps.slice(0, 3)) await p.req({ t: 'tourJoin', id: de.id }, 'toast');
  B.send({ t: 'tourStart', id: de.id });
  const d = app.hub.tours.get(de.id);
  await until(() => d.status === 'running');
  const sd = (c) => d.players.find((p) => p.uid === c.me.uid).seed;
  await autoPlay(d, ps.slice(0, 3), (a, b) => (sd(a) < sd(b) ? a : b), 60000);
  assert.strictEqual(d.status, 'finished');
  // (Elo đã đổi sau giải Thụy Sĩ nên xét theo hạt giống thực tế)
  const bySeed = d.players.filter((p) => p.seed).sort((a, b) => a.seed - b.seed).map((p) => p.uid);
  assert.deepStrictEqual(d.podium, bySeed);
  const losses = (u) => Object.values(d.st[0].matches).filter((m) => m.done && m.loser === u).length;
  assert.strictEqual(losses(bySeed[2]), 2);
  assert.strictEqual(losses(bySeed[0]), 0);
  ps.forEach((c) => c.close());
});

test('giải của câu lạc bộ: chỉ quản lý tạo được, chỉ thành viên đăng ký được, danh sách theo quyền', async () => {
  const B = await admin();
  const owner = await account('tco');
  const mem = await account('tcm');
  const out = await account('tcx');
  const { id: club } = await owner.req({ t: 'clubCreate', name: 'CLB Giải ' + seq, join: 'open' }, 'clubCreated');
  await B.req({ t: 'adminReview', kind: 'club', id: club, approve: true }, 'adminQueue');
  await mem.req({ t: 'clubJoin', id: club }, 'toast', (m) => m.code === 'club_joined');
  assert.strictEqual((await mem.req({ t: 'tourCreate', name: 'Giải trộm', format: 'arena', startsAt: soon(), access: 'club', club }, 'error')).code, 'tour_club_officers');
  const { id } = await owner.req({ t: 'tourCreate', name: 'Giải nội bộ', format: 'arena', startsAt: soon(), access: 'club', club }, 'tourCreated');
  await B.req({ t: 'adminReview', kind: 'tour', id, approve: true }, 'adminQueue');
  assert.ok((await mem.req({ t: 'tourList' }, 'tourList')).items.some((x) => x.id === id));
  assert.ok(!(await out.req({ t: 'tourList' }, 'tourList')).items.some((x) => x.id === id));
  assert.strictEqual((await out.req({ t: 'tourJoin', id }, 'error')).code, 'tour_not_found');
  await mem.req({ t: 'tourJoin', id }, 'toast', (m) => m.code === 'tour_joined');
  const cv = await mem.req({ t: 'clubGet', id: club }, 'club');
  assert.ok(cv.club.tours.some((x) => x.id === id), 'trang CLB hiện giải của CLB');
  // Giới hạn số giải chưa xong mỗi người
  for (let i = 0; i < 2; i++) await out.req({ t: 'tourCreate', name: 'Giải ' + i, format: 'arena', startsAt: soon() }, 'tourCreated');
  await out.req({ t: 'tourCreate', name: 'Giải 3', format: 'arena', startsAt: soon() }, 'tourCreated');
  assert.strictEqual((await out.req({ t: 'tourCreate', name: 'Giải 4', format: 'arena', startsAt: soon() }, 'error')).code, 'tour_limit');
  // Ban tổ chức huỷ giải -> người đăng ký được báo
  const cancelled = mem.wait('toast', (m) => m.code === 'tour_cancelled');
  owner.send({ t: 'tourCancel', id });
  await cancelled;
  [owner, mem, out].forEach((c) => c.close());
});

test('giải và câu lạc bộ được lưu: máy chủ khởi động lại vẫn còn', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-tour-'));
  const file = path.join(dir, 'caro.db');
  let srv = start({ port: 0, dataFile: file, admins: ['boss'], timers: TIMERS, msgRate: 2000 });
  await new Promise((r) => srv.server.on('listening', r));
  let u = `ws://127.0.0.1:${srv.server.address().port}/ws`;
  const c = await Client.open(u);
  await c.req({ t: 'register', username: 'boss', password: 'caro-pass1', name: 'Boss' }, 'welcome');
  const { id: club } = await c.req({ t: 'clubCreate', name: 'CLB Bền', join: 'open' }, 'clubCreated');
  const { id } = await c.req({ t: 'tourCreate', name: 'Giải Bền', format: 'knockout', startsAt: soon(), access: 'club', club }, 'tourCreated');
  c.close();
  await srv.stop();
  srv = start({ port: 0, dataFile: file, admins: ['boss'], timers: TIMERS, msgRate: 2000 });
  await new Promise((r) => srv.server.on('listening', r));
  u = `ws://127.0.0.1:${srv.server.address().port}/ws`;
  const d = await Client.open(u);
  await d.req({ t: 'login', username: 'boss', password: 'caro-pass1' }, 'welcome');
  const v = await d.req({ t: 'tourGet', id }, 'tour');
  assert.strictEqual(v.tour.name, 'Giải Bền');
  assert.strictEqual(v.tour.club.name, 'CLB Bền');
  assert.strictEqual(v.tour.status, 'scheduled');
  d.close();
  await srv.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});
