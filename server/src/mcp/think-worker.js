/*
 * Luồng phụ (worker_threads) chạy máy cờ cho connector MCP, để lượt tìm nước (tới ~1,5 giây CPU) không chặn vòng sự kiện
 * của máy chủ – nơi đang phục vụ các ván online qua WebSocket. Nhận việc từ think.js, trả kết quả, không giữ trạng thái
 * ngoài bảng ghi nhớ mà engine.js tự quản lý (theo ván, có giới hạn kích thước).
 *  - { kind: 'bot', moves, rule, bot }     → nước của nhân vật máy (caro/bots.js)
 *  - { kind: 'analyse', moves, rule, ms }  → nước tốt nhất + điểm (caro/engine.js)
 */
'use strict';
const { parentPort } = require('worker_threads');
const C = require('../../../caro/rules.js');
const Bots = require('../../../caro/bots.js');
const Engine = require('../../../caro/engine.js');

function run(job) {
  if (job.kind === 'analyse') {
    const r = Engine.analyse(job.moves, { rule: job.rule, ms: job.ms });
    return { move: r.move, score: r.score, mate: r.mate, depth: r.depth, pv: (r.pv || []).slice(0, 6), chance: Engine.winChance(r.score) };
  }
  const board = new C.Board(job.rule);
  job.moves.forEach((m, i) => board.play(m[0], m[1], i % 2 ? C.O : C.X));
  const side = job.moves.length % 2 ? C.O : C.X;
  return { move: Bots.botMove(board, side, job.bot) };
}

parentPort.on('message', (job) => {
  try { parentPort.postMessage({ id: job.id, ok: true, result: run(job) }); } catch (e) { parentPort.postMessage({ id: job.id, ok: false, error: String(e && e.message || e) }); }
});
