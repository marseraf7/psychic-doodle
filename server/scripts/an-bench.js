/*
 * Đo chất lượng phân tích ván (công cụ cho người phát triển, không chạy trên máy chủ).
 *   node server/scripts/an-bench.js [số ván=12] [ms=200] [luật=vn] [nút chuẩn=400000] [chế độ=new,old]
 * Bộ ván: máy tự đánh (engine theo số nút, ~12% nước chọn ngẫu nhiên trong 4 ứng viên đầu để có lỗi thật), cố định theo
 * hạt giống. Chuẩn: mỗi thế chấm sâu (mặc định 400k nút ≈ 3 giây / thế) – lưu đệm ở thư mục tạm, lần sau dùng lại.
 * Chế độ:
 *   new – analysis.js evaluate (theo số nút, bảng nhớ mới mỗi thế, điểm trung bình hai lớp cuối) – cách đang dùng
 *   new@<ms> – như new nhưng mỗi thế <ms> (đo lợi của việc tăng số nút)
 *   raw – như new nhưng điểm lớp cuối (không lấy trung bình hai lớp)
 *   old – cách cũ: theo giờ, một bảng nhớ chung cả ván, điểm lớp cuối
 *   refine@<k> – như new, rồi chấm lại k × số nút các thế quanh nước sát ngưỡng xếp loại (analysis.js refineList)
 * In: tỉ lệ xếp loại trùng chuẩn, nước bị đánh dấu oan / bỏ sót, sai số độ chính xác, độ ổn định (chạy 2 lần), thời gian.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const CARO = path.join(__dirname, '../../caro');

const FLAG = new Set(['inacc', 'mistake', 'blunder', 'miss']);

function lib() {
  return { C: require(path.join(CARO, 'rules.js')), EN: require(path.join(CARO, 'engine.js')), A: require(path.join(CARO, 'analysis.js')) };
}

/** Bộ sinh số ngẫu nhiên có hạt giống (mulberry32). */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ván máy tự đánh số k (cố định theo k). */
function makeGame(k, rule) {
  const { C, EN } = lib();
  const r = rng(1000 + k);
  const moves = [[0, 0]];
  const used = new Set(['0,0']);
  while (moves.length < 3) {
    const m = [Math.floor(r() * 5) - 2, Math.floor(r() * 5) - 2];
    if (!used.has(m + '')) { used.add(m + ''); moves.push(m); }
  }
  const board = new C.Board(rule);
  moves.forEach(([x, y], i) => board.play(x, y, i % 2 ? C.O : C.X));
  while (moves.length < 120) {
    const p = moves.length % 2 ? C.O : C.X;
    let m = EN.analyse(moves, { nodes: 4000, ms: 1e5, rule }).move;
    if (r() < 0.12) {
      const pos = new EN.Position(moves, rule);
      const c = pos.candidates(pos.side, 4);
      if (c.length) m = pos.xy(c[Math.floor(r() * c.length)]);
    }
    moves.push(m);
    board.play(m[0], m[1], p);
    if (C.checkWin(board, m[0], m[1], p)) break;
  }
  return moves;
}

/** Số thế cần chấm của ván (thế sau nước thắng không chấm). */
function lastPos(moves, rule) {
  const { C } = lib();
  const b = new C.Board(rule);
  for (let i = 0; i < moves.length; i++) {
    const [x, y] = moves[i], p = i % 2 ? C.O : C.X;
    b.play(x, y, p);
    if (C.checkWin(b, x, y, p)) return i;
  }
  return moves.length;
}

/**
 * Chấm cả ván theo một chế độ → evals (kèm alt khi cần, như an-pool.js). mode: 'new' | 'old' | { ref: số nút }.
 */
function evalGame(moves, rule, ms, mode) {
  const { EN, A } = lib();
  if (typeof mode === 'string' && mode.startsWith('refine@')) {
    // Lượt thường, rồi lượt kỹ cho các nước sát ngưỡng (như study.js): thế trước / sau nước đó và thế sau nước tốt nhất
    const k = +mode.slice(7), ev = evalGame(moves, rule, ms, 'new');
    const res = A.analyzeGame(moves, { rule, ms, evals: ev });
    let extra = 0;
    for (const i of A.refineList(res)) {
      for (const j of [i, i + 1]) if (ev[j]) { ev[j] = { ...A.evaluate(moves.slice(0, j), ms * k, rule), alt: ev[j].alt, q: ms }; extra++; }
      if (ev[i] && ev[i].move && ev[i + 1]) { ev[i].alt = { ...A.evaluate(moves.slice(0, i).concat([ev[i].move]), ms * k, rule), q: ms }; extra++; }
    }
    ev.extra = extra * k; // số thế quy đổi theo quỹ thường (để so cùng tổng thời gian)
    return ev;
  }
  const last = lastPos(moves, rule);
  const shared = { ms, tt: new Map(), qtt: new Map(), vtt: new Map(), rule }; // chế độ cũ: một bảng nhớ cả ván
  const one = (mv) => {
    if (mode === 'new') return A.evaluate(mv, ms, rule);
    if (typeof mode === 'string' && mode.startsWith('new@')) return { ...A.evaluate(mv, +mode.slice(4), rule), q: ms };
    if (mode === 'raw') return A.slim(EN.analyse(mv, { ...A.evalOpts(ms, rule), smooth: false }), ms);
    if (mode === 'old') return A.slim(EN.analyse(mv, shared), ms);
    return A.slim(EN.analyse(mv, { nodes: mode.ref, ms: 1e7, rule, smooth: true }), 1e9);
  };
  const ev = [];
  for (let i = 0; i <= last; i++) ev[i] = one(moves.slice(0, i));
  for (let i = 0; i < Math.min(last + 1, moves.length); i++) {
    // Chuẩn: chấm thế sau nước tốt nhất cho mọi nước khác nước tốt nhất; chế độ thử: như an-pool.js (altNeeded)
    const need = mode.ref ? ev[i] && ev[i + 1] !== undefined && !(ev[i].move[0] === moves[i][0] && ev[i].move[1] === moves[i][1]) : A.altNeeded(moves, ev, i);
    if (need) ev[i] = { ...ev[i], alt: one(moves.slice(0, i).concat([ev[i].move])) };
  }
  return ev;
}

function classify(moves, rule, ms, ev) {
  const { A } = lib();
  const r = A.analyzeGame(moves, { rule, ms, evals: ev });
  return { cls: r.moves.map((m) => m.cls), acc: r.acc };
}

// ------------------------------------------------------------------ Worker: chấm một ván
if (!isMainThread) {
  const { k, rule, ms, mode } = workerData;
  const moves = makeGame(k, rule);
  const t = Date.now();
  const ev = evalGame(moves, rule, ms, mode);
  parentPort.postMessage({ k, moves, ev, extra: ev.extra || 0, t: Date.now() - t });
  return;
}

// ------------------------------------------------------------------ Luồng chính
const [N = 12, MS = 200, RULE = 'vn', REF = 400000, MODES = 'new,old'] = process.argv.slice(2);
const n = +N, ms = +MS, ref = +REF;

/** Chạy jobs trên nhiều Worker (mỗi job một ván). */
function runAll(jobs, threads) {
  return new Promise((res, rej) => {
    const out = [];
    let next = 0, active = 0;
    const start = () => {
      if (next >= jobs.length) { if (!active) res(out); return; }
      const job = jobs[next++];
      active++;
      const w = new Worker(__filename, { workerData: job });
      w.once('message', (m) => out.push(m));
      w.once('error', rej);
      w.once('exit', () => { active--; start(); });
    };
    for (let i = 0; i < Math.min(threads, jobs.length); i++) start();
  });
}

(async () => {
  // Chế độ theo giờ nhạy với tranh CPU: chừa 1 lõi
  const threads = Math.max(1, os.cpus().length - 1);
  const cacheFile = path.join(os.tmpdir(), `caro-an-bench-ref-${RULE}-${ref}.json`);
  let refs = {};
  try { refs = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (e) { /* chưa có */ }
  const need = [];
  for (let k = 0; k < n; k++) if (!refs[k]) need.push({ k, rule: RULE, ms, mode: { ref } });
  if (need.length) {
    console.log(`chấm chuẩn ${need.length} ván (${ref} nút / thế)…`);
    for (const r of await runAll(need, os.cpus().length)) refs[r.k] = { moves: r.moves, ev: r.ev };
    fs.writeFileSync(cacheFile, JSON.stringify(refs));
  }
  const R = {};
  let plies = 0, flaggedRef = 0;
  for (let k = 0; k < n; k++) {
    R[k] = classify(refs[k].moves, RULE, 1e9, refs[k].ev);
    plies += R[k].cls.length;
    flaggedRef += R[k].cls.filter((c) => FLAG.has(c)).length;
  }
  console.log(`${n} ván, ${plies} nước, chuẩn đánh dấu ${flaggedRef} nước · ms = ${ms} · luật ${RULE}`);
  for (const mode of MODES.split(',')) {
    const runs = [];
    for (let rep = 0; rep < 2; rep++) {
      const jobs = Array.from({ length: n }, (_, k) => ({ k, rule: RULE, ms, mode }));
      const res = await runAll(jobs, threads);
      res.sort((a, b) => a.k - b.k);
      runs.push(res.map((r) => ({ ...classify(r.moves, RULE, ms, r.ev), t: r.t, ev: r.ev, extra: r.extra })));
    }
    let same = 0, falseF = 0, missF = 0, stable = 0, accErr = 0, accN = 0, t = 0, wcErr = 0, wcN = 0, extra = 0, npos = 0;
    const { EN } = lib();
    for (let k = 0; k < n; k++) {
      const a = runs[0][k], b = runs[1][k], r = R[k];
      t += a.t; extra += a.extra || 0; npos += a.ev.filter(Boolean).length + a.ev.filter((e) => e && e.alt).length;
      for (let i = 0; i < r.cls.length; i++) {
        if (a.cls[i] === r.cls[i]) same++;
        if (FLAG.has(a.cls[i]) && !FLAG.has(r.cls[i])) falseF++;
        if (!FLAG.has(a.cls[i]) && FLAG.has(r.cls[i])) missF++;
        if (a.cls[i] === b.cls[i]) stable++;
      }
      for (const p of [1, 2]) { accErr += Math.abs(a.acc[p] - r.acc[p]); accN++; }
      // Sai số khả năng thắng từng thế so với chuẩn (thế không phải thắng / thua chắc)
      const re = refs[k].ev;
      for (let i = 0; i < re.length; i++) {
        if (!re[i] || !a.ev[i] || re[i].mate || a.ev[i].mate) continue;
        wcErr += Math.abs(EN.winChance(a.ev[i].score) - EN.winChance(re[i].score)); wcN++;
      }
    }
    const pc = (x) => (100 * x / plies).toFixed(1) + '%';
    console.log(`${mode.padEnd(4)} trùng chuẩn ${pc(same)} · đánh dấu oan ${falseF} · bỏ sót ${missF} · lệch độ chính xác ${(accErr / accN).toFixed(1)} điểm` +
      ` · lệch khả năng thắng ${(100 * wcErr / wcN).toFixed(1)}% · ổn định ${pc(stable)} · ${(t / n / 1000).toFixed(1)} s / ván` +
      (extra ? ` · chấm thêm ${(100 * extra / npos).toFixed(0)}% quỹ` : ''));
  }
})();
