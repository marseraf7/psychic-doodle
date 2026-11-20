/*
 * Connector MCP "Caro x Gomoku" (máy chủ MCP từ xa + MCP App) – hub gom các phần, phục vụ ở /mcp (Streamable HTTP,
 * không trạng thái, không đăng nhập). Mỗi file một việc:
 *   game.js          luật thuần: kiểm danh sách nước, kết quả, bàn chữ
 *   think.js         hàng đợi máy cờ chạy ở luồng phụ (think-worker.js) – không chặn ván online
 *   texts.js         chữ cho mô hình: luật, link về game, mức độ khó
 *   tools-game.js    play_caro, suggest_caro_move (có bàn cờ)
 *   tools-info.js    caro_puzzle (có bàn cờ), caro_rules, caro_leaderboard, caro_player
 *   widget.js        dựng widget HTML (ui/) thành tài nguyên ui://
 *   http.js          Node http ↔ SDK, Origin / CORS, giới hạn IP, giới hạn thân yêu cầu
 * Mỗi yêu cầu HTTP dựng một McpServer mới từ factory (kiểu không trạng thái của SDK v2 – createMcpHandler); máy chủ
 * không lưu ván, không lưu dữ liệu người dùng. Tắt bằng env CARO_MCP=0.
 * Gắn vào web.js: makeMcp({ hub, clientIp }) → hàm (req, res) cho đường dẫn /mcp.
 */
'use strict';
const { McpServer, createMcpHandler } = require('@modelcontextprotocol/server');
const { registerAppResource, RESOURCE_MIME_TYPE } = require('@modelcontextprotocol/ext-apps/server');
const { Thinker } = require('./think.js');
const W = require('./widget.js');
const T = require('./texts.js');
const { nodeHandler } = require('./http.js');
const toolsGame = require('./tools-game.js');
const toolsInfo = require('./tools-info.js');

const VERSION = '1.0.0';
const UI_URI = 'ui://caro/board-v1.html';

const INSTRUCTIONS = 'Caro x Gomoku: play Caro (Gomoku, five in a row) against the computer, get move suggestions and puzzles, '
  + 'and read public rankings from caroxo.duckdns.org. Games are stateless: pass the full list of moves ([x, y] pairs, X first) '
  + 'to play_caro and suggest_caro_move on every call.';

/** Một McpServer đầy đủ tool + tài nguyên widget (dựng mới cho mỗi yêu cầu – rẻ, không I/O). */
function buildServer({ hub, thinker }) {
  const icon = W.iconDataUri();
  const server = new McpServer({
    name: 'caro-x-gomoku', title: 'Caro x Gomoku', version: VERSION, websiteUrl: T.site(),
    ...(icon ? { icons: [{ src: icon, mimeType: 'image/png', sizes: ['128x128'] }] } : {}),
  }, { instructions: INSTRUCTIONS });
  const ctx = { hub, thinker, uri: UI_URI };
  toolsGame.register(server, ctx);
  toolsInfo.register(server, ctx);
  registerAppResource(server, 'Caro board', UI_URI, {
    description: 'Interactive Caro board for play_caro, suggest_caro_move and caro_puzzle.',
  }, async () => ({
    contents: [{
      uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: W.widgetHtml(),
      _meta: { ui: { prefersBorder: true, domain: W.uiDomain(), csp: { connectDomains: [], resourceDomains: [] } } },
    }],
  }));
  return server;
}

/** Hàm (req, res) cho /mcp, hoặc null khi tắt (CARO_MCP=0). opts.thinker: thay hàng đợi máy cờ (kiểm thử). */
function makeMcp({ hub, clientIp, thinker = new Thinker(), rate, now } = {}) {
  if (process.env.CARO_MCP === '0') return null;
  const handler = createMcpHandler(() => buildServer({ hub, thinker }), { maxRequestBodySize: 64 * 1024 });
  const handle = nodeHandler(handler.fetch, { clientIp, rate, now });
  handle.close = async () => { await handler.close(); await thinker.close(); };
  handle.thinker = thinker;
  return handle;
}

module.exports = { makeMcp, buildServer, UI_URI, VERSION };
