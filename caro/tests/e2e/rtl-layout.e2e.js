/*
 * Bố cục khi chữ viết từ phải sang trái (RTL – Ả Rập, Do Thái…; docs/chuan-giao-dien.md mục 4d).
 * Chưa có ngôn ngữ RTL nào nên bài thử ép <html dir="rtl"> (giữ bằng MutationObserver – i18n.js có thể đặt lại dir theo
 * ngôn ngữ) trên giao diện tiếng Anh, ở 390px và 1280px, rồi đi qua: Trang chủ → Cài đặt / Ngôn ngữ → ván với máy (đi 2 nước)
 * → tab Xem thêm (thẻ tài khoản) → trang một giải Offline. Ở mỗi màn:
 *   - không cuộn ngang (trang và khung cuộn của trang con),
 *   - ui-audit.js báo 0 lỗi (chữ cắt không "…", nút đè chữ, chữ dính…),
 *   - nút quay lại (‹ trang con, ‹ về trang từ bàn cờ) nằm nửa PHẢI khi RTL, nửa TRÁI khi LTR (chứng minh bố cục đã lật),
 *     biểu tượng mũi tên lật gương (scaleX(-1)) khi RTL;
 *   - bàn cờ: bấm vào toạ độ màn hình của ô (x, y) thì quân rơi đúng ô đó, toạ độ trùng với LTR (bàn cờ không bị lật).
 * Ảnh chụp: E2E_OUT/rtl-*.png. Chạy: node caro/tests/e2e/rtl-layout.e2e.js
 */
'use strict';
const { setup, sleep, gotoRetry, pickTpl } = require('./helpers');
const { audit } = require('./ui-audit');

const PORT = Number(process.env.E2E_PORT) || 8191;

(async () => {
  const { browser, user, ok, shot, finish } = await setup(PORT);
  const errs = [];

  /** Trang mới, tiếng Anh, hướng chữ dir ép cứng. */
  async function open(w, dir) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 800 }, serviceWorkers: 'block' });
    await ctx.addInitScript((d) => {
      localStorage.setItem('caro.lang', 'en');
      localStorage.setItem('caro.homePane', 'bot'); // ô Với máy ở Trang chủ
      // Lúc chạy script này <html> có thể chưa có: canh cả việc tạo phần tử lẫn mọi lần đổi thuộc tính dir
      const force = () => { const h = document.documentElement; if (h && h.getAttribute('dir') !== d) h.setAttribute('dir', d); };
      force();
      new MutationObserver(force).observe(document, { attributes: true, attributeFilter: ['dir'], childList: true, subtree: true });
    }, dir);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${dir}@${w}: ${e.message}`));
    await gotoRetry(p, `http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.CaroShell && window.CaroApp && document.querySelector('#home-bots .qm-tile'), null, { timeout: 30000 });
    await sleep(800);
    return p;
  }

  /** Không cuộn ngang: cả trang và khung cuộn dọc của trang con đang mở (.pg-body). */
  const hscroll = (p) => p.evaluate(() => {
    const out = [];
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth + 1) out.push(`html ${de.scrollWidth}>${de.clientWidth}`);
    for (const b of document.querySelectorAll('.pg-body')) {
      if (!b.getClientRects().length || getComputedStyle(b).visibility === 'hidden') continue;
      if (b.scrollWidth > b.clientWidth + 1) out.push(`${b.parentElement && b.parentElement.id}/.pg-body ${b.scrollWidth}>${b.clientWidth}`);
    }
    return out;
  });

  /** Vị trí (tâm x) và biến đổi của biểu tượng trong nút đang hiện khớp sel. */
  const btnPos = (p, sel) => p.evaluate((s) => {
    const b = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden');
    if (!b) return null;
    const r = b.getBoundingClientRect(), ico = b.querySelector('svg');
    return { cx: r.left + r.width / 2, half: innerWidth / 2, tf: ico ? getComputedStyle(ico).transform : '' };
  }, sel);
  const FLIP = /^matrix\(-1, 0, 0, 1/;

  /** Kiểm chung một màn: không cuộn ngang, 0 lỗi soát giao diện, chụp ảnh. */
  async function screen(p, tag, file) {
    const h = await hscroll(p);
    ok(!h.length, `${tag}: không cuộn ngang ${h.join(' ')}`);
    const a = await audit(p);
    ok(a.length === 0, `${tag}: soát giao diện 0 lỗi${a.length ? ' ' + JSON.stringify(a.slice(0, 6)) : ''}`);
    if (file) await shot(p, file);
  }

  const boardPts = {}; // toạ độ màn hình của vài ô lúc vào ván, theo bề rộng – so RTL với LTR

  for (const w of [390, 1280]) {
    for (const dir of ['ltr', 'rtl']) {
      const tag = `${dir}@${w}`;
      const rtl = dir === 'rtl';
      const p = await open(w, dir);
      ok(await p.evaluate(() => document.documentElement.dir) === dir && await p.evaluate(() => getComputedStyle(document.body).direction) === dir, `${tag}: <html dir="${dir}">, body direction ${dir}`);

      // ---------------------------------------------------------------- 1. Trang chủ
      if (rtl) await screen(p, `${tag} Trang chủ`, `rtl-home-${w}.png`);
      else ok(!(await hscroll(p)).length, `${tag} Trang chủ: không cuộn ngang`);

      // ---------------------------------------------------------------- 2. Cài đặt → Ngôn ngữ (trang con có nút ‹)
      await p.evaluate(() => document.getElementById('btn-settings').click());
      await sleep(300);
      await p.click('#settings-form [data-go="lang"]');
      await sleep(300);
      const back = await btnPos(p, '#page-settings [data-pg-back], .pg-back');
      ok(back && (rtl ? back.cx > back.half : back.cx < back.half), `${tag} Cài đặt / Ngôn ngữ: nút ‹ ở nửa ${rtl ? 'phải' : 'trái'} ${JSON.stringify(back)}`);
      ok(back && (rtl ? FLIP.test(back.tf) : !FLIP.test(back.tf)), `${tag}: mũi tên ‹ ${rtl ? 'lật gương' : 'không lật'} (${back && back.tf})`);
      const rows = await p.$$eval('#lang-list label.li', (ls) => ls.filter((l) => l.getClientRects().length).length);
      ok(rows >= 8, `${tag}: danh sách ngôn ngữ hiện ${rows} hàng`);
      if (rtl) await screen(p, `${tag} Cài đặt / Ngôn ngữ`, `rtl-lang-${w}.png`);
      // mũi tên › của hàng Cài đặt (#i-chev) cũng lật khi RTL
      await p.evaluate(() => { const b = [...document.querySelectorAll('.pg-back')].find((x) => x.getClientRects().length); if (b) b.click(); });
      await sleep(300);
      const chev = await p.evaluate(() => {
        const s = [...document.querySelectorAll('svg.chev')].find((x) => x.getClientRects().length);
        return s ? getComputedStyle(s).transform : null;
      });
      ok(chev !== null && (rtl ? FLIP.test(chev) : !FLIP.test(chev)), `${tag}: mũi tên › của hàng danh sách ${rtl ? 'lật' : 'không lật'} (${chev})`);

      // ---------------------------------------------------------------- 3. Ván với máy, đi 2 nước bằng cách bấm bàn cờ
      await p.click('#tabbar [data-tab="home"]').catch(() => {});
      await sleep(300);
      await p.evaluate(() => document.querySelector('#home-bots .qm-tile').click());
      await p.waitForFunction(() => !document.body.classList.contains('shell-on') && window.CaroApp.board, null, { timeout: 10000 });
      await sleep(600);
      // Toạ độ màn hình của vài ô ngay khi vào ván (chưa có nước nào, khung nhìn mặc định) – phải trùng LTR
      const grid = await p.evaluate(() => [[0, 0], [3, -2], [-4, 1], [5, 5]].map((c) => window.CaroApp.screenOf(c[0], c[1]).map(Math.round)));
      if (!rtl) boardPts[w] = grid;
      else ok(JSON.stringify(grid) === JSON.stringify(boardPts[w]), `${tag} bàn cờ: toạ độ màn hình của các ô trùng LTR (không lật) ${JSON.stringify(grid)} = ${JSON.stringify(boardPts[w])}`);
      for (const cell of [[0, 0], [2, -2]]) {
        await p.waitForFunction(() => document.querySelector('#turn') && window.CaroApp.board.moves.length % 2 === 0, null, { timeout: 15000 }).catch(() => {});
        await sleep(300);
        const n0 = await p.evaluate(() => window.CaroApp.board.moves.length);
        const free = await p.evaluate((c) => window.CaroApp.board.get(c[0], c[1]) === 0, cell);
        const [sx, sy] = await p.evaluate((c) => window.CaroApp.screenOf(c[0], c[1]), cell);
        await p.mouse.click(sx, sy);
        await sleep(400);
        const got = await p.evaluate(([c, n]) => { const m = window.CaroApp.board.moves[n]; return { cell: m ? [m[0] !== undefined ? m[0] : m.x, m[1] !== undefined ? m[1] : m.y] : null, at: window.CaroApp.board.get(c[0], c[1]) }; }, [cell, n0]);
        ok(free && got.at !== 0 && got.cell && got.cell[0] === cell[0] && got.cell[1] === cell[1], `${tag} bàn cờ: bấm vào ô (${cell}) → quân đặt đúng ô ${JSON.stringify(got)}`);
      }
      await sleep(600);
      const home = await btnPos(p, '#btn-home');
      ok(home && (rtl ? home.cx > home.half : home.cx < home.half), `${tag} bàn cờ: nút ‹ về trang ở nửa ${rtl ? 'phải' : 'trái'} ${JSON.stringify(home)}`);
      ok(home && (rtl ? FLIP.test(home.tf) : !FLIP.test(home.tf)), `${tag} bàn cờ: mũi tên ‹ ${rtl ? 'lật gương' : 'không lật'}`);
      if (rtl) {
        const h = await hscroll(p);
        ok(!h.length, `${tag} bàn cờ: không cuộn ngang ${h.join(' ')}`);
        await shot(p, `rtl-game-${w}.png`);
      }

      // ---------------------------------------------------------------- 4. Tab Xem thêm / thẻ tài khoản
      await p.evaluate(() => document.getElementById('btn-home').click());
      await sleep(500);
      await p.click('#tabbar [data-tab="more"]');
      await sleep(500);
      if (rtl) await screen(p, `${tag} Xem thêm`, `rtl-more-${w}.png`);
      else ok(!(await hscroll(p)).length, `${tag} Xem thêm: không cuộn ngang`);

      await p.context().close();
    }
  }

  // ---------------------------------------------------------------- 4b. Xem lại + phân tích ở máy tính (RTL, 1280px)
  //    Bảng phân tích sang trái, thanh trên căn giữa phần bàn cờ còn lại (lang-scripts.css); nhóm nút xem lại giữ LTR
  {
    const p = await open(1280, 'rtl');
    await p.evaluate(() => window.CaroApp.openReplay({ local: true, x: 'An', o: 'Binh', winner: null, rule: 'free', moves: [[0, 0], [1, 1], [0, 1], [2, 2], [0, 2], [3, 3]] }));
    await sleep(500);
    const rp = await p.evaluate(() => {
      const x = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.left + r.width / 2; };
      return { first: x('rp-first'), next: x('rp-next') };
    });
    ok(rp.first < rp.next, `rtl@1280 thanh xem lại giữ LTR: "đầu" bên trái "tới" ${JSON.stringify(rp)}`);
    if (await p.evaluate(() => !!(window.CaroStudy && window.CaroStudy.analyze))) {
      await p.evaluate(() => { if (window.CaroRapfi) window.CaroRapfi.ready = () => new Promise(() => {}); window.CaroStudy.analyze(); });
      await p.waitForFunction(() => document.body.classList.contains('analysis'), null, { timeout: 10000 }).catch(() => {});
      await sleep(800);
      const g = await p.evaluate(() => {
        const pn = document.querySelector('.an-panel').getBoundingClientRect(), bar = document.querySelector('.bar.top').getBoundingClientRect();
        return { panelL: Math.round(pn.left), panelR: Math.round(pn.right), barC: Math.round(bar.left + bar.width / 2), boardC: Math.round(pn.right + (innerWidth - pn.right) / 2) };
      });
      ok(g.panelL <= 1 && Math.abs(g.barC - g.boardC) <= 2, `rtl@1280 phân tích: bảng ở mép trái, thanh trên giữa phần bàn cờ ${JSON.stringify(g)}`);
      const h = await hscroll(p);
      ok(!h.length, `rtl@1280 phân tích: không cuộn ngang ${h.join(' ')}`);
      const ex = await p.evaluate(() => getComputedStyle(document.querySelector('.an-nav [data-nav="close"] svg')).transform);
      ok(!FLIP.test(ex), `rtl@1280 phân tích: nhóm nút LTR – biểu tượng thoát không lật (${ex})`);
      await shot(p, 'rtl-analysis-1280.png');
    }
    await p.context().close();
  }

  // ---------------------------------------------------------------- 5. Trang một giải Offline (mẫu Premier League, RTL)
  //    Tạo giải cần tài khoản: người chơi đăng ký sẵn (helpers.user), rồi ép dir="rtl" ngay trên trang
  for (const w of [390, 1280]) {
    const tag = `rtl@${w}`;
    const u = await user('en', `rtl_tour_${w}`, w);
    await u.evaluate(() => {
      const force = () => { if (document.documentElement.dir !== 'rtl') document.documentElement.dir = 'rtl'; };
      force();
      new MutationObserver(force).observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });
    });
    await sleep(300);
    await u.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(400);
    await pickTpl(u, 'premier_league'); await sleep(500);
    await u.click('[data-act="otTplTeams"]').catch(() => {}); await sleep(300);
    await screen(u, `${tag} form tạo giải`, `rtl-tour-form-${w}.png`);
    await u.click('#otf button.primary.wide'); await sleep(1200);
    await u.evaluate(() => window.CaroTourKit.acts.otStart && window.CaroTourKit.acts.otStart()); await sleep(1500);
    ok(await u.evaluate(() => !!(window.CaroTourKit.D.ot && window.CaroTourKit.D.ot.id)), `${tag}: tạo được giải`);
    const tb = await btnPos(u, '#otp-back');
    ok(tb && tb.cx > tb.half && FLIP.test(tb.tf), `${tag} trang giải: nút ‹ ở nửa phải, mũi tên lật ${JSON.stringify(tb)}`);
    await screen(u, `${tag} trang giải`, `rtl-tour-${w}.png`);
    await u.context().close();
  }

  ok(!errs.length, 'không có lỗi JS' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await finish();
})();
