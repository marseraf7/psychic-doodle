// Giải tuần (hub/weekly-cup.js, weekly-time.js, weekly-cfg.js, store-weekly.js): giờ theo múi giờ IANA (cả giờ mùa hè),
// luôn đúng một giải sắp tới (gọi nhiều lần / song song / khởi động lại / hai tiến trình cùng CSDL), huỷ thì sang tuần
// sau, WEEKLY_CUP=0 tắt, cấu hình sai dùng mặc định, danh hiệu hạng 1–3 trao một lần, chủ giải hệ thống không làm vỡ
// các đường hiển thị / sửa / huỷ. Thời gian giả: truyền `now` vào hàm (không chờ thật); hẹn giờ của hub đặt rất dài.
//   node --test server/test/weekly-cup.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const WT = require('../src/weekly-time.js');
const WC = require('../src/weekly-cfg.js');
const { Store } = require('../src/store.js');
const { Hub } = require('../src/hub/index.js');
const { SYSTEM_UID } = require('../src/hub/weekly-cup.js');

const at = (s) => Date.parse(s);
const VN = { day: 0, hh: 20, mm: 0, tz: 'Asia/Ho_Chi_Minh' };
const SLOW = { TOUR_TICK_MS: 1e9, WEEKLY_TICK_MS: 1e9, TOUR_PUSH_MS: 1e9 }; // không để nhịp thật chen vào bài thử
const quiet = (fn) => { const w = console.warn, l = console.log; console.warn = () => {}; console.log = () => {}; try { return fn(); } finally { console.warn = w; console.log = l; } };
const iso = (ms) => new Date(ms).toISOString();
function mkHub(store, env = {}, extra = {}) {
  return quiet(() => new Hub({ store, weeklyCup: env, timers: SLOW, ...extra }));
}
const sink = () => { const out = []; return { out, conn: { pid: null, send: (m) => out.push(m) } }; };

test('lần kế tiếp theo giờ Việt Nam: Chủ nhật 20:00 = 13:00 UTC, ranh giới đúng 20:00 sang tuần sau', () => {
  assert.deepStrictEqual(WT.nextSlot(at('2026-11-25T10:00:00Z'), VN), { at: at('2026-11-29T13:00:00Z'), key: '2026-11-29' });
  // Một phần nghìn giây trước 20:00 vẫn là hôm nay; đúng 20:00 / sau đó là Chủ nhật tuần sau
  assert.strictEqual(WT.nextSlot(at('2026-11-29T12:59:59.999Z'), VN).key, '2026-11-29');
  assert.deepStrictEqual(WT.nextSlot(at('2026-11-29T13:00:00Z'), VN), { at: at('2026-12-06T13:00:00Z'), key: '2026-12-06' });
  // Chủ nhật 23:30 giờ VN = 16:30 UTC cùng ngày; 00:30 thứ Hai giờ VN vẫn là Chủ nhật 17:30 UTC – ngày theo múi giờ cấu hình
  assert.strictEqual(WT.nextSlot(at('2026-11-29T17:30:00Z'), VN).key, '2026-12-06');
  // Cuối năm: sang năm mới đúng ngày
  assert.strictEqual(WT.nextSlot(at('2026-12-28T00:00:00Z'), VN).key, '2027-01-03');
});

test('múi giờ có giờ mùa hè (Europe/Prague) quanh lần đổi giờ; Moscow không đổi; thứ khác + phút lẻ', () => {
  const PR = { day: 0, hh: 20, mm: 0, tz: 'Europe/Prague' };
  assert.strictEqual(iso(WT.nextSlot(at('2027-03-20T00:00:00Z'), PR).at), '2027-03-21T19:00:00.000Z', 'trước đổi giờ: CET (UTC+1)');
  // 28/3/2027 đổi sang giờ mùa hè lúc 02:00 – 20:00 cùng ngày đã là CEST (UTC+2)
  assert.deepStrictEqual(WT.nextSlot(at('2027-03-22T00:00:00Z'), PR), { at: at('2027-03-28T18:00:00Z'), key: '2027-03-28' });
  // Tính từ ngay trước / sau lúc đổi giờ (01:00 UTC) vẫn ra cùng lần
  assert.strictEqual(WT.nextSlot(at('2027-03-28T00:59:00Z'), PR).at, at('2027-03-28T18:00:00Z'));
  assert.strictEqual(WT.nextSlot(at('2027-03-28T01:01:00Z'), PR).at, at('2027-03-28T18:00:00Z'));
  // Thu: 31/10/2027 về giờ mùa đông – 20:00 là CET; tuần trước còn CEST
  assert.strictEqual(iso(WT.nextSlot(at('2027-10-20T00:00:00Z'), PR).at), '2027-10-24T18:00:00.000Z');
  assert.strictEqual(iso(WT.nextSlot(at('2027-10-25T00:00:00Z'), PR).at), '2027-10-31T19:00:00.000Z');
  // Giờ không tồn tại (02:30 ngày đổi giờ) → giờ sau khi nhảy (03:30 CEST = 01:30 UTC)
  assert.strictEqual(iso(WT.wallToUtc(2027, 3, 28, 2, 30, 'Europe/Prague')), '2027-03-28T01:30:00.000Z');
  // Moscow UTC+3 quanh năm
  assert.strictEqual(iso(WT.nextSlot(at('2027-03-22T00:00:00Z'), { day: 6, hh: 18, mm: 30, tz: 'Europe/Moscow' }).at), '2027-03-27T15:30:00.000Z');
  assert.strictEqual(iso(WT.nextSlot(at('2026-11-25T00:00:00Z'), { day: 5, hh: 9, mm: 5, tz: 'Asia/Tokyo' }).at), '2026-11-27T00:05:00.000Z');
});

test('không phụ thuộc múi giờ của máy chủ (TZ của tiến trình)', () => {
  const code = `const WT = require(${JSON.stringify(path.join(__dirname, '../src/weekly-time.js'))});
    process.stdout.write(JSON.stringify([WT.nextSlot(Date.parse('2027-03-22T00:00:00Z'), { day: 0, hh: 20, mm: 0, tz: 'Europe/Prague' }),
      WT.nextSlot(Date.parse('2026-11-25T10:00:00Z'), { day: 0, hh: 20, mm: 0, tz: 'Asia/Ho_Chi_Minh' })]));`;
  const want = JSON.stringify([WT.nextSlot(at('2027-03-22T00:00:00Z'), { ...VN, tz: 'Europe/Prague' }), WT.nextSlot(at('2026-11-25T10:00:00Z'), VN)]);
  for (const TZ of ['America/New_York', 'Pacific/Kiritimati', 'UTC']) {
    assert.strictEqual(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, TZ } }).toString(), want, TZ);
  }
});

test('cấu hình: mặc định, tắt, giá trị đúng, giá trị sai → mặc định + lý do', () => {
  const d = WC.parseCfg({});
  assert.deepStrictEqual(d.cfg, WC.DEF);
  assert.deepStrictEqual(d.warn, []);
  assert.strictEqual(WC.DEF.clock, '3+2');
  assert.strictEqual(WC.DEF.rule, 'vn');
  assert.strictEqual(WC.parseCfg({ WEEKLY_CUP: '0' }).cfg.on, false);
  assert.strictEqual(WC.parseCfg({ WEEKLY_CUP: 'off' }).cfg.on, false);
  assert.strictEqual(WC.parseCfg({ WEEKLY_CUP: '1' }).cfg.on, true);
  const ok = WC.parseCfg({ WEEKLY_CUP_AT: 'Saturday 8:05', WEEKLY_CUP_TZ: 'Europe/Prague', WEEKLY_CUP_FORMAT: 'swiss', WEEKLY_CUP_MINUTES: '90',
    WEEKLY_CUP_RULE: 'renju', WEEKLY_CUP_CLOCK: '5+3' });
  assert.deepStrictEqual(ok.cfg, { on: true, day: 6, hh: 8, mm: 5, tz: 'Europe/Prague', format: 'swiss', minutes: 90, rule: 'renju', clock: '5+3' });
  assert.deepStrictEqual(ok.warn, []);
  const bad = WC.parseCfg({ WEEKLY_CUP: 'maybe', WEEKLY_CUP_AT: 'sun 25:00', WEEKLY_CUP_TZ: 'Mars/Base', WEEKLY_CUP_FORMAT: 'poker',
    WEEKLY_CUP_MINUTES: '61', WEEKLY_CUP_RULE: 'chess', WEEKLY_CUP_CLOCK: '3+999' });
  assert.deepStrictEqual(bad.cfg, WC.DEF, 'mọi giá trị sai → mặc định');
  assert.strictEqual(bad.warn.length, 7);
  assert.ok(WC.parseCfg({ WEEKLY_CUP_AT: 'xyz 20:00' }).warn.length === 1);
  assert.strictEqual(WC.cfgText(WC.DEF), "sun 20:00 Asia/Ho_Chi_Minh · arena 60' · vn · 3+2");
  assert.strictEqual(WC.cfgText(ok.cfg), 'sat 08:05 Europe/Prague · swiss · renju · 5+3');
  const desc = WC.tourDesc(WC.DEF, 7);
  assert.ok(/## Cúp tuần Caro #7/.test(desc) && /## Weekly Cup #7/.test(desc));
  assert.ok(/Không thu phí, không cá cược/.test(desc) && /no betting/.test(desc) && /Chơi công bằng/.test(desc) && /danh hiệu/.test(desc));
  assert.ok(/Hệ Thụy Sĩ/.test(WC.tourDesc(ok.cfg, 1)) && /Swiss/.test(WC.tourDesc(ok.cfg, 1)));
  // Độ lệch giờ theo đúng ngày đấu: Praha mùa đông GMT+1, mùa hè GMT+2
  assert.ok(/Europe\/Prague, GMT\+1\)/.test(WC.tourDesc(ok.cfg, 1, at('2027-01-10T12:00:00Z'))));
  assert.ok(/Europe\/Prague, GMT\+2\)/.test(WC.tourDesc(ok.cfg, 1, at('2027-07-10T12:00:00Z'))));
});

test('log một lần lúc khởi động khi cấu hình sai; WEEKLY_CUP=0 không tạo giải, không hẹn giờ', () => {
  const store = new Store(null);
  const warns = [];
  const w = console.warn, l = console.log;
  console.warn = (...a) => warns.push(a.join(' '));
  console.log = () => {};
  let hub;
  try { hub = new Hub({ store, weeklyCup: { WEEKLY_CUP_CLOCK: 'abc' }, timers: SLOW }); } finally { console.warn = w; console.log = l; }
  assert.strictEqual(warns.filter((x) => x.includes('WEEKLY_CUP_CLOCK')).length, 1);
  assert.strictEqual(hub.weeklyLive().clock, '3+2', 'đồng hồ sai → 3+2');
  hub.weeklyTick(); hub.weeklyTick();
  assert.strictEqual(warns.length, 1, 'không ghi log lại ở mỗi nhịp');
  hub.close();

  const off = mkHub(store, { WEEKLY_CUP: '0' });
  assert.strictEqual(off.wcTimer, null);
  assert.strictEqual(off.weeklyTick(), null);
  assert.strictEqual(off.weeklyEnsure(), null);
  const s = sink();
  off.on_weeklyCup(s.conn);
  assert.deepStrictEqual(s.out[0], { t: 'weeklyCup', on: false });
  assert.strictEqual(off.weeklyStatus().on, false);
  off.close();
  // Không truyền cấu hình (test / e2e mặc định): tắt hẳn
  const none = quiet(() => new Hub({ store: new Store(null), timers: SLOW }));
  assert.strictEqual(none.weeklyLive(), null);
  assert.deepStrictEqual(none.weeklyStatus(), { on: false, cfg: null, next: null, warn: [] });
  none.close();
  store.close();
});

test('luôn đúng một giải: gọi nhiều lần, song song, nhịp sát nhau – một giải, #1, chủ giải hệ thống, mở đăng ký ngay', async () => {
  const store = new Store(null);
  const hub = mkHub(store);
  const now = Date.now();
  const t = hub.weeklyLive();
  assert.ok(t, 'khởi động: đã tạo');
  const slot = WT.nextSlot(t.created + 30 * 60000, WC.DEF);
  assert.strictEqual(t.startsAt, slot.at);
  assert.strictEqual(t.weeklyKey, slot.key);
  assert.ok(t.startsAt - now <= 7 * 86400000 + 3600000, 'trong vòng một tuần');
  const again = await Promise.all(Array.from({ length: 20 }, () => Promise.resolve().then(() => hub.weeklyEnsure())));
  assert.ok(again.every((x) => x === t));
  for (let i = 0; i < 5; i++) hub.weeklyTick(now + i);
  assert.strictEqual([...hub.tours.values()].filter((x) => x.weekly).length, 1);
  Object.entries({ name: 'Cúp tuần Caro #1 · Weekly Cup', weeklyN: 1, creator: SYSTEM_UID, system: true, status: 'scheduled', format: 'arena',
    minutes: 60, rule: 'vn', clock: '3+2', rated: true, access: 'public', maxPlayers: 512 }).forEach(([k, v]) => assert.strictEqual(t[k], v, k));
  assert.strictEqual(store.wcGet('n'), '1');
  assert.strictEqual(store.wcSlot(t.weeklyKey).id, t.id);
  hub.close(); store.close();
});

test('khởi động lại (CSDL thật): không tạo lần hai, số #N nhớ được; hai tiến trình cùng CSDL vẫn một giải', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-wc-'));
  const file = path.join(dir, 'caro.db');
  let store = new Store(file);
  let hub = mkHub(store);
  const first = hub.weeklyLive();
  hub.close(); store.close();
  for (let i = 0; i < 3; i++) {
    store = new Store(file);
    hub = mkHub(store);
    assert.strictEqual(hub.weeklyLive().id, first.id, 'lần khởi động ' + (i + 2));
    assert.strictEqual([...hub.tours.values()].filter((x) => x.weekly).length, 1);
    hub.close(); store.close();
  }
  // Hai tiến trình: B nạp danh sách giải TRƯỚC khi A tạo → B không thấy giải trong bộ nhớ, giữ chỗ thất bại → không tạo
  fs.rmSync(file); fs.rmSync(file + '-wal', { force: true }); fs.rmSync(file + '-shm', { force: true });
  const sA = new Store(file), sB = new Store(file);
  const hB = mkHub(sB, null);
  const hA = mkHub(sA);
  quiet(() => hB.weeklyInit({}));
  assert.strictEqual(hB.weeklyLive(), null, 'B không tạo giải thứ hai');
  const rows = sA.db.prepare("SELECT COUNT(*) AS n FROM tours").get().n;
  assert.strictEqual(rows, 1);
  assert.strictEqual(sB.wcGet('n'), '1');
  hA.close(); hB.close(); sA.close(); sB.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('huỷ giải → tạo tuần sau (#2), không tạo lại lần đã huỷ; xoá giải cũng không tạo lại; giải mất trước khi ghi → tạo lại', () => {
  const store = new Store(null);
  const hub = mkHub(store);
  const a = hub.weeklyLive();
  hub.cancelTour(a, 'organizer');
  const b = hub.weeklyLive();
  assert.ok(b && b !== a);
  assert.strictEqual(b.weeklyN, 2);
  assert.strictEqual(b.startsAt - a.startsAt, 7 * 86400000, 'tuần sau (giờ VN không đổi giờ)');
  for (let i = 0; i < 3; i++) hub.weeklyTick();
  assert.strictEqual([...hub.tours.values()].filter((x) => x.weekly && x.status === 'scheduled').length, 1);
  // Lần đã huỷ đã bị đẩy khỏi bộ nhớ (dọn giải cũ) vẫn không tạo lại: CSDL ghi trạng thái huỷ
  store.flush();
  hub.tours.delete(a.id);
  hub.cancelTour(b, 'organizer');
  const c = hub.weeklyLive();
  assert.strictEqual(c.weeklyKey, WT.nextSlot(b.startsAt, WC.DEF).key);
  assert.strictEqual(c.weeklyN, 3);
  // Quản trị viên xoá hẳn: lần đó không tạo lại
  hub.tours.delete(c.id);
  store.deleteTour(c.id);
  hub.weeklyGone(c);
  const d = hub.weeklyEnsure();
  assert.strictEqual(d.weeklyKey, WT.nextSlot(c.startsAt, WC.DEF).key);
  // Giải bị mất (máy chủ tắt trước khi ghi xuống đĩa): chỗ giữ quá 1 phút mà không có giải → tạo lại, giữ số
  hub.tours.delete(d.id);
  store.deleteTour(d.id);
  assert.strictEqual(hub.weeklyEnsure(d.created + 1000), null, 'vừa giữ chỗ (< 1 phút): chờ lần quét sau');
  const e = hub.weeklyEnsure(Date.now() + 120000);
  assert.strictEqual(e.weeklyKey, d.weeklyKey);
  assert.strictEqual(e.weeklyN, d.weeklyN);
  hub.close(); store.close();
});

test('giải xong: danh hiệu hạng 1–3 trao một lần (lặp nhịp, khởi động lại giữa chừng), hiện trên hồ sơ; tạo giải tuần sau', () => {
  const store = new Store(null);
  const hub = mkHub(store);
  const t = hub.weeklyLive();
  const us = ['wa', 'wb', 'wc', 'wd'].map((n) => store.createUser({ username: n, name: n.toUpperCase() }));
  t.status = 'running';
  t.players = us.map((u, i) => ({ uid: u.id, name: u.name, rating: 1200, score: 10 - i, wins: 3 - i, draws: 0, losses: i, games: 3, streak: 0, firsts: 0 }));
  quiet(() => hub.finishTour(t));
  assert.strictEqual(t.status, 'finished');
  assert.deepStrictEqual(us.map((u) => (u.titles || []).map((x) => x.p)), [[1], [2], [3], []]);
  assert.deepStrictEqual(us[0].titles[0], { k: 'wc', n: 1, p: 1, tid: t.id, at: t.finishedAt });
  const next = hub.weeklyLive();
  assert.strictEqual(next.weeklyN, 2);
  // Lặp lại / máy chủ tắt trước khi lưu cờ "đã trao": không trao lần hai
  hub.weeklyAward(t);
  t.wcAwarded = false;
  hub.weeklyTick(); hub.weeklyTick();
  assert.deepStrictEqual(us.map((u) => (u.titles || []).length), [1, 1, 1, 0]);
  assert.strictEqual(t.wcAwarded, true);
  // Hồ sơ gửi danh hiệu; trang chủ có kết quả tuần trước
  const s = sink();
  s.conn.pid = 'u_' + us[3].id;
  hub.on_profile(s.conn, { id: us[0].id });
  assert.deepStrictEqual(s.out[0].profile.titles.map((x) => [x.n, x.p]), [[1, 1]]);
  hub.on_weeklyCup(s.conn);
  const m = s.out[1];
  assert.strictEqual(m.cup.id, next.id);
  assert.strictEqual(m.cup.weekly, 2);
  assert.strictEqual(m.cup.canJoin, true);
  assert.deepStrictEqual(m.last.podium, ['WA', 'WB', 'WC']);
  assert.strictEqual(m.last.weekly, 1);
  // Giải đổi sang "chỉ ai có link": người ngoài không thấy trên thẻ, người đã đăng ký vẫn thấy
  next.access = 'link';
  const g = sink();
  hub.on_weeklyCup(g.conn);
  assert.strictEqual(g.out[0].cup, null);
  next.players.push({ uid: us[3].id, name: 'WD', score: 0, games: 0 });
  hub.on_weeklyCup(s.conn);
  assert.strictEqual(s.out[2].cup.id, next.id);
  hub.close(); store.close();
});

test('nhắc ~30 phút trước giờ đấu: một lần cho người đã đăng ký', () => {
  const store = new Store(null);
  const hub = mkHub(store);
  const t = hub.weeklyLive();
  const u = store.createUser({ username: 'rem1', name: 'Rem' });
  t.players.push({ uid: u.id, name: 'Rem', rating: 1200, score: 0, wins: 0, draws: 0, losses: 0, games: 0, streak: 0, firsts: 0 });
  t.players.push({ uid: 'gone', name: 'X', withdrawn: true, score: 0, games: 0 });
  const notes = [];
  hub.pushNote = (uid, item) => notes.push([uid, item]);
  hub.weeklyTick(t.startsAt - 3 * 3600000);
  assert.strictEqual(notes.length, 0, 'còn 3 giờ: chưa nhắc');
  hub.weeklyTick(t.startsAt - 25 * 60000);
  hub.weeklyTick(t.startsAt - 15 * 60000);
  assert.deepStrictEqual(notes, [[u.id, { k: 'tour_soon', id: t.id, name: t.name, starts: t.startsAt }]]);
  hub.close(); store.close();
});

test('chủ giải hệ thống: hiển thị, quyền (quản trị viên sửa / huỷ, người thường không), khiếu nại báo quản trị viên, og, API', () => {
  const store = new Store(null);
  const boss = store.createUser({ username: 'boss', name: 'Boss' });
  const joe = store.createUser({ username: 'joe', name: 'Joe' });
  const hub = mkHub(store, {}, { admins: ['boss'] });
  const t = hub.weeklyLive();
  assert.strictEqual(hub.tourSummary(t, null).creator, 'Caro x Gomoku');
  assert.ok(hub.canSeeTour(t, null) && hub.canSeeTour(t, joe.id));
  assert.strictEqual(hub.tourPerms(t, boss.id), 'owner');
  assert.strictEqual(hub.canManageTour(t, joe.id), false);
  assert.strictEqual(hub.tourPerms(t, SYSTEM_UID), 'owner', 'mã hệ thống không phải tài khoản thật – không ai đăng nhập được bằng nó');
  assert.ok(!store.users.get(SYSTEM_UID));
  assert.deepStrictEqual([...hub.tourManagers(t)], [boss.id]);
  // Trang giải với khách / người thường / quản trị viên
  for (const uid of [null, joe.id, boss.id]) {
    const v = hub.tourView(t, uid);
    assert.strictEqual(v.creator, 'Caro x Gomoku');
    assert.strictEqual(v.canManage, uid === boss.id);
  }
  // Danh sách giải, og, API công khai, bảng quản trị
  const s = sink();
  hub.on_tourList(s.conn);
  assert.ok(s.out[0].items.some((x) => x.id === t.id && x.weekly === 1));
  assert.strictEqual(hub.ogInfo(new URLSearchParams('t=' + t.id)).info.name, t.name);
  assert.strictEqual(hub.v1Tour(t.id).creator, 'Caro x Gomoku');
  const st = hub.weeklyStatus();
  assert.strictEqual(st.on, true);
  assert.strictEqual(st.next.id, t.id);
  assert.strictEqual(st.cfg, WC.cfgText(WC.DEF));
  // Quản trị viên sửa cài đặt (tour-manage.js) và huỷ qua tin nhắn như mọi giải
  const bc = { pid: 'u_' + boss.id, send: () => {} };
  hub.on_tourEdit(bc, { id: t.id, name: 'Cúp tuần Caro #1 · Sửa', desc: t.desc, format: 'arena', startsAt: t.startsAt, minutes: 60, clock: '3+2', rule: 'vn', access: 'public', maxPlayers: 512 });
  assert.strictEqual(t.name, 'Cúp tuần Caro #1 · Sửa');
  assert.strictEqual(t.system, true);
  assert.throws(() => hub.on_tourCancel({ pid: 'u_' + joe.id, send: () => {} }, { id: t.id }), (e) => e.code === 'tour_managers_only');
  quiet(() => hub.on_tourCancel(bc, { id: t.id }));
  assert.strictEqual(t.status, 'cancelled');
  assert.strictEqual(hub.weeklyLive().weeklyN, 2, 'huỷ → giải tuần sau');
  // Xoá tài khoản bất kỳ không đụng tới giải hệ thống
  hub.tourUserGone(joe.id);
  assert.strictEqual(hub.weeklyLive().status, 'scheduled');
  hub.close(); store.close();
});

test('thể thức Thụy Sĩ (WEEKLY_CUP_FORMAT=swiss): giải theo giai đoạn, một giai đoạn Thụy Sĩ, có điểm danh', () => {
  const store = new Store(null);
  const hub = mkHub(store, { WEEKLY_CUP_FORMAT: 'swiss', WEEKLY_CUP_AT: 'sat 19:30', WEEKLY_CUP_TZ: 'Europe/Prague' });
  const t = hub.weeklyLive();
  assert.strictEqual(t.format, 'bracket');
  assert.strictEqual(t.stages[0].type, 'swiss');
  assert.strictEqual(t.checkin, true);
  assert.strictEqual(new Date(t.startsAt).getUTCDay(), 6);
  hub.close(); store.close();
});

test('hẹn giờ: nhịp chạy định kỳ, hub đóng thì dừng hẳn (tiến trình không treo)', async () => {
  const store = new Store(null);
  const hub = mkHub(store, {}, { timers: { ...SLOW, WEEKLY_TICK_MS: 15 } });
  let n = 0;
  const orig = hub.weeklyTick.bind(hub);
  hub.weeklyTick = (...a) => { n++; return orig(...a); };
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(n >= 2, 'nhịp chạy: ' + n);
  hub.close();
  const k = n;
  await new Promise((r) => setTimeout(r, 60));
  assert.strictEqual(n, k, 'đóng hub: không chạy nữa');
  // Gọi lại weeklyInit (đổi cấu hình) không để lại hẹn giờ cũ
  const h2 = mkHub(store, {}, { timers: { ...SLOW, WEEKLY_TICK_MS: 15 } });
  const t1 = h2.wcTimer;
  quiet(() => h2.weeklyInit({ WEEKLY_CUP: '0' }));
  assert.ok(t1._destroyed, 'hẹn giờ cũ đã huỷ');
  assert.strictEqual(h2.wcTimer, null);
  h2.close();
  store.close();
});
