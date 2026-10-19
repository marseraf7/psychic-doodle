/*
 * Tự đấu Rapfi WebAssembly (đúng bản của app, 1 luồng) giữa hai cách nghĩ A / B – đo các quyết định của caro/rapfi/brain.js
 * (đoán trúng, tự chia thời gian) bằng chính code app dùng. Công cụ cho người phát triển, không chạy trên máy chủ.
 *   node server/scripts/rapfi/rapfi-match.js <luật> <số khai cuộc> <ms> '<A json>' '<B json>' [số luồng song song]
 *   A / B: { "ponder": ms nghĩ trước (giả lập người chơi nghĩ – 0: không), "hit": đáp nhanh khi đoán trúng (mặc định
 *            true khi có ponder), "tm": tự chia thời gian }
 *   SPRT=elo0,elo1: kiểm định SPRT, đủ chứng cứ thì dừng sớm (sprt.js). RAPFI_NETS: thư mục mạng NNUE (xem driver-wasm.js).
 * Mỗi khai cuộc (openings.json – cân bằng) đánh 2 ván đổi bên, bàn Rapfi cố định (tự do / Việt Nam 20×20, tiêu chuẩn /
 * Renju 15×15), bảng băm và "bộ não" làm mới mỗi ván. Nghĩ trước chạy tuần tự ngay trước nước của đối thủ (như người chơi
 * nghĩ trong lúc BOAT chờ) nên không tranh CPU với đối thủ. In: điểm, Elo ± 95%, SPRT, thời gian TB mỗi nước, tỉ lệ đoán trúng.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const RDIR = path.join(__dirname, '../../../caro/rapfi');
const W = require(path.join(RDIR, 'worker.js'));
const Brain = require(path.join(RDIR, 'brain.js'));
const S = require('../sprt.js');

/** Một Rapfi 1 luồng (đồng bộ) + "bộ não" như rapfi/worker.js. */
async function engine(rule) {
  const NETS_DIR = process.env.RAPFI_NETS || process.env.RAPFI_DIR || path.join(__dirname, 'run');
  const factory = require(path.join(RDIR, W.ENGINE[rule] + '.js'));
  let out = [];
  const mod = await factory({
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
  const brain = Brain.create();
  const think = (moves, plan) => {
    for (const c of plan.cmds) send(c);
    const t0 = Date.now(), lines = send(W.boardCmd('BOARD', moves));
    const mv = lines.map((l) => /^(\d+),(\d+)$/.exec(l.trim())).find(Boolean);
    return { move: mv ? [Number(mv[1]), Number(mv[2])] : null, lines, used: Date.now() - t0 };
  };
  return {
    brain,
    newGame() { send('YXHASHCLEAR'); brain.reset(); },
    /** Nghĩ trước ms trên thế moves (đối thủ tới lượt) – như worker.js ponder. */
    ponder(moves, ms) { const r = think(moves, brain.plan(moves, ms)); brain.pondered(moves, r.lines, r.used); },
    /** BOAT đi: kế hoạch của brain.js (đoán trúng / tự chia thời gian) → { move, used, hit }. */
    play(moves, ms, o) {
      const plan = brain.plan(moves, ms, { play: true, tm: !!o.tm, hit: o.hit });
      const r = think(moves, plan);
      brain.done(plan, r.used, ms);
      return { move: r.move, used: r.used, hit: plan.hit };
    },
  };
}

async function runWorker() {
  const { rule, ms, A, B, jobs } = workerData;
  const C = require(path.join(RDIR, '../rules.js'));
  const ea = await engine(rule), eb = await engine(rule);
  const c = W.SIZE[rule] >> 1;
  for (const j of jobs) {
    // j.swap: B cầm X
    const side = j.swap ? { [C.X]: [eb, B], [C.O]: [ea, A] } : { [C.X]: [ea, A], [C.O]: [eb, B] };
    ea.newGame(); eb.newGame();
    const b = new C.Board(rule), mv = [];
    for (const [x, y] of j.opening) { b.play(x + c, y + c, mv.length % 2 ? C.O : C.X); mv.push([x + c, y + c]); }
    const stat = { A: { t: 0, n: 0, hit: 0 }, B: { t: 0, n: 0, hit: 0 } };
    let winner = 0;
    while (!winner && mv.length < 200) {
      const p = mv.length % 2 ? C.O : C.X, [e, o] = side[p];
      const r = e.play(mv, ms, o);
      const st = stat[o === A ? 'A' : 'B'];
      st.t += r.used; st.n++; if (r.hit) st.hit++;
      if (!r.move || b.get(r.move[0], r.move[1]) !== C.EMPTY) { winner = C.other(p); break; }
      b.play(r.move[0], r.move[1], p); mv.push(r.move);
      if (C.checkWin(b, r.move[0], r.move[1], p)) { winner = p; break; }
      // Đối thủ sắp nghĩ: bên vừa đi nghĩ trước o.ponder ms trên thế này (như BOAT nghĩ trước trong lúc người chơi nghĩ)
      if (o.ponder) e.ponder(mv, o.ponder);
    }
    const aSide = j.swap ? C.O : C.X;
    parentPort.postMessage({ k: j.k, swap: j.swap, a: winner === 0 ? 0.5 : winner === aSide ? 1 : 0, n: mv.length, stat });
  }
}

if (!isMainThread) runWorker();
else {
  const [rule = 'vn', NO = '16', MS = '400', AJ = '{}', BJ = '{}', PAR] = process.argv.slice(2);
  const A = JSON.parse(AJ), B = JSON.parse(BJ), OPEN = require('../openings.json')[rule];
  const jobs = [];
  for (let k = 0; k < Math.min(+NO, OPEN.length); k++) for (const swap of [false, true]) jobs.push({ k, swap, opening: OPEN[k] });
  const threads = Math.min(+PAR || Math.max(1, os.cpus().length), jobs.length);
  const sprt = S.parse(process.env.SPRT), tally = S.tally(), half = {}, workers = [];
  const tot = { A: { t: 0, n: 0, hit: 0 }, B: { t: 0, n: 0, hit: 0 } };
  let done = 0, len = 0, stopped = false;
  const t0 = Date.now();
  const report = (stop) => {
    const avg = (s) => `${s.n ? Math.round(s.t / s.n) : 0} ms / nước` + (s.hit ? ` · đoán trúng ${Math.round((100 * s.hit) / s.n)}%` : '');
    console.log(`${rule} ${MS} ms · A ${AJ} vs B ${BJ}: ${done} ván · TB ${Math.round(len / Math.max(1, done))} nước · ${Math.round((Date.now() - t0) / 1000)} giây`);
    console.log(`  A: ${avg(tot.A)} · B: ${avg(tot.B)}`);
    console.log('  ' + (stop ? 'dừng sớm – ' : '') + S.format(S.summary(tally, sprt), sprt));
  };
  for (let w = 0; w < threads; w++) {
    const wk = new Worker(__filename, { workerData: { rule, ms: +MS, A, B, jobs: jobs.filter((_, i) => i % threads === w) } });
    workers.push(wk);
    wk.on('error', (e) => { console.error(e); process.exitCode = 1; });
    wk.on('message', (r) => {
      if (stopped) return;
      done++; len += r.n;
      for (const s of ['A', 'B']) for (const f of ['t', 'n', 'hit']) tot[s][f] += r.stat[s][f];
      if (r.k in half) { tally.pair(half[r.k], r.a); delete half[r.k]; } else half[r.k] = r.a;
      if (sprt && S.summary(tally, sprt).verdict) { stopped = true; report(true); workers.forEach((x) => x.terminate()); return; }
      if (done === jobs.length) report(false);
    });
  }
}
