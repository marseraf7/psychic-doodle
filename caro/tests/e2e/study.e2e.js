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
    await p.click('#btn-new');
    await sleep(300);
    const cards = await p.$$eval('#ng-bots .bot-card', (els) => els.map((e) => ({ locked: e.classList.contains('locked'), name: e.querySelector('b').textContent })));
    ok(cards.length === 6, '6 nhân vật trong bảng Ván mới');
    ok(cards.filter((c) => c.locked).length === 3, 'mới vào: 3 nhân vật đầu mở, 3 nhân vật sau khoá');
    await p.click('#ng-bots .bot-card:nth-child(3)');
    await sleep(100);
    ok(/Bin/.test(await p.textContent('#ng-bot-say')), 'chọn Bin: hiện mô tả');
    await shot(p, 'study-bots-430.png');
    await p.click('#newgame-form button.primary');
    await sleep(400);
    ok(/Bin/.test(await p.textContent('#turn')) || /Bin/.test(await p.textContent('#toasts')), 'ván với Bin: thanh trên / lời chào có tên Bin');
    ok((await p.evaluate(() => JSON.parse(localStorage.getItem('caro.v1')).bot)) === 'bin', 'lưu nhân vật đã chọn');
    const opts = await p.evaluate(() => { document.getElementById('btn-settings').click(); return [...document.querySelectorAll('#settings-form select[name=bot] option')].map((o) => o.disabled); });
    ok(opts.length === 6 && opts.filter(Boolean).length === 3, 'Cài đặt: ô chọn đối thủ có 6 nhân vật, 3 khoá');
    await p.keyboard.press('Escape');
    await p.context().close();
  }
  {
    // Người dùng cũ đã chọn "Khó" -> chuyển thành Thầy Minh và được mở khoá
    const p = await page(430, () => { localStorage.setItem('caro.lang', 'vi'); localStorage.setItem('caro.v1', JSON.stringify({ mode: 'ai', human: 1, level: 3, moves: [] })); });
    const st = await p.evaluate(() => ({ bot: JSON.parse(localStorage.getItem('caro.v1')).bot || null, unlocked: JSON.parse(localStorage.getItem('caro.bots') || '{}').unlocked }));
    await p.click('#btn-new');
    await sleep(200);
    const checked = await p.$eval('#ng-bots input:checked', (e) => e.value);
    ok(checked === 'minh' && st.unlocked === 5, 'mức Khó cũ -> Thầy Minh, đã mở khoá tới Thầy Minh');
    await p.context().close();
  }

  // ---------------------------------------------------------------- Phân tích ván + Thử lại
  {
    // Ghi ván đã chơi xong trước khi trang chạy (tải lại trang thì trang tự lưu đè ván đang mở)
    const ctx = await browser.newContext({ viewport: { width: 430, height: 860 } });
    await ctx.addInitScript((g) => {
      localStorage.setItem('caro.lang', 'vi');
      localStorage.setItem('caro.v1', JSON.stringify({ mode: 'pvp', human: 1, bot: 'mai', moves: g }));
    }, GAME);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`http://localhost:${port}/`);
    await sleep(800);
    ok(!(await p.isHidden('#banner')), 'ván đã kết thúc: hiện thẻ kết quả');
    ok(await p.isVisible('#banner-analyze'), 'thẻ kết quả có nút Phân tích');
    await p.click('#banner-analyze');
    await p.waitForSelector('.an-acc', { timeout: 15000 });
    ok(await p.evaluate(() => document.body.classList.contains('replay')), 'mở chế độ xem lại');
    const tl = await p.$$eval('.an-tl', (els) => els.map((e) => e.getAttribute('title')));
    ok(tl.length === GAME.length, `dải màu có ${GAME.length} nước`);
    ok(/Sai lầm nặng/.test(tl[5]), 'nước 6 của O: Sai lầm nặng — ' + tl[5]);
    ok(/Tốt nhất/.test(tl[6]), 'nước 7 của X: Tốt nhất');
    const acc = await p.$$eval('.an-acc', (els) => els.map((e) => parseInt(e.textContent, 10)));
    ok(acc[0] === 100 && acc[1] < 100, `độ chính xác X ${acc[0]}%, O ${acc[1]}%`);
    await p.click('.an-tl[data-i="6"]');
    await sleep(200);
    ok(/Sai lầm nặng/.test(await p.textContent('#an-now')), 'xem nước 6: có nhận xét');
    ok((await p.evaluate(() => window.CaroApp.board.moves.length)) === 6, 'nhảy tới nước 6');
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
    await p.click('#btn-puzzle');
    await sleep(300);
    ok(await p.isVisible('#puzzle-dlg'), `[${width}] mở hộp Giải đố`);
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
    await p.click('#btn-puzzle');
    await sleep(200);
    await p.click('.pz-mode[data-pz=streak]');
    await sleep(400);
    ok(/Chuỗi: 0/.test(await p.textContent('#score')), 'Chuỗi đúng: bắt đầu từ 0');
    await p.click('#ext-bar button[data-act=exit]');
    await sleep(200);
    await p.click('#btn-puzzle');
    await sleep(200);
    await p.click('.pz-mode[data-pz=daily]');
    await sleep(400);
    const d1 = await p.evaluate(() => window.CaroApp.board.moves.map((m) => m.x + ',' + m.y).join(';'));
    await p.click('#ext-bar button[data-act=exit]');
    await sleep(200);
    await p.click('#btn-puzzle');
    await sleep(200);
    await p.click('.pz-mode[data-pz=daily]');
    await sleep(400);
    const d2 = await p.evaluate(() => window.CaroApp.board.moves.map((m) => m.x + ',' + m.y).join(';'));
    ok(d1 && d1 === d2, 'Bài của ngày: mở lại vẫn là cùng một bài');
    await p.click('#ext-bar button[data-act=exit]');
    await p.context().close();
  }

  ok(!errors.length, 'không có lỗi JS trên trang' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await finish();
})().catch((e) => { console.error(e); process.exit(1); });
