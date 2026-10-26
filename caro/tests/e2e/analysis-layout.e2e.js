/*
 * Kiểm thử trình duyệt: bố cục bảng Phân tích ván ở mọi cỡ màn hình / mức thu phóng (study.js, style-study.css).
 *   node caro/tests/e2e/analysis-layout.e2e.js
 *  - Máy tính 1920 px ở thu phóng 80 / 90 / 100 / 110 / 125 / 150% (viewport CSS = kích thước màn / mức thu phóng),
 *    laptop 1366×768, 1280×720, 1024×768, máy tính bảng 860×1180 / 1180×820, điện thoại 390×844, 360×740, ngang 844×390.
 *  - Ở nước có nhận xét dài + nút "Tìm nước tốt hơn": không phần nào trong bảng đè lên nhau (nhận xét, nút, danh sách
 *    nước đi, nút điều khiển), không tràn ra ngoài bảng; danh sách nước đi vẫn đủ cao để bấm; nhận xét không bị ép
 *    thành cột hẹp bên cạnh nút.
 */
'use strict';
const { setup } = require('./helpers');

// Ván dài (40 nước, không ai thắng): X và O xếp thưa trên hai hàng, cộng nước 6 bỏ mặc thế ba mở để có nước sai nặng
const GAME = [];
for (let i = 0; i < 20; i++) GAME.push([i * 3 - 30, 0], [i * 3 - 30, 6]);
GAME.splice(0, 7, [0, 0], [0, 5], [1, 0], [1, 5], [2, 0], [5, 5], [9, 9]);

const SIZES = [
  ['1920@80%', 2400, 1050], ['1920@90%', 2133, 933], ['1920@100%', 1920, 840], ['1920@110%', 1745, 764],
  ['1920@125%', 1536, 672], ['1920@150%', 1280, 560], ['1366×768', 1366, 657], ['1280×720', 1280, 609],
  ['1024×768', 1024, 657], ['860×1180', 860, 1180], ['1180×820', 1180, 820], ['390×844', 390, 844],
  ['360×740', 360, 740], ['844×390', 844, 390],
];

(async () => {
  const port = 8136;
  const { browser, ok, shot, sleep, finish } = await setup(port);
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 840 } });
  await ctx.addInitScript(() => { window.CARO_NO_RAPFI = true; });
  await ctx.addInitScript((g) => {
    localStorage.setItem('caro.lang', 'vi');
    localStorage.setItem('caro.v1', JSON.stringify({ mode: 'pvp', human: 1, bot: 'mai', moves: g }));
  }, GAME);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://localhost:${port}/`);
  await sleep(800);
  await p.evaluate(() => window.CaroApp.toBoard());
  await p.click('#banner-analyze').catch(() => p.evaluate(() => document.getElementById('banner-analyze').click()));
  await p.waitForSelector('.an-acc', { timeout: 15000 });
  await p.waitForFunction(() => !document.getElementById('an-refine'), null, { timeout: 60000 });

  for (const [name, w, h] of SIZES) {
    await p.setViewportSize({ width: w, height: h });
    await sleep(250);
    // Nước có nhận xét dài nhất + nút: ưu tiên nước có "Tìm nước tốt hơn"
    await p.evaluate(() => {
      const mv = [...document.querySelectorAll('.an-mv[data-i]')];
      for (const b of mv) { b.click(); if (document.querySelector('#an-now [data-better], #an-now [data-retry]')) return; }
    });
    await sleep(200);
    const r = await p.evaluate(() => {
      const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return b.width && b.height ? { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height } : null; };
      const hit = (a, b) => a && b && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
      const panel = box(document.getElementById('an-panel'));
      const body = document.getElementById('an-body');
      const bodyBox = box(body);
      const nav = box(document.getElementById('an-nav'));
      const now = document.getElementById('an-now');
      const parts = [...now.children].map((c) => ({ tag: c.className || c.tagName, box: box(c) })).filter((c) => c.box);
      const issues = [];
      // Phần nhìn thấy của nhận xét (trong vùng cuộn của bảng) không được đè lên nút điều khiển / ra ngoài bảng
      for (const c of parts) {
        // Vùng bảng cuộn được thì phần dưới mép là cuộn tới được, không phải tràn
        const scrolls = /auto|scroll/.test(getComputedStyle(body).overflowY);
        if (!scrolls && c.box.t < bodyBox.b && c.box.b > bodyBox.b + 1) issues.push(`${c.tag} tràn khỏi vùng bảng (${Math.round(c.box.b)} > ${Math.round(bodyBox.b)})`);
        // Phần nhìn thấy = phần nằm trong vùng bảng (vùng cuộn cắt phần còn lại)
        const seen = scrolls ? { ...c.box, t: Math.max(c.box.t, bodyBox.t), b: Math.min(c.box.b, bodyBox.b) } : c.box;
        if (nav && seen.b > seen.t && hit(seen, nav)) issues.push(`${c.tag} đè nút điều khiển`);
        if (c.box.r > panel.r + 1 || c.box.l < panel.l - 1) issues.push(`${c.tag} tràn ngang`);
      }
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (hit(parts[i].box, parts[j].box)) issues.push(`${parts[i].tag} đè ${parts[j].tag}`);
      if (nav && bodyBox.b > nav.t + 1) issues.push('vùng bảng đè nút điều khiển');
      const text = now.querySelector(':scope > span:nth-child(2)');
      const tw = text ? box(text).w : 0;
      if (text && tw < 0.6 * bodyBox.w) issues.push(`nhận xét bị ép hẹp (${Math.round(tw)} / ${Math.round(bodyBox.w)} px)`);
      const moves = box(document.getElementById('an-moves'));
      if (!moves || moves.h < 36) issues.push(`danh sách nước đi quá thấp (${moves ? Math.round(moves.h) : 0} px)`);
      const scrollable = body.scrollHeight > body.clientHeight + 1 ? getComputedStyle(body).overflowY : 'vừa';
      if (body.scrollHeight > body.clientHeight + 1 && !/auto|scroll/.test(scrollable)) issues.push('nội dung dài hơn bảng mà không cuộn được');
      return { issues, better: !!now.querySelector('[data-better],[data-retry]'), moves: moves && Math.round(moves.h), scroll: scrollable };
    });
    ok(!r.issues.length && r.better, `${name} (${w}×${h}): bảng phân tích không chữ / nút nào đè nhau – ` + JSON.stringify(r));
    await shot(p, `analysis-layout-${name.replace(/[^\w]+/g, '-')}.png`);
  }
  ok(!errors.length, 'không có lỗi JS' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
  await finish();
})();
