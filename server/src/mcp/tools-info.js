/*
 * Connector MCP – các tool chỉ đọc không cần máy cờ:
 *  - caro_puzzle       bài đố (caro/puzzles.json): bài của ngày hoặc theo số; kiểm nước trả lời; lời giải chỉ khi reveal.
 *  - caro_rules        luật 4 biến thể.
 *  - caro_leaderboard  bảng xếp hạng công khai (hub.publicLeaderboard – cùng dữ liệu /api/leaderboard).
 *  - caro_player       hồ sơ công khai (hub.publicPlayer, bỏ mã tài khoản và trạng thái online).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const z = require('zod');
const { registerAppTool } = require('@modelcontextprotocol/ext-apps/server');
const C = require('../../../caro/rules.js');
const G = require('./game.js');
const T = require('./texts.js');
const { errorResult, boardState, boardBlock } = require('./tools-game.js');

const POOLS = ['bullet', 'blitz', 'rapid', 'classical'];
const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };

let puzzles = null;
function allPuzzles() {
  if (!puzzles) puzzles = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'caro', 'puzzles.json'), 'utf8'));
  return puzzles;
}

/** Bài của ngày (theo ngày UTC, cùng cách băm như caro/puzzles.js): bài luật Việt Nam, độ khó 800–1600. */
function dailyPuzzle(date) {
  const day = (date || new Date()).toISOString().slice(0, 10);
  const pool = allPuzzles().filter((q) => !q.rule && q.r >= 800 && q.r <= 1600);
  let h = 2166136261;
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return { q: pool[h % pool.length], day };
}

const KIND = { vcf: 'VCF: win with a sequence of fours, each forcing a block', vct: 'VCT: win with a sequence of threats (threes and fours)' };

function register(server, { uri, hub }) {
  registerAppTool(server, 'caro_puzzle', {
    title: 'Caro puzzle',
    description: 'Get a Caro tactics puzzle on an interactive board: today\'s daily puzzle, or a specific one by id (1–' + allPuzzles().length + '). '
      + 'Pass answer to check the user\'s first move. The solution is only included when reveal is true. Use it when the user '
      + 'wants a Caro or Gomoku puzzle, a challenge or tactics training.',
    inputSchema: {
      id: z.number().int().min(1).optional().describe('Puzzle number; omit for today\'s daily puzzle.'),
      answer: z.array(z.number().int()).length(2).optional().describe('The user\'s proposed first move [x, y] to check.'),
      reveal: z.boolean().optional().describe('true to include the solution (first winning move).'),
    },
    annotations: { ...RO, openWorldHint: false },
    _meta: { ui: { resourceUri: uri } },
  }, async (args) => {
    try {
      let q, daily = null;
      if (args.id != null) {
        q = allPuzzles().find((x) => x.id === args.id);
        if (!q) throw new G.InputError(`No puzzle #${args.id}. Puzzle ids go from 1 to ${allPuzzles().length}; omit id for today's puzzle.`);
      } else ({ q, day: daily } = dailyPuzzle());
      const rule = q.rule || 'vn';
      const g = G.replay(q.m, rule);
      const name = G.sideName(g.toMove);
      const lines = [`${daily ? `Daily puzzle (${daily}) ` : ''}#${q.id} · rating ${q.r} · ${G.RULE_NAMES[rule]}`,
        `${name} to move and win in ${q.len} move(s). ${KIND[q.t]}.`];
      let verdict = null;
      if (args.answer) {
        G.checkCoord(args.answer, 'answer');
        const [x, y] = args.answer;
        if (g.board.get(x, y) !== C.EMPTY) throw new G.InputError(`answer ${G.fmt(args.answer)} is on an occupied cell; pick an empty one.`);
        const ok = (x === q.sol[0] && y === q.sol[1]) || C.winsIfPlaced(g.board, x, y, g.toMove);
        verdict = ok ? 'correct' : 'wrong';
        lines.push(ok ? `Correct: ${G.fmt(args.answer)} is the key move.` : `${G.fmt(args.answer)} is not the key move. Try again (or reveal the solution).`);
      }
      if (args.reveal) lines.push(`Solution: ${name} plays ${G.fmt(q.sol)} first, then keeps forcing until five in a row.`);
      else if (verdict !== 'correct') lines.push('Solution hidden; call again with reveal=true to show it.');
      lines.push(boardBlock(g), T.footer());
      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        structuredContent: {
          mode: 'puzzle', ...boardState(g), puzzle: { id: q.id, rating: q.r, len: q.len, kind: q.t, daily, total: allPuzzles().length },
          answer: args.answer || null, verdict, solution: args.reveal || verdict === 'correct' ? q.sol : null, site: T.site(),
        },
      };
    } catch (e) { return errorResult(e); }
  });

  server.registerTool('caro_rules', {
    title: 'Caro rules',
    description: 'Explain the rules of Caro and Gomoku variants: Vietnamese Caro (blocked-both-ends rule), freestyle Gomoku, '
      + 'standard Gomoku (exactly five) and Renju (forbidden moves for the first player). Use it when the user asks how to play '
      + 'or how the variants differ.',
    inputSchema: { rule: z.enum(G.RULES).optional().describe('One variant (vn, free, std, renju); omit for all four.') },
    annotations: { ...RO, openWorldHint: false },
  }, async (args) => ({ content: [{ type: 'text', text: `${T.rulesText(args.rule)}\n${T.footer()}` }] }));

  server.registerTool('caro_leaderboard', {
    title: 'Caro leaderboard',
    description: 'Show the public leaderboard of the Caro x Gomoku online server (caroxo.duckdns.org): rank, username, display '
      + 'name, rating and games. Optionally for one time control (bullet, blitz, rapid, classical). Use it when the user asks '
      + 'who the top Caro players are.',
    inputSchema: {
      pool: z.enum(POOLS).optional().describe('Time-control pool; omit for the overall rating.'),
      limit: z.number().int().min(1).max(20).optional().describe('How many players (1–20, default 10).'),
    },
    annotations: { ...RO, openWorldHint: true },
  }, async (args) => {
    try {
      const lb = hub.publicLeaderboard(args.pool || null);
      const top = lb.players.slice(0, args.limit || 10);
      const head = top.length ? `Caro x Gomoku leaderboard (${args.pool || 'overall'} rating), top ${top.length}:` : `Caro x Gomoku leaderboard (${args.pool || 'overall'} rating): no ranked players yet.`;
      const rows = top.map((p) => `${p.rank}. ${p.username}${p.name && p.name !== p.username ? ` (${p.name})` : ''} – ${p.rating} · ${p.games} games`);
      return { content: [{ type: 'text', text: [head, ...rows, T.footer()].join('\n') }] };
    } catch (e) { return errorResult(e); }
  });

  server.registerTool('caro_player', {
    title: 'Caro player profile',
    description: 'Look up a public player profile on the Caro x Gomoku online server by username: display name, ratings per '
      + 'time control, games played and join date. Use it when the user asks about a specific player.',
    inputSchema: { username: z.string().describe('Username on caroxo.duckdns.org (3–20 letters, digits, "_" or ".").') },
    annotations: { ...RO, openWorldHint: true },
  }, async (args) => {
    try {
      const u = String(args.username || '').trim().replace(/^@/, '');
      if (!/^[a-z0-9_.]{3,20}$/i.test(u)) throw new G.InputError('username must be 3–20 characters: letters, digits, "_" or ".".');
      const p = hub.publicPlayer(u);
      if (!p) throw new G.InputError(`No player named "${u}". Check the spelling, or use caro_leaderboard to see top players.`);
      const perfs = Object.entries(p.perfs).filter(([, v]) => v.games)
        .map(([k, v]) => `${k} ${v.rating}${v.prov ? '?' : ''} (${v.games} games)`);
      const c = p.count || {};
      const lines = [`${p.username}${p.name && p.name !== p.username ? ` (${p.name})` : ''} – rating ${p.rating}`,
        perfs.length ? `By time control: ${perfs.join(', ')}` : 'No rated games yet.',
        `Online games: won ${c.wins || 0}, lost ${c.losses || 0}, drawn ${c.draws || 0}${c.rated != null ? ` (${c.rated} rated)` : ''}`,
        p.createdAt ? `Joined: ${new Date(p.createdAt).toISOString().slice(0, 10)}` : '', T.footer()].filter(Boolean);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (e) { return errorResult(e); }
  });
}

module.exports = { register, dailyPuzzle, allPuzzles };
