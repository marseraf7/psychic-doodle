/*
 * Trang Tường thuật giải đấu (C3) phía HTTP: /?bc=<mã giải | o.<mã giải Offline>> và /broadcast.html trả caro/broadcast.html,
 * kèm thẻ xem trước og (og-meta.js, dữ liệu hub/og.js – cùng luật xem như khách chưa đăng nhập) khi có ?bc=.
 * Cho phép nhúng iframe (frame-ancestors *) như trang nhúng giải (embed.html). web.js gọi makeBroadcastPage(...) một lần.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Og = require('./og-meta.js');

function makeBroadcastPage({ hub, staticDir, csp, origin }) {
  const file = path.join(staticDir, 'broadcast.html');
  let cache = null; // { mtime, text }
  return function serve(req, res, query) {
    fs.stat(file, (err, st) => { try {
      if (err) { res.writeHead(404); return res.end(); }
      if (!cache || cache.mtime !== st.mtimeMs) cache = { mtime: st.mtimeMs, text: fs.readFileSync(file, 'utf8') };
      let html = cache.text, og = null;
      try { og = query && query.get('bc') && typeof hub.ogInfo === 'function' ? hub.ogInfo(query) : null; } catch (e) { og = null; }
      if (og) html = Og.inject(html, { ...og, lang: Og.pickLang(query, req.headers['accept-language']), base: origin(req) });
      const body = Buffer.from(html);
      res.setHeader('content-security-policy', csp.replace("frame-ancestors 'none'", 'frame-ancestors *'));
      res.removeHeader('x-frame-options');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.length, 'cache-control': og && !process.env.PUBLIC_URL ? 'private, no-store' : 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (e) { console.error('[web] trang tường thuật lỗi', e); if (!res.headersSent) { res.writeHead(500); res.end(); } } });
  };
}

module.exports = { makeBroadcastPage };
