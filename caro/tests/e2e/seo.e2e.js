/*
 * SEO nền (server/src/seo.js): /?lang=xx (đích của hreflang) hiện đúng ngôn ngữ đó trên trình duyệt mới (không lưu lựa
 * chọn), trang có canonical / hreflang / JSON-LD mà không lỗi CSP; /robots.txt và /sitemap.xml trả đúng loại nội dung.
 *   node caro/tests/e2e/seo.e2e.js
 */
'use strict';
const { setup } = require('./helpers');

(async () => {
  const PORT = 8165;
  const URL = `http://localhost:${PORT}`;
  const { browser, ok, finish } = await setup(PORT);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, locale: 'vi-VN' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push(e.message));
  for (const [l, html] of [['ru', 'ru'], ['en', 'en'], ['zh', 'zh-CN']]) {
    await p.goto(`${URL}/?lang=${l}`);
    await p.waitForFunction(() => window.I18N && window.CaroOnline, null, { timeout: 20000 });
    const st = await p.evaluate(() => ({ lang: window.I18N.lang, html: document.documentElement.lang, saved: localStorage.getItem('caro.lang'),
      canon: (document.querySelector('link[rel=canonical]') || {}).href, alt: document.querySelectorAll('link[rel=alternate][hreflang]').length,
      ld: !!document.querySelector('script[type="application/ld+json"]') }));
    ok(st.lang === l && st.html === html && !st.saved, `?lang=${l}: giao diện ${st.lang} (<html lang="${st.html}">), không lưu lựa chọn`);
    ok(/\/\?lang=/.test(st.canon) && st.alt === 5 && st.ld, `?lang=${l}: canonical ${st.canon}, 5 hreflang, JSON-LD`);
  }
  await p.goto(URL + '/');
  await p.waitForFunction(() => window.I18N, null, { timeout: 20000 });
  ok((await p.evaluate(() => window.I18N.lang)) === 'vi', 'không có ?lang: theo ngôn ngữ máy (vi)');
  ok(!errs.some((e) => /Content Security Policy|Refused/.test(e)), 'không lỗi CSP' + (errs.length ? ': ' + errs.join(' | ') : ''));
  const robots = await fetch(URL + '/robots.txt');
  ok(robots.status === 200 && /Sitemap: .*\/sitemap\.xml/.test(await robots.text()), '/robots.txt trỏ sitemap');
  const sm = await fetch(URL + '/sitemap.xml');
  ok(sm.status === 200 && /xml/.test(sm.headers.get('content-type')) && /<urlset/.test(await sm.text()), '/sitemap.xml');
  await ctx.close();
  await finish();
})().catch((e) => { console.error(e); process.exit(1); });
