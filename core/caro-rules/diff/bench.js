#!/usr/bin/env node
/*
 * Đo nhanh JS (caro/rules.js) ↔ Rust/WASM trên CÙNG các thế cờ (ván ngẫu nhiên có hạt giống, xem gen.js).
 * Chạy: node core/caro-rules/diff/bench.js [--games=150] [--seed=7] [--wasm=đường/dẫn.wasm]
 * In ra ns/lần gọi (trung vị 7 lượt), tách riêng:
 *  - "WASM qua lớp bọc": gọi như rules.js (có dựng mảng ô thắng / chuỗi lý do) – là chi phí thật nếu thay rules.js;
 *  - "WASM gọi thẳng export": bỏ lớp bọc, còn chi phí ranh giới JS↔WASM + tính;
 *  - "WASM lặp bên trong": lặp ngay trong WASM, gần như chỉ còn phần tính;
 *  - "export rỗng": chi phí một lần vượt ranh giới.
 */
'use strict';

const path = require('path');
const C = require(path.join(__dirname, '..', '..', '..', 'caro', 'rules.js'));
const { load } = require(path.join(__dirname, '..', 'js', 'rules-wasm.js'));
const { mulberry32, randomGame } = require('./gen.js');

function args() {
  const a = { games: 150, seed: 7, wasm: undefined };
  for (const s of process.argv.slice(2)) {
    const m = /^--(\w+)=(.*)$/.exec(s);
    if (m && m[1] in a) a[m[1]] = m[1] === 'wasm' ? m[2] : Number(m[2]);
  }
  return a;
}

/** Trung vị thời gian (ns/lần) của fn() chạy `calls` lần gọi, 7 lượt sau 2 lượt khởi động. */
function time(fn, calls) {
  let sink = 0;
  const runs = [];
  for (let r = 0; r < 9; r++) {
    const t0 = process.hrtime.bigint();
    sink += fn();
    const dt = Number(process.hrtime.bigint() - t0);
    if (r >= 2) runs.push(dt / calls);
  }
  runs.sort((a, b) => a - b);
  time.sink = (time.sink || 0) + sink;
  return runs[3];
}

/** Dựng các thế: mỗi ván ngẫu nhiên lấy thế cuối, bàn JS và bàn WASM giống hệt nhau. */
function buildPositions(W, a) {
  const out = [];
  ['vn', 'free', 'std', 'renju'].forEach((rule, i) => {
    const rnd = mulberry32(a.seed + i);
    for (let g = 0; g < a.games; g++) {
      const moves = randomGame(C, rule, rnd);
      if (moves.length < 6) continue;
      const jb = new C.Board(rule), wb = new W.Board(rule);
      for (const [x, y, p] of moves) { jb.play(x, y, p); wb.play(x, y, p); }
      out.push({ rule, moves, jb, wb });
    }
  });
  return out;
}

function main(W, a) {
  const E = W.exports;
  const pos = buildPositions(W, a);
  // Truy vấn checkWin: mọi quân trên bàn (quân của chính nó). Truy vấn forbidden: mọi ô trống cách quân <= 2 (Renju).
  const qWin = [], qFb = [];
  for (const s of pos) {
    for (const [x, y, p] of s.moves) qWin.push([s, x, y, p]);
    if (s.rule !== 'renju') continue;
    const seen = new Set();
    for (const [x, y] of s.moves) {
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
        const cx = x + dx, cy = y + dy, k = C.key(cx, cy);
        if (!seen.has(k) && s.jb.get(cx, cy) === 0) { seen.add(k); qFb.push([s, cx, cy]); }
      }
    }
  }
  const nW = qWin.length, nF = qFb.length, K = 50;
  const rows = [];
  const row = (name, ns) => rows.push({ phep: name, 'ns/lan': +ns.toFixed(1) });

  row('export rỗng (caro_buf_cap)', time(() => { let s = 0; for (let i = 0; i < nW; i++) s += E.caro_buf_cap(); return s; }, nW));
  row('checkWin JS (rules.js)', time(() => { let s = 0; for (const [b, x, y, p] of qWin) s += C.checkWin(b.jb, x, y, p) ? 1 : 0; return s; }, nW));
  row('checkWin WASM qua lớp bọc', time(() => { let s = 0; for (const [b, x, y, p] of qWin) s += W.checkWin(b.wb, x, y, p) ? 1 : 0; return s; }, nW));
  row('checkWin WASM gọi thẳng export', time(() => { let s = 0; for (const [b, x, y, p] of qWin) s += E.caro_check_win(b.wb.h, x, y, p); return s; }, nW));
  row('checkWin WASM lặp bên trong', time(() => { let s = 0; for (const [b, x, y, p] of qWin) s += E.caro_repeat_check_win(b.wb.h, x, y, p, K); return s; }, nW * K));
  row('forbidden JS (rules.js)', time(() => { let s = 0; for (const [b, x, y] of qFb) s += C.forbidden(b.jb, x, y, 1) ? 1 : 0; return s; }, nF));
  row('forbidden WASM qua lớp bọc', time(() => { let s = 0; for (const [b, x, y] of qFb) s += W.forbidden(b.wb, x, y, 1) ? 1 : 0; return s; }, nF));
  row('forbidden WASM lặp bên trong', time(() => { let s = 0; for (const [b, x, y] of qFb) s += E.caro_repeat_forbidden(b.wb.h, x, y, 1, 10); return s; }, nF * 10));
  // Chỉ những ô qua được bước lọc nhanh (phần tính nặng: forbiddenAt đệ quy)
  const qHeavy = qFb.filter(([b, x, y]) => W.mayForbid(b.wb, x, y));
  row(`forbidden JS – ô qua bước lọc (${qHeavy.length})`, time(() => { let s = 0; for (const [b, x, y] of qHeavy) s += C.forbidden(b.jb, x, y, 1) ? 1 : 0; return s; }, qHeavy.length));
  row(`forbidden WASM – ô qua bước lọc`, time(() => { let s = 0; for (const [b, x, y] of qHeavy) s += W.forbidden(b.wb, x, y, 1) ? 1 : 0; return s; }, qHeavy.length));
  // Kiểu không trạng thái: mỗi lần chép cả dãy nước vào WASM và dựng lại bàn (so với JS dựng lại bàn + checkWin)
  const games = pos.map((s) => s.moves.map(([x, y]) => [x, y]));
  row('dựng bàn + checkWin JS (không trạng thái)', time(() => {
    let s = 0;
    for (let i = 0; i < pos.length; i++) {
      const b = new C.Board(pos[i].rule), ms = games[i];
      ms.forEach(([x, y], j) => b.play(x, y, j % 2 ? 2 : 1));
      const [x, y] = ms[ms.length - 1];
      s += C.checkWin(b, x, y, ms.length % 2 ? 1 : 2) ? 1 : 0;
    }
    return s;
  }, pos.length));
  row('checkWinMoves WASM (chép dãy nước + dựng bàn)', time(() => {
    let s = 0;
    for (let i = 0; i < pos.length; i++) s += W.checkWinMoves(pos[i].rule, games[i]) ? 1 : 0;
    return s;
  }, pos.length));
  const avgMoves = games.reduce((n, g) => n + g.length, 0) / games.length;
  console.log(`Node ${process.version}; ${pos.length} thế (trung bình ${avgMoves.toFixed(0)} nước), ${nW} truy vấn checkWin, ${nF} truy vấn forbidden (Renju).`);
  console.table(rows);
  for (const s of pos) s.wb.free();
}

const a = args();
load(a.wasm).then((W) => main(W, a)).catch((e) => { console.error(e); process.exit(1); });
