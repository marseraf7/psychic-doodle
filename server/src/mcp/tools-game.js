/*
 * Connector MCP – hai tool có bàn cờ (MCP App, widget ở widget.js):
 *  - play_caro          chơi với máy: nhận danh sách nước, máy đi một nước, trả thế mới + kết quả.
 *  - suggest_caro_move  gợi ý nước tốt nhất kèm lý do ngắn.
 * Máy cờ chạy ở luồng phụ (think.js). Không lưu gì: ván nằm trọn trong danh sách nước người gọi gửi lên.
 */
'use strict';
const z = require('zod');
const { registerAppTool } = require('@modelcontextprotocol/ext-apps/server');
const C = require('../../../caro/rules.js');
const G = require('./game.js');
const T = require('./texts.js');
const { BusyError } = require('./think.js');

const ISSUES = 'https://github.com/marseraf7/psychic-doodle/issues';
const ANALYSE_MS = 1000; // thời gian nghĩ của gợi ý (≤ 1,5 giây)

const movesSchema = z.array(z.array(z.number().int()).length(2)).max(G.MAX_MOVES)
  .describe('Moves played so far, in order, as [x, y] pairs (X first, then alternating). Coordinates -30..30, center [0,0]. Empty list = new game.');
const ruleSchema = z.enum(G.RULES).optional()
  .describe('Rule variant: vn = Vietnamese Caro (default, blocked-both-ends rule), free = freestyle Gomoku, std = standard Gomoku (exactly five), renju = Renju.');

/** Kết quả lỗi đọc được (không bao giờ là "Internal Server Error" trơn). */
function errorResult(e) {
  let text;
  if (e instanceof G.InputError) text = e.message;
  else if (e instanceof BusyError) text = 'The Caro engine is busy with other games right now. Please try again in a few seconds.';
  else text = `The Caro engine could not answer (${e && e.message}). Please try again; if it keeps failing, report it at ${ISSUES}.`;
  return { content: [{ type: 'text', text }], isError: true };
}

/** Phần chung của kết quả: thế cờ cho widget (structuredContent) + bàn chữ cho mô hình. */
function boardState(g) {
  return {
    rule: g.rule, moves: g.moves, winner: g.winner ? G.sideName(g.winner) : null, line: g.line, draw: g.draw,
    toMove: g.winner || g.draw ? null : G.sideName(g.toMove),
  };
}

function boardBlock(g) {
  const art = G.asciiBoard(g);
  return art ? `Board (rows = y, columns = x; lowercase = last move):\n${art}` : 'Empty board.';
}

function register(server, { thinker, uri }) {
  registerAppTool(server, 'play_caro', {
    title: 'Play Caro vs computer',
    description: 'Play Caro (Gomoku, five in a row) against the computer on an interactive board. Pass every move played so far; '
      + 'the tool checks them, makes the computer\'s reply and returns the new position, whose turn it is and the result '
      + '(win, draw, winning line). Use it when the user wants to play Caro, Gomoku, five in a row or tic-tac-toe on a big board. '
      + 'Start a new game with an empty moves list; the user can then click on the board to move.',
    inputSchema: {
      moves: movesSchema.optional(),
      rule: ruleSchema,
      difficulty: z.enum(['easy', 'normal', 'hard']).optional().describe('Computer strength (default normal).'),
      you_play: z.enum(['X', 'O']).optional().describe('Side the user plays (default X, which moves first). With O the computer opens.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: uri } },
  }, async (args) => {
    try {
      const rule = G.ruleArg(args.rule);
      const diff = args.difficulty || 'normal';
      const you = args.you_play === 'O' ? C.O : C.X;
      let g = G.replay(args.moves || [], rule);
      let reply = null;
      if (!g.winner && !g.draw && g.toMove !== you) {
        const r = await thinker.run({ kind: 'bot', moves: g.moves, rule, bot: T.DIFFICULTY[diff].bot });
        reply = r.move;
        g = G.extend(g, reply);
      }
      const me = G.sideName(C.other(you));
      const lines = [];
      if (reply) lines.push(`Computer (${me}, ${T.DIFFICULTY[diff].label}) played ${G.fmt(reply)}.`);
      if (g.winner) lines.push(g.winner === you ? `You win! ${G.statusText(g)}` : `Computer wins. ${G.statusText(g)}`);
      else if (g.draw) lines.push(G.statusText(g));
      else lines.push(`Your move (${G.sideName(you)}). Rule: ${G.RULE_NAMES[rule]}.`);
      lines.push(boardBlock(g), `moves: ${JSON.stringify(g.moves)}`, T.footer());
      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        structuredContent: { mode: 'play', ...boardState(g), difficulty: diff, you: G.sideName(you), reply, site: T.site() },
      };
    } catch (e) { return errorResult(e); }
  });

  registerAppTool(server, 'suggest_caro_move', {
    title: 'Suggest a Caro move',
    description: 'Suggest the best next move for the side to move in a Caro or Gomoku position, with a short reason '
      + '(winning move, block, forced win, or engine estimate). Use it when the user asks for a hint, an analysis of a position '
      + 'or what to play next.',
    inputSchema: { moves: movesSchema, rule: ruleSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: uri } },
  }, async (args) => {
    try {
      const rule = G.ruleArg(args.rule);
      const g = G.replay(args.moves, rule);
      if (g.winner || g.draw) throw new G.InputError(`The game is already over: ${G.statusText(g)} Nothing to suggest.`);
      const side = g.toMove, opp = C.other(side), name = G.sideName(side);
      let best, reason, code;
      if (!g.moves.length) { best = [0, 0]; reason = 'Opening move: start in the center.'; code = { k: 'opening' }; }
      else {
        const r = await thinker.run({ kind: 'analyse', moves: g.moves, rule, ms: ANALYSE_MS });
        best = r.move;
        if (C.winsIfPlaced(g.board, best[0], best[1], side)) { reason = 'Wins immediately by completing the line.'; code = { k: 'win' }; }
        else if (C.winsIfPlaced(g.board, best[0], best[1], opp)) { reason = 'Blocks the opponent\'s immediate win.'; code = { k: 'block' }; }
        else if (r.mate > 0) { reason = `Starts a forced win: ${name} wins in ${r.mate} move(s) with best play (line: ${r.pv.map(G.fmt).join(' ')}).`; code = { k: 'forced', n: r.mate }; }
        else if (r.mate < 0) { reason = `Best defense, but the opponent has a forced win in ${-r.mate} move(s).`; code = { k: 'defend', n: -r.mate }; }
        else { reason = `Strongest move found by search (depth ${r.depth}); estimated winning chance for ${name}: ${Math.round(r.chance * 100)}%.`; code = { k: 'search', p: Math.round(r.chance * 100) }; }
      }
      return {
        content: [{ type: 'text', text: `Best move for ${name}: ${G.fmt(best)}. ${reason}\n${boardBlock(g)}\n${T.footer()}` }],
        structuredContent: { mode: 'suggest', ...boardState(g), hint: best, reason, reasonCode: code, site: T.site() },
      };
    } catch (e) { return errorResult(e); }
  });
}

module.exports = { register, errorResult, boardState, boardBlock, ISSUES };
