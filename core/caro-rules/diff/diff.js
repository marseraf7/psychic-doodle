#!/usr/bin/env node
/*
 * Kiểm thử đối chiếu caro/rules.js ↔ lõi luật Rust (WASM). Yêu cầu: 0 sai khác.
 * Chạy (sau bash core/caro-rules/build-wasm.sh):
 *   node core/caro-rules/diff/diff.js [--positions=60000] [--seed=20261119] [--wasm=đường/dẫn.wasm]
 * --positions: số thế tối thiểu từ ván ngẫu nhiên, chia đều 4 luật (chưa kể thế ghi sẵn và đám quân).
 * Thoát mã 1 nếu có sai khác (in tối đa 20 mẫu kèm thế cờ để tái hiện).
 */
'use strict';

const path = require('path');
const C = require(path.join(__dirname, '..', '..', '..', 'caro', 'rules.js'));
const { load } = require(path.join(__dirname, '..', 'js', 'rules-wasm.js'));
const { mulberry32, randomGame, randomBlob, LIM } = require('./gen.js');
const { fixtureGames, fixtureStatic } = require('./fixtures.js');
const { Checker, addStone } = require('./compare.js');

const RULES = ['vn', 'free', 'std', 'renju'];

function args() {
  const a = { positions: 60000, seed: 20261119, wasm: undefined };
  for (const s of process.argv.slice(2)) {
    const m = /^--(\w+)=(.*)$/.exec(s);
    if (m && m[1] in a) a[m[1]] = m[1] === 'wasm' ? m[2] : Number(m[2]);
  }
  return a;
}

/** Phát lại một ván trên hai bàn, so từng thế. Thỉnh thoảng thử nước sai (trùng ô / ngoài khoảng) và lùi-đánh lại. */
function runGame(ck, W, rule, moves, rnd) {
  const jb = new C.Board(rule), wb = new W.Board(rule), cand = new Map(), stones = [];
  if (jb.rule !== wb.rule) ck.diff(rule, 'ruleOf', null, jb.rule, wb.rule, stones);
  try {
    for (const [x, y, p] of moves) {
      if (rnd && stones.length && rnd() < 0.03) {
        const [ox, oy] = stones[Math.floor(rnd() * stones.length)];
        ck.play(rule, jb, wb, ox, oy, p, stones); // trùng ô
        ck.play(rule, jb, wb, rnd() < 0.5 ? LIM : -LIM - 1, y, p, stones); // ngoài khoảng
      }
      if (!ck.play(rule, jb, wb, x, y, p, stones)) break;
      stones.push([x, y, p]);
      addStone(C, jb, cand, x, y);
      ck.position(rule, jb, wb, [x, y, p], cand, stones);
      if (rnd && rnd() < 0.05) ck.undoRedo(rule, jb, wb, stones);
    }
    const mj = jb.moves, mw = wb.moves;
    if (JSON.stringify(mj) !== JSON.stringify(mw)) ck.diff(rule, 'moves', null, mj.length, mw.length, stones);
  } finally {
    wb.free();
  }
}

/** Thế đặt tay bằng put (không theo lượt). */
function runStatic(ck, W, rule, stones) {
  const jb = new C.Board(rule), wb = new W.Board(rule), cand = new Map();
  try {
    for (const [x, y, p] of stones) { jb.put(x, y, p); wb.put(x, y, p); }
    for (const [x, y] of stones) addStone(C, jb, cand, x, y);
    ck.staticPosition(rule, jb, wb, cand, stones);
  } finally {
    wb.free();
  }
}

/** Hàm nhỏ: ruleOf, key, winLen, other. */
function runScalars(ck, W) {
  for (const r of ['vn', 'free', 'std', 'renju', 'abc', '', 'RENJU', 'renju ', undefined, null, 3, 'Việt', '自由']) {
    if (C.ruleOf(r) !== W.ruleOf(r)) ck.diff('vn', 'ruleOf', [String(r)], C.ruleOf(r), W.ruleOf(r), []);
  }
  for (const [x, y] of [[0, 0], [-LIM, -LIM], [LIM - 1, LIM - 1], [1, -2097152], [123456, -654321], [2147483647, -2147483648]]) {
    if (C.key(x, y) !== W.key(x, y)) ck.diff('vn', 'key', [x, y], C.key(x, y), W.key(x, y), []);
  }
  for (const rule of [...RULES, 'abc']) {
    for (const p of [1, 2]) {
      for (let len = 1; len <= 9; len++) {
        for (const a of [false, true]) {
          for (const b of [false, true]) {
            const j = C.winLen(rule, p, len, () => a, () => b), w = W.winLen(rule, p, len, () => a, () => b);
            if (j !== w) ck.diff('vn', 'winLen', [rule, p, len, a, b], j, w, []);
          }
        }
      }
    }
  }
}

function summary(ck, ms) {
  const rows = Object.entries(ck.stats).map(([rule, s]) => ({
    luat: rule, the: s.positions, checkWin: s.checkWin, thang: s.wins, winsIfPlaced: s.winsIfPlaced, 'dat-thu-thang': s.winsIfPlacedTrue,
    forbidden: s.forbidden, 'cam-quaNam': s.reasons.overline, 'cam-44': s.reasons['44'], 'cam-33': s.reasons['33'],
    'soat-loc': s.raw, 'loi-play': s.playErrors, undo: s.undo, 'sai-khac': s.diffs,
  }));
  console.table(rows);
  const tot = rows.reduce((a, r) => { for (const k of Object.keys(r)) if (k !== 'luat') a[k] = (a[k] || 0) + r[k]; return a; }, {});
  console.log('Tổng:', JSON.stringify(tot));
  console.log(`Thời gian: ${(ms / 1000).toFixed(1)} s`);
  return tot;
}

async function main() {
  const a = args();
  const W = await load(a.wasm);
  const ck = new Checker(C, W);
  const t0 = Date.now();
  runScalars(ck, W);
  // 1. Thế ghi sẵn trong kho
  for (const g of fixtureGames(RULES)) runGame(ck, W, g.rule, g.moves, null);
  for (const f of fixtureStatic()) runStatic(ck, W, f.rule, f.stones);
  const fixed = Object.values(ck.stats).reduce((n, s) => n + s.positions, 0);
  console.log(`Thế ghi sẵn (bài đố, khai cuộc, rules.test.js): ${fixed}`);
  // 2. Ván ngẫu nhiên có hạt giống, chia đều 4 luật; 3. đám quân dày đặc
  const per = Math.ceil(a.positions / RULES.length);
  RULES.forEach((rule, i) => {
    const rnd = mulberry32(a.seed + i * 7919);
    const startPos = ck.st(rule).positions;
    let games = 0;
    while (ck.st(rule).positions - startPos < per) { runGame(ck, W, rule, randomGame(C, rule, rnd), rnd); games++; }
    for (let k = 0; k < 1500; k++) runStatic(ck, W, rule, randomBlob(rnd));
    console.log(`${rule}: ${games} ván ngẫu nhiên + 1500 đám quân`);
  });
  const tot = summary(ck, Date.now() - t0);
  if (ck.prefilterMiss.length) {
    console.log(`\nSoát bước lọc: mayForbid bỏ sót ${ck.prefilterMiss.length} nước cấm (lỗi của rules.js, xem mẫu):`);
    for (const m of ck.prefilterMiss.slice(0, 5)) console.log(JSON.stringify(m));
  } else {
    console.log(`Soát bước lọc mayForbid: ${tot['soat-loc']} ô Renju, không bỏ sót nước cấm nào.`);
  }
  if (ck.totalDiffs) {
    console.log(`\n✗ ${ck.totalDiffs} sai khác JS ↔ Rust. Mẫu:`);
    for (const d of ck.diffs) console.log(JSON.stringify(d));
    process.exit(1);
  }
  console.log(`\n✓ 0 sai khác JS ↔ Rust trên ${tot.the} thế (${tot.checkWin} checkWin, ${tot.winsIfPlaced} winsIfPlaced, ${tot.forbidden} forbidden).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
