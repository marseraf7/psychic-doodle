/*
 * SEO nền (Đợt 0 – docs/laplace-zalo-mini-app-va-seo-20-11-2026.md phần 2; Laplace tinh chỉnh sau):
 *   - inject(html, …): trang chính do máy chủ trả (web.js serveIndex) thêm <link rel="canonical"> về tên miền chính
 *     (site.js canonicalOrigin – cả khi mở bằng tên phụ / bản sao), hreflang cho từng ngôn ngữ (?lang=xx – i18n.js hiểu
 *     tham số này) + x-default; trang chủ thêm og / twitter mặc định và JSON-LD (WebApplication + VideoGame, miễn phí).
 *     ?lang=xx còn đặt <html lang> và mô tả theo ngôn ngữ đó.
 *   - /robots.txt: cho mọi máy tìm kiếm, trỏ sitemap.
 *   - /sitemap.xml: trang chủ (kèm bản từng ngôn ngữ), trang tĩnh, giải / giải Offline / CLB / tường thuật công khai,
 *     hồ sơ kỳ thủ đầu bảng (hub/og.js sitemapPaths – chỉ thứ khách chưa đăng nhập xem được, không gồm giải "chỉ link");
 *     tối đa 2000 địa chỉ, dựng lại mỗi giờ.
 * Ngôn ngữ: danh sách chung caro/langs.js (qua langs.js) – hreflang (zh → zh-Hans, zh-Hant), <html lang>, og:locale.
 * CSP không đổi: JSON-LD là khối dữ liệu (type="application/ld+json"), trình duyệt không chạy.
 */
'use strict';
const Og = require('./og-meta.js');
const Site = require('./site.js');
const Langs = require('./langs.js');

const HREFLANG = Object.fromEntries(Langs.LIST.map((x) => [x.code, x.hreflang]));
const HTML_LANG = Object.fromEntries(Langs.LIST.map((x) => [x.code, x.html]));
const LANGS = Langs.CODES;
const SHOWN = Langs.SHOWN; // hreflang / sitemap / inLanguage: không đưa ngôn ngữ 'hidden' (đang dịch dở) cho máy tìm kiếm
const STATIC_PAGES = ['/privacy.html', '/connector.html', '/api.html'];
// Tham số link chia sẻ (hub/og.js): có mà không xem được (mã sai, riêng tư) → chỉ canonical về trang chủ, không thêm og / JSON-LD
const LINK_PARAMS = ['replay', 'room', 't', 'o', 'club', 'u', 'cls', 'bc'];
const MAX_URLS = 2000;
const SITEMAP_MS = 60 * 60 * 1000;
const esc = Og.escHtml;
const xmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

/** Ngôn ngữ trong ?lang= (đang bật) hoặc null. */
function queryLang(query) {
  const l = query && query.get ? String(query.get('lang') || '') : '';
  return LANGS.includes(l) ? l : null;
}
const withLang = (p, l) => p + (p.includes('?') ? '&' : '?') + 'lang=' + l;

/** Khối thẻ <head>: canonical + hreflang (+ og / twitter / JSON-LD cho trang chủ). */
function headTags({ base, path, lang, home }) {
  const tags = [`<link rel="canonical" href="${esc(base + (lang ? withLang(path, lang) : path))}">`];
  for (const l of SHOWN) tags.push(`<link rel="alternate" hreflang="${HREFLANG[l]}" href="${esc(base + withLang(path, l))}">`);
  tags.push(`<link rel="alternate" hreflang="x-default" href="${esc(base + path)}">`);
  if (home) {
    const L = lang || 'vi';
    const desc = Og.texts(null, L).desc;
    const url = base + (lang ? withLang('/', lang) : '/');
    const loc = Langs.BY[L].og;
    for (const [k, v] of [['og:type', 'website'], ['og:site_name', 'Caro x Gomoku'], ['og:title', 'Caro x Gomoku'], ['og:description', desc],
      ['og:locale', loc], ['og:url', url], ['og:image', base + '/api/og/card.png'], ['og:image:width', '1200'], ['og:image:height', '630']]) {
      tags.push(`<meta property="${k}" content="${esc(v)}">`);
    }
    tags.push('<meta name="twitter:card" content="summary_large_image">');
    const ld = {
      '@context': 'https://schema.org', '@type': ['WebApplication', 'VideoGame'], name: 'Caro x Gomoku',
      alternateName: ['Cờ Caro', 'Gomoku', 'Five in a Row', 'Гомоку', '五子棋', '五目並べ', '오목', 'Piškvorky'], url: base + '/', description: desc,
      inLanguage: SHOWN.map((l) => HREFLANG[l]), applicationCategory: 'GameApplication', genre: ['Board game', 'Strategy'],
      gamePlatform: ['Web browser', 'Android', 'iOS'], operatingSystem: 'Web browser, Android, iOS', playMode: ['SinglePlayer', 'MultiPlayer'],
      isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, image: base + '/api/og/card.png',
    };
    // "<" trong chuỗi JSON không được đóng thẻ <script>
    tags.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  }
  return tags.join('\n  ');
}

/**
 * Trang chính kèm thẻ SEO. og: kết quả hub.ogInfo (link chia sẻ) hoặc null (trang chủ). Thay canonical tĩnh sẵn có trong
 * index.html (dành cho bản GitHub Pages); ?lang=xx: đặt <html lang> + mô tả theo ngôn ngữ (trang chủ).
 */
function inject(html, { query, og }) {
  const base = Site.canonicalOrigin();
  const lang = queryLang(query);
  const home = !og && !LINK_PARAMS.some((k) => query && query.get && query.get(k));
  let out = html.replace(/[ \t]*<link rel="canonical"[^>]*>\r?\n?/g, '');
  out = out.replace('</head>', () => `  ${headTags({ base, path: og ? og.url : '/', lang, home })}\n</head>`);
  if (lang) {
    out = out.replace(/<html lang="[^"]*">/, () => `<html lang="${HTML_LANG[lang]}">`);
    if (!og) out = out.replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${esc(Og.texts(null, lang).desc)}">`);
  }
  return out;
}

function robotsTxt() {
  return ['User-agent: *', 'Allow: /', 'Disallow: /api/migrate/', '', `Sitemap: ${Site.canonicalOrigin()}/sitemap.xml`, ''].join('\n');
}

/** sitemap.xml: paths – đường dẫn công khai từ hub (đã lọc quyền xem). */
function sitemapXml(paths) {
  const base = Site.canonicalOrigin();
  const day = new Date().toISOString().slice(0, 10);
  const alt = (p) => SHOWN.map((l) => `<xhtml:link rel="alternate" hreflang="${HREFLANG[l]}" href="${xmlEsc(base + withLang(p, l))}"/>`)
    .concat(`<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEsc(base + p)}"/>`).join('');
  const urls = [`<url><loc>${xmlEsc(base + '/')}</loc><lastmod>${day}</lastmod><changefreq>daily</changefreq><priority>1.0</priority>${alt('/')}</url>`];
  for (const l of SHOWN) urls.push(`<url><loc>${xmlEsc(base + withLang('/', l))}</loc><changefreq>daily</changefreq><priority>0.9</priority>${alt('/')}</url>`);
  for (const p of STATIC_PAGES) urls.push(`<url><loc>${xmlEsc(base + p)}</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>`);
  const seen = new Set();
  for (const p of paths || []) {
    if (urls.length >= MAX_URLS) break;
    if (typeof p !== 'string' || !p.startsWith('/?') || seen.has(p)) continue;
    seen.add(p);
    urls.push(`<url><loc>${xmlEsc(base + p)}</loc><changefreq>daily</changefreq><priority>0.5</priority></url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
}

/** /robots.txt + /sitemap.xml cho web.js. → true nếu đã trả lời. */
function makeSeo({ hub, now = () => Date.now() }) {
  let cache = null; // { at, base, body }
  return function handle(req, res, url) {
    if (url !== '/robots.txt' && url !== '/sitemap.xml') return false;
    let body, type;
    if (url === '/robots.txt') { body = Buffer.from(robotsTxt()); type = 'text/plain; charset=utf-8'; }
    else {
      const t = now(), base = Site.canonicalOrigin();
      if (!cache || t - cache.at > SITEMAP_MS || cache.base !== base) {
        let paths = [];
        try { paths = typeof hub.sitemapPaths === 'function' ? hub.sitemapPaths(MAX_URLS) : []; } catch (e) { paths = []; }
        cache = { at: t, base, body: Buffer.from(sitemapXml(paths)) };
      }
      body = cache.body; type = 'application/xml; charset=utf-8';
    }
    res.writeHead(200, { 'content-type': type, 'content-length': body.length, 'cache-control': 'public, max-age=3600' });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  };
}

module.exports = { inject, headTags, robotsTxt, sitemapXml, makeSeo, queryLang, LANGS, HREFLANG, MAX_URLS };
