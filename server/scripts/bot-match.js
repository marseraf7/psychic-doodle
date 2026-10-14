/*
 * Đấu thử giữa các cấu hình máy để đo sức cờ (công cụ cho người phát triển, không chạy trên máy chủ).
 *   node server/scripts/bot-match.js <A> <B> [số khai cuộc=12] [ms=200] [luật=vn] [bên của A: both | X | O] [khai cuộc: rand | bal]
 * ms = 0: nhân vật máy dùng đúng thời gian của mình (engine thuần dùng 500 ms).
 * A / B: 'eng' (engine.js thuần) | 'old:<đường dẫn engine.js khác>' | id nhân vật máy (vd. rong, phao) | 'eng:<json opts>'
 *        | 'old:<đường dẫn>#<json opts>' (engine khác kèm tuỳ chọn).
 * Mỗi khai cuộc đánh 2 ván đổi bên; chạy song song theo số lõi CPU. Khai cuộc: rand – 3 nước ngẫu nhiên quanh tâm (lợi
 * cho X), bal – bộ khai cuộc cân bằng trong openings.json (gen-openings.js) – nên dùng khi so sức hai engine.
 */
'use strict';
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const CARO = path.join(__dirname, '../../caro');

function player(spec, ms) {
  const C = require(path.join(CARO, 'rules.js'));
  if (spec === 'eng' || spec.startsWith('eng:') || spec.startsWith('old:')) {
    const [file0, json] = spec.startsWith('old:') ? spec.slice(4).split('#') : [null, spec.startsWith('eng:') ? spec.slice(4) : null];
    const file = file0 ? path.resolve(file0) : path.join(CARO, 'engine.js');
    const EN = require(file);
    const extra = json ? JSON.parse(json) : {};
    return (moves, rule) => EN.analyse(moves, { ms, rule, ...extra }).move;
  }
  const B = require(path.join(CARO, 'bots.js'));
  const bot = { ...B.get(spec) };
  if (bot.engine && ms) bot.engine = { ...bot.engine, ms }; // ms = 0: giữ thời gian của nhân vật
  return (moves, rule) => {
    const b = new C.Board(rule);
    moves.forEach(([x, y], i) => b.play(x, y, i % 2 ? C.O : C.X));
    return B.botMove(b, moves.length % 2 ? C.O : C.X, bot);
  };
}

function game(a, b, opening, rule) {
  const C = require(path.join(CARO, 'rules.js'));
  const board = new C.Board(rule);
  const moves = [];
  for (const [x, y] of opening) { board.play(x, y, moves.length % 2 ? C.O : C.X); moves.push([x, y]); }
  while (moves.length < 160) {
    const p = moves.length % 2 ? C.O : C.X;
    const [x, y] = (p === C.X ? a : b)(moves.slice(), rule);
    if (board.get(x, y) !== C.EMPTY) return { winner: 3 - p, moves: moves.length, illegal: true };
    board.play(x, y, p); moves.push([x, y]);
    if (C.checkWin(board, x, y, p)) return { winner: p, moves: moves.length };
  }
  return { winner: 0, moves: moves.length };
}

if (!isMainThread) {
  const { A, B, ms, rule, jobs } = workerData;
  const pa = player(A, ms), pb = player(B, ms);
  for (const j of jobs) {
    const r = j.swap ? game(pb, pa, j.opening, rule) : game(pa, pb, j.opening, rule);
    // điểm của A
    const aSide = j.swap ? 2 : 1;
    parentPort.postMessage({ ...r, a: r.winner === 0 ? 0.5 : r.winner === aSide ? 1 : 0 });
  }
} else {
  const [A = 'eng', B = 'rong', N = '12', MS = '200', RULE = 'vn', SIDE = 'both', OPEN = 'rand'] = process.argv.slice(2);
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const jobs = [];
  const bal = OPEN === 'bal' ? require(path.join(__dirname, 'openings.json'))[RULE] : null;
  if (bal && bal.length < +N) console.warn(`openings.json chỉ có ${bal.length} khai cuộc cho luật ${RULE}`);
  for (let k = 0; k < (bal ? Math.min(+N, bal.length) : +N); k++) {
    const op = bal ? bal[k] : [[0, 0]];
    while (op.length < 3) { const c = [Math.floor(rnd() * 5) - 2, Math.floor(rnd() * 5) - 2]; if (!op.some((m) => m[0] === c[0] && m[1] === c[1])) op.push(c); }
    if (SIDE !== 'O') jobs.push({ opening: op, swap: false });
    if (SIDE !== 'X') jobs.push({ opening: op, swap: true });
  }
  const cores = Math.min(require('os').cpus().length, jobs.length);
  let score = 0, done = 0, len = 0, illegal = 0, xw = 0, dr = 0;
  const t0 = Date.now();
  for (let w = 0; w < cores; w++) {
    const wk = new Worker(__filename, { workerData: { A, B, ms: +MS, rule: RULE, jobs: jobs.filter((_, i) => i % cores === w) } });
    wk.on('message', (r) => {
      score += r.a; done++; len += r.moves; if (r.illegal) illegal++; if (r.winner === 1) xw++; if (!r.winner) dr++;
      if (done === jobs.length) {
        console.log(`${A} vs ${B}: ${score}/${done} (${Math.round((100 * score) / done)}%) · TB ${Math.round(len / done)} nước · X thắng ${xw}, hoà ${dr} · ${illegal} nước sai · ${Math.round((Date.now() - t0) / 1000)} giây`);
      }
    });
  }
}
