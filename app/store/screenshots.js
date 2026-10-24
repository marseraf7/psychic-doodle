/*
 * Chụp ảnh cửa hàng (Google Play / App Store) từ máy chủ local — Issue #95, cảnh 4/6 làm lại ở Issue #117.
 *   node app/store/screenshots.js
 * Dùng lại setup() của bộ e2e (máy chủ tạm + tài khoản giả, KHÔNG đụng máy chủ thật).
 * Ra: app/store/shots/<ngôn ngữ>/<cỡ>/<cảnh>.png — 4 ngôn ngữ × 3 cỡ × 6 cảnh = 72 ảnh
 *     + app/store/shots/feature-graphic.png (1024×500, từ feature-graphic.html).
 * Thư mục shots/ đã được .gitignore — chỉ commit script này.
 * Cỡ ảnh (viewport × deviceScaleFactor = đúng số pixel yêu cầu):
 *   phone    360×640  ×3 = 1080×1920
 *   tablet7  400×640  ×3 = 1200×1920
 *   tablet10 800×1280 ×2 = 1600×2560
 * Cảnh 4 (#117): danh sách giải đã có sẵn — 1 Arena đang diễn ra (4 người chơi thật trên máy chủ tạm),
 *   2 giải sắp diễn ra đã được quản trị viên duyệt và có người đăng ký. Tên giải + tên người đều trung tính
 *   theo ngôn ngữ của ảnh; không chụp form tạo giải (ô ngày giờ có sẵn của Chromium theo ngôn ngữ hệ điều hành).
 * Cảnh 6 (#117): đoạn chat 2 chiều 5 tin giữa hai tài khoản có tên hiển thị trung tính theo ngôn ngữ;
 *   danh sách bạn bè có thêm 2 người đang trong ván (chính là người chơi của Arena ở cảnh 4).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { setup, sleep } = require('../../caro/tests/e2e/helpers');

const PORT = 8123;
const OUT = path.join(__dirname, 'shots');
const LANGS = ['vi', 'en', 'ru', 'zh'];
const SIZES = [
  { id: 'phone', w: 360, h: 640, dsf: 3 },
  { id: 'tablet7', w: 400, h: 640, dsf: 3 },
  { id: 'tablet10', w: 800, h: 1280, dsf: 2 },
];
// Định dạng số / ngày giờ do JS hiện theo ngôn ngữ (Intl, toLocaleString)
const LOCALE = { vi: 'vi-VN', en: 'en-GB', ru: 'ru-RU', zh: 'zh-CN' };
// Ván giữa chừng cho cảnh 2: 11 nước (X 6, O 5) → tới lượt BOAT (O); X có ba mở chéo nên BOAT phải chặn
const MID = [[0, 0], [1, 0], [1, 1], [0, 1], [2, 0], [2, 1], [1, -1], [-1, -1], [3, 1], [2, -1], [0, 2]];
// Ván mẫu cho cảnh phân tích (giống boat-rapfi.e2e.js): O bỏ mặc thế bốn ở nước 8, X thắng nước 9 — có nước bị chấm "sai lầm"
const GAME = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [-1, 0], [2, 1], [-2, 0]];
// Dàn tài khoản trung tính theo ngôn ngữ: [tên đăng nhập, tên hiển thị].
// A = người xem ảnh, B = bạn chat + chủ giải, C/D = bạn đang chơi, E/F = người chơi phụ.
// Tên đăng nhập cũng phải trông như người dùng thật vì khung chat hiện kèm "@tên đăng nhập" dưới tên hiển thị.
const CAST = {
  vi: { a: ['lananh', 'Lan'], b: ['tunganh', 'Tùng'], c: ['hoamai', 'Hoa'], d: ['ducanh', 'Đức'], e: ['trangthu', 'Trang'], f: ['hungvu', 'Hùng'] },
  en: { a: ['alex', 'Alex'], b: ['sam', 'Sam'], c: ['emma', 'Emma'], d: ['liam', 'Liam'], e: ['mia', 'Mia'], f: ['noah', 'Noah'] },
  ru: { a: ['anya', 'Аня'], b: ['sasha', 'Саша'], c: ['misha', 'Миша'], d: ['vera', 'Вера'], e: ['igor', 'Игорь'], f: ['olya', 'Оля'] },
  zh: { a: ['xiaolin', '小林'], b: ['xiaozhou', '小周'], c: ['xiaowang', '小王'], d: ['xiaoli', '小李'], e: ['xiaochen', '小陈'], f: ['xiaoyang', '小杨'] },
};
// Ba giải theo ngôn ngữ: [đang diễn ra (Arena), sắp tới (loại trực tiếp 5+3), sắp tới (Arena)]
const TOURS = {
  vi: ['Arena cuối tuần', 'Loại trực tiếp 5+3', 'Arena tối thứ 7'],
  en: ['Weekend Arena', 'Knockout 5+3', 'Saturday Arena'],
  ru: ['Выходная арена', 'Нокаут 5+3', 'Арена субботы'],
  zh: ['周末竞技场', '淘汰赛 5+3', '周六晚间竞技场'],
};
// Đoạn chat 5 tin, A và B nói qua lại, nội dung về một ván cờ
const CHAT = {
  vi: ['Tối nay làm ván không?', 'Có chứ, 8 giờ như mọi khi nhé', 'Ván hôm qua nước chặn của bạn hay thật, mình tính mãi mới thấy', 'Haha, may thôi. Mình tạo phòng rồi, vào nhé', 'Ok, vào ngay đây'],
  en: ['Up for a game tonight?', 'Sure, 8 pm as usual', 'That block you played yesterday was brilliant — took me ages to spot it', 'Ha, just luck. The room is ready, join me', 'On my way'],
  ru: ['Сыграем сегодня вечером?', 'Конечно, в 8 как обычно', 'Твой вчерашний блокирующий ход был супер, я долго его искал', 'Ха, просто повезло. Комната готова, заходи', 'Уже захожу'],
  zh: ['今晚来一局吗？', '好啊，老时间，8点', '你昨天那步封堵太漂亮了，我想了半天才看出来', '哈哈，运气而已。房间建好了，快进来', '马上到'],
};

const until = async (p, fn, arg, ms = 15000) => { try { await p.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { return false; } };
const send = (p, o) => p.evaluate((m) => window.CaroOnline.send(m), o);

/**
 * Chờ client đồng bộ xong trạng thái tài khoản sau đăng ký. Nếu chưa xong, client vẫn coi mình là khách
 * (state.me.guest) và hồ sơ người chơi không hiện nút kết bạn — đã gặp ở ngôn ngữ cuối khi máy chủ bận.
 */
async function waitAccount(p, tag, ok) {
  const good = await until(p, () => { const me = window.CaroOnline.state.me; return !!me && !me.guest; }, null, 15000);
  ok(good, `${tag}: tài khoản sẵn sàng (không còn là khách)`);
}

/** Đặt tên hiển thị trung tính cho tài khoản vừa đăng ký. */
async function setName(p, name) {
  await send(p, { t: 'setName', name });
  await sleep(250);
}

/** Kết bạn hai chiều qua hồ sơ như người dùng thật: a gửi lời mời, b chấp nhận trên trang của b. */
async function befriend(a, b, aName, bName, ok, tag) {
  await send(a, { t: 'profile', username: bName });
  await a.evaluate(() => window.CaroOnline.openDlg('profile-dlg'));
  let seen = await until(a, () => !!document.querySelector('#profile-body [data-add]'), null, 10000);
  if (!seen) {
    // Thử lại một lần (gửi lại yêu cầu hồ sơ + mở lại hộp thoại) và ghi lại nội dung hộp thoại để chẩn đoán
    const body = await a.evaluate(() => (document.querySelector('#profile-body') || {}).textContent || '(trống)');
    console.log(`  ⚠️ ${tag}: chưa thấy nút kết bạn với ${bName} — thân hộp thoại: ${body.replace(/\s+/g, ' ').slice(0, 160)}`);
    await a.evaluate(() => window.CaroOnline.closeDlg('profile-dlg'));
    await send(a, { t: 'profile', username: bName });
    await a.evaluate(() => window.CaroOnline.openDlg('profile-dlg'));
    seen = await until(a, () => !!document.querySelector('#profile-body [data-add]'), null, 10000);
  }
  ok(seen, `${tag}: ${aName} thấy nút kết bạn với ${bName}`);
  if (!seen) return;
  await a.click('#profile-body [data-add]');
  await sleep(500);
  await send(b, { t: 'profile', username: aName });
  await b.evaluate(() => window.CaroOnline.openDlg('profile-dlg'));
  const seenAcc = await until(b, () => !!document.querySelector('#profile-body [data-accept-pf]'), null, 10000);
  ok(seenAcc, `${tag}: ${bName} thấy lời mời kết bạn`);
  if (seenAcc) await b.click('#profile-body [data-accept-pf]');
  await sleep(600);
  await a.evaluate(() => window.CaroOnline.closeDlg('profile-dlg'));
  await b.evaluate(() => window.CaroOnline.closeDlg('profile-dlg'));
}

async function shoot(p, lang, size, scene) {
  await p.setViewportSize({ width: size.w, height: size.h });
  await sleep(450); // chờ bố cục ổn định theo cỡ mới
  // Chờ toast (kết bạn, hiện diện…) tắt hết để ảnh cửa hàng sạch; quá 8 giây thì gỡ thẳng
  await until(p, () => !document.querySelector('#toasts .toast'), null, 8000);
  await p.evaluate(() => document.querySelectorAll('#toasts .toast').forEach((e) => e.remove()));
  const dir = path.join(OUT, lang, size.id);
  fs.mkdirSync(dir, { recursive: true });
  await p.screenshot({ path: path.join(dir, scene + '.png') });
  console.log('  📸', lang, size.id, scene);
}

/**
 * Dựng 3 giải cho một ngôn ngữ trên máy chủ tạm: host (tài khoản B) tạo, quản trị viên 'boss' duyệt,
 * các tài khoản phụ đăng ký; Arena đầu được bắt đầu ngay để có giải "đang diễn ra" (người chơi tự vào ván).
 * Trả về danh sách id giải để dọn khỏi hub sau khi chụp xong ngôn ngữ đó.
 */
async function seedTours(host, boss, players, lang, ok) {
  const names = TOURS[lang];
  const now = Date.now();
  const defs = [
    { name: names[0], format: 'arena', startsAt: now + 70000, timeLimit: 20, rule: 'free', opening: 'free', minutes: 30, rated: true, checkin: false, maxPlayers: 100, access: 'public', club: null },
    { name: names[1], format: 'bracket', startsAt: now + 3 * 3600000, clock: '5+3', rule: 'free', opening: 'free', rated: true, checkin: true, maxPlayers: 16, access: 'public', club: null },
    { name: names[2], format: 'arena', startsAt: now + 26 * 3600000, timeLimit: 20, rule: 'free', opening: 'free', minutes: 45, rated: true, checkin: false, maxPlayers: 100, access: 'public', club: null },
  ];
  for (const d of defs) { await send(host, { t: 'tourCreate', desc: '', seeding: 'rating', ...d }); await sleep(400); }
  // Host mở hộp thoại giải và đọc id theo tên từ danh sách (giải của mình đang chờ duyệt vẫn hiện với mình).
  // (Không bắt khung WS: kết nối đã mở từ lúc nạp trang, trước khi script kịp gắn bộ thu.)
  await host.evaluate(() => window.CaroShell.go('home'));
  await sleep(400);
  await host.evaluate(() => document.getElementById('open-tours').click());
  await until(host, (n) => document.querySelectorAll('#tour-body [data-act="tour"]').length >= n, 3, 12000);
  const scraped = await host.evaluate(() => [...document.querySelectorAll('#tour-body [data-act="tour"]')].map((b) => ({ id: b.dataset.id, name: (b.querySelector('b') || {}).textContent || '' })));
  const ids = names.map((n) => (scraped.find((x) => x.name === n) || {}).id).filter(Boolean);
  ok(ids.length === 3, `${lang}: tạo đủ 3 giải (đọc được ${ids.length} id từ danh sách)`);
  await host.evaluate(() => window.CaroOnline.closeDlg('tour-dlg'));
  if (ids.length < 3) return ids;
  // Quản trị viên duyệt cả ba
  await boss.evaluate((list) => list.forEach((id) => window.CaroOnline.send({ t: 'adminReview', kind: 'tour', id, approve: true })), ids);
  await sleep(600);
  // Đăng ký: Arena đang chạy + giải loại trực tiếp: cả 4 người chơi phụ; Arena sắp tới: 2 người
  for (const p of players) { await send(p, { t: 'tourJoin', id: ids[0] }); await send(p, { t: 'tourJoin', id: ids[1] }); }
  await send(players[2], { t: 'tourJoin', id: ids[2] });
  await send(players[3], { t: 'tourJoin', id: ids[2] });
  await send(host, { t: 'tourJoin', id: ids[1] }); // chủ giải cũng đăng ký giải loại trực tiếp
  await sleep(500);
  // Bắt đầu Arena đầu ngay — 4 người chơi tự vào ván, trạng thái hiện diện thành "đang chơi"
  await send(host, { t: 'tourStart', id: ids[0] });
  await sleep(2500);
  // Kiểm lại qua DOM của host: danh sách có thẻ trạng thái "live" của giải đang diễn ra và vẫn đủ 3 mục
  await host.evaluate(() => document.getElementById('open-tours').click());
  const live = await until(host, () => !!document.querySelector('#tour-body .pill.live'), null, 12000);
  const items = await host.evaluate(() => document.querySelectorAll('#tour-body [data-act="tour"]').length);
  ok(live && items >= 3, `${lang}: Arena đang diễn ra trong danh sách (live=${live}, số mục=${items})`);
  await host.evaluate(() => window.CaroOnline.closeDlg('tour-dlg'));
  return ids;
}

/** Mở hộp chat với một người bạn trên một trang; trả về bộ chọn ô nhập + vùng tin theo kiểu hiển thị của trang. */
async function openChat(p, friendId) {
  // data-open trong danh sách bạn bè là id tài khoản trần, còn state.me.id có tiền tố 'u_' — bỏ tiền tố khi chọn
  const fid = String(friendId).replace(/^u_/, '');
  // Đóng dialog còn mở từ vòng chụp trước (nhất là #chat toàn màn hình ở trang của bạn diễn, dùng chung 2 vòng cỡ)
  await p.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) { if (window.CaroOnline && window.CaroOnline.closeDlg) window.CaroOnline.closeDlg(d.id); else d.close(); } });
  await sleep(300);
  await p.evaluate(() => window.CaroShell.go('home'));
  await sleep(400);
  await p.click('#tabbar [data-tab="home"]');
  await sleep(500);
  await p.click('.cb-launch');
  await until(p, (id) => !!document.querySelector(`.cb-list [data-open="${id}"]`), fid, 10000);
  await p.click(`.cb-list [data-open="${fid}"]`);
  await until(p, () => !!document.querySelector('.cb-win input') || (document.getElementById('chat') || {}).open, null, 10000);
  const mobile = await p.evaluate(() => (document.getElementById('chat') || {}).open && !document.querySelector('.cb-win input'));
  // Gửi bằng nút Gửi của form, không dùng phím Enter: ở vòng cỡ thứ hai, Enter của Playwright
  // (submit ngầm) làm tin của trang bạn diễn bị rơi dù app vẫn gọi dmSend — đã tái hiện và kiểm chứng.
  // (Nút Gửi của #chat-form trong index.html không có thuộc tính type — chọn theo vị trí trong form.)
  return mobile
    ? { inp: '#chat-form input[name="text"]', msgs: '#chat-msgs', btn: '#chat-form button' }
    : { inp: '.cb-win input', msgs: '.cb-win .cb-msgs', btn: '.cb-win form button' };
}

/** Chạy 6 cảnh trên một trang; sizes = các cỡ cùng deviceScaleFactor với trang. */
async function scenes(p, friend, partnerName, lang, sizes, ok) {
  const at = async (scene, prep) => { await prep(); for (const s of sizes) await shoot(p, lang, s, scene); };

  await at('01-home', async () => {
    await p.click('#tabbar [data-tab="home"]');
    await sleep(700);
  });

  await at('02-game-boat', async () => {
    await p.evaluate((MID) => { window.CaroApp.setBot('boat', 7); window.CaroApp.startPreset({ rule: 'free', mode: 'ai', bot: 'boat', moves: MID }); }, MID);
    // BOAT đi thêm một nước (Rapfi hoặc engine dự phòng đều được — chỉ cần ván đang sống)
    ok(await until(p, (n) => window.CaroApp.board.moves.length > n, MID.length, 45000), `${lang}: BOAT đi nước trong cảnh 2`);
    await sleep(500);
  });

  await at('03-analysis', async () => {
    await p.evaluate((g) => window.CaroApp.startPreset({ rule: 'free', mode: 'pvp', moves: g }), GAME);
    await sleep(300);
    await p.evaluate(() => document.getElementById('btn-analyze').click());
    ok(await until(p, () => !!document.querySelector('.an-acc'), null, 30000), `${lang}: mở được phân tích ván`);
    await until(p, () => !document.getElementById('an-refine'), null, 90000); // chờ chấm xong; quá hạn vẫn chụp
    await sleep(400);
  });

  await at('04-tours', async () => {
    await p.evaluate(() => window.CaroShell.go('home'));
    await sleep(400);
    await p.evaluate(() => document.getElementById('open-tours').click());
    // Danh sách giải đã dựng sẵn (seedTours): chờ đủ 3 giải hiện trong danh sách rồi chụp
    ok(await until(p, (n) => document.querySelectorAll('#tour-body .titem').length >= n, 3, 12000), `${lang}: danh sách hiện đủ 3 giải`);
    await sleep(600);
  });

  await at('05-puzzle', async () => {
    await p.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) { if (window.CaroOnline && window.CaroOnline.closeDlg) window.CaroOnline.closeDlg(d.id); else d.close(); } }); // đóng dialog giải nếu còn mở
    await p.evaluate(() => window.CaroShell.go('home'));
    await sleep(400);
    await p.click('#tabbar [data-tab="puzzles"]');
    await sleep(600);
    await p.click('[data-pz="rated"]');
    await until(p, () => !!document.querySelector('#board, .pz-board, canvas'), null, 10000);
    await sleep(700);
  });

  await at('06-friends-chat', async () => {
    await p.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) { if (window.CaroOnline && window.CaroOnline.closeDlg) window.CaroOnline.closeDlg(d.id); else d.close(); } });
    // Cả hai phía cùng mở cuộc trò chuyện, rồi nói qua lại 5 tin theo kịch bản của ngôn ngữ
    const mine = await openChat(p, friend.uid);
    const theirs = await openChat(friend, p.uid);
    const lines = CHAT[lang];
    for (let i = 0; i < lines.length; i++) {
      const fromA = i % 2 === 0;
      const from = fromA ? p : friend;
      const fromSel = fromA ? mine : theirs;
      const toSel = fromA ? theirs : mine;
      await from.fill(fromSel.inp, lines[i]);
      await from.click(fromSel.btn);
      const seen = await until(fromA ? friend : p, ([sel, txt]) => (document.querySelector(sel) || {}).textContent.includes(txt), [toSel.msgs, lines[i]], 10000);
      ok(seen, `${lang}: tin chat ${i + 1}/5 tới phía bên kia`);
      await sleep(350);
    }
    // Quay về trang của người xem để chụp: cuộc trò chuyện đang mở, đủ 5 tin (đã kiểm từng tin ở trên).
    // Chờ thêm đầu hộp chat hiện tên bạn chat (nó vẽ theo sự kiện bạn bè, có thể chậm hơn vùng tin một nhịp)
    await until(p, (n) => { const h = document.querySelector('#chat') || document.querySelector('.cb-win'); return !!h && h.textContent.includes(n); }, partnerName, 6000);
    await sleep(400);
  });
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  let made = 0;

  // Mỗi ngôn ngữ chạy trên một máy chủ tạm + trình duyệt riêng (setup() của bộ e2e): trạng thái
  // (giải, phòng, tài khoản) không dồn sang ngôn ngữ sau — khi dồn chung một máy chủ, tới ngôn ngữ
  // cuối các bước đồng bộ phía client (đăng ký, hồ sơ) chậm dần và lỗi vặt.
  for (const lang of LANGS) {
    console.log('== Ngôn ngữ:', lang);
    const { app, browser, user, ok, finish } = await setup(PORT);
    const C = CAST[lang];
    // Quản trị viên của bộ e2e (helpers.js cấu hình admins: ['boss']) — dùng duyệt giải
    const boss = await user('vi', 'boss', 1100);
    // Dàn tài khoản của ngôn ngữ: B = bạn chat + chủ giải; C/D = bạn của A, đang chơi ở Arena; E/F = người chơi phụ
    const sam = await user(lang, C.b[0], 390);
    await waitAccount(sam, `${lang}/${C.b[0]}`, ok);
    await setName(sam, C.b[1]);
    const p1 = await user(lang, C.c[0], 390); await waitAccount(p1, `${lang}/${C.c[0]}`, ok); await setName(p1, C.c[1]);
    const p2 = await user(lang, C.d[0], 390); await waitAccount(p2, `${lang}/${C.d[0]}`, ok); await setName(p2, C.d[1]);
    const q1 = await user(lang, C.e[0], 390); await waitAccount(q1, `${lang}/${C.e[0]}`, ok); await setName(q1, C.e[1]);
    const q2 = await user(lang, C.f[0], 390); await waitAccount(q2, `${lang}/${C.f[0]}`, ok); await setName(q2, C.f[1]);
    await seedTours(sam, boss, [p1, p2, q1, q2], lang, ok);

    // Hai nhóm theo deviceScaleFactor: 3 (phone + tablet7 chung một trang) và 2 (tablet10)
    for (const dsf of [3, 2]) {
      const sizes = SIZES.filter((s) => s.dsf === dsf);
      const first = sizes[0];
      // Tên đăng nhập của người xem cộng thêm số nhóm cỡ cho khỏi trùng giữa 2 nhóm (không hiện trong ảnh)
      const alex = await user(lang, C.a[0] + dsf, first.w, { viewport: { width: first.w, height: first.h }, deviceScaleFactor: dsf, locale: LOCALE[lang] });
      await waitAccount(alex, `${lang}/${alex.uname}`, ok);
      await setName(alex, C.a[1]);
      // Bạn chat của nhóm này: nhóm 3 dùng chính chủ giải; nhóm 2 dùng một tài khoản trùng tên hiển thị khác.
      // Lý do: máy chủ có bộ lọc chống spam tin nhắn (server/src/moderation.js) — cùng một tài khoản gửi lại
      // nguyên văn đoạn chat trong thời gian gần sẽ bị chặn như tin trùng (dm_duplicate), tin trả lời biến mất.
      // Tài khoản bạn chat mới = người gửi mới, không vướng lịch sử lọc. Tên đăng nhập của bạn chat nhóm 2
      // không hiện trong ảnh nào (cảnh 6 ở tablet10 là cửa sổ bong bóng, chỉ hiện tên hiển thị).
      let mate = sam;
      if (dsf === 2) {
        mate = await user(lang, C.b[0] + '2', 390);
        await waitAccount(mate, `${lang}/${mate.uname}`, ok);
        await setName(mate, C.b[1]);
      }
      // Kết bạn alex <-> bạn chat, C và D (đang trong ván Arena → danh sách hiện "đang chơi")
      await befriend(alex, mate, alex.uname, mate.uname, ok, lang);
      await befriend(alex, p1, alex.uname, p1.uname, ok, lang);
      await befriend(alex, p2, alex.uname, p2.uname, ok, lang);
      await scenes(alex, mate, C.b[1], lang, sizes, ok);
      made += sizes.length * 6;
      await alex.context().close();
      if (mate !== sam) await mate.context().close();
    }
    // Ngắt mọi người chơi rồi chờ phòng của ngôn ngữ này giải tán hết trước khi finish() tắt máy chủ:
    // hẹn giờ đồng hồ của một phòng còn sót vẫn có thể quyết toán ván sau khi store đã đóng
    // (gặp lỗi "statement has been finalized" ở Store.addH2h — đã tái hiện khi đóng máy chủ giữa chừng).
    for (const p of [boss, sam, p1, p2, q1, q2]) { try { await p.context().close(); } catch (e) { /* đã đóng */ } }
    const t0 = Date.now();
    while (app.hub.rooms.size > 0 && Date.now() - t0 < 40000) await sleep(1000);

    if (lang === LANGS[LANGS.length - 1]) {
      // Feature graphic 1024×500 từ trang tĩnh (dùng trình duyệt của vòng cuối)
      const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 } });
      const fp = await ctx.newPage();
      const ferr = [];
      fp.on('pageerror', (e) => ferr.push(e.message));
      await fp.goto('file://' + path.join(__dirname, 'feature-graphic.html'));
      await sleep(400);
      await fp.screenshot({ path: path.join(OUT, 'feature-graphic.png') });
      ok(!ferr.length, 'feature-graphic.html không lỗi JS' + (ferr.length ? ': ' + ferr.join(' | ') : ''));
      await ctx.close();
      // Đếm đủ ảnh của cả 4 ngôn ngữ
      let count = 0;
      for (const l of LANGS) for (const s of SIZES) for (const f of fs.readdirSync(path.join(OUT, l, s.id))) if (f.endsWith('.png')) count++;
      ok(count === 72, `đủ 72 ảnh cảnh (thực tế ${count})`);
      ok(fs.existsSync(path.join(OUT, 'feature-graphic.png')), 'có feature-graphic.png');
    }
    await finish(); // đóng trình duyệt + máy chủ của ngôn ngữ này, in tổng kết riêng (kèm lỗi JS)
  }
  console.log('Ảnh đã chụp:', made + 1, '· thư mục:', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
