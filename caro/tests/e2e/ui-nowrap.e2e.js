/*
 * Soát hình học giao diện các lỗi rà soát 20/11/2026 (đợt 1) ở màn điện thoại 360 px và 390 px, 4 ngôn ngữ:
 *   - R5: tên nhân vật máy trên thẻ "Với máy" (Trang chủ) một dòng, dài thì "…" + title đủ tên ("Khá Bảnh" từng xuống 2 dòng).
 *   - Tab Bảng xếp hạng: nhãn một dòng ("Siêu chớp"), không tràn ngang (en "Classical", ru "Классика" ở 360 px).
 *   - Lịch sử đấu: lý do kết thúc ("đầu hàng") ở cuối dòng phụ luôn thấy được (không bị "…" cắt mất).
 *   - Trang chủ mở trang không xô lệch: CLS < 0,05 (bản gộp, 390 và 1280 px).
 *   - Số phiên bản ở cuối Cài đặt hiện cả ở bản gộp (tên bộ nhớ đệm "caro-vNNN-b<mã>").
 *   - Thanh tab dính của trang giải Offline có bóng đổ phía dưới (R1).
 *   - Xem lại ván chưa xong ghi "Chưa kết thúc"; phân tích lúc nạp Rapfi ghi "Đang nạp máy phân tích…" (đợt 2).
 *   - Người mới: nút lớn "Chơi với máy" (home-hero.js), 1 chạm vào ván, ẩn sau ván đầu / khi bấm ✕ (đợt 3).
 *   - Không cuộn ngang, không lỗi JS.
 *   node caro/tests/e2e/ui-nowrap.e2e.js
 */
'use strict';
const { setup, gotoRetry, pickTpl } = require('./helpers');

const LANGS = ['vi', 'en', 'ru', 'zh'];

(async () => {
  const PORT = Number(process.env.E2E_PORT) || 8873;
  const { browser, user, ok, shot, sleep, finish } = await setup(PORT);
  const URL = `http://localhost:${PORT}/`;
  const errs = [];
  const page = async (w, lang, init = {}) => {
    const c = await browser.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
    await c.addInitScript((a) => { for (const [k, v] of Object.entries(a)) localStorage.setItem(k, v); }, { 'caro.lang': lang, ...init });
    const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(`${lang}@${w}: ${e.message}`));
    await gotoRetry(p, URL);
    await sleep(1200);
    return p;
  };
  const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

  // 1–2. Thẻ Với máy + tab Bảng xếp hạng
  for (const lang of LANGS) for (const w of [360, 390]) {
    // mở khoá tới mức 4 (có "Khá Bảnh") – nền sáng
    const p = await page(w, lang, { 'caro.homePane': 'bot', 'caro.theme': 'light', 'caro.bots': '{"unlocked":4}' });
    const bots = await p.evaluate(() => [...document.querySelectorAll('#home-bots .qm-tile')].map((t) => {
      const b = t.querySelector('b'), s = getComputedStyle(b);
      const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.3;
      return { name: b.textContent, one: b.getBoundingClientRect().height < lh * 1.5, cut: b.scrollWidth > b.clientWidth, ell: s.textOverflow === 'ellipsis', title: t.title === b.textContent };
    }));
    ok(bots.length === 12 && bots.every((b) => b.one && (!b.cut || b.ell) && b.title), `${lang} @${w}: tên nhân vật máy một dòng, có title (${bots.filter((b) => !b.one).map((b) => b.name).join(', ') || 'ok'})`);
    if (lang === 'vi' && w === 390) await p.locator('#home-bots').screenshot({ path: require('path').join(process.env.E2E_OUT || require('os').tmpdir(), 'nowrap-bots-vi-390.png') });
    await p.evaluate(() => window.CaroSocial.open('leaderboard')); await sleep(300);
    const lb = await p.evaluate(() => {
      const t = document.querySelector('#lb-tabs'), r = t.getBoundingClientRect();
      const labs = [...t.querySelectorAll('label')].map((l) => {
        const s = l.querySelector('span'), cs = getComputedStyle(s);
        const lh = parseFloat(getComputedStyle(l).lineHeight) || 16;
        return { txt: l.textContent.trim(), one: s.getBoundingClientRect().height < lh * 1.5, in: l.getBoundingClientRect().right <= r.right + 0.5, cut: s.scrollWidth > s.clientWidth + 0.5, ell: cs.textOverflow === 'ellipsis', title: l.title === l.textContent.trim() };
      });
      return { labs, over: t.scrollWidth > t.clientWidth + 1 };
    });
    ok(!lb.over && lb.labs.every((l) => l.one && l.in && (!l.cut || (l.ell && l.title))), `${lang} @${w}: tab Bảng xếp hạng một dòng, không tràn ${JSON.stringify(lb.labs.filter((l) => !l.one || !l.in || l.cut))}`);
    ok(await noHScroll(p), `${lang} @${w}: không cuộn ngang`);
    await p.context().close();
  }

  // 3. Lịch sử đấu: lý do kết thúc thấy được
  const a = await user('vi', 'nowrap_aaaaaaaaaaaaaaaa', 390);
  const b = await user('vi', 'nowrap_b', 390);
  const send = (p, m) => p.evaluate((x) => window.CaroOnline.send(x), m);
  const room = (p) => p.evaluate(() => window.CaroOnline.state.room);
  await send(a, { t: 'quickMatch', timeLimit: -1 }); await send(b, { t: 'quickMatch', timeLimit: -1 });
  let r = null;
  for (let i = 0; i < 40 && !(r && r.players.length === 2); i++) { await sleep(200); r = await room(a); }
  const first = r.actor === await a.evaluate(() => window.CaroOnline.state.me.id) ? a : b;
  const second = first === a ? b : a;
  await send(first, { t: 'move', x: 0, y: 0 }); await sleep(300);
  await send(second, { t: 'move', x: 5, y: 5 }); await sleep(300);
  await send(second, { t: 'resign' }); await sleep(800);
  for (const w of [360, 390]) {
    await a.setViewportSize({ width: w, height: 800 });
    await a.evaluate(() => window.CaroHistory.open()); await sleep(800);
    const h = await a.evaluate(() => {
      const s = document.querySelector('#history-list li .pn small');
      if (!s) return null;
      return { txt: s.textContent, cut: s.scrollWidth > s.clientWidth + 0.5, right: s.getBoundingClientRect().right <= innerWidth };
    });
    ok(h && /đầu hàng/.test(h.txt) && !h.cut && h.right, `@${w}: Lịch sử đấu – lý do "đầu hàng" thấy đủ ${JSON.stringify(h)}`);
    if (w === 390) await a.locator('#history-list li').first().screenshot({ path: require('path').join(process.env.E2E_OUT || require('os').tmpdir(), 'nowrap-history-390.png') });
    ok(await noHScroll(a), `@${w}: Lịch sử đấu không cuộn ngang`);
    await a.evaluate(() => window.CaroOnline.closeDlg('history'));
  }

  // 4. CLS khi mở Trang chủ (bản gộp)
  for (const [w, hgt] of [[390, 844], [1280, 800]]) {
    const c = await browser.newContext({ viewport: { width: w, height: hgt }, serviceWorkers: 'block' });
    await c.addInitScript(() => {
      localStorage.setItem('caro.lang', 'vi');
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(`cls@${w}: ${e.message}`));
    await gotoRetry(p, URL); await sleep(2500);
    const v = await p.evaluate(() => ({ cls: window.__cls, bundle: !!window.CARO_PACKS }));
    ok(v.bundle && v.cls < 0.05, `Trang chủ @${w}: CLS ${v.cls.toFixed(3)} < 0,05 (bản gộp)`);
    // 5. Số phiên bản cuối Cài đặt (không có Service Worker: đọc tên CACHE trong sw.js của bản gộp)
    if (w === 390) {
      await p.evaluate(() => window.CaroShell.open('settings')); await sleep(800);
      const ver = await p.evaluate(() => document.getElementById('app-ver').textContent);
      ok(/v\d+/.test(ver) && !/-b/.test(ver), `Cài đặt: hiện số phiên bản ở bản gộp ("${ver}")`);
    }
    await c.close();
  }

  // 6. Thanh tab dính của trang giải Offline có bóng đổ
  await a.setViewportSize({ width: 390, height: 844 });
  await a.evaluate(() => window.CaroTourKit.acts.otNew()); await sleep(300);
  await pickTpl(a, 'premier_league'); await sleep(500);
  await a.click('[data-act="otTplTeams"]').catch(() => {}); await sleep(300); // đội mẫu để bắt đầu được
  await a.click('#otf button.primary.wide'); await sleep(1200);
  await a.evaluate(() => window.CaroTourKit.acts.otStart && window.CaroTourKit.acts.otStart()); await sleep(1200);
  const sh = await a.evaluate(() => { const t = document.querySelector('.ot-tabs'); return t && getComputedStyle(t).boxShadow; });
  ok(sh && sh !== 'none', `trang giải Offline: thanh tab dính có bóng đổ (${sh})`);
  await a.evaluate(() => { const t = document.querySelector('.ot-tabs'); let s = t.parentElement; while (s && s.scrollHeight <= s.clientHeight) s = s.parentElement; (s || document.scrollingElement).scrollTop = 400; });
  await sleep(300);
  for (const th of ['dark', 'light']) {
    await a.evaluate((t) => document.documentElement.setAttribute('data-theme', t), th); await sleep(150);
    await a.screenshot({ path: require('path').join(process.env.E2E_OUT || require('os').tmpdir(), `nowrap-ot-tabs-${th}-390.png`) });
  }

  // 7. Phân tích ván chưa kết thúc: đầu trang ghi "Chưa kết thúc"; lúc nạp Rapfi hiện "Đang nạp máy phân tích…"
  //    (không đứng "0%") – giữ Rapfi ở trạng thái đang nạp bằng ready() không bao giờ xong
  {
    const p = await page(390, 'vi');
    const can = await p.evaluate(() => !!(window.CaroRapfiAn && window.CaroRapfiAn.handles('free')));
    await p.evaluate(() => { if (window.CaroRapfi) window.CaroRapfi.ready = () => new Promise(() => {}); });
    await p.evaluate(() => window.CaroApp.openReplay({ local: true, x: 'An', o: 'Bình', winner: null, rule: 'free', moves: [[0, 0], [1, 1], [0, 1], [2, 2], [0, 2], [3, 3]] }));
    await sleep(300);
    await p.evaluate(() => { for (let i = 0; i < 6; i++) document.getElementById('rp-next').click(); }); // tua tới cuối ván
    await sleep(200);
    const sc = await p.evaluate(() => document.getElementById('score').textContent);
    ok(/Chưa kết thúc/.test(sc) && !/thắng/.test(sc), `xem lại ván chưa xong: "${sc}"`);
    if (can) {
      p.evaluate(() => window.CaroStudy.analyze()).catch(() => {});
      let txt = '';
      for (let i = 0; i < 100 && !/Đang nạp máy phân tích/.test(txt); i++) { await sleep(150); txt = await p.evaluate(() => (document.getElementById('an-panel') || {}).textContent || ''); }
      ok(/Đang nạp máy phân tích/.test(txt) && !/ 0%/.test(txt), 'phân tích: lúc nạp Rapfi hiện "Đang nạp máy phân tích…", không đứng 0%');
      await p.screenshot({ path: require('path').join(process.env.E2E_OUT || require('os').tmpdir(), 'nowrap-an-loading-390.png') });
    } else console.log('     (trình duyệt không chạy được Rapfi – bỏ qua bước nạp máy phân tích)');
    await p.context().close();
  }

  // 8. Người mới: nút lớn "Chơi với máy" (home-hero.js) – 1 chạm vào ván với máy; ẩn sau ván đầu / khi bấm ✕.
  //    Trình duyệt tự động chỉ thấy thẻ khi đặt caro.heroE2E (các bài thử khác giữ bố cục cũ).
  {
    const plain = await page(390, 'vi');
    ok(await plain.evaluate(() => document.getElementById('home-hero').hidden), 'trình duyệt tự động (không đặt caro.heroE2E): không hiện thẻ người mới');
    await plain.context().close();
    for (const lang of LANGS) for (const w of [360, 390]) {
      const p = await page(w, lang, { 'caro.heroE2E': '1', 'caro.theme': 'light' });
      const g = await p.evaluate(() => {
        const h = document.getElementById('home-hero'), b = h.querySelector('[data-hero-go]'), s = b && b.querySelector('span');
        const r = b && b.getBoundingClientRect();
        return { shown: !h.hidden && !!b, one: !!s && s.getBoundingClientRect().height < parseFloat(getComputedStyle(s).fontSize) * 2, inView: !!r && r.left >= 0 && r.right <= innerWidth && r.top < innerHeight, cut: !!s && s.scrollWidth > s.clientWidth + 0.5,
          about: !!document.querySelector('.home-foot .home-about[data-i18n="home_about"]') && !!document.querySelector('.home-foot .home-credit') };
      });
      ok(g.shown && g.one && g.inView && !g.cut && g.about, `${lang} @${w}: thẻ người mới – nút "Chơi với máy" một dòng, thấy ngay, chân trang còn giới thiệu + đơn vị ${JSON.stringify(g)}`);
      ok(await noHScroll(p), `${lang} @${w}: thẻ người mới không gây cuộn ngang`);
      if (w === 390 && lang === 'vi') await p.screenshot({ path: require('path').join(process.env.E2E_OUT || require('os').tmpdir(), 'nowrap-hero-vi-390.png') });
      if (lang === 'vi' && w === 390) {
        // 1 chạm: vào ván với máy mức dễ, chưa có nước nào
        await p.click('[data-hero-go]'); await sleep(500);
        const L = await p.evaluate(() => ({ ...window.CaroApp.local, shell: window.CaroShell.visible }));
        ok(L.mode === 'ai' && L.bot === 'ti' && L.moves === 0 && !L.shell, '1 chạm "Chơi với máy": vào ngay ván với Anh Độ (mức dễ) ' + JSON.stringify(L));
        // xong ván đầu → thôi hiện (cả khi tải lại)
        await p.evaluate(() => window.dispatchEvent(new CustomEvent('caro:gameover', { detail: { mode: 'ai' } })));
        await p.evaluate(() => window.CaroShell.go('home')); await sleep(300);
        ok(await p.evaluate(() => document.getElementById('home-hero').hidden), 'xong ván đầu: thẻ người mới ẩn');
        await p.reload(); await sleep(1200);
        ok(await p.evaluate(() => document.getElementById('home-hero').hidden), 'tải lại sau ván đầu: thẻ vẫn ẩn');
      }
      if (lang === 'en' && w === 360) {
        await p.click('[data-hero-x]'); await sleep(200);
        ok(await p.evaluate(() => document.getElementById('home-hero').hidden), 'bấm ✕: thẻ người mới ẩn');
        await p.reload(); await sleep(1200);
        ok(await p.evaluate(() => document.getElementById('home-hero').hidden), 'tải lại sau khi ẩn: thẻ vẫn ẩn');
      }
      await p.context().close();
    }
    // Người mới thật (không phải trình duyệt tự động): chỉ MỘT thẻ chào – thẻ "Bạn chơi giỏi cỡ nào?" trước, nút lớn ẩn tới
    // khi trả lời; trả lời xong nút lớn mở đúng nhân vật máy của trình độ đã chọn và gợi ý ghi tên nhân vật đó (4 ngôn ngữ).
    for (const lang of LANGS) {
      const c = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
      await c.addInitScript((l) => { localStorage.setItem('caro.lang', l); Object.defineProperty(navigator, 'webdriver', { get: () => false }); }, lang);
      const p = await c.newPage();
      p.on('pageerror', (e) => errs.push(`${lang} welcome: ${e.message}`));
      await gotoRetry(p, URL); await sleep(1200);
      const st = await p.evaluate(() => ({ welcome: !document.getElementById('welcome-card').hidden, hero: !document.getElementById('home-hero').hidden }));
      ok(st.welcome && !st.hero, `${lang}: người mới chỉ thấy một thẻ chào (trình độ), nút lớn chờ ${JSON.stringify(st)}`);
      await p.click('#welcome-card [data-level="good"]'); await sleep(300);
      const h = await p.evaluate(() => ({ hero: !document.getElementById('home-hero').hidden, hint: (document.querySelector('#home-hero .hint') || {}).textContent || '', name: window.I18N.t('bot_mai') }));
      ok(h.hero && h.hint.includes(h.name) && !/\{\w+\}|undefined|NaN/.test(h.hint), `${lang}: trả lời "chơi giỏi" → nút lớn hiện, gợi ý ghi đúng nhân vật ${JSON.stringify(h)}`);
      await p.click('[data-hero-go]'); await sleep(400);
      const L = await p.evaluate(() => window.CaroApp.local);
      ok(L.mode === 'ai' && L.bot === 'mai', `${lang}: nút lớn mở đúng nhân vật của trình độ đã chọn ${JSON.stringify(L)}`);
      await c.close();
    }
  }

  ok(!errs.length, 'không lỗi JS ở các trang thử' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await finish();
})();
