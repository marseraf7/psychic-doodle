/*
 * Link chia sẻ mở trong trình duyệt của Zalo / Messenger (A3): khách mới tinh (không có dữ liệu, chưa đăng nhập, 390px,
 * UA Zalo / Messenger) mở từng loại link – xem lại ván (?replay=), ván đang đấu (?room= – xem trực tiếp), lời mời phòng
 * còn ghế (?room=), giải đấu (?t=), giải Offline (?o=), CLB (?club=), hồ sơ (?u=) – phải thấy nội dung ngay, không lỗi JS,
 * không lỗi hiển thị, kèm thẻ nút "Chơi ngay" / "Vào phòng" / "Đăng ký giải" bấm được. Máy chủ trả thẻ og:* cho từng loại.
 * Nút chia sẻ: hồ sơ (bảng chia sẻ của máy / sao chép kèm lời nhắn), link mời phòng hiện cả khi không có navigator.share.
 *   node caro/tests/e2e/share-links.e2e.js
 */
'use strict';
const { setup, gotoRetry } = require('./helpers');
const { audit } = require('./ui-audit');

const ZALO = 'Mozilla/5.0 (Linux; Android 12; SM-A525F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36 Zalo android/12100737 ZaloTheme/light ZaloLanguage/vi';
const MESSENGER = 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/440.0.0.30.110;]';

(async () => {
  const PORT = 8141;
  const { app, browser, user, ok, sleep, finish } = await setup(PORT);
  const URL = `http://localhost:${PORT}/`;
  const send = (p, m) => p.evaluate((x) => window.CaroOnline.send(x), m);
  const until = async (fn, ms = 10000) => { const t = Date.now(); let v; while (!(v = await fn()) && Date.now() - t < ms) await sleep(150); return v; };

  // ---------------------------------------------------------------- Dữ liệu: ván đã lưu, phòng, giải, giải Offline, CLB
  const boss = await user('vi', 'boss'); // quản trị viên: giải / CLB được duyệt ngay
  const opp = await user('vi', 'sl_opp');
  const share = app.store.recordGame({ kind: 'room', xId: boss.uid, oId: opp.uid, xName: 'boss', oName: 'sl_opp', winner: 1, reason: 'win',
    moves: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0]] });
  // Ván đang đấu trong phòng công khai
  await send(boss, { t: 'createRoom', public: true });
  const live = await until(() => boss.evaluate(() => window.CaroOnline.state.room));
  await send(opp, { t: 'joinRoom', code: live.code });
  await until(() => opp.evaluate(() => { const r = window.CaroOnline.state.room; return r && r.players.length === 2; }));
  // Phòng công khai còn một ghế trống (lời mời)
  const waiter = await user('vi', 'sl_wait');
  await send(waiter, { t: 'createRoom', public: true });
  const open = await until(() => waiter.evaluate(() => window.CaroOnline.state.room));
  // Giải đấu, giải Offline, CLB
  await send(boss, { t: 'tourCreate', name: 'Cúp Chia Sẻ', format: 'knockout', startsAt: Date.now() + 3600000, timeLimit: 30, bestOf: 1, checkin: false });
  const tour = await until(() => [...app.hub.tours.values()].find((t) => t.name === 'Cúp Chia Sẻ'));
  await send(boss, { t: 'otCreate', name: 'Giải Offline Chia Sẻ', slug: 'giai-chia-se', spec: { sport: 'football', stages: [{ type: 'roundrobin', groups: 1 }] }, teams: ['Đội A', 'Đội B', 'Đội C', 'Đội D'] });
  const ot = await until(() => app.hub.otGet('giai-chia-se'));
  await send(boss, { t: 'otStart', id: ot.id });
  await until(() => app.hub.otGet(ot.id).status === 'running');
  await send(boss, { t: 'clubCreate', name: 'CLB Chia Sẻ', desc: 'Câu lạc bộ thử link', intro: 'Chơi Caro mỗi tối', join: 'open' });
  const club = await until(() => [...app.hub.clubs.values()].find((c) => c.name === 'CLB Chia Sẻ'));
  ok(share && live && open && tour && ot && club, 'đã có ván, 2 phòng, giải, giải Offline, CLB để chia sẻ');

  // ---------------------------------------------------------------- Thẻ xem trước og (máy chủ) cho từng loại link
  const links = [
    ['replay', `?replay=${share}`, 'boss'], ['live', `?room=${live.code}`, 'boss'], ['room', `?room=${open.code}`, open.code],
    ['tour', `?t=${tour.id}`, 'Cúp Chia Sẻ'], ['otour', '?o=giai-chia-se', 'Giải Offline Chia Sẻ'], ['club', `?club=${club.id}`, 'CLB Chia Sẻ'], ['user', '?u=boss', 'boss'],
  ];
  for (const [kind, q, want] of links) {
    const html = await (await fetch(URL + q, { headers: { 'user-agent': ZALO } })).text();
    const title = (/property="og:title" content="([^"]*)"/.exec(html) || [])[1] || '';
    const img = (/property="og:image" content="([^"]*)"/.exec(html) || [])[1] || '';
    const im = img ? await fetch(img) : null;
    ok(title.includes(want) && /og:description/.test(html) && im && im.status === 200 && im.headers.get('content-type') === 'image/png',
      `og ${kind}: "${title}", ảnh ${img.replace(URL, '/')} (${im && im.status})`);
  }

  // ---------------------------------------------------------------- Khách mở từng link trong trình duyệt nhúng
  const errs = [];
  async function guest(q, ua = ZALO) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua, locale: 'vi-VN', serviceWorkers: 'block', isMobile: true, hasTouch: true }); // máy tiếng Việt, không lưu gì
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(q + ': ' + e.message));
    await gotoRetry(p, URL + q);
    p.ctx = ctx;
    return p;
  }
  const cta = (p) => until(() => p.evaluate(() => { const c = document.getElementById('link-cta'); return c && !c.hidden ? c.querySelector('.lc-go').textContent : ''; }), 6000);
  const vis = (p, text) => p.evaluate((t) => document.body.innerText.includes(t), text);
  const clean = async (p, what) => { const a = await audit(p); ok(a.length === 0, `${what}: 0 lỗi hiển thị ở 390px` + (a.length ? ' – ' + JSON.stringify(a.slice(0, 3)) : '')); };

  // 1. Xem lại ván
  let p = await guest(`?replay=${share}`);
  ok(await until(() => p.evaluate(() => !!window.CaroApp.replay)), 'xem lại ván: mở ngay chế độ xem lại, không cần đăng nhập');
  ok(await cta(p) === 'Chơi ngay', 'xem lại ván: thẻ "Chơi ngay"');
  await clean(p, 'xem lại ván');
  await p.click('#link-cta .lc-go');
  ok(await until(() => p.evaluate(() => !window.CaroApp.replay && !!document.getElementById('ng-tc').closest('dialog').open)), 'bấm "Chơi ngay": rời ván xem lại, mở bảng Ván mới');
  await p.ctx.close();

  // 2. Ván đang đấu (Messenger)
  p = await guest(`?room=${live.code}`, MESSENGER);
  ok(await until(() => p.evaluate(() => !!window.CaroApp.watching)), 'ván đang đấu: khách xem trực tiếp ngay');
  ok(await cta(p) === 'Chơi ngay', 'ván đang đấu (không còn ghế): thẻ "Chơi ngay"');
  await clean(p, 'xem trực tiếp');
  await p.ctx.close();

  // 3. Lời mời phòng còn ghế: "Vào phòng" ngồi ghế
  p = await guest(`?room=${open.code}`);
  ok(await until(() => p.evaluate(() => !!window.CaroApp.watching)), 'lời mời phòng: vào xem trước');
  ok(await cta(p) === 'Vào phòng', 'lời mời phòng còn ghế: thẻ "Vào phòng"');
  await p.click('#link-cta .lc-go');
  ok(await until(() => p.evaluate(() => { const r = window.CaroOnline.state.room; return !!(r && r.players.length === 2); })), 'bấm "Vào phòng": khách ngồi ghế, phòng đủ 2 người');
  await p.ctx.close();

  // 4. Giải đấu: "Đăng ký giải" mở form tạo tài khoản
  p = await guest(`?t=${tour.id}`);
  ok(await until(() => vis(p, 'Cúp Chia Sẻ')), 'giải đấu: thấy trang giải ngay (khách)');
  ok(await cta(p) === 'Đăng ký giải', 'giải đấu: thẻ "Đăng ký giải"');
  await clean(p, 'trang giải');
  ok(await p.evaluate(() => !!document.querySelector('[data-act="share"].primary')), 'trang giải: nút Chia sẻ nổi bật');
  await p.click('#link-cta .lc-go');
  ok(await until(() => p.evaluate(() => { const f = document.getElementById('auth-form'); return f.closest('dialog').open && f.classList.contains('register'); })), 'bấm "Đăng ký giải": mở form tạo tài khoản');
  await p.ctx.close();

  // 5. Giải Offline
  p = await guest('?o=giai-chia-se');
  ok(await until(() => vis(p, 'Giải Offline Chia Sẻ') && vis(p, 'Đội A')), 'giải Offline: thấy tên giải và các đội ngay');
  ok(await cta(p) === 'Đăng ký giải', 'giải Offline: thẻ "Đăng ký giải"');
  await clean(p, 'trang giải Offline');
  await p.ctx.close();

  // 6. CLB
  p = await guest(`?club=${club.id}`, MESSENGER);
  ok(await until(() => vis(p, 'CLB Chia Sẻ')), 'CLB: thấy trang CLB ngay (khách)');
  ok(await cta(p) === 'Chơi ngay', 'CLB: thẻ "Chơi ngay"');
  await clean(p, 'trang CLB');
  await p.ctx.close();

  // 7. Hồ sơ ?u=: mở hồ sơ ngay, có nút chia sẻ; link không còn ?u= trên thanh địa chỉ
  p = await guest('?u=boss');
  ok(await until(() => p.evaluate(() => { const d = document.getElementById('profile-dlg'); return d.open && d.textContent.includes('@boss'); })), 'hồ sơ: mở hồ sơ @boss ngay (khách)');
  ok(await p.evaluate(() => !/[?&]u=/.test(location.search)), 'hồ sơ: bỏ ?u= khỏi địa chỉ (tải lại không mở lại)');
  ok(await cta(p) === 'Chơi ngay', 'hồ sơ: thẻ "Chơi ngay"');
  await clean(p, 'hồ sơ');
  // Nút chia sẻ: bảng chia sẻ của máy nhận link ?u= + lời nhắn
  const shared = await p.evaluate(async () => {
    let got = null;
    navigator.share = async (d) => { got = d; };
    document.querySelector('[data-pf-share]').click();
    await new Promise((r) => setTimeout(r, 100));
    return got;
  });
  ok(shared && /\?u=boss$/.test(shared.url) && /boss/.test(shared.text), 'hồ sơ: Chia sẻ → bảng chia sẻ của máy, link ?u=boss + lời nhắn (' + JSON.stringify(shared) + ')');
  // Không có bảng chia sẻ: sao chép "lời nhắn + link", báo đã sao chép
  const copied = await p.evaluate(async () => {
    let got = null;
    delete navigator.share; navigator.share = undefined;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { got = t; } }, configurable: true });
    document.querySelector('[data-pf-share]').click();
    await new Promise((r) => setTimeout(r, 150));
    return { got, toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent).join('|') };
  });
  ok(copied.got && /boss/.test(copied.got) && /\?u=boss/.test(copied.got) && /Đã sao chép link/.test(copied.toast), 'không có bảng chia sẻ: sao chép lời nhắn + link, báo đã sao chép');
  await p.ctx.close();

  // 8. Người đã đăng nhập mở link: không có thẻ mời
  await boss.goto(URL + `?t=${tour.id}`);
  await sleep(2500);
  ok(await boss.evaluate(() => { const c = document.getElementById('link-cta'); return !c || c.hidden; }), 'đã đăng nhập: không hiện thẻ mời');

  ok(!errs.length, 'khách mở link: không lỗi JS' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await finish();
})();
