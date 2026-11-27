// Nguồn người chơi (hub/sources.js, store-sources.js): src / ref trong hello, lần đầu thấy, khách → tài khoản, ván,
// D1 / D7, bảng chỉ cho quản trị viên, không lưu IP / UA. Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { Store } = require('../src/store.js');
const { dayOf, addDays } = require('../src/store-sources.js');
const { cleanSrc, cleanRef } = require('../src/hub/sources.js');
const { Client, boot, PASS } = require('./phaseb-client.js');

const DAY = 86400000;
const T0 = Date.parse('2026-11-01T10:00:00Z');

test('store-sources: lần đầu / hoạt động trong ngày / ván; D1, D7 đúng ngày, chỉ nhóm đã đủ ngày', () => {
  const s = new Store(null);
  // 1/11: 4 người mới từ telegram, 2 từ web
  for (const p of ['t1', 't2', 't3', 't4']) assert.strictEqual(s.srcTouch(p, 'telegram', p === 't1' ? 'vk_post' : null, T0).isNew, true);
  for (const p of ['w1', 'w2']) s.srcTouch(p, 'web', null, T0);
  assert.strictEqual(s.srcTouch('t1', 'telegram', null, T0 + 1000).isNew, false, 'cùng ngày: không mới');
  // Quay lại ngày 2/11 (D1): t1, t2, w1; ngày 8/11 (D7): t1; ngày 3/11 (không phải D1 / D7): t3
  for (const p of ['t1', 't2']) s.srcTouch(p, 'telegram', null, T0 + DAY);
  s.srcTouch('w1', 'pwa', null, T0 + DAY); // lần sau qua PWA: vẫn tính cho nguồn lần đầu (web)
  s.srcTouch('t3', 'telegram', null, T0 + 2 * DAY);
  s.srcTouch('t1', 'telegram', null, T0 + 7 * DAY);
  for (let i = 0; i < 3; i++) s.srcGame('t1', 'telegram', T0);
  s.srcGame('w2', 'web', T0);
  // Người mới hôm "nay" (8/11): chưa đủ ngày cho D1 / D7
  s.srcTouch('t5', 'telegram', null, T0 + 7 * DAY);
  const r = s.srcReport(30, T0 + 7 * DAY);
  const tg = r.sources.find((x) => x.src === 'telegram'), web = r.sources.find((x) => x.src === 'web');
  assert.strictEqual(tg.new, 5);
  assert.deepStrictEqual(tg.d1, { n: 4, back: 2 }, 'D1: t1, t2 / 4 (t5 chưa đủ ngày)');
  assert.deepStrictEqual(tg.d7, { n: 0, back: 0 }, 'D7: ngày 8/11 chưa trọn – chưa tính');
  assert.strictEqual(tg.games, 3);
  assert.strictEqual(tg.players, 1);
  assert.deepStrictEqual(web.d1, { n: 2, back: 1 });
  assert.strictEqual(web.games, 1);
  assert.deepStrictEqual(r.refs, [{ src: 'telegram', ref: 'vk_post', n: 1 }]);
  const r9 = s.srcReport(30, T0 + 8 * DAY);
  assert.deepStrictEqual(r9.sources.find((x) => x.src === 'telegram').d7, { n: 4, back: 1 }, 'D7 sau khi trọn ngày: t1 / 4');
  // Theo ngày: theo nguồn của lần vào (w1 ngày 2/11 là pwa)
  const d2 = r.daily.filter((x) => x.day === '2026-11-02');
  assert.deepStrictEqual(d2.find((x) => x.src === 'pwa'), { day: '2026-11-02', src: 'pwa', new: 0, active: 1, games: 0 });
  assert.strictEqual(d2.find((x) => x.src === 'web'), undefined);
  assert.deepStrictEqual(r.daily.find((x) => x.day === '2026-11-01' && x.src === 'telegram'), { day: '2026-11-01', src: 'telegram', new: 4, active: 4, games: 3 });
  assert.deepStrictEqual(r.daily.find((x) => x.day === '2026-11-01' && x.src === 'web'), { day: '2026-11-01', src: 'web', new: 2, active: 2, games: 1 });
  // Ngoài khoảng ngày: không tính
  assert.strictEqual(s.srcReport(7, T0 + 20 * DAY).sources.length, 0);
  // Khách → tài khoản: tài khoản chưa có gì thì nhận nguồn + hoạt động của khách
  assert.strictEqual(s.srcAdopt('t2', 'u_x'), true);
  assert.deepStrictEqual(s.srcFirst('u_x'), { day: '2026-11-01', src: 'telegram', ref: null });
  assert.strictEqual(s.srcFirst('t2'), null);
  assert.strictEqual(s.srcAdopt('t3', 'u_x'), false, 'tài khoản đã có nguồn: giữ');
  assert.strictEqual(s.srcAdopt('nobody', 'u_y'), false);
  // Xoá tài khoản / dọn cũ
  s.srcForget('u_x');
  assert.strictEqual(s.srcFirst('u_x'), null);
  s.srcPrune(T0 + 500 * DAY);
  assert.strictEqual(s.srcReport(30, T0 + 7 * DAY).daily.length, 0, 'tổng theo ngày quá 400 ngày: đã dọn');
  assert.strictEqual(addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(dayOf(T0), '2026-11-01');
  // Không có cột IP / UA nào
  const cols = ['src_first', 'src_active', 'src_daily'].flatMap((t) => s.db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name));
  assert.ok(!cols.some((c) => /ip|ua|agent/i.test(c)), cols.join(','));
});

test('sources: srcSweep dọn dữ liệu cũ mỗi ngày một lần (không phải chờ quản trị viên mở bảng)', () => {
  const { Sources } = require('../src/hub/sources.js');
  const calls = [];
  const h = Object.assign(Object.create(Sources.prototype), { store: { srcPrune: (t) => calls.push(t) } });
  const DAY = 86400000, T = Date.parse('2026-11-22T00:00:00Z');
  assert.strictEqual(h.srcSweep(T), true);
  assert.strictEqual(h.srcSweep(T + 60000), false, 'mỗi phút: không dọn lại');
  assert.strictEqual(h.srcSweep(T + DAY), true, 'qua một ngày: dọn');
  assert.deepStrictEqual(calls, [T, T + DAY]);
  const bad = Object.assign(Object.create(Sources.prototype), { store: { srcPrune: () => { throw new Error('db'); } } });
  const err = console.error; console.error = () => {};
  try { assert.strictEqual(bad.srcSweep(T), true, 'lỗi CSDL không lan ra nhịp dọn của hub'); } finally { console.error = err; }
});

test('sources: làm sạch src / ref', () => {
  assert.strictEqual(cleanSrc('telegram'), 'telegram');
  assert.strictEqual(cleanSrc('<x>'), 'unknown');
  assert.strictEqual(cleanSrc(undefined), 'unknown');
  assert.strictEqual(cleanRef('FB Group!' + 'x'.repeat(40)), 'fbgroup' + 'x'.repeat(17));
  assert.strictEqual(cleanRef(''), null);
  assert.strictEqual(cleanRef(5), null);
});

test('sources: hello mang src / ref; khách đăng ký giữ nguồn; ván online được đếm; bảng chỉ quản trị viên xem', async () => {
  const { app, url } = await boot();
  try {
    const hello = async (client, extra = {}) => {
      const c = new Client(url);
      await c.open();
      const w = c.next((m) => m.t === 'welcome');
      c.send({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex'), client: { platform: 'web', ...client }, ...extra });
      c.me = (await w).me;
      return c;
    };
    const a = await hello({ src: 'vk', ref: 'VK_Wall' });
    assert.deepStrictEqual(app.store.srcFirst(a.me.id), { day: dayOf(Date.now()), src: 'vk', ref: 'vk_wall' });
    const w = a.next((m) => m.t === 'auth');
    a.send({ t: 'register', username: 'src_a', password: PASS, name: 'src_a' });
    await w;
    const uid = app.store.byUsername.get('src_a').id;
    assert.strictEqual(app.store.srcFirst('u_' + uid).src, 'vk', 'tài khoản mới nhận nguồn của khách');
    assert.strictEqual(app.store.srcFirst(a.me.id), null, 'không đếm hai lần');
    const b = await hello({ src: 'weird' });
    assert.strictEqual(app.store.srcFirst(b.me.id).src, 'unknown');
    // Ván online xong: cộng ván cho cả hai
    app.hub.srcGames(['u_' + uid, b.me.id, null]);
    assert.strictEqual(app.store.srcReport(30).sources.find((x) => x.src === 'vk').games, 1);
    // Bảng: khách / người thường bị từ chối; quản trị viên xem được
    const denied = await b.req({ t: 'srcStats' }, 'srcStats');
    assert.strictEqual(denied.t, 'error');
    const boss = await hello({ src: 'web' });
    const wb = boss.next((m) => m.t === 'auth');
    boss.send({ t: 'register', username: 'boss', password: PASS, name: 'boss' });
    await wb;
    const rep = await boss.req({ t: 'srcStats', days: 7 }, 'srcStats');
    assert.strictEqual(rep.t, 'srcStats');
    assert.strictEqual(rep.days, 7);
    assert.ok(rep.sources.some((x) => x.src === 'vk' && x.new === 1));
    assert.strictEqual((await boss.req({ t: 'srcStats', days: 999 }, 'srcStats')).days, 30, 'số ngày lạ: 30');
    // Lỗi CSDL ở thống kê không làm hỏng đăng nhập
    const orig = app.store.srcTouch;
    app.store.srcTouch = () => { throw new Error('hỏng'); };
    const err = console.error; console.error = () => {};
    try { assert.ok((await hello({ src: 'web' })).me, 'vẫn vào được'); } finally { app.store.srcTouch = orig; console.error = err; }
    for (const c of [a, b, boss]) c.close();
  } finally { await app.stop(); }
});

test('store-sources (rà soát 27/11/2026): ván qua nửa đêm UTC cộng active; dòng khách cũ được dọn, tài khoản giữ; hub: một kết nối một danh tính khách, bảng ≤ 60 ngày', () => {
  const s = new Store(null);
  s.srcTouch('g_night', 'web', null, T0); // kết nối mở ngày 1/11
  s.srcGame('g_night', 'web', T0 + DAY); // ván xong sau nửa đêm (2/11)
  const d2 = s.srcReport(30, T0 + DAY).daily.find((x) => x.day === dayOf(T0 + DAY) && x.src === 'web');
  assert.strictEqual(d2.active, 1, 'ngày mới có hoạt động: active 1');
  assert.strictEqual(d2.games, 1);
  s.srcGame('g_night', 'web', T0 + DAY); // ván thứ hai cùng ngày: không cộng active nữa
  assert.strictEqual(s.srcReport(30, T0 + DAY).daily.find((x) => x.day === dayOf(T0 + DAY) && x.src === 'web').active, 1);
  // Dọn: khách cũ hơn 100 ngày bỏ, tài khoản giữ
  s.srcTouch('g_old', 'web', null, T0);
  s.srcTouch('u_old', 'web', null, T0);
  s.srcPrune(T0 + 101 * DAY);
  assert.strictEqual(s.srcFirst('g_old'), null);
  assert.ok(s.srcFirst('u_old'));
  // Hub: gửi lại hello với khoá khách khác trên cùng kết nối → không ghi danh tính khách thứ hai
  const { Sources } = require('../src/hub/sources.js');
  const hub = Object.assign(Object.create(Sources.prototype), { store: s });
  const conn = { src: 'web' };
  hub.srcSeen(conn, 'g_first');
  hub.srcSeen(conn, 'g_spam1');
  hub.srcSeen(conn, 'g_spam2');
  assert.ok(s.srcFirst('g_first'));
  assert.strictEqual(s.srcFirst('g_spam1'), null);
  assert.strictEqual(s.srcFirst('g_spam2'), null);
  hub.srcSeen(conn, 'u_after'); // khách đăng ký: vẫn ghi
  assert.ok(s.srcFirst('u_after'));
  // Bảng: days > 60 → 30 (hoạt động chỉ giữ 60 ngày)
  const sent = [];
  Object.assign(hub, { requireAdmin() {} });
  hub.srcStats = null;
  hub.on_srcStats({ send: (m) => sent.push(m) }, { days: 90 });
  hub.on_srcStats({ send: (m) => sent.push(m) }, { days: 60 });
  assert.deepStrictEqual(sent.map((m) => m.days), [30, 60]);
});
