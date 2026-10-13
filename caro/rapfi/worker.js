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
 *        { type: 'move', id, size, moves, ms }   – moves: [[x, y], …] toạ độ 0..size-1, X đi trước (BOAT đi, hoặc
 *                                                  phân tích chấm thế – cùng một lệnh)
 *   ra   { type: 'progress', pct } · { type: 'ready' } · { type: 'error', msg }
 *        { type: 'move', id, move: [x, y] | null, ev: { cp, mate } | null }
 *          cp: điểm Rapfi (góc nhìn bên đi; khả năng thắng = 1 / (1 + e^(−cp / 200))),
 *          mate: ±số nửa nước tới thắng (+) / thua (−) chắc, 0 = chưa thấy
 */
'use strict';
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
const wasmName = (rule, f) => f.replace(/^rapfi-single-simd128\./, ENGINE[rule] + '.');

let mod = null, out = [];

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
 * config.toml cho Rapfi: 1 luồng, bảng băm 16 MB (đủ nhẹ cho điện thoại), chỉ mạng của luật đang chơi. Luật Việt Nam:
 * không mạng NNUE, bảng đánh giá cổ điển học riêng cho caro (caro_binary_file).
 */
function config(rule) {
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
default_thread_num = 1
message_mode = "normal"
coord_conversion_mode = "none"
default_candidate_range = "square3_line4"
memory_reserved_mb = 0
default_tt_size_kb = 16384

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

/** Gửi lệnh Piskvork; bản 1 luồng chạy đồng bộ nên khi hàm trả về, mọi dòng trả lời đã nằm trong `out`. */
function send(cmd) { out = []; mod.sendCommand(cmd); return out; }

/** Một lượt nghĩ: { move: [x, y] | null, ev, lines }. */
function think(moves, ms) {
  send('INFO timeout_turn ' + ms);
  const side = moves.length % 2;
  // Cả khối BOARD … DONE gửi một lần: Rapfi đọc hết các dòng rồi nghĩ, in nước đi dạng "x,y"
  const res = send(['BOARD', ...moves.map(([x, y], i) => `${x},${y},${i % 2 === side ? 1 : 2}`), 'DONE'].join('\n'));
  const mv = res.map((l) => /^(\d+),(\d+)$/.exec(l.trim())).find(Boolean);
  return { move: mv ? [Number(mv[1]), Number(mv[2])] : null, ev: parseEval(res), lines: res };
}

async function init(rule) {
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
  importScripts(ENGINE[rule] + '.js');
  let fs = null;
  mod = await self.Rapfi({
    // expose-fs.js (lúc dựng) gọi hàm này trước main(): ghi file vào bộ nhớ ảo để Rapfi đọc khi khởi động
    onFS(FS) {
      fs = FS;
      FS.writeFile('/config.toml', config(rule));
      [...local, ...files].forEach((f, i) => FS.writeFile('/' + f, data[i]));
      data = null; // bộ nhớ ảo đã có bản sao: bỏ bản tải về
    },
    // File .wasm cùng tên với bản dựng (Rapfi-CARO dựng từ cùng dự án nên glue JS vẫn gọi tên rapfi-single-simd128.wasm)
    locateFile: (f, dir) => (dir || '') + wasmName(rule, f),
    onReceiveStdout(line) { out.push(line); },
    onReceiveStderr() {},
    onExit() { mod = null; },
  });
  if (!send('START ' + SIZE[rule]).includes('OK')) throw new Error('start');
  for (const c of [`INFO rule ${RULE_N[rule]}`, 'INFO timeout_match 0', 'INFO thread_num 1', 'INFO max_memory 0']) send(c);
  // Rapfi chỉ nạp mạng NNUE (và bảng caro) khi nghĩ nước đầu: nghĩ thử một nước ngắn để chắc nạp được
  const c = SIZE[rule] >> 1;
  const probe = think([[c, c]], 60);
  const bad = probe.lines.some((l) => /Failed to load|Evaluator .* disabled/.test(l));
  if (bad || !probe.move) { await evict(files); throw new Error('weights'); }
  // Mạng đã giải nén vào bộ nhớ của Rapfi: xoá file nén trong bộ nhớ ảo (~10–20 MB)
  for (const f of files) { try { fs.unlink('/' + f); } catch (e) { /* đã xoá */ } }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { NETS, RULE_N, SIZE, SPEC, ENGINE, LOCAL, config, parseEval, wasmName }; // cho Node
else self.onmessage = async (e) => {
  const d = e.data;
  if (d.type === 'init') {
    try {
      await init(d.rule);
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', msg: String((err && err.message) || err) });
    }
    return;
  }
  if (d.type === 'move') {
    let r = { move: null, ev: null };
    try { if (mod) r = think(d.moves, d.ms); } catch (err) { /* trả null: trang dùng engine của game */ }
    self.postMessage({ type: 'move', id: d.id, move: r.move, ev: r.ev });
  }
};
