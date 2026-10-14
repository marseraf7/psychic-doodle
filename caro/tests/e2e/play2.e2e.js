/*
 * Kiểm thử trình duyệt đợt B/C: đồng hồ tổng + Swap2, xem trực tiếp, điểm Glicko-2 + hồ sơ + bảng xếp hạng theo loại,
 * học chơi, thành tích, chia sẻ ảnh / GIF, tuỳ chỉnh bàn cờ, thẻ chào người mới.
 *   node caro/tests/e2e/play2.e2e.js
 */
'use strict';
const fs = require('fs');
const { setup } = require('./helpers');

(async () => {
  const PORT = 8099;
  const { browser, user, ok, shot, sleep, finish } = await setup(PORT);
  const errors = [];
  const watchErrors = (p, name) => {
    p.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
  };
  const room = (p) => p.evaluate(() => window.CaroOnline.state.room);

  // ---------------------------------------------------------------- Đồng hồ tổng + Swap2 + xem trực tiếp
  const a = await user('vi', 'dong_a');
  const b = await user('vi', 'dong_b');
  // Chủ phòng: phòng công khai, đồng hồ 3+2, luật Swap2 (Trang chủ → thẻ Phòng chờ)
  await a.click('#tabbar [data-tab="home"]');
  await a.click('.home-tabs [data-hpane="lobby"]');
  // Bộ chọn thời gian (tc-picker.js): thẻ Đồng hồ, ô chọn nhanh 3+2
  await a.click('#create-card [data-tcm="clock"]');
  await a.click('#create-card [data-chip="c3+2"]');
  ok(await a.inputValue('#room-tc') === 'c3+2', 'tạo phòng: chọn đồng hồ 3+2 bằng ô chọn nhanh');
  await a.selectOption('#room-opening', 'swap2');
  await a.check('#room-public');
  await a.click('#create-room');
  await sleep(600);
  const r0 = await room(a);
  ok(r0 && r0.clock === '3+2' && r0.opening === 'swap2', 'tạo phòng với đồng hồ 3+2 và luật Swap2');
  await a.keyboard.press('Escape');
  await b.evaluate((code) => window.CaroOnline.send({ t: 'joinRoom', code }), r0.code);
  await sleep(700);
  ok(await a.isVisible('#pl-bot .ck') && await a.isVisible('#pl-top .ck'), 'thẻ người chơi trên / dưới hiện đồng hồ của 2 bên');
  ok(/3:00|2:5\d/.test(await a.textContent('#ck-x')), 'đồng hồ bắt đầu từ 3:00: ' + await a.textContent('#ck-x'));
  ok(/Đặt 3 quân/.test(await a.textContent('#swap-card')), 'chủ phòng được nhắc đặt 3 quân khai cuộc');
  ok(/Đang đặt 3 quân/.test(await b.textContent('#swap-card')), 'người kia thấy đối thủ đang đặt quân khai cuộc');
  // Người xem (khách) mở "Đang diễn ra" và xem
  const v = await browser.newContext({ viewport: { width: 430, height: 860 } }).then(async (ctx) => {
    await ctx.addInitScript(() => localStorage.setItem('caro.lang', 'vi'));
    const p = await ctx.newPage();
    watchErrors(p, 'xem');
    await p.goto(`http://localhost:${PORT}/`);
    await sleep(400);
    await p.click('#tabbar [data-tab="watch"]');
    await sleep(800);
    return p;
  });
  ok((await v.textContent('#tv-list')).includes('dong_a'), 'danh sách "Đang diễn ra" có ván vừa tạo');
  await shot(v, 'play2-tv-430.png');
  await v.click('#tv-list [data-watch]');
  await sleep(600);
  ok(await v.evaluate(() => document.body.classList.contains('watching')), 'người xem vào chế độ xem');
  ok(/dong_a/.test(await v.textContent('#turn')) && /dong_b/.test(await v.textContent('#turn')), 'thanh trên của người xem có tên 2 bên');
  ok(await v.isVisible('#wt-leave'), 'thanh dưới của người xem có nút "Thôi xem"');
  // Đặt 3 quân khai cuộc (chạm bàn cờ qua lệnh gửi máy chủ)
  for (const [x, y] of [[0, 0], [7, 7], [1, 0]]) { await a.evaluate(([x, y]) => window.CaroOnline.send({ t: 'move', x, y }), [x, y]); await sleep(150); }
  await sleep(300);
  ok((await b.$$('#swap-card [data-swap]')).length === 3, 'người kia thấy 3 lựa chọn: cầm X / cầm O / đặt thêm 2 quân');
  await shot(b, 'play2-swap-430.png');
  await b.click('#swap-card [data-swap="x"]');
  await sleep(500);
  const r1 = await room(b);
  ok(r1.phase === null && r1.seats.x === r1.players.find((p) => p.name === 'dong_b').id, 'chọn cầm X: đổi bên');
  ok(await b.isHidden('#swap-card'), 'thẻ chọn bên đóng lại');
  ok((await v.evaluate(() => window.CaroApp.board.moves.length)) === 3, 'người xem thấy 3 quân khai cuộc');
  // B (X) có sẵn 2 quân ở hàng 0: thắng; A đánh rải rác ở hàng 9
  let bx = 2, ay = 0;
  for (let k = 0; k < 12; k++) {
    const r = await room(b);
    if (r.winner) break;
    const me = r.actor === r.seats.x ? b : a;
    if (me === b) await b.evaluate((x) => window.CaroOnline.send({ t: 'move', x, y: 0 }), bx++);
    else await a.evaluate((x) => window.CaroOnline.send({ t: 'move', x, y: 9 }), (ay++) * 3);
    await sleep(200);
  }
  await sleep(600);
  const r2 = await room(b);
  ok(r2.winner === 1, 'X thắng');
  ok(/Điểm Chớp: \+\d+/.test(await b.textContent('#banner-sub')), 'thẻ kết quả: điểm Glicko loại Chớp tăng — ' + await b.textContent('#banner-sub'));
  await shot(b, 'play2-result-430.png');
  ok(/1–0/.test(await v.textContent('#turn')), 'người xem thấy kết quả 1–0');
  await shot(v, 'play2-watch-430.png');
  await v.click('#wt-leave');
  await sleep(400);
  ok(!(await v.evaluate(() => document.body.classList.contains('watching'))), 'thôi xem: về bàn cờ của mình');

  // ---------------------------------------------------------------- Hồ sơ + bảng xếp hạng theo loại
  const bUid = await b.evaluate(() => window.CaroOnline.state.me.uid);
  await a.evaluate((id) => window.CaroProfile.open(id), bUid);
  await sleep(500);
  ok(/dong_b/.test(await a.textContent('#profile-body')), 'mở hồ sơ người chơi');
  const pools = await a.$$eval('#profile-body .pf-pool', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ')));
  ok(pools.length === 4 && /Chớp/.test(pools[1]) && /\?/.test(pools[1]), 'hồ sơ có 4 loại điểm, điểm Chớp còn "tạm" (?) — ' + pools[1]);
  ok(/Chuỗi thắng dài nhất/.test(await a.textContent('#profile-body')), 'hồ sơ có chuỗi thắng');
  await shot(a, 'play2-profile-430.png');
  await a.keyboard.press('Escape');
  await a.evaluate(() => window.CaroSocial.open('leaderboard'));
  await sleep(300);
  await a.click('#lb-tabs label:nth-child(3)');
  await sleep(300);
  ok(await a.evaluate(() => document.querySelector('input[name="lb-pool"]:checked').value) === 'blitz' && !/…/.test(await a.textContent('#lb-list')), 'bảng xếp hạng đổi sang loại Chớp');
  await a.keyboard.press('Escape');

  // ---------------------------------------------------------------- Học chơi + thành tích + bàn cờ + chia sẻ (trên máy)
  const ctx = await browser.newContext({ viewport: { width: 430, height: 860 }, acceptDownloads: true });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('init')) return;
    sessionStorage.setItem('init', '1');
    localStorage.clear();
    localStorage.setItem('caro.lang', 'vi');
    Object.defineProperty(navigator, 'webdriver', { get: () => false }); // cho thẻ chào người mới hiện ra
  });
  // Nạp sẵn ván đã chơi trước khi trang chạy (tải lại trang thì trang tự lưu đè ván đang mở)
  await ctx.addInitScript(() => {
    const g = sessionStorage.getItem('inject');
    if (g) { localStorage.setItem('caro.v1', g); sessionStorage.removeItem('inject'); }
  });
  const p = await ctx.newPage();
  watchErrors(p, 'máy');
  await p.goto(`http://localhost:${PORT}/`);
  await sleep(600);
  ok(await p.isVisible('#welcome-card'), 'mở lần đầu: thẻ "Bạn chơi Caro tới đâu?"');
  await shot(p, 'play2-welcome-430.png');
  await p.click('#welcome-card [data-level="new"]');
  await sleep(400);
  ok(await p.isVisible('#page-learn'), 'chọn "Mới học": mở tab Học tập');
  ok((await p.$$('#learn-list li')).length === 9, '9 bài học');
  await shot(p, 'play2-learn-430.png');
  await p.click('#learn-list [data-lesson="0"]');
  await sleep(400);
  ok(await p.isVisible('#lesson-card'), 'bài 1: có thẻ giải thích');
  await shot(p, 'play2-lesson1-430.png');
  // Đi sai rồi đúng
  await p.evaluate(() => window.CaroApp.ext.onMove(9, 9));
  await sleep(200);
  ok(/Chưa đúng/.test(await p.textContent('#turn')), 'bài 1: đi sai báo Chưa đúng');
  await p.click('#ext-bar [data-act=reset]');
  await sleep(200);
  const sols = [[4, 0], [4, 0], [3, 0], [3, 0], [2, 0]];
  for (let i = 0; i < 5; i++) {
    await p.evaluate(([x, y]) => window.CaroApp.ext.onMove(x, y), sols[i]);
    await sleep(700);
    // Bài thắng kép: máy chặn 1 đường, đi nốt đường còn lại
    for (let k = 0; k < 3 && !/Chính xác|Đã giải/.test(await p.textContent('#turn')); k++) {
      await p.evaluate(() => {
        const A = window.CaroApp;
        const f = window.CaroAnalysis.forced(A.board, A.turn, 6, { deadline: Date.now() + 2000 });
        if (f) A.ext.onMove(f.move[0], f.move[1]);
      });
      await sleep(700);
    }
    ok(/Chính xác|Đã giải/.test(await p.textContent('#turn')), `bài ${i + 1}: giải đúng`);
    await p.click('#ext-bar [data-act=next]');
    await sleep(500);
  }
  // Bài 6–9: chuỗi nước bốn (luật tự do), chuỗi đe doạ (luật VN), thế nón lá (luật tự do), Renju 4-3
  for (let i = 6; i <= 9; i++) {
    for (let k = 0; k < 10 && !/Chính xác|Đã giải/.test(await p.textContent('#turn')); k++) {
      await p.evaluate(() => {
        const A = window.CaroApp;
        if (!A.ext || !A.ext.canPlay) return;
        const f = window.CaroAnalysis.forced(A.board, A.turn, 7, { deadline: Date.now() + 3000 });
        if (f) A.ext.onMove(f.move[0], f.move[1]);
      });
      await sleep(800);
    }
    ok(/Chính xác|Đã giải/.test(await p.textContent('#turn')), `bài ${i}: giải đúng (luật ${await p.evaluate(() => window.CaroApp.board.rule)})`);
    if (i < 9) { await p.click('#ext-bar [data-act=next]'); await sleep(600); }
  }
  await p.click('#ext-bar [data-act=exit]');
  await sleep(400);
  ok(await p.evaluate(() => window.CaroLearn.doneCount()) === 9, 'học xong 9/9 bài');
  // Phim minh hoạ có phụ đề + "Luyện ngay" luôn có (kể cả khi đọc lại)
  await p.evaluate(() => window.CaroLearn.openRule('open26', 1));
  await sleep(300);
  ok(/Hàn Tinh/.test(await p.textContent('#rule-board .demo-cap')), 'phim 26 thế khai cuộc: phụ đề khung đầu (Hàn Tinh)');
  await p.click('#rule-board [data-demo="next"]');
  await sleep(200);
  ok(/Khê Nguyệt/.test(await p.textContent('#rule-board .demo-cap')), 'phim: bấm khung tiếp -> Khê Nguyệt');
  await p.evaluate(() => window.I18N.setLang('en'));
  await sleep(200);
  ok(/Keigetsu/.test(await p.textContent('#rule-board .demo-cap')), 'đổi sang tiếng Anh: phụ đề tiếng Anh, giữ khung đang xem');
  await p.evaluate(() => window.I18N.setLang('vi'));
  await p.click('#rule-next'); // đọc hết rồi mở lại: vẫn có Luyện ngay
  for (let k = 0; k < 6 && (await p.isVisible('#rule-dlg')); k++) { await p.click('#rule-next'); await sleep(150); }
  await p.evaluate(() => window.CaroLearn.openRule('open26'));
  await sleep(200);
  ok(await p.isVisible('#rule-try'), 'đọc lại 26 thế khai cuộc: vẫn có nút Luyện ngay');
  await p.click('#rule-try');
  await sleep(2500);
  ok(await p.evaluate(() => window.CaroApp.board.rule === 'renju' && window.CaroApp.board.moves.length >= 3), 'Luyện ngay: ván Renju với máy, bày sẵn 3 quân khai cuộc');
  await shot(p, 'play2-opening-practice-430.png');
  await p.evaluate(() => window.CaroLearn.open());
  await sleep(200);
  ok((await p.$$('#style-cards .style-card')).length === 5 && (await p.$$('#page-learn [data-practice]')).length >= 10, 'Học chơi: 5 thẻ lối đánh, nút Luyện ở các mục');
  await p.click('#style-cards [data-style-step="3"]');
  await sleep(300);
  ok((await p.$$('#rule-bots .rb-bot')).length === 6 && /Nước đôi/.test(await p.textContent('#rule-bots')), 'lối Nước đôi: phim + 6 nhân vật của lối đó');
  await shot(p, 'play2-style-dbl-430.png');
  await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  // Thành tích: chuỗi 1 ngày, huy hiệu "Tốt nghiệp"
  await p.evaluate(() => document.getElementById('btn-settings').click());
  await sleep(200);
  await p.click('#settings-form [data-open="habits"]');
  await sleep(300);
  ok(/1 ngày liên tiếp/.test(await p.textContent('#habits-body')), 'thành tích: chuỗi 1 ngày');
  ok(await p.evaluate(() => !!window.CaroHabits.data.earned.learn_all), 'có huy hiệu "Tốt nghiệp"');
  await shot(p, 'play2-habits-430.png');
  await p.keyboard.press('Escape');
  // Bàn cờ gỗ + quân đá
  await p.evaluate(() => document.getElementById('btn-settings').click());
  await sleep(200);
  await p.click('#settings-form [data-go="look"]');
  await p.click('#settings-form label:has(input[name=board][value=wood])');
  await p.click('#settings-form label:has(input[name=pieces][value=stones])');
  await sleep(200);
  await shot(p, 'play2-settings-look-430.png');
  ok(await p.evaluate(() => document.documentElement.dataset.board === 'wood' && JSON.parse(localStorage.getItem('caro.style')).pieces === 'stones'), 'đổi bàn gỗ + quân đá, lưu lại');
  // Một ván 2 người đã xong (X thắng) rồi chia sẻ ảnh / GIF
  await p.evaluate(() => sessionStorage.setItem('inject', JSON.stringify({ mode: 'pvp', human: 1, bot: 'ti', moves: [[0, 0], [0, 4], [1, 0], [1, 4], [2, 0], [5, 6], [3, 0]] })));
  await p.reload();
  await sleep(700);
  await p.evaluate(() => window.CaroApp.toBoard()); // ván đã xong: Trang chủ không có thẻ "Tiếp tục"; vào bàn cờ xem
  await sleep(400);
  await shot(p, 'play2-wood-stones-430.png');
  await p.click('#banner-analyze');
  await sleep(400);
  await p.click('#rp-share');
  await sleep(300);
  ok(await p.isVisible('#share-dlg') && await p.isHidden('#sh-link'), 'chia sẻ ván trên máy: ảnh / GIF (không có link vì chưa lưu trên máy chủ)');
  await shot(p, 'play2-share-430.png');
  const [png] = await Promise.all([p.waitForEvent('download'), p.click('#sh-png')]);
  const pngBuf = fs.readFileSync(await png.path());
  ok(pngBuf.slice(1, 4).toString() === 'PNG' && pngBuf.length > 5000, 'tải ảnh PNG: ' + pngBuf.length + ' byte');
  await p.click('#rp-share');
  await sleep(200);
  const [gif] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#sh-gif')]);
  const gifPath = await gif.path();
  const gifBuf = fs.readFileSync(gifPath);
  ok(gifBuf.slice(0, 6).toString() === 'GIF89a' && gifBuf[gifBuf.length - 1] === 0x3b, 'tải GIF động: ' + gifBuf.length + ' byte');
  fs.copyFileSync(gifPath, (process.env.E2E_OUT || '/tmp') + '/play2-game.gif');

  ok(!errors.length, 'không có lỗi JS' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await finish();
})().catch((e) => { console.error(e); process.exit(1); });
