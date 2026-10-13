/*
 * Sinh bộ khai cuộc CÂN BẰNG để đo sức engine bằng tự đấu (như Gomocup / Stockfish dùng bộ khai cuộc cân bằng: khai cuộc
 * ngẫu nhiên 3 quân quanh tâm lợi cho X tới mức X thắng ~80% bất kể engine nào – khó thấy engine nào mạnh hơn).
 * Công cụ cho người phát triển; dùng mọi lõi CPU.
 *
 *   node server/scripts/gen-openings.js [luật=vn,free,std,renju] [số khai cuộc mỗi luật=64] [ms=1000] [ngưỡng điểm=150]
 *
 * Mỗi khai cuộc: 3–5 quân ngẫu nhiên trong ô vuông 7×7 quanh tâm (X đi trước, đúng luật, chưa ai có ô thắng), engine nghĩ
 * <ms> mà |điểm| ≤ ngưỡng và không thấy thắng / thua chắc thì nhận. Bỏ khai cuộc trùng sau khi xoay / lật (book.js canon).
 * Ghi server/scripts/openings.json: { luật: [[[x, y], …], …] } – bot-match.js dùng khi tham số khai cuộc là 'bal'.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort } = require('worker_threads');
const CARO = path.join(__dirname, '../../caro');
const OUT = path.join(__dirname, 'openings.json');

if (!isMainThread) {
  const EN = require(path.join(CARO, 'engine.js'));
  parentPort.on('message', ({ id, moves, rule, ms }) => {
    const r = EN.analyse(moves, { ms, rule });
    parentPort.postMessage({ id, score: r.score, mate: r.mate });
  });
  return;
}

const C = require(path.join(CARO, 'rules.js'));
const B = require(path.join(CARO, 'book.js'));
const EN = require(path.join(CARO, 'engine.js'));
const [RULES = 'vn,free,std,renju', COUNT = '64', MS = '1000', LIMIT = '150'] = process.argv.slice(2);

const pool = Array.from({ length: require('os').cpus().length }, () => new Worker(__filename));
const idle = [...pool], queue = [], waiting = new Map();
let jobId = 0;
pool.forEach((w) => w.on('message', (m) => { waiting.get(m.id)(m); waiting.delete(m.id); }));
function analyse(moves, rule, ms) {
  return new Promise((res) => { queue.push({ moves, rule, ms, res }); pump(); });
}
function pump() {
  while (idle.length && queue.length) {
    const w = idle.pop(), j = queue.shift(), id = ++jobId;
    waiting.set(id, (m) => { idle.push(w); j.res(m); pump(); });
    w.postMessage({ id, moves: j.moves, rule: j.rule, ms: j.ms });
  }
}

let s = 20261013;
const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; };

/** Khai cuộc ngẫu nhiên hợp lệ (X ở tâm, chưa ai có ô thắng). */
function randomOpening(rule) {
  for (;;) {
    const n = 3 + Math.floor(rnd() * 3);
    const b = new C.Board(rule), mv = [[0, 0]];
    b.play(0, 0, C.X);
    while (mv.length < n) {
      const x = Math.floor(rnd() * 7) - 3, y = Math.floor(rnd() * 7) - 3, p = mv.length % 2 ? C.O : C.X;
      if (b.get(x, y) || C.forbidden(b, x, y, p)) continue;
      b.play(x, y, p); mv.push([x, y]);
    }
    const pos = new EN.Position(mv, rule);
    if (!pos.winCount[1] && !pos.winCount[2]) return mv;
  }
}

(async () => {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* chưa có */ }
  const t0 = Date.now();
  for (const rule of RULES.split(',')) {
    const out = [], seen = new Set();
    let tried = 0;
    while (out.length < +COUNT && tried < +COUNT * 40) {
      // Mỗi đợt thử một loạt khai cuộc song song
      const batch = [];
      while (batch.length < pool.length * 2) {
        const mv = randomOpening(rule), key = B.canon(mv).key;
        if (seen.has(key)) continue;
        seen.add(key); batch.push(mv);
      }
      tried += batch.length;
      const res = await Promise.all(batch.map((mv) => analyse(mv, rule, +MS)));
      batch.forEach((mv, i) => { if (res[i].mate == null && Math.abs(res[i].score) <= +LIMIT && out.length < +COUNT) out.push(mv); });
    }
    data[rule] = out;
    console.log(`${rule}: ${out.length} khai cuộc cân bằng / ${tried} đã thử · ${Math.round((Date.now() - t0) / 1000)} giây`);
    fs.writeFileSync(OUT, JSON.stringify(data) + '\n');
  }
  pool.forEach((w) => w.terminate());
})();
