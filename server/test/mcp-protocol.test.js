// Connector MCP (server/src/mcp/): bắt tay giao thức qua Streamable HTTP thật (client chính thức của SDK MCP), danh sách
// tool (title + chú thích readOnlyHint), tài nguyên widget ui://, các lớp chặn HTTP (Origin, CORS, giới hạn IP, thân
// yêu cầu lớn), đường /mcp trong web.js và công tắc CARO_MCP=0.
// Chạy: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { makeMcp, UI_URI } = require('../src/mcp/index.js');
const W = require('../src/mcp/widget.js');
const { originAllowed } = require('../src/mcp/http.js');
const { makeHandler } = require('../src/web.js');
const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client');

const hub = { publicLeaderboard: () => ({ pool: null, players: [] }), publicPlayer: () => null };

async function start(opts = {}) {
  const mcp = makeMcp({ hub, ...opts });
  const srv = http.createServer((req, res) => mcp(req, res));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/mcp`;
  return { url, async stop() { await mcp.close(); await new Promise((r) => srv.close(r)); } };
}

function post(url, body, headers = {}) {
  return fetch(url, {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
  });
}
/** Đọc kết quả JSON-RPC từ thân JSON hoặc luồng SSE (một sự kiện). */
async function rpc(resp) {
  const text = await resp.text();
  const data = text.trim().startsWith('{') ? text : text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).join('');
  return JSON.parse(data);
}

test('MCP: bắt tay + tools/list (title, readOnlyHint, tên ≤ 64) + resources/list và đọc widget', async () => {
  const s = await start();
  const client = new Client({ name: 'test', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(s.url)));
    const info = client.getServerVersion();
    assert.strictEqual(info.name, 'caro-x-gomoku');
    assert.strictEqual(info.title, 'Caro x Gomoku');
    const { tools } = await client.listTools();
    assert.deepStrictEqual(tools.map((t) => t.name).sort(), ['caro_leaderboard', 'caro_player', 'caro_puzzle', 'caro_rules', 'play_caro', 'suggest_caro_move']);
    for (const t of tools) {
      assert.ok(t.name.length <= 64, t.name);
      assert.ok(t.title, `${t.name} có title`);
      assert.strictEqual(t.annotations.readOnlyHint, true, `${t.name} chỉ đọc`);
      assert.ok(t.description.length > 60 && !/\b(always|ignore|must call)\b/i.test(t.description), `${t.name}: mô tả rõ, không kiểu ra lệnh cho mô hình`);
    }
    for (const n of ['play_caro', 'suggest_caro_move', 'caro_puzzle']) {
      const t = tools.find((x) => x.name === n);
      assert.strictEqual(t._meta.ui.resourceUri, UI_URI);
    }
    const { resources } = await client.listResources();
    assert.deepStrictEqual(resources.map((r) => [r.uri, r.mimeType]), [[UI_URI, 'text/html;profile=mcp-app']]);
    const rr = await client.readResource({ uri: UI_URI });
    const c = rr.contents[0];
    assert.match(c.text, /globalThis\.McpExtApps=\{/);
    assert.match(c.text, /CARO_MCP_I18N/);
    assert.strictEqual(c._meta.ui.domain, W.uiDomain('https://caroxo.duckdns.org/mcp'));
    assert.match(c._meta.ui.domain, /^[0-9a-f]{32}\.claudemcpcontent\.com$/);
  } finally { await client.close(); await s.stop(); }
});

test('MCP: client đời 2025 (initialize + tools/list kiểu không phiên) vẫn được phục vụ', async () => {
  const s = await start();
  try {
    const init = await rpc(await post(s.url, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '1' } } }));
    assert.strictEqual(init.result.serverInfo.name, 'caro-x-gomoku');
    assert.ok(init.result.capabilities.tools && init.result.capabilities.resources);
    const list = await rpc(await post(s.url, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'mcp-protocol-version': '2025-06-18' }));
    assert.strictEqual(list.result.tools.length, 6);
    const call = await rpc(await post(s.url, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'caro_rules', arguments: { rule: 'vn' } } }, { 'mcp-protocol-version': '2025-06-18' }));
    assert.match(call.result.content[0].text, /blocked at both ends/);
    const lb = await rpc(await post(s.url, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'caro_leaderboard', arguments: {} } }, { 'mcp-protocol-version': '2025-06-18' }));
    assert.match(lb.result.content[0].text, /\(overall rating\): no ranked players yet\./);
  } finally { await s.stop(); }
});

test('MCP HTTP: Origin lạ bị chặn 403, Origin của Claude được CORS, OPTIONS 204, trình duyệt mở /mcp thì sang trang hướng dẫn', async () => {
  const s = await start();
  try {
    let r = await post(s.url, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { origin: 'https://evil.example' });
    assert.strictEqual(r.status, 403);
    assert.match((await r.json()).error.message, /not allowed/);
    r = await fetch(s.url, { method: 'OPTIONS', headers: { origin: 'https://claude.ai', 'access-control-request-method': 'POST' } });
    assert.strictEqual(r.status, 204);
    assert.strictEqual(r.headers.get('access-control-allow-origin'), 'https://claude.ai');
    assert.match(r.headers.get('access-control-allow-headers'), /mcp-protocol-version/);
    r = await fetch(s.url, { headers: { accept: 'text/html' }, redirect: 'manual' });
    assert.strictEqual(r.status, 302);
    assert.strictEqual(r.headers.get('location'), '/connector.html');
    r = await fetch(s.url, { headers: { accept: 'text/event-stream' } });
    assert.strictEqual(r.status, 405, 'không trạng thái: không có luồng GET');
  } finally { await s.stop(); }
  const req = (origin, host) => ({ headers: { host } });
  assert.ok(originAllowed('https://claude.ai', req()));
  assert.ok(originAllowed('https://abc123.claudemcpcontent.com', req()));
  assert.ok(originAllowed('http://localhost:6274', req()));
  assert.ok(originAllowed('https://caroxo.duckdns.org', req(null, 'caroxo.duckdns.org')));
  assert.ok(!originAllowed('https://claude.ai.evil.com', req()));
  assert.ok(!originAllowed('not a url', req()));
  process.env.CARO_MCP_ORIGINS = 'https://friend.example';
  try { assert.ok(originAllowed('https://friend.example/', req())); } finally { delete process.env.CARO_MCP_ORIGINS; }
});

test('MCP HTTP: giới hạn theo IP trả 429 kèm lời nhắn và Retry-After; thân quá 64 KB trả 413', async () => {
  const s = await start({ rate: 3 });
  try {
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'caro_rules', arguments: {} } };
    const h = { 'mcp-protocol-version': '2025-06-18' };
    for (let i = 0; i < 3; i++) assert.strictEqual((await post(s.url, body, h)).status, 200);
    const r = await post(s.url, body, h);
    assert.strictEqual(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
    assert.match((await r.json()).error.message, /Too many requests.*try again/);
  } finally { await s.stop(); }
  const s2 = await start();
  try {
    const big = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { pad: 'x'.repeat(70 * 1024) } });
    const r = await post(s2.url, big);
    assert.strictEqual(r.status, 413);
    assert.match((await r.json()).error.message, /too large/);
  } finally { await s2.stop(); }
});

test('web.js: /mcp đi tới connector; CARO_MCP=0 thì tắt (404 như đường dẫn lạ)', async () => {
  const run = async () => {
    const srv = http.createServer(makeHandler({ store: {}, hub, bundle: false }));
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    try {
      return await post(`http://127.0.0.1:${srv.address().port}/mcp`, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '1' } } });
    } finally { srv.close(); }
  };
  const on = await run();
  assert.strictEqual(on.status, 200);
  assert.strictEqual((await rpc(on)).result.serverInfo.name, 'caro-x-gomoku');
  process.env.CARO_MCP = '0';
  try {
    assert.strictEqual(makeMcp({ hub }), null);
    const off = await run();
    assert.ok(off.status === 404 || off.status === 405, `tắt thì không phục vụ MCP (được ${off.status})`);
  } finally { delete process.env.CARO_MCP; }
});

test('Widget: một file HTML tự chứa, không tải script ngoài, chuỗi dịch đủ 4 ngôn ngữ cùng khoá và biến', () => {
  const html = W.widgetHtml();
  assert.ok(!/<script[^>]+src=/i.test(html), 'không có <script src> ngoài');
  assert.strictEqual((html.match(/<\/script>/g) || []).length, 3, 'chỉ 3 thẻ đóng script của khung');
  assert.strictEqual(W.widgetHtml(), html, 'dựng một lần, giữ trong bộ nhớ');
  const ctx = {};
  new Function('globalThis', require('fs').readFileSync(require.resolve('../src/mcp/ui/widget-i18n.js'), 'utf8'))(ctx);
  const D = ctx.CARO_MCP_I18N;
  assert.deepStrictEqual(Object.keys(D).sort(), ['en', 'ru', 'vi', 'zh']);
  const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const l of ['vi', 'ru', 'zh']) {
    assert.deepStrictEqual(Object.keys(D[l]).sort(), Object.keys(D.en).sort(), `khoá ${l}`);
    for (const k of Object.keys(D.en)) assert.strictEqual(vars(D[l][k]), vars(D.en[k]), `biến ${l}.${k}`);
  }
  assert.ok(!/hòa|xóa|tùy/.test(JSON.stringify(D.vi)), 'tiếng Việt kiểu dấu cũ');
  assert.strictEqual(W.uiDomain('https://example.com/mcp'), 'c3d80a4ed901ee05b21755a88273b4a4.claudemcpcontent.com', 'đúng ví dụ trong tài liệu Claude');
  process.env.CARO_MCP_URL = 'https://x.test/mcp';
  try { assert.strictEqual(W.serverUrl(), 'https://x.test/mcp'); } finally { delete process.env.CARO_MCP_URL; }
});
