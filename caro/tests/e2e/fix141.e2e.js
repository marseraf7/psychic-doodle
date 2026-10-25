/*
 * Kiểm thử trình duyệt cho Issue #141 (giao diện ván online) — các mục 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11.
 * Mục 1–3 chạy với HAI HỒ SƠ TRÌNH DUYỆT RIÊNG (hai browser.newContext()), không dùng hai tab chung hồ sơ.
 * Khác helpers.user(): ở đây tự đăng ký tài khoản để ghi lại hộp confirm() gốc và chọn Chấp nhận / Huỷ
 * theo từng bước (helpers.user tự động chấp nhận mọi hộp thoại nên không kiểm được nhánh Huỷ).
 *   node caro/tests/e2e/fix141.e2e.js
 */
'use strict';
const { setup, play, roomOf, sleep } = require('./helpers');

(async () => {
  const PORT = 8123;
  const { browser, ok, shot, finish } = await setup(PORT);
  const errors = [];
  const url = `http://localhost:${PORT}/`;

  /** Người chơi mới trong hồ sơ riêng; p.dialogs ghi các confirm() đã hiện, p.dialogMode: 'accept' | 'dismiss'. */
  async function user141(name, ctxOpts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, ...ctxOpts });
    await ctx.addInitScript(() => localStorage.setItem('caro.lang', 'vi'));
    const p = await ctx.newPage();
    p.ctx = ctx;
    p.dialogs = [];
    p.dialogMode = 'accept';
    p.on('dialog', (d) => {
      p.dialogs.push(d.message());
      if (p.dialogMode === 'accept') d.accept(); else d.dismiss();
    });
    p.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
    await p.goto(url);
    await sleep(400);
    await p.click('#tabbar [data-tab="more"]');
    await sleep(500);
    await p.click('#go-register');
    await sleep(150);
    await p.fill('#auth-form input[name=username]', name);
    await p.fill('#auth-form input[name=password]', 'caro-pass1');
    await p.click('#auth-submit');
    await sleep(700);
    p.uname = name;
    p.uid = await p.evaluate(() => window.CaroOnline.state.me.id);
    return p;
  }
  const send = (p, m) => p.evaluate((mm) => window.CaroOnline.send(mm), m);
  const move = (p, x, y) => send(p, { t: 'move', x, y });
  /** Tạo phòng công khai qua giao diện (thẻ Phòng chờ), trả về mã phòng. */
  async function createRoomUI(p) {
    await p.evaluate(() => window.CaroHome.open());
    await sleep(300);
    await p.click('.home-tabs [data-hpane="lobby"]');
    await p.check('#room-public');
    await p.click('#create-room');
    await sleep(600);
    const r = await roomOf(p);
    await p.keyboard.press('Escape'); // đóng hộp thông tin phòng tự mở
    return r && r.code;
  }
  const inLobbyPane = (p) => p.evaluate(() => {
    const pane = document.querySelector('.hpane[data-hpane="lobby"]');
    return !!(window.CaroShell && window.CaroShell.visible && pane && !pane.hidden);
  });

  const a = await user141('m141_a');
  const b = await user141('m141_b');
  const c = await user141('m141_c');

  // ---------------------------------------------------------- Phòng chung cho mục 1, 2
  const code = await createRoomUI(a);
  ok(!!code, 'mục 1: A tạo được phòng ' + code);
  await send(b, { t: 'joinRoom', code });
  await sleep(700);
  await move(a, 0, 0); await sleep(250);
  await move(b, 5, 5); await sleep(250);
  await move(a, 1, 0); await sleep(250);
  await move(b, 6, 5); await sleep(250);
  ok((await roomOf(b)).moves.length === 4, 'mục 1: ván đang dở, đã có 4 nước');

  // Mục 1 — tạo phòng mới khi đang có ván dở: Huỷ thì ở lại, Đồng ý mới rời
  b.dialogMode = 'dismiss';
  b.dialogs = [];
  await b.evaluate(() => window.CaroHome.open());
  await sleep(300);
  await b.click('.home-tabs [data-hpane="lobby"]');
  await b.click('#create-room');
  await sleep(400);
  ok(b.dialogs.some((m) => /xử thua/.test(m)), 'mục 1: tạo phòng lúc có ván dở hiện hỏi xác nhận — ' + b.dialogs.join(' | '));
  ok((await roomOf(b)).code === code && (await roomOf(b)).moves.length === 4, 'mục 1: bấm Huỷ ở hộp xác nhận → vẫn nguyên ván cũ');
  b.dialogMode = 'accept';
  await b.click('#create-room');
  await sleep(600);
  const rNew = await roomOf(b);
  ok(rNew && rNew.code !== code && rNew.players.length === 1, 'mục 1: bấm Đồng ý → sang phòng mới, ván cũ bị bỏ');
  await b.evaluate(() => window.CaroApp.toBoard()); // đang online sẵn nên khung trang chưa tự ẩn: vào bàn cờ như người chơi bấm thẻ tiếp tục ván
  await sleep(300);

  // Mục 2a — Rời phòng ở màn chờ → về Trang chủ, thẻ Phòng chờ (không mở lại ván với máy)
  await b.click('#btn-leave');
  await sleep(600);
  ok(!(await b.evaluate(() => !!window.CaroApp.online)), 'mục 2: rời phòng chờ xong không còn ở chế độ online');
  ok(await inLobbyPane(b), 'mục 2: rời phòng chờ → về Trang chủ, thẻ Phòng chờ');

  // Mục 1 — vào phòng khác bằng form khi đang có ván dở.
  // (Ván ở phòng đầu đã kết thúc ngay khi B rời đi lần đầu, nên phải dựng một ván dở mới.)
  const code1 = await createRoomUI(a);
  await send(b, { t: 'joinRoom', code: code1 });
  await sleep(600);
  await move(a, 0, 0); await sleep(250);
  await move(b, 5, 5); await sleep(250);
  ok((await roomOf(b)).code === code1 && (await roomOf(b)).moves.length === 2, 'mục 1: dựng ván dở mới cho đoạn form vào phòng');
  const codeOld = code1;
  const codeC = await createRoomUI(c);
  ok(!!codeC && codeC !== code, 'mục 1: C tạo phòng riêng ' + codeC);
  const pwC = await c.evaluate(() => window.CaroOnline.state.room.password);
  const fillJoin = async () => {
    await b.click('#open-join');
    await sleep(300);
    await b.fill('#join-form input[name=code]', codeC);
    await b.fill('#join-form input[name=password]', /^\d{3}$/.test(pwC || '') ? pwC : '123'); // ô mật khẩu bắt buộc nhập
  };
  b.dialogMode = 'dismiss';
  b.dialogs = [];
  await b.evaluate(() => window.CaroHome.open());
  await sleep(300);
  await b.click('.home-tabs [data-hpane="lobby"]');
  await fillJoin();
  await b.click('#join-form .primary');
  await sleep(400);
  ok(b.dialogs.some((m) => /xử thua/.test(m)), 'mục 1: gửi form vào phòng khác lúc có ván dở hiện hỏi xác nhận');
  ok((await roomOf(b)).code === codeOld, 'mục 1: Huỷ ở form vào phòng → vẫn ở phòng cũ');
  await b.keyboard.press('Escape');
  b.dialogMode = 'accept';
  await fillJoin();
  await b.click('#join-form .primary');
  await sleep(600);
  ok((await roomOf(b)).code === codeC, 'mục 1: Đồng ý ở form vào phòng → sang phòng của C');
  // B rời phòng của C (phòng chưa có nước đi): cũng về sảnh; C rời phòng của mình
  await b.evaluate(() => window.CaroApp.toBoard());
  await sleep(300);
  await b.click('#btn-leave');
  await sleep(500);
  ok(await inLobbyPane(b), 'mục 2: rời phòng chưa đấu → về sảnh');
  await c.click('#btn-leave');
  await sleep(500);

  // Mục 1 — xếp cặp nhanh lúc có ván dở vẫn hỏi trước (hành vi có từ trước, kiểm hồi quy)
  const code2 = await createRoomUI(a);
  await send(b, { t: 'joinRoom', code: code2 });
  await sleep(600);
  await move(a, 0, 0); await sleep(250);
  await move(b, 5, 5); await sleep(250);
  b.dialogMode = 'dismiss';
  b.dialogs = [];
  await b.evaluate(() => window.CaroHome.open());
  await sleep(300);
  await b.click('.home-tabs [data-hpane="quick"]');
  await b.click('#qm-grid .qm-tile[data-time="0"]');
  await sleep(400);
  ok(b.dialogs.some((m) => /xử thua/.test(m)), 'mục 1: xếp cặp nhanh lúc có ván dở hiện hỏi xác nhận');
  ok((await roomOf(b)).code === code2, 'mục 1: Huỷ xếp cặp → vẫn ở ván cũ');
  b.dialogMode = 'accept';

  // Mục 2b — "Rời phòng" giữa ván: hỏi xác nhận, Huỷ thì ở lại, Đồng ý thì rời hẳn (trước đây bấm không tác dụng)
  b.dialogMode = 'dismiss';
  b.dialogs = [];
  await b.evaluate(() => window.CaroApp.toBoard());
  await sleep(300);
  await b.click('#btn-leave');
  await sleep(400);
  ok(b.dialogs.some((m) => /xử thua/.test(m)), 'mục 2: Rời phòng giữa ván hiện hỏi xác nhận xử thua');
  ok((await roomOf(b)).code === code2, 'mục 2: Huỷ rời phòng → vẫn trong ván');
  b.dialogMode = 'accept';
  await b.click('#btn-leave');
  await sleep(600);
  ok(!(await b.evaluate(() => !!window.CaroApp.online)), 'mục 2: Đồng ý rời phòng giữa ván → rời hẳn');
  ok(await inLobbyPane(b), 'mục 2: rời giữa ván → về Trang chủ, thẻ Phòng chờ');
  // A dọn phòng (bước dọn dẹp, không thuộc khẳng định nào): rời bằng lệnh gửi
  await send(a, { t: 'leaveRoom' });
  await sleep(500);

  // ------------------------------------------- Mục 4, 10, 7: hai tài khoản MỚI
  // (A/B đã bỏ ván nhiều lần ở các mục trên nên bị máy chủ tạm cấm vào phòng —
  //  cơ chế chống bỏ ván có sẵn của máy chủ; đoạn này cần người chơi chưa bị cấm.)
  const f = await user141('m141_f');
  const g = await user141('m141_g');
  const code3 = await createRoomUI(f);
  await send(g, { t: 'joinRoom', code: code3 });
  await sleep(600);
  ok((await roomOf(g) || {}).code === code3, 'mục 4: người chơi mới vào được phòng');
  await move(f, 0, 0); await sleep(250);
  await move(g, 5, 5); await sleep(250);
  await send(f, { t: 'quick', id: 'hello' });
  await sleep(500);
  const bubbleText = await g.textContent('.toast.bubble').catch(() => '');
  ok(/Xin chào/.test(bubbleText || ''), 'mục 4: đối thủ thấy bong bóng chat nhanh — ' + (bubbleText || '').replace(/\s+/g, ' '));
  const pinText = await g.textContent('#pl-top .quick-pin').catch(() => '');
  ok(/Xin chào/.test(pinText || ''), 'mục 4: câu chat được ghim lên thẻ người chơi của đối thủ');
  await sleep(3300); // mốc cũ: bong bóng biến mất sau ~3,3 giây
  ok(await g.evaluate(() => !!document.querySelector('.toast.bubble')), 'mục 4: sau 3,8 giây bong bóng của đối thủ vẫn còn (nay hiện 7 giây)');
  await move(f, 1, 0); await sleep(700);
  ok(await g.evaluate(() => !document.querySelector('#pl-top .quick-pin')), 'mục 4: có nước đi mới thì ghim chat biến mất');

  // Mục 10 — ô link phòng: bấm vào là chọn hết chữ
  await f.click('#btn-room');
  await sleep(400);
  await f.click('#ri-link');
  await sleep(150);
  const sel = await f.evaluate(() => {
    const el = document.getElementById('ri-link');
    return { s: el.selectionStart, e: el.selectionEnd, v: el.value };
  });
  ok(sel.s === 0 && sel.e === sel.v.length && sel.v.includes('?room='), 'mục 10: bấm ô link → chọn toàn bộ link, thấy phần ?room=');
  await f.keyboard.press('Escape');

  // Mục 7 — chơi hết ván tính điểm: thẻ kết quả có dòng giải thích điểm tạm
  await play(f, g); // f thắng ở hàng 0 (đã có sẵn 2 quân), g đánh rải rác hàng 5
  await sleep(700);
  const sub = (await f.textContent('#banner-sub').catch(() => '')) || '';
  ok(/Điểm/.test(sub) && /điểm tạm/.test(sub), 'mục 7: thẻ kết quả có cộng/trừ điểm và dòng giải thích điểm tạm — ' + sub.replace(/\s+/g, ' '));
  await shot(f, 'fix141-result.png');
  // Bấm qua DOM: Playwright khăng khăng báo nút trong thẻ kết quả "not visible" dù hộp đo
  // và trạng thái hiển thị đều bình thường (lớp phủ cố định có transform) — bấm DOM vẫn
  // chạy đúng onclick → leaveRoom như người dùng bấm thật.
  await f.evaluate(() => document.getElementById('banner-leave').click()); await sleep(400);
  await g.evaluate(() => document.getElementById('banner-leave').click()); await sleep(400);
  ok(await f.evaluate(() => !window.CaroApp.online), 'mục 7: rời phòng từ thẻ kết quả xong không còn online');

  // ---------------------------------------------------------- Mục 3: mức phóng ở hồ sơ điện thoại riêng
  const d = await user141('m141_d', { viewport: { width: 390, height: 844 }, hasTouch: true });
  const e = await user141('m141_e', { viewport: { width: 390, height: 844 }, hasTouch: true });
  const codeD = await createRoomUI(d);
  await send(e, { t: 'joinRoom', code: codeD });
  await sleep(1200); // chờ hoạt ảnh camera vào ván chạy xong
  const cellPx = (p) => p.evaluate(() => {
    const [x1, y1] = window.CaroApp.screenOf(0, 0);
    const [x2, y2] = window.CaroApp.screenOf(1, 0);
    return Math.hypot(x2 - x1, y2 - y1);
  });
  const px1 = await cellPx(e);
  ok(px1 >= 26, 'mục 3: vào ván online trên điện thoại 390px, mỗi ô ' + px1.toFixed(1) + 'px (≥ TOUCH_MIN 26)');
  const zoomSaved = await e.evaluate(() => localStorage.getItem('caro.zoomOnline'));
  ok(zoomSaved && Number(zoomSaved) >= 26, 'mục 3: mức phóng được nhớ vào caro.zoomOnline = ' + zoomSaved);
  await shot(e, 'fix141-zoom-phone.png');
  await e.click('#btn-leave'); await sleep(500);
  await d.click('#btn-leave'); await sleep(500);

  // ---------------------------------------------------------- Mục 5: thẻ chọn máy hiện tên máy
  await d.evaluate(() => window.CaroHome.open());
  await sleep(300);
  await d.click('.home-tabs [data-hpane="bot"]');
  await sleep(300);
  const tilesOk = await d.evaluate(() => {
    const tiles = [...document.querySelectorAll('#home-bots .qm-tile')];
    return tiles.length > 0 && tiles.every((t) => t.textContent.includes(window.I18N.t('bot_' + t.dataset.bot)));
  });
  ok(tilesOk, 'mục 5: mọi ô chọn máy ở Trang chủ hiện tên nhân vật máy');

  // ---------------------------------------------------------- Mục 6: chú thích điểm tạm trong Hồ sơ
  const aUid = await a.evaluate(() => window.CaroOnline.state.me.uid);
  await a.evaluate((id) => window.CaroProfile.open(id), aUid);
  await sleep(600);
  const provNote = await a.evaluate(() => {
    const pools = [...document.querySelectorAll('#profile-body .pf-pool')].map((x) => x.textContent);
    const note = document.querySelector('#profile-body .prov-note');
    return { hasQ: pools.some((t) => t.includes('?')), note: note ? note.textContent : '' };
  });
  ok(provNote.hasQ && /điểm tạm/.test(provNote.note), 'mục 6: hồ sơ có điểm "?" và dòng chú thích điểm tạm đi kèm');
  await a.keyboard.press('Escape');

  // ---------------------------------------------------------- Mục 8: Cài đặt chỉ còn một tiêu đề "Dữ liệu"
  await a.evaluate(() => window.CaroApp.toBoard());
  await sleep(300);
  await a.click('#btn-settings');
  await sleep(500);
  const dataHeads = await a.evaluate(() => [...document.querySelectorAll('#settings-form h3.list-h')].filter((h) => h.textContent.trim() === 'Dữ liệu').length);
  ok(dataHeads === 1, 'mục 8: trang Cài đặt còn đúng 1 tiêu đề "Dữ liệu" (trước đây 2)');
  await a.keyboard.press('Escape');

  // ---------------------------------------------------------- Mục 9: thanh trên lúc tải trang
  // (a) danh tính được lưu cục bộ sau khi đã đăng nhập
  const cache = await a.evaluate(() => localStorage.getItem('caro.meCache'));
  ok(!!cache && JSON.parse(cache).name === 'm141_a', 'mục 9: danh tính được lưu cục bộ (caro.meCache)');
  // (b) chưa có 'me' (giả lập lúc máy chủ chưa trả lời) mà đang kết nối: hiện tên từ bản lưu, không trống
  const topDuringLoad = await a.evaluate(() => {
    const st = window.CaroOnline.state;
    const saved = st.me;
    st.me = null;
    window.dispatchEvent(new CustomEvent('caro:online'));
    const txt = document.getElementById('tb-auth').textContent.replace(/\s+/g, ' ').trim();
    const html = document.getElementById('tb-auth').innerHTML;
    st.me = saved;
    window.dispatchEvent(new CustomEvent('caro:online'));
    return { txt, html };
  });
  ok(topDuringLoad.txt.includes('m141_a') || /tb-skel/.test(topDuringLoad.html), 'mục 9: lúc chưa có me, vùng tên/ảnh hiện bản lưu hoặc khung chờ, không trống');

  // ---------------------------------------------------------- Mục 11: hỏi lưu lịch sử TRƯỚC khi tạo ván mới (ván trên máy)
  const p = await browser.newContext({ viewport: { width: 430, height: 900 } }).then(async (ctx) => {
    await ctx.addInitScript(() => localStorage.setItem('caro.lang', 'vi'));
    const pg = await ctx.newPage();
    pg.on('pageerror', (e2) => errors.push('máy: ' + e2.message));
    pg.on('dialog', (dg) => dg.accept());
    await pg.goto(url);
    await sleep(600);
    return pg;
  });
  await p.evaluate(() => window.CaroApp.startPreset({
    mode: 'pvp', rule: 'vn',
    moves: [[0, 0], [0, 4], [1, 0], [1, 4], [2, 0], [2, 4], [3, 0], [3, 4]],
  }));
  await sleep(300);
  const [wx, wy] = await p.evaluate(() => window.CaroApp.screenOf(4, 0));
  await p.mouse.click(wx, wy); // X đi nước thắng (5 quân hàng 0)
  await sleep(600);
  ok((await p.evaluate(() => window.CaroApp.local.moves)) === 9 && !!(await p.evaluate(() => window.CaroApp.local.winner)), 'mục 11: ván trên máy đã kết thúc, chờ hỏi lưu');
  await p.click('#btn-new');
  await sleep(400);
  await p.click('#newgame-form .ng-go');
  await sleep(500);
  const askState = await p.evaluate(() => ({
    askOpen: !!document.getElementById('lh-ask').open,
    moves: window.CaroApp.local.moves,
  }));
  ok(askState.askOpen && askState.moves === 9, 'mục 11: hộp "Lưu lịch sử đấu?" mở ra trong khi bàn cờ vẫn là ván cũ (9 nước) — hỏi TRƯỚC');
  await p.click('#lh-ask-form [data-ans="no"]');
  await sleep(600);
  ok((await p.evaluate(() => window.CaroApp.local.moves)) === 0, 'mục 11: trả lời xong mới tạo ván mới (bàn trống)');

  ok(!errors.length, 'không có lỗi JS' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await finish();
})().catch((e) => { console.error(e); process.exit(1); });
