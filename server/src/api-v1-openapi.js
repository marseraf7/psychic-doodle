/*
 * Mô tả OpenAPI 3.1 của API công khai v1 (C4) – phục vụ ở /api/v1/openapi.json, trang tài liệu caro/api.html đọc file này
 * để liệt kê đường dẫn. Sửa đường dẫn ở api-v1-http.js thì sửa cả ở đây (bài thử api-v1.test.js so hai bên).
 */
'use strict';

const err = { $ref: '#/components/responses/Error' };
const userParam = { name: 'username', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-z0-9_.]{3,20}$' } };
const ok = (desc, schema, type = 'application/json') => ({ description: desc, content: { [type]: { schema } }, headers: { ETag: { schema: { type: 'string' } } } });
const obj = (props, required) => ({ type: 'object', properties: props, ...(required ? { required } : {}) });
const S = { type: 'string' }, I = { type: 'integer' }, B = { type: 'boolean' }, N = { type: ['string', 'null'] };
const move = { type: 'array', items: I, minItems: 2, maxItems: 2, description: '[x, y] – x sang phải, y xuống dưới; (0, 0) là h8' };
const result = { type: ['string', 'null'], enum: ['x', 'o', 'draw', null] };
const head = { id: S, createdAt: I, kind: N, rule: S, opening: S, clock: N, timeLimit: I, x: S, o: S, result, termination: N };
const game = obj({ ...head, moves: { type: 'array', items: move } });
const listGame = obj({ ...head, moveCount: I }); // danh sách ván: số nước (nước đi đầy đủ ở /game/{id})

function openapi(base = '') {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Cờ Caro public API', version: '1.0.0',
      description: 'Read-only JSON API. CORS: *. Rate limit: 120 requests / minute / IP (429 + Retry-After). Responses carry an ETag; send If-None-Match to get 304. Errors: { "error": code, "message": text }. Cell notation: columns a…o left→right, rows 1…15 bottom→top, center h8 (counting continues beyond that frame).',
    },
    servers: [{ url: base + '/api/v1' }],
    paths: {
      '/player/{username}': { get: { summary: 'Public profile', parameters: [userParam], responses: { 200: ok('Profile', obj({ username: S, name: S, createdAt: { type: ['integer', 'null'] }, perfs: { type: 'object' }, count: { type: 'object' }, tournaments: { type: 'object' }, historyPublic: B, url: S })), 404: err, 429: err } } },
      '/player/{username}/rating-history': { get: { summary: 'Rating history per pool', parameters: [userParam], responses: { 200: ok('Points [time ms, rating]', obj({ username: S, history: { type: 'object', additionalProperties: { type: 'array', items: { type: 'array', items: I } } } })), 404: err, 429: err } } },
      '/player/{username}/games': { get: { summary: 'Recent games (only when the player’s game history is public)', parameters: [userParam, { name: 'max', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } }], responses: { 200: ok('Games, newest first', obj({ username: S, hidden: B, games: { type: 'array', items: listGame } })), 404: err, 429: err } } },
      '/game/{id}': { get: { summary: 'One saved game (by share id)', parameters: [{ name: 'id', in: 'path', required: true, schema: S }], responses: { 200: ok('Game', { allOf: [game, obj({ notation: { type: 'array', items: S }, url: S })] }), 404: err, 429: err } } },
      '/game/{id}.txt': { get: { summary: 'Game as PGN-like text in Caro notation', parameters: [{ name: 'id', in: 'path', required: true, schema: S }], responses: { 200: ok('Text', S, 'text/plain'), 404: err, 429: err } } },
      '/tournament/{id}': { get: { summary: 'Public tournament info', parameters: [{ name: 'id', in: 'path', required: true, schema: S }], responses: { 200: ok('Tournament', obj({ id: S, name: S, format: S, status: S, startsAt: I, players: I, podium: { type: 'array', items: S }, url: S })), 404: err, 429: err } } },
      '/tournament/{id}/standings': { get: { summary: 'Tournament standings', parameters: [{ name: 'id', in: 'path', required: true, schema: S }], responses: { 200: ok('Standings', obj({ id: S, name: S, players: { type: 'array', items: obj({ rank: I, name: S, username: N, score: { type: 'number' }, wins: I, draws: I, losses: I, games: I }) } })), 404: err, 429: err } } },
      '/leaderboard': { get: { summary: 'Top 50 players', parameters: [{ name: 'pool', in: 'query', schema: { type: 'string', enum: ['bullet', 'blitz', 'rapid', 'classical', 'corr'] } }], responses: { 200: ok('Leaderboard', obj({ pool: N, players: { type: 'array', items: obj({ rank: I, username: S, name: S, rating: I, games: I }) } })), 429: err } } },
      '/broadcast/{key}': { get: { summary: 'Tournament broadcast: live boards, standings, recent results (key = tournament id, or "o." + offline tournament id)', parameters: [{ name: 'key', in: 'path', required: true, schema: S }], responses: { 200: ok('Broadcast', obj({ kind: S, name: S, status: S, round: { type: ['integer', 'null'] }, boards: { type: 'array', items: obj({ code: S, x: S, o: S, moves: { type: 'array', items: move }, turn: { type: ['integer', 'null'] }, winner: { type: ['integer', 'null'] } }) }, standings: { type: 'array' }, results: { type: 'array' }, embed: S, url: S })), 404: err, 429: err } } },
      '/puzzle/daily': { get: { summary: 'Puzzle of the day (changes at 0:00 Vietnam time)', parameters: [{ name: 'date', in: 'query', schema: { type: 'string', format: 'date' } }], responses: { 200: ok('Puzzle', obj({ date: S, id: I, rating: I, theme: S, rule: S, toMove: S, winIn: I, moves: { type: 'array', items: move }, notation: { type: 'array', items: S }, solution: { type: 'object' } })), 429: err } } },
      '/openapi.json': { get: { summary: 'This document', responses: { 200: ok('OpenAPI 3.1', { type: 'object' }) } } },
    },
    components: {
      responses: { Error: { description: 'Error', content: { 'application/json': { schema: obj({ error: S, message: S }, ['error']) } } } },
    },
  };
}

module.exports = { openapi };
