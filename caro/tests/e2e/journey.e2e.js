/*
 * Giả lập hành trình người chơi từ đầu đến cuối, tìm lỗi ảnh hưởng trải nghiệm:
 *  - Quét mọi màn hình / hộp thoại ở 4 ngôn ngữ × 2 cỡ màn hình (360 và 1280 px):
 *    khoá i18n chưa dịch hiện ra, tràn ngang, hộp thoại không đóng được bằng Esc.
 *  - Học chơi: giải thích luật Swap2 và Renju từng bước, nút Back (Android) lùi một bước.
 *  - Chơi với máy tới hết ván, đi lại, ván mới.
 *  - Trang chính sách quyền riêng tư cuộn được bằng chuột (lăn và bấm giữ kéo).
 *   node caro/tests/e2e/journey.e2e.js
 */
'use strict';
const { setup } = require('./helpers');

(async () => {
  const PORT = 8099;
  const { browser, user, ok, shot, sleep, finish } = await setup(PORT);

  /** Khoá i18n lọt ra màn hình (t() trả về chính khoá khi thiếu bản dịch) + phần tử tràn ngang. */
  const audit = (p) => p.evaluate(() => {
    const raw = [];
    const keyRe = /^[a-z][a-z0-9]*(_[a-z0-9-]+)+$/;
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) {
      const s = n.textContent.trim();
      const el = n.parentElement;
      if (!s || !keyRe.test(s) || !el || !el.getClientRects().length) continue;
      if (el.closest('script,style,input,textarea')) continue;
      raw.push(s);
    }
    document.querySelectorAll('[placeholder],[aria-label],[title]').forEach((el) => {
      for (const a of ['placeholder', 'aria-label', 'title']) {
        const v = el.getAttribute(a);
        if (v && keyRe.test(v)) raw.push(a + ':' + v);
      }
    });
    const vw = document.documentElement.clientWidth;
    const wide = [];
    document.querySelectorAll('dialog[open] *, body > *:not(dialog) *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !el.getClientRects().length) return;
      if (r.right > vw + 1 && getComputedStyle(el).position !== 'fixed') {
        // phần tử nằm trong khung cuộn ngang có chủ đích thì bỏ qua
        for (let q = el.parentElement; q; q = q.parentElement) {
          const o = getComputedStyle(q).overflowX;
          if (o === 'auto' || o === 'scroll' || o === 'hidden') return;
        }
        wide.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + el.className) + ' ' + Math.round(r.right) + '>' + vw);
      }
    });
    return { raw: [...new Set(raw)], wide: [...new Set(wide)].slice(0, 6), docW: document.documentElement.scrollWidth, vw };
  });

  // ---------------------------------------------------------------- 1. Quét mọi hộp thoại: 4 ngôn ngữ × 2 cỡ
  const host = await user('vi', 'jrhost'); // có người chơi để danh sách / hồ sơ không rỗng
  for (const lang of ['vi', 'en', 'ru', 'zh']) {
    for (const width of [360, 1280]) {
      const p = await user(lang, `jr${lang}${width}`, width);
      await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
      const ids = await p.evaluate(() => [...document.querySelectorAll('dialog')].map((d) => d.id));
      const bad = [];
      let a = await audit(p);
      if (a.raw.length || a.docW > a.vw + 1) bad.push(`màn chính: ${a.raw.join(',')} ${a.docW > a.vw + 1 ? 'tràn ' + a.docW + '>' + a.vw + ' ' + a.wide.join(' ') : ''}`);
      for (const id of ids) {
        await p.evaluate((id) => { const d = document.getElementById(id); if (!d.open) d.showModal(); }, id);
        await sleep(120);
        a = await audit(p);
        if (a.raw.length) bad.push(`#${id}: khoá chưa dịch ${a.raw.join(', ')}`);
        if (a.wide.length) bad.push(`#${id}: tràn ngang ${a.wide.join(' ')}`);
        if (width === 360) await shot(p, `journey-${lang}-${id}-360.png`);
        await p.keyboard.press('Escape');
        await sleep(120);
        if (await p.evaluate((id) => document.getElementById(id).open, id)) {
          bad.push(`#${id}: Esc không đóng`);
          await p.evaluate((id) => document.getElementById(id).close(), id);
        }
      }
      ok(!bad.length, `${lang} ${width}px: ${ids.length} hộp thoại sạch` + (bad.length ? '\n    ' + bad.join('\n    ') : ''));
      await p.context().close();
    }
  }

  // ---------------------------------------------------------------- 2. Học chơi: luật Swap2 + Renju
  for (const width of [360, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    await ctx.addInitScript(() => localStorage.setItem('caro.lang', 'vi'));
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://localhost:${PORT}/`);
    await sleep(500);
    await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
    await p.click('#btn-settings');
    await sleep(200);
    await p.click('#settings-form [data-open="learn"]');
    await sleep(300);
    ok((await p.$$('#rules-list li')).length === 2, `${width}px: Học chơi có 2 mục luật (Swap2, Renju)`);
    for (const id of ['swap2', 'renju']) {
      await p.click(`#rules-list [data-rule="${id}"]`);
      await sleep(250);
      ok(await p.isVisible('#rule-dlg'), `${id}: mở hộp giải thích`);
      const total = await p.evaluate((id) => window.CaroLearn.RULES[id].length, id);
      const texts = new Set();
      for (let i = 0; i < total; i++) {
        const step = await p.textContent('#rule-step');
        ok(step === `Bước ${i + 1}/${total}`, `${id}: ${step}`);
        texts.add(await p.textContent('#rule-text'));
        if (i === 2) await shot(p, `journey-rule-${id}-${width}.png`);
        if (i === 1) {
          // Nút Back của Android lùi một bước chứ không đóng hộp
          await p.evaluate(() => document.getElementById('rule-dlg').onBack());
          ok(await p.textContent('#rule-step') === `Bước 1/${total}` && await p.isVisible('#rule-dlg'), `${id}: Back lùi về bước 1`);
          await p.click('#rule-next');
          await sleep(100);
        }
        const dlgFits = await p.evaluate(() => { const r = document.querySelector('#rule-dlg .dlg, #rule-dlg').getBoundingClientRect(); return r.right <= innerWidth + 1; });
        if (!dlgFits) ok(false, `${id} bước ${i + 1}: hộp tràn màn hình`);
        await p.click('#rule-next');
        await sleep(150);
      }
      ok(texts.size === total && ![...texts].some((s) => /^rule_/.test(s)), `${id}: ${total} bước đều có nội dung riêng`);
      ok(!(await p.isVisible('#rule-dlg')), `${id}: bấm Xong thì đóng`);
    }
    ok(await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('caro.learn') || '{}').rules)) === '["swap2","renju"]', 'đánh dấu đã đọc 2 luật');
    ok(!errs.length, `${width}px: không lỗi JS ${errs.join('|')}`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- 3. Điện thoại: chơi trên máy bằng cú chạm thật
  const errs = [];
  async function phone(name, lang = 'vi', register = true) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await ctx.addInitScript((l) => { if (!localStorage.getItem('caro.lang')) localStorage.setItem('caro.lang', l); }, lang);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(name + ': ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(name + ' console: ' + m.text()); });
    p.on('dialog', (d) => d.accept());
    await p.goto(`http://localhost:${PORT}/`);
    await sleep(500);
    await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
    if (register) {
      await p.tap('#btn-online'); await sleep(500);
      await p.tap('#go-register'); await sleep(150);
      await p.fill('#auth-form input[name=username]', name);
      await p.fill('#auth-form input[name=password]', 'caro-pass1');
      await p.tap('#auth-submit'); await sleep(700);
      p.uid = await p.evaluate(() => window.CaroOnline.state.me.id);
    }
    return p;
  }
  /** Chạm vào ô (x, y) trên bàn cờ như ngón tay thật (màn cảm ứng mặc định chạm 2 lần để xác nhận). */
  async function tapCell(p, x, y) {
    const [sx, sy] = await p.evaluate(([x, y]) => window.CaroApp.screenOf(x, y), [x, y]);
    await p.touchscreen.tap(sx, sy);
    await sleep(120);
    await p.touchscreen.tap(sx, sy);
    await sleep(120);
  }
  const nMoves = (p) => p.evaluate(() => window.CaroApp.board.moves.length);
  const closeAll = (p) => p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));

  {
    const p = await phone('local', 'vi', false);
    await p.tap('#btn-new'); await sleep(250);
    await p.tap('#newgame-form input[name=mode][value=pvp]');
    await p.tap('#newgame-form input[name=timeLimit][value="0"]');
    await p.tap('#newgame-form button[value=start]'); await sleep(300);
    ok(await nMoves(p) === 0 && !(await p.isVisible('#newgame')), 'ván 2 người trên máy: bàn trống');
    for (let i = 0; i < 4; i++) {
      await tapCell(p, i, 0);
      if (i < 3) await tapCell(p, i, 3);
    }
    await sleep(500);
    ok(await p.isVisible('#banner') && /X/.test(await p.textContent('#banner-title')), 'bốn mở: X thắng, hiện thẻ kết quả – ' + await p.textContent('#banner-title'));
    await shot(p, 'journey-local-win-360.png');
    // Chạm bàn cờ sau khi kết thúc không đặt thêm quân
    await p.tap('#banner-view'); await sleep(200);
    await tapCell(p, 6, 6);
    ok(await nMoves(p) === 7, 'ván đã xong: chạm bàn cờ không đặt thêm quân');
    // Đánh với máy, đi lại
    await closeAll(p);
    await p.tap('#btn-new'); await sleep(250);
    await p.tap('#newgame-form input[name=mode][value=ai]');
    await p.tap('#newgame-form input[name=human][value="1"]');
    await p.tap('#newgame-form button[value=start]'); await sleep(300);
    await tapCell(p, 0, 0);
    for (let k = 0; k < 40 && await nMoves(p) < 2; k++) await sleep(100);
    ok(await nMoves(p) === 2, 'đánh với máy: máy trả lời');
    const free = await p.evaluate(() => [[1, 1], [-1, -1], [1, -1], [-1, 1]].find(([x, y]) => !window.CaroApp.board.get(x, y)));
    await tapCell(p, ...free);
    for (let k = 0; k < 40 && await nMoves(p) < 4; k++) await sleep(100);
    await p.tap('#btn-undo'); await sleep(300);
    ok(await nMoves(p) === 2, 'đi lại: lùi cả nước của mình lẫn nước máy');
    // Tải lại trang: ván vẫn còn
    await p.reload(); await sleep(600);
    ok(await nMoves(p) === 2, 'tải lại trang: ván đang chơi được giữ');
    // Đổi giao diện, ngôn ngữ trong cài đặt
    await closeAll(p);
    await p.tap('#btn-settings'); await sleep(250);
    const langSel = await p.$('#settings-form select[name=lang], #lang');
    if (langSel) {
      await langSel.selectOption('en'); await sleep(250);
      ok(/Settings/.test(await p.textContent('#settings')), 'đổi ngôn ngữ sang tiếng Anh ngay lập tức');
      const a = await audit(p);
      ok(!a.raw.length, 'sau khi đổi ngôn ngữ không còn khoá chưa dịch ' + a.raw.join(','));
      await langSel.selectOption('vi'); await sleep(200);
    } else ok(false, 'không tìm thấy ô chọn ngôn ngữ');
    await p.context().close();
  }

  // ---------------------------------------------------------------- 4. Điện thoại: online – ghép trận nhanh, chat, xin hoà, đầu hàng, tái đấu, xem ván
  {
    const a = await phone('jrphonea');
    const b = await phone('jrphoneb');
    for (const p of [a, b]) await p.tap('#qm-grid .qm-tile[data-time="0"]:not([data-clock])');
    let r;
    for (let k = 0; k < 50; k++) { r = await a.evaluate(() => window.CaroOnline.state.room); if (r && r.seats && r.seats.o) break; await sleep(100); }
    ok(!!(r && r.seats.x && r.seats.o), 'ghép trận nhanh: 2 người vào cùng một phòng');
    await closeAll(a); await closeAll(b);
    await sleep(400);
    const [x, o] = r.seats.x === a.uid ? [a, b] : [b, a];
    await shot(x, 'journey-online-start-360.png');
    // Xem ván (người thứ ba, chưa đăng nhập)
    const w = await phone('watcher', 'vi', false);
    await w.tap('#btn-online'); await sleep(800);
    const watchBtn = await w.$('#tv-list [data-watch]');
    ok(!!watchBtn, 'TV: thấy ván đang diễn ra');
    if (watchBtn) { await watchBtn.tap(); await sleep(600); }
    ok(await w.evaluate(() => window.CaroApp.watching), 'người xem vào xem ván');
    // Đánh bằng chạm thật
    await tapCell(x, 0, 0); await sleep(300);
    await tapCell(x, 5, 5); await sleep(200);
    ok(await nMoves(x) === 1, 'không phải lượt mình: chạm không đặt quân');
    await tapCell(o, 0, 4); await sleep(300);
    ok(await nMoves(x) === 2 && await nMoves(o) === 2, 'hai bên thấy nước đi của nhau');
    for (let k = 0; k < 20 && await nMoves(w) < 2; k++) await sleep(100);
    ok(await nMoves(w) === 2, 'người xem thấy nước đi');
    // Chat nhanh
    await o.tap('#quick-btn'); await sleep(150);
    await o.tap('#quick-menu [data-q]'); await sleep(500);
    ok(await x.isVisible('#toasts .bubble'), 'chat nhanh: đối thủ thấy bong bóng');
    // Xin hoà → từ chối
    await x.tap('#btn-draw'); await sleep(500);
    const decline = o.locator('[data-draw="no"]:visible');
    ok(await decline.count() === 1, 'đối thủ thấy lời xin hoà');
    if (await decline.count()) { await decline.first().tap(); await sleep(300); }
    ok(!(await x.evaluate(() => window.CaroOnline.state.room.drawOffer)), 'từ chối hoà: lời xin hoà biến mất');
    // Tiếp tục tới khi X thắng
    await tapCell(x, 1, 0); await sleep(250); await tapCell(o, 1, 4); await sleep(250);
    await tapCell(x, 2, 0); await sleep(250); await tapCell(o, 2, 4); await sleep(250);
    await tapCell(x, 3, 0); await sleep(600);
    ok(await x.isVisible('#banner') && await o.isVisible('#banner'), 'kết thúc: cả hai thấy thẻ kết quả');
    ok(await x.evaluate(() => !!window.CaroOnline.state.room.winner), 'máy chủ ghi nhận người thắng');
    await shot(o, 'journey-online-lose-360.png');
    for (let k = 0; k < 20 && !(await w.evaluate(() => !!(window.CaroApp.online && window.CaroApp.online.room.winner))); k++) await sleep(100);
    ok(await w.evaluate(() => !!(window.CaroApp.online && window.CaroApp.online.room.winner)), 'người xem thấy kết quả');
    // Tái đấu → đầu hàng
    await x.tap('#banner-rematch'); await o.tap('#banner-rematch');
    for (let k = 0; k < 30 && await x.evaluate(() => !!window.CaroOnline.state.room.winner); k++) await sleep(100);
    ok(!(await x.evaluate(() => !!window.CaroOnline.state.room.winner)), 'tái đấu: ván mới bắt đầu');
    await closeAll(x); await closeAll(o);
    const r2 = await x.evaluate(() => window.CaroOnline.state.room);
    const [x2, o2] = r2.seats.x === a.uid ? [a, b] : [b, a];
    await tapCell(x2, 1, 2); await sleep(300); await tapCell(o2, 2, 2); await sleep(300);
    ok(await nMoves(x2) === 2, 'tái đấu: đi được 2 nước – ' + await nMoves(x2));
    if (await nMoves(x2) !== 2) await shot(x2, 'journey-rematch-x2.png'), await shot(o2, 'journey-rematch-o2.png');
    await x2.tap('#btn-resign'); await sleep(500);
    ok(await o2.isVisible('#banner'), 'đầu hàng: đối thủ thắng, thấy thẻ kết quả');
    // Rời phòng, lịch sử ván
    await x2.tap('#banner-leave'); await sleep(500);
    ok(!(await x2.evaluate(() => !!window.CaroApp.online)), 'rời phòng: về bàn cờ trên máy');
    // Lịch sử ván + xem lại
    await x2.tap('#btn-online'); await sleep(400);
    const hist = await x2.$('[data-social="history"]:visible');
    ok(!!hist, 'bảng Online có nút Lịch sử');
    if (hist) {
      await hist.tap(); await sleep(600);
      ok((await x2.$$('#history-list li')).length === 2, 'lịch sử: có 2 ván vừa chơi – ' + (await x2.textContent('#history-list')).replace(/\s+/g, ' '));
      await shot(x2, 'journey-history-360.png');
    }
    ok(!errs.length, 'điện thoại: không lỗi JS ' + errs.join(' | '));
    for (const p of [a, b, w]) await p.context().close();
  }

  // ---------------------------------------------------------------- 5. Trang chính sách quyền riêng tư: cuộn bằng chuột
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    const perr = [];
    p.on('console', (m) => { if (m.type() === 'error') perr.push(m.text()); });
    await p.goto(`http://localhost:${PORT}/privacy.html`);
    await sleep(400);
    const y = () => p.evaluate(() => scrollY);
    await p.mouse.move(640, 400); await p.mouse.wheel(0, 500); await sleep(300);
    ok(await y() === 500, 'chính sách: lăn chuột cuộn được');
    await p.evaluate(() => scrollTo(0, 0));
    await p.mouse.move(640, 600); await p.mouse.down(); await p.mouse.move(640, 200, { steps: 10 }); await p.mouse.up();
    ok(await y() === 400 && !(await p.evaluate(() => String(getSelection()))), 'chính sách: bấm giữ chuột kéo lên thì cuộn (không bôi đen chữ)');
    ok(!perr.length, 'chính sách: không lỗi (CSP) ' + perr.join(' | '));
    await ctx.close();
  }

  await host.context().close();
  await finish();
})().catch((e) => { console.error(e); process.exit(1); });
