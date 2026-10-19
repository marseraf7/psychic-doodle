/*
 * Kiểm thử trình duyệt: nhân vật máy (chọn, mở khoá, chuyển mức cũ), phân tích ván + "Thử lại", giải đố.
 *   node caro/tests/e2e/study.e2e.js
 */
'use strict';
const { setup } = require('./helpers');

// X xếp 4 quân hàng 0; O bỏ mặc thế ba mở (nước 6 là sai lầm nặng), X thắng ở nước 7.
const GAME = [[0, 0], [0, 5], [1, 0], [1, 5], [2, 0], [5, 5], [3, 0]];

(async () => {
  const { browser, ok, shot, sleep, finish } = await setup(8097);
  const port = 8097;
  const errors = [];

  async function page(width, init) {
    const ctx = await browser.newContext({ viewport: { width, height: 860 } });
    await ctx.addInitScript(init || (() => {}));
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await p.goto(`http://localhost:${port}/`);
    await sleep(500);
    return p;
  }

  // ---------------------------------------------------------------- Nhân vật máy
  {
    const p = await page(430, () => { if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', 1); localStorage.clear(); localStorage.setItem('caro.lang', 'vi'); } });
    await p.click('[data-home="bot"]'); // Trang chủ: "Chơi với máy" mở bảng Ván mới
    await sleep(300);
    const cards = await p.$$eval('#ng-picker .bot-grid .bot-card', (els) => els.map((e) => ({ locked: e.classList.contains('locked'), name: e.querySelector('b').textContent })));
    ok(cards.length === 6, 'mỗi lối đánh 6 nhân vật (6 mức) trong bảng Ván mới');
    ok(cards.filter((c) => c.locked).length === 3, 'mới vào: 3 mức đầu mở, 3 mức sau khoá');
    ok((await p.$$('#ng-picker .style-tabs label')).length === 5, '5 lối đánh: Tấn công / Phòng thủ / Nước đôi / Gài bẫy / Toàn diện');
    await p.click('#ng-picker .style-tabs label:nth-child(5)'); // Toàn diện: 6 mức + trùm cuối BOAT (khoá)
    await sleep(100);
    const uni = await p.$$eval('#ng-picker .bot-grid .bot-card', (els) => els.map((e) => ({ locked: e.classList.contains('locked'), name: e.querySelector('b').textContent })));
    ok(uni.length === 7 && uni[6].name === 'BOAT' && uni[6].locked, 'lối Toàn diện: thêm trùm cuối BOAT (đang khoá)');
    await p.click('#ng-picker .style-tabs label:nth-child(4)'); // Gài bẫy
    await sleep(100);
    ok((await p.$$eval('#ng-picker .bot-grid .bot-card b', (els) => els.map((e) => e.textContent))).join(',') === 'Sa Tị,Phượng Lên Đồ,Ba Sáu,Tú Sena,Đi Bộ Vuốt Râu,Hai Ngón', 'lối Gài bẫy: 6 nhân vật theo mức');
    await p.click('#ng-picker .bot-grid .bot-card:nth-child(3)');
    await sleep(100);
    ok(/Ba Sáu/.test(await p.textContent('#ng-picker .bot-say')), 'chọn Ba Sáu: hiện mô tả');
    await shot(p, 'study-bots-430.png');
    await p.click('#newgame-form button.primary');
    await sleep(400);
    ok(/Ba Sáu/.test(await p.textContent('#turn')) || /Ba Sáu/.test(await p.textContent('#toasts')), 'ván với Ba Sáu: thanh trên / lời chào có tên Ba Sáu');
    ok((await p.evaluate(() => JSON.parse(localStorage.getItem('caro.v1')).bot)) === 'bin', 'lưu nhân vật đã chọn');
    ok(await p.$eval('#ng-picker .bot-say', (e) => !!e.querySelector('.bot-av img') && /Gài bẫy/.test(e.textContent)), 'mô tả có ảnh đại diện và lối đánh');
    ok(await p.$$eval('#ng-picker .bot-card .bot-av img', (els) => els.length === 6 && els.every((i) => i.complete && i.naturalWidth > 0)), '6 ảnh đại diện tải được');
    const set = await p.evaluate(() => { document.getElementById('btn-settings').click();
      const r = document.getElementById('set-picker');
      return { cards: r.querySelectorAll('.bot-card').length, locked: r.querySelectorAll('.bot-card.locked').length, checked: (r.querySelector('input[name=bot]:checked') || {}).value, say: r.querySelector('.bot-say').textContent }; });
    ok(set.cards === 6 && set.locked === 3 && set.checked === 'bin' && /Ba Sáu/.test(set.say), 'Cài đặt: bảng chọn đối thủ có ảnh, mô tả, đang chọn Ba Sáu');
    await p.click('#settings-form [data-go="bot"]'); // trang con "Đối thủ máy"
    await p.click('#set-picker .style-tabs label:nth-child(1)'); // Cài đặt lưu ngay: đổi sang lối Tấn công cùng mức
    await sleep(200);
    ok((await p.evaluate(() => JSON.parse(localStorage.getItem('caro.v1')).bot)) === 'hung', 'Cài đặt: đổi lối đánh -> nhân vật cùng mức của lối mới, lưu ngay');
    await p.keyboard.press('Escape');
    await p.context().close();
  }
  {
    // Người dùng cũ đã chọn "Khó" -> chuyển thành Rung Động (minh) và được mở khoá
    const p = await page(430, () => { localStorage.setItem('caro.lang', 'vi'); localStorage.setItem('caro.v1', JSON.stringify({ mode: 'ai', human: 1, level: 3, moves: [] })); });
    const st = await p.evaluate(() => ({ bot: JSON.parse(localStorage.getItem('caro.v1')).bot || null, unlocked: JSON.parse(localStorage.getItem('caro.bots') || '{}').unlocked }));
    await p.click('[data-home="bot"]');
    await sleep(200);
    const checked = await p.$eval('#ng-picker .bot-grid input:checked', (e) => e.value);
    ok(checked === 'minh' && st.unlocked === 5, 'mức Khó cũ -> Rung Động, đã mở khoá tới Rung Động');
    await p.context().close();
  }

  // ---------------------------------------------------------------- Phân tích ván + Thử lại
  {
    // Ghi ván đã chơi xong trước khi trang chạy (tải lại trang thì trang tự lưu đè ván đang mở)
    const ctx = await browser.newContext({ viewport: { width: 430, height: 860 } });
    // Kiểm luồng phân tích bằng engine của game (iOS / máy không có WebAssembly SIMD); phân tích bằng Rapfi /
    // Rapfi-CARO kiểm ở boat-rapfi.e2e.js
    await ctx.addInitScript(() => { window.CARO_NO_RAPFI = true; });
    await ctx.addInitScript((g) => {
      localStorage.setItem('caro.lang', 'vi');
      localStorage.setItem('caro.v1', JSON.stringify({ mode: 'pvp', human: 1, bot: 'mai', moves: g }));
    }, GAME);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`http://localhost:${port}/`);
    await sleep(800);
    await p.evaluate(() => window.CaroApp.toBoard()); // mở app vào Trang chủ; vào bàn cờ xem ván đã xong
    ok(!(await p.isHidden('#banner')), 'ván đã kết thúc: hiện thẻ kết quả');
    ok(await p.isVisible('#banner-analyze'), 'thẻ kết quả có nút Phân tích');
    await p.click('#banner-analyze');
    await p.waitForSelector('.an-acc', { timeout: 15000 });
    ok(await p.evaluate(() => document.body.classList.contains('replay')), 'mở chế độ xem lại');
    const tl = await p.$$eval('.an-mv:not(.empty)', (els) => els.map((e) => e.getAttribute('title')));
    ok(tl.length === GAME.length, `danh sách nước đi có ${GAME.length} nước`);
    ok(/Sai lầm nặng/.test(tl[5]), 'nước 6 của O: Sai lầm nặng — ' + tl[5]);
    ok(/Tốt nhất/.test(tl[6]), 'nước 7 của X: Tốt nhất');
    // Đọc độ chính xác sau lượt phân tích kỹ (lượt nhanh chấm nông hơn nên số có thể khác). Không so X với O: trước nước 6
    // engine đã chấm O chỉ còn ~7–12% khả năng thắng nên sai lầm nặng chỉ trừ ~7–12% (như Lichess), còn các nước khai cuộc
    // (nước 1–4, chưa có thế ép) được chấm theo độ sâu tìm kịp trong giới hạn thời gian và theo Worker nào chấm thế nào
    // (an-pool.js, mỗi Worker một bảng nhớ) – điểm dao động vài trăm, lúc chấm "chưa chính xác" cho X, lúc cho O. Đo trên
    // máy 4 lõi (3 Worker): cả Chromium lẫn WebKit có lúc ra X 88%, O 91% (Chromium 4 Worker: 6/15 lần).
    // Chỉ kiểm phần ít phụ thuộc tốc độ máy: X ≥ 70% (như study.test.js), O dưới 100% vì bị trừ điểm sai lầm nặng.
    await p.waitForFunction(() => !document.getElementById('an-refine'), null, { timeout: 30000 });
    const acc = await p.$$eval('.an-acc', (els) => els.map((e) => parseInt(e.textContent, 10)));
    ok(acc[0] >= 70 && acc[0] <= 100 && acc[1] >= 0 && acc[1] < 100, `độ chính xác (theo mức tụt khả năng thắng, như Lichess) X ${acc[0]}%, O ${acc[1]}%`);
    await p.click('.an-mv[data-i="6"]');
    await sleep(200);
    const now6 = await p.textContent('#an-now');
    ok(/Sai lầm nặng/.test(now6), 'xem nước 6: có nhận xét — ' + now6);
    ok((await p.evaluate(() => window.CaroApp.board.moves.length)) === 6, 'nhảy tới nước 6');
    // Bố cục như Lichess: bảng phân tích không che bàn cờ (bàn cờ thu nhỏ nhường chỗ)
    const geo = await p.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(), a = document.getElementById('an-panel').getBoundingClientRect(); return { overlap: !(a.top >= b.bottom - 1 || a.left >= b.right - 1), cur: !!document.querySelector('.an-mv.cur[data-i="6"]'), graph: !!document.querySelector('.an-graph'), name: document.querySelector('.an-mv[data-i="6"]').textContent.trim() }; });
    ok(!geo.overlap && geo.cur && geo.graph && /^[a-z]+\d+/.test(geo.name), 'bảng phân tích không che bàn cờ; có biểu đồ; nước 6 tô nổi, tên ô ' + geo.name);
    await p.click('.an-graph', { position: { x: 2, y: 30 } });
    await sleep(200);
    ok((await p.evaluate(() => window.CaroApp.board.moves.length)) === 0, 'bấm đầu biểu đồ: về đầu ván');
    await p.click('.an-mv[data-i="6"]');
    await sleep(200);
    await shot(p, 'study-analysis-430.png');
    // Thử lại: đặt sai rồi đặt đúng
    await p.click('#an-now button[data-retry]');
    await sleep(300);
    ok(await p.evaluate(() => document.body.classList.contains('ext')), 'Thử lại: vào chế độ luyện');
    ok(/giữ thế/.test(await p.textContent('#turn')), 'yêu cầu: tìm nước giữ thế');
    await p.evaluate(() => window.CaroApp.ext.onMove(8, 8));
    await sleep(200);
    ok(/Chưa đúng/.test(await p.textContent('#turn')), 'đặt sai: báo Chưa đúng');
    await shot(p, 'study-retry-wrong-430.png');
    await p.click('#ext-bar button[data-act=reset]');
    await sleep(200);
    await p.evaluate(() => window.CaroApp.ext.onMove(3, 0));
    await sleep(200);
    ok(/Chính xác|Đã giải/.test(await p.textContent('#turn')), 'chặn ở (3,0): đúng');
    await p.click('#ext-bar button[data-act=exit]');
    await sleep(300);
    const back = await p.evaluate(() => ({ ext: document.body.classList.contains('ext'), replay: document.body.classList.contains('replay'), n: window.CaroApp.board.moves.length }));
    ok(!back.ext && back.replay && back.n === 6, 'Về ván: quay lại xem lại ở nước 6');
    await p.click('#rp-close');
    await sleep(300);
    ok((await p.evaluate(() => window.CaroApp.board.moves.length)) === GAME.length, 'đóng xem lại: ván cục bộ còn nguyên');
    await p.context().close();
  }

  // ---------------------------------------------------------------- Giải đố
  for (const width of [430, 1280]) {
    const p = await page(width, () => { if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', 1); localStorage.clear(); localStorage.setItem('caro.lang', 'vi'); } });
    await p.click('#tabbar [data-tab="puzzles"]');
    await sleep(300);
    ok(await p.isVisible('#page-puzzles'), `[${width}] mở tab Câu đố`);
    ok(/1000/.test(await p.textContent('#pz-stats')), 'điểm giải đố ban đầu 1000');
    if (width === 430) await shot(p, 'study-puzzle-dlg-430.png');
    await p.click('.pz-mode[data-pz=rated]');
    await p.waitForFunction(() => document.body.classList.contains('ext'), null, { timeout: 5000 });
    ok(/tìm chuỗi thắng/.test(await p.textContent('#turn')), 'bài đố: yêu cầu tìm chuỗi thắng');
    await shot(p, `study-puzzle-${width}.png`);
    // Giải bằng chính bộ tìm chuỗi ép
    let solved = false;
    for (let k = 0; k < 10 && !solved; k++) {
      await p.waitForFunction(() => window.CaroApp.ext && window.CaroApp.ext.canPlay || /Chính xác|Đã giải/.test(document.getElementById('turn').textContent), null, { timeout: 5000 });
      solved = /Chính xác|Đã giải/.test(await p.textContent('#turn'));
      if (solved) break;
      await p.evaluate(() => {
        const A = window.CaroApp;
        const f = window.CaroAnalysis.forced(A.board, A.turn, 7, { deadline: Date.now() + 3000 });
        A.ext.onMove(f.move[0], f.move[1]);
      });
      await sleep(700);
      solved = /Chính xác|Đã giải/.test(await p.textContent('#turn'));
    }
    ok(solved, `[${width}] giải xong bài đố`);
    const r = await p.evaluate(() => JSON.parse(localStorage.getItem('caro.puzzles')));
    ok(r && r.r > 1000 && r.ok === 1, `điểm giải đố tăng: ${r && r.r}`);
    ok(/\+\d+/.test(await p.textContent('#score')), 'hiện điểm cộng');
    await shot(p, `study-puzzle-solved-${width}.png`);
    // Bài tiếp, rồi đi sai
    await p.click('#ext-bar button[data-act=next]');
    await sleep(400);
    await p.evaluate(() => {
      const A = window.CaroApp;
      const m = A.board.moves;
      A.ext.onMove(m[0].x + 30, m[0].y + 30);
    });
    await sleep(200);
    ok(/Chưa đúng/.test(await p.textContent('#turn')), 'đi sai: Chưa đúng, điểm giảm');
    const r2 = await p.evaluate(() => JSON.parse(localStorage.getItem('caro.puzzles')));
    ok(r2.r < r.r && r2.n === 2, `điểm giảm còn ${r2.r}`);
    // Đáp án tự chạy tới khi xong
    await p.click('#ext-bar button[data-act=solution]');
    await p.waitForFunction(() => /Đã hiện xong/.test(document.getElementById('turn').textContent), null, { timeout: 20000 });
    ok(true, 'Đáp án: tự đi hết lời giải');
    await p.click('#ext-bar button[data-act=exit]');
    await sleep(300);
    ok(!(await p.evaluate(() => document.body.classList.contains('ext'))), 'Thoát giải đố');
    // Chuỗi đúng + bài của ngày
    await p.evaluate(() => window.CaroShell.open('puzzles'));
    await sleep(200);
    await p.click('.pz-mode[data-pz=streak]');
    await sleep(400);
    ok(/Chuỗi: 0/.test(await p.textContent('#score')), 'Chuỗi đúng: bắt đầu từ 0');
    await p.click('#ext-bar button[data-act=exit]');
    await sleep(200);
    await p.evaluate(() => window.CaroShell.open('puzzles'));
    await sleep(200);
    await p.click('#pz-today [data-pz-today]'); // thẻ Câu đố hôm nay đầu tab
    await sleep(400);
    const d1 = await p.evaluate(() => window.CaroApp.board.moves.map((m) => m.x + ',' + m.y).join(';'));
    await p.click('#ext-bar button[data-act=exit]');
    await sleep(200);
    await p.evaluate(() => window.CaroShell.open('puzzles'));
    await sleep(200);
    await p.click('#pz-today [data-pz-today]'); // thẻ Câu đố hôm nay đầu tab
    await sleep(400);
    const d2 = await p.evaluate(() => window.CaroApp.board.moves.map((m) => m.x + ',' + m.y).join(';'));
    ok(d1 && d1 === d2, 'Bài của ngày: mở lại vẫn là cùng một bài');
    await p.click('#ext-bar button[data-act=exit]');
    await p.context().close();
  }

  ok(!errors.length, 'không có lỗi JS trên trang' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await finish();
})().catch((e) => { console.error(e); process.exit(1); });
