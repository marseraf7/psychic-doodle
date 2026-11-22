// SEO nền (seo.js, web.js serveIndex, hub/og.js sitemapPaths): canonical, hreflang, og / twitter / JSON-LD trang chủ,
// robots.txt, sitemap.xml (chỉ thứ khách xem được), CSP giữ nguyên, bản tĩnh có canonical về tên miền chính.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Seo = require('../src/seo.js');
const Site = require('../src/site.js');
const { makeHandler, CSP } = require('../src/web.js');
const { Store } = require('../src/store.js');
const { boot, account } = require('./phaseb-client.js');

const PAGE = '<!doctype html>\n<html lang="vi">\n<head>\n  <meta name="description" content="mặc định">\n  <title>Caro x Gomoku</title>\n  <link rel="canonical" href="https://x/">\n</head><body></body></html>';
const q = (s) => new URLSearchParams(s);

function get(handle, url, headers = {}) {
  return new Promise((resolve) => {
    const res = {
      headers: {}, status: 0, chunks: [],
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, removeHeader(k) { delete this.headers[k.toLowerCase()]; },
      writeHead(s, h) { this.status = s; for (const [k, v] of Object.entries(h || {})) this.headers[k.toLowerCase()] = v; },
      end(b) { resolve({ status: this.status, headers: this.headers, body: b ? Buffer.from(b) : Buffer.alloc(0) }); },
    };
    handle({ method: 'GET', url, headers: { host: 'mirror.test', ...headers }, socket: { remoteAddress: '127.0.0.1' }, on() {} }, res);
  });
}

test('seo.inject: trang chủ – canonical về tên miền chính, hreflang 4 ngôn ngữ + x-default, og / twitter, JSON-LD hợp lệ', () => {
  const base = Site.canonicalOrigin();
  const html = Seo.inject(PAGE, { query: q(''), og: null });
  assert.strictEqual((html.match(/rel="canonical"/g) || []).length, 1, 'thay canonical tĩnh, không thêm thẻ thứ hai');
  assert.ok(html.includes(`<link rel="canonical" href="${base}/">`));
  for (const h of ['vi', 'en', 'ru', 'zh-Hans']) assert.ok(html.includes(`hreflang="${h}" href="${base}/?lang=${h === 'zh-Hans' ? 'zh' : h}"`), h);
  assert.ok(html.includes(`hreflang="x-default" href="${base}/"`));
  assert.match(html, /property="og:title" content="Caro x Gomoku"/);
  assert.match(html, /property="og:image" content="[^"]+\/api\/og\/card\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  const ld = JSON.parse(/<script type="application\/ld\+json">([^<]*)<\/script>/.exec(html)[1]);
  assert.deepStrictEqual(ld['@type'], ['WebApplication', 'VideoGame']);
  assert.strictEqual(ld.name, 'Caro x Gomoku');
  assert.deepStrictEqual(ld.inLanguage, ['vi', 'en', 'ru', 'zh-Hans']);
  assert.strictEqual(ld.offers.price, '0');
  assert.strictEqual(ld.isAccessibleForFree, true);
  assert.ok(html.indexOf('application/ld+json') < html.indexOf('</head>'), 'trong <head>');
  // ?lang=ru: canonical tự trỏ chính nó, <html lang>, mô tả tiếng Nga
  const ru = Seo.inject(PAGE, { query: q('lang=ru&utm_source=x'), og: null });
  assert.ok(ru.includes(`<link rel="canonical" href="${base}/?lang=ru">`), 'bỏ tham số lạ, giữ ?lang');
  assert.match(ru, /<html lang="ru">/);
  assert.match(ru, /<meta name="description" content="Играйте/);
  assert.match(Seo.inject(PAGE, { query: q('lang=zh'), og: null }), /<html lang="zh-CN">/);
  assert.strictEqual(Seo.queryLang(q('lang=xx')), null);
  assert.strictEqual(Seo.queryLang(null), null);
  // Link chia sẻ không xem được (mã sai): chỉ canonical về trang chủ, không og / JSON-LD
  const dead = Seo.inject(PAGE, { query: q('replay=nope'), og: null });
  assert.ok(dead.includes(`<link rel="canonical" href="${base}/">`) && !dead.includes('og:image') && !dead.includes('ld+json'));
  // Cấu trúc sẵn cho ngôn ngữ sau này
  for (const l of ['ja', 'ko', 'cs', 'zh-Hant']) assert.ok(Seo.HREFLANG[l], l);
});

test('seo.inject: link chia sẻ – canonical theo nội dung, không thêm JSON-LD / og trùng; thoát HTML', () => {
  const base = Site.canonicalOrigin();
  const html = Seo.inject(PAGE, { query: q('t=abc&lang=en'), og: { url: '/?t=abc"<' } });
  assert.ok(html.includes(`<link rel="canonical" href="${base}/?t=abc&quot;&lt;&amp;lang=en">`));
  assert.ok(html.includes(`hreflang="ru" href="${base}/?t=abc&quot;&lt;&amp;lang=ru"`));
  assert.ok(!html.includes('ld+json') && !html.includes('og:title'), 'og do og-meta.js lo');
  assert.match(html, /<meta name="description" content="mặc định">/, 'mô tả của link do og-meta.js');
  const evil = Seo.headTags({ base: 'https://a', path: '/', lang: null, home: true });
  assert.ok(!/<\/script><script/.test(evil.replace(/<script type="application\/ld\+json">/, '').replace(/<\/script>$/, 'x')));
});

test('robots.txt + sitemap.xml: cho mọi máy, trỏ sitemap; sitemap có trang chủ + ngôn ngữ + trang tĩnh, lọc đường dẫn, có trần', () => {
  const base = Site.canonicalOrigin();
  assert.match(Seo.robotsTxt(), /^User-agent: \*\nAllow: \/\n/);
  assert.ok(Seo.robotsTxt().includes(`Sitemap: ${base}/sitemap.xml`));
  const xml = Seo.sitemapXml(['/?t=a', '/?t=a', 'https://evil/', '/x', '/?u=b&c=<']);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.ok(xml.includes(`<loc>${base}/</loc>`) && xml.includes(`<loc>${base}/?lang=ru</loc>`) && xml.includes(`<loc>${base}/privacy.html</loc>`));
  assert.strictEqual((xml.match(/<loc>[^<]*\?t=a<\/loc>/g) || []).length, 1, 'bỏ trùng');
  assert.ok(!xml.includes('evil') && !xml.includes(`${base}/x<`), 'chỉ đường dẫn /?…');
  assert.ok(xml.includes('?u=b&amp;c=&lt;'), 'thoát XML');
  assert.match(xml, /xhtml:link rel="alternate" hreflang="x-default"/);
  const many = Seo.sitemapXml(Array.from({ length: 5000 }, (_, i) => '/?u=p' + i));
  assert.strictEqual((many.match(/<url>/g) || []).length, Seo.MAX_URLS);
});

test('web.js: trang chính luôn có thẻ SEO (cả khi không gộp mã), CSP giữ nguyên; /robots.txt, /sitemap.xml có bộ nhớ đệm', async () => {
  let calls = 0;
  const hub = { ogInfo: () => null, sitemapPaths: () => { calls++; return ['/?t=pub1', '/?u=top']; } };
  const handle = makeHandler({ store: new Store(null), hub, bundle: false });
  const home = await get(handle, '/?ref=fb');
  assert.strictEqual(home.status, 200);
  const html = home.body.toString();
  assert.ok(html.includes(`<link rel="canonical" href="${Site.canonicalOrigin()}/">`), 'bản sao / tên phụ: canonical về tên miền chính');
  assert.match(html, /application\/ld\+json/);
  assert.strictEqual(home.headers['content-security-policy'], CSP, 'CSP không đổi');
  assert.match(CSP, /script-src 'self'/);
  const r = await get(handle, '/robots.txt');
  assert.strictEqual(r.headers['content-type'], 'text/plain; charset=utf-8');
  const sm = await get(handle, '/sitemap.xml');
  assert.strictEqual(sm.status, 200);
  assert.strictEqual(sm.headers['content-type'], 'application/xml; charset=utf-8');
  assert.match(sm.body.toString(), /\?t=pub1/);
  await get(handle, '/sitemap.xml');
  assert.strictEqual(calls, 1, 'dựng một lần, giữ 1 giờ');
  const bad = makeHandler({ store: new Store(null), hub: { sitemapPaths: () => { throw new Error('x'); } }, bundle: false });
  assert.strictEqual((await get(bad, '/sitemap.xml')).status, 200, 'lỗi dữ liệu: vẫn có sitemap tối thiểu');
});

test('hub sitemapPaths: chỉ giải công khai (không "chỉ link" / riêng tư), CLB đã duyệt, hồ sơ đầu bảng', async () => {
  const { app, url } = await boot();
  try {
    const hub = app.hub;
    await account(app, url, 'sm_top');
    const u = app.store.byUsername.get('sm_top');
    u.rating = 1600; u.stats.wins = 5;
    hub.tours.set('pub1', { id: 'pub1', name: 'A', access: 'public', status: 'running', players: [], creator: 'x', startsAt: 2 });
    hub.tours.set('lnk1', { id: 'lnk1', name: 'B', access: 'link', status: 'open', players: [], creator: 'x' });
    hub.tours.set('prv1', { id: 'prv1', name: 'C', access: 'private', status: 'open', players: [], creator: 'x' });
    hub.tours.set('drf1', { id: 'drf1', name: 'D', access: 'public', status: 'draft', players: [], creator: 'x' });
    hub.clubs.set('c1', { id: 'c1', name: 'CLB', status: 'approved', members: {}, join: 'open' });
    hub.clubs.set('c2', { id: 'c2', name: 'CLB2', status: 'pending', members: {}, join: 'open' });
    const paths = hub.sitemapPaths();
    assert.ok(paths.includes('/?t=pub1') && paths.includes('/?bc=pub1'), 'giải công khai đang đấu + tường thuật');
    for (const p of ['/?t=lnk1', '/?t=prv1', '/?t=drf1', '/?club=c2']) assert.ok(!paths.includes(p), p);
    assert.ok(paths.includes('/?club=c1'));
    assert.strictEqual(hub.sitemapPaths(1).length, 1);
  } finally { await app.stop(); }
});

test('bản tĩnh (GitHub Pages): index.html có canonical về tên miền chính, không noindex', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'caro', 'index.html'), 'utf8');
  assert.ok(html.includes(`<link rel="canonical" href="${Site.DEFAULT_ORIGIN}/">`));
  assert.ok(!/name="robots"[^>]*noindex/.test(html));
});
