/*
 * Kiểm thử trình duyệt: BOAT chạy Rapfi (WebAssembly, GPL-3) ở luật tự do / tiêu chuẩn / Renju, luật Việt Nam dùng
 * engine của game, mạng tải một lần rồi lấy từ Cache Storage, CSP của máy chủ cho phép WebAssembly, trang giấy phép.
 *   RAPFI_NETS=<thư mục có mix9svq*.bin.lz4> node caro/tests/e2e/boat-rapfi.e2e.js
 * Có RAPFI_NETS thì trả file mạng từ thư mục đó thay cho CDN (máy không ra Internet); không có thì tải thật từ CDN.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { setup } = require('./helpers');

(async () => {
  const port = 8098;
  const { browser, ok, shot, sleep, finish } = await setup(port);
  const errors = [];
  const nets = process.env.RAPFI_NETS;
  let downloads = 0;

  const ctx = await browser.newContext({ viewport: { width: 430, height: 860 } });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', 1); localStorage.clear(); localStorage.setItem('caro.lang', 'vi'); } });
  if (nets) {
    await ctx.route(/mix9svq.*\.bin\.lz4$/, async (route) => {
      const url = route.request().url();
      if (url.startsWith(`http://localhost:${port}/`)) return route.fulfill({ status: 404, body: '' }); // chưa đặt sẵn trên máy chủ
      if (++downloads === 1) await sleep(1500); // lần tải đầu chậm như mạng thật: phải hiện thông báo đang tải
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/octet-stream' }, body: fs.readFileSync(path.join(nets, path.basename(url))) });
    });
  } else {
    ctx.on('request', (r) => { if (/mix9svq.*\.bin\.lz4$/.test(r.url()) && !r.url().startsWith('http://localhost')) downloads++; });
  }
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push('console: ' + m.text()); });
  await p.goto(`http://localhost:${port}/`);
  await sleep(500);

  const X = 1, O = 2;
  const stats = () => p.evaluate(() => ({ ...window.CaroRapfi.stats }));
  const stones = () => p.evaluate(() => window.CaroApp.board.moves.length);
  async function waitFor(fn, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(250); }
    return false;
  }
  /** Ván mới với BOAT, người cầm X đã đi (0,0): BOAT (O) nghĩ nước 2. */
  async function start(rule, moves = [[0, 0]]) {
    await p.evaluate(({ rule, moves, X }) => {
      window.CaroApp.setBot('boat', 7);
      return window.CaroApp.startPreset({ rule, human: X, bot: 'boat', moves });
    }, { rule, moves, X });
  }
  /** Người chơi bấm ô (x, y) trên bàn cờ thật. */
  async function click(x, y) {
    const [sx, sy] = await p.evaluate(([x, y]) => window.CaroApp.screenOf(x, y), [x, y]);
    await p.mouse.click(sx, sy); // lần 2 (nếu đang bật "chạm 2 lần để xác nhận") – ô đã có quân thì bỏ qua
    await sleep(120);
    await p.mouse.click(sx, sy);
  }

  ok(await p.evaluate(() => window.CaroBots.get('boat').rapfi.ms > 0 && window.CaroRapfi.handles('boat', 'free') && !window.CaroRapfi.handles('boat', 'vn') && !window.CaroRapfi.handles('rong', 'free')),
    'BOAT dùng Rapfi ở luật tự do; luật Việt Nam và các bot khác thì không');

  // ---------------------------------------------------------------- Luật tự do: tải mạng lần đầu, Rapfi đi
  await start('free');
  const sawToast = await waitFor(async () => /Rapfi/.test(await p.textContent('#toasts')), 4000);
  ok(sawToast, 'lần đầu: báo đang tải bộ não Rapfi');
  ok(await waitFor(async () => (await stones()) === 2, 40000), 'luật tự do: BOAT đi nước 2');
  let s = await stats();
  ok(s.rapfi === 1 && s.fallback === 0, `nước 2 do Rapfi đi (rapfi ${s.rapfi}, nhường engine ${s.fallback})`);
  ok(downloads === 1, `tải đúng 1 file mạng (${downloads})`);
  await shot(p, 'boat-rapfi-free.png');
  // Người đi tiếp một nước, BOAT trả lời trong thời gian nghĩ (~2,5 giây)
  const empty = await p.evaluate(() => { const b = window.CaroApp.board; for (const [x, y] of [[1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0]]) if (!b.get(x, y)) return [x, y]; return null; });
  const t0 = Date.now();
  await click(empty[0], empty[1]);
  ok(await waitFor(async () => (await stones()) === 4, 20000), 'BOAT trả lời nước người chơi');
  const took = Date.now() - t0;
  s = await stats();
  ok(s.rapfi === 2 && took < 9000, `nước 4 cũng do Rapfi (${took} ms)`);

  // ---------------------------------------------------------------- Tiêu chuẩn và Renju: Worker mới, mạng của luật đó
  await start('std', [[0, 0], [1, 0], [0, 1]]); // bày sẵn 3 quân → tới BOAT (O) đi nước 4
  ok(await waitFor(async () => (await stones()) === 4, 40000) && (await stats()).rapfi === 3, 'luật tiêu chuẩn: Rapfi đi');
  await start('renju');
  ok(await waitFor(async () => (await stones()) === 2, 40000) && (await stats()).rapfi === 4, 'Renju: Rapfi đi (2 mạng đen / trắng)');
  ok(downloads === 4, `tự do 1 + tiêu chuẩn 1 + Renju 2 file mạng (${downloads})`);

  // ---------------------------------------------------------------- Luật Việt Nam: engine của game
  await start('vn');
  ok(await waitFor(async () => (await stones()) === 2, 20000), 'luật Việt Nam: BOAT vẫn đi');
  s = await stats();
  ok(s.rapfi === 4 && s.fallback === 0, 'luật Việt Nam không gọi Rapfi');

  // ---------------------------------------------------------------- Tải lại trang: mạng lấy từ Cache Storage, không tải lại
  await p.reload();
  await sleep(600);
  await start('free');
  ok(await waitFor(async () => (await stones()) === 2, 30000) && (await stats()).rapfi === 1, 'sau khi tải lại trang: Rapfi vẫn đi');
  ok(downloads === 4, `mạng lấy từ bộ nhớ đệm, không tải lại (${downloads})`);

  // Thế cờ quá rộng so với bàn 20×20 của Rapfi → nhường engine của game
  await start('free', [[0, 0], [30, 0], [0, 1]]);
  ok(await waitFor(async () => (await stones()) === 4, 20000), 'thế cờ rộng hơn bàn Rapfi: BOAT vẫn đi (engine của game)');
  s = await stats();
  ok(s.fallback === 1 && s.rapfi === 1, 'không vừa bàn: không gửi cho Rapfi, đếm 1 lần nhường engine');

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
