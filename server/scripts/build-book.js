/*
 * Dựng sách khai cuộc (caro/book-data.js) bằng cách cho engine phân tích rất lâu các thế đầu ván.
 * Công cụ cho người phát triển; chạy lâu (vài chục phút), dùng mọi lõi CPU.
 *
 *   node server/scripts/build-book.js [luật=vn,free,std,renju] [ms mỗi thế=8000] [số nước tối đa=8] [nhánh=4]
 *
 * Với mỗi luật dựng hai phần: sách cho X (X đi trước, mở ở (0, 0)) và sách cho O. Ở lượt của bên có sách: engine nghĩ
 * <ms> và ghi nước tốt nhất; ở lượt đối thủ: rẽ nhánh theo <nhánh> nước hay gặp nhất (nước tốt nhất của engine nghĩ
 * nhanh + các ứng viên điểm cao), gộp các thế giống nhau sau khi xoay / lật (book.js canon).
 * Ghi đè caro/book-data.js; giữ lại các mục cũ của luật không dựng lại.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const CARO = path.join(__dirname, '../../caro');
const OUT = path.join(CARO, 'book-data.js');

if (!isMainThread) {
  const EN = require(path.join(CARO, 'engine.js'));
  parentPort.on('message', ({ id, moves, rule, ms }) => {
    const r = EN.analyse(moves, { ms, rule });
    parentPort.postMessage({ id, move: r.move, mate: r.mate, score: r.score });
  });
  return;
}

const EN = require(path.join(CARO, 'engine.js'));
const B = require(path.join(CARO, 'book.js'));
const C = require(path.join(CARO, 'rules.js'));

const [RULES = 'vn,free,std,renju', MS = '8000', MAXPLY = '8', BRANCH = '4'] = process.argv.slice(2);
const cores = require('os').cpus().length;
const pool = Array.from({ length: cores }, () => new Worker(__filename));
let jobId = 0;
const waiting = new Map();
pool.forEach((w) => w.on('message', (m) => { waiting.get(m.id)(m); waiting.delete(m.id); }));
const idle = [...pool];
const queue = [];
function analyse(moves, rule, ms) {
  return new Promise((res) => {
    queue.push({ moves, rule, ms, res });
    pump();
  });
}
function pump() {
  while (idle.length && queue.length) {
    const w = idle.pop(), j = queue.shift(), id = ++jobId;
    waiting.set(id, (m) => { idle.push(w); j.res(m); pump(); });
    w.postMessage({ id, moves: j.moves, rule: j.rule, ms: j.ms });
  }
}

/** Ván đã có người thắng chưa (nước cuối). */
function over(moves, rule) {
  const b = new C.Board(rule);
  moves.forEach(([x, y], i) => b.play(x, y, i % 2 ? C.O : C.X));
  const [x, y] = moves[moves.length - 1];
  return !!C.checkWin(b, x, y, (moves.length - 1) % 2 ? C.O : C.X);
}

/** Các nước hay gặp của đối thủ: nước tốt nhất (nghĩ nhanh) + ứng viên điểm cao, không trùng sau chuẩn hoá. */
async function replies(moves, rule, k) {
  const fast = await analyse(moves, rule, 300);
  const pos = new EN.Position(moves, rule);
  const cands = [fast.move, ...pos.candidates(pos.side, 12).map((i) => pos.xy(i))];
  const out = [], seen = new Set();
  for (const m of cands) {
    if (out.length >= k) break;
    const key = B.canon([...moves, m]).key;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

async function build(rule, bookSide, ms, maxPly, branch, book) {
  // Mức hiện tại: các thế (không trùng) cần xét
  let level = [[[0, 0]]];
  const seen = new Set();
  for (let ply = 1; ply < maxPly && level.length; ply++) {
    const next = [];
    const side = ply % 2; // 0: X tới lượt, 1: O tới lượt
    if (side === bookSide) {
      const res = await Promise.all(level.map((moves) => analyse(moves, rule, ms)));
      level.forEach((moves, i) => {
        const r = res[i];
        const c = B.toCanon(moves, r.move);
        book[c.key] = c.move;
        const nm = [...moves, r.move];
        if (r.mate == null && !over(nm, rule)) next.push(nm); // đã thấy thắng / thua chắc: khỏi dựng tiếp
      });
    } else {
      const all = await Promise.all(level.map((moves) => replies(moves, rule, ply <= 3 ? branch + 1 : branch)));
      level.forEach((moves, i) => {
        for (const m of all[i]) {
          const nm = [...moves, m];
          const key = B.canon(nm).key;
          if (seen.has(key) || over(nm, rule)) continue;
          seen.add(key);
          next.push(nm);
        }
      });
    }
    console.log(`  ${rule} · sách ${bookSide ? 'O' : 'X'} · nước ${ply}: ${level.length} thế → ${Object.keys(book).length} mục`);
    level = next;
  }
}

(async () => {
  let old = {};
  try { old = require(OUT); } catch (e) { /* chưa có */ }
  const data = { ...old };
  const t0 = Date.now();
  for (const rule of RULES.split(',')) {
    const book = {};
    // Sách X: X mở ở (0, 0) (nhân vật máy cầm X luôn mở ở đó) – nước đầu không cần sách
    await build(rule, 0, Number(MS), Number(MAXPLY), Number(BRANCH), book);
    await build(rule, 1, Number(MS), Number(MAXPLY), Number(BRANCH), book);
    data[rule] = book;
    console.log(`${rule}: ${Object.keys(book).length} mục · ${Math.round((Date.now() - t0) / 1000)} giây`);
    write(data);
  }
  pool.forEach((w) => w.terminate());
})();

function write(data) {
  const body = Object.entries(data).map(([rule, book]) =>
    `  ${rule}: {\n${Object.entries(book).map(([k, m]) => `    '${k}': [${m[0]}, ${m[1]}],`).join('\n')}\n  },`).join('\n');
  fs.writeFileSync(OUT, `/*
 * Sách khai cuộc (sinh tự động bởi server/scripts/build-book.js – đừng sửa tay): { luật: { khoá thế cờ: [x, y] } }.
 * Khoá và toạ độ theo dạng chuẩn hoá của book.js (canon). Engine nghĩ ${MS} ms mỗi thế, tối đa ${MAXPLY} nước, ${BRANCH} nhánh.
 */
(function (global) {
  'use strict';
  const DATA = {
${body}
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  else global.CaroBookData = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
`);
}
