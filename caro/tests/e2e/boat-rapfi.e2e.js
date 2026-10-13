/*
 * Kiểm thử trình duyệt: BOAT chạy Rapfi (WebAssembly, GPL-3) ở luật tự do / tiêu chuẩn / Renju, Rapfi-CARO ở luật
 * Việt Nam (không tải mạng, thấy thế ba mở hai đầu là thắng), nước đầu không phải chờ tải mạng, thế sát mép bàn Rapfi được engine kiểm lại, mạng tải hỏng bị loại
 * (không lưu, không dùng), mạng lấy lại từ Cache Storage, phân tích ván bằng Rapfi, nhãn Elo / huy hiệu BOAT–Rapfi,
 * CSP của máy chủ cho phép WebAssembly, trang giấy phép.
 *   RAPFI_NETS=<thư mục có mix9svq*.bin.lz4> node caro/tests/e2e/boat-rapfi.e2e.js
 * Có RAPFI_NETS thì trả file mạng từ thư mục đó thay cho CDN (máy không ra Internet); không có thì tải thật từ CDN.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { setup } = require('./helpers');

const NET_RE = /mix9svq.*\.bin\.lz4$/;

(async () => {
  const port = 8098;
  const { browser, ok, shot, sleep, finish } = await setup(port);
  const errors = [];
  const nets = process.env.RAPFI_NETS;
  let downloads = 0;

  /** Ngữ cảnh trình duyệt mới; mode 'slow': lần tải đầu chậm 3 giây; 'bad': trả file mạng bị cắt cụt. */
  async function context(mode) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 860 } });
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', 1); localStorage.clear(); localStorage.setItem('caro.lang', 'vi'); } });
    if (nets || mode === 'bad') {
      await ctx.route(NET_RE, async (route) => {
        const url = route.request().url();
        if (url.startsWith(`http://localhost:${port}/`)) return route.fulfill({ status: 404, body: '' }); // chưa đặt sẵn trên máy chủ
        const file = path.basename(url);
        let body = nets ? fs.readFileSync(path.join(nets, file)) : Buffer.from((await (await route.fetch()).body()));
        if (mode === 'bad') body = body.subarray(0, body.length >> 1); // tải đứt giữa chừng
        else if (++downloads === 1 && mode === 'slow') await sleep(3000); // mạng chậm như lần tải thật đầu tiên
        return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/octet-stream' }, body });
      });
    } else {
      ctx.on('request', (r) => { if (NET_RE.test(r.url()) && !r.url().startsWith('http://localhost')) downloads++; });
    }
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push('console: ' + m.text()); });
    await p.goto(`http://localhost:${port}/`);
    await sleep(500);
    return { ctx, p };
  }

  const { ctx, p: firstPage } = await context('slow');
  let p = firstPage;
  // Playwright trên WebKit không chặn / thấy được request phát ra từ Worker: không đếm được lượt tải mạng, không giả
  // được mạng hỏng (Rapfi vẫn tải mạng thật từ CDN) – các bước đó bỏ qua, có ghi rõ
  const workerNet = (process.env.E2E_BROWSER || 'chromium') !== 'webkit';
  const okNet = (c, m) => (workerNet ? ok(c, m) : console.log('SKIP ' + m + ' (WebKit: không chặn được request của Worker)'));
  const X = 1;
  const stats = (pg = p) => pg.evaluate(() => ({ ...window.CaroRapfi.stats }));
  const stones = (pg = p) => pg.evaluate(() => window.CaroApp.board.moves.length);
  async function waitFor(fn, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(250); }
    return false;
  }
  /** Ván mới với BOAT, người cầm X, bày sẵn các nước moves: tới BOAT (O) nghĩ. */
  async function start(rule, moves = [[0, 0]], pg = p) {
    await pg.evaluate(({ rule, moves, X }) => {
      window.CaroApp.setBot('boat', 7);
      return window.CaroApp.startPreset({ rule, human: X, bot: 'boat', moves });
    }, { rule, moves, X });
  }
  const warm = (rule, pg = p) => pg.evaluate((r) => window.CaroRapfi.ready(r, 60000), rule);
  /** Người chơi bấm ô (x, y) trên bàn cờ thật. */
  async function click(x, y) {
    const [sx, sy] = await p.evaluate(([x, y]) => window.CaroApp.screenOf(x, y), [x, y]);
    await p.mouse.click(sx, sy); // lần 2 (nếu đang bật "chạm 2 lần để xác nhận") – ô đã có quân thì bỏ qua
    await sleep(120);
    await p.mouse.click(sx, sy);
  }

  ok(await p.evaluate(() => window.CaroBots.get('boat').rapfi.ms > 0 && window.CaroRapfi.handles('boat', 'free') && window.CaroRapfi.handles('boat', 'vn') && !window.CaroRapfi.handles('rong', 'free')),
    'BOAT dùng Rapfi ở luật tự do và Rapfi-CARO ở luật Việt Nam; các bot khác thì không');
  ok(await p.evaluate(() => { const f = window.CaroRapfi.frame([[0, 0], [9, 0], [0, 3]], 15); return f && f.margin === 2 && !window.CaroRapfi.frame([[0, 0], [13, 0]], 15); }),
    'đặt thế vào bàn Rapfi: cách mép 2 ô; rộng 14 ô thì không vừa bàn 15×15');

  // ---------------------------------------------------------------- Luật tự do: lần đầu tải chậm → nước đầu không phải chờ
  await start('free');
  ok(await waitFor(async () => /Rapfi/.test(await p.textContent('#toasts')), 4000), 'lần đầu: báo đang tải bộ não Rapfi');
  ok(await waitFor(async () => (await stones()) === 2, 20000), 'luật tự do: BOAT đi nước 2 ngay (engine của game, mạng chưa tải xong)');
  let s = await stats();
  // WebKit không làm chậm được tải mạng (request của Worker) – mạng có thể xong trước nước 2: bộ đếm sau tính từ r0
  okNet(s.rapfi === 0 && s.fallback === 1, `nước 2 nhường engine (rapfi ${s.rapfi}, nhường ${s.fallback})`);
  const r0 = s.rapfi, f0 = s.fallback;
  ok(await warm('free'), 'mạng tải xong: Rapfi sẵn sàng');
  okNet(downloads === 1, `tải đúng 1 file mạng (${downloads})`);
  // Người đi tiếp một nước, BOAT (Rapfi) trả lời trong thời gian nghĩ (~2,5 giây)
  const empty = await p.evaluate(() => { const b = window.CaroApp.board; for (const [x, y] of [[1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0]]) if (!b.get(x, y)) return [x, y]; return null; });
  const t0 = Date.now();
  await click(empty[0], empty[1]);
  ok(await waitFor(async () => (await stones()) === 4, 20000), 'BOAT trả lời nước người chơi');
  const took = Date.now() - t0;
  s = await stats();
  ok(s.rapfi === r0 + 1 && took < 9000, `nước 4 do Rapfi đi (${took} ms)`);
  await shot(p, 'boat-rapfi-free.png');

  // ---------------------------------------------------------------- Tiêu chuẩn và Renju: Worker mới, mạng của luật đó
  ok(await warm('std'), 'luật tiêu chuẩn: mạng sẵn sàng');
  await start('std', [[0, 0], [1, 0], [0, 1]]); // bày sẵn 3 quân → tới BOAT (O) đi nước 4
  ok(await waitFor(async () => (await stones()) === 4, 30000) && (await stats()).rapfi === r0 + 2, 'luật tiêu chuẩn: Rapfi đi');
  // Thế rộng 10 ô trên bàn 15×15 (cách mép 2 ô): Rapfi đi, engine của game kiểm chuỗi ép (thời gian vẫn như thường)
  const t1 = Date.now();
  await start('std', [[0, 0], [9, 0], [0, 1]]);
  ok(await waitFor(async () => (await stones()) === 4, 30000) && (await stats()).rapfi === r0 + 3, `sát mép: Rapfi đi, engine kiểm lại (${Date.now() - t1} ms)`);
  ok(await warm('renju'), 'Renju: mạng sẵn sàng');
  await start('renju');
  ok(await waitFor(async () => (await stones()) === 2, 30000) && (await stats()).rapfi === r0 + 4, 'Renju: Rapfi đi (2 mạng đen / trắng)');
  okNet(downloads === 4, `tự do 1 + tiêu chuẩn 1 + Renju 2 file mạng (${downloads})`);

  // ---------------------------------------------------------------- Luật Việt Nam: Rapfi-CARO (không mạng NNUE)
  ok(await warm('vn'), 'luật Việt Nam: Rapfi-CARO sẵn sàng');
  okNet(downloads === 4, `luật Việt Nam không tải mạng (${downloads})`);
  await start('vn');
  ok(await waitFor(async () => (await stones()) === 2, 20000), 'luật Việt Nam: BOAT đi');
  s = await stats();
  ok(s.rapfi === r0 + 5 && s.fallback === f0, `luật Việt Nam: Rapfi-CARO đi (rapfi ${s.rapfi}, nhường ${s.fallback})`);
  // Luật Việt Nam: bốn quân trống hai đầu là thắng – X có ba mở (0,0)–(0,2) nên đi (0,3) hoặc (0,−1) là thắng ngay
  // (Rapfi đi ngay, không in điểm – phân tích tự chấm là thắng)
  const vn = await p.evaluate(async () => {
    const mv = [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]];
    const ev = await window.CaroRapfiAn.evaluate({ moves: mv, rule: 'vn', ms: 300 });
    return ev && ev[6];
  });
  ok(vn && vn.mate > 0 && vn.move[0] === 0 && (vn.move[1] === 3 || vn.move[1] === -1),
    'Rapfi-CARO biết luật Việt Nam: ba mở → thắng — ' + JSON.stringify(vn));

  // ---------------------------------------------------------------- Phân tích ván bằng Rapfi (luật tự do)
  // O chặn ba mở của X (nước 6) rồi bỏ mặc thế bốn (nước 8 – sai lầm), X thắng ở nước 9. (Ván cũ để O bỏ mặc ba mở từ
  // đầu: Rapfi nghĩ đủ lâu thấy O thua chắc từ trước – vd. −M40 – nên kết quả đổi theo thời gian nghĩ)
  const GAME = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [-1, 0], [2, 1], [-2, 0]];
  await p.evaluate((g) => window.CaroApp.startPreset({ rule: 'free', mode: 'pvp', moves: g }), GAME);
  await sleep(300);
  await p.evaluate(() => document.getElementById('btn-analyze').click()); // nút "Phân tích" trên thanh công cụ
  await p.waitForSelector('.an-acc', { timeout: 20000 });
  await p.waitForFunction(() => !document.getElementById('an-refine'), null, { timeout: 90000 });
  const an = await p.evaluate(() => ({ eng: (document.querySelector('.an-eng') || {}).textContent || '', titles: [...document.querySelectorAll('.an-mv:not(.empty)')].map((e) => e.getAttribute('title')) }));
  ok(/Rapfi/.test(an.eng), 'phân tích: lượt kỹ do Rapfi chấm — ' + an.eng);
  const oMoves = an.titles.filter((t, i) => i % 2 === 1);
  const marked = an.titles.length === GAME.length && oMoves.some((t) => /Sai lầm|Bỏ lỡ/.test(t));
  // Hỏng thì in điểm Rapfi của các thế quanh nước 6 để tìm nguyên nhân
  const dbg = marked ? '' : ' · Rapfi: ' + JSON.stringify(await p.evaluate(async (g) => {
    const out = [];
    for (const i of [7, 8]) out.push(await window.CaroRapfi.ask('free', g.slice(0, i), 500));
    return out;
  }, GAME));
  ok(marked, 'Rapfi đánh dấu nước sai của O — ' + oMoves.join(' / ') + dbg);
  await shot(p, 'boat-rapfi-analysis.png');
  await p.evaluate(() => window.CaroApp.toBoard && window.CaroApp.toBoard());

  // ---------------------------------------------------------------- Tải lại trang: mạng lấy từ Cache Storage, không tải lại
  // Như người chơi quay lại sau: trang mới trong cùng hồ sơ trình duyệt (Cache Storage giữ nguyên). Không dùng reload:
  // Firefox (Playwright) có khi chờ sự kiện load mãi khi trang cũ còn Worker WebAssembly
  p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://localhost:${port}/`);
  await firstPage.close();
  await sleep(600);
  ok(await warm('free'), 'sau khi tải lại trang: Rapfi sẵn sàng từ bộ nhớ đệm');
  await start('free');
  ok(await waitFor(async () => (await stones()) === 2, 30000) && (await stats()).rapfi === 1, 'sau khi tải lại trang: Rapfi đi');
  okNet(downloads === 4, `mạng lấy từ bộ nhớ đệm, không tải lại (${downloads})`);

  // Thế cờ quá rộng so với bàn 20×20 của Rapfi → nhường engine của game
  await start('free', [[0, 0], [30, 0], [0, 1]]);
  ok(await waitFor(async () => (await stones()) === 4, 20000), 'thế cờ rộng hơn bàn Rapfi: BOAT vẫn đi (engine của game)');
  s = await stats();
  ok(s.fallback === 1 && s.rapfi === 1, 'không vừa bàn: không gửi cho Rapfi, đếm 1 lần nhường engine');

  // ---------------------------------------------------------------- Nhãn sức cờ, huy hiệu BOAT–Rapfi
  await p.evaluate(() => window.CaroApp.openNewGame());
  await sleep(300);
  await p.click('#ng-picker .style-tabs label:nth-child(5)');
  await sleep(150);
  const card = await p.$$eval('#ng-picker .bot-card', (els) => { const b = els.find((e) => /BOAT/.test(e.textContent)); return b ? b.querySelector('small').textContent : ''; });
  ok(card === 'Rapfi', 'thẻ BOAT ghi "Rapfi" thay cho ~2700 — ' + card);
  await p.click('#ng-picker .bot-card:last-child');
  await sleep(150);
  ok(/luật Việt Nam là Rapfi-CARO/.test(await p.textContent('#ng-picker .bot-say')), 'mô tả BOAT: Rapfi ở 3 luật Gomoku, Rapfi-CARO ở luật Việt Nam');
  await p.keyboard.press('Escape');
  const badge = await p.evaluate(() => {
    const R = window.CaroRapfi;
    R.game.rapfi = 30; R.game.fallback = 0; // như một ván Rapfi cầm quân suốt ván
    window.dispatchEvent(new CustomEvent('caro:gameover', { detail: { mode: 'ai', won: true, bot: 'boat' } }));
    return JSON.parse(localStorage.getItem('caro.habits')).earned;
  });
  ok(badge.beat_boat_rapfi && badge.beat_boat, 'thắng BOAT khi Rapfi cầm quân: huy hiệu "Đánh chìm BOAT–Rapfi"');

  // ---------------------------------------------------------------- Mạng tải hỏng: không dùng, không lưu, BOAT dùng engine
  if (!workerNet) console.log('SKIP mạng hỏng (WebKit: không giả được request của Worker)');
  else {
    const bad = await context('bad');
    await start('renju', [[0, 0]], bad.p);
    ok(await waitFor(async () => (await stones(bad.p)) === 2, 30000), 'mạng hỏng: BOAT vẫn đi (engine của game)');
    ok(await waitFor(async () => /Không tải được Rapfi/.test(await bad.p.textContent('#toasts')), 30000), 'mạng hỏng: báo không tải được Rapfi');
    const st = await bad.p.evaluate(async () => ({ avail: window.CaroRapfi.available('renju'), cached: (await (await caches.open('caro-rapfi-nets-v1')).keys()).length }));
    ok(!st.avail && st.cached === 0, `mạng hỏng không được lưu vào bộ nhớ đệm (${st.cached}), tạm tắt Rapfi luật Renju`);
    await bad.ctx.close();
  }

  // ---------------------------------------------------------------- Trang giấy phép (GPL-3)
  await p.evaluate(() => window.CaroShell.open('more'));
  await sleep(300);
  const lic = await p.$eval('#page-more .licenses-link', (a) => ({ href: a.getAttribute('href'), text: a.textContent }));
  ok(/licenses\.html$/.test(lic.href) && /Giấy phép mã nguồn mở/.test(lic.text), 'Xem thêm: dòng "Giấy phép mã nguồn mở"');
  const lp = await ctx.newPage();
  await lp.goto(`http://localhost:${port}/licenses.html#en`);
  await sleep(300);
  ok(/GPL-3/.test(await lp.textContent('#en')) && !(await lp.isVisible('#vi')), 'trang giấy phép: 4 ngôn ngữ, chọn theo #en');
  for (const href of await lp.$$eval('#en a[href^="rapfi/"]', (as) => as.map((a) => a.getAttribute('href')))) {
    const r = await lp.request.get(`http://localhost:${port}/${href}`);
    ok(r.ok() && (await r.body()).length > 400, `tải được ${href}`);
  }
  await shot(lp, 'licenses-en.png');

  ok(!errors.length, 'không lỗi JS / CSP' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await finish();
})();
