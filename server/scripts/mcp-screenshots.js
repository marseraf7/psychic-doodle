#!/usr/bin/env node
/*
 * Ảnh cho hồ sơ nộp thư mục connector của Claude (docs/claude-directory/):
 *  - biểu tượng: caro/icon.svg → server/src/mcp/ui/icon-128.png (serverInfo.icons, < 10 KB) và docs/claude-directory/icon-512.png
 *  - 5 ảnh chụp widget (PNG, rộng 1120 px, cắt sát phần ứng dụng) từ kết quả THẬT của các tool (gọi qua client MCP).
 * Widget chạy ở chế độ xem thử (CARO_MCP_PREVIEW: không có Claude để bắt tay), biến màu giả lập theo bảng biến của Claude.
 * Chạy: node server/scripts/mcp-screenshots.js   (cần Playwright + Chromium đã cài sẵn; không tự cài)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'claude-directory');
const { makeMcp } = require('../src/mcp/index.js');
const W = require('../src/mcp/widget.js');
const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* bản cài toàn cục */ }
  for (const p of ['/opt/node-tools/node_modules/playwright', path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')]) {
    try { return require(p); } catch (e) { /* thử chỗ khác */ }
  }
  throw new Error('Playwright not found');
}

// Biến màu của Claude (bảng "Style variables" trong tài liệu MCP Apps)
const LIGHT = {
  '--color-background-primary': '#FFFFFF', '--color-background-secondary': '#F5F4ED', '--color-background-inverse': '#141413',
  '--color-text-primary': '#141413', '--color-text-secondary': '#3D3D3A', '--color-text-tertiary': '#73726C', '--color-text-inverse': '#FFFFFF',
  '--color-text-success': '#265B19', '--color-background-success': '#E9F1DC', '--color-text-danger': '#7F2C28', '--color-background-danger': '#F7ECEC',
  '--color-text-info': '#3266AD', '--color-border-secondary': 'rgba(31,30,29,0.3)', '--color-border-tertiary': 'rgba(31,30,29,0.15)',
};
const DARK = {
  '--color-background-primary': '#30302E', '--color-background-secondary': '#262624', '--color-background-inverse': '#FAF9F5',
  '--color-text-primary': '#FAF9F5', '--color-text-secondary': '#C2C0B6', '--color-text-tertiary': '#9C9A92', '--color-text-inverse': '#141413',
  '--color-text-success': '#7AB948', '--color-background-success': '#1B4614', '--color-text-danger': '#EE8884', '--color-background-danger': '#602A28',
  '--color-text-info': '#80AADD', '--color-border-secondary': 'rgba(222,220,209,0.3)', '--color-border-tertiary': 'rgba(222,220,209,0.15)',
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const pw = loadPlaywright();
  const browser = await pw.chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 560, height: 900 }, deviceScaleFactor: 2 });

  // ---- Biểu tượng
  const svg = fs.readFileSync(path.join(ROOT, 'caro', 'icon.svg'), 'utf8');
  for (const [size, file, scale] of [[128, path.join(__dirname, '..', 'src', 'mcp', 'ui', 'icon-128.png'), 1], [512, path.join(OUT, 'icon-512.png'), 1]]) {
    const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: scale });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await p.close();
    console.log('icon', file, fs.statSync(file).size, 'bytes');
  }

  // ---- Kết quả thật của các tool
  const hub = { publicLeaderboard: () => ({ players: [] }), publicPlayer: () => null };
  const mcp = makeMcp({ hub });
  const srv = http.createServer((req, res) => mcp(req, res));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const client = new Client({ name: 'shots', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${srv.address().port}/mcp`)));
  const call = async (name, args) => (await client.callTool({ name, arguments: args })).structuredContent;

  // 1. Ván đang chơi (luật Việt Nam, mức Vừa)
  const mid = await call('play_caro', { moves: [[0, 0], [1, -1], [1, 1], [-1, -1], [2, 2], [3, 3], [0, 1], [0, 2], [-1, 1], [2, 1], [1, 2]], difficulty: 'normal' });
  // 2. Thắng, có hàng thắng (Gomoku tự do, tối)
  const won = await call('play_caro', { moves: [[0, 0], [5, 5], [1, 0], [5, 6], [2, 0], [6, 5], [3, 0], [9, 9], [4, 0]], rule: 'free', difficulty: 'hard' });
  // 3. Bài đố của ngày, trả lời đúng
  const sol = (await call('caro_puzzle', { id: 42, reveal: true })).solution;
  const pz = await call('caro_puzzle', { id: 42, answer: sol });
  // 4. Gợi ý nước đi
  const sug = await call('suggest_caro_move', { moves: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [2, 2], [-1, 1], [1, 2]] });
  // 5. Ván mới luật Renju, tiếng Việt, đang chọn luật / bên
  const fresh = await call('play_caro', { rule: 'renju', difficulty: 'hard' });
  await client.close(); await mcp.close(); srv.close();

  const html = W.widgetHtml();
  const shots = [
    ['1-play-light.png', mid, LIGHT, 'light', 'en-US'],
    ['2-win-dark.png', won, DARK, 'dark', 'en-US'],
    ['3-puzzle-light.png', pz, LIGHT, 'light', 'en-US'],
    ['4-suggest-dark.png', sug, DARK, 'dark', 'en-US'],
    ['5-new-game-vi.png', fresh, LIGHT, 'light', 'vi-VN'],
  ];
  for (const [file, sc, vars, theme, locale] of shots) {
    const doc = html.replace('<script type="module">', `<script>globalThis.CARO_MCP_PREVIEW=${JSON.stringify(sc)};globalThis.CARO_MCP_PREVIEW_CONTEXT=${JSON.stringify({ theme, locale, styles: { variables: vars } })};</script><script type="module">`)
      .replace('</style>', `body{background:${vars['--color-background-primary']}}</style>`);
    await page.setContent(doc, { waitUntil: 'load' });
    await page.waitForSelector('.board-wrap svg');
    await page.waitForTimeout(400); // hết hiệu ứng quân mới
    const el = await page.$('#app');
    await el.screenshot({ path: path.join(OUT, file), animations: 'disabled' });
    const buf = fs.readFileSync(path.join(OUT, file));
    console.log('shot', file, buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20));
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
