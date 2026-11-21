/*
 * API công khai v1 (C4) – phần HTTP: /api/v1/* chỉ GET / HEAD, JSON (ván dạng chữ: text/plain), CORS *, mỗi IP tối đa
 * RATE lần / phút (429 + Retry-After), ETag + 304, lỗi thống nhất { error: mã, message: chữ }.
 * Dữ liệu lấy từ hub (hub/api-v1.js); mô tả OpenAPI 3.1 ở api-v1-openapi.js. web.js gọi makeApiV1(...) một lần.
 *   handle(req, res, url, query) → true nếu đường dẫn thuộc /api/v1 (đã trả lời), false nếu không.
 */
'use strict';
const crypto = require('crypto');
const { openapi } = require('./api-v1-openapi.js');

const RATE = 120; // lần / phút / IP
const MSG = {
  not_found: 'Not found', bad_request: 'Bad request', too_many_requests: 'Too many requests – slow down',
  method_not_allowed: 'Only GET is supported',
};

function makeApiV1({ hub, hit, clientIp, origin }) {
  const hits = new Map(); // ip -> { n, reset }
  let spec = null; // openapi.json (dựng một lần cho mỗi địa chỉ gốc)

  function send(req, res, status, body, type, maxAge) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    const buf = Buffer.from(text);
    const etag = 'W/"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"';
    const head = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'ETag, Retry-After', vary: 'Accept-Encoding' };
    if (status === 200) {
      head.etag = etag;
      head['cache-control'] = 'public, max-age=' + maxAge;
      if (String(req.headers['if-none-match'] || '').split(/\s*,\s*/).includes(etag)) { res.writeHead(304, head); return res.end(); }
    } else head['cache-control'] = 'no-cache';
    res.writeHead(status, { ...head, 'content-type': type, 'content-length': buf.length });
    res.end(req.method === 'HEAD' ? undefined : buf);
  }
  const json = (req, res, status, body, maxAge = 30) => send(req, res, status, body, 'application/json; charset=utf-8', maxAge);
  const fail = (req, res, status, code, extra = {}) => {
    if (extra['retry-after']) res.setHeader('retry-after', extra['retry-after']);
    json(req, res, status, { error: code, message: MSG[code] || code });
  };

  /** [mẫu đường dẫn, hàm → { body } | { text } | null, thời gian giữ (giây)] */
  const ROUTES = [
    [/^\/player\/([^/]+)$/, (m) => hub.v1Player(m[1]), 60],
    [/^\/player\/([^/]+)\/rating-history$/, (m) => hub.v1Ratings(m[1]), 60],
    [/^\/player\/([^/]+)\/games$/, (m, q) => hub.v1Games(m[1], q.get('max')), 30],
    [/^\/game\/([\w-]{6,20})\.txt$/, (m, q, req) => { const t = hub.v1GameText(m[1], origin(req)); return t == null ? null : { text: t }; }, 3600],
    [/^\/game\/([\w-]{6,20})$/, (m) => hub.v1Game(m[1]), 3600],
    [/^\/tournament\/([0-9a-f]{6,20})$/, (m) => hub.v1Tour(m[1]), 10],
    [/^\/tournament\/([0-9a-f]{6,20})\/standings$/, (m) => hub.v1Standings(m[1]), 10],
    [/^\/leaderboard$/, (m, q) => hub.v1Leaderboard(q.get('pool')), 60],
    [/^\/puzzle\/daily$/, (m, q) => hub.v1Puzzle(q.get('date')), 600],
    [/^\/openapi\.json$/, (m, q, req) => (spec && spec.base === origin(req) ? spec.body : (spec = { base: origin(req), body: openapi(origin(req)) }).body), 3600],
  ];

  return function handle(req, res, url, query) {
    if (url !== '/api/v1' && !url.startsWith('/api/v1/')) return false;
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, HEAD', 'access-control-allow-headers': 'If-None-Match', 'access-control-max-age': '86400' });
      res.end();
      return true;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { fail(req, res, 405, 'method_not_allowed'); return true; }
    const wait = hit(hits, clientIp(req), RATE, 60000, Date.now());
    if (wait) { fail(req, res, 429, 'too_many_requests', { 'retry-after': String(wait) }); return true; }
    const sub = url.slice('/api/v1'.length) || '/';
    for (const [re, fn, maxAge] of ROUTES) {
      const m = re.exec(sub);
      if (!m) continue;
      let out;
      try { out = fn(m, query, req); } catch (e) { console.error('[api-v1]', sub, e.message); fail(req, res, 400, 'bad_request'); return true; }
      if (out == null) fail(req, res, 404, 'not_found');
      else if (out.text != null && Object.keys(out).length === 1) send(req, res, 200, out.text, 'text/plain; charset=utf-8', maxAge);
      else json(req, res, 200, out, maxAge);
      return true;
    }
    fail(req, res, 404, 'not_found');
    return true;
  };
}

module.exports = { makeApiV1, RATE };
