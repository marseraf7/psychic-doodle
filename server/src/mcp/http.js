/*
 * Connector MCP – lớp HTTP (Node http → Request / Response chuẩn web của SDK MCP) kèm các lớp chặn cho một điểm vào
 * công khai, không đăng nhập:
 *  - Origin (chống DNS rebinding theo đặc tả MCP Streamable HTTP): không có Origin (máy chủ gọi máy chủ, như Claude) thì cho
 *    qua; có thì chỉ nhận Claude, chính tên miền này, localhost (MCP Inspector khi thử) và CARO_MCP_ORIGINS.
 *  - CORS cho các Origin được nhận; OPTIONS trả 204.
 *  - Giới hạn theo IP (cửa sổ 1 phút, CARO_MCP_RATE, mặc định 240 – rộng vì mọi người dùng Claude đi chung vài IP của
 *    Anthropic; việc tốn CPU đã bị chặn riêng bằng hàng đợi máy cờ ở think.js).
 *  - Thân yêu cầu tối đa 64 KB (400 nước chỉ ~4 KB).
 *  - Lỗi luôn kèm lời nhắn JSON-RPC đọc được. Không ghi log IP hay nội dung.
 * Trình duyệt mở thẳng /mcp (GET, Accept: text/html) thì chuyển tới trang hướng dẫn /connector.html.
 */
'use strict';

const MAX_BODY = 64 * 1024;
const CLAUDE_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*(claude\.ai|claude\.com|claudemcpcontent\.com)$/i;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i;

function rpcError(res, status, message, extra = {}) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message } });
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra });
  res.end(body);
}

function originAllowed(origin, req) {
  const o = String(origin).replace(/\/+$/, '');
  if (CLAUDE_ORIGIN.test(o) || LOCAL_ORIGIN.test(o)) return true;
  const extras = String(process.env.CARO_MCP_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  if (extras.includes(o)) return true;
  try {
    const u = new URL(o);
    if (process.env.PUBLIC_URL && new URL(process.env.PUBLIC_URL).origin === u.origin) return true;
    return u.host === String(req.headers.host || '');
  } catch (e) { return false; }
}

/** Đọc thân yêu cầu, dừng khi quá giới hạn (trả null). */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0, over = false;
    req.on('data', (c) => {
      if (over) return;
      size += c.length;
      if (size > limit) { over = true; chunks.length = 0; return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(over ? null : Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Bọc handler web chuẩn của SDK (createMcpHandler(...).fetch) thành hàm (req, res) của node:http.
 * opts: { clientIp(req), rate (lần / phút / IP), now() – cho kiểm thử }.
 */
function nodeHandler(fetchHandler, opts = {}) {
  const rate = opts.rate || Number(process.env.CARO_MCP_RATE) || 240;
  const now = opts.now || Date.now;
  const hits = new Map(); // ip -> { n, reset }

  function limited(ip) {
    const t = now();
    let h = hits.get(ip);
    if (!h || h.reset < t) { h = { n: 0, reset: t + 60000 }; hits.set(ip, h); }
    if (hits.size > 10000) for (const [k, v] of hits) if (v.reset < t) hits.delete(k);
    return ++h.n > rate ? Math.ceil((h.reset - t) / 1000) : 0;
  }

  return async function handle(req, res) {
    const origin = req.headers.origin;
    if (origin && !originAllowed(origin, req)) return rpcError(res, 403, `Origin ${origin} is not allowed to use this MCP server.`);
    if (origin) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'origin');
      res.setHeader('access-control-expose-headers', 'mcp-session-id, mcp-protocol-version');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
        'access-control-allow-headers': 'content-type, accept, authorization, mcp-protocol-version, mcp-session-id, last-event-id',
        'access-control-max-age': '86400',
      });
      return res.end();
    }
    if (req.method === 'GET' && /text\/html/.test(String(req.headers.accept || ''))) {
      res.writeHead(302, { location: '/connector.html' });
      return res.end();
    }
    const wait = limited(opts.clientIp ? opts.clientIp(req) : req.socket.remoteAddress);
    if (wait) return rpcError(res, 429, `Too many requests to the Caro MCP server. Please wait ${wait} s and try again.`, { 'retry-after': String(wait) });

    let body;
    if (req.method === 'POST') {
      body = await readBody(req, MAX_BODY).catch(() => null);
      if (body === null) return rpcError(res, 413, `Request body is too large (limit ${MAX_BODY / 1024} KB). A Caro game needs at most 400 moves.`);
    }
    const ac = new AbortController();
    res.on('close', () => { if (!res.writableFinished) ac.abort(); });
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
    const host = /^[a-z0-9.:[\]-]+$/i.test(String(req.headers.host || '')) ? req.headers.host : 'localhost';
    let resp;
    try {
      resp = await fetchHandler(new Request(`http://${host}${req.url}`, { method: req.method, headers, body, signal: ac.signal }));
    } catch (e) {
      if (ac.signal.aborted) return res.destroy();
      return rpcError(res, 500, `The Caro MCP server failed to handle the request (${e && e.message}). Please retry.`);
    }
    const out = {};
    resp.headers.forEach((v, k) => { out[k] = v; });
    res.writeHead(resp.status, out);
    if (!resp.body) return res.end();
    try {
      for await (const chunk of resp.body) res.write(chunk);
      res.end();
    } catch (e) { res.destroy(); }
  };
}

module.exports = { nodeHandler, originAllowed, MAX_BODY };
