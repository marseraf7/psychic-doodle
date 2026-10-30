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

// Đăng ký / đăng nhập băm mật khẩu bằng scrypt: máy chậm hoặc chạy chung đo độ phủ có thể quá 3 giây
const AUTH_MS = 15000;

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
    await c.wait('welcome', undefined, AUTH_MS);
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
  async req(m, t, pred, ms) { const p = this.wait(t, pred, ms); this.send(m); return p; }
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
  await c.req({ t: 'register', username, password: 'caro-pass1', name: prefix + seq }, 'welcome', undefined, AUTH_MS);
  if (rating) app.hub.store.users.get(c.me.uid).rating = rating;
  return c;
}
let boss;
async function admin() {
  if (boss) return boss;
  for (const k of [...app.hub.fails.keys()]) if (k.startsWith('reg:')) app.hub.fails.delete(k);
  boss = await Client.open();
  await boss.req({ t: 'register', username: 'boss', password: 'caro-pass1', name: 'Boss' }, 'welcome', undefined, AUTH_MS);
  return boss;
}
const soon = () => Date.now() + 5 * 60 * 1000;

/**
 * Người thắng xếp 5 quân ở hàng 0, người thua đánh rải rác ở hàng 5 (chờ cả hai nhận trạng thái mới).
 * Ván xong chưa / tới lượt ai: xem trên máy chủ (trạng thái chuẩn), không dựa vào phòng client đang nhớ – client có thể
 * vừa nhận tin của trận khác (giải tự chuyển người chơi sang trận kế tiếp ngay khi ván xong).
 */
async function playOut(winner, loser) {
  const code = winner.room.code;
  const srv = app.hub.rooms.get(code);
  let i = 0, j = 0;
  while (srv && app.hub.rooms.get(code) === srv && srv.active) {
    const turnC = srv.actor() === winner.me.id ? winner : loser;
    const other = turnC === winner ? loser : winner;
    const n = srv.board.moves.length + 1;
    const done = (m) => m.room && (m.room.code !== code || m.room.moves.length >= n || !!m.room.winner);
    const p = Promise.all([turnC.wait('room', done), other.wait('room', done)]);
    turnC.send(turnC === winner ? { t: 'move', x: i++, y: 0 } : { t: 'move', x: (j++) * 3, y: 5 });
    try { await p; } catch (e) {
      // Hết giờ chờ: in thêm lỗi của cả hai người và trạng thái phòng để biết nguyên nhân
      const info = (c) => ({ me: c.me.id, errors: c.msgs.filter((m) => m.t === 'error').slice(-3),
        room: c.room && { code: c.room.code, turn: c.room.turn, moves: c.room.moves.length, winner: c.room.winner, seats: c.room.seats } });
      e.message += ' | người đi: ' + JSON.stringify(info(turnC)) + ' | người kia: ' + JSON.stringify(info(other))
        + ' | máy chủ: ' + JSON.stringify({ code, active: srv.active, moves: srv.board.moves.length, actor: srv.actor() });
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
  const B = await organizer();
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
  const B = await organizer();
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
  const B = await organizer();
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
  const B = await organizer();
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
  const B = await organizer();
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
  const B = await organizer();
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
  const B = await organizer();
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
  const B = await organizer();
  const { id } = await B.req({ t: 'tourCreate', name: 'Chống spam', format: 'bracket', startsAt: soon(), timeLimit: 30, stages: [{ type: 'single' }] }, 'tourCreated');
  const t = app.hub.tours.get(id);
  // Phần chung chỉ dựng lại khi giải đổi
  let builds = 0;
  const orig = app.hub.tourShared;
  app.hub.tourShared = function (tt, ...a) { if (tt.id === id) builds++; return orig.call(this, tt, ...a); };
  try {
    const cs = [await Client.open(), await Client.open(), await Client.open()]; // cùng IP 127.0.0.1
    app.hub.fullBuckets?.clear();
    const t0 = Date.now();
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
    // 40 lượt theo IP + lượt hồi lại theo thời gian đã trôi (4 lượt/giây – máy chậm thì nhiều hơn)
    // + mỗi kết nối nhận thêm tối đa 1 bản ở nhịp cập nhật kế tiếp (trong kiểm thử: 20 ms)
    const refill = Math.ceil(((Date.now() - t0) / 1000) * 4);
    assert.ok(now >= 40 && now <= 40 + refill + 2 * cs.length, `trả ngay khoảng 40 lần (hết lượt theo IP): ${now}, hồi ${refill}`);
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

/** Ban tổ chức (quản trị viên) riêng cho từng bài: mỗi người chỉ có tối đa 3 giải chưa kết thúc, dùng chung một
 *  người thì bài sau phụ thuộc vào việc giải của bài trước đã kết thúc kịp hay chưa. */
async function organizer() {
  const o = await account('org');
  app.hub.admins.add(o.me.username);
  return o;
}
/** Người chơi mất kết nối rồi vào lại (đăng nhập ở kết nối mới). */
async function reconnect(c) {
  const n = await Client.open();
  await n.req({ t: 'login', username: c.me.username, password: 'caro-pass1' }, 'welcome', undefined, AUTH_MS);
  return n;
}

test('ván giải: cả hai cùng mất kết nối vẫn xử thua người rớt trước (không huỷ kiểu #140), có khiếu nại', async () => {
  const B = await organizer();
  const keep = app.hub.T.TOUR_DISPUTE_MS;
  app.hub.T.TOUR_DISPUTE_MS = 60000;
  try {
    const p1 = await account('bo', 1600);
    const p2 = await account('bo', 1500);
    const { id } = await B.req({ t: 'tourCreate', name: 'Cả hai rớt', format: 'knockout', startsAt: soon(), timeLimit: 30, bestOf: 1, thirdPlace: false, checkin: false }, 'tourCreated');
    for (const p of [p1, p2]) await p.req({ t: 'tourJoin', id }, 'toast');
    B.send({ t: 'tourStart', id });
    await waitRoom(p1, (r) => r.tour && r.players.length === 2);
    const t = app.hub.tours.get(id);
    const room = app.hub.roomFor(p1.me.id);
    p1.close();
    await sleep(50);
    p2.close(); // p2 rớt sau, lúc hẹn giờ của p1 hết hạn thì p2 cũng offline
    await until(() => !!room.winner);
    assert.strictEqual(room.reason, 'timeout');
    assert.strictEqual(room.winner, room.sideOf(p2.me.id), 'người rớt trước (p1) thua');
    await until(() => t.disputes.length > 0);
    assert.strictEqual(t.disputes[t.disputes.length - 1].l, p1.me.uid, 'p1 khiếu nại mất kết nối được');
  } finally { app.hub.T.TOUR_DISPUTE_MS = keep; }
});

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
  // Máy chậm: đăng nhập lại (scrypt) lâu hơn ARENA_REPEAT_MS thì Arena tự ghép lại hai người trước khi ban tổ chức
  // xử lý -> nhận 'replay_later' thay vì ghép ngay. Không cho tự ghép lại trong lúc test.
  const keep = app.hub.T.ARENA_REPEAT_MS;
  app.hub.T.ARENA_REPEAT_MS = 60000;
  let d;
  try {
    b.close();
    await until(() => P(a.me.uid).games === 1);
    assert.strictEqual(P(a.me.uid).score, 2, 'thắng vì đối thủ mất kết nối: được điểm ngay');
    d = t.disputes[t.disputes.length - 1];
    assert.deepStrictEqual([d.kind, d.status], ['arena', 'open']);
    b = await reconnect(b);
    await sleep(100);
    const again = waitRoom(b, newGame, 3000);
    await B.req({ t: 'tourDispute', id, dispute: d.id, action: 'replay' }, 'toast', (x) => x.code === 'tour_dispute_saved');
    await again;
  } finally {
    app.hub.T.ARENA_REPEAT_MS = keep;
  }
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
  const B = await organizer();
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

test('tuỳ chọn như Challonge: Bo3 chung kết, trận xếp hạng; nhánh thắng – thua split + không chung kết tổng', async () => {
  const B = await organizer();
  const ps = [];
  for (let i = 0; i < 4; i++) ps.push(await account('pl', 1650 - i * 10));
  const sg = await B.req({ t: 'tourCreate', name: 'Xếp hạng', format: 'bracket', startsAt: soon(), timeLimit: 30, checkin: false, noShowMin: 5,
    stages: [{ type: 'single', bestOf: 1, boFinal: 3, placement: true }] }, 'tourCreated');
  for (const p of ps) await p.req({ t: 'tourJoin', id: sg.id }, 'toast');
  const t = app.hub.tours.get(sg.id);
  assert.strictEqual(t.noShowMin, 5, 'lưu thời gian chờ vắng mặt');
  const watcher = await account('plw');
  await watcher.req({ t: 'tourGet', id: sg.id }, 'tour'); // xem trang giải suốt giải: nhận bản vá
  B.send({ t: 'tourStart', id: sg.id });
  await until(() => t.status === 'running');
  const sd = (c) => t.players.find((p) => p.uid === c.me.uid).seed;
  const bos = new Set();
  await autoPlay(t, ps, (a, b) => {
    const r = [...app.hub.rooms.values()].find((x) => x.tour && x.tour.id === t.id && x.active && x.full);
    if (r) bos.add(r.tour.match + ':' + r.bestOf);
    return sd(a) < sd(b) ? a : b;
  }, 60000);
  assert.strictEqual(t.status, 'finished');
  const st = t.st[0];
  const final = st.rounds[st.rounds.length - 1][0];
  assert.ok(bos.has(final + ':3'), 'chung kết Bo3 – ' + [...bos].join(' '));
  assert.ok([...bos].some((x) => x.startsWith(st.third + ':1')), 'tranh hạng ba Bo1');
  const bySeed = t.players.filter((p) => p.seed).sort((a, b) => a.seed - b.seed).map((p) => p.uid);
  assert.deepStrictEqual(t.podium.slice(0, 3), bySeed.slice(0, 3));
  const v = await ps[3].req({ t: 'tourGet', id: sg.id }, 'tour');
  assert.strictEqual(v.tour.noShowMin, 5);
  assert.strictEqual(v.tour.stageViews[0].rounds[1][0].bo, 3, 'trang giải ghi Bo3 cho chung kết');
  // Người xem từ đầu (chỉ nhận bản vá) có đúng trang giải như bản đầy đủ, kể cả trận tranh hạng ba
  await until(() => watcher.tours[sg.id] && watcher.tours[sg.id].status === 'finished');
  await sleep(100);
  assert.deepStrictEqual(watcher.tours[sg.id].stageViews, v.shared.stageViews);
  watcher.close();
  // Nhánh thắng – thua 4 người, split, không chung kết tổng: hạt giống 3, 4 bắt đầu ở nhánh thua
  const de = await B.req({ t: 'tourCreate', name: 'Split', format: 'bracket', startsAt: soon(), timeLimit: 30, checkin: false,
    stages: [{ type: 'double', bestOf: 1, gf: 'none', split: true }] }, 'tourCreated');
  for (const p of ps) await p.req({ t: 'tourJoin', id: de.id }, 'toast');
  B.send({ t: 'tourStart', id: de.id });
  const d = app.hub.tours.get(de.id);
  await until(() => d.status === 'running');
  const sd2 = (c) => d.players.find((p) => p.uid === c.me.uid).seed;
  let played = 0;
  await autoPlay(d, ps, (a, b) => { played++; return sd2(a) < sd2(b) ? a : b; }, 60000);
  assert.strictEqual(d.status, 'finished');
  assert.strictEqual(played, 3, 'split + không chung kết tổng: 4 người chỉ 3 trận (CK nhánh thắng, 2 trận nhánh thua)');
  const seeds2 = d.players.filter((p) => p.seed).sort((a, b) => a.seed - b.seed).map((p) => p.uid);
  assert.deepStrictEqual(d.podium.slice(0, 3), seeds2.slice(0, 3));
  const dv = await ps[0].req({ t: 'tourGet', id: de.id }, 'tour');
  assert.ok(dv.tour.stageViews[0].split && dv.tour.stageViews[0].gf.length === 0);
  ps.forEach((c) => c.close());
});

test('đăng ký nâng cao: mã vào, điều kiện Elo, câu hỏi, duyệt tay, danh sách chờ tự lên, hạn chót', async () => {
  const B = await organizer();
  const ps = [];
  for (let i = 0; i < 5; i++) ps.push(await account('rg', 1500 + i * 10));
  const { id } = await B.req({ t: 'tourCreate', name: 'Đăng ký', format: 'bracket', startsAt: soon(), timeLimit: 30, checkin: false, maxPlayers: 3,
    stages: [{ type: 'single', bestOf: 1 }],
    reg: { code: 'CARO1', minRating: 1505, approval: true, waitlist: true, questions: [{ q: 'CLB của bạn?' }, { q: 'Cỡ áo', type: 'choice', opts: ['S', 'M'] }] } }, 'tourCreated');
  const t = app.hub.tours.get(id);
  const err = async (c, m) => (await c.req(m, 'error')).code;
  assert.strictEqual(await err(ps[1], { t: 'tourJoin', id, code: 'sai' }), 'tour_bad_code');
  assert.strictEqual(await err(ps[0], { t: 'tourJoin', id, code: 'CARO1' }), 'tour_rating_low', 'Elo 1500 < 1505');
  assert.strictEqual(await err(ps[1], { t: 'tourJoin', id, code: 'CARO1', answers: ['Hà Nội', 'XL'] }), 'tour_answers_required', 'đáp án ngoài lựa chọn');
  for (const c of ps.slice(1)) await c.req({ t: 'tourJoin', id, code: 'CARO1', answers: ['CLB ' + c.me.name, 'M'] }, 'toast');
  assert.strictEqual(t.players.length, 0, 'duyệt tay: chưa ai vào giải');
  assert.strictEqual(t.queue.filter((x) => x.state === 'pending').length, 4);
  // Người xem thường không thấy câu trả lời; ban tổ chức thấy
  const pub = await ps[1].req({ t: 'tourGet', id }, 'tour');
  assert.strictEqual(pub.tour.regAdmin, null);
  assert.strictEqual(pub.tour.reg.hasCode, true);
  assert.ok(!JSON.stringify(pub.tour).includes('CARO1'), 'mã vào không lộ cho người chơi');
  assert.deepStrictEqual(pub.tour.myQueue, { state: 'pending', pos: 1 });
  const adm = await B.req({ t: 'tourGet', id }, 'tour');
  assert.strictEqual(adm.tour.regAdmin.queue.length, 4);
  assert.deepStrictEqual(adm.tour.regAdmin.queue[0].answers, ['CLB ' + ps[1].me.name, 'M']);
  // Duyệt 4 người, giải chỉ 3 chỗ: người thứ 4 vào danh sách chờ
  for (const c of ps.slice(1)) B.send({ t: 'tourRegDecide', id, uid: c.me.uid, accept: true });
  await until(() => t.players.length === 3 && t.queue.length === 1 && t.queue[0].state === 'wait');
  assert.deepStrictEqual(t.players.find((p) => p.uid === ps[1].me.uid).answers, ['CLB ' + ps[1].me.name, 'M']);
  // Một người rút → người đầu danh sách chờ tự vào
  await ps[1].req({ t: 'tourLeave', id }, 'tour');
  await until(() => t.players.some((p) => p.uid === ps[4].me.uid) && !t.queue.length);
  // Từ chối: người bị từ chối không vào giải
  const c2 = await account('rg', 1600);
  await c2.req({ t: 'tourJoin', id, code: 'CARO1', answers: ['X', 'S'] }, 'toast');
  B.send({ t: 'tourRegDecide', id, uid: c2.me.uid, accept: false });
  await until(() => !t.queue.length);
  assert.ok(!t.players.some((p) => p.uid === c2.me.uid));
  // Hạn chót đã qua: không đăng ký được
  t.reg.closeAt = Date.now() - 1000;
  assert.strictEqual(await err(c2, { t: 'tourJoin', id, code: 'CARO1', answers: ['X', 'S'] }), 'tour_reg_closed');
  [...ps, c2].forEach((c) => c.close());
});

test('Bulk Add: giải trực tuyến thêm theo tên đăng nhập; giải offline thêm theo tên, nhập tỉ số theo set, huỷ kết quả', async () => {
  const B = await organizer();
  const a = await account('ba', 1500), b = await account('ba', 1400);
  const on = await B.req({ t: 'tourCreate', name: 'Mời', format: 'bracket', startsAt: soon(), timeLimit: 30, checkin: false, stages: [{ type: 'single' }] }, 'tourCreated');
  const r = await B.req({ t: 'tourAddPlayers', id: on.id, names: ['@' + a.me.username, b.me.username.toUpperCase(), 'khongcoai_' + seq, a.me.username] }, 'tourAddResult');
  assert.deepStrictEqual(r.added.length, 2);
  assert.deepStrictEqual(r.missing, ['khongcoai_' + seq]);
  assert.strictEqual(app.hub.tours.get(on.id).players.length, 2);
  assert.strictEqual((await a.req({ t: 'tourAddPlayers', id: on.id, names: ['x'] }, 'error')).code, 'tour_managers_only');
  // Giải offline: 4 người theo tên (không tài khoản), loại trực tiếp Bo3 nhập theo set
  const off = await B.req({ t: 'tourCreate', name: 'Cầu lông', format: 'bracket', startsAt: soon(), timeLimit: 30, offline: true, rated: true,
    stages: [{ type: 'single', bestOf: 3, thirdPlace: false }] }, 'tourCreated');
  const t = app.hub.tours.get(off.id);
  assert.ok(t.offline && !t.rated && !t.checkin && t.seeding === 'list', 'offline: không tính Elo, không điểm danh, hạt giống theo danh sách');
  const r2 = await B.req({ t: 'tourAddPlayers', id: off.id, names: ['An', 'Bình', 'an', '', 'Chi', 'Dũng'] }, 'tourAddResult');
  assert.deepStrictEqual(r2.added, ['An', 'Bình', 'Chi', 'Dũng'], 'bỏ dòng trống và tên trùng');
  assert.strictEqual((await a.req({ t: 'tourJoin', id: off.id }, 'error')).code, 'tour_offline_join');
  B.send({ t: 'tourStart', id: off.id });
  await until(() => t.status === 'running');
  await sleep(100);
  const st = t.st[0];
  const [m1, m2] = st.rounds[0].map((x) => st.matches[x]);
  assert.ok(!m1.room && !m2.room, 'không mở phòng cho trận ngoài đời');
  const name = (u) => t.players.find((p) => p.uid === u).name;
  assert.deepStrictEqual([name(m1.a), name(m1.b)], ['An', 'Dũng'], 'hạt giống theo thứ tự thêm: 1 gặp 4');
  const score = (m, sets, extra) => B.send({ t: 'tourScore', id: off.id, match: m.id, sets, extra });
  // Hoà số set ở loại trực tiếp: phải có kết quả phụ
  assert.strictEqual((await B.req({ t: 'tourScore', id: off.id, match: m1.id, sets: [[21, 15], [15, 21]] }, 'error')).code, 'tour_score_tie');
  await score(m1, [[21, 15], [15, 21]], [5, 3]);
  await until(() => m1.done);
  assert.strictEqual(name(m1.winner), 'An', 'kết quả phụ quyết định');
  await score(m2, [[21, 10], [21, 19]]);
  await until(() => m2.done);
  assert.deepStrictEqual(m2.sets, [[21, 10], [21, 19]]);
  const fin = st.matches[st.rounds[1][0]];
  assert.ok(fin.a && fin.b, 'chung kết đã có đủ 2 người');
  // Huỷ kết quả bán kết 2: chung kết mất một người; nhập lại người kia thắng
  B.send({ t: 'tourScoreUndo', id: off.id, match: m2.id });
  await until(() => !m2.done);
  assert.strictEqual(fin.b, null);
  await score(m2, [[10, 21], [19, 21]]);
  await until(() => m2.done && name(m2.winner) === 'Chi');
  await score(fin, [[21, 5], [21, 5]]);
  await until(() => t.status === 'finished');
  assert.strictEqual(name(t.podium[0]), 'An');
  // Đã đấu chung kết: không huỷ được bán kết nữa (giải đã xong)
  assert.strictEqual((await B.req({ t: 'tourScoreUndo', id: off.id, match: m2.id }, 'error')).code, 'tour_not_running');
  const v = await B.req({ t: 'tourGet', id: off.id }, 'tour');
  assert.deepStrictEqual(v.tour.stageViews[0].rounds[0][0].sets, [[21, 15], [15, 21]]);
  assert.deepStrictEqual(v.tour.stageViews[0].rounds[0][0].extra, [5, 3]);
  [a, b].forEach((c) => c.close());
});

test('giải offline vòng tròn: tính theo tổng điểm các set, được hoà; giải trực tuyến: ban tổ chức xử thắng trận chưa đấu', async () => {
  const B = await organizer();
  const off = await B.req({ t: 'tourCreate', name: 'Bóng bàn', format: 'bracket', startsAt: soon(), timeLimit: 30, offline: true, scoreMode: 'points',
    stages: [{ type: 'roundrobin', groups: 1, bestOf: 3, points: { w: 3, d: 1, l: 0 } }] }, 'tourCreated');
  await B.req({ t: 'tourAddPlayers', id: off.id, names: ['P1', 'P2', 'P3'] }, 'tourAddResult');
  B.send({ t: 'tourStart', id: off.id });
  const t = app.hub.tours.get(off.id);
  await until(() => t.status === 'running');
  const ms = () => Object.values(t.st[0].matches);
  const first = ms()[0];
  // 2 set thua nhưng tổng điểm cao hơn: thắng theo tổng điểm
  B.send({ t: 'tourScore', id: off.id, match: first.id, sets: [[30, 0], [10, 11], [10, 11]] });
  await until(() => first.done);
  assert.strictEqual(first.winner, first.a);
  for (const m of ms().filter((x) => !x.done)) {
    B.send({ t: 'tourScore', id: off.id, match: m.id, sets: [[11, 11]] }); // hoà
    await until(() => m.done || t.status === 'finished');
  }
  await until(() => t.status === 'finished');
  assert.ok(ms().filter((m) => m.winner === null).length >= 1, 'có trận hoà');
  // Giải trực tuyến: xử thắng trận chưa đấu (ghi đè)
  const p1 = await account('ov', 1500), p2 = await account('ov', 1400);
  const on = await B.req({ t: 'tourCreate', name: 'Ghi đè', format: 'bracket', startsAt: soon(), timeLimit: 30, checkin: false, stages: [{ type: 'single', bestOf: 1 }] }, 'tourCreated');
  for (const c of [p1, p2]) await c.req({ t: 'tourJoin', id: on.id }, 'toast');
  const o = app.hub.tours.get(on.id);
  B.send({ t: 'tourStart', id: on.id });
  await until(() => o.status === 'running');
  const m = o.st[0].matches[o.st[0].rounds[0][0]];
  await until(() => m.room);
  assert.strictEqual((await B.req({ t: 'tourScore', id: on.id, match: m.id, winner: p2.me.uid }, 'error')).code, 'tour_match_live', 'đang đấu thì không ghi đè');
  app.hub.leave(app.hub.rooms.get(m.room).players[0].id); // một người rời phòng: thua cả trận
  await until(() => o.status === 'finished');
  [p1, p2].forEach((c) => c.close());
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
  await c.req({ t: 'register', username: 'boss', password: 'caro-pass1', name: 'Boss' }, 'welcome', undefined, AUTH_MS);
  const { id: club } = await c.req({ t: 'clubCreate', name: 'CLB Bền', join: 'open' }, 'clubCreated');
  const { id } = await c.req({ t: 'tourCreate', name: 'Giải Bền', format: 'knockout', startsAt: soon(), access: 'club', club }, 'tourCreated');
  c.close();
  await srv.stop();
  srv = start({ port: 0, dataFile: file, admins: ['boss'], timers: TIMERS, msgRate: 2000 });
  await new Promise((r) => srv.server.on('listening', r));
  u = `ws://127.0.0.1:${srv.server.address().port}/ws`;
  const d = await Client.open(u);
  await d.req({ t: 'login', username: 'boss', password: 'caro-pass1' }, 'welcome', undefined, AUTH_MS);
  const v = await d.req({ t: 'tourGet', id }, 'tour');
  assert.strictEqual(v.tour.name, 'Giải Bền');
  assert.strictEqual(v.tour.club.name, 'CLB Bền');
  assert.strictEqual(v.tour.status, 'scheduled');
  d.close();
  await srv.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Đợt 3 – sửa sau review: Bulk Add bỏ qua tên không hợp lệ và thêm tiếp; Arena đang chạy: duyệt tay, danh sách chờ tự lên', async () => {
  const B = await organizer();
  const off = await B.req({ t: 'tourCreate', name: 'Tên lạ', format: 'bracket', startsAt: soon(), timeLimit: 30, offline: true, stages: [{ type: 'single' }] }, 'tourCreated');
  const r = await B.req({ t: 'tourAddPlayers', id: off.id, names: ['An', 'fuck', 'Bình'] }, 'tourAddResult');
  assert.deepStrictEqual(r.bad, ['fuck'], 'tên phản cảm: báo riêng, các dòng sau vẫn được thêm');
  assert.deepStrictEqual(r.added, ['An', 'Bình']);
  const t = app.hub.tours.get(off.id);
  assert.strictEqual(t.players.length, 2);
  // Arena đang chạy, 2 chỗ, có duyệt tay + danh sách chờ
  const ps = [];
  for (let i = 0; i < 4; i++) ps.push(await account('ar', 1500));
  const ar = await B.req({ t: 'tourCreate', name: 'Arena duyệt', format: 'arena', startsAt: soon(), timeLimit: 30, minutes: 30, maxPlayers: 2, reg: { approval: true, waitlist: true } }, 'tourCreated');
  const a = app.hub.tours.get(ar.id);
  for (const c of ps.slice(0, 2)) { await c.req({ t: 'tourJoin', id: ar.id }, 'toast'); B.send({ t: 'tourRegDecide', id: ar.id, uid: c.me.uid, accept: true }); }
  await until(() => a.players.length === 2);
  B.send({ t: 'tourStart', id: ar.id });
  await until(() => a.status === 'running');
  await ps[2].req({ t: 'tourJoin', id: ar.id }, 'toast');
  assert.strictEqual(a.queue[0].state, 'pending', 'Arena đang chạy: vào muộn vẫn chờ duyệt');
  B.send({ t: 'tourRegDecide', id: ar.id, uid: ps[2].me.uid, accept: true });
  await until(() => a.queue.length && a.queue[0].state === 'wait');
  // Một người rút khỏi Arena đang chạy: người đầu danh sách chờ vào thay
  ps[0].send({ t: 'tourLeave', id: ar.id });
  await until(() => a.players.some((p) => p.uid === ps[2].me.uid && !p.withdrawn));
  ps.forEach((c) => c.close());
});

test('khu quản trị: nháp → gửi duyệt, sửa cài đặt, thông báo, lịch, hạt giống thủ công, tạm dừng, đặt lại, xoá, nhật ký', async () => {
  const B = await organizer();
  const ps = [];
  for (let i = 0; i < 4; i++) ps.push(await account('mg', 1500 + i * 10));
  // Nháp: người khác không thấy; gửi duyệt (quản trị viên: mở đăng ký luôn)
  const { id } = await B.req({ t: 'tourCreate', name: 'Quản trị', format: 'bracket', startsAt: soon(), timeLimit: 30, checkin: false, draft: true,
    stages: [{ type: 'single', bestOf: 1, thirdPlace: false }] }, 'tourCreated');
  const t = app.hub.tours.get(id);
  assert.strictEqual(t.status, 'draft');
  assert.strictEqual((await ps[0].req({ t: 'tourGet', id }, 'error')).code, 'tour_not_found');
  await B.req({ t: 'tourSubmit', id }, 'tourSubmitted');
  assert.strictEqual(t.status, 'scheduled');
  // Sửa cài đặt trước giờ đấu: đổi tên, Bo, số người
  await B.req({ t: 'tourEdit', id, name: 'Quản trị 2', format: 'bracket', startsAt: soon(), timeLimit: 20, checkin: false, maxPlayers: 8,
    stages: [{ type: 'single', bestOf: 3, thirdPlace: true }] }, 'tourEdited');
  assert.strictEqual(t.name, 'Quản trị 2');
  assert.strictEqual(t.stages[0].bestOf, 3);
  assert.strictEqual(t.maxPlayers, 8);
  for (const c of ps) await c.req({ t: 'tourJoin', id }, 'toast');
  assert.strictEqual((await B.req({ t: 'tourEdit', id, name: 'X', format: 'bracket', startsAt: soon(), maxPlayers: 2, stages: [{ type: 'single' }] }, 'error')).code, 'tour_name_short');
  assert.strictEqual((await B.req({ t: 'tourEdit', id, name: 'Quản trị 3', format: 'bracket', startsAt: soon(), maxPlayers: 3, stages: [{ type: 'single' }] }, 'error')).code, 'tour_max_low');
  // Thông báo + lịch
  await B.req({ t: 'tourGet', id }, 'tour');
  B.send({ t: 'tourNews', id, text: 'Tập trung lúc 19:45' });
  await ps[0].wait('toast', (m) => /19:45/.test(JSON.stringify(m)));
  B.send({ t: 'tourSchedule', id, key: '0:0', at: Date.now() + 3600000, place: 'Phòng 2' });
  await until(() => t.schedule && t.schedule['0:0'] && t.schedule['0:0'].place === 'Phòng 2');
  // Hạt giống thủ công: người Elo thấp nhất làm hạt giống 1
  const order = [...ps].reverse().map((c) => c.me.uid);
  B.send({ t: 'tourSeeds', id, order });
  await until(() => t.seedPlan && t.seedPlan.length === 4);
  const v = await ps[1].req({ t: 'tourGet', id }, 'tour');
  assert.strictEqual(v.tour.news[0].text, 'Tập trung lúc 19:45');
  assert.strictEqual(v.tour.schedule['0:0'].place, 'Phòng 2');
  assert.strictEqual(v.tour.log, null, 'người chơi không thấy nhật ký');
  assert.strictEqual(v.tour.seedPlan, null);
  // Tạm dừng trước khi bắt đầu: bắt đầu xong không mở trận nào
  B.send({ t: 'tourStart', id });
  await until(() => t.status === 'running');
  assert.strictEqual(t.players.find((p) => p.uid === ps[3].me.uid).seed, 1, 'hạt giống theo thứ tự ban tổ chức xếp');
  // Đang đấu: sửa chỉ đổi được tên / mô tả
  await B.req({ t: 'tourEdit', id, name: 'Quản trị đang đấu', desc: 'mới', format: 'arena', stages: null }, 'tourEdited');
  assert.strictEqual(t.name, 'Quản trị đang đấu');
  assert.strictEqual(t.format, 'bracket', 'đang đấu không đổi thể thức');
  B.send({ t: 'tourHold', id, hold: true });
  await until(() => t.held);
  // Đặt lại: về trước khi bắt đầu, giữ người chơi
  B.send({ t: 'tourReset', id });
  await until(() => t.status === 'scheduled');
  assert.strictEqual(t.st, null);
  assert.strictEqual(t.players.length, 4);
  assert.ok(!t.held);
  const lg = await B.req({ t: 'tourGet', id }, 'tour');
  const acts = lg.tour.log.map((x) => x.act);
  for (const a of ['created', 'submitted', 'edited', 'news', 'schedule', 'seeds', 'start_now', 'held', 'reset']) assert.ok(acts.includes(a), 'nhật ký có ' + a + ': ' + acts.join(','));
  assert.ok(lg.tour.log.every((x) => !x.by || typeof x.by === 'string'));
  // Xoá: phải gõ đúng tên giải
  assert.strictEqual((await B.req({ t: 'tourDelete', id, confirm: 'sai' }, 'error')).code, 'tour_delete_confirm');
  await B.req({ t: 'tourDelete', id, confirm: 'Quản trị đang đấu' }, 'tourDeleted');
  assert.ok(!app.hub.tours.has(id));
  ps.forEach((c) => c.close());
});

test('Đợt 4 – sửa sau review: người thường đổi tên giải đã duyệt thì chờ duyệt lại; đặt lại thì điểm danh lại từ đầu', async () => {
  const B = await admin();
  const org = await account('og', 1500);
  const { id } = await org.req({ t: 'tourCreate', name: 'Giải thường', format: 'bracket', startsAt: soon(), timeLimit: 30, checkin: true, stages: [{ type: 'single' }] }, 'tourCreated');
  const t = app.hub.tours.get(id);
  assert.strictEqual(t.status, 'pending');
  B.send({ t: 'adminReview', kind: 'tour', id, approve: true });
  await until(() => t.status === 'scheduled');
  // Đổi giờ / Bo (không đổi tên, giới thiệu): vẫn mở đăng ký
  await org.req({ t: 'tourEdit', id, name: 'Giải thường', format: 'bracket', startsAt: soon() + 60000, timeLimit: 30, checkin: true, stages: [{ type: 'single', bestOf: 5 }] }, 'tourEdited');
  assert.strictEqual(t.status, 'scheduled');
  await org.req({ t: 'tourEdit', id, name: 'Giải đổi tên', format: 'bracket', startsAt: soon(), timeLimit: 30, checkin: true, stages: [{ type: 'single' }] }, 'tourEdited');
  assert.strictEqual(t.status, 'pending', 'đổi tên: chờ quản trị viên duyệt lại');
  B.send({ t: 'adminReview', kind: 'tour', id, approve: true });
  await until(() => t.status === 'scheduled');
  // Đặt lại: cờ đã báo điểm danh / bỏ qua điểm danh được xoá
  const ps = [await account('og', 1400), await account('og', 1300)];
  for (const c of ps) await c.req({ t: 'tourJoin', id }, 'toast');
  org.send({ t: 'tourStart', id });
  await until(() => t.status === 'running');
  // Đặt lại: không còn "bỏ qua điểm danh"; người chơi được báo mở điểm danh lại (giờ bắt đầu mới đã trong khung điểm danh)
  const again = ps[0].wait('toast', (m) => JSON.stringify(m).includes('tour_checkin_open'));
  org.send({ t: 'tourReset', id });
  await until(() => t.status === 'scheduled');
  assert.ok(!t.checkinWaived);
  await again;
  [org, ...ps].forEach((c) => c.close());
});

test('Đợt 5: đồng ban tổ chức theo quyền, giải riêng tư chặn cả link, ẩn hạt giống, nhãn vòng tuỳ biến', async () => {
  const B = await organizer();
  const staff = await account('st', 1500), outsider = await account('st', 1500), p1 = await account('st', 1600), p2 = await account('st', 1400);
  const { id } = await B.req({ t: 'tourCreate', name: 'Riêng tư', format: 'bracket', startsAt: soon(), timeLimit: 30, checkin: false, access: 'private', hideSeeds: true,
    stages: [{ type: 'single', bestOf: 1, thirdPlace: false }] }, 'tourCreated');
  const t = app.hub.tours.get(id);
  // Riêng tư: người ngoài không thấy trong danh sách, mở bằng link cũng không được
  const list = await outsider.req({ t: 'tourList' }, 'tourList');
  assert.ok(!list.items.some((x) => x.id === id));
  assert.strictEqual((await outsider.req({ t: 'tourGet', id }, 'error')).code, 'tour_not_found');
  // Đồng ban tổ chức chỉ có quyền "người chơi": thêm người được, đăng thông báo / bắt đầu thì không
  assert.strictEqual((await staff.req({ t: 'tourAddPlayers', id, names: ['x'] }, 'error')).code, 'tour_not_found', 'chưa là ban tổ chức: không thấy giải');
  B.send({ t: 'tourStaff', id, username: staff.me.username, perms: ['players', 'bogus'] });
  await until(() => t.staff && t.staff.length === 1);
  assert.deepStrictEqual(t.staff[0].perms, ['players']);
  const r = await staff.req({ t: 'tourAddPlayers', id, names: [p1.me.username, p2.me.username] }, 'tourAddResult');
  assert.strictEqual(r.added.length, 2);
  assert.strictEqual((await staff.req({ t: 'tourNews', id, text: 'x' }, 'error')).code, 'tour_managers_only');
  assert.strictEqual((await staff.req({ t: 'tourStart', id }, 'error')).code, 'tour_managers_only');
  assert.strictEqual((await staff.req({ t: 'tourStaff', id, username: outsider.me.username, perms: ['all'] }, 'error')).code, 'tour_managers_only', 'chỉ chủ giải phân quyền');
  const sv = await staff.req({ t: 'tourGet', id }, 'tour');
  assert.deepStrictEqual(sv.tour.perms, ['players']);
  // Người chơi (đã được thêm) thấy giải riêng tư; hạt giống ẩn; nhãn vòng hiện thay tên mặc định
  B.send({ t: 'tourSchedule', id, key: '0:0', label: 'Vòng loại', place: '' });
  await until(() => t.schedule && t.schedule['0:0'] && t.schedule['0:0'].label === 'Vòng loại');
  B.send({ t: 'tourStart', id });
  await until(() => t.status === 'running');
  const pv = await p1.req({ t: 'tourGet', id }, 'tour');
  assert.ok(pv.tour.players.every((x) => x.seed === null), 'ẩn hạt giống');
  assert.ok(pv.tour.stageViews[0].rounds[0].every((m) => !m.a || m.a.seed === null));
  assert.strictEqual(pv.tour.schedule['0:0'].label, 'Vòng loại');
  // Gỡ đồng ban tổ chức
  B.send({ t: 'tourStaffDel', id, uid: staff.me.uid });
  await until(() => !t.staff.length);
  assert.strictEqual((await staff.req({ t: 'tourGet', id }, 'error')).code, 'tour_not_found', 'hết quyền: không thấy giải riêng tư nữa');
  [staff, outsider, p1, p2].forEach((c) => c.close());
});

test('Đợt 5 – sửa sau review: người ngoài không xem được ván của giải riêng tư; quyền "Thông báo" không thấy mã vào / câu trả lời; xoá tài khoản thì rời ban tổ chức', async () => {
  const B = await organizer();
  const a = await account('pv', 1500), b = await account('pv', 1400), outsider = await account('pv', 1300), news = await account('pv', 1300);
  const { id } = await B.req({ t: 'tourCreate', name: 'Kín có ván', format: 'bracket', startsAt: soon(), timeLimit: 30, checkin: false, access: 'private',
    reg: { code: 'BI_MAT' }, stages: [{ type: 'single', bestOf: 1, thirdPlace: false }] }, 'tourCreated');
  const t = app.hub.tours.get(id);
  await B.req({ t: 'tourAddPlayers', id, names: [a.me.username, b.me.username] }, 'tourAddResult');
  B.send({ t: 'tourStaff', id, username: news.me.username, perms: ['news'] });
  await until(() => t.staff && t.staff.length === 1);
  const nv = await news.req({ t: 'tourGet', id }, 'tour');
  assert.strictEqual(nv.tour.regAdmin, null, 'quyền Thông báo: không thấy mã vào / câu trả lời');
  assert.ok(!JSON.stringify(nv.tour).includes('BI_MAT'));
  B.send({ t: 'tourStart', id });
  await until(() => t.status === 'running');
  const m = t.st[0].matches[t.st[0].rounds[0][0]];
  await until(() => m.room);
  const room = app.hub.rooms.get(m.room);
  assert.strictEqual(app.hub.canWatch(room, 'u_' + outsider.me.uid), false, 'người ngoài không xem được ván');
  assert.strictEqual(app.hub.canWatch(room, 'u_' + news.me.uid), true, 'ban tổ chức xem được');
  // Xoá tài khoản đồng ban tổ chức: tự rời ban tổ chức
  app.hub.tourUserGone(news.me.uid);
  assert.strictEqual(t.staff.length, 0);
  [a, b, outsider, news].forEach((c) => c.close());
});

test('Đợt 6: JSON công khai của giải (chỉ giải công khai / link, đã duyệt; không lộ khiếu nại, online), dải phong độ, trang nhúng cho phép iframe', async () => {
  const B = await organizer();
  const base = url.replace(/^ws/, 'http').replace(/\/ws$/, '');
  const get = (id) => fetch(`${base}/api/tour/${id}.json`);
  const { id } = await B.req({ t: 'tourCreate', name: 'Nhúng', format: 'bracket', startsAt: soon(), timeLimit: 30, offline: true,
    stages: [{ type: 'roundrobin', groups: 1, bestOf: 1, points: { w: 3, d: 1, l: 0 } }] }, 'tourCreated');
  await B.req({ t: 'tourAddPlayers', id, names: ['An', 'Bình', 'Chi'] }, 'tourAddResult');
  B.send({ t: 'tourStart', id });
  const t = app.hub.tours.get(id);
  await until(() => t.status === 'running');
  const first = Object.values(t.st[0].matches).find((m) => m.a && m.b && !m.bye);
  B.send({ t: 'tourScore', id, match: first.id, sets: [[2, 0]] });
  await until(() => first.done);
  const r = await get(id);
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('cache-control'), /max-age=10/);
  const j = await r.json();
  assert.strictEqual(j.name, 'Nhúng');
  assert.strictEqual(j.url, '/?t=' + id);
  assert.ok(!('disputes' in j) && !('canManage' in j) && !('log' in j) && !('staff' in j), 'không có phần riêng của ban tổ chức');
  assert.ok(j.players.length === 3 && j.players.every((p) => !('online' in p) && !('playing' in p)), 'không lộ trạng thái online');
  // Dải phong độ trong bảng xếp hạng: người thắng "W", người thua "L", người chưa đấu ""
  const rows = j.stageViews[0].groups[0].table;
  const name = (u) => t.players.find((p) => p.uid === u).name;
  assert.strictEqual(rows.find((x) => x.name === name(first.winner)).form, 'W');
  assert.strictEqual(rows.find((x) => x.name === name(first.winner === first.a ? first.b : first.a)).form, 'L');
  assert.strictEqual(rows.filter((x) => x.form === '').length, 1);
  // Giữ 10 giây: kết quả mới chưa hiện ngay (đỡ dựng lại khi nhiều trang nhúng cùng tải)
  const second = Object.values(t.st[0].matches).find((m) => m.a && m.b && !m.bye && !m.done);
  B.send({ t: 'tourScore', id, match: second.id, sets: [[0, 2]] });
  await until(() => second.done);
  const again = await (await get(id)).json();
  assert.strictEqual(JSON.stringify(again.stageViews), JSON.stringify(j.stageViews));
  // Giải riêng tư / nháp / không có: 404; mã sai dạng: 404
  const priv = await B.req({ t: 'tourCreate', name: 'Kín', format: 'bracket', startsAt: soon(), timeLimit: 30, access: 'private', stages: [{ type: 'single', bestOf: 1 }] }, 'tourCreated');
  const draft = await B.req({ t: 'tourCreate', name: 'Nháp', format: 'bracket', startsAt: soon(), timeLimit: 30, draft: true, stages: [{ type: 'single', bestOf: 1 }] }, 'tourCreated');
  assert.strictEqual(app.hub.tours.get(draft.id).status, 'draft');
  for (const x of [priv.id, draft.id, 'abcdef0123', '../etc', 'ZZZ']) assert.strictEqual((await get(x)).status, 404, x);
  // Trang nhúng: cho phép đặt trong iframe của website khác; các trang khác vẫn chặn
  const em = await fetch(`${base}/embed.html`);
  assert.strictEqual(em.status, 200);
  assert.match(em.headers.get('content-security-policy'), /frame-ancestors \*/);
  assert.strictEqual(em.headers.get('x-frame-options'), null);
  const idx = await fetch(`${base}/index.html`);
  assert.match(idx.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.strictEqual(idx.headers.get('x-frame-options'), 'DENY');
  B.close();
});

test('Đợt 7: cài đặt CLB, 8 quyền quản lý, yêu cầu kèm lời nhắn, đã từ chối / chặn, tin gửi toàn CLB (online + khi vào lại), tắt nhận tin', async () => {
  const B = await admin();
  const owner = await account('k7o'), a = await account('k7a'), b = await account('k7b'), d = await account('k7d'), e = await account('k7e');
  const { id } = await owner.req({ t: 'clubCreate', name: 'CLB Đợt Bảy ' + seq, intro: 'Chơi mỗi tối', icon: '🐉', join: 'request' }, 'clubCreated');
  await B.req({ t: 'adminReview', kind: 'club', id, approve: true }, 'adminQueue');
  const c = app.hub.clubs.get(id);
  await owner.req({ t: 'clubGet', id }, 'club');
  assert.strictEqual(owner.club.icon, '🐉');
  assert.strictEqual(owner.club.intro, 'Chơi mỗi tối');
  // Yêu cầu kèm lời nhắn → từ chối → không gửi lại được → duyệt lại
  await a.req({ t: 'clubJoin', id, msg: 'Em học lớp 10A' }, 'toast', (m) => m.code === 'club_request_sent');
  await until(() => owner.club.requests.length === 1);
  assert.strictEqual(owner.club.requests[0].msg, 'Em học lớp 10A');
  await owner.req({ t: 'clubRequest', id, uid: a.me.uid, accept: false }, 'club', (m) => m.club.declined.length === 1);
  assert.strictEqual(owner.club.declined[0].msg, 'Em học lớp 10A');
  assert.strictEqual((await a.req({ t: 'clubJoin', id }, 'error')).code, 'club_request_declined');
  await owner.req({ t: 'clubReconsider', id, uid: a.me.uid, accept: true }, 'club', (m) => m.club.members.length === 2 && !m.club.declined.length);
  assert.ok(owner.club.members.find((x) => x.id === a.me.uid).joined > Date.now() - 5000, 'có ngày vào');
  // Cài đặt: vào tự do, mô tả nhiều dòng, phần chỉ thành viên thấy, ẩn danh sách thành viên
  await owner.req({ t: 'clubUpdate', id, join: 'open', desc: 'Dòng 1\nDòng 2', privDesc: 'Mật khẩu wifi: caro123', hideMembers: true, icon: 'không hợp lệ', chat: 'officers', forum: 'everyone' }, 'club', (m) => m.club.join === 'open');
  assert.strictEqual(owner.club.desc, 'Dòng 1\nDòng 2');
  assert.strictEqual(owner.club.icon, '', 'biểu tượng ngoài danh sách: bỏ');
  assert.deepStrictEqual([owner.club.chat, owner.club.forum], ['officers', 'everyone']);
  await b.req({ t: 'clubJoin', id }, 'toast', (m) => m.code === 'club_joined');
  const out = (await d.req({ t: 'clubGet', id }, 'club')).club;
  assert.ok(out.membersHidden && out.members.length === 1 && out.members[0].role === 'owner', 'người ngoài chỉ thấy chủ CLB');
  assert.strictEqual(out.privDesc, '', 'người ngoài không thấy mô tả riêng');
  assert.strictEqual(out.count, 3);
  const inn = (await b.req({ t: 'clubGet', id }, 'club')).club;
  assert.ok(!inn.membersHidden && inn.members.length === 3 && inn.privDesc === 'Mật khẩu wifi: caro123');
  // Quản lý mới: quyền mặc định; chỉ để quyền "gửi tin" (không công khai) → không sửa cài đặt / duyệt / mời ra được
  await owner.req({ t: 'clubRole', id, uid: a.me.uid, role: 'officer' }, 'club', (m) => m.club.members.find((x) => x.id === a.me.uid).role === 'officer');
  assert.deepStrictEqual(c.perms[a.me.uid], ['public', 'settings', 'tours', 'requests', 'kick']);
  await owner.req({ t: 'clubPerms', id, uid: a.me.uid, perms: ['broadcast', 'bogus'] }, 'club', () => c.perms[a.me.uid].join() === 'broadcast');
  assert.strictEqual((await a.req({ t: 'clubUpdate', id, intro: 'x' }, 'error')).code, 'club_officers_only');
  assert.strictEqual((await a.req({ t: 'clubKick', id, uid: b.me.uid }, 'error')).code, 'club_officers_only');
  assert.strictEqual((await a.req({ t: 'clubPerms', id, uid: a.me.uid, perms: CLUB_ALL }, 'error')).code, 'club_officers_only', 'không tự cấp quyền');
  assert.strictEqual((await b.req({ t: 'clubGet', id }, 'club')).club.members.find((x) => x.id === a.me.uid).role, 'member', 'quản lý không công khai: thành viên thấy như thành viên');
  // Tin gửi toàn CLB: thành viên online nhận ngay; 12 giờ mới gửi được tin tiếp
  await a.req({ t: 'clubGet', id }, 'club');
  const got = b.wait('clubMsgs', (m) => m.items[0].msg.text === 'Tối nay 20h đấu giải');
  await a.req({ t: 'clubBroadcast', id, text: 'Tối nay 20h đấu giải' }, 'club');
  const m1 = await got;
  assert.strictEqual(m1.items[0].club.id, id);
  assert.strictEqual((await a.req({ t: 'clubBroadcast', id, text: 'Spam' }, 'error')).code, 'club_msg_wait');
  // Thành viên offline nhận khi vào lại; thành viên tắt nhận tin thì không
  await e.req({ t: 'clubJoin', id }, 'toast', (m) => m.code === 'club_joined');
  await b.req({ t: 'clubMute', id, mute: true }, 'club', (m) => m.club.muted);
  const eName = e.me.username;
  e.close(); b.close();
  await until(() => !app.hub.isOnline('u_' + e.me.uid));
  await B.req({ t: 'clubGet', id }, 'club');
  await B.req({ t: 'clubBroadcast', id, text: 'Đổi giờ: 21h' }, 'club'); // quản trị viên: không bị giới hạn 12 giờ
  const e2 = await reconnect({ me: { username: eName } });
  await until(() => e2.msgs.some((m) => m.t === 'clubMsgs'));
  const inbox = e2.msgs.find((m) => m.t === 'clubMsgs').items.map((x) => x.msg.text);
  assert.deepStrictEqual(inbox, ['Đổi giờ: 21h'], 'chỉ tin sau khi vào CLB');
  const b2 = await reconnect({ me: { username: b.me.username } });
  await sleep(150);
  assert.ok(!b2.msgs.some((m) => m.t === 'clubMsgs'), 'đã tắt nhận tin');
  // Vào lại lần nữa: không nhận lại tin cũ
  e2.close();
  const e3 = await reconnect({ me: { username: eName } });
  await sleep(150);
  assert.ok(!e3.msgs.some((m) => m.t === 'clubMsgs'), 'tin đã nhận không gửi lại');
  // Mời ra kèm chặn → không vào lại được; bỏ chặn → vào được
  await owner.req({ t: 'clubKick', id, uid: e3.me.uid, ban: true }, 'club', (m) => m.club.banned.length === 1);
  assert.strictEqual((await e3.req({ t: 'clubJoin', id }, 'error')).code, 'club_banned');
  await owner.req({ t: 'clubUnban', id, uid: e3.me.uid }, 'club', (m) => !m.club.banned.length);
  await e3.req({ t: 'clubJoin', id }, 'toast', (m) => m.code === 'club_joined');
  // Trao quyền chủ: chủ cũ thành quản lý đủ quyền
  await owner.req({ t: 'clubRole', id, uid: a.me.uid, role: 'owner' }, 'club', (m) => m.club.members.find((x) => x.id === a.me.uid).role === 'owner');
  assert.strictEqual(c.owner, a.me.uid);
  assert.strictEqual(c.perms[owner.me.uid].length, 8);
  assert.strictEqual((await owner.req({ t: 'clubRole', id, uid: b2.me.uid, role: 'owner' }, 'error')).code, 'club_owner_only');
  [owner, a, b2, d, e3].forEach((x) => x.close()); // B (quản trị viên) dùng chung giữa các bài: không đóng
});
const CLUB_ALL = ['public', 'settings', 'tours', 'mod', 'requests', 'broadcast', 'kick', 'admin'];

test('Đợt 8: chat CLB (theo cài đặt, thời gian thực, xoá, cấm nói), diễn đàn (chủ đề, bài, sửa / xoá, ghim, khoá), người ngoài đọc khi để "mọi người"', async () => {
  const keep = app.hub.T.THROTTLE_SCALE;
  app.hub.T.THROTTLE_SCALE = 0; // bỏ giãn cách gửi trong bài thử
  try {
    const B = await admin();
    const owner = await account('k8o'), a = await account('k8a'), mod = await account('k8m'), out = await account('k8x');
    const { id } = await owner.req({ t: 'clubCreate', name: 'CLB Đợt Tám ' + seq, join: 'open' }, 'clubCreated');
    await B.req({ t: 'adminReview', kind: 'club', id, approve: true }, 'adminQueue');
    for (const x of [a, mod]) await x.req({ t: 'clubJoin', id }, 'toast', (m) => m.code === 'club_joined');
    await owner.req({ t: 'clubGet', id }, 'club');
    await owner.req({ t: 'clubRole', id, uid: mod.me.uid, role: 'officer' }, 'club', (m) => m.club.members.some((x) => x.id === mod.me.uid && x.role === 'officer'));
    await owner.req({ t: 'clubPerms', id, uid: mod.me.uid, perms: ['mod'] }, 'club', () => app.hub.clubs.get(id).perms[mod.me.uid].join() === 'mod');
    // Chat: thành viên viết, người đang mở trang nhận ngay; mở trang nhận lịch sử
    await a.req({ t: 'clubGet', id }, 'club');
    const got = owner.wait('clubChat', (m) => m.msg.text === 'Chào cả nhà');
    a.send({ t: 'clubChat', id, text: 'Chào cả nhà' });
    const m1 = (await got).msg;
    const log = await mod.req({ t: 'clubGet', id }, 'clubChatLog');
    assert.ok(log.msgs.some((x) => x.id === m1.id), 'mở trang: có lịch sử chat');
    const outView = await out.req({ t: 'clubGet', id }, 'club');
    assert.ok(!outView.club.talk.chat, 'người ngoài không đọc được chat');
    await sleep(100);
    assert.ok(!out.msgs.some((m) => m.t === 'clubChatLog'), 'người ngoài không nhận lịch sử chat');
    assert.strictEqual((await out.req({ t: 'clubChat', id, text: 'x' }, 'error')).code, 'club_talk_denied');
    // Kiểm duyệt: xoá tin, cấm nói
    const del = a.wait('clubChatDel', (m) => m.msg === m1.id);
    mod.send({ t: 'clubChatDel', id, msg: m1.id });
    await del;
    await mod.req({ t: 'clubTalkMute', id, uid: a.me.uid, mute: true }, 'club', (m) => m.club.talkMuted.includes(a.me.uid));
    assert.strictEqual((await a.req({ t: 'clubChat', id, text: 'Spam' }, 'error')).code, 'club_talk_denied', 'bị cấm nói');
    assert.strictEqual((await mod.req({ t: 'clubTalkMute', id, uid: owner.me.uid, mute: true }, 'error')).code, 'club_cannot_kick', 'không cấm nói chủ CLB');
    await mod.req({ t: 'clubTalkMute', id, uid: a.me.uid, mute: false }, 'club', (m) => !m.club.talkMuted.length);
    // Chat chỉ ban quản lý
    await owner.req({ t: 'clubUpdate', id, chat: 'officers' }, 'club', (m) => m.club.chat === 'officers');
    assert.strictEqual((await a.req({ t: 'clubChat', id, text: 'x' }, 'error')).code, 'club_talk_denied');
    await mod.req({ t: 'clubChat', id, text: 'Thông báo từ ban quản lý' }, 'clubChat');
    // Diễn đàn: chủ đề + bài, sửa / xoá bài của mình, người khác không sửa được
    const { topic } = await a.req({ t: 'clubTopicNew', id, title: 'Lịch thi đấu tháng 11', text: 'Mọi người góp ý nhé' }, 'clubTopicCreated');
    assert.strictEqual((await a.req({ t: 'clubTopicNew', id, title: 'x', text: 'y' }, 'error')).code, 'club_topic_short');
    const list = await owner.req({ t: 'clubTopics', id }, 'clubTopics');
    assert.strictEqual(list.total, 1);
    assert.strictEqual(list.topics[0].title, 'Lịch thi đấu tháng 11');
    const view = await owner.req({ t: 'clubTopic', id, topic }, 'clubTopic');
    assert.ok(view.canPost && view.posts.length === 1 && view.posts[0].text === 'Mọi người góp ý nhé');
    const dirty = a.wait('clubTopicDirty', (m) => m.topic === topic);
    await a.req({ t: 'clubTopic', id, topic }, 'clubTopic');
    owner.send({ t: 'clubPost', id, topic, text: 'Tối thứ 7 được không?' });
    await dirty;
    let v = await a.req({ t: 'clubTopic', id, topic, page: -1 }, 'clubTopic');
    assert.strictEqual(v.posts.length, 2);
    const ownerPost = v.posts[1].id;
    assert.strictEqual((await a.req({ t: 'clubPostEdit', id, post: ownerPost, text: 'sửa trộm' }, 'error')).code, 'club_officers_only');
    a.send({ t: 'clubPostEdit', id, post: v.posts[0].id, text: 'Mọi người góp ý giúp' });
    await until(() => app.hub.store.clubPost(id, v.posts[0].id).edited);
    // Ghim, khoá: thành viên không viết được nữa, kiểm duyệt vẫn viết được
    await mod.req({ t: 'clubTopicMod', id, topic, pinned: true, locked: true }, 'clubTopicModDone');
    v = await a.req({ t: 'clubTopic', id, topic }, 'clubTopic');
    assert.ok(v.topic.pinned && v.topic.locked && !v.canPost);
    assert.strictEqual((await a.req({ t: 'clubPost', id, topic, text: 'x' }, 'error')).code, 'club_topic_locked');
    mod.send({ t: 'clubPost', id, topic, text: 'Đã chốt: thứ 7' });
    await until(() => app.hub.store.clubTopic(id, topic).posts === 3);
    // Diễn đàn "mọi người": người ngoài đọc được, không viết được; "tắt": không đọc được
    assert.strictEqual((await out.req({ t: 'clubTopics', id }, 'error')).code, 'club_not_found');
    await owner.req({ t: 'clubUpdate', id, forum: 'everyone' }, 'club', (m) => m.club.forum === 'everyone');
    assert.strictEqual((await out.req({ t: 'clubTopics', id }, 'clubTopics')).total, 1);
    assert.strictEqual((await out.req({ t: 'clubTopicNew', id, title: 'Quảng cáo', text: 'x' }, 'error')).code, 'club_talk_denied');
    // Xoá bài của mình; kiểm duyệt xoá chủ đề
    a.send({ t: 'clubPostDel', id, post: v.posts[0].id });
    await until(() => app.hub.store.clubTopic(id, topic).posts === 2);
    await mod.req({ t: 'clubTopicMod', id, topic, del: true }, 'clubTopicModDone');
    assert.strictEqual(app.hub.store.clubTopicCount(id), 0);
    // Giải tán CLB: xoá chat + diễn đàn
    owner.send({ t: 'clubDisband', id });
    await until(() => !app.hub.clubs.get(id));
    assert.strictEqual(app.hub.store.clubChatList(id).length, 0);
    [owner, a, mod, out].forEach((x) => x.close());
  } finally {
    app.hub.T.THROTTLE_SCALE = keep;
  }
});

test('Đợt 9: Team Battle (chỉ thành viên các CLB, không ghép cùng CLB, điểm N người đầu), giao hữu CLB đấu CLB (mời, đội hình, bàn 1 gặp bàn 1), tủ cúp + xếp hạng CLB', async () => {
  // Chủ CLB là người thường (quản trị viên có mọi quyền ở mọi CLB nên không dùng để thử quyền)
  const B = await admin();
  const oa = await account('tbo'), ob = await account('tbo');
  const A = (await oa.req({ t: 'clubCreate', name: 'Đội A ' + seq, join: 'open' }, 'clubCreated')).id;
  const Bc = (await ob.req({ t: 'clubCreate', name: 'Đội B ' + seq, join: 'open' }, 'clubCreated')).id;
  for (const c of [A, Bc]) await B.req({ t: 'adminReview', kind: 'club', id: c, approve: true }, 'adminQueue');
  const approve = (tid) => B.req({ t: 'adminReview', kind: 'tour', id: tid, approve: true }, 'adminQueue');
  const a1 = await account('tba', 1500), a2 = await account('tba', 1450), b1 = await account('tbb', 1480), x = await account('tbx', 1400);
  for (const c of [a1, a2]) await c.req({ t: 'clubJoin', id: A }, 'toast', (m) => m.code === 'club_joined');
  await b1.req({ t: 'clubJoin', id: Bc }, 'toast', (m) => m.code === 'club_joined');
  // ---------------------------------------------------------------- Team Battle
  assert.strictEqual((await oa.req({ t: 'tourCreate', name: 'TB lỗi', format: 'arena', startsAt: soon(), timeLimit: 30, teams: { clubs: [A] } }, 'error')).code, 'team_battle_few');
  const { id } = await oa.req({ t: 'tourCreate', name: 'Team Battle', format: 'arena', startsAt: soon(), timeLimit: 30, minutes: 30, rated: false,
    teams: { clubs: [A, Bc], top: 1 } }, 'tourCreated');
  await approve(id);
  const t = app.hub.tours.get(id);
  assert.deepStrictEqual(t.teams, { clubs: [A, Bc], top: 1 });
  assert.strictEqual((await x.req({ t: 'tourJoin', id }, 'error')).code, 'tour_team_only', 'người ngoài các CLB không vào được');
  for (const c of [a1, a2, b1]) await c.req({ t: 'tourJoin', id }, 'toast');
  assert.deepStrictEqual(t.players.map((p) => p.team), [A, A, Bc]);
  const mine = (await a1.req({ t: 'tourGet', id }, 'tour')).tour;
  assert.deepStrictEqual(mine.myTeams.map((y) => y.id), [A]);
  oa.send({ t: 'tourStart', id });
  await until(() => [...app.hub.rooms.values()].some((r) => r.tour && r.tour.id === id && r.active));
  const rooms = [...app.hub.rooms.values()].filter((r) => r.tour && r.tour.id === id && r.active);
  assert.strictEqual(rooms.length, 1, '3 người, 2 cùng CLB: chỉ một ván');
  const inRoom = rooms[0].players.map((p) => p.id.slice(2));
  assert.ok(inRoom.includes(b1.me.uid), 'không ghép hai người cùng CLB A');
  const rival = inRoom.includes(a1.me.uid) ? a1 : a2;
  await waitRoom(rival, (r) => r.tour && !r.winner);
  await waitRoom(b1, (r) => r.tour && !r.winner);
  t.endsAt = Date.now() + 60000;
  await playOut(rival, b1);
  t.endsAt = Date.now(); // hết giờ: không ghép thêm
  await until(() => t.status === 'finished', 5000);
  const table = (await a2.req({ t: 'tourGet', id }, 'tour')).tour.teams;
  assert.strictEqual(table[0].id, A);
  assert.strictEqual(table[0].score, 2);
  assert.strictEqual(table[1].score, 0);
  const cA = app.hub.clubs.get(A);
  assert.strictEqual(cA.trophies[0].kind, 'battle');
  assert.strictEqual(cA.trophies[0].place, 1);
  assert.strictEqual(cA.points, 10);
  assert.strictEqual(app.hub.clubs.get(Bc).points, 0, 'CLB 0 điểm không được xếp hạng');
  // ---------------------------------------------------------------- Giao hữu: không chấp nhận thì huỷ
  const inv = ob.wait('toast', (m) => m.code === 'club_match_invite');
  const m1 = await oa.req({ t: 'clubMatchCreate', id: A, opp: Bc, boards: 2, startsAt: soon(), timeLimit: 30, bestOf: 1 }, 'tourCreated');
  await inv;
  await approve(m1.id);
  oa.send({ t: 'tourStart', id: m1.id });
  await until(() => app.hub.tours.get(m1.id).status === 'cancelled');
  assert.strictEqual(app.hub.tours.get(m1.id).cancelReason, 'match_not_accepted');
  // ---------------------------------------------------------------- Giao hữu: chấp nhận, đội hình, bàn 1 gặp bàn 1
  const m2 = (await oa.req({ t: 'clubMatchCreate', id: A, opp: Bc, boards: 2, startsAt: soon(), timeLimit: 30, bestOf: 1 }, 'tourCreated')).id;
  await approve(m2);
  const tm = app.hub.tours.get(m2);
  assert.strictEqual((await a1.req({ t: 'clubMatchAccept', tour: m2, accept: true }, 'error')).code, 'club_officers_only');
  assert.strictEqual((await oa.req({ t: 'clubMatchAccept', tour: m2, accept: true }, 'error')).code, 'club_officers_only', 'bên mời không tự chấp nhận');
  await ob.req({ t: 'clubMatchAccept', tour: m2, accept: true }, 'toast').catch(() => {});
  await until(() => tm.teamMatch.accepted);
  assert.strictEqual((await a1.req({ t: 'tourJoin', id: m2 }, 'error')).code, 'tour_team_match');
  oa.send({ t: 'clubMatchLineup', tour: m2, side: 'a', uids: [a1.me.uid, a2.me.uid, x.me.uid] });
  ob.send({ t: 'clubMatchLineup', tour: m2, side: 'b', uids: [b1.me.uid, ob.me.uid, a1.me.uid] });
  await until(() => tm.teamMatch.lineup.a.length === 2 && tm.teamMatch.lineup.b.length === 2);
  assert.deepStrictEqual(tm.teamMatch.lineup.b, [b1.me.uid, ob.me.uid], 'chỉ thành viên CLB, không ai ở cả hai đội');
  assert.strictEqual((await ob.req({ t: 'clubMatchLineup', tour: m2, side: 'a', uids: [] }, 'error')).code, 'club_officers_only', 'không xếp đội hình đội kia');
  oa.send({ t: 'tourStart', id: m2 });
  await until(() => tm.status === 'running');
  assert.deepStrictEqual(tm.teamMatch.pairs, [[a1.me.uid, b1.me.uid], [a2.me.uid, ob.me.uid]]);
  const ms = Object.values(tm.st[0].matches);
  assert.ok(ms.some((m) => m.a === a1.me.uid && m.b === b1.me.uid) && ms.some((m) => m.a === a2.me.uid && m.b === ob.me.uid), 'bàn 1 gặp bàn 1, bàn 2 gặp bàn 2');
  for (const [w, l] of [[a1, b1], [a2, ob]]) {
    await waitRoom(w, (r) => r.tour && r.tour.id === m2 && !r.winner);
    await waitRoom(l, (r) => r.tour && r.tour.id === m2 && !r.winner);
    await playOut(w, l);
  }
  await until(() => tm.status === 'finished', 5000);
  const v = (await x.req({ t: 'tourGet', id: m2 }, 'tour')).tour.teamMatch;
  assert.deepStrictEqual([v.a.score, v.b.score], [2, 0]);
  assert.deepStrictEqual(v.played.map((b) => b.res), ['a', 'a']);
  assert.strictEqual(cA.trophies[0].kind, 'match');
  assert.strictEqual(cA.points, 13);
  // ---------------------------------------------------------------- Bảng xếp hạng CLB + tủ cúp trên trang CLB
  const rank = await x.req({ t: 'clubRanking' }, 'clubRanking');
  const row = rank.list.find((r) => r.id === A);
  assert.ok(row && row.points === 13 && row.gold === 2);
  assert.ok(!rank.list.some((r) => r.id === Bc));
  const page = (await x.req({ t: 'clubGet', id: A }, 'club')).club;
  assert.strictEqual(page.trophies.length, 2);
  assert.ok(page.tours.some((y) => y.id === id) && page.tours.some((y) => y.id === m2), 'trang CLB có Team Battle và giao hữu');
  [oa, ob, a1, a2, b1, x].forEach((c) => c.close());
});

test('Đợt 10: bình chọn trận, dự đoán bục vinh quang + bảng người đoán, bình chọn hạng mục, mẫu giải, giải định kỳ', async () => {
  const B = await organizer();
  const p1 = await account('fn', 1600), p2 = await account('fn', 1500), fan = await account('fan');
  const { id } = await B.req({ t: 'tourCreate', name: 'Giải Vui', format: 'bracket', startsAt: soon(), timeLimit: 30, checkin: false, recur: 'weekly',
    stages: [{ type: 'single', bestOf: 1, thirdPlace: false }] }, 'tourCreated');
  const t = app.hub.tours.get(id);
  assert.strictEqual(t.recur, 'weekly');
  for (const c of [p1, p2]) await c.req({ t: 'tourJoin', id }, 'toast');
  // Dự đoán trước giờ đấu: chỉ chọn người trong giải
  fan.send({ t: 'tourPredict', id, picks: [p1.me.uid, 'khongco', p2.me.uid] });
  p2.send({ t: 'tourPredict', id, picks: [p2.me.uid, p1.me.uid] });
  await until(() => t.preds && Object.keys(t.preds).length === 2);
  assert.deepStrictEqual(t.preds[fan.me.uid], [p1.me.uid, p2.me.uid]);
  assert.strictEqual((await fan.req({ t: 'tourGet', id }, 'tour')).tour.predCount, 2);
  // Bắt đầu: trận chưa mở phòng thì bình chọn được; đã đấu thì không
  B.send({ t: 'tourStart', id });
  await until(() => t.status === 'running');
  const m = Object.values(t.st[0].matches).find((x) => x.a && x.b && !x.bye);
  await until(() => m.room);
  assert.strictEqual((await fan.req({ t: 'tourVote', id, match: m.id, pick: 'a' }, 'error')).code, 'tour_vote_closed', 'trận đang đấu: hết bình chọn');
  assert.strictEqual((await fan.req({ t: 'tourPredict', id, picks: [p1.me.uid] }, 'error')).code, 'tour_predict_closed');
  // Bình chọn khi trận chưa mở phòng (giả lập trận chờ)
  const room = m.room;
  m.room = null;
  fan.send({ t: 'tourVote', id, match: m.id, pick: 'a' });
  p2.send({ t: 'tourVote', id, match: m.id, pick: 'b' });
  await until(() => t.votes && Object.keys(t.votes[m.id]).length === 2);
  const view = (await fan.req({ t: 'tourGet', id }, 'tour')).tour;
  assert.deepStrictEqual(view.stageViews[0].rounds[0].find((x) => x.id === m.id).votes, [1, 1]);
  assert.strictEqual(view.myVotes[m.id], 'a');
  m.room = room;
  // p1 thắng: p1 vô địch, p2 á quân
  const W = m.a === p1.me.uid ? p1 : p2, L = W === p1 ? p2 : p1;
  await waitRoom(W, (r) => r.tour && !r.winner);
  await waitRoom(L, (r) => r.tour && !r.winner);
  await playOut(p1, p2);
  await until(() => t.status === 'finished', 5000);
  const done = (await fan.req({ t: 'tourGet', id }, 'tour')).tour;
  // fan đoán đúng cả 2 vị trí: 6 điểm; p2 đoán ngược: 1 + 1 = 2
  assert.deepStrictEqual(done.predTop.map((x) => x.score), [6, 2]);
  assert.strictEqual(done.myPredScore, 6);
  // Bình chọn hạng mục
  assert.ok(done.awardOpen && done.awardGames.length >= 1);
  fan.send({ t: 'tourAward', id, kind: 'mvp', pick: p1.me.uid });
  fan.send({ t: 'tourAward', id, kind: 'game', pick: done.awardGames[0].share });
  await until(() => t.awards && t.awards.game[fan.me.uid]);
  assert.strictEqual((await fan.req({ t: 'tourAward', id, kind: 'mvp', pick: 'khongco' }, 'error')).code, 'bad_message');
  const aw = (await p2.req({ t: 'tourGet', id }, 'tour')).tour.awards;
  assert.strictEqual(aw.mvp[0].votes, 1);
  assert.strictEqual(aw.mvp[0].label, p1.me.name);
  // Giải định kỳ: tự tạo kỳ sau, lùi 1 tuần, không có người chơi
  assert.ok(t.recurNext);
  const next = app.hub.tours.get(t.recurNext);
  assert.strictEqual(next.startsAt - t.startsAt >= 7 * 86400000 - 3600000, true);
  assert.deepStrictEqual([next.players.length, next.recur, next.recurN, next.name], [0, 'weekly', 2, 'Giải Vui']);
  // Mẫu giải: lưu, ghi đè trùng tên, tối đa 10, xoá
  const saved = await fan.req({ t: 'tourTplSave', name: 'Giải tối thứ 7', data: { preset: 'single', d: { name: 'X' } } }, 'tourTpls');
  assert.strictEqual(saved.list.length, 1);
  await fan.req({ t: 'tourTplSave', name: 'Giải tối thứ 7', data: { preset: 'swiss' } }, 'tourTpls');
  let list = (await fan.req({ t: 'tourTpls' }, 'tourTpls')).list;
  assert.deepStrictEqual([list.length, list[0].data.preset], [1, 'swiss']);
  for (let i = 0; i < 9; i++) await fan.req({ t: 'tourTplSave', name: 'Mẫu ' + i, data: {} }, 'tourTpls');
  assert.strictEqual((await fan.req({ t: 'tourTplSave', name: 'Mẫu 10', data: {} }, 'error')).code, 'tour_tpl_limit');
  list = (await fan.req({ t: 'tourTplDel', id: list[0].id }, 'tourTpls')).list;
  fan.send({ t: 'tourTplSave', name: 'Quá lớn', data: { x: 'a'.repeat(20000) } }); // quá 16 KB: không lưu (bị chặn ở máy chủ)
  await sleep(200);
  assert.ok(!app.hub.store.users.get(fan.me.uid).tourTpls.some((x) => x.name === 'Quá lớn'), 'mẫu quá lớn không được lưu');
  assert.strictEqual(list.length, 9);
  [p1, p2, fan].forEach((c) => c.close());
});

test('Advanced options như Challonge: chia sẻ quyền quản trị lúc tạo, người chơi tự báo tỉ số (offline + tài khoản), báo tới trận, gửi kết quả (cả khi offline), ẩn mục', async () => {
  const B = await organizer();
  const co = await account('adm'), pa = await account('sr'), pb = await account('sr');
  const { id } = await B.req({ t: 'tourCreate', name: 'Giải Tự Báo', format: 'bracket', startsAt: soon(), timeLimit: 30, offline: true, admins: ['@' + co.me.username, 'khongcoai', B.me.username],
    showNews: false, showStandings: false, stages: [{ type: 'single', bestOf: 1, thirdPlace: false }] }, 'tourCreated');
  const t = app.hub.tours.get(id);
  assert.deepStrictEqual(t.staff.map((x) => [x.uid, x.perms.join()]), [[co.me.uid, 'all']], 'chỉ tên hợp lệ, không thêm chính mình');
  assert.deepStrictEqual([t.selfReport, t.notifyMatch, t.notifyResults, t.showNews, t.showStandings], [true, true, true, false, false]);
  // Bulk Add: "@tên" = người có tài khoản
  const r = await B.req({ t: 'tourAddPlayers', id, names: ['@' + pa.me.username, '@' + pb.me.username, '@khongcoai', 'Khách', 'Khách Hai'] }, 'tourAddResult');
  assert.strictEqual(r.added.length, 4);
  assert.deepStrictEqual(r.missing, ['@khongcoai']);
  // pb offline lúc giải bắt đầu: nhận "tới trận" khi vào lại
  const pbName = pb.me.username;
  pb.close();
  await until(() => !app.hub.isOnline('u_' + pb.me.uid));
  const ready = pa.wait('notes', (m) => m.items.some((x) => x.k === 'tour_match'));
  B.send({ t: 'tourStart', id });
  await until(() => t.status === 'running');
  await ready; // 4 người, không ai miễn đấu: pa (online) nhận "tới trận" ngay
  const m = Object.values(t.st[0].matches).find((x) => [x.a, x.b].includes(pa.me.uid) && !x.bye);
  // Người ngoài trận không báo được tỉ số; người trong trận báo được (giải bật selfReport)
  const other = Object.values(t.st[0].matches).find((x) => x !== m && !x.bye && x.a && x.b);
  if (other) assert.strictEqual((await pa.req({ t: 'tourScore', id, match: other.id, sets: [[2, 0]] }, 'error')).code, 'tour_managers_only');
  pa.send({ t: 'tourScore', id, match: m.id, sets: m.a === pa.me.uid ? [[2, 0]] : [[0, 2]] });
  await until(() => m.done);
  assert.strictEqual(m.winner, pa.me.uid);
  assert.ok(t.log.some((x) => x.act === 'self_score'), 'nhật ký ghi người chơi tự báo');
  assert.strictEqual((await pa.req({ t: 'tourScore', id, match: m.id, sets: [[0, 2]] }, 'error')).code, 'tour_managers_only', 'trận đã xong: không tự sửa');
  // Ban tổ chức nhập nốt; giải xong: người online nhận kết quả ngay, người offline nhận khi vào lại
  const res = pa.wait('notes', (x) => x.items.some((y) => y.k === 'tour_result'));
  for (let i = 0; i < 4 && t.status === 'running'; i++) {
    for (const x of Object.values(t.st[0].matches)) {
      const real = (u) => typeof u === 'string' && u !== '-';
      if (x.done || x.bye || !real(x.a) || !real(x.b)) continue;
      B.send({ t: 'tourScore', id, match: x.id, sets: [x.a === pa.me.uid ? [2, 0] : x.b === pa.me.uid ? [0, 2] : [2, 1]] });
      await until(() => x.done);
    }
  }
  await until(() => t.status === 'finished');
  const got = (await res).items.find((y) => y.k === 'tour_result');
  assert.deepStrictEqual([got.id, got.place], [id, 1]);
  const back = await reconnect({ me: { username: pbName } });
  await until(() => back.msgs.some((x) => x.t === 'notes'));
  const kinds = back.msgs.filter((x) => x.t === 'notes').flatMap((x) => x.items.map((y) => y.k));
  assert.ok(kinds.includes('tour_result'), 'người offline nhận kết quả khi vào lại');
  assert.strictEqual(app.hub.store.users.get(pb.me.uid).notes.length, 0, 'đã gửi thì xoá');
  [co, pa, back].forEach((c) => c.close());
});

test('Link riêng, mô tả nhiều dòng, nhánh xem trước (ẩn được), xếp theo danh sách, Quick advance, đính kèm trận, ảnh mô tả', async () => {
  const B = await organizer();
  const out = await account('xem');
  const base = url.replace(/^ws/, 'http').replace(/\/ws$/, '');
  const desc = '## Giới thiệu\n**Giải** cuối tuần\n\n- Bo1\n- Offline';
  const opts = { name: 'Giải Link Riêng', format: 'bracket', startsAt: soon(), timeLimit: 30, offline: true, desc, placeBy: 'list', quickAdvance: true,
    attachments: true, hideBracket: true, stages: [{ type: 'single', bestOf: 1, thirdPlace: false }] };
  assert.strictEqual((await B.req({ t: 'tourCreate', ...opts, slug: 'A b' }, 'error')).code, 'tour_slug_bad');
  const { id } = await B.req({ t: 'tourCreate', ...opts, slug: 'Giai-Moi-1' }, 'tourCreated');
  const t = app.hub.tours.get(id);
  assert.deepStrictEqual([t.slug, t.desc, t.placeBy, t.quickAdvance, t.attachments, t.hideBracket], ['giai-moi-1', desc, 'list', true, true, true]);
  assert.strictEqual((await B.req({ t: 'tourCreate', ...opts, slug: 'giai-moi-1' }, 'error')).code, 'tour_slug_taken');
  assert.strictEqual((await B.req({ t: 'tourCreate', ...opts, slug: id }, 'error')).code, 'tour_slug_taken', 'không trùng mã giải khác');
  await B.req({ t: 'tourAddPlayers', id, names: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] }, 'tourAddResult');
  // Mở bằng link riêng; người xem không thấy nhánh xem trước (đã ẩn), ban tổ chức vẫn thấy
  const seen = await out.req({ t: 'tourGet', id: 'giai-moi-1' }, 'tour');
  assert.strictEqual(seen.tour.id, id);
  assert.strictEqual(seen.tour.preview, null);
  const mine = await B.req({ t: 'tourGet', id }, 'tour');
  const pre = mine.tour.preview.rounds[0].map((m) => [m.a && m.a.name, m.b && (m.b.name || 'bye')]);
  assert.deepStrictEqual(pre, [['P1', 'P2'], ['P3', 'P4'], ['P5', 'bye'], ['P6', 'bye']], 'theo thứ tự danh sách, ô trống dồn về cuối');
  B.send({ t: 'tourStart', id });
  await until(() => t.status === 'running');
  const r0 = t.st[0].rounds[0].map((mid) => t.st[0].matches[mid]);
  assert.deepStrictEqual(r0.map((m) => [app.hub.player(t, m.a).name, m.b === '-' ? '-' : app.hub.player(t, m.b).name]), [['P1', 'P2'], ['P3', 'P4'], ['P5', '-'], ['P6', '-']]);
  // Quick advance: chỉ báo người thắng
  const m = r0[0];
  B.send({ t: 'tourScore', id, match: m.id, winner: m.b });
  await until(() => m.done);
  assert.deepStrictEqual([m.winner, m.quick, m.wins[m.b], m.sets], [m.b, true, 1, null]);
  // Đính kèm trận: link sai bị từ chối; người ngoài không đính kèm được
  assert.strictEqual((await B.req({ t: 'tourAttach', id, match: m.id, url: 'javascript:alert(1)' }, 'error')).code, 'tour_att_bad_url');
  assert.strictEqual((await out.req({ t: 'tourAttach', id, match: m.id, text: 'x' }, 'error')).code, 'tour_managers_only');
  B.send({ t: 'tourAttach', id, match: m.id, url: 'https://example.com/bien-ban', text: 'Biên bản ký' });
  await until(() => m.att && m.att.length === 1);
  const v = (await B.req({ t: 'tourGet', id }, 'tour')).tour.stageViews[0].rounds[0][0];
  assert.deepStrictEqual(v.att.map((x) => [x.url, x.text]), [['https://example.com/bien-ban', 'Biên bản ký']]);
  B.send({ t: 'tourAttachDel', id, match: m.id, att: m.att[0].id });
  await until(() => m.att.length === 0);
  // Giải đang chạy: đổi được link riêng (tab Quản lý chỉ gửi tên / mô tả thì giữ nguyên các tuỳ chọn)
  await B.req({ t: 'tourEdit', id, name: t.name, desc: 'Mới' }, 'tourEdited');
  assert.strictEqual(t.slug, 'giai-moi-1');
  await B.req({ t: 'tourEdit', id, name: t.name, desc: 'Mới', slug: 'giai-moi-2' }, 'tourEdited');
  assert.strictEqual(app.hub.tourBySlug('giai-moi-2'), t);
  // Ảnh mô tả: gửi nhiều phần theo thứ tự, ghép lại, kiểm loại ảnh, phục vụ qua /api/timg/<mã>
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  B.send({ t: 'tourImg', up: 'abcd0001', i: 0, n: 2, data: png.slice(0, 40) });
  const saved = await B.req({ t: 'tourImg', up: 'abcd0001', i: 1, n: 2, data: png.slice(40) }, 'tourImgSaved');
  const res = await fetch(`${base}/api/timg/${saved.id}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'image/png');
  assert.strictEqual(Buffer.from(await res.arrayBuffer()).toString('base64'), png);
  assert.strictEqual((await fetch(`${base}/api/timg/0123456789abcdef`)).status, 404);
  assert.strictEqual((await B.req({ t: 'tourImg', up: 'abcd0002', i: 1, n: 2, data: 'AAAA' }, 'error')).code, 'bad_message', 'sai thứ tự');
  assert.strictEqual((await B.req({ t: 'tourImg', up: 'abcd0003', i: 0, n: 1, data: 'AAAAAAAA' }, 'error')).code, 'tour_img_bad');
  out.close();
});

test('Nhánh xem trước: vòng tròn chỉ gửi các bảng dự kiến, Thụy Sĩ gửi cặp vòng 1 (Hà Lan); bỏ khi giải bắt đầu', async () => {
  const B = await organizer();
  const mk = async (stages) => {
    const { id } = await B.req({ t: 'tourCreate', name: 'Xem Trước', format: 'bracket', startsAt: soon(), timeLimit: 30, offline: true, stages }, 'tourCreated');
    await B.req({ t: 'tourAddPlayers', id, names: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'] }, 'tourAddResult');
    return { id, view: (await B.req({ t: 'tourGet', id }, 'tour')).tour };
  };
  const rr = await mk([{ type: 'roundrobin', groups: 2, bestOf: 1, points: { w: 3, d: 1, l: 0 } }]);
  assert.deepStrictEqual(rr.view.preview.groups.map((g) => [g.name, g.players.length, g.rounds.length]), [['A', 3, 0], ['B', 3, 0]]);
  const sw = await mk([{ type: 'swiss', rounds: 3, bestOf: 1, points: { w: 2, d: 1, l: 0 } }]);
  assert.deepStrictEqual(sw.view.preview.rounds[0].map((m) => [m.a.name, m.b.name]), [['A1', 'A4'], ['A2', 'A5'], ['A3', 'A6']]);
  B.send({ t: 'tourStart', id: sw.id });
  await until(() => app.hub.tours.get(sw.id).status === 'running');
  assert.strictEqual((await B.req({ t: 'tourGet', id: sw.id }, 'tour')).tour.preview, null);
});

test('Kéo thả xếp nhánh giữa hai giai đoạn: dừng sau Thụy Sĩ, ban tổ chức đổi chỗ, bắt đầu nhánh theo đúng các ô', async () => {
  const B = await organizer();
  const out = await account('xem');
  const { id } = await B.req({ t: 'tourCreate', name: 'Xếp Nhánh Tay', format: 'bracket', startsAt: soon(), timeLimit: 30, offline: true, arrangeNext: true,
    stages: [{ type: 'swiss', rounds: 2, bestOf: 1, points: { w: 2, d: 1, l: 0 }, advance: 4 }, { type: 'single', bestOf: 1, thirdPlace: false }] }, 'tourCreated');
  const t = app.hub.tours.get(id);
  assert.strictEqual(t.arrangeNext, true);
  await B.req({ t: 'tourAddPlayers', id, names: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] }, 'tourAddResult');
  B.send({ t: 'tourStart', id });
  await until(() => t.status === 'running');
  const real = (u) => typeof u === 'string' && u !== '-';
  for (let i = 0; i < 6 && !t.arrange; i++) {
    for (const x of Object.values(t.st[0].matches)) {
      if (x.done || !real(x.a) || !real(x.b)) continue;
      B.send({ t: 'tourScore', id, match: x.id, sets: [[2, 0]] });
      await until(() => x.done);
    }
  }
  await until(() => !!t.arrange);
  assert.deepStrictEqual([t.stage, t.st.length], [0, 1], 'chưa bốc thăm giai đoạn 2');
  // Ban tổ chức thấy 4 ô kèm nhãn thành tích; người ngoài chỉ thấy "đang xếp nhánh"
  const mine = (await B.req({ t: 'tourGet', id }, 'tour')).tour;
  assert.strictEqual(mine.arrange.slots.length, 4);
  assert.ok(mine.arrange.slots.every((x) => /^#\d$/.test(x.label)));
  const seen = (await out.req({ t: 'tourGet', id }, 'tour')).tour;
  assert.deepStrictEqual([seen.arranging, seen.arrange], [1, undefined]);
  // Không hợp lệ: trùng người; không huỷ được kết quả giai đoạn trước khi đã chốt người đi tiếp
  const s = t.arrange.slots;
  assert.strictEqual((await B.req({ t: 'tourArrange', id, slots: [s[0], s[0], s[2], s[3]] }, 'error')).code, 'tour_arrange_bad');
  assert.strictEqual((await out.req({ t: 'tourArrange', id, slots: s }, 'error')).code, 'tour_managers_only');
  const anyDone = Object.values(t.st[0].matches).find((x) => x.done && !x.bye);
  assert.strictEqual((await B.req({ t: 'tourScoreUndo', id, match: anyDone.id }, 'error')).code, 'tour_undo_locked');
  // Đổi chỗ ô 2 và 3 (lưu ngay), rồi bắt đầu
  const swapped = [s[0], s[2], s[1], s[3]];
  B.send({ t: 'tourArrange', id, slots: swapped });
  await until(() => t.arrange.slots[1] === s[2]);
  B.send({ t: 'tourArrangeGo', id });
  await until(() => !t.arrange && t.st.length === 2);
  const r0 = t.st[1].rounds[0].map((mid) => t.st[1].matches[mid]);
  assert.deepStrictEqual(r0.map((m) => [m.a, m.b]), [[swapped[0], swapped[1]], [swapped[2], swapped[3]]]);
  assert.strictEqual(t.stage, 1);
  assert.ok(t.log.some((x) => x.act === 'arranged'));
  assert.strictEqual((await B.req({ t: 'tourArrange', id, slots: swapped }, 'error')).code, 'tour_arrange_none');
  out.close();
});
