/*
 * Engine tự đấu để sinh thêm dữ liệu học (như vòng "tự đấu – học lại" của các engine Gomoku vô địch Gomocup).
 * Dùng khi luật có ít ván thật (vd. luật Việt Nam: Gomocup chỉ có bảng Caro từ 2021). Công cụ cho người phát triển.
 *
 *   node server/scripts/selfplay.js <luật: vn|free|std|renju> <số ván> <file ra .jsonl> [ms mỗi nước=60]
 *   → cùng định dạng với gomocup-import.js ({"m":[[x,y],…],"w":1|2|0,"n":40}), dùng được cho tune-eval.js.
 * Mỗi ván mở bằng 3 quân ngẫu nhiên quanh tâm (để các ván khác nhau), toạ độ dời vào bàn 40×40 cho tune-eval.js.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const CARO = path.join(__dirname, '../../caro');

function playOne(rule, ms, rnd) {
  const C = require(path.join(CARO, 'rules.js'));
  const EN = require(path.join(CARO, 'engine.js'));
  const board = new C.Board(rule);
  const moves = [[0, 0]];
  board.play(0, 0, C.X);
  while (moves.length < 3) {
    const c = [Math.floor(rnd() * 5) - 2, Math.floor(rnd() * 5) - 2];
    if (board.get(c[0], c[1]) !== C.EMPTY) continue;
    board.play(c[0], c[1], moves.length % 2 ? C.O : C.X);
    moves.push(c);
  }
  while (moves.length < 160) {
    const p = moves.length % 2 ? C.O : C.X;
    const [x, y] = EN.analyse(moves, { ms, rule }).move;
    if (board.get(x, y) !== C.EMPTY) return { m: moves, w: 3 - p };
    board.play(x, y, p); moves.push([x, y]);
    if (C.checkWin(board, x, y, p)) return { m: moves, w: p };
  }
  return { m: moves, w: 0 };
}

if (!isMainThread) {
  const { rule, games, ms, seed } = workerData;
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < games; i++) {
    const g = playOne(rule, ms, rnd);
    // Dời vào bàn 40×40 (tune-eval.js cần bàn có biên)
    parentPort.postMessage({ m: g.m.map(([x, y]) => [x + 20, y + 20]), w: g.w, n: 40, src: 'selfplay/' + rule });
  }
} else {
  const [rule = 'vn', n = '200', out = 'selfplay.jsonl', ms = '60'] = process.argv.slice(2);
  const cores = require('os').cpus().length;
  const per = Math.ceil(Number(n) / cores);
  const file = fs.createWriteStream(out, { flags: 'a' });
  let done = 0;
  const t0 = Date.now();
  for (let w = 0; w < cores; w++) {
    const wk = new Worker(__filename, { workerData: { rule, games: per, ms: Number(ms), seed: 1000 + w * 7919 + Date.now() % 1000 } });
    wk.on('message', (g) => {
      file.write(JSON.stringify(g) + '\n');
      if (++done % 100 === 0) console.log(`${done} ván · ${Math.round((Date.now() - t0) / 1000)} giây`);
      if (done === per * cores) { file.end(); console.log('Xong', done, 'ván →', out); }
    });
  }
}
