/*
 * E2E connector MCP (server/src/mcp/): widget bàn cờ chạy trong một "host" giả lập Claude – trang cha nhúng widget vào
 * iframe cô lập (sandbox, srcdoc) và nói chuyện bằng giao thức MCP Apps (postMessage JSON-RPC: ui/initialize,
 * ui/notifications/tool-input / tool-result, tools/call, ui/update-model-context, ui/open-link). Lệnh tools/call được
 * chuyển thật tới /mcp của máy chủ chạy đầy đủ (server.js → web.js → mcp/) qua client MCP chính thức.
 * Kiểm: widget bắt tay được, vẽ kết quả tool, chạm ô → gọi play_caro → máy đáp; đi lại; ván mới; chữ theo ngôn ngữ của
 * host (vi); bài đố: chạm sai / xem lời giải; báo thế cờ cho Claude; mở link game đầy đủ; không lỗi JS; vừa 390 px.
 * Chạy: node caro/tests/e2e/mcp-widget.e2e.js
 */
'use strict';
const { setup, sleep } = require('./helpers');
const W = require('../../../server/src/mcp/widget.js');
const { Client, StreamableHTTPClientTransport } = require('../../../server/node_modules/@modelcontextprotocol/client');

const PORT = 18000 + Math.floor(Math.random() * 1000);

// Trang host giả: chạy trong trang cha, trả lời widget; tools/call gọi về Node (window.mcpCall do Playwright gắn)
function hostScript(locale) {
  return `
  window.log = { calls: [], ctx: [], links: [] };
  const f = document.getElementById('w');
  const send = (m) => f.contentWindow.postMessage(m, '*');
  window.addEventListener('message', async (e) => {
    if (e.source !== f.contentWindow) return;
    const m = e.data || {};
    if (m.method === 'ui/initialize') {
      send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2026-01-26', hostInfo: { name: 'fake-claude', version: '1' },
        hostCapabilities: { serverTools: {}, openLinks: {}, updateModelContext: { text: {} } },
        hostContext: { theme: 'light', locale: '${locale}', displayMode: 'inline', platform: 'web' } } });
    } else if (m.method === 'ui/notifications/initialized') {
      send({ jsonrpc: '2.0', method: 'ui/notifications/tool-input', params: { arguments: window.firstArgs } });
      send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: window.firstResult });
    } else if (m.method === 'tools/call') {
      window.log.calls.push(m.params);
      const r = await window.mcpCall(m.params.name, m.params.arguments);
      send({ jsonrpc: '2.0', id: m.id, result: r });
    } else if (m.method === 'ui/update-model-context') {
      window.log.ctx.push(m.params); send({ jsonrpc: '2.0', id: m.id, result: {} });
    } else if (m.method === 'ui/open-link') {
      window.log.links.push(m.params.url); send({ jsonrpc: '2.0', id: m.id, result: {} });
    } else if (m.id != null && m.method) send({ jsonrpc: '2.0', id: m.id, result: {} });
  });`;
}

(async () => {
  const { browser, ok, finish } = await setup(PORT);
  const client = new Client({ name: 'e2e', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp`)));
  const html = W.widgetHtml();
  const errors = [];

  async function openHost(toolName, args, locale, width = 560) {
    const first = await client.callTool({ name: toolName, arguments: args });
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.exposeFunction('mcpCall', (name, a) => client.callTool({ name, arguments: a }));
    await page.setContent(`<!doctype html><body style="margin:0"><iframe id="w" sandbox="allow-scripts" style="width:100%;height:960px;border:0"></iframe>
      <script>window.firstArgs=${JSON.stringify(args)};window.firstResult=${JSON.stringify(first)};${hostScript(locale)}</script></body>`);
    await page.$eval('#w', (f, h) => { f.srcdoc = h; }, html);
    const frame = await (await page.$('#w')).contentFrame();
    await frame.waitForSelector('.board-wrap svg', { timeout: 15000 });
    return { page, frame };
  }
  const movesText = (frame) => frame.$eval('.status .moves', (e) => e.textContent);
  async function clickCell(frame, x, y) {
    const box = await (await frame.$('.board')).boundingBox();
    const vb = await frame.$eval('.board', (s) => s.viewBox.baseVal.width / 10);
    // khung nhìn: lấy từ thuộc tính dữ liệu trong widget không có sẵn → ô (x, y) tính theo tâm khung 13 × 13 của ván mới
    const x0 = -Math.floor(vb / 2), y0 = -Math.floor(vb / 2);
    await frame.page().mouse.click(box.x + ((x - x0 + 0.5) / vb) * box.width, box.y + ((y - y0 + 0.5) / vb) * box.height);
  }

  try {
    // ---- Chơi với máy, tiếng Việt
    const { page, frame } = await openHost('play_caro', { difficulty: 'easy' }, 'vi-VN');
    ok((await frame.$eval('.status .msg', (e) => e.textContent)) === 'Lượt bạn', 'widget bắt tay với host, chữ tiếng Việt theo locale');
    ok((await movesText(frame)) === 'Nước 0', 'ván mới: 0 nước');
    await clickCell(frame, 0, 0);
    await frame.waitForFunction(() => document.querySelector('.status .moves').textContent === 'Nước 2', null, { timeout: 15000 });
    let log = await page.evaluate(() => window.log);
    ok(log.calls.length === 1 && log.calls[0].name === 'play_caro' && JSON.stringify(log.calls[0].arguments.moves) === '[[0,0]]', 'chạm ô → gọi play_caro với nước vừa đi');
    ok(log.ctx.length >= 1 && /moves: \[\[0,0\],/.test(log.ctx[log.ctx.length - 1].content[0].text), 'báo thế cờ cho Claude (update-model-context)');
    ok((await frame.$$('.board .x')).length === 1 && (await frame.$$('.board .o')).length === 1, 'vẽ quân X của người chơi và quân O của máy');
    await clickCell(frame, 0, 0); // ô đã có quân: không gọi gì
    await sleep(300);
    ok((await page.evaluate(() => window.log.calls.length)) === 1, 'chạm ô đã có quân: bỏ qua');
    await frame.click('text=Đi lại');
    ok((await movesText(frame)) === 'Nước 0', 'Đi lại: bỏ nước của người chơi và của máy');
    await frame.click('.seg button:text-is("O")');
    await frame.waitForFunction(() => document.querySelector('.status .moves').textContent === 'Nước 1', null, { timeout: 15000 });
    ok(true, 'chọn cầm O: máy đi trước');
    await frame.click('text=Chơi bản đầy đủ');
    await sleep(200);
    ok((await page.evaluate(() => window.log.links[0])) === require('../../../server/src/site.js').DEFAULT_ORIGIN, 'mở link game đầy đủ qua host');
    await page.close();

    // ---- Bài đố, tiếng Anh, màn hẹp 390 px
    const pz = await openHost('caro_puzzle', { id: 1 }, 'en-US', 390);
    const fr = pz.frame;
    ok(/X to move and win in 2/.test(await fr.$eval('.status .msg', (e) => e.textContent)), 'bài đố: mục tiêu');
    await fr.click('text=Show solution');
    await fr.waitForSelector('text=Solution:', { timeout: 10000 });
    ok(true, 'xem lời giải');
    const wide = await fr.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    ok(wide, 'vừa màn 390 px, không cuộn ngang');
    await fr.click('text=Next puzzle');
    await fr.waitForSelector('text=Puzzle #2', { timeout: 10000 });
    ok(true, 'bài tiếp theo');
    await pz.page.close();

    // ---- Gợi ý
    const sg = await openHost('suggest_caro_move', { moves: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] }, 'ru-RU');
    ok(/Закрывает/.test(await sg.frame.$eval('.note', (e) => e.textContent)), 'gợi ý: lý do theo ngôn ngữ (ru)');
    await sg.frame.click('text=Играть с этой позиции');
    ok((await sg.frame.$eval('.status .msg', (e) => e.textContent)) === 'Ваш ход', 'chơi tiếp từ thế được gợi ý');
    await sg.page.close();

    ok(errors.length === 0, 'không lỗi JS trong widget: ' + errors.slice(0, 3).join(' | '));
  } catch (e) {
    ok(false, 'lỗi: ' + (e && e.stack || e));
  } finally {
    await client.close();
    await finish();
  }
})();
