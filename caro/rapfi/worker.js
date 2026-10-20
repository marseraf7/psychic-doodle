/*
 * Worker chạy Rapfi (bản WebAssembly) làm "bộ não" của BOAT ở luật tự do / tiêu chuẩn / Renju, và Rapfi-CARO (Rapfi
 * thêm luật Việt Nam – bản vá build/rapfi-caro.patch, xem SOURCE.md) ở luật Việt Nam.
 *
 * Rapfi – engine Gomoku / Renju vô địch Gomocup – Copyright (C) Rapfi developers, giấy phép GPL-3
 * (https://github.com/dhbloo/rapfi, bản sao lưu https://github.com/marseraf7/rapfi). File này cùng các file rapfi-single*.js / *.wasm trong thư mục này được phát hành
 * theo GPL-3 (xem COPYING.txt; mã nguồn và cách dựng lại: SOURCE.md). Mạng NNUE "mix9svq" và mô hình cổ điển của Rapfi
 * là CC0 (https://github.com/dhbloo/rapfi-networks, bản sao lưu https://github.com/marseraf7/rapfi-networks) – mạng ~10 MB
 * chỉ tải khi cần, rồi giữ trong Cache Storage.
 *
 * Luật Việt Nam không có mạng NNUE: Rapfi-CARO dùng đánh giá cổ điển với bảng học riêng (model-caro.bin, ~27 KB, đi kèm
 * app) – không tải gì từ CDN.
 *
 * Mỗi Worker chỉ phục vụ một luật (đổi luật thì trang tạo Worker mới). Giao tiếp:
 *   vào  { type: 'init', rule }                  – tải mạng (kiểm SHA-256) + khởi động Rapfi + thử nạp mạng NNUE
 *        { type: 'move', id, size, moves, ms, play, tm, nodes, fresh } – moves: [[x, y], …] toạ độ 0..size-1, X đi trước.
 *                                                  play: BOAT đi (tm: tự chia thời gian; đoán trúng lúc nghĩ trước thì
 *                                                  đáp nhanh) · nodes: phân tích chấm thế theo số nút – xem brain.js
 *        { type: 'game' }                         – ván mới: quên lượt nghĩ trước và quỹ giờ
 *        { type: 'threads', n }                   – đổi số luồng (bản đa luồng – máy nóng / pin yếu: rapfi-load.js)
 *        { type: 'ponder', id, moves, ms }        – nghĩ trước trên thế người chơi tới lượt (tối đa ms), từng lát
 *                                                  PONDER_SLICE ms; tin mới bất kỳ (kể cả { type: 'stop' }) làm dừng
 *   ra   { type: 'progress', pct } · { type: 'ready' } · { type: 'error', msg }
 *        { type: 'move', id, move: [x, y] | null, ev: { cp, mate } | null, used: ms, hit } · { type: 'pondered', id }
 *          cp: điểm Rapfi (góc nhìn bên đi; khả năng thắng = 1 / (1 + e^(−cp / 200))),
 *          mate: ±số nửa nước tới thắng (+) / thua (−) chắc, 0 = chưa thấy
 */
'use strict';
// Quyết định cách nghĩ mỗi lượt (đoán trúng, tự chia thời gian, số nút) – dùng chung với công cụ đo trong Node
const Brain = typeof module !== 'undefined' && module.exports ? require('./brain.js') : (importScripts('brain.js'), self.RapfiBrain);
const NETS_COMMIT = 'e32ad77a5364363b3e3a02b3f9e8610ade19ea98'; // rapfi-networks, ghim để mạng khớp bản engine
const NETS = {
  free: ['mix9svqfreestyle_bsmix.bin.lz4'],
  std: ['mix9svqstandard_bs15.bin.lz4'],
  renju: ['mix9svqrenju_bs15_black.bin.lz4', 'mix9svqrenju_bs15_white.bin.lz4'],
  vn: [],
};
const RULE_N = { free: 0, std: 1, renju: 4, vn: 8 }; // mã luật trong giao thức Piskvork của Rapfi (8: caro – Rapfi-CARO)
const SIZE = { free: 20, std: 15, renju: 15, vn: 20 }; // cỡ bàn đúng với mạng đã học (boat-rapfi.js dùng cùng số)
// Bản dựng: Rapfi nguyên bản cho 3 luật Gomoku, Rapfi-CARO cho luật Việt Nam (tách riêng để 3 luật kia không đổi gì)
const ENGINE = { free: 'rapfi-single-simd128', std: 'rapfi-single-simd128', renju: 'rapfi-single-simd128', vn: 'rapfi-caro-simd128' };
// Bản đa luồng (pthread): chỉ khi trang được cô lập cross-origin (có SharedArrayBuffer – máy chủ gửi Document-Isolation-Policy,
// xem server/src/web.js); không thì bản 1 luồng như cũ. Rapfi nghĩ ở luồng riêng, trả lời qua stdout bất đồng bộ.
const ENGINE_MT = { free: 'rapfi-multi-simd128', std: 'rapfi-multi-simd128', renju: 'rapfi-multi-simd128', vn: 'rapfi-caro-multi-simd128' };
const ISO = typeof self !== 'undefined' && self.crossOriginIsolated === true && typeof SharedArrayBuffer === 'function';
let MT = ISO; // init: người chơi tắt "Rapfi đa luồng" (Cài đặt – rapfi-settings.js) thì dùng bản một luồng
// File đi kèm app (cùng thư mục) cần cho từng luật, ngoài mô hình cổ điển model210901.bin
const LOCAL = { free: [], std: [], renju: [], vn: ['model-caro.bin'] };
// Kích thước + SHA-256 từng file (commit NETS_COMMIT): tải đứt / sai thì không lưu, không dùng – nếu không Rapfi lặng lẽ
// tắt mạng NNUE và chơi yếu hẳn mà không báo lỗi
const SPEC = {
  'mix9svqfreestyle_bsmix.bin.lz4': [10030398, '6bc0d1b0ff8e1d857f7f412923cd458f38f1a435087c91ae71fec3676c23ef62'],
  'mix9svqstandard_bs15.bin.lz4': [10345775, '84334f5db96f45b3e36ebdde06d2259d878ae1eb347b7cf74574ac908b8d9e7d'],
  'mix9svqrenju_bs15_black.bin.lz4': [9984172, '7ab8c974c30da07717ce6a504616a62ac8c981500503f0ced0fadefd3f46c5ec'],
  'mix9svqrenju_bs15_white.bin.lz4': [9844944, 'a31f318518d3b5630489054d9eb013fd5353c553999640c2bcfd8d95e6fe4e4e'],
  'model210901.bin': [30109, '34061bca4031a786a4b0ff52470fa9f316013c4c2239db0d70581a3c35d0a72a'],
  'model-caro.bin': [26819, '0bc9cc3f6e3099144b19240252ff89c11d3d68578252fe306e32320a20638dae'],
};
const NET_CACHE = 'caro-rapfi-nets-v1'; // tách khỏi bộ nhớ đệm của sw.js nên không bị xoá khi app cập nhật
// Thứ tự thử: cùng máy chủ (nếu người triển khai đặt sẵn vào rapfi/nets/), rồi jsDelivr / GitHub raw của bản sao lưu
// (fork marseraf7/rapfi-networks), cuối cùng kho gốc dhbloo/rapfi-networks – cùng commit nên cùng nội dung
const REPOS = ['marseraf7/rapfi-networks', 'dhbloo/rapfi-networks'];
const sources = (f) => [
  'nets/' + f,
  ...REPOS.map((r) => `https://cdn.jsdelivr.net/gh/${r}@${NETS_COMMIT}/mix9svq/${f}`),
  ...REPOS.map((r) => `https://raw.githubusercontent.com/${r}/${NETS_COMMIT}/mix9svq/${f}`),
];
// Khoá trong Cache Storage: giữ như bản đầu (URL jsDelivr của kho gốc) để mạng đã tải không phải tải lại
const cacheKey = (f) => `https://cdn.jsdelivr.net/gh/dhbloo/rapfi-networks@${NETS_COMMIT}/mix9svq/${f}`;

/** Tên file Emscripten cần (glue JS gọi theo tên dự án rapfi-single-simd128.*) → file của bản dựng cho luật. */
const wasmName = (rule, f, mt) => f.replace(/^rapfi-(single|multi)-simd128\./, (mt ? ENGINE_MT : ENGINE)[rule] + '.');

let mod = null, out = [], waiter = null;

/** Trình duyệt có WebAssembly SIMD không (kiểm bằng một hàm nhỏ dùng lệnh v128). */
function hasSimd() {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch (e) { return false; }
}

/** File đúng kích thước và đúng SHA-256 (không có crypto.subtle – trang không an toàn – thì chỉ kiểm kích thước). */
async function intact(file, buf) {
  const [size, sha] = SPEC[file];
  if (buf.byteLength !== size) return false;
  const subtle = self.crypto && self.crypto.subtle;
  if (!subtle) return true;
  const h = new Uint8Array(await subtle.digest('SHA-256', buf));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('') === sha;
}

async function openCache() { try { return await caches.open(NET_CACHE); } catch (e) { return null; } }
/** Xoá mạng của luật khỏi Cache Storage (Rapfi không nạp được dù đã qua kiểm tra) – lần sau tải lại. */
async function evict(files) {
  const cache = await openCache();
  if (cache) await Promise.all(files.map((f) => cache.delete(cacheKey(f)).catch(() => {})));
}

/** Tải một file mạng (có báo tiến độ) – lấy từ Cache Storage nếu đã tải trước đó và còn nguyên vẹn. */
async function fetchNet(file, onBytes) {
  const key = cacheKey(file);
  const cache = await openCache();
  if (cache) {
    const hit = await cache.match(key).catch(() => null);
    if (hit) {
      const buf = new Uint8Array(await hit.arrayBuffer());
      if (await intact(file, buf)) { onBytes(buf.byteLength); return buf; }
      await cache.delete(key).catch(() => {}); // hỏng: tải lại
    }
  }
  for (const url of sources(file)) {
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) continue;
      const reader = res.body.getReader(), parts = [];
      let n = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); n += value.length; onBytes(value.length);
      }
      onBytes(-n); // nguồn này hỏng thì tiến độ lùi về như trước
      const buf = new Uint8Array(n);
      let o = 0;
      for (const p of parts) { buf.set(p, o); o += p.length; }
      parts.length = 0;
      if (!(await intact(file, buf))) continue; // tải đứt / file lạ: thử nguồn kế tiếp
      onBytes(n);
      if (cache) await cache.put(key, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } })).catch(() => {});
      return buf;
    } catch (e) { /* thử nguồn kế tiếp */ }
  }
  throw new Error('net ' + file);
}

/**
 * config.toml cho Rapfi: o.threads luồng (mặc định 1), bảng băm o.hashMb MB (mặc định 16 – đủ nhẹ cho điện thoại; trang
 * chọn theo máy – boat-rapfi.js), chỉ mạng của luật đang chơi. Luật Việt Nam:
 * không mạng NNUE, bảng đánh giá cổ điển học riêng cho caro (caro_binary_file).
 */
function config(rule, o) {
  o = o || {};
  const model = rule === 'vn'
    ? 'binary_file = "model210901.bin"\ncaro_binary_file = "model-caro.bin"'
    : `binary_file = "model210901.bin"

[model.evaluator]
type = "mix9svq"
draw_black_winrate = 0.5
draw_ratio = 1.0

[[model.evaluator.weights]]
${rule === 'renju'
    ? `weight_file_black = "${NETS.renju[0]}"\nweight_file_white = "${NETS.renju[1]}"`
    : `weight_file = "${NETS[rule][0]}"`}`;
  return `[general]
reload_config_each_move = false
clear_hash_after_config_loaded = false
default_thread_num = ${o.threads || 1}
message_mode = "normal"
coord_conversion_mode = "none"
default_candidate_range = "square3_line4"
memory_reserved_mb = 0
default_tt_size_kb = ${(o.hashMb || 16) * 1024}

[model]
${model}

[search]
aspiration_window = true
num_iteration_after_mate = 24
num_iteration_after_singular_root = 24
max_search_depth = 99

[search.timectl]
match_space = 21.0
match_space_min = 7.0
average_branch_factor = 1.7
advanced_stop_ratio = 0.75
move_horizon = 64
`;
}

/** Điểm cuối cùng Rapfi in ra ("Eval 123", "Eval +M7", "Eval -M4", "+M*" = thắng theo cơ sở dữ liệu) → { cp, mate }. */
function parseEval(lines) {
  let ev = null;
  for (const l of lines) {
    const m = /Eval ([+-]?)(M?)(\d+|\*)/.exec(l);
    if (!m) continue;
    const sign = m[1] === '-' ? -1 : 1;
    if (m[2]) ev = { cp: sign * 20000, mate: sign * (m[3] === '*' ? 99 : Number(m[3])) };
    else ev = { cp: sign * Number(m[3]), mate: 0 };
  }
  return ev;
}

const isMove = (l) => /^\d+,\d+$/.test(l.trim());
/** Dòng trả lời của Rapfi (stdout) – bản đa luồng: đủ dòng kết thúc thì báo cho lệnh đang chờ. */
function onLine(line) {
  out.push(line);
  if (waiter && waiter.test(line)) { const w = waiter; waiter = null; clearTimeout(w.timer); w.resolve(out); }
}
/**
 * Gửi lệnh Piskvork → Promise các dòng trả lời. until(dòng): dòng kết thúc câu trả lời (không có: lệnh không trả lời).
 * Bản 1 luồng chạy đồng bộ: khi sendCommand trả về, mọi dòng đã có trong `out`.
 */
function send(cmd, until, ms) {
  out = [];
  if (!MT || !until) { mod.sendCommand(cmd); return Promise.resolve(out); }
  return new Promise((resolve) => {
    waiter = { test: until, resolve, timer: setTimeout(() => { waiter = null; resolve(out); }, ms || 120000) };
    mod.sendCommand(cmd);
  });
}
// Mọi lượt dùng Rapfi đi lần lượt (nghĩ trước / nước thật / chấm thế không chồng lên nhau)
let chain = Promise.resolve();
const exclusive = (fn) => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };
const boardCmd = (head, moves) => {
  const side = moves.length % 2;
  return [head, ...moves.map(([x, y], i) => `${x},${y},${i % 2 === side ? 1 : 2}`), 'DONE'].join('\n');
};

/** Một lượt nghĩ: { move: [x, y] | null, ev, lines }. cmds: lệnh INFO (giờ / số nút – brain.js plan), guard: ms tối đa. */
async function think(moves, cmds, guard) {
  for (const c of cmds) await send(c);
  // Cả khối BOARD … DONE gửi một lần: Rapfi đọc hết các dòng rồi nghĩ, in nước đi dạng "x,y"
  const res = await send(boardCmd('BOARD', moves), isMove, guard * 3 + 15000);
  const mv = res.map((l) => /^(\d+),(\d+)$/.exec(l.trim())).find(Boolean);
  return { move: mv ? [Number(mv[1]), Number(mv[2])] : null, ev: parseEval(res), lines: res };
}

/**
 * Nghĩ trước (ponder) trong lúc người chơi nghĩ – không giới hạn thời gian (dừng khi có tin mới: nước người chơi, stop,
 * hết ván / ứng dụng chạy nền – boat-rapfi.js). Rapfi nghĩ trên thế người chơi tới lượt: cây tìm kiếm gồm mọi nước người
 * chơi có thể đi (cả nước công BOAT phải phòng) và cách BOAT đáp lại; bảng băm giữ sang nước sau nên BOAT tìm sâu hơn.
 * Bản đa luồng: một lượt tìm liên tục (làm sâu dần – người chơi nghĩ càng lâu càng sâu), tin mới thì YXSTOP dừng ngay.
 * Bản 1 luồng chạy đồng bộ: lát ngắn PONDER_SLICE để tin mới vào kịp.
 * Đo (Rapfi-CARO, Node, tự đấu cùng thời gian mỗi nước): nghĩ trước 600 ms thắng không nghĩ trước 76/128 (59%); đã thử
 * "kịch bản" – YXNBEST lấy 3 nước dự đoán (trúng 85%) rồi chia thời gian nghĩ sẵn từng nước: 28/64 (44%) so với cách
 * này; 2/3 như cách này + 1/3 đào sâu nước dự đoán đầu (trúng ~73%): 24/48 (50%) – giữ cách đơn giản.
 */
const PONDER_SLICE = 300;
let ponderGen = 0, pondering = false;
const brain = Brain.create();
async function ponder(d, gen) {
  const end = d.ms > 0 ? Date.now() + d.ms : Infinity;
  const live = () => gen === ponderGen && !!mod && Date.now() < end;
  pondering = true;
  try {
    while (live()) {
      const ms = MT ? Math.min(end - Date.now(), 3600000) : Math.min(PONDER_SLICE, end - Date.now());
      // Ghi chuỗi nước tốt nhất ngay trong lượt (trước khi lượt sau – nước thật của BOAT – được chạy)
      await exclusive(async () => {
        if (!live()) return;
        const t0 = Date.now(), r = await think(d.moves, brain.plan(d.moves, ms).cmds, ms);
        brain.pondered(d.moves, r.lines, Date.now() - t0);
      });
      await new Promise((r) => setTimeout(r, 0)); // nhường lượt cho tin mới
    }
  } catch (err) { /* bỏ qua: chỉ là nghĩ trước */ }
  if (gen === ponderGen) pondering = false;
  self.postMessage({ type: 'pondered', id: d.id });
}

async function init(rule, o) {
  const files = NETS[rule];
  if (!files) throw new Error('rule ' + rule);
  if (!hasSimd()) throw new Error('simd'); // báo ngay, không tải mạng vô ích
  const total = files.reduce((t, f) => t + SPEC[f][0], 0);
  let got = 0, lastPct = -1;
  const onBytes = (n) => {
    got += n;
    const pct = Math.max(0, Math.min(99, Math.floor((got / total) * 100)));
    if (pct !== lastPct) { lastPct = pct; self.postMessage({ type: 'progress', pct }); }
  };
  // File đi kèm app (cùng thư mục): mô hình cổ điển + bảng riêng của luật (nếu có)
  const local = ['model210901.bin', ...LOCAL[rule]];
  const own = (f) => fetch(f).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('model')))).then(async (b) => {
    const u = new Uint8Array(b);
    if (!(await intact(f, u))) throw new Error('model');
    return u;
  });
  let data = await Promise.all([...local.map(own), ...files.map((f) => fetchNet(f, onBytes))]);
  MT = ISO && !(o && o.mt === false);
  const name = (MT ? ENGINE_MT : ENGINE)[rule];
  // Glue đa luồng tạo pthread bằng new Worker(chính file này) – build.sh vá để đọc đường dẫn từ đây (Worker không có
  // document.currentScript)
  self.RAPFI_SCRIPT_URL = new URL(name + '.js', self.location.href).href;
  importScripts(name + '.js');
  const threads = MT ? Math.max(1, Math.min(8, (o && o.threads) || 1)) : 1;
  let fs = null;
  mod = await self.Rapfi({
    // expose-fs.js (lúc dựng) gọi hàm này trước main(): ghi file vào bộ nhớ ảo để Rapfi đọc khi khởi động
    onFS(FS) {
      fs = FS;
      FS.writeFile('/config.toml', config(rule, { threads, hashMb: o && o.hashMb }));
      [...local, ...files].forEach((f, i) => FS.writeFile('/' + f, data[i]));
      data = null; // bộ nhớ ảo đã có bản sao: bỏ bản tải về
    },
    // File .wasm cùng tên với bản dựng (Rapfi-CARO dựng từ cùng dự án nên glue JS vẫn gọi tên rapfi-single/multi-simd128.wasm)
    locateFile: (f, dir) => (dir || '') + wasmName(rule, f, MT),
    onReceiveStdout: onLine,
    onReceiveStderr() {},
    onExit() { mod = null; },
  });
  if (!(await send('START ' + SIZE[rule], (l) => /OK|ERROR/.test(l), 30000)).includes('OK')) throw new Error('start');
  for (const c of [`INFO rule ${RULE_N[rule]}`, 'INFO timeout_match 0', 'INFO thread_num ' + threads, 'INFO max_memory 0']) await send(c);
  // Rapfi chỉ nạp mạng NNUE (và bảng caro) khi nghĩ nước đầu: nghĩ thử một nước ngắn để chắc nạp được (bản đa luồng: lần
  // này cũng dựng các luồng và bảng băm – sau đó YXSTOP mới dừng đúng lượt đang tìm)
  const c = SIZE[rule] >> 1;
  const probe = await think([[c, c]], brain.plan([[c, c]], 60).cmds, 60);
  const bad = probe.lines.some((l) => /Failed to load|Evaluator .* disabled/.test(l));
  if (bad || !probe.move) { await evict(files); throw new Error('weights'); }
  // Mạng đã giải nén vào bộ nhớ của Rapfi: xoá file nén trong bộ nhớ ảo (~10–20 MB)
  for (const f of files) { try { fs.unlink('/' + f); } catch (e) { /* đã xoá */ } }
  return { threads };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { NETS, RULE_N, SIZE, SPEC, ENGINE, ENGINE_MT, LOCAL, config, parseEval, wasmName, boardCmd }; // cho Node
else self.onmessage = async (e) => {
  const d = e.data;
  ponderGen++; // tin mới bất kỳ: dừng nghĩ trước
  // Bản đa luồng: dừng ngay lượt nghĩ trước đang chạy. Gửi trước khi xếp lệnh của tin này – Rapfi xử lý lệnh theo thứ tự nên
  // YXSTOP chỉ chạm lượt nghĩ trước, không bao giờ chạm lượt nghĩ thật xếp sau nó
  if (MT && pondering && mod) { pondering = false; mod.sendCommand('YXSTOP'); }
  if (d.type === 'ponder') { ponder(d, ponderGen); return; } // không chờ: tin sau vẫn vào được
  if (d.type === 'stop') return;
  if (d.type === 'game') { brain.reset(); return; }
  if (d.type === 'threads') {
    // Đổi giữa hai lượt nghĩ (Rapfi bỏ qua lệnh gửi trong lúc đang tìm, trừ YXSTOP – lượt nghĩ trước đã dừng ở trên)
    if (MT && mod) await exclusive(() => send('INFO thread_num ' + Math.max(1, Math.min(8, d.n | 0))));
    self.postMessage({ type: 'threads', n: MT ? d.n : 1 });
    return;
  }
  if (d.type === 'init') {
    try {
      const info = await init(d.rule, d);
      self.postMessage({ type: 'ready', threads: info.threads, mt: MT });
    } catch (err) {
      self.postMessage({ type: 'error', msg: String((err && err.message) || err) });
    }
    return;
  }
  if (d.type === 'move') {
    let r = { move: null, ev: null }, used = 0, hit = false;
    try {
      if (mod) {
        r = await exclusive(async () => {
          // Lập kế hoạch ngay trước lượt nghĩ (lượt nghĩ trước xếp trước đã ghi xong chuỗi nước tốt nhất)
          const plan = brain.plan(d.moves, d.ms, { play: d.play, tm: d.tm, hit: d.hit, hitFrac: d.hitFrac, nodes: d.nodes, fresh: d.fresh });
          const t0 = Date.now(), res = await think(d.moves, plan.cmds, plan.turn);
          used = Date.now() - t0; hit = plan.hit;
          brain.done(plan, used, d.ms);
          return res;
        });
      }
    } catch (err) { /* trả null: trang dùng engine của game */ }
    self.postMessage({ type: 'move', id: d.id, move: r.move, ev: r.ev, used, hit });
  }
};
