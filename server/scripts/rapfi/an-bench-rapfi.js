/*
 * Đo chất lượng phân tích ván bằng Rapfi WebAssembly (như rapfi-analysis.js, 1 luồng) – công cụ cho người phát triển.
 *   node server/scripts/rapfi/an-bench-rapfi.js [luật=vn] [số ván=12] [ms=300] [chế độ=time,node,nodec] [hệ số chuẩn=8]
 * Bộ ván: máy tự đánh (engine của game, ~12% nước chọn ngẫu nhiên trong 4 ứng viên đầu – như an-bench.js), đặt vào giữa
 * bàn Rapfi (ván không vừa bàn thì bỏ). Chuẩn: Rapfi chấm hệ số × số nút mỗi thế, bảng băm mới (lưu đệm ở thư mục tạm).
 * Chế độ:
 *   time  – cách cũ: theo giờ (timeout_turn ms), bảng băm giữ suốt ván (thứ tự chấm làm đổi kết quả)
 *   node  – theo số nút ((ms − 30) × KNPS: cùng thời gian thật như time), bảng băm mới mỗi thế (YXHASHCLEAR)
 *   nodec – theo số nút, bảng băm giữ suốt ván
 * In: tỉ lệ xếp loại trùng chuẩn, nước bị đánh dấu oan / bỏ sót, lệch độ chính xác, ổn định (chạy 2 lần), độ sâu TB,
 * thời gian, tốc độ (nghìn nút / giây – dùng đặt KNPS trong rapfi-analysis.js). Cần RAPFI_NETS (luật khác vn).
 * KNPS=…: đặt tốc độ chuẩn (khỏi đo lại) · NODE_MULT=…: số nút của node / nodec gấp ngần này (chuẩn giữ nguyên) ·
 * THREADS=…: số Worker song song (mặc định số lõi; 1 = đo tốc độ khi máy rảnh – dùng đặt KNPS của app).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const CARO = path.join(__dirname, '../../../caro');
const RDIR = path.join(CARO, 'rapfi');
const W = require(path.join(RDIR, 'worker.js'));
const FLAG = new Set(['inacc', 'mistake', 'blunder', 'miss']);

function lib() {
  const C = require(path.join(CARO, 'rules.js'));
  globalThis.Caro = C;
  const EN = require(path.join(CARO, 'engine.js')), A = require(path.join(CARO, 'analysis.js'));
  // Đổi điểm Rapfi → thang của engine.js đúng như app: nạp rapfi-analysis.js với window giả
  if (!globalThis.window) {
    globalThis.window = { Caro: C, CaroAnalysis: A };
    // eslint-disable-next-line no-eval
    (0, eval)(fs.readFileSync(path.join(CARO, 'rapfi-analysis.js'), 'utf8'));
  }
  return { C, EN, A, convert: globalThis.window.CaroRapfiAn.convert };
}

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ván máy tự đánh số k (như an-bench.js makeGame). */
function makeGame(k, rule) {
  const { C, EN } = lib();
  const r = rng(1000 + k);
  const moves = [[0, 0]], used = new Set(['0,0']);
  while (moves.length < 3) {
    const m = [Math.floor(r() * 5) - 2, Math.floor(r() * 5) - 2];
    if (!used.has(m + '')) { used.add(m + ''); moves.push(m); }
  }
  const board = new C.Board(rule);
  moves.forEach(([x, y], i) => board.play(x, y, i % 2 ? C.O : C.X));
  while (moves.length < 100) {
    const p = moves.length % 2 ? C.O : C.X;
    let m = EN.analyse(moves, { nodes: 4000, ms: 1e5, rule }).move;
    if (r() < 0.12) {
      const pos = new EN.Position(moves, rule), c = pos.candidates(pos.side, 4);
      if (c.length) m = pos.xy(c[Math.floor(r() * c.length)]);
    }
    if (C.forbidden && C.forbidden(board, m[0], m[1], p)) break;
    moves.push(m); board.play(m[0], m[1], p);
    if (C.checkWin(board, m[0], m[1], p)) break;
  }
  return moves;
}

/** Khung đặt cả ván vào giữa bàn Rapfi (như rapfi-board.js frame) – null nếu không vừa (cách mép < 2 ô). */
function frameOf(moves, n) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of moves) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  if (w > n - 4 || h > n - 4) return null;
  return { ox: x0 - Math.floor((n - w) / 2), oy: y0 - Math.floor((n - h) / 2) };
}

async function engine(rule) {
  const NETS_DIR = process.env.RAPFI_NETS || path.join(__dirname, 'run');
  let out = [];
  const mod = await require(path.join(RDIR, W.ENGINE[rule] + '.js'))({
    locateFile: (f) => path.join(RDIR, W.wasmName(rule, f)),
    onFS: (FS) => {
      FS.writeFile('/config.toml', W.config(rule));
      for (const f of ['model210901.bin', ...W.LOCAL[rule]]) FS.writeFile('/' + f, fs.readFileSync(path.join(RDIR, f)));
      for (const f of W.NETS[rule]) FS.writeFile('/' + f, fs.readFileSync(path.join(NETS_DIR, f)));
    },
    onReceiveStdout: (l) => out.push(l),
    onReceiveStderr: () => {},
  });
  const send = (c) => { out = []; mod.sendCommand(c); return out; };
  send('START ' + W.SIZE[rule]);
  for (const c of [`INFO rule ${W.RULE_N[rule]}`, 'INFO timeout_match 0', 'INFO thread_num 1', 'INFO max_memory 0']) send(c);
  return { send };
}

/** Chấm cả ván (thế + thế sau nước tốt nhất khi cần – như rapfi-analysis.js) theo một chế độ. */
async function evalGame(e, moves, rule, ms, mode, knps) {
  const { A, convert, C } = lib();
  const B = require(path.join(RDIR, 'brain.js')).create();
  const f = frameOf(moves, W.SIZE[rule]);
  const b = new C.Board(rule);
  let last = moves.length;
  for (let i = 0; i < moves.length; i++) { const [x, y] = moves[i], p = i % 2 ? C.O : C.X; b.play(x, y, p); if (C.checkWin(b, x, y, p)) { last = i; break; } }
  const nodes = Math.round(require(path.join(RDIR, 'brain.js')).fixedTime(ms) * knps); // cùng thời gian thật như chế độ time (knps: nút / ms)
  let depth = 0, cnt = 0, speed = 0, sn = 0;
  const one = (mv) => {
    if (!mv.length) return { move: [0, 0], score: 0, mate: null, q: ms, src: 'rapfi' };
    const cmds = mode === 'time' ? B.plan(mv, ms).cmds
      : (mode === 'node' || mode === 'ref' ? ['YXHASHCLEAR'] : []).concat(B.plan(mv, ms, { nodes: mode === 'ref' ? nodes * workerData.refK : Math.round(nodes * workerData.mult) }).cmds);
    for (const c of cmds) e.send(c);
    const lines = e.send(W.boardCmd('BOARD', mv.map(([x, y]) => [x - f.ox, y - f.oy])));
    const m = lines.map((l) => /^(\d+),(\d+)$/.exec(l.trim())).find(Boolean);
    // "Speed 42976 | Depth 14-17 | … | Node 13K | Time 304ms" – dưới 100K Rapfi in số thường, từ 100K in kèm "K"
    const sp = lines.map((l) => /Speed \d+K? \| Depth (\d+)-\d+ \| Eval \S+ \| Node (\d+)(K?) \| Time (\d+)ms/.exec(l)).find(Boolean);
    if (sp) { depth += +sp[1]; cnt++; speed += (+sp[2]) * (sp[3] ? 1000 : 1); sn += +sp[4]; }
    const move = m ? [+m[1] + f.ox, +m[2] + f.oy] : null;
    let ev = W.parseEval(lines);
    if (!ev && move) { const bb = new C.Board(rule); mv.forEach(([x, y], i) => bb.play(x, y, i % 2 ? C.O : C.X)); if (C.winsIfPlaced(bb, move[0], move[1], mv.length % 2 ? C.O : C.X)) ev = { cp: 20000, mate: 1 }; }
    return convert(ev, move, ms, rule);
  };
  if (mode === 'time' || mode === 'nodec') e.send('YXHASHCLEAR'); // ván mới
  const ev = [];
  for (let i = 0; i <= last; i++) ev[i] = one(moves.slice(0, i));
  for (let i = 0; i < Math.min(last + 1, moves.length); i++) if (A.altNeeded(moves, ev, i)) ev[i] = { ...ev[i], alt: one(moves.slice(0, i).concat([ev[i].move])) };
  return { ev, depth: depth / Math.max(1, cnt), nodes: speed, ms: sn };
}

if (!isMainThread) {
  (async () => {
    const { rule, ms, mode, knps, games } = workerData;
    workerData.mult = +process.env.NODE_MULT || 1; // thử số nút gấp NODE_MULT cho node / nodec (chuẩn giữ nguyên)
    const e = await engine(rule);
    for (const g of games) {
      const t = Date.now();
      const r = await evalGame(e, g.moves, rule, ms, mode, knps);
      parentPort.postMessage({ k: g.k, ...r, t: Date.now() - t });
    }
    process.exit(0);
  })();
  return;
}

function runAll(games, data, threads) {
  return new Promise((res, rej) => {
    const out = [], parts = Array.from({ length: threads }, (_, w) => games.filter((_, i) => i % threads === w)).filter((p) => p.length);
    let left = parts.length;
    for (const part of parts) {
      const w = new Worker(__filename, { workerData: { ...data, games: part } });
      w.on('message', (m) => out.push(m));
      w.on('error', rej);
      w.on('exit', () => { if (--left === 0) res(out.sort((a, b) => a.k - b.k)); });
    }
  });
}

(async () => {
  const [RULE = 'vn', N = '12', MS = '300', MODES = 'time,node,nodec', REFK = '8'] = process.argv.slice(2);
  const ms = +MS, refK = +REFK, threads = +process.env.THREADS || Math.max(1, os.cpus().length);
  const { A } = lib();
  const games = [];
  for (let k = 0; games.length < +N && k < 4 * +N; k++) {
    const moves = makeGame(k, RULE);
    if (frameOf(moves, W.SIZE[RULE]) && moves.length >= 12) games.push({ k, moves });
  }
  // Tốc độ chuẩn (nghìn nút / giây) cho chế độ theo số nút: đo bằng chế độ time trên máy này (KNPS=… để ghi đè)
  let knps = +process.env.KNPS || 0;
  const t1 = knps ? null : await runAll(games, { rule: RULE, ms, mode: 'time', knps: 1, refK }, threads);
  if (!knps) knps = Math.round(t1.reduce((t, r) => t + r.nodes, 0) / Math.max(1, t1.reduce((t, r) => t + r.ms, 0))); // nghìn nút / giây = nút / ms
  console.log(`${RULE} · ${games.length} ván · ${ms} ms / thế · tốc độ chuẩn ${knps}K nút / giây · chuẩn ×${refK}`);
  const cacheFile = path.join(os.tmpdir(), `caro-an-bench-rapfi-${RULE}-${ms}-${knps}-${refK}.json`);
  let ref = null;
  try { ref = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (e) { /* chưa có */ }
  if (!ref || ref.length !== games.length) {
    ref = await runAll(games, { rule: RULE, ms, mode: 'ref', knps, refK }, threads);
    fs.writeFileSync(cacheFile, JSON.stringify(ref));
  }
  const cls = (g, ev) => A.analyzeGame(g.moves, { rule: RULE, ms, evals: ev });
  const R = games.map((g, i) => cls(g, ref[i].ev));
  const plies = R.reduce((t, r) => t + r.moves.length, 0);
  console.log(`  chuẩn: ${plies} nước, đánh dấu ${R.reduce((t, r) => t + r.moves.filter((m) => FLAG.has(m.cls)).length, 0)} · độ sâu TB ${(ref.reduce((t, r) => t + r.depth, 0) / ref.length).toFixed(1)}`);
  for (const mode of MODES.split(',')) {
    const runs = [mode === 'time' && t1 ? t1 : await runAll(games, { rule: RULE, ms, mode, knps, refK }, threads), await runAll(games, { rule: RULE, ms, mode, knps, refK }, threads)];
    let same = 0, falseF = 0, missF = 0, stable = 0, accErr = 0, accN = 0, t = 0, depth = 0;
    games.forEach((g, i) => {
      const a = cls(g, runs[0][i].ev), b = cls(g, runs[1][i].ev), r = R[i];
      t += runs[0][i].t; depth += runs[0][i].depth;
      r.moves.forEach((m, j) => {
        if (a.moves[j].cls === m.cls) same++;
        if (FLAG.has(a.moves[j].cls) && !FLAG.has(m.cls)) falseF++;
        if (!FLAG.has(a.moves[j].cls) && FLAG.has(m.cls)) missF++;
        if (a.moves[j].cls === b.moves[j].cls) stable++;
      });
      for (const p of [1, 2]) { accErr += Math.abs(a.acc[p] - r.acc[p]); accN++; }
    });
    const pc = (x) => (100 * x / plies).toFixed(1) + '%';
    console.log(`  ${mode.padEnd(5)} trùng chuẩn ${pc(same)} · đánh dấu oan ${falseF} · bỏ sót ${missF} · lệch độ chính xác ${(accErr / accN).toFixed(1)} điểm` +
      ` · ổn định ${pc(stable)} · độ sâu TB ${(depth / games.length).toFixed(1)} · ${(t / games.length / 1000).toFixed(1)} s / ván`);
  }
})();
