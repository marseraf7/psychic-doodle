/*
 * Nguồn người chơi (src-track.js → hello, hub/sources.js, src-admin.js): khách mở link ?ref= lần đầu → máy chủ ghi nguồn
 * web + ref; quản trị viên thấy mục "Nguồn người chơi" ở tab Xem thêm (người thường không thấy), bảng có nguồn / người mới /
 * D1 / D7 / ván mỗi người, đủ 4 ngôn ngữ, 0 lỗi hiển thị ở 390 px.
 *   node caro/tests/e2e/src-admin.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers');
const { audit } = require('./ui-audit');

(async () => {
  const PORT = 8164;
  const { app, browser, user, ok, finish } = await setup(PORT);
  // Khách mới mở link có ?ref=
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  const g = await ctx.newPage();
  await g.goto(`http://localhost:${PORT}/?ref=Zalo_OA`);
  await g.waitForFunction(() => window.CaroOnline && window.CaroOnline.state.me, null, { timeout: 20000 });
  const gid = await g.evaluate(() => window.CaroOnline.state.me.id);
  ok(JSON.stringify(app.store.srcFirst(gid)) === JSON.stringify({ day: new Date().toISOString().slice(0, 10), src: 'web', ref: 'zalo_oa' }),
    'máy chủ ghi nguồn web + ref của lần mở đầu: ' + JSON.stringify(app.store.srcFirst(gid)));
  ok((await g.evaluate(() => localStorage.getItem('caro.ref'))) === 'zalo_oa', 'lưu ref lần đầu trên máy');
  await ctx.close();

  const boss = await user('vi', 'boss', 390);
  const a = await user('vi', 'src_ann', 390);
  await boss.click('#tabbar [data-tab="more"]');
  await a.click('#tabbar [data-tab="more"]');
  await sleep(400);
  ok(!!(await boss.$('#more-sources')), 'quản trị viên có mục Nguồn người chơi');
  ok(!(await a.$('#more-sources')), 'người thường không có mục này');
  await boss.click('#more-sources');
  await boss.waitForSelector('#src-dlg[open] .src-table', { timeout: 5000 });
  const txt = await boss.evaluate(() => document.getElementById('src-dlg-body').textContent);
  ok(/Người mới/.test(txt) && /D7/.test(txt) && /zalo_oa/.test(txt) && /web/.test(txt), 'bảng: nguồn, người mới, D7, mã giới thiệu');
  ok(!/undefined|NaN|\{n\}/.test(txt), 'không lộ undefined / NaN / {n}');
  ok((await audit(boss, '#src-dlg')).length === 0, 'soát giao diện 390 px: 0 lỗi hiển thị');
  for (const l of ['en', 'ru', 'zh']) {
    await boss.evaluate((x) => window.I18N.setLang(x), l);
    await sleep(500);
    const t = await boss.evaluate(() => document.getElementById('src-dlg-body').textContent);
    ok(!/undefined|NaN|\{n\}/.test(t) && t.length > 50, `${l}: bảng vẽ lại đủ chữ`);
    ok((await audit(boss, '#src-dlg')).length === 0, `${l}: 0 lỗi hiển thị`);
  }
  await finish();
})().catch((e) => { console.error(e); process.exit(1); });
