/*
 * So tốc độ Rapfi bản gốc (native, sidecar của app desktop) với bản WebAssembly của app (caro/rapfi/) trên CÙNG máy,
 * CÙNG cấu hình (config.toml của worker.js), CÙNG mạng NNUE, 1 luồng, độ sâu cố định – điều kiện dừng của bước 4
 * trong docs/nghien-cuu-viet-lai-rust-17-11-2026.md: bản gốc phải nhanh hơn WASM ≥ 1,3 lần mỗi luồng.
 *
 *   node server/scripts/rapfi/bench-goc-wasm.js <pbrain-rapfi> [độ sâu=16] [luật=free,std,renju]
 *   RAPFI_NETS=<thư mục mạng .bin.lz4>   (mặc định server/scripts/rapfi/run – như driver-wasm.js)
 *   RAPFI_CARO_BIN=<pbrain-rapfi của Rapfi-CARO>   thêm luật vn (so với rapfi-caro-simd128.wasm)
 *
 * Bộ thế: đúng bộ thế "Search Bench" của Rapfi (command/benchmark.cpp), luật vn mượn 4 thế luật tự do trên bàn 20.
 * Mỗi thế: xoá bảng băm (YXHASHCLEAR), nghĩ tới MAX_DEPTH, đo thời gian bằng đồng hồ, số nút đọc ở dòng cuối Rapfi in.
 * Cùng mã + cùng thế nên số nút hai bản phải bằng nhau (in "số nút khớp"); khi đó tỉ lệ thời gian = tỉ lệ tốc độ.
 * In thêm một dòng JSON (BENCH_JSON=…) để CI đọc.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const RDIR = path.join(__dirname, '../../../caro/rapfi');
const W = require(path.join(RDIR, 'worker.js'));
const NETS_DIR = process.env.RAPFI_NETS || path.join(__dirname, 'run');

// Bộ thế của Rapfi bench (chữ = cột a.., số = hàng 1..; quân đen đi trước)
const SET = {
  free: [[15, 'h8g7f6g8g9'], [15, 'h2h5h4f6'], [20, 'e2f2h3g3g6h5f9'], [20, 'f5e3b7h5g3g4i6e4h4d4f2i5f4f6e5d6d7e7f8']],
  std: [[15, 'h8h7j6i7f7'], [15, 'f6i9h8'], [15, 'b3k10g2f6']],
  renju: [[15, 'h8i9j10i8i7g9'], [15, 'h8h9j9j8f8i7g7i9h6e9f6k7l6i10i6f9g9g11h10i11i8'], [15, 'h8h9h6i10i6i9g9g8j11i7']],
  vn: [[20, 'e2f2h3g3g6h5f9'], [20, 'f5e3b7h5g3g4i6e4h4d4f2i5f4f6e5d6d7e7f8'], [20, 'h8g7f6g8g9'], [20, 'h2h5h4f6']],
};

/** "h8g7" → [[7, 7], [6, 6]] (x = cột, y = hàng − 1). */
function parsePos(s) {
  const out = [];
  for (const m of s.matchAll(/([a-z])(\d+)/g)) out.push([m[1].charCodeAt(0) - 97, Number(m[2]) - 1]);
  return out;
}

/** Lệnh Gomocup cho một thế (giống nhau cho cả hai bản): phần chuẩn bị (không tính giờ) và khối BOARD (tính giờ). */
function commands(rule, size, moves, depth) {
  const side = moves.length % 2;
  return {
    setup: [`START ${size}`, `INFO rule ${W.RULE_N[rule]}`, 'INFO thread_num 1', 'INFO timeout_match 0',
      'INFO timeout_turn 3600000', `INFO max_depth ${depth}`, 'YXHASHCLEAR'],
    board: ['BOARD', ...moves.map(([x, y], i) => `${x},${y},${i % 2 === side ? 1 : 2}`), 'DONE'],
  };
}

/** Số nút ở dòng cuối "Speed 234K | Depth 5-5 | Eval -313 | Node 234K | Time 1ms" (Rapfi in ≥ 10.000 thành "K", ≥ 10
 *  triệu thành "M", cắt bớt). Thời gian Rapfi in cũng làm tròn (≥ 10 s chỉ còn giây) nên thời gian đo bằng đồng hồ ở đây. */
function lastNodes(lines) {
  let r = null;
  const mul = { '': 1, K: 1e3, M: 1e6, G: 1e9 };
  for (const l of lines) {
    const m = /\| Node (\d+)([KMG]?) \|/.exec(l);
    if (m) r = { text: m[1] + m[2], nodes: Number(m[1]) * mul[m[2]] };
  }
  return r;
}

/** Thư mục chạy tạm cho bản gốc: config.toml của worker.js + mô hình + mạng của luật. */
function runDir(rule) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caro-bench-' + rule + '-'));
  fs.writeFileSync(path.join(dir, 'config.toml'), W.config(rule));
  for (const f of ['model210901.bin', ...W.LOCAL[rule]]) fs.copyFileSync(path.join(RDIR, f), path.join(dir, f));
  for (const f of W.NETS[rule]) fs.copyFileSync(path.join(NETS_DIR, f), path.join(dir, f));
  return dir;
}

/** Bản gốc: một tiến trình mỗi luật, gửi lệnh qua stdin, chờ dòng "x,y". */
async function nativeEngine(bin, rule) {
  const dir = runDir(rule);
  const p = spawn(path.resolve(bin), [], { cwd: dir, stdio: ['pipe', 'pipe', 'ignore'] });
  let buf = '', lines = [], wait = null;
  p.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      lines.push(l);
      if (wait && wait.re.test(l)) { const w = wait; wait = null; w.done(); }
    }
  });
  // Chờ một dòng thoả re (hết 30 phút thì báo lỗi)
  const until = (re, cmds) => new Promise((res, rej) => {
    lines = [];
    const t = setTimeout(() => rej(new Error('bản gốc quá 30 phút không trả lời')), 1800000);
    wait = { re, done: () => { clearTimeout(t); res(lines); } };
    p.stdin.write(cmds.join('\n') + '\n');
  });
  return {
    // ABOUT trả lời ngay sau khi các lệnh trước nó xử lý xong: đồng bộ, để giờ đo chỉ gồm lượt nghĩ
    setup: (cmds) => until(/^name=/, [...cmds, 'ABOUT']),
    search: (cmds) => until(/^\d+,\d+$/, cmds),
    quit() { try { p.stdin.write('END\n'); } catch (e) { /* đã thoát */ } setTimeout(() => p.kill(), 300); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

/** Bản WASM của app (1 luồng, như driver-wasm.js): sendCommand chạy đồng bộ tới khi nghĩ xong. */
async function wasmEngine(rule) {
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
  return {
    async setup(cmds) { for (const c of cmds) mod.sendCommand(c); },
    // Khối BOARD … DONE gửi một lần (như driver-wasm.js); bản 1 luồng nghĩ xong mới trả về
    async search(cmds) { out = []; mod.sendCommand(cmds.join('\n')); return out; },
    quit() { /* hết tiến trình Node là xong */ },
  };
}

async function measure(engine, rule, depth) {
  // Khởi động: nghĩ nông một lượt cho Rapfi nạp mạng NNUE (nạp lười ở lượt nghĩ đầu) – không tính giờ
  const warm = commands(rule, SET[rule][0][0], parsePos(SET[rule][0][1]), 2);
  await engine.setup(warm.setup); await engine.search(warm.board);
  let nodes = 0, ms = 0;
  const per = [];
  for (const [size, s] of SET[rule]) {
    const c = commands(rule, size, parsePos(s), depth);
    await engine.setup(c.setup);
    const t = process.hrtime.bigint();
    const sp = lastNodes(await engine.search(c.board));
    ms += Number(process.hrtime.bigint() - t) / 1e6;
    if (!sp) throw new Error(`không đọc được số nút (${rule} ${s})`);
    nodes += sp.nodes; per.push(sp.text);
  }
  engine.quit();
  return { nodes, ms, nps: Math.round(nodes * 1000 / Math.max(1, ms)), per };
}

(async () => {
  const [BIN, DEPTH = '16', RULES = 'free,std,renju'] = process.argv.slice(2);
  if (!BIN) { console.error('Dùng: node bench-goc-wasm.js <pbrain-rapfi> [độ sâu] [luật,…]'); process.exit(2); }
  const rules = RULES.split(',');
  if (process.env.RAPFI_CARO_BIN && !rules.includes('vn')) rules.push('vn');
  const depth = Number(DEPTH);
  const res = {};
  let tn = 0, tw = 0, tnN = 0, twN = 0;
  console.log(`Rapfi gốc vs WASM · 1 luồng · độ sâu ${depth} · ${os.cpus()[0].model} · ${os.platform()}/${os.arch()}`);
  for (const rule of rules) {
    const bin = rule === 'vn' ? process.env.RAPFI_CARO_BIN : BIN;
    if (!bin) continue;
    const n = await measure(await nativeEngine(bin, rule), rule, depth);
    const w = await measure(await wasmEngine(rule), rule, depth);
    const same = n.per.join() === w.per.join(); // cùng chữ Rapfi in (đã làm tròn như nhau)
    res[rule] = { native: n.nps, wasm: w.nps, ratio: +(n.nps / w.nps).toFixed(2), sameNodes: same };
    console.log(`  ${rule.padEnd(5)} gốc ${n.nps} nút/s · WASM ${w.nps} nút/s · gốc/WASM ×${res[rule].ratio}` +
      ` · ${same ? 'số nút khớp' : 'SỐ NÚT LỆCH (gốc ' + n.per.join('/') + ', WASM ' + w.per.join('/') + ')'}`);
    if (rule !== 'vn') { tn += n.nodes; tw += w.nodes; tnN += n.ms; twN += w.ms; }
  }
  const ratio = tnN && twN ? +((tn / tnN) / (tw / twN)).toFixed(2) : null;
  console.log(`  Gộp 3 luật NNUE: gốc/WASM ×${ratio} – ngưỡng của lộ trình ×1.3: ${ratio >= 1.3 ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
  console.log('BENCH_JSON=' + JSON.stringify({ depth, ratio, rules: res }));
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
