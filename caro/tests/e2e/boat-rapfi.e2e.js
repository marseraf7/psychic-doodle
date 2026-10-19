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
    // Compute Pressure giả (rapfi-load.js): bước kiểm "máy nóng" gọi window.__press([{ state }])
    await ctx.addInitScript(() => {
      window.PressureObserver = class { constructor(cb) { window.__press = cb; } observe() { return Promise.resolve(); } disconnect() {} };
    });
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
  // Thế 9 quân (ngoài sách khai cuộc – sách chỉ tới 7 quân): BOAT phải nghĩ, mà mạng chưa tải xong → engine của game
  const FREE9 = [[0, 0], [1, 2], [2, 1], [-1, -1], [-2, 1], [3, 1], [0, 3], [-2, -2], [3, -2]];
  await start('free', FREE9);
  // Thông báo chỉ hiện khi tải quá 0,7 giây: cần mạng chậm giả lập – WebKit không làm chậm được request của Worker
  okNet(await waitFor(async () => /Rapfi/.test(await p.textContent('#toasts')), 4000), 'lần đầu: báo đang tải bộ não Rapfi');
  ok(await waitFor(async () => (await stones()) === 10, 20000), 'luật tự do: BOAT đi ngay (engine của game, mạng chưa tải xong)');
  let s = await stats();
  // WebKit không làm chậm được tải mạng (request của Worker) – mạng có thể xong trước nước 2: bộ đếm sau tính từ r0
  okNet(s.rapfi === 0 && s.fallback === 1, `nước 10 nhường engine (rapfi ${s.rapfi}, nhường ${s.fallback})`);
  let r0 = s.rapfi;
  const f0 = s.fallback;
  ok(await warm('free'), 'mạng tải xong: Rapfi sẵn sàng');
  // Chromium ≥ 137: máy chủ gửi Document-Isolation-Policy → trang được cô lập → Rapfi đa luồng; trình duyệt khác: 1 luồng
  const iso = await p.evaluate(() => ({ iso: window.crossOriginIsolated, threads: window.CaroRapfi.stats.threads, ua: navigator.userAgent }));
  ok(iso.threads >= 1 && (!iso.iso || iso.threads >= 1), `Rapfi chạy ${iso.threads} luồng (trang ${iso.iso ? '' : 'không '}cô lập cross-origin)`);
  okNet(downloads === 1, `tải đúng 1 file mạng (${downloads})`);
  // Người đi tiếp một nước, BOAT (Rapfi) trả lời trong thời gian nghĩ (~2,5 giây)
  const empty = await p.evaluate(() => { const b = window.CaroApp.board; for (const [x, y] of [[1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0]]) if (!b.get(x, y)) return [x, y]; return null; });
  const t0 = Date.now();
  await click(empty[0], empty[1]);
  ok(await waitFor(async () => (await stones()) === 12, 20000), 'BOAT trả lời nước người chơi');
  const took = Date.now() - t0;
  s = await stats();
  ok(s.rapfi === r0 + 1 && took < 9000, `nước 12 do Rapfi đi (${took} ms)`);
  // Sau nước của BOAT, Rapfi nghĩ trước trên thế người chơi tới lượt; đổi luật ngay sau đó (Worker đang nghĩ trước phải
  // dừng ở lát kế tiếp rồi mới terminate – xem retire) – các bước dưới kiểm Worker mới vẫn chạy bình thường
  ok(s.ponder >= 1, `BOAT nghĩ trước trong lúc người chơi nghĩ (${s.ponder} lần)`);
  // Giới hạn an toàn của nghĩ trước: bỏ máy IDLE.ms thì tạm dừng (thử với 1,5 giây thay cho 10 phút); bấm phím (người
  // chơi quay lại) thì nghĩ tiếp trên đúng thế đó, rồi lại tạm dừng sau 1,5 giây không chạm
  await p.evaluate(() => { window.CaroRapfi.IDLE.ms = 1500; });
  await p.keyboard.press('Shift');
  ok(await waitFor(async () => (await stats()).idle >= 1, 3000), 'bỏ máy: tạm dừng nghĩ trước');
  await p.keyboard.press('Shift');
  ok(await waitFor(async () => (await stats()).ponder === s.ponder + 1, 2000), 'người chơi quay lại: nghĩ trước tiếp');
  ok(await waitFor(async () => (await stats()).idle >= 2, 4000), 'lại bỏ máy: tạm dừng lần nữa');
  await p.evaluate(() => { window.CaroRapfi.IDLE.ms = 600000; });
  await p.keyboard.press('Shift'); // nghĩ trước tiếp – bước đổi luật dưới cho Worker thôi việc lúc đang nghĩ trước
  ok(await waitFor(() => p.evaluate(() => window.CaroRapfi.working() || !window.CaroRapfi.mtActive()), 2000), 'nghĩ trước chạy lại');
  // Bản đa luồng: trang giật (giả lập: luồng chính bận 200 ms nhiều lần) trong lúc Rapfi nghĩ trước → gợi ý tắt đa luồng
  if (iso.threads > 1) {
    await sleep(1500); // theo dõi khung hình bắt đầu trong vòng 1 giây kể từ khi Rapfi đa luồng bận
    await p.evaluate(async () => {
      for (let i = 0; i < 8; i++) {
        const t = performance.now();
        while (performance.now() - t < 200) { /* bận */ }
        await new Promise((r) => setTimeout(r, 80));
      }
    });
    ok(await waitFor(async () => /đa luồng/.test(await p.textContent('#toasts')), 2000) && (await p.evaluate(() => window.CaroRapfiSettings.hinted)),
      'máy giật khi Rapfi đa luồng chạy: gợi ý tắt đa luồng');
  } else console.log('SKIP gợi ý tắt đa luồng (Rapfi một luồng)');
  // Ô "Rapfi đa luồng" trong Cài đặt: trang cô lập thì bật được; không thì khoá, ghi chỉ chạy một luồng
  const box = await p.evaluate(() => { window.CaroRapfiSettings.sync(); const el = document.querySelector('#settings-form [name=rapfiMt]'); return { on: el.checked, dis: el.disabled, hid: el.closest('.li').hidden, note: el.closest('.li').querySelector('small').textContent }; });
  ok(!box.hid && (iso.iso ? box.on && !box.dis : !box.on && box.dis && /một luồng/.test(box.note)), 'Cài đặt: ô Rapfi đa luồng — ' + JSON.stringify(box));
  if (iso.iso) {
    // Tắt đa luồng: Worker dựng lại bản một luồng; bật lại: đa luồng như cũ
    const flip = async (v) => { await p.evaluate((v) => window.CaroRapfi.setMt(v), v); await warm('free'); return p.evaluate(() => ({ t: window.CaroRapfi.stats.threads, mt: window.CaroRapfi.mtActive() })); };
    const off = await flip(false), on = await flip(true);
    ok(off.t === 1 && !off.mt && on.t === iso.threads && on.mt, `tắt / bật đa luồng: ${off.t} → ${on.t} luồng`);
    await start('free', [[0, 0], [1, 1], [-1, -1]]); // nước sau đa luồng: BOAT vẫn đi, nghĩ trước tiếp cho bước đổi luật
    ok(await waitFor(async () => (await stones()) === 4, 20000), 'bật lại đa luồng: BOAT đi');
    r0 = (await stats()).rapfi - 1; // các bước sau đếm tiếp từ đây
  }
  // Tự giảm tải (rapfi-load.js): máy rất nóng → thôi nghĩ trước, 1 luồng; hết nóng → như cũ, nghĩ trước tiếp
  await start('free', FREE9.concat([[4, 4], [5, -3]])); // ngoài sách: BOAT nghĩ rồi nghĩ trước
  ok(await waitFor(async () => (await stones()) === 12, 20000), 'giảm tải: BOAT đi');
  const before = await stats();
  await p.evaluate(() => window.__press([{ state: 'critical' }]));
  // Worker dừng lượt nghĩ trước rồi mới báo xong (bất đồng bộ): chờ tới khi hết bận
  await waitFor(() => p.evaluate(() => !window.CaroRapfi.working()), 3000);
  const hot = await p.evaluate(() => ({ load: window.CaroRapfi.stats.load, threads: window.CaroRapfi.stats.threads, working: window.CaroRapfi.working(), lv: window.CaroRapfiLoad.level }));
  ok(hot.load === 2 && hot.lv === 2 && hot.threads === 1 && !hot.working, 'máy rất nóng: 1 luồng, thôi nghĩ trước — ' + JSON.stringify(hot));
  await p.evaluate(() => window.__press([{ state: 'serious' }]));
  const warmish = await stats();
  ok(warmish.load === 1 && warmish.threads === Math.max(1, Math.ceil(iso.threads / 2)), `máy căng: nửa số luồng (${warmish.threads})`);
  await p.evaluate(() => window.__press([{ state: 'nominal' }]));
  ok(await waitFor(async () => { const t = await stats(); return t.load === 0 && t.threads === iso.threads && t.ponder > before.ponder; }, 3000),
    'hết nóng: đủ luồng, nghĩ trước tiếp');
  r0 = (await stats()).rapfi - 1; // nước của bước này: các bước sau đếm tiếp từ đây
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
  // Nước đầu ván lấy từ sách 'vn-rapfi' (Rapfi-CARO nghĩ 10 giây mỗi thế – book-data.js)
  const bk = await p.evaluate(() => { const mv = window.CaroApp.board.moves.map((m) => [m.x, m.y]); return { got: mv[1], want: window.CaroBook.lookup(mv.slice(0, 1), 'vn-rapfi') }; });
  ok(bk.want && bk.got[0] === bk.want[0] && bk.got[1] === bk.want[1], 'luật Việt Nam: BOAT đi nước trong sách vn-rapfi — ' + JSON.stringify(bk));
  // Luật Việt Nam: bốn quân trống hai đầu là thắng – X có ba mở (0,0)–(0,2) nên đi (0,3) hoặc (0,−1) là thắng ngay
  // (Rapfi đi ngay, không in điểm – phân tích tự chấm là thắng)
  const vn = await p.evaluate(async () => {
    const mv = [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]];
    const ev = await window.CaroRapfiAn.evaluate({ moves: mv, rule: 'vn', ms: 300 });
    return ev && ev[6];
  });
  ok(vn && vn.mate > 0 && vn.move[0] === 0 && (vn.move[1] === 3 || vn.move[1] === -1),
    'Rapfi-CARO biết luật Việt Nam: ba mở → thắng — ' + JSON.stringify(vn));
  // Máy đủ RAM, Rapfi 1 luồng: Worker Rapfi thứ hai – phân tích chấm hai thế cùng lúc, mỗi thế gấp đôi thời gian.
  // Rapfi đa luồng: một Worker đã dùng hết các lõi – không dựng Worker thứ hai
  const mt = (await stats()).threads > 1;
  const auxOk = await p.evaluate(() => window.CaroRapfi.auxReady('vn', 30000));
  ok(mt ? !auxOk : auxOk, mt ? 'phân tích: Rapfi đa luồng – không dựng Worker thứ hai' : 'phân tích: Worker Rapfi thứ hai sẵn sàng');
  const two = await p.evaluate(async () => {
    const mv = [[0, 0], [1, 1], [-1, 1], [1, 0], [1, -1], [2, -2], [0, 1], [0, -1]];
    const a0 = window.CaroRapfi.stats.aux, t = performance.now();
    const ev = await window.CaroRapfiAn.evaluate({ moves: mv, rule: 'vn', ms: 150 });
    return { n: ev ? ev.filter((e) => e && e.src === 'rapfi').length : 0, aux: window.CaroRapfi.stats.aux - a0, ms: Math.round(performance.now() - t) };
  });
  ok(two.n === 9 && (mt ? two.aux === 0 : two.aux >= 3), `phân tích ${mt ? 'đa luồng' : 'hai Worker'}: đủ 9 thế, Worker phụ chấm ${two.aux} thế (${two.ms} ms)`);

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
    ok(await waitFor(async () => (await stones(bad.p)) === 2, 30000), 'mạng hỏng: BOAT vẫn đi (sách khai cuộc / engine của game)');
    ok(await waitFor(async () => /Không tải được Rapfi/.test(await bad.p.textContent('#toasts')), 30000), 'mạng hỏng: báo không tải được Rapfi');
    const st = await bad.p.evaluate(async () => ({ avail: window.CaroRapfi.available('renju'), cached: (await (await caches.open('caro-rapfi-nets-v1')).keys()).length }));
    ok(!st.avail && st.cached === 0, `mạng hỏng không được lưu vào bộ nhớ đệm (${st.cached}), tạm tắt Rapfi luật Renju`);
    // BOAT đi nước sách ngay nên Worker có thể còn đang tải file mạng thứ hai qua route giả: gỡ route trước khi đóng
    await bad.ctx.unrouteAll({ behavior: 'ignoreErrors' });
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
